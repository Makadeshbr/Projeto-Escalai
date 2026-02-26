import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, CheckCircle, ChevronLeft, Truck, Moon, Lock, CheckCircle2, AlertTriangle, Sun, Sunset, CalendarCheck } from 'lucide-react-native';
import { THEME } from '~/src/constants/theme';
import { useAuthStore } from '~/src/store/auth';
import { aether } from '~/src/lib/aether';
import { router } from 'expo-router';
import {
    COLLECTIONS, DriverAvailability, AvailabilityWindow,
    getTomorrowDateStr, getTodayDateStr
} from '~/src/lib/collections';
import DriverBottomNav from '~/src/components/DriverBottomNav';
import { LinearGradient } from 'expo-linear-gradient';
import { EnterpriseModal } from '~/src/components/EnterpriseModal';
import { notifyAdmins, ensureDriverPushToken } from '~/src/lib/push';

type ScreenState = 'loading' | 'blocked' | 'no_window' | 'already_filled' | 'form';

export default function AvailabilityScreen() {
    const { user } = useAuthStore();
    const [screenState, setScreenState] = useState<ScreenState>('loading');
    const [existingAvailability, setExistingAvailability] = useState<DriverAvailability | null>(null);
    const [allResponses, setAllResponses] = useState<DriverAvailability[]>([]);
    const [isAvailable, setIsAvailable] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [targetDateStr, setTargetDateStr] = useState('');
    const [targetDateLabel, setTargetDateLabel] = useState('');
    const [targetTitle, setTargetTitle] = useState('');
    const [windowDoc, setWindowDoc] = useState<AvailabilityWindow | null>(null);
    const [selectedShifts, setSelectedShifts] = useState({
        morning: true,
        afternoon: false,
        night: false,
    });
    const toggleShift = (shift: keyof typeof selectedShifts) => {
        setSelectedShifts(prev => ({ ...prev, [shift]: !prev[shift] }));
    };

    const [actionModal, setActionModal] = useState({
        visible: false,
        title: '',
        message: '',
        type: 'info' as 'info' | 'error' | 'success' | 'warning',
    });

    const showModal = (title: string, message: string, type: 'info' | 'error' | 'success' | 'warning' = 'info') => {
        setActionModal({ visible: true, title, message, type });
    };

    /**
     * Setup do ciclo de vida: subscribe realtime + polling fallback de 20s.
     * Quando o admin abre uma nova janela de disponibilidade, o motorista
     * vê o formulário aparecer instantaneamente sem precisar sair da tela.
     */
    useEffect(() => {
        let unsubscribe: (() => void) | undefined;

        checkState();

        // Subscribe na coleção de janelas de disponibilidade (admin abre/fecha)
        try {
            unsubscribe = aether.db.collection(COLLECTIONS.AVAILABILITY_WINDOWS)
                .subscribe(() => {
                    console.log('[Realtime Availability] Janela alterada, rechecando estado...');
                    checkState();
                });
        } catch (subErr) {
            console.warn('[Realtime Availability] Subscribe indisponível, usando apenas polling:', subErr);
        }

        // Polling de 20s como fallback
        const interval = setInterval(() => {
            checkState();
        }, 20000);

        return () => {
            if (unsubscribe) unsubscribe();
            clearInterval(interval);
        };
    }, []);

    /**
     * [PUSH FIX] Garante registro de push token ao montar a tela.
     * Cobre motoristas que nunca abriram o dashboard.
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

    const formatLabel = (dateRaw: string, isToday: boolean) => {
        const dateObj = new Date(dateRaw + 'T12:00:00Z');
        const weekday = dateObj.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' });
        const day = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', timeZone: 'UTC' });
        const month = dateObj.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' });
        const wd = weekday.charAt(0).toUpperCase() + weekday.slice(1).replace('.', '');
        const mo = month.charAt(0).toUpperCase() + month.slice(1).replace('.', '');
        setTargetDateLabel(`${wd}, ${day} ${mo}`);
        setTargetTitle(isToday ? 'Hoje (SDD)' : 'Amanhã');
    };

    const checkState = async () => {
        setScreenState('loading');
        try {
            // [Self-Healing] Garante que a integridade referencial do motorista exista na tabela
            // Agora usa método direto pois as correções de RLS já estão deployadas
            if (user?.id) {
                try {
                    const statusCheck = await aether.db.collection(COLLECTIONS.DRIVER_STATUS)
                        .query()
                        .eq('user_id', user.id)
                        .get();

                    // Se não existe, cria via método direto
                    if (!statusCheck || (statusCheck as any[]).length === 0) {
                        try {
                            // Envia os dados diretamente como campos flat (não como _payload)
                            await aether.db.collection(COLLECTIONS.DRIVER_STATUS).create({
                                user_id: user.id,
                                driverName: user.metadata?.name || user.name || user.email?.split('@')[0] || 'Motorista',
                                driverPlate: user.metadata?.vehiclePlate || 'S/Placa',
                                expoPushToken: user.metadata?.expoPushToken || '',
                                status: 'active',
                                updatedByAdminId: 'system_self_healing',
                                created_at: new Date().toISOString()
                            });
                            console.log('[Self-Healing] Driver Status criado via método direto');
                        } catch (directError) {
                            console.warn('[Self-Healing] Erro no método direto (ignorado):', directError);
                        }
                    }
                } catch (healError) {
                    console.warn('[Self-Healing] Erro na sincronização de auto-cura do driver_status:', healError);
                }
            }

            // 1. Check if driver is blocked
            if (user?.id) {
                const statuses = await aether.db.collection(COLLECTIONS.DRIVER_STATUS)
                    .query()
                    .eq('user_id', user.id)
                    .get();
                if (statuses && statuses.length > 0) {
                    const s = statuses[0] as unknown as { status: string };
                    if (s.status === 'blocked' || s.status === 'deleted') {
                        setScreenState('blocked');
                        return;
                    }
                }
            }

            // 2. Fetch all windows to manage both open ones and historical ones
            const todayStr = getTodayDateStr();
            const allWindowsRaw = await aether.db.collection(COLLECTIONS.AVAILABILITY_WINDOWS).query().get();
            const allWindows = (allWindowsRaw as any[]) || [];

            const openWindows = allWindows
                .filter(w => w.isOpen === true)
                .sort((a, b) => (a.targetDate || '').localeCompare(b.targetDate || ''));

            // 3. Fetch all user availabilities
            let userAvails: any[] = [];
            if (user?.id) {
                const raw = await aether.db.collection(COLLECTIONS.DRIVER_AVAILABILITY)
                    .query().eq('driverId', user.id).get();
                userAvails = raw as any[] || [];
            }

            // Find the first open window that the driver HAS NOT filled yet
            const firstPendingWindow = openWindows.find(w => !userAvails.some(a => a.targetDate === w.targetDate));

            if (firstPendingWindow) {
                // There is a pending window to answer
                setWindowDoc(firstPendingWindow as unknown as AvailabilityWindow);
                setTargetDateStr(firstPendingWindow.targetDate);
                formatLabel(firstPendingWindow.targetDate, firstPendingWindow.targetDate === todayStr);
                setScreenState('form');
                return;
            }

            // If we are here, ALL open windows are already answered, OR there are no open windows.
            // Let's gather all future/today responses to show them in the list.
            // 4. Self-Healing: Clean up "Ghost" Responses
            // If the admin deleted a window in the past, the driver's response might still be floating around.
            const upcomingResponses: any[] = [];
            const ghostResponses: any[] = [];

            userAvails.filter(a => a.targetDate >= todayStr).forEach(a => {
                const windowExists = allWindows.some(w => w.id === a.windowId);
                if (windowExists) {
                    upcomingResponses.push(a);
                } else {
                    ghostResponses.push(a);
                }
            });

            // Actively delete orphaned ghosts from the database
            if (ghostResponses.length > 0) {
                console.log(`[Self-Healing] Deleting ${ghostResponses.length} orphaned availability responses.`);
                await Promise.all(ghostResponses.map(g =>
                    aether.db.collection(COLLECTIONS.DRIVER_AVAILABILITY).delete(g.id)
                ));
            }

            upcomingResponses.sort((a, b) => (a.targetDate || '').localeCompare(b.targetDate || ''));

            if (upcomingResponses.length > 0) {
                setAllResponses(upcomingResponses as DriverAvailability[]);
                setScreenState('already_filled');
                return;
            }

            // No pending windows, and no upcoming responses
            setScreenState('no_window');
        } catch (e) {
            console.error('[Availability] Error checking state:', e);
            setScreenState('no_window');
        }
    };

    const handleConfirm = async () => {
        if (!user?.id) {
            showModal('Erro', 'Motorista não identificado. Faça login novamente.', 'error');
            return;
        }
        if (!windowDoc) {
            showModal('Erro', 'Janela de disponibilidade não encontrada.', 'error');
            return;
        }
        if (isLoading) return; // Prevent double clicks

        setIsLoading(true);
        try {
            // [SENIOR DEV] Anti-Duplication Defense: Check one last time right before inserting
            const existingRaw = await aether.db.collection(COLLECTIONS.DRIVER_AVAILABILITY)
                .query()
                .eq('driverId', user.id)
                .eq('targetDate', targetDateStr)
                .get();

            if (existingRaw && (existingRaw as any[]).length > 0) {
                showModal('Pronto!', `Sua disponibilidade já havia sido confirmada para ${targetTitle.toLowerCase()}.`, 'success');
                await checkState(); // Reload screen safely
                return;
            }

            await aether.db.collection(COLLECTIONS.DRIVER_AVAILABILITY).create({
                driverId: user.id,
                driverName: user.metadata?.name || user.name || user.email || '',
                driverPlate: user.metadata?.vehiclePlate || '',
                windowId: windowDoc.id,
                targetDate: targetDateStr,
                isAvailable,
                shifts: isAvailable ? selectedShifts : { morning: false, afternoon: false, night: false },
                lockedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
            });

            showModal('Pronto!', `Sua disponibilidade foi confirmada para ${targetTitle.toLowerCase()}.`, 'success');

            // Notifica admins que o motorista preencheu disponibilidade
            try {
                const driverLabel = user.metadata?.name || user.name || user.email || 'Motorista';
                const statusLabel = isAvailable ? 'DISPONÍVEL' : 'INDISPONÍVEL';
                await notifyAdmins(
                    `DISPONIBILIDADE REGISTRADA 📋`,
                    `${driverLabel} se declarou ${statusLabel} para ${targetTitle.toLowerCase()} (${targetDateLabel}).`
                );
            } catch (pushErr) {
                console.warn('[Fault Tolerance] Push admin falhou:', pushErr);
            }

            // [SENIOR DEV] Fixes the GO_BACK panic of React Navigation by just redefining the screen flow state locally.
            await checkState();
        } catch (error: any) {
            showModal('Erro', error?.message || 'Erro ao registrar disponibilidade.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // ---- LOADING STATE ----
    if (screenState === 'loading') {
        return (
            <SafeAreaView className="flex-1 bg-background items-center justify-center">
                <ActivityIndicator color={THEME.colors.primary} size="large" />
                <Text className="text-[#94a3b8] font-spaceGrotesk mt-4 tracking-wider">Verificando disponibilidade...</Text>
                <DriverBottomNav activeTab="availability" />
            </SafeAreaView>
        );
    }

    // ---- BLOCKED STATE ----
    if (screenState === 'blocked') {
        return (
            <SafeAreaView className="flex-1 bg-background">
                <View className="flex-row items-center justify-between p-4 border-b border-border">
                    <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/driver/dashboard')} className="w-10 h-10 rounded-full items-center justify-center bg-surface border border-border">
                        <ChevronLeft color="#fff" size={24} />
                    </TouchableOpacity>
                    <Text className="text-lg font-spaceGroteskBold tracking-widest uppercase text-white">Disponibilidade</Text>
                    <View className="w-10" />
                </View>
                <View className="flex-1 items-center justify-center px-8">
                    <Lock color="#f87171" size={48} />
                    <Text className="text-2xl font-spaceGroteskBold text-white text-center mt-4 mb-2">Conta Bloqueada</Text>
                    <Text className="text-[#94a3b8] text-center font-spaceGrotesk">
                        Sua conta está bloqueada pelo administrador. Entre em contato com o suporte.
                    </Text>
                </View>
                <DriverBottomNav activeTab="availability" />
            </SafeAreaView>
        );
    }

    // ---- NO WINDOW STATE ----
    if (screenState === 'no_window') {
        return (
            <SafeAreaView className="flex-1 bg-background">
                <View className="flex-row items-center justify-between p-4 border-b border-border">
                    <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/driver/dashboard')} className="w-10 h-10 rounded-full items-center justify-center bg-surface border border-border">
                        <ChevronLeft color="#fff" size={24} />
                    </TouchableOpacity>
                    <Text className="text-lg font-spaceGroteskBold tracking-widest uppercase text-white">Disponibilidade</Text>
                    <View className="w-10" />
                </View>
                <View className="flex-1 items-center justify-center px-8">
                    <Lock color={THEME.colors.primary} size={48} />
                    <Text className="text-2xl font-spaceGroteskBold text-white text-center mt-4 mb-2">Aguardando Liberação</Text>
                    <Text className="text-[#94a3b8] text-center font-spaceGrotesk">
                        A disponibilidade para o próximo turno ainda não foi liberada pelo administrador. Aguarde a confirmação.
                    </Text>
                </View>
                <DriverBottomNav activeTab="availability" />
            </SafeAreaView>
        );
    }

    // ---- ALREADY FILLED STATE ----
    if (screenState === 'already_filled') {
        return (
            <SafeAreaView className="flex-1 bg-background" edges={['top']}>
                <LinearGradient colors={['#1a1d2e', THEME.colors.background, THEME.colors.headerBackground]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />

                <View className="flex-row items-center justify-between p-4 z-10 border-b border-border">
                    <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/driver/dashboard')} className="w-10 h-10 rounded-full items-center justify-center bg-surface border border-border">
                        <ChevronLeft color="#fff" size={24} />
                    </TouchableOpacity>
                    <Text className="text-lg font-spaceGroteskBold tracking-widest uppercase text-white">Disponibilidade</Text>
                    <View className="w-10" />
                </View>
                <View className="flex-1 px-6 pt-10 z-10 w-full mb-20">
                    <View className="items-center mb-8">
                        <View className="w-16 h-16 bg-surface rounded-full items-center justify-center border border-border mb-4">
                            <CalendarCheck color={THEME.colors.primary} size={28} />
                        </View>
                        <Text className="text-[11px] font-spaceGroteskBold text-[#94a3b8] uppercase tracking-[0.2em] mb-2">
                            ESCALA REGISTRADA
                        </Text>
                        <Text className="text-3xl font-spaceGroteskBold text-white text-center leading-tight">
                            Status Confirmado
                        </Text>
                    </View>

                    <ScrollView className="w-full" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                        {allResponses.map((response, index) => {
                            const [year, month, day] = response.targetDate.split('-');
                            const formattedDate = `${day}/${month}/${year}`;

                            return (
                                <View key={response.id || index} className="bg-surface border border-border rounded-3xl overflow-hidden shadow-lg w-full mb-6 relative">
                                    {!response.isAvailable && (
                                        <View className="absolute inset-0 bg-red-900/5 z-0" />
                                    )}

                                    <View className="p-5 border-b border-border bg-[#1a1d2e]/50 flex-row justify-between items-center relative z-10">
                                        <View>
                                            <Text className="text-[#94a3b8] text-[10px] font-spaceGrotesk uppercase tracking-widest mb-1">Data da Rota</Text>
                                            <Text className="text-white text-lg font-spaceGroteskBold uppercase">{formattedDate}</Text>
                                        </View>
                                        <View className={`px-3 py-1.5 rounded-full border ${response.isAvailable ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                                            <Text className={`font-spaceGroteskBold text-[10px] uppercase tracking-widest ${response.isAvailable ? 'text-[#4ade80]' : 'text-[#f87171]'}`}>
                                                {response.isAvailable ? 'Disponível' : 'Indisponível'}
                                            </Text>
                                        </View>
                                    </View>

                                    <View className="p-5 relative z-10">
                                        {response.isAvailable && response.shifts ? (
                                            <View>
                                                <Text className="text-[#94a3b8] text-[10px] font-spaceGrotesk uppercase tracking-widest mb-3">Turnos Selecionados</Text>
                                                <View className="flex-row gap-2">
                                                    {response.shifts.morning && (
                                                        <View className="flex-1 items-center gap-1.5 bg-background border border-border py-2.5 rounded-xl">
                                                            <Sun color={THEME.colors.primary} size={16} />
                                                            <Text className="text-white font-spaceGroteskBold text-[11px] uppercase">Manhã</Text>
                                                        </View>
                                                    )}
                                                    {response.shifts.afternoon && (
                                                        <View className="flex-1 items-center gap-1.5 bg-background border border-border py-2.5 rounded-xl">
                                                            <Sunset color={THEME.colors.primary} size={16} />
                                                            <Text className="text-white font-spaceGroteskBold text-[11px] uppercase">Tarde</Text>
                                                        </View>
                                                    )}
                                                    {response.shifts.night && (
                                                        <View className="flex-1 items-center gap-1.5 bg-background border border-border py-2.5 rounded-xl">
                                                            <Moon color={THEME.colors.primary} size={16} />
                                                            <Text className="text-white font-spaceGroteskBold text-[11px] uppercase">Noite</Text>
                                                        </View>
                                                    )}
                                                </View>
                                            </View>
                                        ) : (
                                            <View className="flex-row items-center gap-3">
                                                <AlertTriangle color="#f87171" size={20} />
                                                <Text className="text-[#94a3b8] font-spaceGrotesk text-[13px] flex-1 leading-relaxed">
                                                    Você declarou indisponibilidade para este dia.
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            );
                        })}

                        <View className="items-center px-4 mt-2 opacity-60">
                            <Text className="text-text-muted text-[11px] font-spaceGrotesk text-center leading-relaxed">
                                Apenas um administrador ou despachante pode alterar as escalas após confirmadas.
                            </Text>
                        </View>
                    </ScrollView>
                </View>

                <EnterpriseModal
                    visible={actionModal.visible}
                    title={actionModal.title}
                    description={actionModal.message}
                    type={actionModal.type}
                    cancelText="Fechar"
                    onClose={() => setActionModal(prev => ({ ...prev, visible: false }))}
                />

                <DriverBottomNav activeTab="availability" />
            </SafeAreaView>
        );
    }

    // ---- FORM STATE (main form) ----
    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <LinearGradient colors={['#1a1d2e', THEME.colors.background, THEME.colors.headerBackground]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />

            {/* Header */}
            <View className="flex-row items-center justify-between px-4 py-4 z-10 border-b border-border">
                <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/driver/dashboard')} className="w-10 h-10 rounded-full items-center justify-center bg-surface border border-border">
                    <ChevronLeft color="#fff" size={24} />
                </TouchableOpacity>
                <Text className="text-lg font-spaceGroteskBold tracking-widest uppercase text-white">
                    Disponibilidade
                </Text>
                <View className="w-10" />
            </View>

            <ScrollView className="flex-1 px-6 pb-24 z-10" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150 }}>
                {/* Title Section */}
                <View className="mt-6 mb-8 items-center">
                    <Text className="text-[11px] font-spaceGroteskBold text-[#94a3b8] uppercase tracking-[0.2em] mb-2">
                        {targetTitle}
                    </Text>
                    <Text className="text-4xl font-spaceGroteskBold leading-tight mb-4 text-white">
                        Vai dirigir?
                    </Text>
                    <View className="flex-row items-center gap-2 bg-surface px-5 py-2.5 rounded-full border border-border">
                        <Calendar color={THEME.colors.primary} size={18} />
                        <Text className="text-base font-spaceGroteskBold text-white uppercase tracking-wider">{targetDateLabel || '...'}</Text>
                    </View>
                </View>

                {/* Hero Card Status */}
                <View className="relative w-full aspect-[21/9] rounded-2xl overflow-hidden bg-surface mb-8 border border-border shadow-lg">
                    <View className="absolute inset-0 bg-header-bg/50" />

                    <View className="absolute inset-0 flex-col justify-end p-6">
                        <View className="flex-row items-end justify-between">
                            <View>
                                <Text className="text-[#94a3b8] text-[11px] font-spaceGroteskBold uppercase tracking-[0.2em] mb-1">
                                    Status Atual
                                </Text>
                                <Text className="text-3xl font-spaceGroteskBold text-white mb-1 tracking-tight">
                                    {isAvailable ? 'Disponível' : 'Ausente'}
                                </Text>
                                <Text className="text-primary text-[13px] font-spaceGroteskBold">
                                    {isAvailable ? 'Pronto para aceitar rotas' : 'Fora de escala'}
                                </Text>
                            </View>
                            <Switch
                                trackColor={{ false: THEME.colors.background, true: '#f9e006' }}
                                thumbColor={isAvailable ? '#ffffff' : '#94a3b8'}
                                onValueChange={setIsAvailable}
                                value={isAvailable}
                                style={{ transform: [{ scale: 1.1 }] }}
                            />
                        </View>
                    </View>
                </View>

                {/* Shift Selection */}
                {isAvailable && (
                    <View className="mb-8">
                        <View className="flex-row items-center justify-between mb-4">
                            <Text className="text-lg font-spaceGroteskBold text-white">Selecione Turnos</Text>
                            <Text className="text-[10px] font-spaceGroteskBold text-[#94a3b8] uppercase tracking-[0.2em] bg-surface px-2 py-1 rounded-full border border-border">Múltiplos</Text>
                        </View>

                        <View className="gap-3">
                            {/* Morning */}
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => toggleShift('morning')}
                                className={`flex-row items-center p-4 rounded-2xl border ${selectedShifts.morning ? 'border-primary bg-surface' : 'border-border bg-background'}`}
                            >
                                <View className={`w-12 h-12 rounded-xl items-center justify-center mr-4 ${selectedShifts.morning ? 'bg-primary' : 'bg-surface'}`}>
                                    <View className={`w-5 h-5 rounded-full ${selectedShifts.morning ? 'bg-background' : 'bg-[#94a3b8]'}`} />
                                </View>
                                <View className="flex-1">
                                    <View className="flex-row justify-between items-center mb-1">
                                        <Text className="text-base font-spaceGroteskBold text-white">Manhã</Text>
                                        <View className="bg-background px-2 py-1 rounded-md border border-border">
                                            <Text className="text-[11px] text-[#94a3b8] font-mono">06:00 - 12:00</Text>
                                        </View>
                                    </View>
                                    <Text className="text-xs text-text-muted font-spaceGrotesk">Alta demanda para entregas</Text>
                                </View>
                                {selectedShifts.morning && (
                                    <CheckCircle2 color={THEME.colors.primary} size={20} className="ml-3" />
                                )}
                            </TouchableOpacity>

                            {/* Afternoon */}
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => toggleShift('afternoon')}
                                className={`flex-row items-center p-4 rounded-2xl border ${selectedShifts.afternoon ? 'border-primary bg-surface' : 'border-border bg-background'}`}
                            >
                                <View className={`w-12 h-12 rounded-xl items-center justify-center mr-4 ${selectedShifts.afternoon ? 'bg-primary' : 'bg-surface'}`}>
                                    <Truck color={selectedShifts.afternoon ? THEME.colors.background : '#94a3b8'} size={20} />
                                </View>
                                <View className="flex-1">
                                    <View className="flex-row justify-between items-center mb-1">
                                        <Text className="text-base font-spaceGroteskBold text-white">Tarde</Text>
                                        <View className="bg-background px-2 py-1 rounded-md border border-border">
                                            <Text className="text-[11px] text-[#94a3b8] font-mono">12:00 - 18:00</Text>
                                        </View>
                                    </View>
                                    <Text className="text-xs text-text-muted font-spaceGrotesk">Tráfego de rota padrão</Text>
                                </View>
                                {selectedShifts.afternoon && (
                                    <CheckCircle2 color={THEME.colors.primary} size={20} className="ml-3" />
                                )}
                            </TouchableOpacity>

                            {/* Night */}
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => toggleShift('night')}
                                className={`flex-row items-center p-4 rounded-2xl border ${selectedShifts.night ? 'border-primary bg-surface' : 'border-border bg-background'}`}
                            >
                                <View className={`w-12 h-12 rounded-xl items-center justify-center mr-4 ${selectedShifts.night ? 'bg-primary' : 'bg-surface'}`}>
                                    <Moon color={selectedShifts.night ? THEME.colors.background : '#94a3b8'} size={20} />
                                </View>
                                <View className="flex-1">
                                    <View className="flex-row justify-between items-center mb-1">
                                        <Text className="text-base font-spaceGroteskBold text-white">Noite</Text>
                                        <View className="bg-background px-2 py-1 rounded-md border border-border">
                                            <Text className="text-[11px] text-[#94a3b8] font-mono">18:00 - 00:00</Text>
                                        </View>
                                    </View>
                                    <Text className="text-xs text-[#4ade80] font-spaceGroteskBold">+15% bônus de ganhos</Text>
                                </View>
                                {selectedShifts.night && (
                                    <CheckCircle2 color={THEME.colors.primary} size={20} className="ml-3" />
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </ScrollView>

            {/* Button floating bottom */}
            <View className="absolute bottom-24 left-0 w-full p-6 bg-background/95 border-t border-border z-20">
                <TouchableOpacity
                    onPress={handleConfirm}
                    disabled={isLoading}
                    className={`w-full bg-primary h-14 rounded-xl flex-row items-center justify-center gap-2 shadow-lg ${isLoading ? 'opacity-50' : ''}`}
                    style={{ shadowColor: THEME.colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 5 }}
                >
                    {isLoading ? (
                        <ActivityIndicator color="#000" size="small" />
                    ) : (
                        <Text className="text-[#13151f] font-spaceGroteskBold text-[15px] tracking-widest uppercase">
                            Confirmar Disponibilidade
                        </Text>
                    )}
                </TouchableOpacity>
            </View>

            <EnterpriseModal
                visible={actionModal.visible}
                title={actionModal.title}
                description={actionModal.message}
                type={actionModal.type}
                cancelText="Fechar"
                onClose={() => setActionModal(prev => ({ ...prev, visible: false }))}
            />

            <DriverBottomNav activeTab="availability" />
        </SafeAreaView>
    );
}
