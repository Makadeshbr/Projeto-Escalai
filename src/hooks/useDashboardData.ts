import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { aether, aetherFetchAll } from '~/src/lib/aether';
import {
    COLLECTIONS, City, DriverAvailability, Assignment,
    getTodayDateStr, getTomorrowDateStr, extractBrazilDateStr, formatBrazilTimestamp
} from '~/src/lib/collections';
import type { ModalType } from './useActionModal';
import { useRequireAuth } from './useRequireAuth';
import { useRealtimeSubscribe } from './useRealtimeSubscribe';
import {
    useAssignmentsQuery, useDriverAvailabilityQuery, useCitiesQuery, queryKeys
} from './queries/useAetherQueries';
import { logger } from '~/src/lib/logger';

/** Chave de turno usado nas ondas de saida */
export type WaveKey = 'morning';

/** Intervalo de polling como safety net do realtime (ms) */
const POLLING_INTERVAL = 15_000;

/**
 * Hook que centraliza toda a busca de dados do dashboard admin.
 * [PHASE 2] Migrado para React Query — elimina polling manual, dedup de requests,
 * e deriva KPIs/filtros via useMemo em vez de fetches separados.
 *
 * Ganho: de ~5 API calls por ciclo para 2 (assignments + availability) com cache 30s.
 *
 * @param isSameDay - Se busca motoristas para hoje (SD) ou amanha (D+1)
 * @returns Dados carregados, estados de loading, e acoes de fetch (interface identica)
 */
