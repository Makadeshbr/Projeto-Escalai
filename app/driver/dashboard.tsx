import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl, Modal, Animated } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { THEME } from '~/src/constants/theme';
import { Bell, Zap, CheckCircle, Navigation, History, AlertTriangle, TrendingUp, User, MapPin, CheckCircle2, Package, QrCode } from 'lucide-react-native';
import { useAuthStore } from '~/src/store/auth';
import { aether, aetherFetchAll } from '~/src/lib/aether';
import { COLLECTIONS, Assignment } from '~/src/lib/collections';
import DriverBottomNav from '~/src/components/DriverBottomNav';
import { LinearGradient } from 'expo-linear-gradient';
import { EnterpriseModal } from '~/src/components/EnterpriseModal';
import { notifyAdmins, ensureDriverPushToken } from '~/src/lib/push';
import { NotificationCenter } from '~/src/components/NotificationCenter';
import { useForegroundRefresh } from '~/src/hooks/useForegroundRefresh';
import { SackQRCodeViewerModal } from '~/src/components/SackQRCodeViewerModal';
import { logger } from '~/src/lib/logger';

export default function DashboardScreen() {
    const { user } = useAuthStore();
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const assignmentsRef = useRef<Assignment[]>([]);
    assignmentsRef.current = assignments;
    const [isLoading, setIsLoading] = useState(true);
    const [showNotifications, setShowNotifications] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const [stats, setStats] = useState({ total: 0, completed: 0 });
    const [unreadCount, setUnreadCount] = useState(0);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const [showQRCodes, setShowQRCodes] = useState(false);

    const [actionModal, setActionModal] = useState({
        visible: false,
        title: '',
        message: '',
        type: 'info' as 'info' | 'error' | 'success' | 'warning',
    });

    const showModal = (title: string, message: string, type: 'info' | 'error' | 'success' | 'warning' = 'info') => {
        setActionModal({ visible: true, title, message, type });
    };

    const fetchAssignments = useCallback(async () => {
        if (!user?.id) return;
        setIsLoading(true);
        try {
            // [Self-Healing] Garante que a integridade referencial do motorista exista na tabela
            // Agora usa método direto pois as correções de RLS já estão deployadas
            try {
                const statusCheck = await aether.db.collection(COLLECTIONS.DRIVER_STATUS)
                    .query()
                    .eq('user_id', user.id)
                    .get();

                // Se não existe, cria via método direto
                if (!statusCheck || (statusCheck as any[]).length === 0) {
                    try {
                        // Envia os dados diretamente como campos flat (não como _payload)
                        // O SDK do Aether está com problema ao salvar JSON nested
                        await aether.db.collection(COLLECTIONS.DRIVER_STATUS).create({
                            user_id: user.id,
                            driverName: user.metadata?.name || user.name || user.email?.split('@')[0] || 'Motorista',
                            driverPlate: user.metadata?.vehiclePlate || 'S/Placa',
                            avatarUrl: user.metadata?.avatarUrl || '',
                            expoPushToken: user.metadata?.expoPushToken || '',
                            status: 'active',
                            updatedByAdminId: 'system_self_healing',
                            created_at: new Date().toISOString()
                        });
                        logger.debug('[Self-Healing] Driver Status criado via método direto');
                    } catch (directError: any) {
                        logger.warn('[Self-Healing] Erro no método direto:', directError.message);
                    }
                }
            } catch (healError) {
                // O erro é silencioso para não impactar a usabilidade do condutor caso haja latência de rede
                logger.warn('[Self-Healing] Erro na sincronização de auto-cura do driver_status:', healError);
            }

            // [PUSH AUTO-SYNC] Garante que o push token mais recente está no DRIVER_STATUS.
            // Executa em paralelo (fire-and-forget) para não bloquear carregamento do dashboard.
            ensureDriverPushToken(
                user.id,
                user.metadata?.name || user.name || user.email?.split('@')[0] || 'Motorista',
                user.metadata?.vehiclePlate || 'S/Placa',
                user.metadata?.avatarUrl || ''
            ).catch(err => logger.warn('[PushSync] Fire-and-forget falhou:', err));

            // [SENIOR DEV FIX] Buscamos ALL via aetherFetchAll (robusto) e filtramos local.
            // O .query() do SDK em fallback às vezes retorna vazio durante oscilações.
            const allAssignmentsRaw = await aetherFetchAll(COLLECTIONS.ASSIGNMENTS) as unknown as Assignment[];

            // Filtra as atribuições deste motorista e ignora as rotas que sofreram limpeza pelo admin (archived)
            const allAssigned = allAssignmentsRaw.filter(a => a.driverId === user.id && a.archived !== true);

            if (__DEV__) {
                console.log(`[Driver Dashboard] ID local: ${user.id}`);
                console.log(`[Driver Dashboard] Total de assignments recebidos: ${allAssignmentsRaw.length}`);
                console.log(`[Driver Dashboard] Assignments correspondendo ao ID: ${allAssigned.length}`);
            }

            if (allAssignmentsRaw.length > 0 && allAssigned.length === 0) {
                // Tenta achar pelo nome ou placa para ver se o admin salvou com ID errado
                const possibleMatches = allAssignmentsRaw.filter(a =>
                    a.driverName === user.metadata?.name ||
                    a.driverName === user.name
                );
                if (possibleMatches.length > 0) {
                    logger.debug(`[Driver Dashboard WARNING] Achei ${possibleMatches.length} assignments com SEU NOME, mas com ID diferente! ID salvo: ${possibleMatches[0].driverId}`);
                }
            }

            if (allAssigned) {
                // [HOTFIX] Inclusão de "in_progress" para não colocar rotas que liberaram doca num Limbo visual 
                const pendingOrConfirmed = allAssigned.filter(a => a.status === 'pending' || a.status === 'confirmed' || a.status === 'in_progress');
                logger.debug(`[Driver Dashboard] Destes, pending/confirmed/in_progress: ${pendingOrConfirmed.length}`);

                // Sort to show the earliest created first
                pendingOrConfirmed.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                setAssignments(pendingOrConfirmed);

                const completed = allAssigned.filter(a => a.status === 'completed').length;

                // Calculates unread notifications (not completed and flag driverDidReadNotification is false/undefined)
                const unread = allAssigned.filter(a => a.status !== 'completed' && !a.driverDidReadNotification).length;

                setStats({ total: allAssigned.length, completed });
                setUnreadCount(unread);
            }
        } catch (e) {
            logger.error('[Dashboard] Erro fetching assignments:', e);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    /**
     * Setup do ciclo de vida: subscribe realtime + polling fallback de 15s.
     * Detecta novas rotas atribuídas e mudanças de status em tempo real.
     * O motorista vê novas atribuições aparecerem sem precisar recarregar.
     */
    useEffect(() => {
        let unsubscribe: (() => void) | undefined;

        if (!user?.id) return;

        fetchAssignments();

        // Subscribe realtime na coleção de assignments
        try {
            unsubscribe = aether.db.collection(COLLECTIONS.ASSIGNMENTS)
                .subscribe((updatedData: any) => {
                    if (!updatedData) return;

                    // Tratamento seguro para diferentes formatos de payload
                    let payload = updatedData;
                    if (updatedData.type === 'DELETE') {
                        payload = updatedData.old_record || {};
                    } else if (updatedData._payload) {
                        payload = updatedData._payload;
                    } else if (updatedData.record) {
                        payload = updatedData.record;
                    }

                    const updateId = payload.id || updatedData.id;
                    const explicitlyOwned = (payload.driverId || updatedData.driverId) === user.id;

                    // Se a atualização parcial for referente a um ID de rota que o motorista 
                    // já sabe que é dele (armazenado no Ref), então ele refetch.
                    const isCurrentlyAssigned = assignmentsRef.current.some(a => a.id === updateId);

                    // [SENIOR FIX - AUTO CLEAN] Se a mudança foi um arquivamento (Faxina do Admin) de uma rota atual, repuxa dados
                    if (payload.archived === true && isCurrentlyAssigned) {
                        logger.debug('[Realtime DriverDash] Faxina detectada (Archived: true). Expulsando da tela.');
                        // Delete Instantâneo da Tela (Evita pisca-pisca de Load)
                        setAssignments(prev => prev.filter(a => a.id !== updateId));
                        fetchAssignments(); // Refaz pra atualizar contadores
                        return;
                    }

                    // Só refetch se a mudança for relacionada a ESTE motorista
                    if (explicitlyOwned || isCurrentlyAssigned) {
                        logger.debug('[Realtime DriverDash] Mudança detectada para este motorista (Update ID):', updateId);
                        fetchAssignments();
                    }
                });
        } catch (subErr) {
            logger.warn('[Realtime DriverDash] Subscribe indisponível, usando apenas polling:', subErr);
        }

        // Polling de 15s como fallback
        const interval = setInterval(() => {
            fetchAssignments();
        }, 15000);

        return () => {
            if (unsubscribe) unsubscribe();
            clearInterval(interval);
        };
    }, [user, fetchAssignments]);

    // [SENIOR FIX] Recupera os dados instantaneamente quando o celular volta para foreground
    useForegroundRefresh(fetchAssignments);

    /**
     * [SENIOR UX] Controla a Animação do Sino Baseado no Conto de Não Lidas
     */
    useEffect(() => {
        if (unreadCount > 0 && !showNotifications) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.25, duration: 450, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 450, useNativeDriver: true })
                ])
            ).start();
        } else {
            pulseAnim.stopAnimation();
            pulseAnim.setValue(1);
        }
    }, [unreadCount, showNotifications]);

    const handleConfirmRead = useCallback(async (assignmentId: string) => {
        setIsConfirming(true);
        try {
            await aether.db.collection(COLLECTIONS.ASSIGNMENTS).update(assignmentId, {
                status: 'confirmed'
            });
            showModal('Leitura Confirmada', 'Sua leitura foi registrada. Dirija com segurança!', 'success');

            // Notifica admins que o motorista confirmou a rota
            const confirmed = assignments.find(a => a.id === assignmentId);
            try {
                const driverLabel = confirmed?.driverName || user?.metadata?.name || 'Motorista';
                const cityLabel = confirmed?.cityName || 'destino';
                await notifyAdmins(
                    'ROTA CONFIRMADA PELO MOTORISTA ✅',
                    `${driverLabel} confirmou leitura da rota para ${cityLabel}.`
                );
            } catch (pushErr) {
                logger.warn('[Fault Tolerance] Push admin falhou:', pushErr);
            }

            await fetchAssignments(); // refresh list
        } catch (error: any) {
            showModal('Erro na Confirmação', error?.message || 'Falha ao confirmar leitura.', 'error');
        } finally {
            setIsConfirming(false);
        }
    }, [assignments, user, fetchAssignments]);

    const driverName = user?.metadata?.name || user?.email?.split('@')[0] || 'Motorista';
    const driverIdShort = user?.id ? user.id.substring(0, 6).toUpperCase() : '----';
    const punctuality = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 100;

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <LinearGradient colors={['#1a1d2e', THEME.colors.background, THEME.colors.headerBackground]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
            <FlatList
                data={assignments}
                keyExtractor={(item) => item.id}
                className="flex-1 z-10"
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={isLoading} onRefresh={fetchAssignments} tintColor={THEME.colors.primary} />}
                contentContainerStyle={{ paddingBottom: 96 }}
                ListHeaderComponent={
                    <>
                        {/* Header Profile */}
                        <View className="flex-row items-center justify-between px-6 pt-4 pb-4">
                            <View className="flex-row items-center gap-3">
                                <View className="relative">
                                    <View className="w-10 h-10 rounded-full overflow-hidden border-2 border-primary bg-surface items-center justify-center">
                                        {user?.metadata?.avatarUrl ? (
                                            <Image source={{ uri: user.metadata.avatarUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="disk" />
                                        ) : (
                                            <User color="#94a3b8" size={20} />
                                        )}
                                    </View>
                                    <View className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-[#13151f]" />
                                </View>
                                <View>
                                    <Text className="text-xs text-[#94a3b8] font-spaceGrotesk uppercase tracking-wider">ID Motorista: #{driverIdShort}</Text>
                                    <Text className="text-lg font-spaceGroteskBold leading-none text-white">{driverName}</Text>
                                </View>
                            </View>
                            <TouchableOpacity
                                onPress={() => setShowNotifications(true)}
                                className="w-10 h-10 items-center justify-center rounded-full bg-surface border border-border"
                            >
                                {unreadCount > 0 ? (
                                    <Animated.View style={{ transform: [{ scale: pulseAnim }], alignItems: 'center', justifyContent: 'center' }}>
                                        <View className="relative">
                                            <Bell color="#ef4444" size={20} />
                                            <View className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 rounded-full border border-surface items-center justify-center">
                                                <Text className="text-[9px] font-spaceGroteskBold text-white leading-none">
                                                    {unreadCount > 9 ? '9+' : unreadCount}
                                                </Text>
                                            </View>
                                        </View>
                                    </Animated.View>
                                ) : (
                                    <Bell color={THEME.colors.primary} size={20} />
                                )}
                            </TouchableOpacity>
                        </View>

                        <View className="px-4">
                            {/* Greeting */}
                            <View className="px-2 mb-4">
                                <Text className="text-3xl font-spaceGroteskBold tracking-tight text-white">Bom dia.</Text>
                                <Text className="text-[#94a3b8] mt-1 font-spaceGrotesk tracking-wide">Aqui está sua escala de hoje.</Text>
                            </View>

                            {/* Banner QR Codes — aparece se qualquer assignment ativo tem sacas */}
                            {assignments.some(a => !!a.sacas && a.sacas > 0) && (
                                <TouchableOpacity
                                    onPress={() => setShowQRCodes(true)}
                                    className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 flex-row items-center gap-3 mx-2 mb-4"
                                    activeOpacity={0.7}
                                >
                                    <View className="w-10 h-10 rounded-full bg-orange-500/20 items-center justify-center">
                                        <QrCode color="#f97316" size={20} />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-white font-spaceGroteskBold text-sm">QR Codes das Sacas</Text>
                                        <Text className="text-orange-400/70 font-spaceGrotesk text-xs">Toque para ver os QR Codes da sua rota</Text>
                                    </View>
                                </TouchableOpacity>
                            )}
                        </View>
                    </>
                }
                renderItem={({ item: assignment, index }) => (
                    <View className="px-4 mb-4">
                        <View className="relative w-full bg-surface rounded-2xl border border-border overflow-hidden shadow-lg">
                            <View className={`absolute top-0 left-0 w-1.5 h-full ${assignment.status === 'confirmed' ? 'bg-green-500' : 'bg-primary'}`} />

                            <View className="p-5 flex-row justify-between items-start border-b border-border">
                                <View className="flex-col">
                                    <Text className="text-[#94a3b8] text-xs uppercase tracking-wider font-spaceGroteskBold mb-1">
                                        Sua Atribuição {assignments.length > 1 ? `#${index + 1}` : ''}
                                    </Text>
                                    <View className="flex-row items-center gap-2">
                                        <MapPin color={THEME.colors.primary} size={18} />
                                        <Text className="text-xl font-spaceGroteskBold text-white">{assignment.cityName || 'Destino'}</Text>
                                    </View>
                                </View>
                                <View className="flex-col items-end gap-2">
                                    <View className="px-3 py-1 bg-background rounded-full border border-border">
                                        <Text className="text-xs font-spaceGroteskBold text-primary tracking-wider">
                                            {assignment.waveNumber
                                                ? assignment.waveNumber.toUpperCase()
                                                : assignment.waveLabel?.toUpperCase() || 'ONDA'}
                                        </Text>
                                    </View>
                                    {assignment.waveNumber && assignment.waveLabel && (
                                        <View className="px-2 py-0.5 bg-background/60 rounded-full border border-border/50">
                                            <Text className="text-[10px] font-spaceGrotesk text-[#94a3b8] tracking-wider">
                                                {assignment.waveLabel.toUpperCase()}
                                            </Text>
                                        </View>
                                    )}
                                    {assignment.isSdd && (
                                        <View className="px-3 py-1 bg-primary/10 rounded-full border border-primary/20 flex-row items-center gap-1">
                                            <Zap color={THEME.colors.primary} size={14} />
                                            <Text className="text-[11px] font-spaceGroteskBold text-primary tracking-widest">SDD</Text>
                                        </View>
                                    )}
                                    {!!assignment.sacas && (
                                        <View className="px-3 py-1 bg-orange-500/10 rounded-full border border-orange-500/30 flex-row items-center gap-1">
                                            <Package color="#f97316" size={14} />
                                            <Text className="text-[11px] font-spaceGroteskBold tracking-widest" style={{ color: '#f97316' }}>
                                                {assignment.sacas} SACA{assignment.sacas > 1 ? 'S' : ''}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </View>

                            <View className="p-6 flex-row justify-between items-center">
                                <View className="flex-col justify-center">
                                    <Text className="text-[#94a3b8] text-xs uppercase tracking-widest font-spaceGrotesk mb-1">Doca</Text>
                                    <Text className="text-5xl font-spaceGroteskBold text-white tracking-tighter" style={{ textShadowColor: 'rgba(217, 196, 0, 0.3)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 }}>
                                        {assignment.dock || '--'}
                                    </Text>
                                    {assignment.routeLabel ? (
                                        <View className="mt-2 bg-primary/10 border border-primary/20 px-3 py-1 rounded-lg self-start">
                                            <Text className="text-primary text-xs font-spaceGroteskBold tracking-wider">
                                                ROTA {assignment.routeLabel}
                                            </Text>
                                        </View>
                                    ) : null}
                                </View>
                                <View className="flex-col justify-center items-end gap-3">
                                    <View className="items-end bg-background px-3 py-2 rounded-xl border border-border min-w-[100px]">
                                        <Text className="text-[#94a3b8] text-[10px] uppercase tracking-widest font-spaceGrotesk">Horário</Text>
                                        <Text className="text-lg font-spaceGroteskBold text-white">
                                            {assignment.waveTime || '--:--'}
                                        </Text>
                                    </View>
                                    <View className="items-end">
                                        <Text className="text-[#94a3b8] text-[10px] uppercase tracking-widest font-spaceGrotesk">Status</Text>
                                        <Text className={`text-[13px] font-spaceGroteskBold uppercase tracking-wide mt-0.5 ${assignment.status === 'in_progress' ? 'text-blue-400' : assignment.status === 'confirmed' ? 'text-green-400' : 'text-yellow-400'}`}>
                                            {assignment.status === 'in_progress' ? 'Em Trânsito' : assignment.status === 'confirmed' ? 'Confirmado' : 'Aguardando'}
                                        </Text>
                                    </View>
                                </View>
                            </View>

                            {assignment.status === 'pending' && (
                                <View className="p-5 pt-2 bg-[#1a1d2e] border-t border-border">
                                    <TouchableOpacity
                                        onPress={() => handleConfirmRead(assignment.id)}
                                        disabled={isConfirming}
                                        className={`w-full h-14 bg-primary rounded-xl flex-row items-center justify-center gap-2 shadow-lg ${isConfirming ? 'opacity-50' : ''}`}
                                        style={{ shadowColor: THEME.colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 }}
                                    >
                                        {isConfirming ? (
                                            <ActivityIndicator size="small" color="#000" />
                                        ) : (
                                            <>
                                                <CheckCircle2 color="#000" size={20} />
                                                <Text className="text-[#13151f] font-spaceGroteskBold text-base tracking-wide uppercase">Confirmar Leitura</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    </View>
                )}
                ListEmptyComponent={
                    <View className="px-4">
                        {isLoading ? (
                            <View className="w-full p-8 bg-surface rounded-2xl border border-border items-center justify-center mb-6">
                                <ActivityIndicator size="large" color={THEME.colors.primary} />
                                <Text className="text-[#94a3b8] mt-4 font-spaceGrotesk">Buscando atribuições...</Text>
                            </View>
                        ) : (
                            <View className="w-full p-8 bg-surface rounded-2xl border border-border border-dashed items-center justify-center mb-6">
                                <View className="mb-4 bg-background w-16 h-16 rounded-full items-center justify-center border border-border">
                                    <Navigation color="#94a3b8" size={28} />
                                </View>
                                <Text className="text-white text-lg font-spaceGroteskBold text-center mb-2">Sem rotas ativas</Text>
                                <Text className="text-[#94a3b8] text-center font-spaceGrotesk leading-relaxed">
                                    Você não possui escalas em aberto para o dia de hoje. Aguarde notificações da base.
                                </Text>
                            </View>
                        )}
                    </View>
                }
                ListFooterComponent={
                    assignments.length > 0 ? (
                        <View className="px-4">
                            {/* Shortcuts */}
                            <View className="flex-row justify-between gap-4 mb-6 mt-2">
                                <TouchableOpacity className="flex-1 p-5 bg-surface rounded-2xl flex-col items-start gap-4 border border-border">
                                    <View className="w-10 h-10 rounded-full bg-[#2d3345] items-center justify-center">
                                        <History color="#e2e8f0" size={18} />
                                    </View>
                                    <View>
                                        <Text className="text-white font-spaceGrotesk text-[15px]">Progresso</Text>
                                        <Text className="text-[11px] text-[#94a3b8] font-spaceGrotesk mt-0.5">{stats.completed} finalizadas</Text>
                                    </View>
                                </TouchableOpacity>

                                <TouchableOpacity className="flex-1 p-5 bg-surface rounded-2xl flex-col items-start gap-4 border border-border">
                                    <View className="w-10 h-10 rounded-full bg-[#2d3345] items-center justify-center">
                                        <AlertTriangle color="#f87171" size={18} />
                                    </View>
                                    <View>
                                        <Text className="text-white font-spaceGrotesk text-[15px]">Reportar</Text>
                                        <Text className="text-[11px] text-[#94a3b8] font-spaceGrotesk mt-0.5">Problema/Atraso</Text>
                                    </View>
                                </TouchableOpacity>
                            </View>

                            {/* Performance Card */}
                            <View className="bg-surface border border-border rounded-2xl p-5 flex-row items-center justify-between mb-8">
                                <View>
                                    <Text className="text-white font-spaceGrotesk text-[15px]">Taxa de Conclusão</Text>
                                    <Text className="text-[11px] text-[#94a3b8] font-spaceGrotesk mt-0.5">Baseado em Histórico</Text>
                                </View>
                                <View className="flex-row items-center gap-3 bg-background border border-border px-4 py-2 rounded-xl">
                                    <View className="items-end">
                                        <Text className="text-lg font-spaceGrotesk text-[#4ade80]">{punctuality}%</Text>
                                        <View className="flex-row items-center">
                                            <TrendingUp color="#4ade80" size={10} />
                                            <Text className="text-[9px] text-[#4ade80] font-spaceGrotesk ml-1 uppercase tracking-wider">ÓTIMO</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </View>
                    ) : null
                }
            />

            <EnterpriseModal
                visible={actionModal.visible}
                title={actionModal.title}
                description={actionModal.message}
                type={actionModal.type}
                cancelText="Fechar"
                onClose={() => setActionModal(prev => ({ ...prev, visible: false }))}
            />

            {/* Central de Notificações */}
            <Modal visible={showNotifications} animationType="slide" transparent={false}>
                <View className="flex-1 bg-background">
                    <LinearGradient colors={['#1a1d2e', THEME.colors.background]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
                    <NotificationCenter visible={showNotifications} onClose={() => setShowNotifications(false)} />
                </View>
            </Modal>

            {/* Modal de QR Codes das Sacas */}
            <SackQRCodeViewerModal visible={showQRCodes} onClose={() => setShowQRCodes(false)} />

            <DriverBottomNav activeTab="dashboard" />
        </SafeAreaView>
    );
}
