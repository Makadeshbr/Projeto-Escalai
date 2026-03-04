import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Image, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Clock, MapPin, UserCheck, UserMinus, ShieldAlert, Send } from 'lucide-react-native';
import { THEME } from '~/src/constants/theme';
import { aetherFetchAll } from '~/src/lib/aether';
import { COLLECTIONS, formatBrazilTime } from '~/src/lib/collections';
import { sendPushNotification } from '~/src/lib/push';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { logger } from '~/src/lib/logger';

type DetailedDriver = {
    id: string;
    userId: string;
    name: string;
    plate: string;
    avatarUrl: string;
    phone?: string;
    expoPushToken?: string;
    type: 'available' | 'unavailable' | 'pending';
    respondedAt?: string; // [ENTERPRISE] Horário em que respondeu (BRT)
};

export default function WindowDetailsScreen() {
    const { id, title, date } = useLocalSearchParams();
    const windowId = id as string;

    const [loading, setLoading] = useState(true);
    const [sendingPush, setSendingPush] = useState(false);
    const [activeTab, setActiveTab] = useState<'available' | 'unavailable' | 'pending'>('available');

    const [driversData, setDriversData] = useState<{
        available: DetailedDriver[],
        unavailable: DetailedDriver[],
        pending: DetailedDriver[]
    }>({
        available: [],
        unavailable: [],
        pending: []
    });

    useEffect(() => {
        if (!windowId) return;
        loadDrivers();
    }, [windowId]);

    const loadDrivers = async () => {
        try {
            setLoading(true);
            const allDrivers = await aetherFetchAll(COLLECTIONS.DRIVER_STATUS) as any[];
            const allAvailability = await aetherFetchAll(COLLECTIONS.DRIVER_AVAILABILITY) as any[];

            const windowResponses = allAvailability.filter(a => {
                return (a._payload?.windowId || a.windowId) === windowId;
            });

            const availables: DetailedDriver[] = [];
            const unavailables: DetailedDriver[] = [];
            const pendings: DetailedDriver[] = [];

            allDrivers.forEach(driver => {
                const driverId = driver.user_id || driver._payload?.user_id || driver.id;

                const response = windowResponses.find(r => {
                    const fKey = r.driverId || r._payload?.driverId || r.user_id || r._payload?.user_id || r.userId || r._payload?.userId;
                    return fKey === driverId;
                });

                // [ENTERPRISE] Extrai o timestamp de resposta (respondedAt → createdAt como fallback)
                const rawRespondedAt = response?.respondedAt || response?._payload?.respondedAt
                    || response?.createdAt || response?._payload?.createdAt || null;

                const mappedDriver: DetailedDriver = {
                    id: driver.id,
                    userId: driverId,
                    name: driver.driverName || driver._payload?.driverName || 'Motorista Desconhecido',
                    plate: driver.driverPlate || driver._payload?.driverPlate || '---',
                    avatarUrl: driver.avatarUrl || driver._payload?.avatarUrl,
                    phone: driver.phone || driver._payload?.phone,
                    expoPushToken: driver.expoPushToken || driver._payload?.expoPushToken,
                    respondedAt: rawRespondedAt,
                    type: 'pending'
                };

                if (response) {
                    const isAvail = response.isAvailable ?? response._payload?.isAvailable;
                    if (isAvail === true) {
                        mappedDriver.type = 'available';
                        availables.push(mappedDriver);
                    } else if (isAvail === false) {
                        mappedDriver.type = 'unavailable';
                        unavailables.push(mappedDriver);
                    } else {
                        pendings.push(mappedDriver);
                    }
                } else {
                    pendings.push(mappedDriver);
                }
            });

            setDriversData({
                available: availables,
                unavailable: unavailables,
                pending: pendings
            });

            // Auto-selecionar aba com dados vazios se a inicial estiver vazia
            if (availables.length === 0) {
                if (unavailables.length > 0) setActiveTab('unavailable');
                else setActiveTab('pending');
            }
        } catch (error) {
            logger.error('[WindowDetails]', 'Erro ao carregar motoristas:', error);
            Alert.alert('Erro', 'Não foi possível carregar os dados desta janela.');
        } finally {
            setLoading(false);
        }
    };

    const handleCobrarPendentes = async () => {
        const pendingTokens = driversData.pending
            .map(d => d.expoPushToken)
            .filter(t => t && t.trim() !== '') as string[];

        if (pendingTokens.length === 0) {
            Alert.alert('Aviso', 'Nenhum dos motoristas pendentes possui um aparelho com notificações ativas.');
            return;
        }

        Alert.alert(
            'Cobrar Pendentes',
            `Deseja enviar notificação Push para os ${pendingTokens.length} motoristas que não responderam a escala?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Cobrar',
                    style: 'default',
                    onPress: async () => {
                        setSendingPush(true);
                        try {
                            await sendPushNotification(
                                pendingTokens,
                                'Lembrete de Escala ⚠️',
                                `Você ainda não informou sua disponibilidade para a janela: ${title}. Responda agora no App!`,
                                { type: 'availability_reminder', windowId }
                            );
                            Alert.alert('Sucesso', 'Notificação de cobrança enviada aos pendentes.');
                        } catch (error: any) {
                            Alert.alert('Erro ao enviar cobrança', error.message || 'Erro desconhecido.');
                        } finally {
                            setSendingPush(false);
                        }
                    }
                }
            ]
        );
    };

    const renderTabButton = (tab: 'available' | 'unavailable' | 'pending', label: string, count: number, BaseIcon: any, colorCode: string, bgClassActive: string) => {
        const isActive = activeTab === tab;
        return (
            <TouchableOpacity
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.8}
                className={`flex-1 flex-row items-center justify-center py-3 rounded-xl border transition-colors ${isActive ? bgClassActive + ' border-' + colorCode + '-500/30' : 'bg-white/5 border-white/5'
                    }`}
            >
                <BaseIcon size={14} color={isActive ? THEME.colors[colorCode as keyof typeof THEME.colors] || colorCode : '#94a3b8'} className="mr-2" />
                <Text className={`text-xs font-spaceGroteskBold mr-1 ${isActive ? 'text-white' : 'text-slate-400'}`}>
                    {label}
                </Text>
                <View className={`px-1.5 rounded-md ${isActive ? 'bg-white/20' : 'bg-white/10'}`}>
                    <Text className={`text-[10px] font-spaceGroteskBold ${isActive ? 'text-white' : 'text-slate-400'}`}>{count}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    const renderDriverItem = ({ item, index }: { item: DetailedDriver, index: number }) => {
        // [ENTERPRISE] Formata o horário de resposta em BRT para exibição
        const respondedTimeLabel = item.respondedAt
            ? formatBrazilTime(item.respondedAt)
            : null;

        return (
            <Animated.View entering={FadeInDown.delay(index * 50).springify()} className="mb-3">
                <View className="flex-row items-center p-4 bg-[#151722] rounded-2xl border border-white/5">
                    {/* Avatar Moderno */}
                    <View className="relative w-12 h-12 rounded-full bg-slate-800 border-2 border-surface overflow-hidden mr-4">
                        {item.avatarUrl ? (
                            <Image source={{ uri: item.avatarUrl }} style={{ width: '100%', height: '100%' }} />
                        ) : (
                            <View className="w-full h-full items-center justify-center bg-sky-900/30">
                                <Text className="text-sky-400 font-spaceGroteskBold text-lg">
                                    {item.name.charAt(0).toUpperCase()}
                                </Text>
                            </View>
                        )}
                        {/* Indicador de Status */}
                        <View className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#151722] ${activeTab === 'available' ? 'bg-emerald-400' :
                            activeTab === 'unavailable' ? 'bg-red-500' : 'bg-slate-500'
                            }`} />
                    </View>

                    <View className="flex-1">
                        <Text className="text-white font-spaceGroteskBold text-base mb-1" numberOfLines={1}>{item.name}</Text>

                        {/* Placa com estilo Metal/Mercosul */}
                        <View className="flex-row items-center gap-2">
                            <View className="bg-slate-200 px-2 py-0.5 rounded-sm border-t-2 border-sky-600 flex-row items-center shadow-sm">
                                <Text className="text-[10px] font-spaceGroteskBold text-slate-800 tracking-widest">{item.plate}</Text>
                            </View>

                            {/* [ENTERPRISE] Badge de horário de resposta */}
                            {respondedTimeLabel && activeTab !== 'pending' && (
                                <View className="flex-row items-center gap-1 bg-white/5 px-2 py-0.5 rounded-md">
                                    <Clock size={10} color="#64748b" />
                                    <Text className="text-[9px] font-spaceGrotesk text-slate-400">
                                        {respondedTimeLabel}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>

                    {/* Badge status do app */}
                    {activeTab === 'pending' && !item.expoPushToken && (
                        <View className="bg-red-500/10 px-2 py-1 rounded border border-red-500/20">
                            <Text className="text-[9px] text-red-400 font-spaceGroteskBold">App Desinstalado</Text>
                        </View>
                    )}

                    {/* [ENTERPRISE] Badge "Não respondeu" para pendentes */}
                    {activeTab === 'pending' && item.expoPushToken && (
                        <View className="bg-slate-800/80 px-2 py-1 rounded border border-white/5">
                            <Text className="text-[9px] text-slate-400 font-spaceGroteskBold">Aguardando</Text>
                        </View>
                    )}
                </View>
            </Animated.View>
        );
    };

    return (
        <View className="flex-1 bg-background">
            {/* Header Glassmorphism */}
            <View className="bg-[#10121a]/90 backdrop-blur-xl border-b border-border z-10 pt-12 pb-4 px-4">
                <View className="flex-row items-center justify-between mb-4">
                    <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 rounded-full bg-white/5 items-center justify-center border border-white/5">
                        <ArrowLeft color="#fff" size={20} />
                    </TouchableOpacity>
                    <View className="flex-1 px-3">
                        <Text className="text-white text-base font-spaceGroteskBold text-center" numberOfLines={1}>
                            {title || 'Detalhes da Escala'}
                        </Text>
                        {date && (
                            <Text className="text-slate-400 text-xs font-spaceGrotesk text-center uppercase tracking-widest mt-0.5">
                                {date}
                            </Text>
                        )}
                    </View>
                    <View className="w-10 h-10" />
                </View>

                {/* Tabs de Status */}
                <View className="flex-row justify-between gap-2 mt-2">
                    {renderTabButton('available', 'Diponíveis', driversData.available.length, UserCheck, 'emerald', 'bg-emerald-500/10')}
                    {renderTabButton('unavailable', 'Recusas', driversData.unavailable.length, UserMinus, 'red', 'bg-red-500/10')}
                    {renderTabButton('pending', 'Pendentes', driversData.pending.length, Clock, '#64748b', 'bg-slate-800/80')}
                </View>
            </View>

            {/* Listagem */}
            {loading ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color={THEME.colors.primary} />
                </View>
            ) : (
                <FlatList
                    data={driversData[activeTab]}
                    keyExtractor={(item) => item.id}
                    renderItem={renderDriverItem}
                    contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                    ListEmptyComponent={
                        <View className="flex-1 items-center justify-center mt-20 opacity-50">
                            <ShieldAlert color="#64748b" size={48} className="mb-4" />
                            <Text className="text-slate-400 font-spaceGrotesk text-base text-center">Nenhum motorista neste grupo.</Text>
                        </View>
                    }
                />
            )}

            {/* Floating Banner para Avisar Pendentes */}
            {!loading && activeTab === 'pending' && driversData.pending.length > 0 && (
                <View className="absolute bottom-6 left-4 right-4 items-center">
                    <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={handleCobrarPendentes}
                        disabled={sendingPush}
                        className="bg-primary px-5 py-4 rounded-2xl flex-row items-center justify-center gap-3 w-full shadow-lg"
                        style={{ shadowColor: THEME.colors.primary, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 }}
                    >
                        {sendingPush ? (
                            <ActivityIndicator color="#000" />
                        ) : (
                            <>
                                <Send color="#000" size={18} />
                                <Text className="font-spaceGroteskBold text-black text-sm uppercase tracking-wide">
                                    Cobrar Restantes (Push)
                                </Text>
                                <View className="bg-black/20 px-2 py-0.5 rounded-full ml-1">
                                    <Text className="font-spaceGroteskBold text-black text-xs">{driversData.pending.length}</Text>
                                </View>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}
