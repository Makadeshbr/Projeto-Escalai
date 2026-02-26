/**
 * Central de Notificações do motorista.
 * Exibe notificações recentes (push local storage + assignments recentes).
 * Visual premium com mini-feed de cards.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, RefreshControl } from 'react-native';
import { Bell, Package, MapPin, AlertTriangle, CheckCircle2, MessageCircle, X } from 'lucide-react-native';
import { THEME } from '~/src/constants/theme';
import { aether, aetherFetchAll } from '~/src/lib/aether';
import { COLLECTIONS, Assignment } from '~/src/lib/collections';
import { useAuthStore } from '~/src/store/auth';

/** Item de notificação renderizável */
interface NotificationItem {
    id: string;
    title: string;
    body: string;
    type: 'route' | 'alert' | 'info' | 'success';
    timestamp: Date;
    read: boolean;
}

/** Mapa de tipo para configuração visual */
const TYPE_CONFIG = {
    route: { icon: MapPin, color: '#60a5fa', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    alert: { icon: AlertTriangle, color: '#f59e0b', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    info: { icon: Bell, color: '#94a3b8', bg: 'bg-slate-500/10', border: 'border-slate-500/20' },
    success: { icon: CheckCircle2, color: '#4ade80', bg: 'bg-green-500/10', border: 'border-green-500/20' },
} as const;

interface NotificationCenterProps {
    /** Flag de visibilidade */
    visible: boolean;
    /** Callback de fechamento */
    onClose: () => void;
}

/**
 * Componente de central de notificações.
 * Busca assignments recentes do motorista e os exibe como cards.
 * Ordenados do mais recente ao mais antigo.
 */
export function NotificationCenter({ visible, onClose }: NotificationCenterProps) {
    const { user } = useAuthStore();
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    /**
     * Busca assignments do motorista e transforma em notificações.
     * Cada assignment vira um card com informações relevantes.
     */
    const fetchNotifications = useCallback(async () => {
        if (!user?.id) return;
        setIsLoading(true);
        try {
            const allAssignments = await aetherFetchAll(COLLECTIONS.ASSIGNMENTS);
            const myAssignments = (allAssignments as any[])
                .filter((a: any) => a.driverId === user.id)
                .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 20);

            const items: NotificationItem[] = myAssignments.map((a: any) => ({
                id: a.id,
                title: a.status === 'completed'
                    ? `Rota concluída — ${a.cityName}`
                    : a.status === 'confirmed'
                        ? `Rota confirmada — ${a.cityName}`
                        : `Nova rota — ${a.cityName}`,
                body: `Doca ${a.dock || 'N/A'} • ${a.waveLabel || a.wave || ''} • ${a.sacas || 0} sacas`,
                type: a.status === 'completed' ? 'success' : a.status === 'confirmed' ? 'route' : 'info',
                timestamp: new Date(a.createdAt),
                read: a.status === 'completed',
            }));

            setNotifications(items);
        } catch (err) {
            console.error('[NotificationCenter] Erro ao buscar notificações:', err);
        } finally {
            setIsLoading(false);
        }
    }, [user?.id]);

    useEffect(() => {
        if (visible) fetchNotifications();
    }, [visible, fetchNotifications]);

    if (!visible) return null;

    /**
     * Renderiza um card de notificação individual.
     * Usa configuração visual baseada no tipo (route, alert, info, success).
     */
    const renderNotification = ({ item }: { item: NotificationItem }) => {
        const config = TYPE_CONFIG[item.type];
        const Icon = config.icon;
        const timeAgo = getRelativeTime(item.timestamp);

        return (
            <View className={`flex-row items-start gap-3 p-4 mb-2 rounded-2xl bg-surface border border-border ${item.read ? 'opacity-60' : ''}`}>
                <View className={`w-10 h-10 rounded-full items-center justify-center ${config.bg} border ${config.border}`}>
                    <Icon color={config.color} size={18} />
                </View>
                <View className="flex-1">
                    <Text className="text-white font-spaceGroteskBold text-[14px] mb-1" numberOfLines={1}>
                        {item.title}
                    </Text>
                    <Text className="text-[#94a3b8] font-spaceGrotesk text-[12px] mb-1" numberOfLines={2}>
                        {item.body}
                    </Text>
                    <Text className="text-[#4b5563] font-spaceGrotesk text-[10px] uppercase tracking-wider">
                        {timeAgo}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <View className="flex-1">
            <View className="flex-row items-center justify-between px-6 py-4">
                <View className="flex-row items-center gap-3">
                    <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center border border-primary/20">
                        <Bell color={THEME.colors.primary} size={20} />
                    </View>
                    <View>
                        <Text className="text-white font-spaceGroteskBold text-lg">Notificações</Text>
                        <Text className="text-[#94a3b8] font-spaceGrotesk text-xs">{notifications.length} evento(s)</Text>
                    </View>
                </View>
                <TouchableOpacity onPress={onClose} className="w-10 h-10 rounded-full bg-surface border border-border items-center justify-center">
                    <X color="#94a3b8" size={18} />
                </TouchableOpacity>
            </View>

            <FlatList
                data={notifications}
                keyExtractor={(item) => item.id}
                renderItem={renderNotification}
                className="flex-1 px-4"
                contentContainerStyle={{ paddingBottom: 20 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={isLoading} onRefresh={fetchNotifications} tintColor={THEME.colors.primary} />}
                ListEmptyComponent={
                    !isLoading ? (
                        <View className="items-center py-16">
                            <View className="w-16 h-16 rounded-full bg-surface border border-border items-center justify-center mb-4">
                                <Bell color="#4b5563" size={24} />
                            </View>
                            <Text className="text-white font-spaceGroteskBold text-base mb-1">Tudo limpo</Text>
                            <Text className="text-[#94a3b8] font-spaceGrotesk text-sm text-center px-8">
                                Nenhuma notificação recente. Quando houver atualizações nas suas rotas, elas aparecerão aqui.
                            </Text>
                        </View>
                    ) : null
                }
            />
        </View>
    );
}

/**
 * Calcula tempo relativo legível em PT-BR.
 * @param date - Data a comparar com agora
 * @returns String como 'Há 2h', 'Há 3d', 'Agora'
 */
function getRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'Agora';
    if (diffMin < 60) return `Há ${diffMin}min`;
    if (diffHrs < 24) return `Há ${diffHrs}h`;
    if (diffDays < 7) return `Há ${diffDays}d`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
