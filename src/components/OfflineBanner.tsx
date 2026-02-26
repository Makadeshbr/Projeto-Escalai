import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useNetworkStatus } from '~/src/hooks/useNetworkStatus';
import { THEME } from '~/src/constants/theme';

/**
 * Banner que aparece no topo quando o app detecta perda de conexão.
 * Usa animação slide-down/slide-up para UX suave.
 * Renderize no _layout.tsx — uma única instância para todo o app.
 */
export function OfflineBanner() {
    const { isConnected, isInternetReachable } = useNetworkStatus();
    const slideAnim = useRef(new Animated.Value(-60)).current;

    const isOffline = !isConnected || !isInternetReachable;

    useEffect(() => {
        Animated.timing(slideAnim, {
            toValue: isOffline ? 0 : -60,
            duration: 300,
            useNativeDriver: true,
        }).start();
    }, [isOffline, slideAnim]);

    return (
        <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.inner}>
                <Text style={styles.text}>Sem conexão com a internet</Text>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
    },
    inner: {
        backgroundColor: THEME.colors.danger,
        paddingVertical: 8,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        color: '#ffffff',
        fontSize: 13,
        fontFamily: 'SpaceGrotesk-Bold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
});
