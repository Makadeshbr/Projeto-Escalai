import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, Dimensions, StyleSheet } from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import { SafeAreaView } from 'react-native-safe-area-context';
import { THEME } from '~/src/constants/theme';
import { Users, Truck, Activity, TrendingUp, Package } from 'lucide-react-native';
import { DriverAvatar } from '~/src/components/ui/DriverAvatar';
import { LinearGradient } from 'expo-linear-gradient';
import { aether, aetherFetchAll } from '~/src/lib/aether';
import { useAuthStore } from '~/src/store/auth';
import { COLLECTIONS, getTodayDateStr } from '~/src/lib/collections';
import AdminBottomNav from '~/src/components/AdminBottomNav';
import { router } from 'expo-router';
import { SkeletonList } from '~/src/components/ui/Skeleton';
import { useForegroundRefresh } from '~/src/hooks/useForegroundRefresh';
import { useRealtimeSubscribe } from '~/src/hooks/useRealtimeSubscribe';
import { logger } from '~/src/lib/logger';

export default function AdminOverviewScreen() {
    const { role } = useAuthStore();
    const [isLoading, setIsLoading] = useState(true);
    const [stats, setStats] = useState({
        totalDrivers: 0,
        activeToday: 0,
        completedRuns: 0,
    });
    const [recentActivies, setRecentActivities] = useState<any[]>([]);
    const [driverAvatars, setDriverAvatars] = useState<Record<string, string>>({});
    const [weeklyData, setWeeklyData] = useState<{ labels: string[]; data: number[] }>({ labels: [], data: [] });
    const [totalSacas, setTotalSacas] = useState(0);

    const fetchOverviewData = useCallback(async () => {
        setIsLoading(true);
        try {
            // [SENIOR DEV] Usar aetherFetchAll primeiro para paginação completa
            const allDrivers = await aetherFetchAll(COLLECTIONS.DRIVER_STATUS);
            const drivers = allDrivers.filter((d: any) => d.status === 'active');

            // Build avatar lookup map from driver_status
            const avatarLookup: Record<string, string> = {};
            (allDrivers as any[]).forEach((d: any) => {
                if (d.user_id && d.avatarUrl) avatarLookup[d.user_id] = d.avatarUrl;
            });
            setDriverAvatars(avatarLookup);

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

            // [FIX] Mostra TODAS as movimentações de hoje — não apenas 5.
            // Anteriormente .slice(0,5) truncava para 5 itens, omitindo motoristas despachados.
            const recent = [...allAssignments]
                .filter((a: any) => {
                    // [SENIOR FIX - HISTORY PERSISTENCE] Oculta rotas que o Admin marcou como "Limpar" no Dashboard Principal
                    if (a.archived === true) return false;
                    if (!a.createdAt) return false;
                    const createdDate = new Date(a.createdAt);
                    const year = createdDate.getFullYear();
                    const month = String(createdDate.getMonth() + 1).padStart(2, '0');
                    const day = String(createdDate.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}` === todayStr;
                })
                .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            setStats({
                totalDrivers: (drivers as any[]).length,
                activeToday: (availabilities as any[]).length,
                completedRuns: (completedAssignments as any[]).filter((a: any) => a.createdAt?.startsWith(todayStr)).length,
            });

            setRecentActivities(recent as any[]);

            // Calcular dados da semana (7 dias) para BarChart
            const days: string[] = [];
            const counts: number[] = [];
            let sacasTotal = 0;
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dateStr = d.toISOString().slice(0, 10);
                const dayLabel = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').substring(0, 3);
                days.push(dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1));
                const count = (allAssignments as any[]).filter((a: any) =>
                    a.createdAt?.startsWith(dateStr) && (a.status === 'completed' || a.status === 'confirmed')
                ).length;
                counts.push(count);
            }
            (allAssignments as any[]).forEach((a: any) => { sacasTotal += Number(a.sacas) || 0; });
            setWeeklyData({ labels: days, data: counts });
            setTotalSacas(sacasTotal);
        } catch (e) {
            logger.error('[Overview]', 'Erro ao buscar dados:', e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Subscribe realtime centralizado via useRealtimeSubscribe.
     * Detecta qualquer mudança em assignments e atualiza KPIs.
     */
    useRealtimeSubscribe({
        collection: COLLECTIONS.ASSIGNMENTS,
        tag: '[Overview]',
        debounceMs: 1500,
        onEvent: useCallback(() => {
            logger.debug('[Overview]', 'Mudança detectada, atualizando KPIs...');
            fetchOverviewData();
        }, [fetchOverviewData]),
    });

    /**
     * Setup inicial + polling de 30s como safety net.
     */
    useEffect(() => {
        fetchOverviewData();

        const interval = setInterval(() => {
            fetchOverviewData();
        }, 30000);

        return () => {
            clearInterval(interval);
        };
    }, [fetchOverviewData]);

    // [SENIOR FIX] Resgata os dados instantaneamente quando o celular sai do bolso/minimize
    useForegroundRefresh(fetchOverviewData);

    /**
     * [AUDIT FIX — SEC-005] Guard de autorização.
     * Redireciona para login se o usuário não possuir role admin.
     */
    useEffect(() => {
        if (role !== 'admin') router.replace('/login');
    }, [role]);

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <LinearGradient colors={['#1a1d2e', THEME.colors.background, THEME.colors.headerBackground]} style={StyleSheet.absoluteFillObject} />

            {/* Header */}
            <View className="flex-row items-center justify-between px-6 py-4 z-20">
                <View>
                    <Text className="text-2xl font-spaceGroteskBold tracking-tight text-white mb-1">Visão Geral</Text>
                    <Text className="text-xs font-spaceGrotesk text-[#94a3b8] uppercase tracking-[0.1em]">INDICADORES DE OPERAÇÃO</Text>
                </View>
                <View className="w-10 h-10 rounded-full bg-surface border border-border items-center justify-center">
                    <TrendingUp color={THEME.colors.primary} size={20} />
                </View>
            </View>

            <FlatList
                className="flex-1 px-4 z-10"
                contentContainerStyle={{ paddingBottom: 100 }}
                showsVerticalScrollIndicator={false}
                data={recentActivies}
                keyExtractor={(item, index) => item.id || String(index)}
                refreshControl={<RefreshControl refreshing={isLoading} onRefresh={fetchOverviewData} tintColor={THEME.colors.primary} />}
                initialNumToRender={8}
                maxToRenderPerBatch={10}
                windowSize={5}
                removeClippedSubviews={true}
                ListHeaderComponent={
                    <View>
                        {/* Main KPIs */}
                        <View className="flex-row flex-wrap gap-3 mb-6 px-1 mt-2">
                            <View className="w-[47%] bg-surface border border-border p-5 rounded-2xl">
                                <View className="w-8 h-8 rounded-full bg-background items-center justify-center mb-3 border border-border">
                                    <Users color="#e2e8f0" size={16} />
                                </View>
                                <Text className="text-text-muted text-[11px] font-spaceGrotesk uppercase tracking-wider mb-1">Tot. Motoristas</Text>
                                <Text className="text-2xl font-spaceGroteskBold text-white">{stats.totalDrivers}</Text>
                            </View>

                            <View className="w-[47%] bg-surface border border-border p-5 rounded-2xl relative overflow-hidden">
                                <View className="absolute -right-4 -top-4 w-16 h-16 bg-primary/10 rounded-full" />
                                <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center mb-3 border border-primary/20">
                                    <Activity color={THEME.colors.primary} size={16} />
                                </View>
                                <Text className="text-text-muted text-[11px] font-spaceGrotesk uppercase tracking-wider mb-1">Ativos Hoje</Text>
                                <Text className="text-2xl font-spaceGroteskBold text-primary">{stats.activeToday}</Text>
                            </View>

                            <View className="w-[47%] bg-surface border border-border p-5 rounded-2xl">
                                <View className="w-8 h-8 rounded-full bg-background items-center justify-center mb-3 border border-border">
                                    <Truck color="#e2e8f0" size={16} />
                                </View>
                                <Text className="text-text-muted text-[11px] font-spaceGrotesk uppercase tracking-wider mb-1">Rotas Concluídas</Text>
                                <Text className="text-2xl font-spaceGroteskBold text-white">{stats.completedRuns}</Text>
                            </View>

                            <View className="w-[47%] bg-surface border border-border p-5 rounded-2xl">
                                <View className="w-8 h-8 rounded-full bg-orange-500/10 items-center justify-center mb-3 border border-orange-500/20">
                                    <Package color="#f97316" size={16} />
                                </View>
                                <Text className="text-text-muted text-[11px] font-spaceGrotesk uppercase tracking-wider mb-1">Total Sacas</Text>
                                <Text className="text-2xl font-spaceGroteskBold text-white">{totalSacas.toLocaleString('pt-BR')}</Text>
                            </View>
                        </View>

                        {/* Chart — Rotas últimos 7 dias */}
                        {weeklyData.labels.length > 0 && (
                            <View className="mb-6 px-1">
                                <Text className="text-white text-[15px] font-spaceGroteskBold mb-3">Rotas / 7 Dias</Text>
                                <View className="bg-surface border border-border rounded-2xl overflow-hidden py-3">
                                    <BarChart
                                        data={{
                                            labels: weeklyData.labels,
                                            datasets: [{ data: weeklyData.data.every(v => v === 0) ? [0.1] : weeklyData.data }],
                                        }}
                                        width={Dimensions.get('window').width - 48}
                                        height={180}
                                        yAxisLabel=""
                                        yAxisSuffix=""
                                        fromZero
                                        showValuesOnTopOfBars
                                        withInnerLines={false}
                                        chartConfig={{
                                            backgroundColor: 'transparent',
                                            backgroundGradientFrom: '#1a1d2e',
                                            backgroundGradientTo: '#1a1d2e',
                                            decimalPlaces: 0,
                                            color: (opacity = 1) => `rgba(96, 165, 250, ${opacity})`,
                                            labelColor: () => '#94a3b8',
                                            barPercentage: 0.5,
                                            propsForLabels: { fontSize: 10, fontFamily: 'SpaceGrotesk_400Regular' },
                                            propsForBackgroundLines: { stroke: '#2d3345' },
                                        }}
                                        style={{ borderRadius: 16, marginLeft: -6 }}
                                    />
                                </View>
                            </View>
                        )}

                        <Text className="text-white text-[15px] font-spaceGroteskBold mb-4 px-1 mt-2">Últimas Movimentações</Text>
                    </View>
                }
                ListEmptyComponent={
                    <View className="px-1">
                        {isLoading ? (
                            <SkeletonList count={3} />
                        ) : (
                            <View className="bg-surface/50 border border-border border-dashed rounded-xl p-6 items-center flex-row justify-center gap-3">
                                <Activity color={THEME.colors.textMuted} size={16} />
                                <Text className="text-text-muted font-spaceGrotesk text-sm">Nenhuma atividade recente.</Text>
                            </View>
                        )}
                    </View>
                }
                renderItem={({ item: activity }) => (
                    <View className="flex-row items-center p-4 bg-surface border border-border rounded-xl mb-3 mx-1">
                        <DriverAvatar avatarUrl={driverAvatars[activity.driverId]} size={40} />
                        <View className="ml-4 flex-1">
                            <Text className="text-white font-spaceGroteskBold text-[15px]" numberOfLines={1}>{activity.driverName}</Text>
                            <Text className="text-[#94a3b8] font-spaceGrotesk text-[11px] mt-1" numberOfLines={1}>
                                {activity.cityName} - {activity.waveLabel} (Doca {activity.dock})
                            </Text>
                        </View>
                        <Text className="text-text-muted text-[11px] font-mono">
                            {activity.createdAt ? new Date(activity.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </Text>
                    </View>
                )}
            />

            <AdminBottomNav activeTab="overview" />
        </SafeAreaView>
    );
}
