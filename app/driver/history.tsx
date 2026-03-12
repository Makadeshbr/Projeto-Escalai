import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { THEME } from '~/src/constants/theme';
import { History, FileText, Calendar, Cloud, Navigation, Package, Zap, ArrowRight, ArrowDownToLine, MapPin } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import DriverBottomNav from '~/src/components/DriverBottomNav';
import { useAuthStore } from '~/src/store/auth';
import { aether, aetherFetchAll } from '~/src/lib/aether';
import { COLLECTIONS, Assignment, DriverAvailability, extractBrazilDateStr } from '~/src/lib/collections';
import { validateArray, AssignmentSchema, DriverAvailabilitySchema } from '~/src/lib/schemas';
import { SkeletonList } from '~/src/components/ui/Skeleton';
import { AssignmentDetailModal } from '~/src/components/AssignmentDetailModal';
import { useForegroundRefresh } from '~/src/hooks/useForegroundRefresh';
import { logger } from '~/src/lib/logger';

interface TimelineItem {
    type: 'route' | 'off';
    dateObj: Date;
    dateLabel: string;
    dayLabel: string; // Ex: 'Segunda-feira'
    isSameDay: boolean; // Flag para SDD
    data: Assignment | DriverAvailability;
}

/**
 * Componente extraído para tab de filtro.
 * Usa StyleSheet em vez de className dinâmico para evitar crash do NativeWind CSS interop.
 */
function FilterTab({ label, isActive, onPress }: { label: string; isActive: boolean; onPress: () => void }) {
    return (
        <TouchableOpacity
            onPress={onPress}
            style={[styles.filterTab, isActive && styles.filterTabActive]}
        >
            <Text style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
                {label}
            </Text>
        </TouchableOpacity>
    );
}

/**
 * Header com métricas do motorista.
 * Extraído de inline renderHeaderMetrics para evitar crash do NativeWind CSS interop.
 */
function HeaderMetrics({ stats }: { stats: { routesCount: number; offDaysCount: number; totalSacas: number; sddCount: number } }) {
    return (
        <View className="mb-6">
            <View className="flex-row items-end gap-2 mb-4">
                <Text className="text-[28px] leading-tight font-spaceGroteskBold tracking-tight text-white">Extrato Operacional</Text>
            </View>

            {/* Main Stats Cards */}
            <View className="flex-row gap-3">
                <View className="flex-[1.5] bg-[#2a2d3d] border border-border p-4 rounded-2xl relative overflow-hidden shadow-lg">
                    <View className="absolute top-0 right-0 w-16 h-16 bg-primary/10 rounded-bl-full" />
                    <View className="w-8 h-8 rounded-full bg-primary/20 items-center justify-center mb-2 border border-primary/30">
                        <Navigation color={THEME.colors.primary} size={16} />
                    </View>
                    <Text className="text-[32px] font-spaceGroteskBold text-white">{stats.routesCount}</Text>
                    <Text className="text-xs text-[#94a3b8] font-spaceGrotesk uppercase tracking-wider mt-1">Viagens Realizadas</Text>
                </View>

                <View className="flex-1 flex-col gap-3">
                    <View className="flex-1 bg-surface border border-border px-3 py-2 rounded-2xl flex-row items-center justify-between overflow-hidden">
                        <View className="flex-1 pr-2">
                            <Text className="text-xl font-spaceGroteskBold text-orange-500">{stats.totalSacas}</Text>
                            <Text className="text-[9px] text-[#94a3b8] font-spaceGrotesk uppercase tracking-wider mt-0.5 leading-tight">Sacas Levadas</Text>
                        </View>
                        <Package color="#f97316" opacity={0.5} size={18} />
                    </View>
                    <View className="flex-1 bg-surface border border-border px-3 py-2 rounded-2xl flex-row items-center justify-between overflow-hidden">
                        <View className="flex-1 pr-2">
                            <Text className="text-xl font-spaceGroteskBold text-slate-300">{stats.offDaysCount}</Text>
                            <Text className="text-[9px] text-[#94a3b8] font-spaceGrotesk uppercase tracking-wider mt-0.5 leading-tight">Dias Folga/Casa</Text>
                        </View>
                        <Calendar color="#cbd5e1" opacity={0.3} size={18} />
                    </View>
                </View>
            </View>
        </View>
    );
}

