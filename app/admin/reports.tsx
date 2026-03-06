import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, StyleSheet, ActivityIndicator, Image, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { THEME } from '~/src/constants/theme';
import { Target, Search, CheckCircle2, Package, Cloud, UserX, UserCheck, ShieldAlert, BadgeInfo, Calendar } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { aether, aetherFetchAll } from '~/src/lib/aether';
import { COLLECTIONS, getTodayDateStr } from '~/src/lib/collections';
import AdminBottomNav from '~/src/components/AdminBottomNav';
import { ExportButton } from '~/src/components/ExportButton';
import { ExportColumn } from '~/src/lib/export';
import { TextInput } from 'react-native';

interface DriverReport {
    id: string;
    driverName: string;
    driverPlate: string;
    profilePicUrl?: string;
    status: string; // active, blocked
    metrics: {
        routes: number;
        sacas: number;
        offDays: number;
        sdd: number;
    }
}

export default function AdminReportsScreen() {
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [driversReport, setDriversReport] = useState<DriverReport[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [datePeriod, setDatePeriod] = useState<7 | 30 | 90 | 0>(30); // 0 = tudo

    /** Calcula a data limite baseada no período selecionado */
    const periodCutoff = useMemo(() => {
        if (datePeriod === 0) return null;
        const d = new Date();
        d.setDate(d.getDate() - datePeriod);
        d.setHours(0, 0, 0, 0);
        return d;
    }, [datePeriod]);

    const fetchGlobalReports = useCallback(async (showRefreshIndicator = false) => {
        if (showRefreshIndicator) setIsRefreshing(true);
        else setIsLoading(true);

        try {
            // [SENIOR DEV] Single roundtrip unificado - Puxa Base, Rotas e Folgas simultaneamente.
            const [rawDrivers, rawAssignments, rawAvailability] = await Promise.all([
                aetherFetchAll(COLLECTIONS.DRIVER_STATUS) as Promise<any[]>,
                aetherFetchAll(COLLECTIONS.ASSIGNMENTS) as Promise<any[]>,
                aetherFetchAll(COLLECTIONS.DRIVER_AVAILABILITY) as Promise<any[]>
            ]);

            // Map de Profiles para busca de Imagem (Users table) não é diretamente exposto por Aether sem query específica
            // Se houver uma collection de users global com auth, precisaríamos cruzar, mas a Aether DB guarda o profilePic no tenant user ou payload.
            // Para Escalai, vamos procurar o profilePicUrl no _payload do driver status ou users_metadata.

            const reportMap = new Map<string, DriverReport>();

            // Inicializa Motoristas na Batalha
            const activeRawDrivers = rawDrivers.filter(d => {
                const s = d.status || d._payload?.status;
                return s !== 'blocked' && s !== 'deleted'; // Mostra inativos mas nao excluidos/bloqueados
            });

            activeRawDrivers.forEach(d => {
                const payload = d._payload || d;
                const dId = d.user_id || payload.driverId || d.id;

                reportMap.set(dId, {
                    id: dId,
                    driverName: payload.driverName || 'Motorista Sem Nome',
                    driverPlate: payload.driverPlate || 'S/PLACA',
                    profilePicUrl: payload.profilePicUrl || null, // Se constar na collection base
                    status: payload.status || 'active',
                    metrics: { routes: 0, sacas: 0, offDays: 0, sdd: 0 }
                });
            });

            // Indexando Rotas Finalizadas (filtradas por período)
            const assignments = rawAssignments.filter(a => {
                const p = a._payload || a;
                if (p.status !== 'completed' && p.status !== 'confirmed') return false;
                // Filtro de período: só inclui se dentro do range selecionado
                if (periodCutoff && p.createdAt) {
                    const assignDate = new Date(p.createdAt);
                    if (assignDate < periodCutoff) return false;
                }
                return true;
            });

            const routesByDriver = new Map<string, Set<string>>(); // Para cruzar os dias q operou

            assignments.forEach(a => {
                const p = a._payload || a;
                const r = reportMap.get(p.driverId);
                if (r && p.createdAt) {
                    r.metrics.routes++;
                    if (p.sacas) r.metrics.sacas += p.sacas;
                    if (p.isSdd) r.metrics.sdd++;

                    // Salva a data que correu (Pra isolar das folgas)
                    const dateNum = new Date(p.createdAt);
                    const formatted = dateNum.toLocaleDateString('pt-BR');
                    if (!routesByDriver.has(p.driverId)) routesByDriver.set(p.driverId, new Set());
                    routesByDriver.get(p.driverId)?.add(formatted);
                }
            });

            // Indexando Folgas (Dias que o motorista pediu off OU deu green e admin nao escalou)
            rawAvailability.forEach(a => {
                const p = a._payload || a;
                const r = reportMap.get(p.driverId);
                if (r && p.targetDate) {
                    const rawDateParts = p.targetDate.split('-');
                    const parsedDate = new Date(parseInt(rawDateParts[0], 10), parseInt(rawDateParts[1], 10) - 1, parseInt(rawDateParts[2], 10));
                    const dateFormatted = parsedDate.toLocaleDateString('pt-BR');
                    const isInFuture = parsedDate > new Date();

                    const driverRouteDates = routesByDriver.get(p.driverId);
                    const hadRouteThatDay = driverRouteDates ? driverRouteDates.has(dateFormatted) : false;

                    if (!hadRouteThatDay && !isInFuture) {
                        r.metrics.offDays++;
                    }
                }
            });

            // Transforma em Array e Ordena pelo MVP (Maior volume de rotas)
            const list = Array.from(reportMap.values()).sort((a, b) => b.metrics.routes - a.metrics.routes);
            setDriversReport(list);

        } catch (error) {
            console.error('[AdminReports] Erro ao extrair Dashboad Global:', error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [periodCutoff]);

    useEffect(() => {
        fetchGlobalReports();
    }, [fetchGlobalReports]);

    const filteredReports = useMemo(() => {
        const query = searchQuery.toLowerCase();
        return driversReport.filter(d =>
            d.driverName.toLowerCase().includes(query) ||
            d.driverPlate.toLowerCase().includes(query)
        );
    }, [driversReport, searchQuery]);

    /** Altura aproximada de cada card de relatório (180px conteúdo + 16px margin) */
    const REPORT_CARD_HEIGHT = 196;

    /** Render callback memoizado para FlatList */
    const renderReportItem = useCallback(({ item, index }: { item: DriverReport; index: number }) => {
        const initials = item.driverName.substring(0, 2).toUpperCase();

        return (
            <View className="bg-surface rounded-2xl border border-border p-4 mb-4 shadow-sm relative overflow-hidden">
                {/* Ranking Badge Top 3 (Gamification visual) */}
                {index < 3 && !searchQuery && (
                    <View className="absolute top-0 right-0 bg-primary/10 px-3 py-1 rounded-bl-xl border-l border-b border-primary/20">
                        <Text className="text-primary font-spaceGroteskBold text-[10px] tracking-widest uppercase">
                            {index === 0 ? '🏆 TOP 1' : index === 1 ? '⭐ TOP 2' : '🏅 TOP 3'}
                        </Text>
                    </View>
                )}

                <View className="flex-row items-center mb-4 mt-1">
                    {/* FOTO OU INICIAL */}
                    <View className="w-14 h-14 rounded-full border-2 border-primary/30 items-center justify-center bg-background overflow-hidden mr-4">
                        {item.profilePicUrl ? (
                            <Image source={{ uri: item.profilePicUrl }} className="w-full h-full" resizeMode="cover" />
                        ) : (
                            <Text className="text-white font-spaceGroteskBold text-[18px]">{initials}</Text>
                        )}
                    </View>

                    <View className="flex-1">
                        <Text className="text-white text-[16px] font-spaceGroteskBold mb-0.5" numberOfLines={1}>
                            {item.driverName}
                        </Text>
                        <View className="flex-row items-center gap-2">
                            <View className="bg-background px-2 py-0.5 rounded border border-border">
                                <Text className="text-[#94a3b8] text-[10px] uppercase font-spaceGroteskBold tracking-wider">
                                    {item.driverPlate}
                                </Text>
                            </View>
                            {item.status === 'blocked' ? (
                                <View className="flex-row items-center gap-1">
                                    <UserX color="#f87171" size={12} />
                                    <Text className="text-red-400 font-spaceGrotesk text-[10px] uppercase">Bloqueado</Text>
                                </View>
                            ) : (
                                <View className="flex-row items-center gap-1 opacity-70">
                                    <UserCheck color="#10b981" size={12} />
                                    <Text className="text-emerald-400 font-spaceGrotesk text-[10px] uppercase">Ativo</Text>
                                </View>
                            )}
                        </View>
                    </View>
                </View>

                {/* Métricas KPI (Cards Internos) */}
                <View className="flex-row gap-2">
                    <View className="flex-[1.2] bg-[#1a1d2e] border border-border rounded-xl p-3 items-center justify-center">
                        <CheckCircle2 color={THEME.colors.primary} size={18} className="mb-1" />
                        <Text className="text-2xl font-spaceGroteskBold text-white">{item.metrics.routes}</Text>
                        <Text className="text-[9px] uppercase tracking-wider text-[#94a3b8] font-spaceGroteskBold">Corridas</Text>
                    </View>

                    <View className="flex-1 bg-orange-500/5 border border-orange-500/10 rounded-xl p-3 items-center justify-center">
                        <Package color="#f97316" size={18} className="mb-1 opacity-80" />
                        <Text className="text-2xl font-spaceGroteskBold text-orange-500">{item.metrics.sacas}</Text>
                        <Text className="text-[9px] uppercase tracking-wider text-orange-500/70 font-spaceGroteskBold">Sacas</Text>
                    </View>

                    <View className="flex-1 bg-background border border-border rounded-xl p-3 items-center justify-center">
                        <Cloud color="#64748b" size={18} className="mb-1 opacity-60" />
                        <Text className="text-2xl font-spaceGroteskBold text-[#94a3b8]">{item.metrics.offDays}</Text>
                        <Text className="text-[9px] uppercase tracking-wider text-[#64748b] font-spaceGroteskBold">Folgas</Text>
                    </View>
                </View>

                {/* Micro indicador extra se houver SDD */}
                {item.metrics.sdd > 0 && (
                    <View className="mt-3 flex-row items-center justify-center gap-1 opacity-50">
                        <Text className="text-primary text-[10px] uppercase font-spaceGroteskBold tracking-wider">* Fez {item.metrics.sdd} Rota{item.metrics.sdd > 1 ? 's' : ''} SDD (Same Day)</Text>
                    </View>
                )}
            </View>
        );
    }, [searchQuery]);

    /** Extrator de chave estável */
    const reportKeyExtractor = useCallback((item: DriverReport) => item.id, []);

    /** Layout pré-calculado para skip de medição */
    const reportGetItemLayout = useCallback((_data: any, index: number) => ({
        length: REPORT_CARD_HEIGHT,
        offset: REPORT_CARD_HEIGHT * index,
        index,
    }), []);

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <LinearGradient colors={['#1a1d2e', THEME.colors.background]} style={StyleSheet.absoluteFillObject} />

            <View className="flex-1">
                {/* Top Header */}
                <View className="px-6 pt-6 pb-4">
                    <View className="flex-row items-center justify-between mb-2">
                        <View className="flex-row items-center gap-3">
                            <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center border border-primary/20">
                                <Target color={THEME.colors.primary} size={20} />
                            </View>
                            <View>
                                <Text className="text-white font-spaceGroteskBold text-2xl tracking-tight">Relatório de RH</Text>
                                <Text className="text-[#94a3b8] font-spaceGrotesk text-xs uppercase tracking-wider">Histórico Global da Frota</Text>
                            </View>
                        </View>
                        <ExportButton
                            data={filteredReports as unknown as Record<string, unknown>[]}
                            columns={[
                                { key: 'driverName', label: 'Motorista' },
                                { key: 'driverPlate', label: 'Placa' },
                                { key: 'status', label: 'Status' },
                                { key: 'metrics', label: 'Rotas', format: (v: any) => String(v?.routes ?? 0) },
                                { key: 'metrics', label: 'Sacas', format: (v: any) => String(v?.sacas ?? 0) },
                                { key: 'metrics', label: 'SDD', format: (v: any) => String(v?.sdd ?? 0) },
                                { key: 'metrics', label: 'Folgas', format: (v: any) => String(v?.offDays ?? 0) },
                            ] as ExportColumn<Record<string, unknown>>[]}
                            title="Relatório de RH — Frota Escalai"
                            filename={`relatorio_frota_${getTodayDateStr()}`}
                        />
                    </View>

                    {/* Barra de Busca Dinâmica */}
                    <View className="mt-4 relative justify-center">
                        <TextInput
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            placeholder="Buscar motorista por placa ou nome..."
                            placeholderTextColor={THEME.colors.textMuted}
                            className="w-full bg-[#1e2332] border border-border rounded-xl py-3 pl-11 pr-4 text-white font-spaceGrotesk text-[13px]"
                        />
                        <View className="absolute left-4 opacity-50">
                            <Search color="#94a3b8" size={18} />
                        </View>
                    </View>

                    {/* Chips de Período */}
                    <View className="flex-row gap-2 mt-3">
                        {([7, 30, 90, 0] as const).map(period => {
                            const isActive = datePeriod === period;
                            const label = period === 0 ? 'Tudo' : `${period}d`;
                            return (
                                <TouchableOpacity
                                    key={period}
                                    onPress={() => setDatePeriod(period)}
                                    className={`flex-1 py-2.5 rounded-xl items-center border ${isActive
                                        ? 'bg-primary/15 border-primary/30'
                                        : 'bg-surface border-border'
                                        }`}
                                >
                                    <Text className={`text-[11px] font-spaceGroteskBold uppercase tracking-wider ${isActive ? 'text-primary' : 'text-[#94a3b8]'
                                        }`}>{label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                {isLoading ? (
                    <View className="flex-1 justify-center items-center">
                        <ActivityIndicator size="large" color={THEME.colors.primary} />
                        <Text className="text-[#94a3b8] mt-4 font-spaceGrotesk">Compilando dados de campo...</Text>
                    </View>
                ) : (
                    <FlatList
                        data={filteredReports}
                        keyExtractor={reportKeyExtractor}
                        renderItem={renderReportItem}
                        getItemLayout={reportGetItemLayout}
                        className="flex-1 px-5"
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 110 }}
                        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => fetchGlobalReports(true)} tintColor={THEME.colors.primary} />}
                        ListEmptyComponent={
                            <View className="py-20 items-center justify-center">
                                <BadgeInfo color="#475569" size={48} />
                                <Text className="text-center text-slate-400 font-spaceGrotesk mt-4">Nenhum motorista bateu com o filtro.</Text>
                            </View>
                        }
                        initialNumToRender={5}
                        maxToRenderPerBatch={8}
                        windowSize={5}
                        removeClippedSubviews
                    />
                )}
            </View>

            <AdminBottomNav activeTab="reports" />
        </SafeAreaView>
    );
}
