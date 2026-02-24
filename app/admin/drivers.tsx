import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { THEME } from '~/src/constants/theme';
import { ArrowLeft, Search, User, Check, X, Clock, CalendarClock, Zap, AlertCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { aether, aetherFetchAll } from '~/src/lib/aether';
import { COLLECTIONS, getTomorrowDateStr, getTodayDateStr, DriverAvailability } from '~/src/lib/collections';
import AdminBottomNav from '~/src/components/AdminBottomNav';
import { EnterpriseModal } from '~/src/components/EnterpriseModal';
import { FloatingActionButton } from '~/src/components/FloatingActionButton';
import { router } from 'expo-router';
import { TextInput } from 'react-native';
import { useAuthStore } from '~/src/store/auth';

// Tipagem unida que cruza Base (Status) com Answer (Availability)
interface DriverCrossList {
    id: string; // driver ID
    driverName: string;
    driverPlate: string;
    status: 'confirmed' | 'denied' | 'pending';
    shifts?: { morning: boolean; afternoon: boolean; night: boolean };
}

export default function AdminDriversScreen() {
    const { role } = useAuthStore();
    const [selectedTab, setSelectedTab] = useState<'sd' | 'd1'>('d1');
    const [crossList, setCrossList] = useState<DriverCrossList[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // CRUD States
    const [isFormModalVisible, setIsFormModalVisible] = useState(false);
    const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState(false);

    // Form Data
    const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
    const [formData, setFormData] = useState({ name: '', plate: '' });
    const [resultModalVisible, setResultModalVisible] = useState(false);
    const [resultData, setResultData] = useState<{ title: string, message: string, type: 'success' | 'error' }>({ title: '', message: '', type: 'success' });

    const fetchAvailabilityData = useCallback(async () => {
        setIsLoading(true);
        try {
            const targetStr = selectedTab === 'd1' ? getTomorrowDateStr() : getTodayDateStr();

            // [SENIOR DEV] Usar aetherFetchAll primeiro para paginação completa
            const allDriversRaw = await aetherFetchAll(COLLECTIONS.DRIVER_STATUS);
            // Normaliza para suportar campos flat e formato _payload
            const allDrivers = (allDriversRaw || []).map((d: Record<string, unknown>) => {
                const payload = (d._payload as Record<string, unknown>) || {};
                return {
                    user_id: (d.user_id as string) || '',
                    driverName: (d.driverName as string) || (payload.driverName as string) || 'Motorista',
                    driverPlate: (d.driverPlate as string) || (payload.driverPlate as string) || 'S/Placa',
                    status: (d.status as string) || (payload.status as string) || 'active'
                };
            }).filter(d => d.status === 'active');

            // Pega todas as respostas para a data-alvo
            const allAnswersRaw = await aetherFetchAll(COLLECTIONS.DRIVER_AVAILABILITY);
            const answers = (allAnswersRaw || []).filter((a: Record<string, unknown>) => a.targetDate === targetStr) as unknown as DriverAvailability[];

            // 3. Faz o "Left Join"
            const buildList: DriverCrossList[] = allDrivers.map(base => {
                const answer = answers.find(a => a.driverId === base.user_id);

                let driverStatus: 'confirmed' | 'denied' | 'pending' = 'pending';
                if (answer) {
                    driverStatus = answer.isAvailable ? 'confirmed' : 'denied';
                }

                return {
                    id: base.user_id,
                    driverName: base.driverName,
                    driverPlate: base.driverPlate,
                    status: driverStatus,
                    shifts: answer?.shifts || undefined
                };
            });

            // Ordena listagem: Confirmados -> Pendentes -> Negados
            const orderScore = { confirmed: 1, pending: 2, denied: 3 };
            buildList.sort((a, b) => orderScore[a.status] - orderScore[b.status]);

            setCrossList(buildList);
        } catch (e) {
            console.error('[Drivers] Error fetching availability cross-join:', e);
            setCrossList([]); // Resets list securely on error
        } finally {
            setIsLoading(false);
        }
    }, [selectedTab]);

    useEffect(() => {
        fetchAvailabilityData();
    }, [fetchAvailabilityData]);

    /**
     * [AUDIT FIX — SEC-005] Guard de autorização.
     * Redireciona para login se o usuário não possuir role admin.
     */
    useEffect(() => {
        if (role !== 'admin') router.replace('/login');
    }, [role]);

    const targetDateLabel = selectedTab === 'd1' ? new Date(Date.now() + 86400000).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');

    // CRUD Handlers
    const openCreateModal = () => {
        setEditingDriverId(null);
        setFormData({ name: '', plate: '' });
        setIsFormModalVisible(true);
    };

    const openEditModal = (driver: DriverCrossList) => {
        setEditingDriverId(driver.id);
        setFormData({ name: driver.driverName, plate: driver.driverPlate });
        setIsFormModalVisible(true);
    };

    const confirmDelete = () => {
        setIsFormModalVisible(false);
        setTimeout(() => setIsDeleteModalVisible(true), 400); // Wait for form modal to hide
    };

    const isValidPlate = (p: string) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p.replace(/[^A-Z0-9]/gi, '').toUpperCase());
    const isValidName = (n: string) => n.trim().length >= 3 && /^[A-Za-zÀ-ú\s]+$/.test(n.trim());

    const handleSaveDriver = async () => {
        if (!formData.name.trim() || !formData.plate.trim()) {
            setResultData({ title: 'Atenção', message: 'Preencha o Nome e a Placa do veículo.', type: 'error' });
            setResultModalVisible(true);
            return;
        }

        if (!isValidName(formData.name)) {
            setResultData({ title: 'Nome Inválido', message: 'O nome deve ter no mínimo 3 caracteres e conter apenas letras.', type: 'error' });
            setResultModalVisible(true);
            return;
        }

        if (!isValidPlate(formData.plate)) {
            setResultData({ title: 'Placa Inválida', message: 'Use o formato Mercosul (ABC1D23) ou antigo (ABC1234), sem traços.', type: 'error' });
            setResultModalVisible(true);
            return;
        }

        setIsActionLoading(true);
        try {
            const safePlate = formData.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');

            if (editingDriverId) {
                // Update specific record
                const statuses = await aether.db.collection(COLLECTIONS.DRIVER_STATUS)
                    .query().eq('user_id', editingDriverId).get();

                if (statuses && statuses.length > 0) {
                    await aether.db.collection(COLLECTIONS.DRIVER_STATUS).update(statuses[0].id as string, {
                        driverName: formData.name,
                        driverPlate: safePlate
                    });
                }
                setResultData({ title: 'Perfil Atualizado', message: `Os dados de ${formData.name} foram salvos com sucesso.`, type: 'success' });
            } else {
                // For manual driver creation, we build a mock Driver Status since there's no native Auth yet,
                // but this will let them be matched by the dispatch engine!
                const newId = `manual_driver_${Date.now()}`;
                await aether.db.collection(COLLECTIONS.DRIVER_STATUS).create({
                    user_id: newId,
                    driverName: formData.name,
                    driverPlate: safePlate,
                    status: 'active',
                    created_at: new Date().toISOString()
                });
                setResultData({ title: 'Motorista Cadastrado', message: `${formData.name} foi adicionado à frota e já pode receber despachos manuais.`, type: 'success' });
            }

            setIsFormModalVisible(false);
            setResultModalVisible(true);
            fetchAvailabilityData(); // Refresh list

        } catch (err: any) {
            setResultData({ title: 'Erro de Banco de Dados', message: err.message || 'Falha ao salvar dados.', type: 'error' });
            setResultModalVisible(true);
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleDeleteDriver = async () => {
        if (!editingDriverId) return;

        setIsActionLoading(true);
        try {
            const statuses = await aether.db.collection(COLLECTIONS.DRIVER_STATUS)
                .query().eq('user_id', editingDriverId).get();

            if (statuses && statuses.length > 0) {
                // Soft delete to preserve history, just blocking them from matching
                await aether.db.collection(COLLECTIONS.DRIVER_STATUS).update(statuses[0].id as string, {
                    status: 'deleted'
                });
            }
            setIsDeleteModalVisible(false);
            setResultData({ title: 'Acesso Revogado', message: 'O motorista foi desativado e não aparecerá mais nas escalas.', type: 'success' });
            setResultModalVisible(true);
            fetchAvailabilityData();

        } catch (err: any) {
            setResultData({ title: 'Falha Exclusão', message: err.message, type: 'error' });
            setResultModalVisible(true);
        } finally {
            setIsActionLoading(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <LinearGradient colors={['#1a1d2e', THEME.colors.background, THEME.colors.headerBackground]} style={StyleSheet.absoluteFillObject} />

            {/* Header */}
            <View className="flex-row items-center justify-between px-6 py-4 z-20">
                <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/admin/dashboard')} className="w-10 h-10 rounded-full bg-surface border border-border items-center justify-center">
                    <ArrowLeft color="#94a3b8" size={20} />
                </TouchableOpacity>
                <View className="flex-1 items-center">
                    <Text className="text-xl font-spaceGroteskBold text-white uppercase tracking-tight">Condutores</Text>
                    <Text className="text-[#94a3b8] text-[10px] font-spaceGrotesk uppercase tracking-wider">Gestão de Escala</Text>
                </View>
                <TouchableOpacity className="w-10 h-10 rounded-full bg-surface border border-border items-center justify-center relative">
                    <Search color="#94a3b8" size={20} />
                </TouchableOpacity>
            </View>

            {/* Tabs SD / D+1 */}
            <View className="px-6 mb-4 flex-row gap-3 z-10">
                <TouchableOpacity
                    onPress={() => setSelectedTab('sd')}
                    className={`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl border ${selectedTab === 'sd' ? 'bg-primary/10 border-primary/20' : 'bg-surface border-border'}`}
                >
                    <Zap color={selectedTab === 'sd' ? THEME.colors.primary : THEME.colors.textMuted} size={16} />
                    <Text className={`font-spaceGroteskBold text-[12px] uppercase ${selectedTab === 'sd' ? 'text-primary' : 'text-[#94a3b8]'}`}>SD (Hoje)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => setSelectedTab('d1')}
                    className={`flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl border ${selectedTab === 'd1' ? 'bg-background border-text-dark' : 'bg-surface border-border'}`}
                >
                    <CalendarClock color={selectedTab === 'd1' ? "#e2e8f0" : THEME.colors.textMuted} size={16} />
                    <Text className={`font-spaceGroteskBold text-[12px] uppercase ${selectedTab === 'd1' ? 'text-text-light' : 'text-[#94a3b8]'}`}>D+1 (Amanhã)</Text>
                </TouchableOpacity>
            </View>

            <ScrollView
                className="flex-1 px-4 z-10"
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={isLoading} onRefresh={fetchAvailabilityData} tintColor={THEME.colors.primary} />}
            >
                {/* Status Summary Cards */}
                <View className="flex-row gap-2 mb-6 mt-1">
                    <View className="flex-1 bg-surface border border-border p-3 rounded-2xl items-center">
                        <Text className="text-text-muted text-[10px] font-spaceGrotesk uppercase mb-1 tracking-wider">Confirmados</Text>
                        <Text className="text-xl font-spaceGrotesk text-[#4ade80]">
                            {crossList.filter(a => a.status === 'confirmed').length}
                        </Text>
                    </View>
                    <View className="flex-1 bg-surface border border-border p-3 rounded-2xl items-center">
                        <Text className="text-text-muted text-[10px] font-spaceGrotesk uppercase mb-1 tracking-wider">Pendentes</Text>
                        <Text className="text-xl font-spaceGrotesk text-[#eab308]">
                            {crossList.filter(a => a.status === 'pending').length}
                        </Text>
                    </View>
                    <View className="flex-1 bg-surface border border-border p-3 rounded-2xl items-center">
                        <Text className="text-text-muted text-[10px] font-spaceGrotesk uppercase mb-1 tracking-wider">Ausentes</Text>
                        <Text className="text-xl font-spaceGrotesk text-[#f87171]">
                            {crossList.filter(a => a.status === 'denied').length}
                        </Text>
                    </View>
                </View>

                {/* Driver List by Selected Target */}
                <View className="mb-4 ml-1">
                    <Text className="text-[12px] font-spaceGroteskBold text-[#94a3b8] uppercase tracking-wider">Visão Consolidada ({targetDateLabel})</Text>
                </View>

                <View className="pb-28">
                    {!isLoading && crossList.length === 0 ? (
                        <View className="p-8 items-center justify-center border border-border rounded-2xl bg-surface/50 border-dashed mt-4">
                            <View className="w-16 h-16 rounded-full bg-background items-center justify-center mb-4 border border-border">
                                <User color={THEME.colors.textMuted} size={24} />
                            </View>
                            <Text className="text-white font-spaceGroteskBold text-base mb-1">Nenhum motorista</Text>
                            <Text className="text-text-muted text-[13px] font-spaceGrotesk text-center leading-relaxed">
                                Nenhum perfil de motorista localizado. Eles precisam acessar o aplicativo para criar o perfil (Status).
                            </Text>
                        </View>
                    ) : (
                        crossList.map((item) => (
                            <TouchableOpacity
                                key={item.id}
                                activeOpacity={0.7}
                                onPress={() => openEditModal(item)}
                                className="mb-3 bg-surface border border-border rounded-xl p-4 flex-row items-center"
                            >
                                {/* Current Status Icon */}
                                <View className={`w-12 h-12 rounded-full items-center justify-center border ${item.status === 'confirmed' ? 'bg-green-500/10 border-green-500/30' :
                                    item.status === 'denied' ? 'bg-red-500/10 border-red-500/30' :
                                        'bg-yellow-500/10 border-yellow-500/30'
                                    }`}>
                                    {item.status === 'confirmed' && <Check color="#4ade80" size={20} />}
                                    {item.status === 'denied' && <X color="#f87171" size={20} />}
                                    {item.status === 'pending' && <Clock color="#eab308" size={20} />}
                                </View>

                                {/* Texts */}
                                <View className="flex-1 ml-4 justify-center">
                                    <Text className="text-white font-spaceGroteskBold text-[15px]">{item.driverName}</Text>
                                    <View className="flex-row items-center mt-1">
                                        <Text className="text-[#94a3b8] text-[10px] font-spaceGrotesk uppercase tracking-wider">
                                            {item.driverPlate} •
                                            <Text className={item.status === 'pending' ? 'text-yellow-500 font-spaceGroteskBold' : item.status === 'confirmed' ? 'text-green-400 font-spaceGroteskBold' : 'text-red-400 font-spaceGroteskBold'}>
                                                {' '} {item.status === 'confirmed' ? 'Aceito' : item.status === 'denied' ? 'Ausente' : 'Pendente'}
                                            </Text>
                                        </Text>
                                    </View>
                                </View>

                                {/* Shifts */}
                                {item.status === 'confirmed' && item.shifts && (
                                    <View className="flex-row gap-1 border-l border-border pl-3 ml-2">
                                        {item.shifts.morning && <View className="bg-background border border-border w-6 h-6 items-center justify-center rounded"><Text className="text-text-light text-[10px] font-spaceGroteskBold">M</Text></View>}
                                        {item.shifts.afternoon && <View className="bg-background border border-border w-6 h-6 items-center justify-center rounded"><Text className="text-text-light text-[10px] font-spaceGroteskBold">T</Text></View>}
                                        {item.shifts.night && <View className="bg-background border border-border w-6 h-6 items-center justify-center rounded"><Text className="text-text-light text-[10px] font-spaceGroteskBold">N</Text></View>}
                                    </View>
                                )}
                                {item.status === 'pending' && (
                                    <TouchableOpacity className="ml-2 w-10 h-10 rounded-full border border-yellow-500/20 bg-yellow-500/5 items-center justify-center">
                                        <AlertCircle color="#eab308" size={16} />
                                    </TouchableOpacity>
                                )}
                            </TouchableOpacity>
                        ))
                    )}
                </View>
            </ScrollView>

            <FloatingActionButton onPress={openCreateModal} />

            <AdminBottomNav activeTab="drivers" />

            {/* Form Modal (Create/Edit) */}
            <EnterpriseModal
                visible={isFormModalVisible}
                title={editingDriverId ? "Editar Condutor" : "Novo Condutor"}
                type="form"
                onClose={() => setIsFormModalVisible(false)}
                onConfirm={handleSaveDriver}
                confirmText="Salvar Motorista"
                isLoading={isActionLoading}
            >
                <View className="gap-4">
                    <View>
                        <Text className="text-[#94a3b8] font-spaceGrotesk text-xs uppercase tracking-widest mb-2 ml-1">Nome Completo</Text>
                        <TextInput
                            value={formData.name}
                            onChangeText={(text) => setFormData({ ...formData, name: text })}
                            placeholder="Ex: Carlos Silva"
                            placeholderTextColor={THEME.colors.textMuted}
                            className="bg-background border border-border rounded-xl px-4 h-14 text-white font-spaceGrotesk text-base"
                        />
                    </View>
                    <View>
                        <Text className="text-[#94a3b8] font-spaceGrotesk text-xs uppercase tracking-widest mb-2 ml-1">Placa do Veículo</Text>
                        <TextInput
                            value={formData.plate}
                            onChangeText={(text) => setFormData({ ...formData, plate: text.toUpperCase() })}
                            placeholder="Ex: ABC1234"
                            placeholderTextColor={THEME.colors.textMuted}
                            autoCapitalize="characters"
                            maxLength={7}
                            className="bg-background border border-border rounded-xl px-4 h-14 text-white font-spaceGrotesk text-base"
                        />
                    </View>

                    {editingDriverId && (
                        <TouchableOpacity
                            onPress={confirmDelete}
                            className="mt-4 bg-red-500/10 border border-red-500/20 py-3 rounded-xl items-center flex-row justify-center gap-2"
                        >
                            <X color="#f87171" size={16} />
                            <Text className="text-red-400 font-spaceGroteskBold uppercase text-[12px] tracking-wider">
                                Remover da Frota
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            </EnterpriseModal>

            {/* Delete Confirmation Modal */}
            <EnterpriseModal
                visible={isDeleteModalVisible}
                title="Revogar Acesso?"
                description="O motorista será movido para inativo e não será mais encontrado nas importações do Gemini ou planilhas de disponibilidade."
                type="error"
                onClose={() => setIsDeleteModalVisible(false)}
                onConfirm={handleDeleteDriver}
                confirmText="Confirmar Exclusão"
                isLoading={isActionLoading}
            />

            {/* Error/Success Modal */}
            <EnterpriseModal
                visible={resultModalVisible}
                title={resultData.title}
                description={resultData.message}
                type={resultData.type}
                onClose={() => setResultModalVisible(false)}
                cancelText="OK, Entendido"
            />
        </SafeAreaView>
    );
}
