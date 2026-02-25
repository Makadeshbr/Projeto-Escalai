import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, SafeAreaView, Dimensions, StyleSheet, Animated as RNAnimated } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, RefreshCw, User, CheckCircle2, Truck, MapPin, Navigation, AlertCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AdminBottomNav from '~/src/components/AdminBottomNav';
import { useMonitorData, RouteGroup } from '~/src/hooks/useMonitorData';
import { Assignment, COLLECTIONS } from '~/src/lib/collections';
import { THEME } from '~/src/constants/theme';
import { DashboardActionModal } from '~/src/components/dashboard/DashboardActionModal';
import { DriverAvatar } from '~/src/components/ui/DriverAvatar';
import { aetherFetchAll } from '~/src/lib/aether';

type FilterType = 'all' | 'wave_1' | 'wave_2' | 'transit';

/**
 * Componente atomizado para card de motorista com animação de pulso.
 * Quando `shouldPulse` é true (doca livre pelo motorista anterior),
 * a borda do card pulsa em verde para chamar atenção do admin.
 */
function DriverCard({
    assignment,
    shouldPulse,
    onReleaseDock,
    avatarUrl,
}: {
    assignment: Assignment;
    shouldPulse: boolean;
    onReleaseDock: (a: Assignment) => void;
    avatarUrl?: string;
}) {
    const isDeparted = assignment.dockStatus === 'departed';
    const isLiberated = assignment.dockStatus === 'liberated';
    const isWaiting = assignment.dockStatus === 'waiting';

    // Animação de pulso nativa (borda + glow)
    const pulseAnim = useRef(new RNAnimated.Value(0)).current;

    useEffect(() => {
        if (shouldPulse) {
            const loop = RNAnimated.loop(
                RNAnimated.sequence([
                    RNAnimated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: false }),
                    RNAnimated.timing(pulseAnim, { toValue: 0, duration: 800, useNativeDriver: false }),
                ])
            );
            loop.start();
            return () => loop.stop();
        } else {
            pulseAnim.setValue(0);
        }
    }, [shouldPulse, pulseAnim]);

    // Cor de borda animada: transparente ↔ verde brilhante
    const animatedBorderColor = pulseAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['rgba(255,255,255,0.05)', 'rgba(34,197,94,0.8)'],
    });

    // Sombra animada (glow verde)
    const animatedShadowOpacity = pulseAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.6],
    });

    const cardAnimStyle = shouldPulse
        ? {
            borderColor: animatedBorderColor,
            borderWidth: 2,
            shadowColor: '#22c55e',
            shadowOpacity: animatedShadowOpacity,
            shadowRadius: 16,
        }
        : {};

    return (
        <RNAnimated.View style={[styles.card, isDeparted && { opacity: 0.6 }, cardAnimStyle]}>
            {/* Stripe lateral indicando estado */}
            {isWaiting && !shouldPulse && (
                <LinearGradient
                    colors={[THEME.colors.primary, THEME.colors.info]}
                    style={styles.cardStripe}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                />
            )}
            {isWaiting && shouldPulse && (
                <LinearGradient
                    colors={['#22c55e', '#4ade80']}
                    style={styles.cardStripe}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                />
            )}
            {isLiberated && (
                <View style={[styles.cardStripe, { backgroundColor: '#22c55e' }]} />
            )}
            {isDeparted && (
                <View style={[styles.cardStripe, { backgroundColor: THEME.colors.textMuted }]} />
            )}

            <View className="p-4 flex flex-col gap-4">
                {/* Badge de alerta "DOCA LIVRE" quando pulsando */}
                {shouldPulse && (
                    <View className="flex-row items-center gap-2 bg-green-500/15 border border-green-500/30 rounded-lg px-3 py-2">
                        <AlertCircle size={14} color="#4ade80" />
                        <Text className="text-green-400 text-[11px] font-bold uppercase tracking-wider">
                            Doca {assignment.dock} livre — Próximo da fila!
                        </Text>
                    </View>
                )}

                <View className="flex-row justify-between items-start">
                    <View className="flex-row gap-3 items-center">
                        <DriverAvatar avatarUrl={avatarUrl} size={48} />
                        <View>
                            <Text className="text-lg font-bold text-white">{assignment.driverName}</Text>
                            <View className="flex-row items-center gap-2 mt-0.5">
                                <View className="px-2 py-0.5 rounded bg-[#f2db0d]/20 border border-[#f2db0d]/20">
                                    <Text className="text-[#f2db0d] text-xs font-bold uppercase">
                                        {assignment.waveNumber || 'Onda'}
                                    </Text>
                                </View>
                                <Text className="text-slate-400 text-xs">• {assignment.driverPlate || '--'}</Text>
                            </View>
                        </View>
                    </View>

                    <View className="items-end">
                        <Text className="text-xs text-slate-400 uppercase tracking-wider font-bold">Doca</Text>
                        <Text className="text-2xl font-bold text-primary leading-none">
                            {assignment.dock || '--'}
                        </Text>
                    </View>
                </View>

                <View className="flex-row gap-2 bg-black/20 p-3 rounded-lg border border-white/5">
                    <View className="flex-1">
                        <Text className="text-[10px] text-slate-500 uppercase">Destino</Text>
                        <Text className="text-sm text-slate-200 font-medium">{assignment.cityName}</Text>
                    </View>
                    <View className="flex-1">
                        <Text className="text-[10px] text-slate-500 uppercase">Rota</Text>
                        <Text className="text-sm text-slate-200 font-medium">{assignment.routeLabel || '--'}</Text>
                    </View>
                </View>

                {/* Estado: Aguardando liberação do admin → Botão de liberar */}
                {isWaiting && (
                    <TouchableOpacity
                        onPress={() => onReleaseDock(assignment)}
                        style={styles.actionBtn}
                        activeOpacity={0.8}
                    >
                        <LinearGradient
                            colors={shouldPulse ? ['#166534', '#15803d'] : ['#2d3270', '#1e3a8a']}
                            style={styles.actionBtnGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                        >
                            <CheckCircle2 size={20} color="white" />
                            <Text className="text-white font-bold text-sm ml-2">
                                {shouldPulse ? 'Liberar Doca (Próximo!)' : 'Liberar Doca'}
                            </Text>
                        </LinearGradient>
                    </TouchableOpacity>
                )}

                {/* Estado: Liberado pelo admin, motorista na doca carregando */}
                {isLiberated && (
                    <View className="flex-row items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                        <Truck size={16} color="#22c55e" />
                        <Text className="text-xs text-green-400 font-bold uppercase">
                            Na Doca {assignment.dock} — Carregando
                        </Text>
                    </View>
                )}

                {/* Estado: Motorista saiu da doca → Doca livre */}
                {isDeparted && (
                    <View className="flex-row items-center gap-2 p-3 rounded-lg bg-slate-500/10 border border-slate-500/20">
                        <Navigation size={16} color="#94a3b8" />
                        <Text className="text-xs text-slate-400 font-bold uppercase">
                            Doca {assignment.dock} Livre — Motorista em Trânsito
                        </Text>
                    </View>
                )}
            </View>
        </RNAnimated.View>
    );
}

