import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { Home, Calendar, User, Navigation, History } from 'lucide-react-native';
import { router } from 'expo-router';
import { THEME } from '~/src/constants/theme';
import { usePendingAvailability } from '~/src/hooks/usePendingAvailability';

interface DriverBottomNavProps {
    activeTab: 'dashboard' | 'availability' | 'profile' | 'status' | 'history';
}

const TABS = [
    { key: 'dashboard' as const, label: 'Painel', href: '/driver/dashboard', Icon: Home },
    { key: 'status' as const, label: 'Doca', href: '/driver/route-status', Icon: Navigation },
    { key: 'availability' as const, label: 'Escala', href: '/driver/availability', Icon: Calendar },
    { key: 'history' as const, label: 'Histórico', href: '/driver/history', Icon: History },
    { key: 'profile' as const, label: 'Perfil', href: '/driver/profile', Icon: User },
];

export default function DriverBottomNav({ activeTab }: DriverBottomNavProps) {
    const hasPendingAvailability = usePendingAvailability();
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (hasPendingAvailability && activeTab !== 'availability') {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true })
                ])
            ).start();
        } else {
            pulseAnim.stopAnimation();
            pulseAnim.setValue(1);
        }
    }, [hasPendingAvailability, activeTab]);

    return (
        <View className="absolute bottom-0 w-full bg-header-bg/95 border-t border-border px-6 pb-6 pt-4 z-30 flex-row justify-between items-end">
            {TABS.map(({ key, label, href, Icon }) => {
                const isActive = activeTab === key;
                const isPulsing = key === 'availability' && hasPendingAvailability && !isActive;

                return (
                    <TouchableOpacity
                        key={key}
                        onPress={() => router.replace(href as any)}
                        className={`flex-1 items-center justify-end gap-1 ${isActive ? 'opacity-100' : 'opacity-60'}`}
                    >
                        {isPulsing ? (
                            <Animated.View style={{ transform: [{ scale: pulseAnim }], alignItems: 'center' }}>
                                <View className="relative">
                                    <Icon color="#f97316" size={24} />
                                    <View className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-background" />
                                </View>
                                <Text className="text-[11px] font-spaceGroteskBold text-[#f97316] uppercase tracking-wider mt-1">
                                    {label}
                                </Text>
                            </Animated.View>
                        ) : (
                            <View className="items-center">
                                <Icon color={isActive ? THEME.colors.primary : '#94a3b8'} size={24} />
                                <Text
                                    className={`text-[11px] uppercase tracking-wider mt-1 ${isActive ? 'font-spaceGroteskBold text-primary' : 'font-spaceGrotesk text-[#94a3b8]'}`}
                                >
                                    {label}
                                </Text>
                            </View>
                        )}
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}
