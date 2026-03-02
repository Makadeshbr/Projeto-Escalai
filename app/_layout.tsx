import { Stack, router } from 'expo-router';
import { useFonts } from 'expo-font';
import { THEME } from '~/src/constants/theme';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { View, StatusBar } from 'react-native';
import { AetherProvider } from '@aether-baas/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { ThemeProvider, DarkTheme } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { aetherConfig } from '../src/lib/aether';
import { initializeNotificationHandler } from '../src/lib/push';
import OTAUpdater from '../src/components/OTAUpdater';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { OfflineBanner } from '../src/components/OfflineBanner';
import { crashReporter, initCrashReporting } from '../src/lib/crashReporter';
import { logger } from '../src/lib/logger';

/** Timeout máximo para carregamento de fontes (ms). Evita splash infinita em Android low-end. */
const FONT_LOAD_TIMEOUT = 5000;

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Inicializa Sentry (se DSN configurado) antes de qualquer render.
 * Em dev, usa apenas crash log local. Em prod, envia para Sentry.
 */
initCrashReporting();

/**
 * [AUDIT FIX — CLEAN-003] Handler de notificações centralizado em push.ts.
 * Evita duplicação e garante configuração consistente em todo o app.
 */
initializeNotificationHandler();

/**
 * Handler global de erros não capturados (JS exceptions fora do render).
 * Complementa o ErrorBoundary que só captura erros de render React.
 */
const defaultHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error, isFatal) => {
    crashReporter.captureException(error instanceof Error ? error : new Error(String(error)), { isFatal });
    defaultHandler(error, isFatal);
});

import '../global.css';

SplashScreen.preventAutoHideAsync();

/**
 * QueryClient global — gerencia cache, retry e deduplicação de requests.
 * staleTime: 30s — dados ficam "frescos" por 30s, evitando refetch desnecessário
 * retry: 2 — tenta 2x antes de falhar (resiliência em rede instável)
 * refetchOnWindowFocus: false — não refetch ao voltar pra aba (mobile = background)
 */
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30 * 1000,
            retry: 2,
            refetchOnWindowFocus: false,
        },
    },
});

// Tema escuro customizado — elimina flash branco entre telas
const AppDarkTheme = {
    ...DarkTheme,
    colors: {
        ...DarkTheme.colors,
        background: THEME.colors.background,
        card: THEME.colors.surface,
        border: THEME.colors.border,
        primary: THEME.colors.primary,
        text: '#e2e8f0',
    },
};

export default function RootLayout() {
    const [loaded, fontError] = useFonts({
        'SpaceGrotesk-Regular': require('../assets/fonts/SpaceGrotesk-Regular.ttf'),
        'SpaceGrotesk-Bold': require('../assets/fonts/SpaceGrotesk-Bold.ttf'),
    });

    // Timeout de segurança: se fontes não carregarem em 5s, renderiza mesmo assim
    const [fontTimedOut, setFontTimedOut] = useState(false);

    const responseListener = useRef<ReturnType<typeof import('expo-notifications').addNotificationResponseReceivedListener> | null>(null);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (!loaded) {
                setFontTimedOut(true);
                crashReporter.captureException(
                    new Error('[Startup] Font loading timeout — rendering with system fonts'),
                    { fontError: fontError?.message }
                );
            }
        }, FONT_LOAD_TIMEOUT);

        return () => clearTimeout(timer);
    }, [loaded, fontError]);

    // Esconde splash assim que fontes carregarem OU timeout expirar
    const canRender = loaded || fontTimedOut;

    useEffect(() => {
        if (canRender) {
            SplashScreen.hideAsync();
        }
    }, [canRender]);

    useEffect(() => {
        /**
         * [AUDIT FIX — BP-001] Usa require() dinâmico pois expo-notifications
         * crasha no Expo Go (Android SDK 53+). Em builds de produção (EAS),
         * o módulo nativo é resolvido normalmente. Decisão documentada.
         */
        if (!isExpoGo) {
            const Notifications = require('expo-notifications');
            responseListener.current = Notifications.addNotificationResponseReceivedListener((response: { notification: { request: { content: { data: Record<string, unknown> } } } }) => {
                const data = response.notification.request.content.data;
                logger.debug('[Push] Usuário tocou na notificação, redirecionando...', data);

                setTimeout(() => {
                    router.push('/driver/dashboard');
                }, 500);
            });
        }

        return () => {
            if (responseListener.current) {
                responseListener.current.remove();
            }
        };
    }, []);

    if (!canRender) return null;

    return (
        <ErrorBoundary>
            <View style={{ flex: 1, backgroundColor: THEME.colors.background }}>
                <StatusBar barStyle="light-content" backgroundColor={THEME.colors.background} translucent={false} />
                <OTAUpdater />
                <OfflineBanner />
                <QueryClientProvider client={queryClient}>
                    <AetherProvider config={aetherConfig} storage={AsyncStorage as any}>
                        <ThemeProvider value={AppDarkTheme}>
                            <Stack screenOptions={{
                                headerShown: false,
                                contentStyle: { backgroundColor: THEME.colors.background },
                                animation: 'fade',
                            }}>
                                <Stack.Screen name="index" />
                                <Stack.Screen name="splash" />
                                <Stack.Screen name="login" />
                                <Stack.Screen name="driver/availability" />
                                <Stack.Screen name="driver/dashboard" />
                                <Stack.Screen name="admin/dashboard" />
                            </Stack>
                        </ThemeProvider>
                    </AetherProvider>
                </QueryClientProvider>
            </View>
        </ErrorBoundary>
    );
}
