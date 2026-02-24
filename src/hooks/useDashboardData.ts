import { useState, useEffect, useCallback } from 'react';
import { aether, aetherFetchAll } from '~/src/lib/aether';
import {
    COLLECTIONS, City, DriverAvailability, Assignment,
    getTodayDateStr, getTomorrowDateStr
} from '~/src/lib/collections';
import { useAuthStore } from '~/src/store/auth';
import type { ModalType } from './useActionModal';
import { router } from 'expo-router';

/** Chave de turno usado nas ondas de saída */
export type WaveKey = 'morning' | 'afternoon' | 'night';

/**
 * Hook que centraliza toda a busca de dados do dashboard admin.
 * Extrai lógica de fetch de cidades, stats, motoristas e assignments
 * do God Class original (1021 LOC → hook isolado e testável).
 *
 * @param selectedWave - Turno selecionado para filtrar motoristas
 * @param isSameDay - Se busca motoristas para hoje (SD) ou amanhã (D+1)
 * @returns Dados carregados, estados de loading, e ações de fetch
 */
export function useDashboardData(
    selectedWave: WaveKey,
    isSameDay: boolean,
    showModal: (title: string, message: string, type?: ModalType, onConfirm?: () => void) => void
) {
    const { role } = useAuthStore();

    // Cidades
    const [cities, setCities] = useState<City[]>([]);
    const [selectedCity, setSelectedCity] = useState<City | null>(null);

    // Motoristas disponíveis para o turno/data selecionados
    const [availableDrivers, setAvailableDrivers] = useState<DriverAvailability[]>([]);
    const [driversLoading, setDriversLoading] = useState(false);

    // KPIs rápidos
    const [pendingCount, setPendingCount] = useState(0);
    const [activeDriverCount, setActiveDriverCount] = useState(0);

    // Despachos recentes (últimos 20)
    const [recentAssignments, setRecentAssignments] = useState<Assignment[]>([]);

    /**
     * [AUDIT FIX — SEC-005] Guard de autorização.
     * Redireciona para login se o usuário não possuir role admin.
     */
    useEffect(() => {
        if (role !== 'admin') router.replace('/login');
    }, [role]);

    /**
     * Busca todas as cidades ativas do banco de dados.
     * Seleciona automaticamente Avaré como padrão se disponível.
     */
    const fetchCities = useCallback(async () => {
        try {
            const data = await aether.db.collection(COLLECTIONS.CITIES).list();
            if (data) {
                const citiesList = (data as unknown as City[]).filter(c => c.isActive !== false);
                setCities(citiesList);
                if (!selectedCity && citiesList.length > 0) {
                    const avare = citiesList.find(c =>
                        c.name.toLowerCase().includes('avaré') || c.name.toLowerCase().includes('avare')
                    );
                    setSelectedCity(avare || citiesList[0]);
                }
            }
        } catch (e) {
            console.error('[Dashboard] Erro ao buscar cidades:', e);
        }
    }, [selectedCity]);

    /**
     * Busca KPIs rápidos: rotas pendentes e motoristas disponíveis hoje.
     */
    const fetchStats = useCallback(async () => {
        try {
            const todayStr = getTodayDateStr();

            const allAssignments = await aetherFetchAll(COLLECTIONS.ASSIGNMENTS);
            const pendingAssignments = allAssignments.filter(
                (a: Record<string, unknown>) => a.status === 'pending'
            );
            setPendingCount(pendingAssignments.length);

            const allAvailabilities = await aetherFetchAll(COLLECTIONS.DRIVER_AVAILABILITY);
            const todayAvailabilities = allAvailabilities.filter(
                (a: Record<string, unknown>) => a.targetDate === todayStr && a.isAvailable === true
            );
            setActiveDriverCount(todayAvailabilities.length);
        } catch (e) {
            console.error('[Dashboard] Erro ao buscar stats:', e);
        }
    }, []);

    /**
     * Busca motoristas disponíveis para o turno e data selecionados.
     * Filtragem é client-side (NOTA: SCALE-001 prevê migrar para server-side).
     */
    const fetchAvailableDrivers = useCallback(async () => {
        setDriversLoading(true);
        try {
            const targetDateStr = isSameDay ? getTodayDateStr() : getTomorrowDateStr();
            const allRecords = await aetherFetchAll(COLLECTIONS.DRIVER_AVAILABILITY);

            const filtered = allRecords.filter((r: Record<string, unknown>) => {
                const shifts = r.shifts as Record<string, boolean> | undefined;
                if (!shifts) return false;
                if (r.targetDate !== targetDateStr) return false;
                if (r.isAvailable !== true) return false;
                return shifts[selectedWave] === true;
            });

            setAvailableDrivers(filtered as unknown as DriverAvailability[]);
        } catch (e) {
            console.error('[Dashboard] Erro ao buscar motoristas:', e);
            setAvailableDrivers([]);
        } finally {
            setDriversLoading(false);
        }
    }, [selectedWave, isSameDay]);

    /**
     * Busca os 20 despachos mais recentes, ordenados por data de criação.
     */
    const fetchRecentAssignments = useCallback(async () => {
        try {
            const allAssignments = await aetherFetchAll(COLLECTIONS.ASSIGNMENTS);
            const sorted = [...allAssignments]
                .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
                    new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime()
                )
                .slice(0, 20);

            setRecentAssignments(sorted as unknown as Assignment[]);
        } catch (e) {
            console.error('[Dashboard] Erro ao buscar assignments:', e);
        }
    }, []);

    /**
     * Remove todas as movimentações recentes do banco de dados.
     * [AUDIT FIX — SCALE-002] Usa batch chunking de 10 para evitar
     * sobrecarga do backend com centenas de requests simultâneas.
     */
    const clearRecentAssignments = useCallback(async (
        setIsLoading: (v: boolean) => void
    ) => {
        if (recentAssignments.length === 0) {
            showModal('Lista Vazia', 'Não há movimentações recentes para limpar.', 'info');
            return;
        }

        showModal(
            'ATENÇÃO: Limpar Banco de Dados',
            'Deseja excluir DE FORMA IRREVERSÍVEL todas as movimentações recentes?',
            'confirm',
            async () => {
                setIsLoading(true);
                try {
                    const BATCH_SIZE = 10;
                    for (let i = 0; i < recentAssignments.length; i += BATCH_SIZE) {
                        const chunk = recentAssignments.slice(i, i + BATCH_SIZE);
                        await Promise.all(chunk.map(assignment =>
                            aether.db.collection(COLLECTIONS.ASSIGNMENTS).delete(assignment.id!)
                        ));
                    }
                    setRecentAssignments([]);
                    showModal('Limpeza Concluída', 'As movimentações foram apagadas.', 'success');
                } catch (e: unknown) {
                    const message = e instanceof Error ? e.message : 'Erro crítico ao limpar rotas.';
                    showModal('Falha na Exclusão', message, 'error');
                } finally {
                    setIsLoading(false);
                }
            }
        );
    }, [recentAssignments, showModal]);

    /**
     * Adiciona uma nova cidade ao banco de dados.
     */
    const handleAddCity = useCallback(async (
        name: string,
        code: string,
        setAddingCity: (v: boolean) => void,
        onSuccess: () => void
    ) => {
        if (!name.trim()) {
            showModal('Campo Vazio', 'Informe um nome para a cidade.', 'error');
            return;
        }
        setAddingCity(true);
        try {
            await aether.db.collection(COLLECTIONS.CITIES).create({
                name: name.trim(),
                code: code.trim() || name.trim().substring(0, 3).toUpperCase(),
                isActive: true,
                createdAt: new Date().toISOString(),
            });
            await fetchCities();
            showModal('Cidade Adicionada', `A praça ${name} foi incluída com sucesso.`, 'success');
            onSuccess();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Erro ao adicionar cidade.';
            showModal('Permissão Negada', msg, 'error');
        } finally {
            setAddingCity(false);
        }
    }, [fetchCities, showModal]);

    /**
     * Setup do ciclo de vida: subscribe realtime + polling fallback de 15s.
     * Mantém despachos recentes, KPIs e motoristas atualizados em tempo real.
     * Quando motorista confirma rota ou libera doca, o admin vê instantaneamente.
     */
    useEffect(() => {
        let unsubscribe: (() => void) | undefined;

        // Fetch inicial de tudo
        fetchCities();
        fetchStats();
        fetchRecentAssignments();

        // Subscribe realtime: detecta qualquer mudança em assignments
        try {
            unsubscribe = aether.db.collection(COLLECTIONS.ASSIGNMENTS)
                .subscribe(() => {
                    // Qualquer mudança na coleção → refetch stats e assignments
                    console.log('[Realtime Dashboard] Mudança detectada, atualizando...');
                    fetchStats();
                    fetchRecentAssignments();
                });
        } catch (subErr) {
            console.warn('[Realtime Dashboard] Subscribe indisponível, usando apenas polling:', subErr);
        }

        // Polling de 15s como fallback e garantia de consistência
        const interval = setInterval(() => {
            fetchStats();
            fetchRecentAssignments();
        }, 15000);

        return () => {
            if (unsubscribe) unsubscribe();
            clearInterval(interval);
        };
    }, [fetchCities, fetchStats, fetchRecentAssignments]);

    // Refetch motoristas quando turno ou data mudam
    useEffect(() => {
        fetchAvailableDrivers();
    }, [fetchAvailableDrivers]);

    return {
        // Cidades
        cities,
        selectedCity,
        setSelectedCity,

        // Motoristas
        availableDrivers,
        driversLoading,
        fetchAvailableDrivers,

        // KPIs
        pendingCount,
        activeDriverCount,

        // Assignments
        recentAssignments,
        fetchRecentAssignments,
        clearRecentAssignments,

        // Ações
        handleAddCity,
        fetchStats,
    };
}
