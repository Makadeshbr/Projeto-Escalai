/**
 * Central de Notificações In-App do Administrador.
 * UI Premium com Click-to-Read, Animações e Limpar Tudo.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, RefreshControl } from 'react-native';
import { Bell, CalendarCheck, AlertTriangle, MessageCircle, Info, Ticket, X } from 'lucide-react-native';
import { THEME } from '~/src/constants/theme';
import { aether } from '~/src/lib/aether';
import { COLLECTIONS, AdminNotification } from '~/src/lib/collections';
import { logger } from '~/src/lib/logger';

/** Mapa de tipo para configuração visual no painel do Admin */
const TYPE_CONFIG = {
    availability_answered: { icon: CalendarCheck, color: '#4ade80', bg: 'bg-green-500/10', border: 'border-green-500/20' },
    route_confirmed: { icon: Info, color: '#60a5fa', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    route_completed: { icon: CalendarCheck, color: '#4ade80', bg: 'bg-green-500/10', border: 'border-green-500/20' },
    ticket_created: { icon: Ticket, color: '#f87171', bg: 'bg-red-500/10', border: 'border-red-500/20' },
    system_alert: { icon: AlertTriangle, color: '#f59e0b', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    info: { icon: Bell, color: '#94a3b8', bg: 'bg-slate-500/10', border: 'border-slate-500/20' },
} as const;

interface AdminNotificationCenterProps {
    visible: boolean;
    onClose: () => void;
}

export function AdminNotificationCenter({ visible, onClose }: AdminNotificationCenterProps) {
    const [notifications, setNotifications] = useState<AdminNotification[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchNotifications = useCallback(async () => {
        setIsLoading(true);
        try {
            // Busca apenas ultimas 30 ou as nao logadas
            const allRaw = await aether.db.collection(COLLECTIONS.ADMIN_NOTIFICATIONS).query().get();
            const items = (allRaw as any[] || [])
                .map((a: any) => ({
                    id: a.id,
                    title: a.title,
                    message: a.message,
                    type: a.type || 'info',
                    createdAt: a.createdAt,
                    read: !!a.read,
                    relatedDriverId: a.relatedDriverId,
                    relatedAssignmentId: a.relatedAssignmentId
                } as AdminNotification))
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 30); // Limite de visualizacao para performance

            setNotifications(items);
        } catch (err) {
            logger.error('[AdminNotificationCenter] Erro ao buscar notificações:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (visible) fetchNotifications();
    }, [visible, fetchNotifications]);

    if (!visible) return null;

    const renderNotification = ({ item }: { item: AdminNotification }) => {
        const config = TYPE_CONFIG[item.type as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.info;
        const Icon = config.icon;
        const timeAgo = getRelativeTime(new Date(item.createdAt));

        const handlePress = async () => {
            if (item.read) return;
            try {
                // Atualiza db: admin leu a notificação
                await aether.db.collection(COLLECTIONS.ADMIN_NOTIFICATIONS).update(item.id, {
                    read: true
                });
                // Atualiza UI
                setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, read: true } : n));
            } catch (err) {
                logger.error('[AdminNotificationCenter] Erro ao marcar como lida:', err);
            }
        };

        return (
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={handlePress}
                className={`flex-row items-start gap-3 p-4 mb-2 rounded-2xl ${item.read
                    ? 'bg-surface border border-border opacity-70'
                    : 'bg-[#1d2235] border border-blue-500/30'
                    }`}
            >
                <View className={`w-10 h-10 rounded-full items-center justify-center ${config.bg} border ${config.border} relative`}>
                    <Icon color={config.color} size={18} />
                    {!item.read && (
                        <View className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-[#1d2235]" />
                    )}
                </View>
                <View className="flex-1">
                    <Text className="text-white font-spaceGroteskBold text-[14px] mb-1" numberOfLines={1}>
                        {item.title}
                    </Text>
                    <Text className="text-[#94a3b8] font-spaceGrotesk text-[12px] mb-1" numberOfLines={2}>
                        {item.message}
                    </Text>
                    <Text className="text-[#4b5563] font-spaceGrotesk text-[10px] uppercase tracking-wider">
                        {timeAgo}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    const handleMarkAllAsRead = async () => {
        const unreadItems = notifications.filter(n => !n.read);
        if (unreadItems.length === 0) return;

        try {
            await Promise.allSettled(
                unreadItems.map(item =>
                    aether.db.collection(COLLECTIONS.ADMIN_NOTIFICATIONS).update(item.id, { read: true })
                )
            );
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        } catch (err) {
            logger.error('[AdminNotificationCenter] Erro ao limpar notificações:', err);
        }
    };

    return (
        <View className="flex-1 border-l border-border bg-surface">
            {/* Header */}
            <View className="flex-row items-center justify-between px-6 py-5 border-b border-border bg-[#151724]">
                <View className="flex-row items-center gap-3">
                    <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center border border-primary/20 relative">
                        <Bell color={THEME.colors.primary} size={20} />
                        {notifications.some(n => !n.read) && (
                            <View className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-background" />
                        )}
                    </View>
                    <View>
                        <Text className="text-white font-spaceGroteskBold text-lg">Central de Alertas</Text>
                        <Text className="text-[#94a3b8] font-spaceGrotesk text-xs">{notifications.length} evento(s)</Text>
                    </View>
                </View>

                <View className="flex-row items-center gap-2">
                    {notifications.some(n => !n.read) && (
                        <TouchableOpacity onPress={handleMarkAllAsRead} className="px-3 py-2 rounded-xl bg-background border border-border">
                            <Text className="text-[11px] font-spaceGroteskBold text-[#94a3b8] uppercase tracking-wider">Limpar Tudo</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={onClose} className="w-10 h-10 rounded-full bg-background border border-border items-center justify-center">
                        <X color="#94a3b8" size={18} />
                    </TouchableOpacity>
                </View>
            </View>

            <FlatList
                data={notifications}
                keyExtractor={(item) => item.id}
                renderItem={renderNotification}
                className="flex-1 px-4 pt-4 bg-background"
                contentContainerStyle={{ paddingBottom: 100 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={isLoading} onRefresh={fetchNotifications} tintColor={THEME.colors.primary} />}
                ListEmptyComponent={
                    !isLoading ? (
                        <View className="items-center py-16">
                            <View className="w-16 h-16 rounded-full bg-surface border border-border items-center justify-center mb-4">
                                <Bell color="#4b5563" size={24} />
                            </View>
                            <Text className="text-white font-spaceGroteskBold text-base mb-1">Painel Limpo</Text>
                            <Text className="text-[#94a3b8] font-spaceGrotesk text-sm text-center px-8">
                                Nenhuma notificação recente da frota ou do sistema.
                            </Text>
                        </View>
                    ) : null
                }
            />
        </View>
    );
}

function getRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return 'Agora';
    const diffMin = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'Agora';
    if (diffMin < 60) return `Há ${diffMin}min`;
    if (diffHrs < 24) return `Há ${diffHrs}h`;
    if (diffDays < 7) return `Há ${diffDays}d`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
