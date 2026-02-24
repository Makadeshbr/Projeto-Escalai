import { useState, useCallback } from 'react';

/**
 * Tipos de modal disponíveis para feedback visual ao administrador.
 */
export type ModalType = 'info' | 'error' | 'success' | 'confirm' | 'warning';

/**
 * Estado completo do modal de ação genérico.
 */
export interface ActionModalState {
    /** Se o modal está visível */
    visible: boolean;
    /** Título exibido no modal */
    title: string;
    /** Mensagem descritiva */
    message: string;
    /** Tipo visual do modal (define ícone e cor) */
    type: ModalType;
    /** Callback executado ao confirmar (apenas para type='confirm') */
    onConfirm: () => void;
}

/** Estado inicial do modal (fechado, sem conteúdo) */
const INITIAL_STATE: ActionModalState = {
    visible: false,
    title: '',
    message: '',
    type: 'info',
    onConfirm: () => { },
};

/**
 * Hook reutilizável para gerenciar modal de ação genérico.
 * Centraliza a lógica de exibição de feedback (sucesso, erro, confirmação)
 * que antes estava duplicada em múltiplas telas admin.
 *
 * @returns Estado do modal, função showModal e função dismissModal
 *
 * @example
 * ```tsx
 * const { actionModal, showModal, dismissModal } = useActionModal();
 * showModal('Sucesso', 'Rota criada com sucesso!', 'success');
 * ```
 */
export function useActionModal() {
    const [actionModal, setActionModal] = useState<ActionModalState>(INITIAL_STATE);

    /**
     * Exibe o modal com título, mensagem e tipo.
     * Para type='confirm', aceita callback de confirmação.
     *
     * @param title - Título do modal
     * @param message - Mensagem descritiva
     * @param type - Tipo visual (info, error, success, confirm, warning)
     * @param onConfirm - Callback para confirmação (opcional, apenas type='confirm')
     */
    const showModal = useCallback((
        title: string,
        message: string,
        type: ModalType = 'info',
        onConfirm?: () => void
    ) => {
        setActionModal({
            visible: true,
            title,
            message,
            type,
            onConfirm: onConfirm || (() => setActionModal(prev => ({ ...prev, visible: false }))),
        });
    }, []);

    /**
     * Fecha o modal sem executar callback de confirmação.
     */
    const dismissModal = useCallback(() => {
        setActionModal(prev => ({ ...prev, visible: false }));
    }, []);

    return { actionModal, showModal, dismissModal, setActionModal };
}
