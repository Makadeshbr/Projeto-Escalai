import { useState, useEffect } from 'react';
import { useAuthStore } from '~/src/store/auth';
import { aether } from '~/src/lib/aether';
import { COLLECTIONS } from '~/src/lib/collections';

/**
 * Hook customizado para verificar se o motorista tem uma janela de escala (availability window)
 * aberta que ele ainda NÃO respondeu.
 * Perfeito para usar em animações (pulsar navbar, badges).
 */
export function usePendingAvailability() {
    const { user } = useAuthStore();
    const [hasPending, setHasPending] = useState(false);

    useEffect(() => {
        if (!user?.id) return;

        let isMounted = true;
        let unsubscribe: (() => void) | undefined;

        const checkStatus = async () => {
            try {
                // 1. Pega janelas abertas
                const allWindowsRaw = await aether.db.collection(COLLECTIONS.AVAILABILITY_WINDOWS).query().get();
                const allWindows = (allWindowsRaw as any[]) || [];
                const openWindows = allWindows.filter(w => w.isOpen === true);

                if (openWindows.length === 0) {
                    if (isMounted) setHasPending(false);
                    return;
                }

                // 2. Pega respostas do motorista
                const rawAvails = await aether.db.collection(COLLECTIONS.DRIVER_AVAILABILITY)
                    .query().eq('driverId', user.id).get();
                const userAvails = (rawAvails as any[]) || [];

                // 3. Verifica se tem alguma aberta que ele nao respondeu
                const pending = openWindows.some(w => !userAvails.some(a => a.targetDate === w.targetDate));
                if (isMounted) setHasPending(pending);
            } catch (error) {
                console.warn('[usePendingAvailability] erro', error);
            }
        };

        checkStatus();

        try {
            unsubscribe = aether.db.collection(COLLECTIONS.AVAILABILITY_WINDOWS).subscribe(() => {
                checkStatus();
            });
        } catch (subErr) {
            // silent on environments without realtime
        }

        const interval = setInterval(checkStatus, 30000); // 30s poll interval

        return () => {
            isMounted = false;
            if (unsubscribe) unsubscribe();
            clearInterval(interval);
        };
    }, [user?.id]);

    return hasPending;
}