/**
 * Componente extraído para card individual da timeline.
 * Usa StyleSheet em vez de className dinâmico para evitar crash do NativeWind CSS interop.
 */
const TimelineCard = React.memo(function TimelineCard({ item, isLast, onPress }: { item: TimelineItem; isLast: boolean; onPress?: (assignment: Assignment) => void }) {
    const isRoute = item.type === 'route';

    const cardContent = (
        <View className="flex-row relative mb-4">
            {/* Indicador Linha do Tempo (Connector) */}
            <View className="w-12 items-center mr-2 z-10">
                <Text className="text-[11px] font-spaceGroteskBold text-[#94a3b8] mb-1">{item.dateLabel.substring(0, 5)}</Text>

                <View style={[
                    styles.timelineDot,
                    isRoute ? styles.timelineDotRoute : styles.timelineDotOff,
                ]}>
                    {isRoute ? (
                        <ArrowRight color={THEME.colors.primary} size={14} />
                    ) : (
                        <ArrowDownToLine color="#64748b" size={14} />
                    )}
                </View>

                {/* Fio conector */}
                {!isLast && (
                    <View style={styles.timelineConnector} />
                )}
            </View>

            {/* Card de Conteúdo */}
            <View className="flex-1 pt-4 pb-1">
                <View style={[
                    styles.timelineCard,
                    isRoute ? styles.timelineCardRoute : styles.timelineCardOff,
                ]}>
                    {isRoute ? (
                        <>
                            <View className="flex-row items-center justify-between mb-3">
                                <View className="bg-[#1e2332] px-2 py-1 rounded border border-border">
                                    <Text className="text-[10px] text-[#94a3b8] uppercase font-spaceGroteskBold tracking-wider">
                                        {(item.data as Assignment).waveLabel}
                                    </Text>
                                </View>

                                <View className="flex-row gap-2">
                                    {(item.data as Assignment).sacas ? (
                                        <View className="flex-row items-center gap-1 bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">
                                            <Text className="text-orange-500 text-[10px] uppercase font-spaceGroteskBold tracking-widest">+ {(item.data as Assignment).sacas} SACAS</Text>
                                        </View>
                                    ) : null}
                                    {(item.data as Assignment).status === 'in_progress' && (
                                        <View className="flex-row items-center gap-1 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                                            <Navigation color="#3b82f6" size={10} />
                                            <Text className="text-blue-500 text-[10px] uppercase font-spaceGroteskBold tracking-widest">EM TRÂNSITO</Text>
                                        </View>
                                    )}
                                    {item.isSameDay && (
                                        <View className="flex-row items-center gap-1 bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                                            <Zap color={THEME.colors.primary} size={10} />
                                            <Text className="text-primary text-[10px] uppercase font-spaceGroteskBold tracking-widest">SDD</Text>
                                        </View>
                                    )}
                                </View>
                            </View>

                            <View className="flex-row items-center gap-2 mb-1">
                                <MapPin color="#cbd5e1" size={16} />
                                <Text className="text-lg font-spaceGroteskBold text-white shrink" numberOfLines={1}>
                                    {(item.data as Assignment).cityName}
                                </Text>
                            </View>

                            <View className="flex-row items-center mt-2 justify-between">
                                <Text className="text-[#94a3b8] text-xs font-spaceGrotesk uppercase">
                                    Doca {(item.data as Assignment).dock}
                                </Text>
                                {(item.data as Assignment).routeLabel ? (
                                    <Text className="text-[#94a3b8] text-xs font-spaceGrotesk uppercase shrink ml-2" numberOfLines={1}>
                                        Rota: <Text className="text-white font-spaceGroteskBold">{(item.data as Assignment).routeLabel}</Text>
                                    </Text>
                                ) : null}
                            </View>
                        </>
                    ) : (
                        <View className="flex-row items-center gap-3 py-1">
                            <View className="w-10 h-10 rounded-full bg-background items-center justify-center border border-border">
                                <Cloud color="#64748b" size={18} />
                            </View>
                            <View className="flex-1">
                                <Text className="text-slate-300 font-spaceGroteskBold text-[15px] mb-0.5">Em Casa ({(item.data as DriverAvailability).isAvailable ? 'Sem Escala' : 'Off'})</Text>
                                <Text className="text-slate-500 font-spaceGrotesk text-xs">{(item.data as DriverAvailability).isAvailable ? 'Você preencheu escala, mas a torre não alocou viagem.' : 'Você sinalizou indisponibilidade para este dia.'}</Text>
                            </View>
                        </View>
                    )}
                </View>
            </View>
        </View>
    );

    // Wrap em TouchableOpacity se for rota (permite abrir detalhes)
    if (isRoute && onPress) {
        return (
            <TouchableOpacity activeOpacity={0.7} onPress={() => onPress(item.data as Assignment)}>
                {cardContent}
            </TouchableOpacity>
        );
    }
    return cardContent;
});

