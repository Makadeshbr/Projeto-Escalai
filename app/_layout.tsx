import { Stack, router } from 'expo-router';
import { useFonts } from 'expo-font';
import { THEME } from '~/src/constants/theme';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { View, StatusBar } from 'react-native';
import { AetherProvider } from '@aether-baas/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { ThemeProvider, DarkTheme } from '@react-navigation/native';
import { aetherConfig } from '../src/lib/aether';
import { initializeNotificationHandler } from '../src/lib/push';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * [AUDIT FIX — CLEAN-003] Handler de notificações centralizado em push.ts.
 * Evita duplicação e garante configuração consistente em todo o app.
 */
initializeNotificationHandler();

import '../global.css';

SplashScreen.preventAutoHideAsync();

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
    const [loaded] = useFonts({
        'SpaceGrotesk-Regular': require('../assets/fonts/SpaceGrotesk-Regular.ttf'),
        'SpaceGrotesk-Bold': require('../assets/fonts/SpaceGrotesk-Bold.ttf'),
    });

    const responseListener = useRef<ReturnType<typeof import('expo-notifications').addNotificationResponseReceivedListener> | null>(null);

    useEffect(() => {
        if (loaded) {
            SplashScreen.hideAsync();
        }
    }, [loaded]);

    useEffect(() => {
        /**
         * [AUDIT FIX — BP-001] Usa require() dinâmico pois expo-notifications
         * crasha no Expo Go (Android SDK 53+). Em builds de produção (EAS),
         * o módulo nativo é resolvido normalmente. Decisão documentada.
         */
        if (!isExpoGo) {
            const Notifications = require('expo-notifications');
            // Trata toque físico na notificação (simula Deep Link para dashboard do motorista)
            responseListener.current = Notifications.addNotificationResponseReceivedListener((response: { notification: { request: { content: { data: Record<string, unknown> } } } }) => {
                const data = response.notification.request.content.data;
                console.log('[Push] Usuário tocou na notificação, redirecionando...', data);

                // setTimeout garante que a navegação complete após a montagem do app
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

    if (!loaded) return null;

    return (
        <View style={{ flex: 1, backgroundColor: THEME.colors.background }}>
            <StatusBar barStyle="light-content" backgroundColor={THEME.colors.background} translucent={false} />
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
        </View>
    );
}
