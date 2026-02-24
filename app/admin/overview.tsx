import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Dimensions, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { THEME } from '~/src/constants/theme';
import { Users, Truck, Activity, TrendingUp, HelpCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { aether, aetherFetchAll } from '~/src/lib/aether';
import { useAuthStore } from '~/src/store/auth';
import { COLLECTIONS, getTodayDateStr } from '~/src/lib/collections';
import AdminBottomNav from '~/src/components/AdminBottomNav';
import { router } from 'expo-router';

export default function AdminOverviewScreen() {
    const { role } = useAuthStore();
    const [isLoading, setIsLoading] = useState(true);
    const [stats, setStats] = useState({
        totalDrivers: 0,
        activeToday: 0,
        completedRuns: 0,
    });
    const [recentActivies, setRecentActivities] = useState<any[]>([]);

    const fetchOverviewData = useCallback(async () => {
        setIsLoading(true);
        try {
            // [SENIOR DEV] Usar aetherFetchAll primeiro para paginação completa
            const allDrivers = await aetherFetchAll(COLLECTIONS.DRIVER_STATUS);
            const drivers = allDrivers.filter((d: any) => d.status === 'active');

            const todayStr = getTodayDateStr();

            // [SENIOR DEV] Buscar disponibilidades
            const allAvailabilities = await aetherFetchAll(COLLECTIONS.DRIVER_AVAILABILITY);
            const availabilities = allAvailabilities.filter((a: any) =>
                a.targetDate === todayStr && a.isAvailable === true
            );

            // [SENIOR DEV] Buscar assignments
            const allAssignments = await aetherFetchAll(COLLECTIONS.ASSIGNMENTS);
            const completedAssignments = allAssignments.filter((a: any) =>
                a.status === 'completed'
            );

            // [SENIOR DEV] Recent activities
            const recent = [...allAssignments]
                .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 5);

            setStats({
                totalDrivers: (drivers as any[]).length,
                activeToday: (availabilities as any[]).length,
                completedRuns: (completedAssignments as any[]).filter((a: any) => a.createdAt?.startsWith(todayStr)).length,
            });

            setRecentActivities(recent as any[]);
        } catch (e) {
            console.error('[Overview] Error fetching data:', e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Setup do ciclo de vida: subscribe realtime + polling fallback de 20s.
     * Mantém KPIs e atividades recentes atualizados em tempo real.
     */
    useEffect(() => {
        let unsubscribe: (() => void) | undefined;

        fetchOverviewData();

        // Subscribe realtime: detecta qualquer mudança em assignments
        try {
            unsubscribe = aether.db.collection(COLLECTIONS.ASSIGNMENTS)
                .subscribe(() => {
                    console.log('[Realtime Overview] Mudança detectada, atualizando KPIs...');
                    fetchOverviewData();
                });
        } catch (subErr) {
            console.warn('[Realtime Overview] Subscribe indisponível, usando apenas polling:', subErr);
        }

        // Polling de 20s como fallback
        const interval = setInterval(() => {
            fetchOverviewData();
        }, 20000);

        return () => {
            if (unsubscribe) unsubscribe();
            clearInterval(interval);
        };
    }, [fetchOverviewData]);

    /**
     * [AUDIT FIX — SEC-005] Guard de autorização.
     * Redireciona para login se o usuário não possuir role admin.
     */
    useEffect(() => {
        if (role !== 'admin') router.replace('/login');
    }, [role]);

    return (
        <SafeAreaView className="flex-1 bg-[#13151f]" edges={['top']}>
            <LinearGradient colors={['#1a1d2e', '#13151f', '#0f1118']} style={StyleSheet.absoluteFillObject} />

            {/* Header */}
            <View className="flex-row items-center justify-between px-6 py-4 z-20">
                <View>
                    <Text className="text-2xl font-spaceGroteskBold tracking-tight text-white mb-1">Visão Geral</Text>
                    <Text className="text-xs font-spaceGrotesk text-[#94a3b8] uppercase tracking-[0.1em]">INDICADORES DE OPERAÇÃO</Text>
                </View>
                <View className="w-10 h-10 rounded-full bg-[#1e2332] border border-[#2d3345] items-center justify-center">
                    <TrendingUp color={THEME.colors.primary} size={20} />
                </View>
            </View>

            <ScrollView
                className="flex-1 px-4 z-10"
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={isLoading} onRefresh={fetchOverviewData} tintColor={THEME.colors.primary} />}
            >
                {/* Main KPIs */}
                <View className="flex-row flex-wrap gap-3 mb-6 px-1 mt-2">
                    <View className="w-[47%] bg-[#1e2332] border border-[#2d3345] p-5 rounded-2xl">
                        <View className="w-8 h-8 rounded-full bg-[#13151f] items-center justify-center mb-3 border border-[#2d3345]">
                            <Users color="#e2e8f0" size={16} />
                        </View>
                        <Text className="text-[#64748b] text-[11px] font-spaceGrotesk uppercase tracking-wider mb-1">Tot. Motoristas</Text>
                        <Text className="text-2xl font-spaceGroteskBold text-white">{stats.totalDrivers}</Text>
                    </View>

                    <View className="w-[47%] bg-[#1e2332] border border-[#2d3345] p-5 rounded-2xl relative overflow-hidden">
                        <View className="absolute -right-4 -top-4 w-16 h-16 bg-primary/10 rounded-full" />
                        <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center mb-3 border border-primary/20">
                            <Activity color={THEME.colors.primary} size={16} />
                        </View>
                        <Text className="text-[#64748b] text-[11px] font-spaceGrotesk uppercase tracking-wider mb-1">Ativos Hoje</Text>
                        <Text className="text-2xl font-spaceGroteskBold text-primary">{stats.activeToday}</Text>
                    </View>

                    <View className="w-[47%] bg-[#1e2332] border border-[#2d3345] p-5 rounded-2xl">
                        <View className="w-8 h-8 rounded-full bg-[#13151f] items-center justify-center mb-3 border border-[#2d3345]">
                            <Truck color="#e2e8f0" size={16} />
                        </View>
                        <Text className="text-[#64748b] text-[11px] font-spaceGrotesk uppercase tracking-wider mb-1">Rotas Concluídas</Text>
                        <Text className="text-2xl font-spaceGroteskBold text-white">{stats.completedRuns}</Text>
                    </View>

                    <View className="w-[47%] bg-[#1e2332] border border-[#2d3345] p-5 rounded-2xl items-center justify-center border-dashed opacity-50">
                        <HelpCircle color="#64748b" size={24} className="mb-2" />
                        <Text className="text-[#64748b] text-[11px] font-spaceGrotesk uppercase tracking-wider text-center">Métrica em breve</Text>
                    </View>
                </View>

                {/* Recent Activity Mini-Feed */}
                <View className="mb-28 px-1">
                    <Text className="text-white text-[15px] font-spaceGroteskBold mb-4">Últimas Movimentações</Text>
                    {recentActivies.length === 0 && !isLoading ? (
                        <View className="bg-[#1e2332]/50 border border-[#2d3345] border-dashed rounded-xl p-6 items-center flex-row justify-center gap-3">
                            <Activity color="#64748b" size={16} />
                            <Text className="text-[#64748b] font-spaceGrotesk text-sm">Nenhuma atividade recente.</Text>
                        </View>
                    ) : (
                        recentActivies.map((activity, idx) => (
                            <View key={activity.id || idx} className="flex-row items-center p-4 bg-[#1e2332] border border-[#2d3345] rounded-xl mb-3">
                                <View className="w-10 h-10 rounded-full bg-[#13151f] items-center justify-center border border-[#2d3345]">
                                    <Truck color={THEME.colors.primary} size={16} />
                                </View>
                                <View className="ml-4 flex-1">
                                    <Text className="text-white font-spaceGroteskBold text-[15px]" numberOfLines={1}>{activity.driverName}</Text>
                                    <Text className="text-[#94a3b8] font-spaceGrotesk text-[11px] mt-1" numberOfLines={1}>
                                        {activity.cityName} - {activity.waveLabel} (Doca {activity.dock})
                                    </Text>
                                </View>
                                <Text className="text-[#64748b] text-[11px] font-mono">
                                    {activity.createdAt ? new Date(activity.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                </Text>
                            </View>
                        ))
                    )}
                </View>
            </ScrollView>

            <AdminBottomNav activeTab="overview" />
        </SafeAreaView>
    );
}
