import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '~/src/store/auth';
import { aether } from '~/src/lib/aether';
import { COLLECTIONS } from '~/src/lib/collections';
import { useRealtimeSubscribe } from './useRealtimeSubscribe';
import { logger } from '~/src/lib/logger';

/**
 * Hook customizado para verificar se o motorista tem uma janela de escala (availability window)
 * aberta que ele ainda NÃO respondeu.
 * Perfeito para usar em animações (pulsar navbar, badges).
 */
export function usePendingAvailability() {
    const { user } = useAuthStore();
    const [hasPending, setHasPending] = useState(false);

    /**
     * Verifica se existe alguma janela aberta que o motorista ainda não respondeu.
     * Compara janelas abertas (isOpen === true) com as respostas do motorista.
     */
    const checkStatus = useCallback(async () => {
        if (!user?.id) return;

        try {
            // 1. Pega janelas abertas
            const allWindowsRaw = await aether.db.collection(COLLECTIONS.AVAILABILITY_WINDOWS).query().get();
            const allWindows = (allWindowsRaw as any[]) || [];
            const openWindows = allWindows.filter(w => w.isOpen === true);

            if (openWindows.length === 0) {
                setHasPending(false);
                return;
            }

            // 2. Pega respostas do motorista
            const rawAvails = await aether.db.collection(COLLECTIONS.DRIVER_AVAILABILITY)
                .query().eq('driverId', user.id).get();
            const userAvails = (rawAvails as any[]) || [];

            // 3. Verifica se tem alguma aberta que ele nao respondeu
            const pending = openWindows.some(w => !userAvails.some(a => a.targetDate === w.targetDate));
            setHasPending(pending);
        } catch (error) {
            logger.warn('[usePendingAvailability]', 'Erro ao verificar status:', error);
        }
    }, [user?.id]);

    // Subscribe realtime centralizado — detecta quando admin abre/fecha janela
    useRealtimeSubscribe({
        collection: COLLECTIONS.AVAILABILITY_WINDOWS,
        tag: '[PendingAvail]',
        debounceMs: 1000,
        enabled: !!user?.id,
        onEvent: useCallback(() => {
            logger.debug('[PendingAvail]', 'Janela alterada, rechecando pendências...');
            checkStatus();
        }, [checkStatus]),
    });

    // Setup inicial + polling de 30s como safety net
    useEffect(() => {
        if (!user?.id) return;

        checkStatus();

        const interval = setInterval(checkStatus, 30000);

        return () => {
            clearInterval(interval);
        };
    }, [user?.id, checkStatus]);

    return hasPending;
}
