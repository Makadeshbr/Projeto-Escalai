import { useState, useEffect } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

/**
 * Hook que monitora o status de rede em tempo real.
 * Usa @react-native-community/netinfo para detecção precisa.
 *
 * @returns { isConnected, isInternetReachable }
 */
export function useNetworkStatus() {
    const [isConnected, setIsConnected] = useState(true);
    const [isInternetReachable, setIsInternetReachable] = useState(true);

    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
            setIsConnected(state.isConnected ?? true);
            setIsInternetReachable(state.isInternetReachable ?? true);
        });

        return () => unsubscribe();
    }, []);

    return { isConnected, isInternetReachable };
}
