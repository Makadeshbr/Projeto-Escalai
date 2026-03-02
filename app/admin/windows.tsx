import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { THEME } from '~/src/constants/theme';
import { ArrowLeft, Clock, Trash2, Plus, Calendar as CalendarIcon, Users } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { aether, aetherFetchAll } from '~/src/lib/aether';
import { COLLECTIONS, getTodayDateStr, getTomorrowDateStr } from '~/src/lib/collections';
import { router } from 'expo-router';
import AdminBottomNav from '~/src/components/AdminBottomNav';
import { useForegroundRefresh } from '~/src/hooks/useForegroundRefresh';
import WindowCreatorModal from '~/src/components/dashboard/WindowCreatorModal';

export default function AvailabilityWindowsScreen() {
    const [windows, setWindows] = useState<any[]>([]);
    const [stats, setStats] = useState({ total: 0, active: 0, responseRate: 0 });
    const [isLoading, setIsLoading] = useState(true);
    const [isCreatorVisible, setIsCreatorVisible] = useState(false);

    // Action Modal for deletions
    const [actionModal, setActionModal] = useState({
        visible: false,
        title: '',
        message: '',
        targetId: '',
        targetLabel: ''
    });
    const [isDeleting, setIsDeleting] = useState(false);

    const loadData = useCallback(async () => {
        try {
            // Fetch all windows
            const allWindowsRaw = await aetherFetchAll(COLLECTIONS.AVAILABILITY_WINDOWS) as any[];

            // Stats calculation
            const total = allWindowsRaw.length;
            const activeRaw = allWindowsRaw.filter(w => w.isOpen || w._payload?.isOpen);
            const activeCount = activeRaw.length;

            // Fetch drivers to calculate response rate for active windows
            const allDrivers = await aetherFetchAll(COLLECTIONS.DRIVER_STATUS) as any[];
            const allAvailability = await aetherFetchAll(COLLECTIONS.DRIVER_AVAILABILITY) as any[];

            let responseRate = 0;
            if (activeCount > 0 && allDrivers.length > 0) {
                const totalExpectedResponses = activeCount * allDrivers.length;
                // Count responses that belong to currently active windows
                const activeWindowIds = new Set(activeRaw.map(w => w.id));
                const actualResponses = allAvailability.filter(a => {
                    const payload = a._payload || a;
                    return activeWindowIds.has(payload.windowId);
                }).length;

                responseRate = Math.round((actualResponses / totalExpectedResponses) * 100);
            }

            setStats({ total, active: activeCount, responseRate });

            // Format active windows for display
            const todStr = getTodayDateStr();
            const tomStr = getTomorrowDateStr();

            const formattedWindows = allWindowsRaw.map(win => {
                const targetDate = win.targetDate || win._payload?.targetDate;
                const createdAt = win.createdAt || win._payload?.createdAt || win.openedAt || win._payload?.openedAt;
                const isOpen = win.isOpen || win._payload?.isOpen;

                let typeLabel = '';
                if (targetDate === todStr) typeLabel = 'HOJE';
                else if (targetDate === tomStr) typeLabel = 'AMANHÃ';
                else typeLabel = 'PROGRAMADA';

                // Respostas detalhadas para esta janela específica
                const windowResponses = allAvailability.filter(a => {
                    return (a._payload?.windowId || a.windowId) === win.id;
                });

                const availableCount = windowResponses.filter(r => r.isAvailable === true || r._payload?.isAvailable === true).length;
                const unavailableCount = windowResponses.filter(r => r.isAvailable === false || r._payload?.isAvailable === false).length;
                const pendingCount = Math.max(0, allDrivers.length - (availableCount + unavailableCount));
                const totalDriversCount = allDrivers.length;

                return {
                    id: win.id,
                    targetDate,
                    labelDate: targetDate ? targetDate.split('-').reverse().join('/') : '--/--/----',
                    title: win.title || win._payload?.title || `Convocação ${targetDate ? targetDate.split('-').reverse().join('/') : ''}`,
                    typeLabel,
                    isOpen,
                    timeLimit: win.timeLimit || win._payload?.timeLimit || '12:00h',
                    availableCount,
                    unavailableCount,
                    pendingCount,
                    totalDriversCount,
                    createdAt
                };
            });

            // Sort: Active first, then by date descending
            formattedWindows.sort((a, b) => {
                if (a.isOpen && !b.isOpen) return -1;
                if (!a.isOpen && b.isOpen) return 1;
                return b.targetDate.localeCompare(a.targetDate);
            });

            setWindows(formattedWindows);
        } catch (error) {
            console.error('[Windows] Erro ao carregar dados:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useForegroundRefresh(loadData);

    const confirmDelete = (id: string, label: string) => {
        setActionModal({
            visible: true,
            title: 'Deletar Janela',
            message: `Tem certeza que deseja excluir permanentemente a janela "${label}"? Todas as respostas dos motoristas vinculadas a ela também serão excluídas e eles não poderão mais acessar essa convocação.`,
            targetId: id,
            targetLabel: label
        });
    };

    const processDelete = async () => {
        setIsDeleting(true);
        try {
            // Delete window
            await aether.db.collection(COLLECTIONS.AVAILABILITY_WINDOWS).delete(actionModal.targetId);

            // Delete associated responses (Cascade)
            const existingResponses = await aether.db.collection(COLLECTIONS.DRIVER_AVAILABILITY)
                .query().eq('windowId', actionModal.targetId).get();

            if (existingResponses && (existingResponses as any[]).length > 0) {
                await Promise.all((existingResponses as any[]).map(res =>
                    aether.db.collection(COLLECTIONS.DRIVER_AVAILABILITY).delete(res.id)
                ));
            }

            setActionModal(prev => ({ ...prev, visible: false }));
            loadData();
        } catch (error) {
            console.error('[Windows] Erro ao deletar janela:', error);
            // Revert modal loading state to allow retry/cancel
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <LinearGradient colors={['#13151f', '#0f111a']} style={StyleSheet.absoluteFillObject} />

            {/* Header */}
            <View className="flex-row items-center px-4 py-4 z-20 border-b border-white/5">
                <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
                    <ArrowLeft color="#94a3b8" size={24} />
                </TouchableOpacity>
                <Text className="flex-1 text-center text-lg font-spaceGroteskBold text-white tracking-wide">
                    Gestão de Janelas
                </Text>
                <TouchableOpacity onPress={() => router.replace('/admin/settings')} className="p-2 -mr-2">
                    <View className="w-8 h-8 items-center justify-center">
                        <View className="w-5 h-0.5 bg-slate-400 mb-1 rounded-full" />
                        <View className="w-5 h-0.5 bg-slate-400 mb-1 rounded-full" />
                        <View className="w-5 h-0.5 bg-slate-400 rounded-full" />
                    </View>
                </TouchableOpacity>
            </View>

            {/* Metrics Cards */}
            <View className="flex-row px-4 pt-6 pb-2 gap-3 z-10">
                <View className="flex-1 bg-surface border border-white/5 rounded-2xl p-4 items-center justify-center shadow-lg">
                    <Text className="text-slate-400 text-xs font-spaceGroteskBold uppercase tracking-wider mb-2">Total</Text>
                    <Text className="text-white text-3xl font-spaceGroteskBold">{stats.total.toString().padStart(2, '0')}</Text>
                </View>
                <View className="flex-1 bg-surface border border-sky-500/20 rounded-2xl p-4 items-center justify-center shadow-lg relative overflow-hidden">
                    <View className="absolute top-0 right-0 w-16 h-16 bg-sky-500/10 rounded-full -mr-8 -mt-8 blur-md" />
                    <Text className="text-sky-500 text-xs font-spaceGroteskBold uppercase tracking-wider mb-2">Ativas</Text>
                    <Text className="text-sky-400 text-3xl font-spaceGroteskBold">{stats.active.toString().padStart(2, '0')}</Text>
                </View>
                <View className="flex-1 bg-surface border border-primary/20 rounded-2xl p-4 items-center justify-center shadow-lg relative overflow-hidden">
                    <View className="absolute top-0 right-0 w-16 h-16 bg-primary/10 rounded-full -mr-8 -mt-8 blur-md" />
                    <Text className="text-primary text-xs font-spaceGroteskBold uppercase tracking-wider mb-2">Resposta</Text>
                    <Text className="text-primary text-3xl font-spaceGroteskBold">{stats.responseRate}%</Text>
                </View>
            </View>

            <ScrollView className="flex-1 px-4 z-10" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
                <View className="flex-row justify-between items-end mt-8 mb-4">
                    <Text className="text-slate-500 font-spaceGroteskBold text-xs uppercase tracking-widest">
                        Janelas Recentes
                    </Text>
                </View>

                {isLoading ? (
                    <View className="py-10 items-center justify-center">
                        <ActivityIndicator color={THEME.colors.primary} />
                    </View>
                ) : windows.length === 0 ? (
                    <View className="py-12 items-center justify-center border border-white/5 rounded-3xl border-dashed">
                        <CalendarIcon size={32} color="#334155" />
                        <Text className="text-slate-500 font-spaceGrotesk mt-4">Nenhuma janela cadastrada</Text>
                    </View>
                ) : (
                    <View className="gap-4">
                        {windows.map((win) => (
                            <TouchableOpacity
                                key={win.id}
                                activeOpacity={0.8}
                                onPress={() => router.push(`/admin/window-details/${win.id}?title=${encodeURIComponent(win.title)}&date=${encodeURIComponent(win.labelDate)}`)}
                                className={`rounded-3xl p-5 border relative overflow-hidden ${win.isOpen
                                    ? 'bg-surface border-sky-500/20'
                                    : 'bg-[#151722] border-white/5 opacity-80'
                                    }`}
                            >
                                {/* Glow Effect for Active */}
                                {win.isOpen && (
                                    <View className="absolute top-0 right-0 w-32 h-32 bg-sky-500/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
                                )}

                                <View className="flex-row justify-between items-start mb-4">
                                    <View className={`px-3 py-1 rounded-full flex-row items-center gap-1.5 ${win.isOpen ? 'bg-sky-500/10 border border-sky-500/20' : 'bg-white/5 border border-white/10'}`}>
                                        {win.isOpen && <View className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
                                        <Text className={`text-[10px] font-spaceGroteskBold uppercase tracking-widest ${win.isOpen ? 'text-sky-400' : 'text-slate-400'}`}>
                                            {win.isOpen ? 'Em Andamento' : 'Encerrada'}
                                        </Text>
                                    </View>

                                    <TouchableOpacity
                                        onPress={() => confirmDelete(win.id, win.title)}
                                        className="p-2 -mt-1 -mr-1 bg-black/20 rounded-full"
                                    >
                                        <Trash2 size={16} color="#64748b" />
                                    </TouchableOpacity>
                                </View>

                                <Text className="text-xl font-spaceGroteskBold text-white mb-5">{win.title}</Text>

                                <View className="flex-row gap-2 flex-wrap mb-4">
                                    <View className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 flex-1 items-center flex-row justify-center gap-2">
                                        <View className="w-2 h-2 rounded-full bg-emerald-400" />
                                        <Text className="text-emerald-400 font-spaceGroteskBold text-xs">{win.availableCount}</Text>
                                        <Text className="text-emerald-500/80 font-spaceGrotesk text-[10px] uppercase">Disp.</Text>
                                    </View>

                                    <View className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 flex-1 items-center flex-row justify-center gap-2">
                                        <View className="w-2 h-2 rounded-full bg-red-400" />
                                        <Text className="text-red-400 font-spaceGroteskBold text-xs">{win.unavailableCount}</Text>
                                        <Text className="text-red-500/80 font-spaceGrotesk text-[10px] uppercase">Indisp.</Text>
                                    </View>

                                    <View className="bg-slate-800/50 border border-white/5 rounded-xl px-3 py-2 flex-1 items-center flex-row justify-center gap-2">
                                        <View className="w-2 h-2 rounded-full bg-slate-500" />
                                        <Text className="text-slate-300 font-spaceGroteskBold text-xs">{win.pendingCount}</Text>
                                        <Text className="text-slate-500 font-spaceGrotesk text-[10px] uppercase">Pend.</Text>
                                    </View>
                                </View>

                                <View className="border-t border-white/5 pt-3 flex-row items-center gap-2">
                                    <Clock size={12} color="#64748b" />
                                    <Text className="text-slate-500 font-spaceGrotesk text-[11px]">Limite de Resposta: <Text className="font-spaceGroteskBold text-slate-300">{win.timeLimit}</Text></Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </ScrollView>

            {/* Floating Action Button Isolado para evitar interception de panHandlers/Gestures */}
            <View style={{ position: 'absolute', right: 24, bottom: 90, zIndex: 9999, elevation: 9999 }} pointerEvents="box-none">
                <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setIsCreatorVisible(true)}
                    className="w-16 h-16 rounded-2xl bg-[#ffd500] items-center justify-center shadow-lg"
                    style={{
                        shadowColor: '#ffd500',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.3,
                        shadowRadius: 12,
                    }}
                >
                    <Plus size={32} color="#000" strokeWidth={2.5} />
                </TouchableOpacity>
            </View>

            <AdminBottomNav activeTab="windows" />

            {/* Creator Modal */}
            <WindowCreatorModal
                visible={isCreatorVisible}
                onClose={() => setIsCreatorVisible(false)}
                onSuccess={loadData}
            />

            {/* Delete Confirmation Modal */}
            <Modal visible={actionModal.visible} transparent animationType="fade">
                <View className="flex-1 bg-black/60 items-center justify-center px-6">
                    <View className="bg-surface w-full rounded-3xl p-6 border border-white/10 shadow-2xl">
                        <View className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 items-center justify-center mb-5 self-center">
                            <Trash2 size={24} color="#f87171" />
                        </View>
                        <Text className="text-white font-spaceGroteskBold text-xl text-center mb-3">{actionModal.title}</Text>
                        <Text className="text-slate-400 font-spaceGrotesk text-center leading-relaxed text-[15px] mb-8">
                            {actionModal.message}
                        </Text>

                        <View className="flex-row gap-3">
                            <TouchableOpacity
                                onPress={() => setActionModal(prev => ({ ...prev, visible: false }))}
                                disabled={isDeleting}
                                className="flex-1 bg-white/5 border border-white/10 py-4 rounded-xl items-center"
                            >
                                <Text className="text-white font-spaceGroteskBold">Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={processDelete}
                                disabled={isDeleting}
                                className={`flex-1 bg-red-500 py-4 rounded-xl items-center flex-row justify-center gap-2 ${isDeleting ? 'opacity-70' : ''}`}
                            >
                                {isDeleting && <ActivityIndicator size="small" color="#fff" />}
                                <Text className="text-white font-spaceGroteskBold">Deletar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}
