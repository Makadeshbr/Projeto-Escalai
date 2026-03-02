import { useState, useCallback, useEffect } from 'react';
import { aether, aetherFetchAll } from '~/src/lib/aether';
import { COLLECTIONS, Assignment, getTodayDateStr } from '~/src/lib/collections';
import { notifyDriver, diagnosePushError } from '~/src/lib/push';
import { useActionModal } from './useActionModal';
import { logger } from '~/src/lib/logger';

export function useEditorData() {
    const { actionModal, showModal, dismissModal } = useActionModal();
    const [isLoading, setIsLoading] = useState(true);
    const [assignments, setAssignments] = useState<Assignment[]>([]);

    // Formulário de Edição
    const [isEditing, setIsEditing] = useState(false);
    const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);

    // Campos
    const [editPlate, setEditPlate] = useState('');
    const [editCity, setEditCity] = useState('');
    const [editDock, setEditDock] = useState('');
    const [editRoute, setEditRoute] = useState('');

    /** Busca as rotas elegíveis para edição (Ativas de Hoje) */
    const fetchEditableAssignments = useCallback(async () => {
        setIsLoading(true);
        try {
            const allAssignmentsRaw = await aetherFetchAll(COLLECTIONS.ASSIGNMENTS);
            const todayStr = getTodayDateStr();

            const editable = (allAssignmentsRaw as any[]).filter(a => {
                const payload = a._payload || a;
                // Não edita rotas arquivadas
                if (payload.archived === true) return false;

                // Precisa ter sido criado hoje OU estar em andamento
                if (!payload.createdAt) return false;
                const createdDate = new Date(payload.createdAt);
                const year = createdDate.getFullYear();
                const month = String(createdDate.getMonth() + 1).padStart(2, '0');
                const day = String(createdDate.getDate()).padStart(2, '0');
                const isToday = `${year}-${month}-${day}` === todayStr;

                const isStillActive = (payload.status === 'pending' || payload.status === 'confirmed' || payload.status === 'in_progress'
                    || payload.dockStatus === 'waiting' || payload.dockStatus === 'liberated');

                return isToday || isStillActive;
            }).map(a => (a._payload || a) as Assignment);

            // Ordena pelo mais recente
            editable.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            setAssignments(editable);
        } catch (error) {
            logger.error('[useEditorData] Erro ao buscar rotas:', error);
            showModal('Erro na Sincronização', 'Não foi possível carregar as rotas para edição.', 'error');
        } finally {
            setIsLoading(false);
        }
    }, [showModal]);

    useEffect(() => {
        fetchEditableAssignments();
    }, [fetchEditableAssignments]);

    /** Inicia o processo de edição carregando os dados do card pro form */
    const startEditing = (assignment: Assignment) => {
        setSelectedAssignment(assignment);
        setEditPlate(assignment.driverPlate || '');
        setEditCity(assignment.cityName || '');
        setEditDock(assignment.dock || '');
        setEditRoute(assignment.routeLabel || '');
        setIsEditing(true);
    };

    /** Cancela a edição */
    const cancelEditing = () => {
        setIsEditing(false);
        setSelectedAssignment(null);
    };

    /**
     * Salva as alterações da rota.
     * Magia Senior: Se a placa mudou, busca o motorista verdadeiro na base
     * e reatribui a rota silenciosamente, além de mandar Push.
     */
    const saveChanges = useCallback(async () => {
        if (!selectedAssignment) return;

        const cleanPlate = editPlate.trim().toUpperCase();
        const cleanCity = editCity.trim();
        const cleanDock = editDock.trim();
        const cleanRoute = editRoute.trim();

        if (!cleanPlate || !cleanCity || !cleanDock) {
            showModal('Campos Inválidos', 'A Placa, Cidade e Doca são obrigatórias.', 'error');
            return;
        }

        setIsEditing(false); // Oculta o modal de edição para mostrar o loading popup

        showModal('Salvando...', 'Atualizando Datalake e notificando frota se necessário...', 'info');

        try {
            const updates: Partial<Assignment> = {
                cityName: cleanCity,
                dock: cleanDock,
                routeLabel: cleanRoute,
            };

            const plateChanged = cleanPlate !== selectedAssignment.driverPlate;
            let newDriverId = selectedAssignment.driverId;
            let newDriverName = selectedAssignment.driverName;

            // Se o admin editou a Placa (Ex: IA leu errado)
            if (plateChanged) {
                // 1. Procura o motorista real pelo registro ativo
                const allDrivers = await aetherFetchAll(COLLECTIONS.DRIVER_STATUS);
                const realDriver = (allDrivers as any[]).find((d: any) => {
                    const p = d._payload || d;
                    return p.driverPlate && p.driverPlate.toUpperCase() === cleanPlate;
                });

                if (realDriver) {
                    const payload = realDriver._payload || realDriver;
                    newDriverId = realDriver.user_id || payload.driverId || realDriver.id;
                    newDriverName = payload.driverName;

                    updates.driverId = newDriverId;
                    updates.driverName = newDriverName;
                    updates.driverPlate = cleanPlate;
                    updates.status = 'pending'; // Reseta o aceite pois é outra pessoa
                } else {
                    // Mantém a placa editada mesmo se não achar na base (Modo Graceful Degradation)
                    updates.driverPlate = cleanPlate;
                    updates.status = 'pending';
                }
            }

            // 2. Atualiza no Banco
            await aether.db.collection(COLLECTIONS.ASSIGNMENTS).update(selectedAssignment.id, updates);

            // 3. Sistema de Notificação Transacional Dinâmico
            try {
                if (plateChanged && newDriverId !== selectedAssignment.driverId) {
                    // Notifica o Antigo que a rota não é mais dele
                    await notifyDriver(selectedAssignment.driverId, 'ROTA REATRIBUÍDA ❌', 'Houve correção de traçado e sua rota foi repassada.');
                    // Notifica o Novo verdadeiro dono
                    await notifyDriver(newDriverId, 'CORREÇÃO DE ROTA 📦', `Você foi alocado em: ${cleanCity}, Doca ${cleanDock}.`);
                } else {
                    // Apenas alterou Cidade/Doca/Rota = Notifica o motorista atual
                    let msg = `Sua Rota foi corrigida: `;
                    if (cleanCity !== selectedAssignment.cityName) msg += `Destino ${cleanCity}. `;
                    if (cleanDock !== selectedAssignment.dock) msg += `Doca ${cleanDock}. `;
                    if (cleanRoute !== selectedAssignment.routeLabel) msg += `Rota ${cleanRoute}.`;

                    await notifyDriver(selectedAssignment.driverId, 'ATUALIZAÇÃO DE DESPACHO 🔄', msg);
                }
            } catch (pushErr) {
                logger.warn('[Editor] Falha ao despachar Push:', diagnosePushError(pushErr));
            }

            dismissModal();
            setTimeout(() => {
                showModal('Escala Corrigida', 'A alteração foi salva em tempo real no app do motorista.', 'success');
            }, 500);

            fetchEditableAssignments();
            setSelectedAssignment(null);
        } catch (e: unknown) {
            const errorMsg = e instanceof Error ? e.message : 'Falha grave na comunicação com o Aether.';
            showModal('Erro ao Salvar', errorMsg, 'error');
            setIsEditing(true); // Devolve o form
        }
    }, [selectedAssignment, editPlate, editCity, editDock, editRoute, showModal, dismissModal, fetchEditableAssignments]);

    return {
        assignments,
        isLoading,
        refresh: fetchEditableAssignments,
        actionModal,
        dismissModal,
        editor: {
            isOpen: isEditing,
            assignment: selectedAssignment,
            plate: editPlate, setPlate: setEditPlate,
            city: editCity, setCity: setEditCity,
            dock: editDock, setDock: setEditDock,
            route: editRoute, setRoute: setEditRoute,
            start: startEditing,
            cancel: cancelEditing,
            save: saveChanges
        }
    };
}
