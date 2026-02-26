import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, Dimensions, StyleSheet, Linking, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Menu, Truck, Waves, Hourglass, CheckCircle2, MessageCircle, Bell, Navigation, PartyPopper, Package, AlertTriangle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withDelay,
    Easing,
} from 'react-native-reanimated';
import DriverBottomNav from '~/src/components/DriverBottomNav';
import { useAuthStore } from '~/src/store/auth';
import { aether } from '~/src/lib/aether';
import { COLLECTIONS, Assignment, getTodayDateStr } from '~/src/lib/collections';
import { THEME } from '~/src/constants/theme';
import { dispatchAdminAlert, ensureDriverPushToken } from '~/src/lib/push';
import { EnterpriseModal } from '~/src/components/EnterpriseModal';

/**
 * Tela de status de rota do motorista.
 * Máquina de estados visual: departed > liberated > waiting.
 * Utiliza subscribe realtime do Aether para atualizações instantâneas.
 */
export default function RouteStatusScreen() {
    const router = useRouter();
    const { user, role } = useAuthStore();

    const [assignment, setAssignment] = useState<Assignment | null>(null);
    const activeIdRef = useRef<string | null>(null);
    activeIdRef.current = assignment?.id || null;
    const [isLoading, setIsLoading] = useState(true);

    // Animações para o anel de pulso ("Waiting" state)
    const ring1 = useSharedValue(0);
    const ring2 = useSharedValue(0);
    const ring3 = useSharedValue(0);

    useEffect(() => {
        // Setup ring animations infinitas
        const ringConfig = { duration: 3000, easing: Easing.out(Easing.ease) };
        ring1.value = withRepeat(withTiming(1, ringConfig), -1, false);
        ring2.value = withDelay(1000, withRepeat(withTiming(1, ringConfig), -1, false));
        ring3.value = withDelay(2000, withRepeat(withTiming(1, ringConfig), -1, false));
    }, [ring1, ring2, ring3]);

    /**
     * [PUSH FIX] Garante push token em todas as telas do motorista.
     * Maximiza cobertura — cobre cenários onde o motorista
     * só acessa o status da rota sem passar pelo dashboard.
     */
    useEffect(() => {
        if (user?.id) {
            ensureDriverPushToken(
                user.id,
                user.metadata?.name || user.name || user.email?.split('@')[0] || 'Motorista',
                user.metadata?.vehiclePlate || 'S/Placa',
                user.metadata?.avatarUrl,
            );
        }
    }, [user?.id]);

    const ring1Style = useAnimatedStyle(() => ({
        transform: [{ scale: 1 + (ring1.value * 0.5) }],
        opacity: 1 - ring1.value,
    }));
    const ring2Style = useAnimatedStyle(() => ({
        transform: [{ scale: 1 + (ring2.value * 0.5) }],
        opacity: 1 - ring2.value,
    }));
    const ring3Style = useAnimatedStyle(() => ({
        transform: [{ scale: 1 + (ring3.value * 0.5) }],
        opacity: 1 - ring3.value,
    }));

    /**
     * Busca a atribuição ativa do motorista para hoje.
     * Retorna o objeto para uso no setup do realtime.
     */
    const fetchMyActiveAssignment = useCallback(async (): Promise<Assignment | null> => {
        if (!user || role !== 'driver') return null;
        try {
            // [SENIOR DEV FIX] Buscamos ALL via aetherFetchAll (robusto)
            const { aetherFetchAll } = require('~/src/lib/aether');
            const allRaw = await aetherFetchAll(COLLECTIONS.ASSIGNMENTS) as Assignment[];

            if (!allRaw || allRaw.length === 0) {
                setAssignment(null);
                return null;
            }

            const todayStr = getTodayDateStr();

            // [TIMEZONE FIX] Converte a data UTC do banco para local 
            // e garante que docas em andamento não despareçam na virada de meia-noite
            const active = allRaw.find(a => {
                if (a.driverId !== user.id) return false;
                if (a.status === 'completed' || !a.dock) return false;
                if (!a.createdAt) return false;

                const createdDate = new Date(a.createdAt);
                const year = createdDate.getFullYear();
                const month = String(createdDate.getMonth() + 1).padStart(2, '0');
                const day = String(createdDate.getDate()).padStart(2, '0');
                const localCreatedStr = `${year}-${month}-${day}`;

                const isToday = localCreatedStr === todayStr;
                const isStillActive = (a.status === 'pending' || a.dockStatus === 'waiting' || a.dockStatus === 'liberated');

                return isToday || isStillActive;
            });

            setAssignment(active || null);
            return active || null;
        } catch (error) {
            console.error('[RouteStatus] Erro ao buscar:', error);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [user, role]);

    /**
     * Setup realtime via Aether subscribe.
     * Assina toda a coleção de assignments e filtra pelo ID da atribuição ativa.
     * Quando o admin muda dockStatus para 'liberated', o motorista vê instantaneamente.
     */
    useEffect(() => {
        let unsubscribe: (() => void) | undefined;
        let activeId: string | null = null;

        const setupRealtime = async () => {
            const active = await fetchMyActiveAssignment();
            if (!active?.id) return;

            activeIdRef.current = active.id;

            // Subscribe na coleção inteira e filtra pelo ID do assignment ativo
            try {
                unsubscribe = aether.db.collection(COLLECTIONS.ASSIGNMENTS)
                    .subscribe((updatedData: any) => {
                        if (!updatedData) return;

                        // O payload pode vir como objeto direto ou dentro de _payload
                        const payload = updatedData._payload || updatedData;
                        const updateId = payload.id || updatedData.id;

                        if (updateId === activeIdRef.current) {
                            console.log('[Realtime Driver] Recebido update:', JSON.stringify(payload));
                            setAssignment(prev => {
                                if (!prev) return prev;
                                // Merge seguro: mantém todos os campos e sobrescreve apenas os atualizados
                                return {
                                    ...prev,
                                    ...payload,
                                    id: prev.id, // Garante que o ID nunca mude
                                } as Assignment;
                            });
                        }
                    });
            } catch (subErr) {
                console.warn('[Realtime Driver] Subscribe falhou, ativando fallback polling:', subErr);
            }
        };

        setupRealtime();

        // Fallback: polling de 10s caso o subscribe falhe ou não suporte realtime
        const fallbackInterval = setInterval(() => {
            fetchMyActiveAssignment();
        }, 10000);

        return () => {
            if (unsubscribe) unsubscribe();
            clearInterval(fallbackInterval);
        };
    }, [user, role, fetchMyActiveAssignment]);

    /**
     * Máquina de estados derivada da atribuição.
     * ORDEM DE PRIORIDADE: departed > in_progress > liberated > waiting
     */
    const isDeparted = assignment?.dockStatus === 'departed';
    const isLiberated = assignment?.dockStatus === 'liberated' && !isDeparted;
    const isWaiting = assignment?.dockStatus === 'waiting';

    /**
     * Handler: motorista confirma que saiu da doca e está em trânsito.
     * Grava AMBOS os campos: dockStatus='departed' e status='in_progress'.
     */
    const handleDriverReleaseDock = async () => {
        if (!assignment) return;
        setIsLoading(true);
        try {
            await aether.db.collection(COLLECTIONS.ASSIGNMENTS).update(assignment.id, {
                dockStatus: 'departed',
                status: 'in_progress'
            });
            // Update local imediato (o realtime vai confirmar em seguida)
            setAssignment(prev => prev ? { ...prev, dockStatus: 'departed', status: 'in_progress' } : null);

            // Notifica admins que o motorista saiu da doca
            try {
                await dispatchAdminAlert(
                    'DOCA LIBERADA PELO MOTORISTA 🚛',
                    `${assignment.driverName} (Placa: ${assignment.driverPlate || '--'}) saiu da doca ${assignment.dock} rumo a ${assignment.cityName}.`,
                    'route_confirmed',
                    user?.id,
                    assignment.id
                );
            } catch (pushErr) {
                console.warn('[Fault Tolerance] Push admin falhou:', pushErr);
            }
        } catch (error) {
            console.error('[RouteStatus] Erro ao liberar doca e iniciar viagem:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // ========================== RENDER ==========================

    if (isLoading) {
        return (
            <SafeAreaView className="flex-1 bg-[#222010] justify-center items-center">
                <Text className="text-white">Carregando status...</Text>
            </SafeAreaView>
        );
    }

    if (!assignment) {
        return (
            <SafeAreaView className="flex-1 bg-[#222010]">
                <LinearGradient colors={['#1a1d2e', THEME.colors.background, THEME.colors.headerBackground]} style={StyleSheet.absoluteFillObject} />
                <View className="flex-1 items-center justify-center p-6">
                    <Truck size={64} color={THEME.colors.textMuted} />
                    <Text className="text-white text-xl font-bold mt-4 text-center">Nenhuma Rota Ativa</Text>
                    <Text className="text-slate-400 text-center mt-2">Você não possui nenhuma viagem programada ou doca designada para o dia de hoje.</Text>
                </View>
                <DriverBottomNav activeTab="status" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-[#222010]">
            <LinearGradient colors={['#1a1d2e', THEME.colors.background, THEME.colors.headerBackground]} style={StyleSheet.absoluteFillObject} />

            {/* Header */}
            <View className="px-4 py-3 border-b border-white/10 z-50">
                <View className="flex-row items-center justify-between mt-2">
                    <TouchableOpacity onPress={() => router.back()} className="p-2 bg-white/5 rounded-full">
                        <Menu size={24} color="white" />
                    </TouchableOpacity>
                    <Text className="text-sm font-bold text-center flex-1 text-white uppercase tracking-wide">
                        Status da Rota
                    </Text>
                    <TouchableOpacity className="p-2 bg-white/5 rounded-full relative">
                        <Bell size={24} color="white" />
                        <View className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full" />
                    </TouchableOpacity>
                </View>
            </View>

            <View className="flex-1 p-6 pb-20 mt-4">
                {/* Info Card Superior */}
                <View className="bg-[#2a2818] border border-white/10 rounded-xl p-4 shadow-lg mb-6 z-20">
                    <View className="flex-row justify-between items-center mb-4">
                        <View className="flex-row items-center gap-2">
                            <Truck size={20} color={THEME.colors.primary} />
                            <Text className="text-slate-400 text-xs font-bold uppercase tracking-wider">VEÍCULO</Text>
                        </View>
                        <View className="bg-white/10 px-3 py-1 rounded border border-white/10">
                            <Text className="text-white text-sm font-mono font-bold">{assignment.driverPlate || '--'}</Text>
                        </View>
                    </View>
                    {assignment.routeLabel || assignment.sacas ? (
                        <View className="flex-row justify-between items-center mb-4 pb-4 border-b border-white/5">
                            {assignment.routeLabel && (
                                <>
                                    <Text className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">ROTA ATUAL</Text>
                                    <Text className="text-white text-sm font-mono font-bold px-2 py-0.5 bg-primary/20 text-primary border border-primary/20 rounded">
                                        {assignment.routeLabel}
                                    </Text>
                                </>
                            )}
                            {!!assignment.sacas && (
                                <View className="flex-row items-center gap-1 ml-auto bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/30">
                                    <Package size={14} color="#f97316" />
                                    <Text className="text-sm font-bold uppercase tracking-wider" style={{ color: '#f97316' }}>
                                        {assignment.sacas} SACA{assignment.sacas > 1 ? 'S' : ''}
                                    </Text>
                                </View>
                            )}
                        </View>
                    ) : null}
                    <View className="flex-row">
                        <View className="flex-1">
                            <Text className="text-[10px] text-slate-500 uppercase font-bold mb-1">CIDADE / DESTINO</Text>
                            <View className="flex-row items-center gap-1.5">
                                <View className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                <Text className="text-lg font-bold text-white shrink" numberOfLines={1}>{assignment.cityName}</Text>
                            </View>
                        </View>
                        <View className="flex-1 items-end">
                            <Text className="text-[10px] text-slate-500 uppercase font-bold mb-1">ONDA</Text>
                            <View className="flex-row items-center gap-1.5">
                                <Text className="text-lg font-bold text-primary">#{assignment.waveNumber || '--'}</Text>
                                <Waves size={18} color={THEME.colors.primary} />
                            </View>
                        </View>
                    </View>
                </View>

                {/* ========== MÁQUINA DE ESTADOS VISUAL ========== */}
                <View className="flex-1 items-center justify-center p-4">

                    {/* ESTADO 1: Motorista já saiu da doca → "Boa Viagem" */}
                    {isDeparted && (
                        <View className="bg-surface rounded-2xl p-8 items-center justify-center shadow-lg border border-border w-full">
                            <View className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/20 items-center justify-center mb-4">
                                <PartyPopper size={40} color="#4ade80" />
                            </View>
                            <Text className="text-2xl font-bold uppercase tracking-wider text-white">
                                Boa Viagem! 🚛
                            </Text>
                            <Text className="text-slate-400 text-sm text-center mt-3 leading-relaxed">
                                Você liberou a doca e está a caminho do destino. Dirija com segurança!
                            </Text>
                            <View className="bg-[#0ea5e9]/10 border border-[#0ea5e9]/20 rounded-xl px-6 py-3 mt-4">
                                <Text className="text-[10px] text-slate-500 uppercase tracking-wider text-center mb-1">Destino</Text>
                                <Text className="text-xl font-black text-[#0ea5e9] text-center">
                                    {assignment.cityName}
                                </Text>
                            </View>
                            {assignment.routeLabel && (
                                <Text className="text-slate-500 text-xs font-mono mt-3">Rota: {assignment.routeLabel}</Text>
                            )}
                        </View>
                    )}

                    {/* ESTADO 2: Doca liberada pelo admin → Card verde com botão "Partir" */}
                    {isLiberated && (
                        <View className="bg-primary rounded-2xl overflow-hidden p-8 items-center justify-center shadow-lg border-[4px] border-white/20 w-full relative">
                            {/* Reflexo premium light */}
                            <View className="absolute top-0 left-0 right-0 h-1/2 bg-white/10" />

                            <CheckCircle2 size={50} color={THEME.colors.background} />
                            <Text className="text-lg font-bold uppercase tracking-wider text-[#13151f] mt-3">
                                Doca Liberada
                            </Text>
                            <Text className="text-[72px] font-black leading-none text-[#13151f] my-2 shadow-sm">
                                {assignment.dock}
                            </Text>
                            <Text className="font-bold text-sm text-[#13151f]/80 text-center mb-6">
                                Dirija-se à doca imediatamente
                            </Text>

                            <TouchableOpacity
                                onPress={handleDriverReleaseDock}
                                className="w-full bg-background py-4 rounded-xl flex-row items-center justify-center shadow-md active:opacity-80"
                            >
                                <Truck size={18} color={THEME.colors.primary} />
                                <Text className="text-primary font-bold uppercase tracking-widest text-sm ml-2">
                                    Liberar Doca (Partir)
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* ESTADO 3: Aguardando liberação do admin → Animação de pulso */}
                    {isWaiting && (
                        <View className="items-center justify-center relative w-full aspect-square max-w-[320px]">
                            {/* Glow amarelo escuro de fundo */}
                            <View style={styles.darkGlow} />

                            {/* Anéis Finos Fixos */}
                            <View style={[styles.staticRing, { width: 170, height: 170, borderRadius: 85, borderColor: 'rgba(242,219,13,0.1)' }]} />
                            <View style={[styles.staticRing, { width: 210, height: 210, borderRadius: 105, borderColor: 'rgba(242,219,13,0.05)' }]} />
                            <View style={[styles.staticRing, { width: 280, height: 280, borderRadius: 140, borderColor: 'rgba(242,219,13,0.02)' }]} />

                            {/* Pulse Rings */}
                            <Animated.View style={[styles.ring, { borderColor: 'rgba(242,219,13,0.3)' }, ring1Style]} />
                            <Animated.View style={[styles.ring, { borderColor: 'rgba(242,219,13,0.2)' }, ring2Style]} />
                            <Animated.View style={[styles.ring, { borderColor: 'rgba(242,219,13,0.1)' }, ring3Style]} />

                            {/* Inner Circle (Glassmorphism) */}
                            <View className="bg-[#1a1b15]/60 border border-white/10 rounded-full w-48 h-48 flex flex-col items-center justify-center z-10 shadow-lg">
                                <View className="mb-4 p-4 rounded-full bg-[#f2db0d]/10 border border-[#f2db0d]/20 relative">
                                    <View className="absolute inset-0 bg-[#f2db0d]/20 rounded-full opacity-50 blur-md" />
                                    <Hourglass size={36} color={THEME.colors.primary} />
                                </View>
                                <Text className="text-[22px] font-bold text-white text-center leading-tight tracking-wide">
                                    Aguardando{'\n'}
                                    <Text className="text-[#f2db0d]">Liberação</Text>
                                </Text>

                                {/* Mini Dot Loader */}
                                <View className="flex-row gap-1.5 mt-3 bg-black/40 px-3 py-1.5 rounded-full border border-white/5">
                                    <View className="w-1.5 h-1.5 bg-[#4ade80] rounded-full opacity-50" />
                                    <View className="w-1.5 h-1.5 bg-[#0ea5e9] rounded-full" />
                                    <View className="w-1.5 h-1.5 bg-[#0ea5e9] rounded-full" />
                                </View>
                            </View>
                        </View>
                    )}

                    {/* Texto inferior apenas no Waiting */}
                    {isWaiting && (
                        <View className="mt-8 text-center max-w-xs items-center px-4">
                            <Text className="text-white font-medium text-lg">Aguarde no pátio</Text>
                            <Text className="text-slate-400 text-sm leading-relaxed text-center mt-2">
                                O administrador irá liberar sua doca em breve. Você receberá um aviso sonoro automático.
                            </Text>
                        </View>
                    )}
                </View>

                {/* Footer Actions */}
                {!isDeparted && (
                    <View className="mt-auto pb-6 gap-3">
                        {/* Contatar Administrador via WhatsApp */}
                        <TouchableOpacity
                            onPress={() => {
                                const phone = '5514988407303';
                                const msg = encodeURIComponent(
                                    `*Escalai — Motorista*\n\nNome: ${user?.metadata?.name || 'Motorista'}\nPlaca: ${user?.metadata?.vehiclePlate || 'N/A'}\nRota: ${assignment?.routeLabel || assignment?.id?.substring(0, 8) || 'N/A'}\nDoca: ${assignment?.dock || 'N/A'}\n\nPreciso de suporte.`
                                );
                                Linking.openURL(`https://wa.me/${phone}?text=${msg}`);
                            }}
                            className="w-full py-4 bg-white/5 border border-white/10 rounded-xl flex-row items-center justify-center gap-3"
                        >
                            <MessageCircle size={20} color={THEME.colors.primary} />
                            <Text className="text-slate-300 font-medium">Contatar Administrador</Text>
                        </TouchableOpacity>

                        {/* Reportar Problema */}
                        <TouchableOpacity
                            onPress={() => {
                                if (!user?.id) return;
                                // Cria ticket de suporte via collection
                                aether.db.collection(COLLECTIONS.SUPPORT_TICKETS).create({
                                    driverId: user.id,
                                    driverName: user.metadata?.name || user.email?.split('@')[0] || 'Motorista',
                                    driverPlate: user.metadata?.vehiclePlate || 'S/Placa',
                                    assignmentId: assignment?.id || '',
                                    type: 'problem',
                                    message: `Problema reportado na rota ${assignment?.routeLabel || 'N/A'} — Doca ${assignment?.dock || 'N/A'}`,
                                    status: 'open',
                                    createdAt: new Date().toISOString(),
                                }).then(() => {
                                    Alert.alert('Ticket Enviado ✓', 'O administrador receberá seu reporte e entrará em contato.');
                                    // Notifica admins via push
                                    dispatchAdminAlert(
                                        '🚨 Problema Reportado',
                                        `${user.metadata?.name || 'Motorista'} reportou um problema na rota ${assignment?.routeLabel || 'N/A'}`,
                                        'ticket_created',
                                        user.id,
                                        assignment?.id
                                    ).catch(() => { });
                                }).catch(() => {
                                    Alert.alert('Erro', 'Não foi possível enviar o reporte. Tente contatar via WhatsApp.');
                                });
                            }}
                            className="w-full py-4 bg-red-500/5 border border-red-500/15 rounded-xl flex-row items-center justify-center gap-3"
                        >
                            <AlertTriangle size={20} color="#f87171" />
                            <Text className="text-red-400 font-medium">Reportar Problema</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* Status Bar Floating Bottom */}
            <View className="absolute bottom-20 left-0 right-0 p-4 border-t border-white/5 bg-background/95 z-40">
                <View className="flex-row justify-between items-center text-xs">
                    <Text className="text-slate-500 font-mono text-xs">ID: {assignment.id.substring(0, 8).toUpperCase()}</Text>
                    <View className="flex-row items-center gap-2">
                        <View className="w-2 h-2 bg-green-500 rounded-full shadow-lg" />
                        <Text className="text-slate-400 text-xs">Realtime Ativo</Text>
                    </View>
                </View>
            </View>

            <DriverBottomNav activeTab="status" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    ring: {
        position: 'absolute',
        width: 250,
        height: 250,
        borderRadius: 125,
        borderWidth: 1.5,
    },
    staticRing: {
        position: 'absolute',
        borderWidth: 1,
    },
    darkGlow: {
        position: 'absolute',
        width: 320,
        height: 320,
        borderRadius: 160,
        backgroundColor: 'rgba(42, 40, 24, 0.4)',
        shadowColor: '#f2db0d',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.15,
        shadowRadius: 50,
        elevation: 0,
    }
});
