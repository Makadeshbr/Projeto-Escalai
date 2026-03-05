import { useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { aether } from '~/src/lib/aether';
import { COLLECTIONS, Assignment, getTodayDateStr, extractBrazilDateStr } from '~/src/lib/collections';
import { useAuthStore } from '~/src/store/auth';
import { notifyDriver, diagnosePushError } from '~/src/lib/push';
import { useActionModal } from './useActionModal';
import { useRequireAuth } from './useRequireAuth';
import { useRealtimeSubscribe } from './useRealtimeSubscribe';
import { useForegroundRefresh } from './useForegroundRefresh';
import { useAssignmentsQuery, queryKeys } from './queries/useAetherQueries';
import { logger } from '~/src/lib/logger';

export interface RouteGroup {
    cityId: string;
    cityName: string;
    waveLabel: string;
    waveNumber?: string;
    assignments: Assignment[];
}

export interface MonitorKPIs {
    totalDispatched: number;
    totalWaiting: number;
    totalLoading: number;
    totalDeparted: number;
}

/** Prioridade de ordenacao: quem precisa da baia VEM PRIMEIRO */
const DOCK_PRIORITY: Record<string, number> = { waiting: 0, liberated: 1, departed: 2 };

/** Intervalo de polling como safety net do realtime (ms) */
const POLLING_INTERVAL = 10_000;

/**
 * Ordena assignments por prioridade tatica da doca.
 * [1] Estado operacional (waiting > liberated > departed)
 * [2] Numero da doca (ordem alfanumerica realista — 9 antes de 42)
 * [3] Fallback FIFO (ordem de chegada)
 */
function sortByDockPriority(list: Assignment[]): Assignment[] {
    return [...list].sort((a, b) => {
        const aPriority = DOCK_PRIORITY[a.dockStatus || 'waiting'] ?? 0;
        const bPriority = DOCK_PRIORITY[b.dockStatus || 'waiting'] ?? 0;
        if (aPriority !== bPriority) return aPriority - bPriority;

        const docA = a.dock || '';
        const docB = b.dock || '';
        if (docA && docB && docA !== docB) {
            return docA.localeCompare(docB, undefined, { numeric: true, sensitivity: 'base' });
        }

        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
}

/** Calcula KPIs a partir da lista de assignments filtrada */
function computeKPIs(list: Assignment[]): MonitorKPIs {
    return {
        totalDispatched: list.length,
        totalWaiting: list.filter(a => a.dockStatus === 'waiting' || !a.dockStatus).length,
        totalLoading: list.filter(a => a.dockStatus === 'liberated').length,
        totalDeparted: list.filter(a => a.dockStatus === 'departed' || a.status === 'in_progress').length,
    };
}

/**
 * Hook de dados do Monitor de Docas do admin.
 * [PHASE 2] Migrado para React Query — cache + dedup + retry automatico.
 *
 * Ganho: elimina polling manual (setInterval), dedup com Dashboard (mesma query),
 * e deriva KPIs/sort/groups via useMemo (zero logica duplicada).
 *
 * Realtime subscribe mantido com queryClient.setQueryData para latencia sub-segundo
 * em mudancas de dockStatus (motorista confirmou embarque, admin liberou doca, etc.).
 */
export function useMonitorData() {
    const { user, role } = useAuthStore();
    const { actionModal, showModal, dismissModal } = useActionModal();
    const queryClient = useQueryClient();

    // [PHASE 2] Auth guard centralizado
    useRequireAuth('admin');

    // Estado local para loading de mutacoes (releaseDock)
    const [mutationLoading, setMutationLoading] = useState(false);

    // React Query: cache + dedup + retry + polling automatico
    // Compartilha o cache com useDashboardData — zero fetch extra
    const { data: allAssignments = [], isLoading: queryLoading, isFetching } = useAssignmentsQuery({
        refetchInterval: POLLING_INTERVAL,
        enabled: !!user && role === 'admin',
    });

    const isLoading = queryLoading || mutationLoading || isFetching;

    // === Assignments filtrados + ordenados (derivado do cache) ===
    const assignments = useMemo(() => {
        const todayStr = getTodayDateStr();

        const todayActive = allAssignments.filter(a => {
            // [SENIOR FIX - HISTORY PERSISTENCE] Ocultar itens arquivados
            if ((a as any).archived === true) return false;
            if (!a.createdAt) return false;

            // Extrai a data BRT (ignorando Timezone UTC do SO)
            const localCreatedStr = extractBrazilDateStr(a.createdAt);

            // Valido se criado hoje OU se ainda esta ativo (nao-completado)
            const isToday = localCreatedStr === todayStr;
            const isStillActive = (
                a.status === 'pending' || a.status === 'confirmed' || a.status === 'in_progress'
                || a.dockStatus === 'waiting' || a.dockStatus === 'liberated'
            );

            return isToday || isStillActive;
        });

        return sortByDockPriority(todayActive);
    }, [allAssignments]);

    // === KPIs derivados (recomputa automaticamente quando assignments mudam) ===
    const kpis = useMemo(() => computeKPIs(assignments), [assignments]);

    // === Grupos por cidade + onda (derivado) ===
    const groups = useMemo(() => {
        const grouped = assignments.reduce((acc, curr) => {
            const key = `${curr.cityId}-${curr.waveLabel}`;
            if (!acc[key]) {
                acc[key] = {
                    cityId: curr.cityId,
                    cityName: curr.cityName,
                    waveLabel: curr.waveLabel,
                    assignments: [],
                };
            }
            acc[key].assignments.push(curr);
            return acc;
        }, {} as Record<string, RouteGroup>);

        return Object.values(grouped);
    }, [assignments]);

    // === Realtime subscribe centralizado (debounce + cleanup automático) ===
    // Usa useRealtimeSubscribe com debounce baixo (500ms) para latência sub-segundo.
    // O callback atualiza o cache do React Query in-place via setQueryData.
    useRealtimeSubscribe({
        collection: COLLECTIONS.ASSIGNMENTS,
        tag: '[Monitor]',
        debounceMs: 500,
        onEvent: useCallback((updatedData: any) => {
            if (!updatedData) return;

            const payload = updatedData._payload || updatedData;
            const updateId = payload.id || updatedData.id;

            if (!updateId) return;

            logger.debug('[Realtime Monitor]', 'Recebido update:', updateId, payload.dockStatus || payload.status);

            // Atualiza o cache do React Query in-place (dispara re-render via useMemo)
            queryClient.setQueryData(
                queryKeys.assignments,
                (old: Assignment[] | undefined) => {
                    if (!old) return old;

                    // Archived: remove do cache imediatamente
                    if (payload.archived === true) {
                        const exists = old.some(a => a.id === updateId);
                        if (exists) {
                            logger.debug('[Realtime Monitor]', 'Rota arquivada, removendo do cache:', updateId);
                            return old.filter(a => a.id !== updateId);
                        }
                        return old;
                    }

                    // Existente: merge payload (useMemo re-ordena automaticamente)
                    const exists = old.some(a => a.id === updateId);
                    if (exists) {
                        logger.debug('[Realtime Monitor]', 'Atualizando assignment no cache:', updateId);
                        return old.map(a =>
                            a.id === updateId ? { ...a, ...payload, id: a.id } as Assignment : a
                        );
                    }

                    // Novo item: invalidar para refetch completo
                    queryClient.invalidateQueries({ queryKey: queryKeys.assignments });
                    return old;
                }
            );
        }, [queryClient]),
    });

    /**
     * Forca refresh dos dados via invalidacao do cache React Query.
     * Usado pelo botao de refresh e useForegroundRefresh.
     */
    const refreshMonitor = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.assignments });
    }, [queryClient]);

    // === Foreground refresh — atualiza dados ao voltar do background ===
    useForegroundRefresh(refreshMonitor);

    // === Mutacoes ===

    /**
     * Libera uma doca para o motorista.
     * Atualiza dockStatus para 'liberated' no BaaS e envia push notification.
     * Usa queryClient.setQueryData para update confirmado no cache (useMemo re-ordena).
     */
    const releaseDock = useCallback(async (assignment: Assignment) => {
        showModal(
            'Liberar Doca',
            `Chamar motorista ${assignment.driverName} (Placa: ${assignment.driverPlate || '--'}) para a doca ${assignment.dock}?`,
            'confirm',
            async () => {
                setMutationLoading(true);
                try {
                    await aether.db.collection(COLLECTIONS.ASSIGNMENTS).update(assignment.id, {
                        dockStatus: 'liberated'
                    });

                    // Update confirmado no cache (useMemo re-ordena automaticamente)
                    queryClient.setQueryData(
                        queryKeys.assignments,
                        (old: Assignment[] | undefined) => {
                            if (!old) return old;
                            return old.map(a =>
                                a.id === assignment.id ? { ...a, dockStatus: 'liberated' as const } : a
                            );
                        }
                    );

                    // Push Notification com tolerancia a falha
                    try {
                        const messageTitle = 'DOCA LIBERADA! 🟢';
                        const messageBody = `Atenção ${assignment.driverName}, a doca ${assignment.dock} está liberada para você entrar agora.`;
                        await notifyDriver(assignment.driverId, messageTitle, messageBody);
                        showModal('Sucesso', 'Doca liberada. O motorista foi notificado.', 'success');
                    } catch (pushErr) {
                        const reason = diagnosePushError(pushErr);
                        logger.warn('[Fault Tolerance]', 'Push Falhou:', reason);
                        showModal('Doca Liberada (Sem Push)', `A doca foi liberada no sistema com sucesso.\n\nMotivo do push não enviado: ${reason}`, 'warning');
                    }
                } catch (error) {
                    const msg = error instanceof Error ? error.message : 'Erro genérico ao liberar doca';
                    showModal('Erro', `Falha ao liberar doca: ${msg}`, 'error');
                } finally {
                    setMutationLoading(false);
                }
            }
        );
    }, [showModal, queryClient]);

    return {
        assignments,
        kpis,
        groups,
        isLoading,
        releaseDock,
        refreshMonitor,
        actionModal,
        dismissModal,
    };
}