export default function AdminMonitorScreen() {
    const router = useRouter();
    const { assignments, groups, isLoading, releaseDock, refreshMonitor, actionModal, dismissModal } = useMonitorData();
    const [filter, setFilter] = useState<FilterType>('all');
    const [driverAvatars, setDriverAvatars] = useState<Record<string, string>>({});

    // Fetch avatar map from driver_status on mount + when assignments refresh
    useEffect(() => {
        (async () => {
            try {
                const allDrivers = await aetherFetchAll(COLLECTIONS.DRIVER_STATUS);
                const map: Record<string, string> = {};
                (allDrivers as any[]).forEach((d: any) => {
                    if (d.user_id && d.avatarUrl) map[d.user_id] = d.avatarUrl;
                });
                setDriverAvatars(map);
            } catch (e) {
                console.warn('[Monitor] Erro ao buscar avatars:', e);
            }
        })();
    }, [assignments]);

    /**
     * Calcula as docas que foram liberadas pelo motorista (departed).
     * Se uma doca aparece como 'departed', outros motoristas 'waiting'
     * na mesma doca devem ser destacados com animação pulsante.
     */
    const freedDocks = useMemo(() => {
        const docks = new Set<string>();
        assignments.forEach(a => {
            if (a.dockStatus === 'departed' && a.dock) {
                docks.add(a.dock);
            }
        });
        return docks;
    }, [assignments]);

    // Filtra as docas
    const filteredGroups = groups.map(group => {
        const filteredAssignments = group.assignments.filter(a => {
            if (filter === 'all') return true;
            if (filter === 'wave_1') return a.waveNumber?.toLowerCase().includes('1');
            if (filter === 'wave_2') return a.waveNumber?.toLowerCase().includes('2');
            if (filter === 'transit') return a.dockStatus === 'liberated' || a.status === 'in_progress';
            return true;
        });

        return { ...group, assignments: filteredAssignments };
    }).filter(g => g.assignments.length > 0);

    const FilterChip = ({ title, value }: { title: string, value: FilterType }) => {
        const isActive = filter === value;
        return (
            <TouchableOpacity
                onPress={() => setFilter(value)}
                style={[
                    styles.chip,
                    isActive ? styles.chipActive : styles.chipInactive,
                    isActive && styles.chipActiveShadow
                ]}
            >
                <Text style={[styles.chipText, isActive ? styles.chipTextActive : styles.chipTextInactive]}>
                    {title}
                </Text>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView className="flex-1 bg-background-light dark:bg-background-dark">
            <LinearGradient
                colors={['#1a1d2e', THEME.colors.background, THEME.colors.headerBackground]}
                style={StyleSheet.absoluteFillObject}
            />

            {/* Header */}
            <View className="px-4 py-3 border-b border-white/10 z-50 bg-[#222010]/95">
                <View className="flex-row items-center justify-between mb-4 mt-2">
                    <TouchableOpacity onPress={() => router.back()} className="p-2 bg-white/5 rounded-full">
                        <ArrowLeft size={24} color="white" />
                    </TouchableOpacity>
                    <Text className="text-lg font-bold text-white">Monitor de Rotas</Text>
                    <TouchableOpacity onPress={refreshMonitor} className="p-2 bg-white/5 rounded-full relative">
                        <RefreshCw size={24} color="white" />
                        <View className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full" />
                    </TouchableOpacity>
                </View>

                {/* Filters */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="pb-2 gap-2 flex-row">
                    <FilterChip title="Todas" value="all" />
                    <FilterChip title="Onda 1" value="wave_1" />
                    <FilterChip title="Onda 2" value="wave_2" />
                    <FilterChip title="Liberados" value="transit" />
                </ScrollView>
            </View>

            {/* Lista Principal */}
            <ScrollView className="flex-1 px-4 pt-4" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                {isLoading && filteredGroups.length === 0 ? (
                    <Text className="text-center text-slate-400 mt-10">Carregando mapa de docas...</Text>
                ) : filteredGroups.length === 0 ? (
                    <Text className="text-center text-slate-400 mt-10">Nenhuma rota ou onda encontrada hoje.</Text>
                ) : (
                    filteredGroups.map(group => (
                        <View key={`${group.cityId}-${group.waveLabel}`} className="mb-6">
                            <View className="flex-row items-center justify-between px-1 mb-3">
                                <View className="flex-row items-center gap-2">
                                    <MapPin size={24} color={THEME.colors.primary} />
                                    <Text className="text-xl font-bold text-white">
                                        {group.cityName} - {group.waveLabel}
                                    </Text>
                                </View>
                                <View className="bg-primary/10 px-2 py-1 rounded">
                                    <Text className="text-xs font-mono text-primary font-bold">
                                        AO VIVO
                                    </Text>
                                </View>
                            </View>

                            {group.assignments.map(assignment => (
                                <DriverCard
                                    key={assignment.id}
                                    assignment={assignment}
                                    shouldPulse={
                                        assignment.dockStatus === 'waiting' &&
                                        freedDocks.has(assignment.dock)
                                    }
                                    onReleaseDock={releaseDock}
                                    avatarUrl={driverAvatars[assignment.driverId]}
                                />
                            ))}
                        </View>
                    ))
                )}
            </ScrollView>

            <AdminBottomNav activeTab="monitor" />

            <DashboardActionModal
                modal={actionModal}
                onDismiss={dismissModal}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    chip: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 9999,
        borderWidth: 1,
        marginRight: 8,
    },
    chipActive: {
        backgroundColor: THEME.colors.primary,
        borderColor: THEME.colors.primary,
    },
    chipInactive: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderColor: 'rgba(255,255,255,0.1)',
    },
    chipActiveShadow: {
        shadowColor: THEME.colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 5,
    },
    chipText: {
        fontSize: 14,
        fontWeight: 'bold',
    },
    chipTextActive: {
        color: '#222010', // dark background contrast
    },
    chipTextInactive: {
        color: THEME.colors.textSecondary,
    },
    card: {
        backgroundColor: '#2a2818',
        borderColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 20,
        elevation: 10,
        position: 'relative',
    },
    cardStripe: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
    },
    actionBtn: {
        width: '100%',
        borderRadius: 8,
        overflow: 'hidden',
        marginTop: 4,
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
    },
    actionBtnGradient: {
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    }
});
