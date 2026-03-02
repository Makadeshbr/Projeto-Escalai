import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

/**
 * Hook customizado para disparar um callback quando o aplicativo volta
 * do estado em segundo plano (background) para o primeiro plano (active).
 * Resolve problemas onde requisições ficam defasadas ao minimizar o app.
 *
 * @param onRefresh Callback a ser executado assim que o app volta à tela no celular
 */
export function useForegroundRefresh(onRefresh: () => void | Promise<void>) {
    const appState = useRef(AppState.currentState);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
            // Se o app estava no fundo (background/inactive) e agora está em "active", ele disparou!
            if (
                appState.current.match(/inactive|background/) &&
                nextAppState === 'active'
            ) {
                __DEV__ && console.log('[useForegroundRefresh] App voltou ao primeiro plano. Disparando Refresh da Tela!');
                onRefresh();
            }

            appState.current = nextAppState;
        });

        return () => {
            subscription.remove();
        };
    }, [onRefresh]);
}
