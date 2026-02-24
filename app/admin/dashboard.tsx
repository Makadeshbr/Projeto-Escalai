import React, { useState, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, ScrollView, TextInput, Switch,
    ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { THEME } from '~/src/constants/theme';
import {
    Bell, ChevronDown, Package, FileText, FileSpreadsheet,
    Clock, Navigation, User, ArrowRight, Zap
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { WAVE_META, Assignment, DriverAvailability } from '~/src/lib/collections';
import AdminBottomNav from '~/src/components/AdminBottomNav';
import { registerForPushNotificationsAsync, registerAdminPushToken } from '~/src/lib/push';
import { useAuthStore } from '~/src/store/auth';

// Hooks extraídos (AUDIT FIX — CLEAN-001)
import { useActionModal } from '~/src/hooks/useActionModal';
import { useDashboardData, WaveKey } from '~/src/hooks/useDashboardData';
import { useAssignmentActions } from '~/src/hooks/useAssignmentActions';

// Subcomponentes extraídos (AUDIT FIX — CLEAN-001)
import { CityPickerModal } from '~/src/components/dashboard/CityPickerModal';
import { DriverPickerModal } from '~/src/components/dashboard/DriverPickerModal';
import { DashboardActionModal } from '~/src/components/dashboard/DashboardActionModal';
import { RecentAssignmentsList, AssignmentDetailModal } from '~/src/components/dashboard/AssignmentComponents';

/**
 * Tela principal de gestão de rotas do admin.
 * [AUDIT FIX — CLEAN-001] Refatorado de 1021 LOC para composição
 * de hooks especializados e subcomponentes reutilizáveis.
 */
export default function AdminRouteManagement() {
    // Estado de UI local (não compartilhado)
    const [selectedWave, setSelectedWave] = useState<WaveKey>('morning');
    const [waveNum, setWaveNum] = useState('');
    const [dock, setDock] = useState('');
    const [isSddEnabled, setIsSddEnabled] = useState(false);
    const [isSameDay, setIsSameDay] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedDriverIds, setSelectedDriverIds] = useState<Set<string>>(new Set());

    // Modais
    const [showCityModal, setShowCityModal] = useState(false);
    const [showDriverModal, setShowDriverModal] = useState(false);
    const [showAssignmentModal, setShowAssignmentModal] = useState(false);
    const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
    const [reassignTarget, setReassignTarget] = useState<Assignment | null>(null);

    // Hooks de negócio
    const { user } = useAuthStore();
    const { actionModal, showModal, dismissModal } = useActionModal();
    const data = useDashboardData(selectedWave, isSameDay, showModal);

    // Auto-registra push token do admin no mount
    useEffect(() => {
        if (!user?.id) return;
        (async () => {
            const token = await registerForPushNotificationsAsync();
            if (token) {
                await registerAdminPushToken(
                    user.id,
                    user.metadata?.name || user.name || user.email || 'Admin',
                    token
                );
            }
        })();
    }, [user?.id]);
    const actions = useAssignmentActions({
        fetchRecentAssignments: data.fetchRecentAssignments,
        fetchStats: data.fetchStats,
        showModal,
    });

    /** Toggle de seleção de motorista */
    const toggleDriverSelection = (driverId: string) => {
        setSelectedDriverIds(prev => {
            const next = new Set(prev);
            if (next.has(driverId)) next.delete(driverId);
            else next.add(driverId);
            return next;
        });
    };

    /** Inicia fluxo de reatribuição */
    const initReassign = (assignment: Assignment) => {
        setReassignTarget(assignment);
        setShowAssignmentModal(false);
        setSelectedWave(assignment.wave as WaveKey);
        setIsSameDay(assignment.isSdd || false);
        setSelectedDriverIds(new Set());
        data.fetchAvailableDrivers();
        setShowDriverModal(true);
    };

    /** Confirma seleção de motoristas (para criação ou reatribuição) */
    const handleConfirmDriverSelection = async () => {
        if (reassignTarget) {
            if (selectedDriverIds.size !== 1) return;
            const newDriverId = Array.from(selectedDriverIds)[0];
            const newDriver = data.availableDrivers.find(d => (d.driverId || d.id) === newDriverId);
            if (!newDriver) return;

            await actions.handleReassign(
                reassignTarget, newDriverId, newDriver,
                setIsLoading,
                () => { setShowDriverModal(false); setReassignTarget(null); setSelectedDriverIds(new Set()); }
            );
        } else {
            setShowDriverModal(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <LinearGradient colors={['#1a1d2e', THEME.colors.background, THEME.colors.headerBackground]} style={StyleSheet.absoluteFillObject} />

            {/* Header */}
            <View className="flex-row items-center justify-between px-6 py-4 z-20">
                <View>
                    <Text className="text-2xl font-spaceGroteskBold tracking-tight text-white mb-1">Despacho</Text>
                    <Text className="text-xs font-spaceGrotesk text-[#94a3b8] uppercase tracking-[0.1em]">GESTÃO DE ROTAS</Text>
                </View>
                <TouchableOpacity className="w-10 h-10 rounded-full bg-surface border border-border items-center justify-center relative">
                    <Bell color={THEME.colors.primary} size={20} />
                    <View className="absolute top-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#1e2332]" />
                </TouchableOpacity>
            </View>

            <ScrollView className="flex-1 px-4 z-10" showsVerticalScrollIndicator={false}>

                {/* Operations Overview */}
                <View className="mb-6 relative">
                    <View className="absolute inset-0 bg-primary/5 rounded-2xl blur-xl" />
                    <View className="rounded-2xl border border-border p-5 shadow-lg bg-surface">
                        <View className="flex-row justify-between items-start mb-5">
                            <View className="flex-row items-center gap-3">
                                <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center border border-primary/20">
                                    <Navigation color={THEME.colors.primary} size={20} />
                                </View>
                                <View>
                                    <Text className="text-[#94a3b8] text-xs font-spaceGrotesk uppercase tracking-wider mb-0.5">Operações Atuais</Text>
                                    <Text className="text-xl font-spaceGroteskBold text-white">{data.selectedCity?.name || 'Selecione a cidade'}</Text>
                                </View>
                            </View>
                            <View className="bg-green-500/10 border border-green-500/20 px-2 py-1 rounded-full">
                                <Text className="text-green-400 text-[10px] font-spaceGroteskBold uppercase tracking-wider">Online</Text>
                            </View>
                        </View>
                        <View className="flex-row gap-3">
                            <View className="flex-1 bg-background rounded-xl p-3.5 border border-border">
                                <Text className="text-xs text-text-muted font-spaceGrotesk mb-1">Rotas Pendentes</Text>
                                <Text className="text-2xl font-spaceGroteskBold text-white">{data.pendingCount}</Text>
                            </View>
                            <View className="flex-1 bg-background rounded-xl p-3.5 border border-border">
                                <Text className="text-xs text-text-muted font-spaceGrotesk mb-1">Mot. Disponíveis</Text>
                                <Text className="text-2xl font-spaceGroteskBold text-primary">{data.activeDriverCount}</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Route Assignment Form */}
                <View className="space-y-5">
                    {/* City Select */}
                    <View className="mb-5">
                        <Text className="text-[13px] font-spaceGroteskBold text-text-light ml-1 mb-2">Cidade Base</Text>
                        <TouchableOpacity onPress={() => setShowCityModal(true)} className="relative justify-center">
                            <View className="w-full bg-surface border border-border rounded-xl py-4 pl-5 pr-12">
                                <Text className="text-white font-spaceGrotesk text-[15px]">{data.selectedCity?.name || 'Toque para selecionar a cidade'}</Text>
                            </View>
                            <View className="absolute right-4 opacity-70"><ChevronDown color="#94a3b8" size={20} /></View>
                        </TouchableOpacity>
                    </View>

                    {/* Wave Selector */}
                    <View className="mb-5">
                        <Text className="text-[13px] font-spaceGroteskBold text-text-light ml-1 mb-2">Turno / Onda de Saída</Text>
                        <View className="flex-row gap-2">
                            {(['morning', 'afternoon', 'night'] as WaveKey[]).map((wave) => {
                                const meta = WAVE_META[wave];
                                const isSelected = selectedWave === wave;
                                return (
                                    <TouchableOpacity
                                        key={wave}
                                        onPress={() => { setSelectedWave(wave); setSelectedDriverIds(new Set()); }}
                                        className={`flex-1 h-[68px] flex-col items-center justify-center rounded-xl border ${isSelected ? 'bg-primary border-primary' : 'bg-surface border-border'}`}
                                    >
                                        <Text className={`text-[13px] font-spaceGroteskBold mb-0.5 ${isSelected ? 'text-[#13151f]' : 'text-white'}`}>{meta.label}</Text>
                                        <Text className={`text-[10px] font-spaceGrotesk ${isSelected ? 'text-[#1a1c29]' : 'text-text-muted'}`}>{meta.time}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    {/* Driver Selector */}
                    <View className="mb-5">
                        <View className="flex-row justify-between items-end mb-2">
                            <Text className="text-[13px] font-spaceGroteskBold text-text-light ml-1">Motoristas Alocados</Text>
                            <View className="flex-row items-center gap-2">
                                <Text className="text-[#94a3b8] font-spaceGrotesk text-[11px] uppercase">Agendar para Hoje (SD)</Text>
                                <Switch
                                    value={isSameDay}
                                    onValueChange={(val) => { setIsSameDay(val); setSelectedDriverIds(new Set()); }}
                                    trackColor={{ false: THEME.colors.headerBackground, true: '#3b82f6' }}
                                    thumbColor={isSameDay ? '#ffffff' : '#94a3b8'}
                                    style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                                />
                            </View>
                        </View>
                        <TouchableOpacity
                            onPress={() => { data.fetchAvailableDrivers(); setShowDriverModal(true); }}
                            className="w-full bg-surface border border-border rounded-xl py-4 flex-row items-center justify-between px-5"
                        >
                            <View className="flex-row items-center gap-3 flex-1">
                                <User color="#94a3b8" size={20} />
                                <Text className={`font-spaceGrotesk text-[15px] ${selectedDriverIds.size > 0 ? 'text-primary font-spaceGroteskBold' : 'text-white'}`}>
                                    {selectedDriverIds.size > 0 ? `${selectedDriverIds.size} motorista(s) selecionado(s)` : 'Vincular motoristas à rota...'}
                                </Text>
                            </View>
                            <ChevronDown color="#94a3b8" size={20} />
                        </TouchableOpacity>
                    </View>

                    {/* Dock and Wave Number */}
                    <View className="flex-row gap-3 mb-6">
                        <View className="flex-1">
                            <Text className="text-[13px] font-spaceGroteskBold text-text-light ml-1 mb-2">Sigla/Onda</Text>
                            <View className="relative justify-center">
                                <TextInput value={waveNum} onChangeText={setWaveNum}
                                    className="w-full bg-surface border border-border text-white text-lg font-spaceGroteskBold rounded-xl py-3 pl-4 pr-12 h-14"
                                    placeholder="Ex: 01" placeholderTextColor="#475569" autoCapitalize="characters" maxLength={10} />
                                <View className="absolute right-4 opacity-50"><Clock color="#94a3b8" size={20} /></View>
                            </View>
                        </View>
                        <View className="flex-1">
                            <Text className="text-[13px] font-spaceGroteskBold text-text-light ml-1 mb-2">Balcão/Doca</Text>
                            <View className="relative justify-center">
                                <TextInput value={dock} onChangeText={setDock}
                                    className="w-full bg-surface border border-border text-white text-lg font-spaceGroteskBold rounded-xl py-3 pl-4 pr-12 h-14"
                                    placeholder="Nº" placeholderTextColor="#475569" autoCapitalize="characters" maxLength={10} />
                                <View className="absolute right-4 opacity-50"><Package color="#94a3b8" size={20} /></View>
                            </View>
                        </View>
                    </View>

                    {/* SDD Badge */}
                    <View className="mb-6">
                        <Text className="text-[13px] font-spaceGroteskBold text-text-light ml-1 mb-2">Tag Visual (Envio SDD)</Text>
                        <View className="flex-row w-full h-[56px] bg-surface border border-border justify-between items-center rounded-xl pl-4 pr-3">
                            <Text className="text-[#94a3b8] font-spaceGrotesk text-[13px]">Badge Laranja</Text>
                            <Switch value={isSddEnabled} onValueChange={setIsSddEnabled}
                                trackColor={{ false: THEME.colors.headerBackground, true: '#fb923c' }} thumbColor={isSddEnabled ? '#ffffff' : '#94a3b8'} />
                        </View>
                    </View>
                </View>

                {/* Submit Action */}
                <TouchableOpacity
                    onPress={() => actions.handleCreateAssignments(
                        { selectedCity: data.selectedCity, selectedWave, waveNum, dock, isSddEnabled, selectedDriverIds, availableDrivers: data.availableDrivers },
                        setIsLoading,
                        () => { setDock(''); setWaveNum(''); setSelectedDriverIds(new Set()); }
                    )}
                    disabled={isLoading}
                    className={`w-full bg-primary h-14 flex-row justify-center items-center rounded-xl border border-[#d9c400] gap-2 mb-6 ${isLoading ? 'opacity-50' : ''}`}
                    style={{ shadowColor: THEME.colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 }}
                >
                    {isLoading ? <ActivityIndicator color="#000" size="small" /> : (
                        <>
                            <Text className="text-[#13151f] font-spaceGroteskBold text-base tracking-wide uppercase">Despachar Frota</Text>
                            <ArrowRight color={THEME.colors.background} size={20} />
                        </>
                    )}
                </TouchableOpacity>

                {/* Reports */}
                <View className="flex-row gap-3 mb-8">
                    <TouchableOpacity onPress={actions.handleGeneratePDF} className="flex-1 flex-row items-center justify-center gap-2 bg-surface border border-border h-[52px] rounded-xl">
                        <FileText color="#94a3b8" size={18} />
                        <Text className="text-white font-spaceGrotesk text-[13px]">Exportar PDF</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={actions.handleGenerateExcel} className="flex-1 flex-row items-center justify-center gap-2 bg-surface border border-border h-[52px] rounded-xl">
                        <FileSpreadsheet color="#94a3b8" size={18} />
                        <Text className="text-white font-spaceGrotesk text-[13px]">Exportar Excel</Text>
                    </TouchableOpacity>
                </View>

                {/* Recent Assignments */}
                <RecentAssignmentsList
                    assignments={data.recentAssignments}
                    onSelect={(a) => { setSelectedAssignment(a); setShowAssignmentModal(true); }}
                    onRefresh={data.fetchRecentAssignments}
                    onClear={() => data.clearRecentAssignments(setIsLoading)}
                />
            </ScrollView>

            {/* Modais */}
            <CityPickerModal
                visible={showCityModal}
                cities={data.cities}
                selectedCity={data.selectedCity}
                onSelect={data.setSelectedCity}
                onClose={() => setShowCityModal(false)}
                onAddCity={data.handleAddCity}
            />

            <DriverPickerModal
                visible={showDriverModal}
                drivers={data.availableDrivers}
                selectedIds={selectedDriverIds}
                selectedWave={selectedWave}
                loading={data.driversLoading}
                onToggle={toggleDriverSelection}
                onConfirm={handleConfirmDriverSelection}
                onClose={() => { setShowDriverModal(false); setReassignTarget(null); }}
            />

            <AssignmentDetailModal
                visible={showAssignmentModal}
                assignment={selectedAssignment}
                onClose={() => setShowAssignmentModal(false)}
                onCancel={(a) => actions.handleCancelAssignment(a, setIsLoading, () => setShowAssignmentModal(false))}
                onReassign={initReassign}
            />

            <DashboardActionModal modal={actionModal} onDismiss={dismissModal} />
            <AdminBottomNav activeTab="dashboard" />
        </SafeAreaView>
    );
}
