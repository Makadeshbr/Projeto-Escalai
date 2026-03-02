import { useState, useEffect, useCallback } from 'react';
import { aether, aetherFetchAll } from '~/src/lib/aether';
import {
    COLLECTIONS, City, DriverAvailability, Assignment,
    getTodayDateStr, getTomorrowDateStr
} from '~/src/lib/collections';
import { useAuthStore } from '~/src/store/auth';
import type { ModalType } from './useActionModal';
import { router } from 'expo-router';
import { validateArray, AssignmentSchema, DriverAvailabilitySchema } from '~/src/lib/schemas';

/** Chave de turno usado nas ondas de saída */
export type WaveKey = 'morning';

/**
 * Hook que centraliza toda a busca de dados do dashboard admin.
 * [FIX] Parâmetro selectedWave removido — operação não segmenta por turno.
 *
 * @param isSameDay - Se busca motoristas para hoje (SD) ou amanhã (D+1)
 * @returns Dados carregados, estados de loading, e ações de fetch
 */
export function useDashboardData(
    isSameDay: boolean,
    showModal: (title: string, message: string, type?: ModalType, onConfirm?: () => void) => void
) {
    const { role } = useAuthStore();

    // Cidades
    const [cities, setCities] = useState<City[]>([]);
    const [selectedCity, setSelectedCity] = useState<City | null>(null);

    // Motoristas disponíveis para a data selecionada (TODOS os turnos)
    const [availableDrivers, setAvailableDrivers] = useState<DriverAvailability[]>([]);
    const [driversLoading, setDriversLoading] = useState(false);

    // KPIs rápidos
    const [pendingCount, setPendingCount] = useState(0);
    const [activeDriverCount, setActiveDriverCount] = useState(0);

    // Despachos recentes (todos de hoje)
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
            __DEV__ && console.error('[Dashboard] Erro ao buscar cidades:', e);
        }
    }, [selectedCity]);

    /**
     * Busca KPIs rápidos: rotas pendentes e motoristas disponíveis hoje.
     */
    const fetchStats = useCallback(async () => {
        try {
            const todayStr = getTodayDateStr();

            const allAssignmentsRaw = await aetherFetchAll(COLLECTIONS.ASSIGNMENTS);
            const allAssignments = validateArray(allAssignmentsRaw, AssignmentSchema, 'assignments');
            const pendingAssignments = allAssignments.filter(a => a.status === 'pending');
            setPendingCount(pendingAssignments.length);

            const allAvailabilitiesRaw = await aetherFetchAll(COLLECTIONS.DRIVER_AVAILABILITY);
            const allAvailabilities = validateArray(allAvailabilitiesRaw, DriverAvailabilitySchema, 'driver_availability');
            const todayAvailabilities = allAvailabilities.filter(
                a => a.targetDate === todayStr && a.isAvailable === true
            );
            setActiveDriverCount(todayAvailabilities.length);
        } catch (e) {
            __DEV__ && console.error('[Dashboard] Erro ao buscar stats:', e);
        }
    }, []);

    /**
     * Busca motoristas disponíveis para a data selecionada.
     * [FIX] Não filtra mais por turno — mostra TODOS os motoristas
     * que se declararam disponíveis para o dia, independente do shift.
     */
    const fetchAvailableDrivers = useCallback(async () => {
        setDriversLoading(true);
        try {
            const targetDateStr = isSameDay ? getTodayDateStr() : getTomorrowDateStr();
            const allRecordsRaw = await aetherFetchAll(COLLECTIONS.DRIVER_AVAILABILITY);
            const allRecords = validateArray(allRecordsRaw, DriverAvailabilitySchema, 'driver_availability');

            const filtered = allRecords.filter(r => {
                if (r.targetDate !== targetDateStr) return false;
                if (r.isAvailable !== true) return false;
                // [FIX] Sem filtro de turno — mostra todos os disponíveis
                return true;
            });

            setAvailableDrivers(filtered);
        } catch (e) {
            __DEV__ && console.error('[Dashboard] Erro ao buscar motoristas:', e);
            setAvailableDrivers([]);
        } finally {
            setDriversLoading(false);
        }
    }, [isSameDay]);

    /**
     * Busca TODOS os despachos de hoje, ordenados por data de criação (mais recente primeiro).
     * [FIX] Remove limite artificial de .slice(0,20) que omitia motoristas despachados.
     */
    const fetchRecentAssignments = useCallback(async () => {
        try {
            const todayStr = getTodayDateStr();
            const allAssignmentsRaw = await aetherFetchAll(COLLECTIONS.ASSIGNMENTS);
            const allAssignments = validateArray(allAssignmentsRaw, AssignmentSchema, 'assignments');

            // Filtra apenas assignments criados HOJE (timezone local) e NÃO arquivados
            const todayAssignments = allAssignments.filter(a => {
                // [SENIOR FIX - HISTORY PERSISTENCE] Se foi arquivado via limpar lixeira, omite daqui
                // mas continua existindo pra Relatório de RH e Perfil Motorista
                if ((a as any).archived === true) return false;

                if (!a.createdAt) return false;
                const createdDate = new Date(a.createdAt);
                const year = createdDate.getFullYear();
                const month = String(createdDate.getMonth() + 1).padStart(2, '0');
                const day = String(createdDate.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}` === todayStr;
            });

            // Ordena do mais recente primeiro — SEM limite de quantidade
            const sorted = todayAssignments.sort((a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );

            setRecentAssignments(sorted);
        } catch (e) {
            __DEV__ && console.error('[Dashboard] Erro ao buscar assignments:', e);
        }
    }, []);

    /**
     * Remove todas as movimentações recentes do banco de dados.
     * [AUDIT FIX — SCALE-002] Usa batch chunking de 10 para evitar
     * sobrecarga do backend com centenas de requests simultâneas.
     * [SENIOR FIX] Adicionado delay entre batches para evitar Rate Limit (429).
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
            'Deseja arquivar todas as movimentações recentes? Elas sairão desta tela, mas permanecerão salvas no Relatório de RH e no Histórico do Motorista.',
            'confirm',
            async () => {
                setIsLoading(true);
                try {
                    const BATCH_SIZE = 10;
                    const DELAY_MS = 600; // Tempo de respiro para o rate limit (429)

                    for (let i = 0; i < recentAssignments.length; i += BATCH_SIZE) {
                        const chunk = recentAssignments.slice(i, i + BATCH_SIZE);
                        await Promise.allSettled(chunk.map(assignment =>
                            aether.db.collection(COLLECTIONS.ASSIGNMENTS).update(assignment.id!, { archived: true })
                        ));

                        // Espera antes do próximo lote se houver mais itens
                        if (i + BATCH_SIZE < recentAssignments.length) {
                            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
                        }
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
        let debounceTimer: ReturnType<typeof setTimeout>;

        // Fetch inicial de tudo
        fetchCities();
        fetchStats();
        fetchRecentAssignments();

        // Subscribe realtime: detecta qualquer mudança em assignments
        try {
            unsubscribe = aether.db.collection(COLLECTIONS.ASSIGNMENTS)
                .subscribe(() => {
                    // [SENIOR FIX] Debounce no Realtime para evitar N+1 fetches em massa
                    // O subscribe não deve bater nos endpoints para cada registro apagado
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => {
                        __DEV__ && console.log('[Realtime Dashboard] Mudança processada, atualizando em batch...');
                        fetchStats();
                        fetchRecentAssignments();
                    }, 1500);
                });
        } catch (subErr) {
            __DEV__ && console.warn('[Realtime Dashboard] Subscribe indisponível, usando apenas polling:', subErr);
        }

        // Polling de 15s como fallback e garantia de consistência
        const interval = setInterval(() => {
            fetchStats();
            fetchRecentAssignments();
        }, 15000);

        return () => {
            if (unsubscribe) unsubscribe();
            clearTimeout(debounceTimer);
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
