import { useState, useEffect, useCallback, useRef } from 'react';
import { aether } from '~/src/lib/aether';
import { COLLECTIONS, Assignment, getTodayDateStr } from '~/src/lib/collections';
import { useAuthStore } from '~/src/store/auth';
import { notifyDriver, diagnosePushError } from '~/src/lib/push';
import { useActionModal } from './useActionModal';

export interface RouteGroup {
    cityId: string;
    cityName: string;
    waveLabel: string;
    waveNumber?: string;
    assignments: Assignment[];
}

/**
 * Hook de dados do Monitor de Docas do admin.
 * Implementa realtime via Aether subscribe + fallback polling de 10s.
 * Quando um motorista muda dockStatus para 'departed', o admin vê instantaneamente.
 */
export function useMonitorData() {
    const { user, role } = useAuthStore();
    const { actionModal, showModal, dismissModal } = useActionModal();
    const [isLoading, setIsLoading] = useState(true);
    const [assignments, setAssignments] = useState<Assignment[]>([]);

    // Ref para manter a lista de assignments atualizada dentro do subscribe callback
    const assignmentsRef = useRef<Assignment[]>([]);
    assignmentsRef.current = assignments;

    /**
     * Busca todos os assignments ativos de hoje do banco.
     * Usado no mount inicial e como fallback do realtime.
     */
    const fetchMonitorAssignments = useCallback(async () => {
        if (!user || role !== 'admin') return;
        setIsLoading(true);
        try {
            // [SENIOR DEV FIX] Usar aetherFetchAll importado em vez de .list() do SDK
            // Importar aetherFetchAll no topo do arquivo se não houver
            const { aetherFetchAll } = require('~/src/lib/aether');
            const allAssignments = await aetherFetchAll(COLLECTIONS.ASSIGNMENTS) as Assignment[];

            // [TIMEZONE FIX] Em vez de a.createdAt.startsWith(hoje_local),
            // verificamos se a data_local(createdAt) === hoje_local
            // ou se o assignment está ativo (pending/confirmed/in_progress).
            // Doca ativa não deve sumir da tela apenas porque a hora virou.
            const todayStr = getTodayDateStr();

            const todayActive = allAssignments.filter(a => {
                if (a.status === 'completed' || !a.dock) return false;

                if (!a.createdAt) return false;

                // Converte timestamp UTC do banco para data local
                const createdDate = new Date(a.createdAt);
                const year = createdDate.getFullYear();
                const month = String(createdDate.getMonth() + 1).padStart(2, '0');
                const day = String(createdDate.getDate()).padStart(2, '0');
                const localCreatedStr = `${year}-${month}-${day}`;

                // Considera válido se foi criado hoje OU se AINDA está pendente/esperando
                const isToday = localCreatedStr === todayStr;
                const isStillActive = (a.status === 'pending' || a.dockStatus === 'waiting' || a.dockStatus === 'liberated');

                return isToday || isStillActive;
            });

            // Ordena por prioridade: waiting > liberated > departed
            const dockPriority: Record<string, number> = { waiting: 0, liberated: 1, departed: 2 };
            todayActive.sort((a, b) => {
                const aPriority = dockPriority[a.dockStatus] ?? 1;
                const bPriority = dockPriority[b.dockStatus] ?? 1;
                if (aPriority !== bPriority) return aPriority - bPriority;
                return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            });

            setAssignments(todayActive);
        } catch (error) {
            console.error('[useMonitorData] Erro ao buscar dados:', error);
            showModal('Erro', 'Não foi possível carregar as rotas ativas.', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [user, role, showModal]);

    // Agrupa assignments por cidade + onda
    const groupedAssignments = assignments.reduce((acc, curr) => {
        const key = `${curr.cityId}-${curr.waveLabel}`;
        if (!acc[key]) {
            acc[key] = {
                cityId: curr.cityId,
                cityName: curr.cityName,
                waveLabel: curr.waveLabel,
                assignments: []
            };
        }
        acc[key].assignments.push(curr);
        return acc;
    }, {} as Record<string, RouteGroup>);

    const groups = Object.values(groupedAssignments);

    /**
     * Libera uma doca para o motorista.
     * Atualiza dockStatus para 'liberated' no BaaS e envia push notification.
     */
    const releaseDock = useCallback(async (assignment: Assignment) => {
        showModal(
            'Liberar Doca',
            `Chamar motorista ${assignment.driverName} (Placa: ${assignment.driverPlate || '--'}) para a doca ${assignment.dock}?`,
            'confirm',
            async () => {
                setIsLoading(true);
                try {
                    await aether.db.collection(COLLECTIONS.ASSIGNMENTS).update(assignment.id, {
                        dockStatus: 'liberated'
                    });

                    // Update local imediato
                    setAssignments(prev => prev.map(a =>
                        a.id === assignment.id ? { ...a, dockStatus: 'liberated' } : a
                    ));

                    // Push Notification com tolerância a falha
                    try {
                        const messageTitle = 'DOCA LIBERADA! 🟢';
                        const messageBody = `Atenção ${assignment.driverName}, a doca ${assignment.dock} está liberada para você entrar agora.`;
                        await notifyDriver(assignment.driverId, messageTitle, messageBody);
                        showModal('Sucesso', 'Doca liberada. O motorista foi notificado.', 'success');
                    } catch (pushErr) {
                        const reason = diagnosePushError(pushErr);
                        console.warn('[Fault Tolerance] Push Falhou:', reason);
                        showModal('Doca Liberada (Sem Push)', `A doca foi liberada no sistema com sucesso.\n\nMotivo do push não enviado: ${reason}`, 'warning');
                    }
                } catch (error) {
                    const msg = error instanceof Error ? error.message : 'Erro genérico ao liberar doca';
                    showModal('Erro', `Falha ao liberar doca: ${msg}`, 'error');
                } finally {
                    setIsLoading(false);
                }
            }
        );
    }, [showModal]);

    /**
     * Setup do ciclo de vida: realtime subscribe + fallback polling.
     * O subscribe detecta mudanças de qualquer assignment (ex: motorista clicou 'Liberar Doca').
     * O polling de 10s garante sincronização mesmo se o WebSocket cair.
     */
    useEffect(() => {
        let unsubscribe: (() => void) | undefined;

        // Fetch inicial
        fetchMonitorAssignments();

        // Subscribe realtime na coleção de assignments
        try {
            unsubscribe = aether.db.collection(COLLECTIONS.ASSIGNMENTS)
                .subscribe((updatedData: any) => {
                    if (!updatedData) return;

                    const payload = updatedData._payload || updatedData;
                    const updateId = payload.id || updatedData.id;

                    if (!updateId) return;

                    console.log('[Realtime Admin] Recebido update:', updateId, payload.dockStatus || payload.status);

                    // Atualiza o assignment específico na lista local (merge in-place)
                    setAssignments(prev => {
                        const exists = prev.some(a => a.id === updateId);
                        if (exists) {
                            console.log('[Realtime Admin] Atualizando doca na UI para:', updateId);
                            return prev.map(a =>
                                a.id === updateId ? { ...a, ...payload, id: a.id } as Assignment : a
                            );
                        }
                        // Se não existia na tela MAS a data é de hoje, pode ser um novo assignment rápido
                        fetchMonitorAssignments();
                        return prev;
                    });
                });
        } catch (subErr) {
            console.warn('[Realtime Admin] Subscribe não disponível, usando apenas polling:', subErr);
        }

        // Polling de 10s como fallback e garantia de consistência
        const interval = setInterval(() => {
            fetchMonitorAssignments();
        }, 10000);

        return () => {
            if (unsubscribe) unsubscribe();
            clearInterval(interval);
        };
    }, [fetchMonitorAssignments]);

    return {
        assignments,
        groups,
        isLoading,
        releaseDock,
        refreshMonitor: fetchMonitorAssignments,
        actionModal,
        dismissModal
    };
}
