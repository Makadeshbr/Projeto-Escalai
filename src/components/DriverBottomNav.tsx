import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Home, Calendar, User, Navigation } from 'lucide-react-native';
import { router } from 'expo-router';
import { THEME } from '~/src/constants/theme';

interface DriverBottomNavProps {
    activeTab: 'dashboard' | 'availability' | 'profile' | 'status';
}

const TABS = [
    { key: 'dashboard' as const, label: 'Painel', href: '/driver/dashboard', Icon: Home },
    { key: 'status' as const, label: 'Rota/Doca', href: '/driver/route-status', Icon: Navigation },
    { key: 'availability' as const, label: 'Escala', href: '/driver/availability', Icon: Calendar },
    { key: 'profile' as const, label: 'Perfil', href: '/driver/profile', Icon: User },
];

export default function DriverBottomNav({ activeTab }: DriverBottomNavProps) {
    return (
        <View className="absolute bottom-0 w-full bg-[#0f1118]/95 border-t border-[#2d3345] px-6 pb-6 pt-4 z-30 flex-row justify-between items-end">
            {TABS.map(({ key, label, href, Icon }) => {
                const isActive = activeTab === key;
                return (
                    <TouchableOpacity
                        key={key}
                        onPress={() => router.replace(href as any)}
                        className={`flex-1 items-center justify-end gap-1 ${isActive ? 'opacity-100' : 'opacity-60'}`}
                    >
                        <Icon color={isActive ? THEME.colors.primary : '#94a3b8'} size={24} />
                        <Text
                            className={`text-[11px] uppercase tracking-wider ${isActive ? 'font-spaceGroteskBold text-primary' : 'font-spaceGrotesk text-[#94a3b8]'}`}
                        >
                            {label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}