export function useDashboardData(
    isSameDay: boolean,
    showModal: (title: string, message: string, type?: ModalType, onConfirm?: () => void) => void
) {
    const queryClient = useQueryClient();

    // [PHASE 2] Auth guard centralizado (substitui useEffect manual com router.replace)
    useRequireAuth('admin');

    // === React Query: cache + dedup + retry + polling automatico ===
    // Antes: 3x aetherFetchAll(ASSIGNMENTS) por ciclo. Agora: 1 query cacheada.
    const { data: allAssignments = [] } = useAssignmentsQuery({
        refetchInterval: POLLING_INTERVAL,
    });

    // Antes: 2x aetherFetchAll(DRIVER_AVAILABILITY) por ciclo. Agora: 1 query cacheada.
    const { data: allAvailabilities = [], isFetching: driversLoading } = useDriverAvailabilityQuery({
        refetchInterval: POLLING_INTERVAL,
    });

    // Cidades (sem polling — mudam raramente)
    const { data: citiesRaw = [] } = useCitiesQuery();

    // === Cidades ativas (derivado do cache) ===
    const cities = useMemo(
        () => (citiesRaw as City[]).filter(c => c.isActive !== false),
        [citiesRaw]
    );

    // Selecao de cidade (estado local — preferencia do usuario, nao server state)
    const [selectedCity, setSelectedCity] = useState<City | null>(null);

    // Auto-seleciona Avare quando cidades carregam pela primeira vez
    useEffect(() => {
        if (!selectedCity && cities.length > 0) {
            const avare = cities.find(c =>
                c.name.toLowerCase().includes('avaré') || c.name.toLowerCase().includes('avare')
            );
            setSelectedCity(avare || cities[0]);
        }
    }, [cities, selectedCity]);

    // === KPIs derivados (zero re-fetch extra — dedup do React Query) ===
    const pendingCount = useMemo(
        () => allAssignments.filter(a => a.status === 'pending').length,
        [allAssignments]
    );

    const activeDriverCount = useMemo(() => {
        const todayStr = getTodayDateStr();
        return allAvailabilities.filter(
            a => a.targetDate === todayStr && a.isAvailable === true
        ).length;
    }, [allAvailabilities]);

    // === Assignments recentes de hoje (derivado do cache, sem fetch extra) ===
    const recentAssignments = useMemo(() => {
        const todayStr = getTodayDateStr();

        const todayAssignments = allAssignments.filter(a => {
            // [SENIOR FIX - HISTORY PERSISTENCE] Arquivados omitidos daqui,
            // mas continuam existindo pra Relatorio de RH e Perfil Motorista
            if ((a as any).archived === true) return false;
            if (!a.createdAt) return false;

            return extractBrazilDateStr(a.createdAt) === todayStr;
        });

        // Ordena do mais recente primeiro — SEM limite de quantidade
        return [...todayAssignments].sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }, [allAssignments]);

    // === Motoristas disponiveis (derivado do cache — filtra por data alvo) ===
    const availableDrivers = useMemo(() => {
        const targetDateStr = isSameDay ? getTodayDateStr() : getTomorrowDateStr();
        return allAvailabilities.filter(r =>
            r.targetDate === targetDateStr && r.isAvailable === true
        );
    }, [allAvailabilities, isSameDay]);

    // === Invalidation wrappers (mantem interface publica compativel) ===
    // useAssignmentActions e dashboard.tsx chamam estas funcoes apos mutacoes.
    // Em vez de re-fetch manual, invalidam o cache React Query (dedup automatico).
    const fetchRecentAssignments = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.assignments });
    }, [queryClient]);

    const fetchStats = useCallback(async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.assignments }),
            queryClient.invalidateQueries({ queryKey: queryKeys.driverAvailability }),
        ]);
    }, [queryClient]);

    const fetchAvailableDrivers = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.driverAvailability });
    }, [queryClient]);

    // === Realtime subscribe centralizado (debounce + cleanup automático) ===
    // O polling do React Query (refetchInterval) já garante consistência.
    // O subscribe adiciona latência sub-segundo para mudanças em tempo real.
    useRealtimeSubscribe({
        collection: COLLECTIONS.ASSIGNMENTS,
        tag: '[Dashboard]',
        debounceMs: 1500,
        onEvent: useCallback(() => {
            logger.debug('[Realtime Dashboard]', 'Mudança detectada, invalidando cache React Query...');
            queryClient.invalidateQueries({ queryKey: queryKeys.assignments });
        }, [queryClient]),
    });

    // === Mutacoes (logica de negocio preservada, invalidacao via React Query) ===

    /**
     * Arquiva todas as movimentacoes recentes (soft-delete).
     * As rotas ficam salvas no banco mas ocultadas da UI.
     * Use esta opcao quando o dia encerrou e quer preservar o historico do RH.
     * [AUDIT FIX — SCALE-002] Batch chunking de 10 + delay entre batches.
     */
    const clearRecentAssignments = useCallback(async (
        setIsLoading: (v: boolean) => void
    ) => {
        if (recentAssignments.length === 0) {
            showModal('Lista Vazia', 'Nao ha movimentacoes recentes para limpar.', 'info');
            return;
        }

        showModal(
            'Arquivar Movimentacoes',
            'As rotas sairao desta tela, mas permanecerao salvas no Historico do Motorista e Relatorio de RH. Use "Apagar Permanente" se precisar redespachar hoje.',
            'confirm',
            async () => {
                setIsLoading(true);
                try {
                    const BATCH_SIZE = 10;
                    const DELAY_MS = 600;

                    for (let i = 0; i < recentAssignments.length; i += BATCH_SIZE) {
                        const chunk = recentAssignments.slice(i, i + BATCH_SIZE);
                        await Promise.allSettled(chunk.map(assignment =>
                            aether.db.collection(COLLECTIONS.ASSIGNMENTS).update(assignment.id!, { archived: true })
                        ));

                        if (i + BATCH_SIZE < recentAssignments.length) {
                            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
                        }
                    }

                    // Invalida cache → refetch → useMemo filtra archived automaticamente
                    await queryClient.invalidateQueries({ queryKey: queryKeys.assignments });
                    showModal('Limpeza Concluida', 'As movimentacoes foram arquivadas.', 'success');
                } catch (e: unknown) {
                    const message = e instanceof Error ? e.message : 'Erro critico ao limpar rotas.';
                    showModal('Falha na Exclusao', message, 'error');
                } finally {
                    setIsLoading(false);
                }
            }
        );
    }, [recentAssignments, showModal, queryClient]);

    /**
     * Apaga PERMANENTEMENTE TODAS as rotas de hoje do banco (incluindo arquivadas)
     * E tambem rotas antigas que ficaram pendentes de dias anteriores.
     * Use quando o admin despachou por engano e quer redespachar hoje.
     * ATENCAO: Esta acao e IRREVERSIVEL.
     */
    const hardDeleteRecentAssignments = useCallback(async (
        setIsLoading: (v: boolean) => void
    ) => {
        showModal(
            '⚠️ APAGAR PERMANENTEMENTE',
            'Isso vai apagar TODAS as rotas de hoje e rotas pendentes de dias anteriores, de forma IRREVERSIVEL, para que voce possa redespachar. Confirma?',
            'confirm',
            async () => {
                setIsLoading(true);
                try {
                    const todayStr = getTodayDateStr();
                    const allDocs = await aetherFetchAll(COLLECTIONS.ASSIGNMENTS);
                    // [FIX] Apaga rotas de hoje + rotas antigas que ficaram pendentes
                    // (eram visiveis no monitor e nao sumiam ao clicar Apagar)
                    const toDelete = (allDocs as any[]).filter(doc => {
                        const payload = doc._payload || doc;
                        const created = payload.createdAt || '';
                        const isToday = extractBrazilDateStr(created) === todayStr;
                        const isStaleActive = (
                            payload.status === 'pending' || payload.status === 'confirmed'
                            || payload.dockStatus === 'waiting' || payload.dockStatus === 'liberated'
                        ) && !isToday;
                        return isToday || isStaleActive;
                    });

                    if (toDelete.length === 0) {
                        showModal('Nada Encontrado', 'Nenhuma rota de hoje ou pendente foi encontrada no banco de dados.', 'info');
                        return;
                    }

                    const BATCH_SIZE = 10;
                    const DELAY_MS = 600;

                    for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
                        const chunk = toDelete.slice(i, i + BATCH_SIZE);
                        await Promise.allSettled(
                            chunk.map((doc: any) => {
                                const id = doc._payload?.id || doc.id;
                                return id ? aether.db.collection(COLLECTIONS.ASSIGNMENTS).delete(id) : Promise.resolve();
                            })
                        );

                        if (i + BATCH_SIZE < toDelete.length) {
                            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
                        }
                    }

                    // Invalida cache completo → refetch
                    await queryClient.invalidateQueries({ queryKey: queryKeys.assignments });
                    showModal('Apagado!', `${toDelete.length} rota(s) removidas permanentemente. Redespacha agora!`, 'success');
                } catch (e: unknown) {
                    const message = e instanceof Error ? e.message : 'Erro critico ao apagar rotas.';
                    showModal('Falha na Exclusao', message, 'error');
                } finally {
                    setIsLoading(false);
                }
            }
        );
    }, [showModal, queryClient]);

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
                createdAt: formatBrazilTimestamp(),
            });
            // Invalida cache de cidades → refetch automatico via React Query
            await queryClient.invalidateQueries({ queryKey: queryKeys.cities });
            showModal('Cidade Adicionada', `A praca ${name} foi incluida com sucesso.`, 'success');
            onSuccess();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Erro ao adicionar cidade.';
            showModal('Permissao Negada', msg, 'error');
        } finally {
            setAddingCity(false);
        }
    }, [showModal, queryClient]);

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
        hardDeleteRecentAssignments,

        // Acoes
        handleAddCity,
        fetchStats,
    };
}
