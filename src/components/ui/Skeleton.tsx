import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { THEME } from '~/src/constants/theme';

interface SkeletonProps {
    width: number | string;
    height: number;
    borderRadius?: number;
    style?: ViewStyle;
}

/**
 * Componente Skeleton com animação de pulso.
 * Substitui o ActivityIndicator genérico durante loading.
 * Uso: <Skeleton width="100%" height={80} borderRadius={12} />
 */
export function Skeleton({ width, height, borderRadius = 8, style }: SkeletonProps) {
    const pulseAnim = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 0.6, duration: 800, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
            ])
        );
        animation.start();
        return () => animation.stop();
    }, [pulseAnim]);

    return (
        <Animated.View
            style={[
                {
                    width: width as any,
                    height,
                    borderRadius,
                    backgroundColor: THEME.colors.surface,
                    opacity: pulseAnim,
                },
                style,
            ]}
        />
    );
}

/**
 * Skeleton pré-montado que imita um card de motorista/rota.
 * Usado em telas admin (drivers, monitor, overview) durante loading.
 */
export function SkeletonCard() {
    return (
        <View style={skeletonStyles.card}>
            <View style={skeletonStyles.row}>
                <Skeleton width={48} height={48} borderRadius={24} />
                <View style={skeletonStyles.textBlock}>
                    <Skeleton width="70%" height={16} borderRadius={4} />
                    <Skeleton width="40%" height={12} borderRadius={4} style={{ marginTop: 8 }} />
                </View>
            </View>
        </View>
    );
}

/**
 * Skeleton para KPI cards da overview/dashboard.
 */
export function SkeletonKPI() {
    return (
        <View style={skeletonStyles.kpiCard}>
            <Skeleton width={32} height={32} borderRadius={16} />
            <Skeleton width="60%" height={12} borderRadius={4} style={{ marginTop: 12 }} />
            <Skeleton width={48} height={28} borderRadius={4} style={{ marginTop: 8 }} />
        </View>
    );
}

/**
 * Lista de skeleton cards para usar como placeholder.
 */
export function SkeletonList({ count = 4 }: { count?: number }) {
    return (
        <View>
            {Array.from({ length: count }).map((_, i) => (
                <SkeletonCard key={i} />
            ))}
        </View>
    );
}

const skeletonStyles = StyleSheet.create({
    card: {
        backgroundColor: THEME.colors.surface,
        borderWidth: 1,
        borderColor: THEME.colors.border,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    textBlock: {
        flex: 1,
        marginLeft: 12,
    },
    kpiCard: {
        backgroundColor: THEME.colors.surface,
        borderWidth: 1,
        borderColor: THEME.colors.border,
        borderRadius: 16,
        padding: 20,
        width: '47%' as any,
    },
});