export default function DriverHistoryScreen() {
    const { user } = useAuthStore();
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [historyItems, setHistoryItems] = useState<TimelineItem[]>([]);
    const [visibleCount, setVisibleCount] = useState(20);

    // Filtros
    const [activeFilter, setActiveFilter] = useState<'all' | 'route' | 'off'>('all');
    const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);

    const fetchHistory = useCallback(async (showRefreshIndicator = false) => {
        if (!user) return;
        if (showRefreshIndicator) setIsRefreshing(true);
        else setIsLoading(true);

        try {
            setVisibleCount(20); // Reset paginação ao recarregar
            // [SENIOR DEV] Buscamos de forma agnóstica em ambas as entidades cruciais de RH.
            const [allRawAssignments, allRawAvailability] = await Promise.all([
                aetherFetchAll(COLLECTIONS.ASSIGNMENTS) as Promise<any[]>,
                aetherFetchAll(COLLECTIONS.DRIVER_AVAILABILITY) as Promise<any[]>
            ]);

            const validatedAssignments = validateArray(allRawAssignments, AssignmentSchema, 'assignments');
            const validatedAvailability = validateArray(allRawAvailability, DriverAvailabilitySchema, 'driver_availability');

            const allAssignments = validatedAssignments.filter(item =>
                // No extrato do Motorista, a Rota precisa aparecer caso "ele rodou com ela e entregou" (completed/confirmed)
                // OU 
                // Se a rota está "Em trânsito" atualmente
                // OU
                // Caso o admin tenha feito o encerramento do dia (Limpar -> archived: true), de modo que o motorista tenha os comprovantes no App a vida inteira.
                item.driverId === user.id && (item.status === 'completed' || item.status === 'confirmed' || item.status === 'in_progress' || item.archived === true)
            );

            const allAvailability = validatedAvailability.filter(item =>
                item.driverId === user.id
            );

            const timeline: TimelineItem[] = [];

            // 1. Processar Rotas Efetivas (ASSIGNMENTS)
            if (allAssignments.length > 0) {
                allAssignments.forEach((doc: any) => {
                    const assignment = (doc._payload || doc) as Assignment;
                    // Ignora rotas ativas (in_progress, pending) - Só finalizadas/validadas entram no extrato.
                    if (assignment.createdAt) {
                        const brtDateStr = extractBrazilDateStr(assignment.createdAt);
                        if (brtDateStr) {
                            const dateParts = brtDateStr.split('-');
                            const safeDate = new Date(parseInt(dateParts[0], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10));
                            
                            timeline.push({
                                type: 'route',
                                dateObj: safeDate,
                                dateLabel: safeDate.toLocaleDateString('pt-BR'),
                                dayLabel: safeDate.toLocaleDateString('pt-BR', { weekday: 'long' }),
                                isSameDay: assignment.isSdd || false,
                                data: assignment
                            });
                        }
                    }
                });
            }

            // 2. Processar Datas Declaradas (DRIVER_AVAILABILITY)
            // Extrai datas únicas para não duplicar com rotas caso o cara tenha dado "Available" e rodado (Pois o que importa na Timeline é que a Rota 'Route' sobrepõe o 'Available')
            const routeDates = new Set(timeline.map(t => t.dateLabel));

            if (allAvailability.length > 0) {
                allAvailability.forEach((doc: any) => {
                    const availability = (doc._payload || doc) as DriverAvailability;

                    // Tratamento de fuso / parser robusto
                    const rawDateParts = availability.targetDate.split('-'); // 2026-02-21
                    const parsedDate = new Date(parseInt(rawDateParts[0], 10), parseInt(rawDateParts[1], 10) - 1, parseInt(rawDateParts[2], 10));
                    const dateFormatted = parsedDate.toLocaleDateString('pt-BR');

                    // Regra de Negócio Extrato RH:
                    // Se o motorista marcou "Não Disponível" (isAvailable=false), ele FOLGOU por escolha e entra no extrato.
                    // Se ele marcou "Disponível" (isAvailable=true) MAS não fez nenhuma rota naquele dia (dateFormatted not in routeDates), ele FICOU EM CASA por falta de rota da operação.

                    const hadRouteThatDay = routeDates.has(dateFormatted);
                    const isInFuture = parsedDate > new Date(); // Ignora folgas do amanhã, o extrato é retroativo.

                    if (!hadRouteThatDay && !isInFuture) {
                        timeline.push({
                            type: 'off',
                            dateObj: parsedDate,
                            dateLabel: dateFormatted,
                            dayLabel: parsedDate.toLocaleDateString('pt-BR', { weekday: 'long' }),
                            isSameDay: false,
                            data: availability
                        });
                    }
                });
            }

            // 3. Ordem Cronológica Decrescente (Mais recente primeiro)
            timeline.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

            // 4. Salva todos no estado (a paginação vira controle de visualização)
            setHistoryItems(timeline);

        } catch (error) {
            logger.error('[History]', 'Falha ao compilar métricas RH:', error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [user]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    // [SENIOR FIX] Recupera os dados instantaneamente quando o celular volta para foreground
    useForegroundRefresh(fetchHistory);

    // Métricas Calculadas In-Memory
    const stats = useMemo(() => {
        let routesCount = 0;
        let offDaysCount = 0;
        let totalSacas = 0;
        let sddCount = 0;

        historyItems.forEach(item => {
            if (item.type === 'route') {
                routesCount++;
                const assign = item.data as Assignment;
                if (assign.sacas) totalSacas += assign.sacas;
                if (assign.isSdd) sddCount++;
            } else {
                offDaysCount++;
            }
        });

        return { routesCount, offDaysCount, totalSacas, sddCount };
    }, [historyItems]);

    // Filtros visuais
    const filteredItems = useMemo(() => {
        if (activeFilter === 'all') return historyItems;
        return historyItems.filter(item => item.type === activeFilter);
    }, [historyItems, activeFilter]);

    const visibleItems = useMemo(() => {
        return filteredItems.slice(0, visibleCount);
    }, [filteredItems, visibleCount]);

    const handleLoadMore = () => {
        setVisibleCount(prev => prev + 20);
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <LinearGradient colors={['#1a1d2e', THEME.colors.background]} style={StyleSheet.absoluteFillObject} />

            <View className="flex-1">
                {isLoading ? (
                    <View className="flex-1 px-5 pt-6">
                        <View className="mb-6">
                            <SkeletonList count={5} />
                        </View>
                    </View>
                ) : (
                    <ScrollView
                        className="flex-1 px-5 pt-6 z-10"
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 110 }}
                        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => fetchHistory(true)} tintColor={THEME.colors.primary} />}
                    >
                        <HeaderMetrics stats={stats} />

                        {/* Filter Tabs */}
                        <View style={styles.filterContainer}>
                            <FilterTab label="Todos" isActive={activeFilter === 'all'} onPress={() => setActiveFilter('all')} />
                            <FilterTab label="Rotas" isActive={activeFilter === 'route'} onPress={() => setActiveFilter('route')} />
                            <FilterTab label="Casa/Folgas" isActive={activeFilter === 'off'} onPress={() => setActiveFilter('off')} />
                        </View>

                        {/* Timeline Feed */}
                        <View className="mt-2">
                            {filteredItems.length === 0 ? (
                                <View className="py-12 items-center justify-center">
                                    <FileText color="#475569" size={48} />
                                    <Text className="text-center text-slate-400 font-spaceGrotesk mt-4">Nenhum histórico encontrado para o filtro selecionado.</Text>
                                </View>
                            ) : (
                                <>
                                    {visibleItems.map((item, index) => (
                                        <TimelineCard
                                            key={(item.data as any).id || (item.data as any)._id || `${item.type}-${item.dateObj.getTime()}-${index}`}
                                            item={item}
                                            isLast={index === visibleItems.length - 1 && visibleItems.length === filteredItems.length}
                                            onPress={(assignment) => setSelectedAssignment(assignment)}
                                        />
                                    ))}

                                    {visibleItems.length < filteredItems.length && (
                                        <TouchableOpacity
                                            onPress={handleLoadMore}
                                            className="mt-4 mb-2 py-3 px-6 bg-surface/80 border border-border rounded-xl items-center flex-row justify-center gap-2 self-center"
                                        >
                                            <Text className="text-[#94a3b8] font-spaceGroteskBold text-sm uppercase tracking-wider">Carregar mais antigas</Text>
                                        </TouchableOpacity>
                                    )}
                                </>
                            )}
                        </View>

                    </ScrollView>
                )}
            </View>

            <AssignmentDetailModal
                visible={!!selectedAssignment}
                onClose={() => setSelectedAssignment(null)}
                assignment={selectedAssignment}
            />

            <DriverBottomNav activeTab="profile" />
        </SafeAreaView>
    );
}

