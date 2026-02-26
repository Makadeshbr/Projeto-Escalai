import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { THEME } from '~/src/constants/theme';
import { ArrowLeft, Search, User, Check, X, Clock, CalendarClock, Zap, AlertCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { aether, aetherFetchAll, aetherConfig } from '~/src/lib/aether';
import { getAetherClient, isAetherClientReady } from '@aether-baas/react-native';
import { COLLECTIONS, getTomorrowDateStr, getTodayDateStr, DriverAvailability } from '~/src/lib/collections';
import AdminBottomNav from '~/src/components/AdminBottomNav';
import { EnterpriseModal } from '~/src/components/EnterpriseModal';
import { FloatingActionButton } from '~/src/components/FloatingActionButton';
import { DriverDetailModal } from '~/src/components/DriverDetailModal';
import { router } from 'expo-router';
import { TextInput } from 'react-native';
import { useAuthStore } from '~/src/store/auth';
import { DriverAvatar } from '~/src/components/ui/DriverAvatar';
import { SkeletonList } from '~/src/components/ui/Skeleton';

// Tipagem unida que cruza Base (Status) com Answer (Availability)
interface DriverCrossList {
    id: string; // driver ID
    driverName: string;
    driverPlate: string;
    avatarUrl?: string;
    status: 'confirmed' | 'denied' | 'pending' | 'inactive';
    shifts?: { morning: boolean; afternoon: boolean; night: boolean };
    /** Indica se o motorista nunca acessou o app */
    neverAccessed?: boolean;
}

/** Altura fixa de cada card na lista (72px conteúdo + 12px margin) */
const DRIVER_CARD_HEIGHT = 84;

/**
 * Card individual do motorista — memoizado para evitar re-render
 * quando outros items mudam na lista. Só re-renderiza se o item
 * ou a função onPress mudar por referência.
 */
const DriverListCard = React.memo(function DriverListCard({
    item,
    onPress,
}: {
    item: DriverCrossList;
    onPress: (driver: DriverCrossList) => void;
}) {
    return (
        <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onPress(item)}
            className="mb-3 bg-surface border border-border rounded-xl p-4 flex-row items-center"
        >
            {/* Driver Avatar + Status Badge */}
            <View className="relative">
                <DriverAvatar avatarUrl={item.avatarUrl} size={48} />
                <View
                    className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full items-center justify-center border-2 border-[#1e2332]"
                    style={{
                        backgroundColor: item.status === 'confirmed' ? '#22c55e' :
                            item.status === 'denied' ? '#ef4444' :
                                item.status === 'inactive' ? '#475569' :
                                    '#eab308'
                    }}
                >
                    {item.status === 'confirmed' && <Check color="#fff" size={10} strokeWidth={3} />}
                    {item.status === 'denied' && <X color="#fff" size={10} strokeWidth={3} />}
                    {item.status === 'pending' && <Clock color="#fff" size={10} strokeWidth={3} />}
                    {item.status === 'inactive' && <AlertCircle color="#fff" size={10} strokeWidth={3} />}
                </View>
            </View>

            {/* Textos */}
            <View className="flex-1 ml-4 justify-center">
                <Text className="text-white font-spaceGroteskBold text-[15px]">{item.driverName}</Text>
                <View className="flex-row items-center mt-1">
                    <Text className="text-[#94a3b8] text-[10px] font-spaceGrotesk uppercase tracking-wider">
                        {item.driverPlate} •
                        <Text style={{
                            fontFamily: 'SpaceGrotesk-Bold',
                            color: item.status === 'confirmed' ? '#4ade80' :
                                item.status === 'denied' ? '#f87171' :
                                    item.status === 'inactive' ? '#64748b' :
                                        '#eab308'
                        }}>
                            {' '}{item.status === 'confirmed' ? 'Aceito' :
                                item.status === 'denied' ? 'Ausente' :
                                    item.status === 'inactive' ? 'Nunca acessou' :
                                        'Pendente'}
                        </Text>
                    </Text>
                </View>
            </View>

            {/* Turnos confirmados */}
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
            {item.status === 'inactive' && (
                <View style={{ marginLeft: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(100,116,139,0.15)', borderWidth: 1, borderColor: 'rgba(100,116,139,0.2)' }}>
                    <Text style={{ color: '#64748b', fontSize: 9, fontFamily: 'SpaceGrotesk-Bold', textTransform: 'uppercase', letterSpacing: 0.8 }}>Sem app</Text>
                </View>
            )}
        </TouchableOpacity>
    );
});

export default function AdminDriversScreen() {
    const { role } = useAuthStore();
    const [selectedTab, setSelectedTab] = useState<'sd' | 'd1'>('d1');
    const [crossList, setCrossList] = useState<DriverCrossList[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // CRUD States
    const [isFormModalVisible, setIsFormModalVisible] = useState(false);
    const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState(false);

    // Form Data
    const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
    const [formData, setFormData] = useState({ name: '', plate: '' });
    const [resultModalVisible, setResultModalVisible] = useState(false);
    const [resultData, setResultData] = useState<{ title: string, message: string, type: 'success' | 'error' }>({ title: '', message: '', type: 'success' });

    // Estado para modal de detalhes do motorista
    const [selectedDriver, setSelectedDriver] = useState<DriverCrossList | null>(null);
    const [isDetailVisible, setIsDetailVisible] = useState(false);

    const fetchAvailabilityData = useCallback(async () => {
        setIsLoading(true);
        try {
            const targetStr = selectedTab === 'd1' ? getTomorrowDateStr() : getTodayDateStr();

            // 1. Busca motoristas que já logaram no app (driver_status)
            const allDriversRaw = await aetherFetchAll(COLLECTIONS.DRIVER_STATUS);
            const allDrivers = (allDriversRaw || []).map((d: Record<string, unknown>) => {
                const payload = (d._payload as Record<string, unknown>) || {};
                return {
                    user_id: (d.user_id as string) || '',
                    driverName: (d.driverName as string) || (payload.driverName as string) || 'Motorista',
                    driverPlate: (d.driverPlate as string) || (payload.driverPlate as string) || 'S/Placa',
                    avatarUrl: (d.avatarUrl as string) || '',
                    status: (d.status as string) || (payload.status as string) || 'active'
                };
            }).filter(d => d.status === 'active');

            // 2. Busca TODOS os usuários cadastrados na autenticação do Aether (inclui quem nunca logou)
            let authUsers: Array<{ id: string; name: string | null; email: string; role: string }> = [];
            try {
                if (isAetherClientReady()) {
                    const client = getAetherClient();
                    const token = typeof client.getToken === 'function' ? client.getToken() : null;

                    if (token) {
                        const projectId = aetherConfig.apiKey;
                        const resp = await fetch(
                            `${aetherConfig.baseUrl}/v1/projects/${projectId}/admin/users?limit=100`,
                            {
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json',
                                    'X-Project-ID': projectId,
                                },
                            }
                        );

                        if (resp.ok) {
                            const json = await resp.json();
                            authUsers = (json.users || []).map((u: Record<string, unknown>) => ({
                                id: u.id as string,
                                name: (u.name as string) || null,
                                email: (u.email as string) || '',
                                role: (u.role as string) || 'driver',
                            }));
                            __DEV__ && console.log(`[Drivers] Auth users carregados: ${authUsers.length} (total autenticação)`);
                        } else {
                            __DEV__ && console.warn(`[Drivers] Falha ao buscar auth users (${resp.status}), usando apenas driver_status.`);
                        }
                    }
                }
            } catch (authErr) {
                // Fallback silencioso — se falhar, mostra apenas os que já logaram
                __DEV__ && console.warn('[Drivers] Auth users indisponível, exibindo apenas driver_status:', authErr);
            }

            // 3. Mescla: identifica motoristas da auth que NÃO têm driver_status (nunca logaram)
            // Filtra apenas users com role=driver (exclui admin e outros roles)
            const driverAuthUsers = authUsers.filter(au => au.role === 'driver');
            const driverStatusUserIds = new Set(allDrivers.map(d => d.user_id));
            const neverAccessedDrivers = driverAuthUsers
                .filter(au => !driverStatusUserIds.has(au.id))
                .map(au => ({
                    user_id: au.id,
                    driverName: au.name || au.email.split('@')[0] || 'Sem nome',
                    driverPlate: 'S/PLACA',
                    avatarUrl: '',
                    status: 'active' as const,
                    neverAccessed: true,
                }));

            // 4. Une os dois arrays
            const mergedDrivers = [...allDrivers, ...neverAccessedDrivers];
            __DEV__ && console.log(`[Drivers] Total mesclado: ${mergedDrivers.length} (${allDrivers.length} logados + ${neverAccessedDrivers.length} nunca acessaram)`);

            // 5. Busca respostas de disponibilidade para a data-alvo
            const allAnswersRaw = await aetherFetchAll(COLLECTIONS.DRIVER_AVAILABILITY);
            const answers = (allAnswersRaw || []).filter((a: Record<string, unknown>) => a.targetDate === targetStr) as unknown as DriverAvailability[];

            // 6. Faz o "Left Join" com disponibilidade
            const buildList: DriverCrossList[] = mergedDrivers.map(base => {
                // Motoristas que nunca acessaram não têm disponibilidade
                if ((base as any).neverAccessed) {
                    return {
                        id: base.user_id,
                        driverName: base.driverName,
                        driverPlate: base.driverPlate,
                        avatarUrl: base.avatarUrl || undefined,
                        status: 'inactive' as const,
                        neverAccessed: true,
                    };
                }

                const answer = answers.find(a => a.driverId === base.user_id);
                let driverStatus: 'confirmed' | 'denied' | 'pending' = 'pending';
                if (answer) {
                    driverStatus = answer.isAvailable ? 'confirmed' : 'denied';
                }

                return {
                    id: base.user_id,
                    driverName: base.driverName,
                    driverPlate: base.driverPlate,
                    avatarUrl: base.avatarUrl || undefined,
                    status: driverStatus,
                    shifts: answer?.shifts || undefined
                };
            });

            // 7. Ordena: Confirmados → Pendentes → Ausentes → Inativos (nunca acessou)
            const orderScore = { confirmed: 1, pending: 2, denied: 3, inactive: 4 };
            buildList.sort((a, b) => orderScore[a.status] - orderScore[b.status]);

            setCrossList(buildList);
        } catch (e) {
            __DEV__ && console.error('[Drivers] Error fetching availability cross-join:', e);
            setCrossList([]);
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

    // CRUD handler declarado antes dos helpers do FlatList (referência necessária)
    const openEditModal = useCallback((driver: DriverCrossList) => {
        setEditingDriverId(driver.id);
        setFormData({ name: driver.driverName, plate: driver.driverPlate });
        setIsFormModalVisible(true);
    }, []);

    // ── FlatList helpers (estáveis por referência para evitar re-renders) ──

    /** Extrator de chave para reconciliação eficiente */
    const driverKeyExtractor = useCallback((item: DriverCrossList) => item.id, []);

    /** Callback de render — onPress abre modal de detalhes */
    const renderDriverItem = useCallback(({ item }: { item: DriverCrossList }) => (
        <DriverListCard item={item} onPress={(driver) => {
            setSelectedDriver(driver);
            setIsDetailVisible(true);
        }} />
    ), []);

    /** Layout pré-calculado — elimina medição de altura em runtime */
    const driverGetItemLayout = useCallback((_data: any, index: number) => ({
        length: DRIVER_CARD_HEIGHT,
        offset: DRIVER_CARD_HEIGHT * index,
        index,
    }), []);

    /** Contagens memoizadas para os summary cards (evita .filter() a cada render) */
    const statusCounts = useMemo(() => ({
        confirmed: crossList.filter(a => a.status === 'confirmed').length,
        pending: crossList.filter(a => a.status === 'pending').length,
        denied: crossList.filter(a => a.status === 'denied').length,
        inactive: crossList.filter(a => a.status === 'inactive').length,
    }), [crossList]);

    /** Lista filtrada por busca (nome ou placa) — memoizada */
    const filteredList = useMemo(() => {
        if (!searchQuery.trim()) return crossList;
        const q = searchQuery.toLowerCase();
        return crossList.filter(d =>
            d.driverName.toLowerCase().includes(q) ||
            d.driverPlate.toLowerCase().includes(q)
        );
    }, [crossList, searchQuery]);

    /** Header da lista com barra de busca + summary cards + título da seção */
    const listHeader = useMemo(() => (
        <>
            {/* Barra de Busca */}
            <View className="mb-4 relative justify-center">
                <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Buscar por nome ou placa..."
                    placeholderTextColor={THEME.colors.textMuted}
                    className="w-full bg-[#1e2332] border border-border rounded-xl py-3 pl-11 pr-4 text-white font-spaceGrotesk text-[13px]"
                />
                <View className="absolute left-4 opacity-50">
                    <Search color="#94a3b8" size={18} />
                </View>
            </View>

            {/* Summary Cards */}
            <View className="flex-row gap-2 mb-6 mt-1">
                <View className="flex-1 bg-surface border border-border p-3 rounded-2xl items-center">
                    <Text className="text-text-muted text-[10px] font-spaceGrotesk uppercase mb-1 tracking-wider">Confirmados</Text>
                    <Text className="text-xl font-spaceGrotesk text-[#4ade80]">{statusCounts.confirmed}</Text>
                </View>
                <View className="flex-1 bg-surface border border-border p-3 rounded-2xl items-center">
                    <Text className="text-text-muted text-[10px] font-spaceGrotesk uppercase mb-1 tracking-wider">Pendentes</Text>
                    <Text className="text-xl font-spaceGrotesk text-[#eab308]">{statusCounts.pending}</Text>
                </View>
                <View className="flex-1 bg-surface border border-border p-3 rounded-2xl items-center">
                    <Text className="text-text-muted text-[10px] font-spaceGrotesk uppercase mb-1 tracking-wider">Ausentes</Text>
                    <Text className="text-xl font-spaceGrotesk text-[#f87171]">{statusCounts.denied}</Text>
                </View>
                <View className="flex-1 bg-surface border border-border p-3 rounded-2xl items-center">
                    <Text className="text-text-muted text-[10px] font-spaceGrotesk uppercase mb-1 tracking-wider">Inativos</Text>
                    <Text className="text-xl font-spaceGrotesk" style={{ color: '#64748b' }}>{statusCounts.inactive}</Text>
                </View>
            </View>

            {/* Section Label */}
            <View className="mb-4 ml-1">
                <Text className="text-[12px] font-spaceGroteskBold text-[#94a3b8] uppercase tracking-wider">
                    {searchQuery.trim()
                        ? `Resultados para "${searchQuery}" (${filteredList.length})`
                        : `Visão Consolidada (${targetDateLabel})`
                    }
                </Text>
            </View>
        </>
    ), [statusCounts, targetDateLabel, searchQuery, filteredList.length]);

    // CRUD Handlers
    const openCreateModal = () => {
        setEditingDriverId(null);
        setFormData({ name: '', plate: '' });
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

            <FlatList
                data={filteredList}
                keyExtractor={driverKeyExtractor}
                renderItem={renderDriverItem}
                getItemLayout={driverGetItemLayout}
                className="flex-1 px-4 z-10"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 112 }}
                refreshControl={<RefreshControl refreshing={isLoading} onRefresh={fetchAvailabilityData} tintColor={THEME.colors.primary} />}
                ListHeaderComponent={listHeader}
                ListEmptyComponent={
                    isLoading ? (
                        <SkeletonList count={6} />
                    ) : (
                        <View className="p-8 items-center justify-center border border-border rounded-2xl bg-surface/50 border-dashed mt-4">
                            <View className="w-16 h-16 rounded-full bg-background items-center justify-center mb-4 border border-border">
                                <User color={THEME.colors.textMuted} size={24} />
                            </View>
                            <Text className="text-white font-spaceGroteskBold text-base mb-1">Nenhum motorista</Text>
                            <Text className="text-text-muted text-[13px] font-spaceGrotesk text-center leading-relaxed">
                                Nenhum perfil de motorista localizado. Eles precisam acessar o aplicativo para criar o perfil (Status).
                            </Text>
                        </View>
                    )
                }
                initialNumToRender={10}
                maxToRenderPerBatch={15}
                windowSize={5}
                removeClippedSubviews
            />

            <FloatingActionButton onPress={openCreateModal} />

            <AdminBottomNav activeTab="drivers" />

            {/* Modal de Detalhes do Motorista */}
            <DriverDetailModal
                visible={isDetailVisible}
                onClose={() => setIsDetailVisible(false)}
                driver={selectedDriver}
                onEdit={(driver) => openEditModal(driver)}
            />

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