/**
 * Estilos nativos para o TimelineCard.
 * Usa StyleSheet em vez de className dinâmico nos elementos que
 * causavam crash no NativeWind CSS interop (NavigationContext).
 */
const styles = StyleSheet.create({
    timelineDot: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
    },
    timelineDotRoute: {
        backgroundColor: 'rgba(255,230,0,0.2)',
        borderWidth: 1,
        borderColor: 'rgba(255,230,0,0.3)',
    },
    timelineDotOff: {
        backgroundColor: '#1e2332',
        borderWidth: 1,
        borderColor: '#2d3345',
    },
    timelineConnector: {
        width: 1.5,
        backgroundColor: '#2a2d3d',
        flex: 1,
        marginTop: 8,
        marginBottom: -16,
    },
    timelineCard: {
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
    },
    timelineCardRoute: {
        backgroundColor: '#212330',
        borderColor: '#31354a',
    },
    timelineCardOff: {
        backgroundColor: 'rgba(30,35,50,0.5)',
        borderColor: '#2d3345',
        borderStyle: 'dashed',
    },
    filterContainer: {
        flexDirection: 'row',
        backgroundColor: '#1e2332',
        padding: 4,
        borderRadius: 12,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#2d3345',
    },
    filterTab: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 8,
        alignItems: 'center' as const,
    },
    filterTabActive: {
        backgroundColor: '#212330',
        borderWidth: 1,
        borderColor: 'rgba(45,51,69,0.5)',
    },
    filterTabText: {
        fontSize: 13,
        fontFamily: 'SpaceGrotesk-Bold',
        textTransform: 'uppercase' as const,
        color: '#64748b',
    },
    filterTabTextActive: {
        color: '#ffffff',
    },
});
