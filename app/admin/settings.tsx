import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator, Modal, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { THEME } from '~/src/constants/theme';
import { ArrowLeft, Settings2, ShieldAlert, Send, Clock, UserX, UserCheck, Search, Target, X, CalendarClock, Zap, CheckCircle2, AlertTriangle, LogOut, MapPin, Edit2, Plus, ChevronRight, Download, RotateCcw, BellRing } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { aether, aetherFetchAll } from '~/src/lib/aether';
import { useAuthStore } from '~/src/store/auth';
import { COLLECTIONS, getTomorrowDateStr, getTodayDateStr } from '~/src/lib/collections';
import { notifyAllDrivers, diagnosePushError } from '~/src/lib/push';
import AdminBottomNav from '~/src/components/AdminBottomNav';
import { EnterpriseModal } from '~/src/components/EnterpriseModal';
import DateSelectionModal from '~/src/components/DateSelectionModal';
import { router } from 'expo-router';
import { exportToCSV, ExportColumn } from '~/src/lib/export';
import { logAudit } from '~/src/lib/audit';

export default function AdminSettingsScreen() {
    const { logout, role } = useAuthStore();

    // Windows logic
    const [generatingWindow, setGeneratingWindow] = useState(false);
    const [activeWindows, setActiveWindows] = useState<any[]>([]);
    const [showDatePicker, setShowDatePicker] = useState(false);

    // Bulk Notifications
    const [notificationTitle, setNotificationTitle] = useState('');
    const [notificationBody, setNotificationBody] = useState('');
    const [sendingNotif, setSendingNotif] = useState(false);

    // Driver Management
    const [searchDriver, setSearchDriver] = useState('');
    const [drivers, setDrivers] = useState<any[]>([]);
    const [driversLoading, setDriversLoading] = useState(false);
    const [showDriversModal, setShowDriversModal] = useState(false);

    // RH/History Modal State
    const [selectedDriverHistory, setSelectedDriverHistory] = useState<any>(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [driverMetrics, setDriverMetrics] = useState({ routes: 0, sacas: 0, offDays: 0, sdd: 0 });
    const [driverTimeline, setDriverTimeline] = useState<any[]>([]);

    const fetchDriverHistory = async (driverData: any) => {
        setHistoryLoading(true);
        setSelectedDriverHistory(driverData);

        try {
            // Reutiliza a mesma fetch unificada baseada no ID original (user_id) ou (driverId fallback)
            const dId = driverData.user_id || driverData.driverId || driverData.id;

            // Posição Senior: Como não existe `.query()` function-based no wrapper customizado do cliente,
            // utilizamos aetherFetchAll para extrair a mass data da collection num single roundtrip,
            // e fazemos memory filter ultra-rápido para o motorista selecionado.
            const [allRawAssignments, allRawAvailability] = await Promise.all([
                aetherFetchAll(COLLECTIONS.ASSIGNMENTS) as Promise<any[]>,
                aetherFetchAll(COLLECTIONS.DRIVER_AVAILABILITY) as Promise<any[]>
            ]);

            const allAssignments = allRawAssignments.filter(item => {
                const p = item._payload || item;
                return p.driverId === dId && (p.status === 'completed' || p.status === 'confirmed');
            });

            const allAvailability = allRawAvailability.filter(item => {
                const p = item._payload || item;
                return p.driverId === dId;
            });

            const timeline: any[] = [];
            let routesCount = 0; let offDaysCount = 0; let totalSacas = 0; let sddCount = 0;

            if (allAssignments.length > 0) {
                allAssignments.forEach((doc: any) => {
                    const assignment = (doc._payload || doc);
                    if (assignment.createdAt) {
                        routesCount++;
                        if (assignment.sacas) totalSacas += assignment.sacas;
                        if (assignment.isSdd) sddCount++;

                        const dateNum = new Date(assignment.createdAt);
                        timeline.push({
                            type: 'route',
                            dateObj: dateNum,
                            dateLabel: dateNum.toLocaleDateString('pt-BR'),
                            data: assignment
                        });
                    }
                });
            }

            const routeDates = new Set(timeline.map(t => t.dateLabel));

            if (allAvailability.length > 0) {
                allAvailability.forEach((doc: any) => {
                    const availability = (doc._payload || doc);
                    const rawDateParts = availability.targetDate.split('-');
                    const parsedDate = new Date(parseInt(rawDateParts[0], 10), parseInt(rawDateParts[1], 10) - 1, parseInt(rawDateParts[2], 10));
                    const dateFormatted = parsedDate.toLocaleDateString('pt-BR');
                    const hadRouteThatDay = routeDates.has(dateFormatted);
                    const isInFuture = parsedDate > new Date();

                    if (!hadRouteThatDay && !isInFuture) {
                        offDaysCount++;
                        timeline.push({
                            type: 'off',
                            dateObj: parsedDate,
                            dateLabel: dateFormatted,
                            data: availability
                        });
                    }
                });
            }

            timeline.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

            setDriverMetrics({ routes: routesCount, sacas: totalSacas, offDays: offDaysCount, sdd: sddCount });
            setDriverTimeline(timeline.slice(0, 30)); // Mostra os últimos 30 registros

        } catch (error: any) {
            console.error('[AdminRH] Falha ao extrair relatorio de motorista:', error);
            showModal('Erro', 'Não foi possível compilar o histórico do motorista.', 'error');
            setSelectedDriverHistory(null);
        } finally {
            setHistoryLoading(false);
        }
    };

    // Custom Modal State
    const [actionModal, setActionModal] = useState({
        visible: false,
        title: '',
        message: '',
        type: 'info' as 'info' | 'error' | 'success' | 'confirm' | 'warning',
        onConfirm: () => { }
    });

    // Cities Management
    const [cities, setCities] = useState<any[]>([]);
    const [citiesLoading, setCitiesLoading] = useState(false);
    const [showCityModal, setShowCityModal] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [editingCityId, setEditingCityId] = useState<string | null>(null);
    const [cityFormData, setCityFormData] = useState({ state: '', name: '' });

    const fetchCities = async () => {
        setCitiesLoading(true);
        try {
            const data = await aetherFetchAll(COLLECTIONS.CITIES);
            if (data) {
                const sorted = (data as any[]).sort((a, b) => {
                    const nameA = a.name || a._payload?.name || '';
                    const nameB = b.name || b._payload?.name || '';
                    return nameA.localeCompare(nameB);
                });
                setCities(sorted);
            }
        } catch (e) {
            console.error('Error fetching cities:', e);
        } finally {
            setCitiesLoading(false);
        }
    };

    const openCityModal = (city?: any) => {
        if (city) {
            setEditingCityId(city.id);
            setCityFormData({
                name: city.name || city._payload?.name || '',
                state: city.state || city._payload?.state || ''
            });
        } else {
            setEditingCityId(null);
            setCityFormData({ name: '', state: '' });
        }
        setShowCityModal(true);
    };

    const handleSaveCity = async () => {
        if (!cityFormData.name.trim() || !cityFormData.state.trim()) {
            showModal('Atenção', 'Preencha o Nome da Cidade e UF.', 'error');
            return;
        }

        setIsActionLoading(true);
        try {
            const payload = {
                name: cityFormData.name.trim(),
                state: cityFormData.state.trim().toUpperCase()
            };

            if (editingCityId) {
                await aether.db.collection(COLLECTIONS.CITIES).update(editingCityId, payload);
                showModal('Praça Atualizada', `A cidade ${payload.name} foi atualizada com sucesso.`, 'success');
            } else {
                await aether.db.collection(COLLECTIONS.CITIES).create({
                    ...payload,
                    createdAt: new Date().toISOString()
                });
                showModal('Praça Criada', `${payload.name} já pode ser detectada pela Inteligência Artificial.`, 'success');
            }
            setShowCityModal(false);
            fetchCities();
        } catch (e: any) {
            showModal('Erro', e.message || 'Falha ao salvar cidade.', 'error');
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleDeleteCity = async (id: string, name: string) => {
        showModal('Remover Praça?', `A cidade ${name} deixará de ser reconhecida automaticamente. Continuar?`, 'confirm', async () => {
            setActionModal(prev => ({ ...prev, visible: false }));
            setIsActionLoading(true);
            try {
                await aether.db.collection(COLLECTIONS.CITIES).delete(id);
                showModal('Praça Removida', 'Cidade excluída da base de dados.', 'success');
                fetchCities();
            } catch (e: any) {
                showModal('Falha na Exclusão', e.message, 'error');
            } finally {
                setIsActionLoading(false);
            }
        });
    };

    const showModal = (title: string, message: string, type: 'info' | 'error' | 'success' | 'confirm' | 'warning' = 'info', onConfirm?: () => void) => {
        setActionModal({ visible: true, title, message, type, onConfirm: onConfirm || (() => setActionModal(prev => ({ ...prev, visible: false }))) });
    };

    const checkWindowStatus = async () => {
        try {
            const allWindowsRaw = await aether.db.collection(COLLECTIONS.AVAILABILITY_WINDOWS).query().eq('isOpen', true).get() as any[];
            let active: any[] = [];

            if (allWindowsRaw && allWindowsRaw.length > 0) {
                // Obtenha hoje e amanhã para taguear no título se coincidir
                const todStr = getTodayDateStr();
                const tomStr = getTomorrowDateStr();

                active = allWindowsRaw.map(win => {
                    let typeLabel = '';
                    if (win.targetDate === todStr) typeLabel = 'SDD (Hoje)';
                    else if (win.targetDate === tomStr) typeLabel = 'D+1 (Amanhã)';
                    else typeLabel = 'Programada';

                    return {
                        ...win,
                        label: `${typeLabel}: ${win.targetDate.split('-').reverse().join('/')}`
                    };
                });

                // Ordenar da mais recente/futura para a mais antiga
                active.sort((a, b) => a.targetDate.localeCompare(b.targetDate));
            }

            setActiveWindows(active);
        } catch (e) {
            console.error('[Settings] Erro verificação janela:', e);
        }
    };

    const handleDeleteWindow = async (windowId: string, label: string) => {
        showModal('Cancelar Operação', `Tem certeza que deseja DELETAR a janela aberta para ${label}? Isso removerá a escala ativa do sistema.`, 'confirm', async () => {
            setActionModal(prev => ({ ...prev, visible: false }));
            setGeneratingWindow(true);
            try {
                // [SENIOR DEV] Cascade delete: Also delete all driver responses for this window
                const existingResponses = await aether.db.collection(COLLECTIONS.DRIVER_AVAILABILITY)
                    .query().eq('windowId', windowId).get();

                if (existingResponses && (existingResponses as any[]).length > 0) {
                    await Promise.all((existingResponses as any[]).map(res =>
                        aether.db.collection(COLLECTIONS.DRIVER_AVAILABILITY).delete(res.id)
                    ));
                    console.log(`Cascade deleted ${(existingResponses as any[]).length} responses for window ${windowId}`);
                }

                await aether.db.collection(COLLECTIONS.AVAILABILITY_WINDOWS).delete(windowId);
                showModal('Escala Deletada', `A janela de ${label} foi removida com sucesso. Todas as respostas vinculadas a ela foram excluídas.`, 'success');
                checkWindowStatus();
            } catch (e: any) {
                showModal('Falha na Exclusão', e?.message || 'Erro ao deletar janela.', 'error');
            } finally {
                setGeneratingWindow(false);
            }
        });
    };

    useEffect(() => {
        checkWindowStatus();
        fetchCities();
    }, []);

    /**
     * [AUDIT FIX — SEC-005] Guard de autorização.
     * Redireciona para login se o usuário não possuir role admin.
     */
    useEffect(() => {
        if (role !== 'admin') router.replace('/login');
    }, [role]);

    const handleGenerateWindowFromDate = async (targetStr: string) => {
        const [year, month, day] = targetStr.split('-');
        const labelStr = `${day}/${month}/${year}`;

        showModal(
            `Abrir Disponibilidade`,
            `Deseja abrir a janela para os motoristas enviarem a escala para a data ${labelStr}? O sistema enviará um Push Notifications para a base.`,
            'confirm',
            async () => {
                setActionModal(prev => ({ ...prev, visible: false }));
                setGeneratingWindow(true);
                try {
                    const existing = await aether.db.collection(COLLECTIONS.AVAILABILITY_WINDOWS).query().eq('targetDate', targetStr).get();

                    if (existing && existing.length > 0) {
                        showModal('Ação Recusada', `Já existe uma janela aberta para a data ${labelStr}.`, 'error');
                    } else {
                        await aether.db.collection(COLLECTIONS.AVAILABILITY_WINDOWS).create({
                            targetDate: targetStr,
                            openedAt: new Date().toISOString(),
                            isOpen: true
                        });

                        try {
                            const result = await notifyAllDrivers(
                                'NOVA ESCALA LIBERADA 🚀',
                                `A janela de disponibilidade para o dia ${labelStr} foi aberta. Acesse o app para preencher e garantir sua vaga!`
                            );
                            let msg = `A disponibilidade para ${labelStr} foi liberada. Push entregue para ${result.sent}/${result.total} motoristas.`;
                            if (result.skipped > 0) {
                                msg += `\n\n⚠️ Sem push token: ${result.missingTokenDrivers.join(', ')}`;
                            }
                            showModal('Janela Aberta!', msg, result.skipped > 0 ? 'warning' : 'success');
                        } catch (pushErr: any) {
                            const reason = diagnosePushError(pushErr);
                            console.warn('[Defesa] Push em lote falhou:', reason);
                            showModal('Janela Aberta (Sem Push)', `A janela para ${labelStr} foi aberta com sucesso no sistema.\n\nMotivo do push não enviado: ${reason}`, 'warning');
                        }

                        checkWindowStatus();
                    }
                } catch (e: any) {
                    showModal('Falha na Operação', e?.message || 'Erro inesperado ao gerar janela.', 'error');
                } finally {
                    setGeneratingWindow(false);
                }
            }
        );
    };

    const handleSendNotification = async () => {
        const safeTitle = notificationTitle.trim().substring(0, 100);
        const safeBody = notificationBody.trim().substring(0, 500);

        if (!safeTitle || !safeBody) {
            showModal('Atenção', 'Preencha o título e a mensagem da notificação antes de tentar enviar.', 'error');
            return;
        }

        if (safeTitle.length < 3) {
            showModal('Título Muito Curto', 'O título precisa ter no mínimo 3 caracteres.', 'error');
            return;
        }

        if (safeBody.length < 3) {
            showModal('Mensagem Muito Curta', 'A mensagem precisa ter no mínimo 3 caracteres.', 'error');
            return;
        }

        showModal(
            'Confirmar Disparo',
            'Deseja enviar esta mensagem para a tela de TODOS os motoristas que possuem o app instalado (mesmo fechado)?',
            'confirm',
            async () => {
                setActionModal(prev => ({ ...prev, visible: false }));
                setSendingNotif(true);
                try {
                    const result = await notifyAllDrivers(safeTitle, safeBody);
                    let successMsg = `Notificação disparada para ${result.sent} de ${result.total} motorista(s).`;
                    if (result.skipped > 0) {
                        successMsg += `\n\n⚠️ ${result.skipped} motorista(s) SEM push token (não receberão):\n• ${result.missingTokenDrivers.join('\n• ')}\n\nEsses motoristas precisam abrir o app para ativar as notificações.`;
                    }
                    showModal('Push Enviado', successMsg, result.skipped > 0 ? 'warning' : 'success');
                    setNotificationTitle('');
                    setNotificationBody('');
                } catch (e: any) {
                    showModal('Falha no Envio', diagnosePushError(e), 'error');
                } finally {
                    setSendingNotif(false);
                }
            }
        );
    };

    const fetchDriversForManagement = async () => {
        setDriversLoading(true);
        try {
            // [SENIOR DEV] Usar aetherFetchAll para paginação completa
            const data = await aetherFetchAll(COLLECTIONS.DRIVER_STATUS);
            if (data && (data as any[]).length > 0) {
                // Normalize data to support both flat columns and _payload format
                const normalizedData = (data as any[]).map(d => ({
                    id: d.id,
                    user_id: d.user_id,
                    driverName: d.driverName || d._payload?.driverName || 'Motorista',
                    driverPlate: d.driverPlate || d._payload?.driverPlate || 'S/Placa',
                    status: d.status || d._payload?.status || 'active',
                    expoPushToken: d.expoPushToken || d._payload?.expoPushToken || ''
                }));
                setDrivers(normalizedData);
            } else {
                showModal('Aviso da Frota', 'Não há motoristas cadastrados ou nenhum motorista habilitou sua conta/app.', 'info');
                setShowDriversModal(false);
            }
        } catch (e: any) {
            console.error('[Settings] Error fetching driver statuses:', e);
            showModal('Acesso Recusado', 'Erro ao ler banco de motoristas. Verifique Regras RLS.', 'error');
        } finally {
            setDriversLoading(false);
        }
    };

    const toggleDriverBlock = async (recordId: string, currentStatus: string) => {
        try {
            const newStatus = currentStatus === 'blocked' ? 'active' : 'blocked';
            // Support both flat columns and _payload format
            await aether.db.collection(COLLECTIONS.DRIVER_STATUS).update(recordId, {
                status: newStatus,
                _payload: {
                    status: newStatus,
                    updatedAt: new Date().toISOString()
                }
            });
            showModal('Status Atualizado', `A conta do motorista foi ${newStatus === 'blocked' ? 'bloqueada' : 'desbloqueada'}.`, 'success');
            fetchDriversForManagement();
        } catch (e: any) {
            showModal('Alteração Recusada', 'Não foi possível alterar o status. Seu usuário não tem poder administrativo no Banco de Dados.', 'error');
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <LinearGradient colors={['#1a1d2e', THEME.colors.background, THEME.colors.headerBackground]} style={StyleSheet.absoluteFillObject} />

            {/* Header */}
            <View className="flex-row items-center justify-between px-6 py-4 z-20">
                <View>
                    <Text className="text-2xl font-spaceGroteskBold tracking-tight text-white mb-1">Ajustes</Text>
                    <Text className="text-xs font-spaceGrotesk text-[#94a3b8] uppercase tracking-[0.1em]">SISTEMA ADMIN</Text>
                </View>
                <View className="w-10 h-10 rounded-full bg-surface border border-border items-center justify-center">
                    <Settings2 color={THEME.colors.primary} size={20} />
                </View>
            </View>

            <ScrollView className="flex-1 px-4 z-10" showsVerticalScrollIndicator={false}>

                {/* Section: Janela de Disponibilidade */}
                <View className="mb-6">
                    <Text className="text-[13px] font-spaceGroteskBold text-text-light uppercase tracking-wider mb-3 ml-1">Fluxo de Escala</Text>
                    <View className="bg-surface border border-border rounded-2xl p-5">
                        <View className="flex-row items-center gap-3 mb-4">
                            <View className="w-10 h-10 rounded-full bg-background items-center justify-center border border-border">
                                <Clock color={THEME.colors.primary} size={18} />
                            </View>
                            <View className="flex-1">
                                <Text className="text-white font-spaceGroteskBold text-[15px]">Janelas Ativas</Text>
                                <Text className="text-text-muted font-spaceGrotesk text-[11px] mt-1">Gerencie aberturas de turnos.</Text>
                            </View>
                        </View>

                        {/* List rendering */}
                        {activeWindows.length === 0 ? (
                            <Text className="text-text-muted font-spaceGrotesk text-[12px] mb-4 text-center">Nenhuma janela aberta no momento.</Text>
                        ) : (
                            <View className="mb-4 gap-2">
                                {activeWindows.map((win, idx) => (
                                    <View key={idx} className="flex-row items-center justify-between bg-background border border-border p-3 rounded-xl">
                                        <Text className="text-text-light font-spaceGroteskBold text-[13px]">{win.label}</Text>
                                        <TouchableOpacity
                                            onPress={() => handleDeleteWindow(win.id, win.label)}
                                            className="w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20 items-center justify-center"
                                        >
                                            <X color="#f87171" size={14} />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}

                        <View className="flex-col gap-3">
                            <TouchableOpacity
                                onPress={() => setShowDatePicker(true)}
                                disabled={generatingWindow}
                                className={`w-full bg-background border border-border py-4 rounded-xl items-center flex-row justify-center gap-3 shadow-lg ${generatingWindow ? 'opacity-50' : ''}`}
                            >
                                <CalendarClock color="#e2e8f0" size={18} />
                                <Text className="text-text-light font-spaceGrotesk tracking-wider uppercase text-[13px]">Nova Janela de Escala</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                {/* Section: Bloqueio de Motoristas */}
                <View className="mb-6">
                    <Text className="text-[13px] font-spaceGroteskBold text-text-light uppercase tracking-wider mb-3 ml-1">Controle de Frota</Text>
                    <View className="bg-surface border border-border rounded-2xl p-5">
                        <View className="flex-row items-center gap-3 mb-4">
                            <View className="w-10 h-10 rounded-full bg-background items-center justify-center border border-border">
                                <ShieldAlert color="#e2e8f0" size={18} />
                            </View>
                            <View className="flex-1">
                                <Text className="text-white font-spaceGroteskBold text-[15px]">Bloqueio de Contas</Text>
                                <Text className="text-text-muted font-spaceGrotesk text-[11px] mt-1">Gerencie acessos ao app de condutores.</Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            onPress={() => { fetchDriversForManagement(); setShowDriversModal(true); }}
                            className="bg-background border border-border py-3.5 rounded-xl flex-row items-center justify-center gap-2"
                        >
                            <Target color={THEME.colors.primary} size={16} />
                            <Text className="text-text-light font-spaceGroteskBold text-[13px] tracking-wide uppercase">Localizar Motorista</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Section: Comunicação Push */}
                <View className="mb-16">
                    <Text className="text-[13px] font-spaceGroteskBold text-text-light uppercase tracking-wider mb-3 ml-1">Comunicação em Massa</Text>
                    <View className="bg-surface border border-border rounded-2xl p-5">
                        <View className="flex-row items-center gap-3 mb-4">
                            <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center border border-primary/20">
                                <Send color={THEME.colors.primary} size={18} />
                            </View>
                            <View className="flex-1">
                                <Text className="text-white font-spaceGroteskBold text-[15px]">Push Notificações</Text>
                                <Text className="text-text-muted font-spaceGrotesk text-[11px] mt-1">Envie alertas diretamente para os celulares da frota.</Text>
                            </View>
                        </View>

                        <TextInput
                            value={notificationTitle}
                            onChangeText={setNotificationTitle}
                            placeholder="Título da Mensagem"
                            placeholderTextColor={THEME.colors.textMuted}
                            maxLength={100}
                            className="bg-background border border-border rounded-xl py-3 px-4 text-white font-spaceGrotesk text-[13px] mb-3"
                        />
                        <TextInput
                            value={notificationBody}
                            onChangeText={setNotificationBody}
                            placeholder="Conteúdo da Mensagem..."
                            placeholderTextColor={THEME.colors.textMuted}
                            multiline
                            numberOfLines={3}
                            maxLength={500}
                            className="bg-background border border-border rounded-xl py-3 px-4 text-white font-spaceGrotesk text-[13px] mb-4 h-24 text-top"
                        />

                        <TouchableOpacity
                            onPress={handleSendNotification}
                            disabled={sendingNotif}
                            className={`bg-primary py-3.5 rounded-xl items-center ${sendingNotif ? 'opacity-50' : ''}`}
                            style={{ shadowColor: THEME.colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 }}
                        >
                            {sendingNotif ? (
                                <ActivityIndicator color="#000" size="small" />
                            ) : (
                                <Text className="text-[#13151f] font-spaceGroteskBold text-[13px] tracking-wide uppercase">Disparar Notificação</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
                {/* Section: Gestão de Praças (Cidades) */}
                <View className="mb-6">
                    <Text className="text-[13px] font-spaceGroteskBold text-text-light uppercase tracking-wider mb-3 ml-1">Logística Direcionada</Text>
                    <View className="bg-surface border border-border rounded-2xl p-5">
                        <View className="flex-row items-center justify-between mb-4">
                            <View className="flex-row items-center gap-3 flex-1">
                                <View className="w-10 h-10 rounded-full bg-background items-center justify-center border border-border">
                                    <MapPin color={THEME.colors.primary} size={18} />
                                </View>
                                <View className="flex-1">
                                    <Text className="text-white font-spaceGroteskBold text-[15px]">Praças (Cidades)</Text>
                                    <Text className="text-text-muted font-spaceGrotesk text-[11px] mt-1">Regiões listadas na IA.</Text>
                                </View>
                            </View>
                            <TouchableOpacity
                                onPress={() => openCityModal()}
                                className="w-10 h-10 bg-primary/10 border border-primary/20 items-center justify-center rounded-xl"
                            >
                                <Plus color={THEME.colors.primary} size={20} />
                            </TouchableOpacity>
                        </View>

                        {/* List of Cities */}
                        {citiesLoading ? (
                            <ActivityIndicator color={THEME.colors.primary} size="small" className="my-4" />
                        ) : cities.length === 0 ? (
                            <Text className="text-text-muted font-spaceGrotesk text-[12px] text-center my-4">Nenhuma praça encontrada.</Text>
                        ) : (
                            <View className="max-h-60 rounded-xl overflow-hidden border border-border bg-background">
                                <ScrollView nestedScrollEnabled scrollEnabled={true} showsVerticalScrollIndicator={true} className="p-2">
                                    {cities.map((city, idx) => {
                                        const name = city.name || city._payload?.name || '';
                                        const state = city.state || city._payload?.state || '';
                                        return (
                                            <View key={city.id} className={`flex-row items-center justify-between p-3 ${idx !== cities.length - 1 ? 'border-b border-border/50' : ''}`}>
                                                <View className="flex-1 flex-row items-center gap-2">
                                                    <View className="bg-surface px-2 py-0.5 rounded border border-border">
                                                        <Text className="text-[#94a3b8] font-spaceGroteskBold text-[10px] uppercase">{state}</Text>
                                                    </View>
                                                    <Text className="text-text-light font-spaceGroteskBold text-[13px]">{name}</Text>
                                                </View>

                                                <View className="flex-row gap-2">
                                                    <TouchableOpacity
                                                        onPress={() => openCityModal(city)}
                                                        className="w-8 h-8 rounded-full bg-surface items-center justify-center border border-border"
                                                    >
                                                        <Edit2 color="#94a3b8" size={14} />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        onPress={() => handleDeleteCity(city.id, name)}
                                                        className="w-8 h-8 rounded-full bg-red-500/10 items-center justify-center border border-red-500/20"
                                                    >
                                                        <X color="#f87171" size={14} />
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        );
                                    })}
                                </ScrollView>
                            </View>
                        )}
                    </View>
                </View>

                {/* Section: Ações em Lote */}
                <View className="mb-6">
                    <Text className="text-[13px] font-spaceGroteskBold text-text-light uppercase tracking-wider mb-3 ml-1">Ações em Lote</Text>
                    <View className="bg-surface border border-border rounded-2xl p-5 gap-3">
                        {/* Exportar Frota */}
                        <TouchableOpacity
                            onPress={async () => {
                                try {
                                    const allDrivers = await aetherFetchAll(COLLECTIONS.DRIVER_STATUS);
                                    if (!allDrivers || (allDrivers as any[]).length === 0) {
                                        showModal('Vazio', 'Nenhum motorista encontrado para exportar.', 'warning');
                                        return;
                                    }
                                    await exportToCSV(
                                        allDrivers as Record<string, unknown>[],
                                        [
                                            { key: 'driverName', label: 'Nome' },
                                            { key: 'driverPlate', label: 'Placa' },
                                            { key: 'status', label: 'Status' },
                                            { key: 'createdAt', label: 'Criado em' },
                                        ] as ExportColumn<Record<string, unknown>>[],
                                        `frota_escalai_${new Date().toISOString().slice(0, 10)}`,
                                    );
                                } catch (e: any) {
                                    showModal('Erro', e.message || 'Falha ao exportar.', 'error');
                                }
                            }}
                            className="flex-row items-center gap-4 py-3 px-1"
                        >
                            <View className="w-10 h-10 rounded-full bg-green-500/10 items-center justify-center border border-green-500/20">
                                <Download color="#4ade80" size={18} />
                            </View>
                            <View className="flex-1">
                                <Text className="text-white font-spaceGroteskBold text-[14px]">Exportar Frota (CSV)</Text>
                                <Text className="text-[#94a3b8] font-spaceGrotesk text-[11px] mt-0.5">Download de todos os motoristas em planilha</Text>
                            </View>
                            <ChevronRight color="#4b5563" size={16} />
                        </TouchableOpacity>

                        <View className="h-[1px] bg-border" />

                        {/* Resetar Disponibilidades */}
                        <TouchableOpacity
                            onPress={() => {
                                showModal(
                                    'Resetar Disponibilidades',
                                    'Isso removerá TODAS as disponibilidades de TODOS os motoristas para a data de amanhã. Só use se precisar reabrir a janela de escala. Esta ação NÃO pode ser desfeita.',
                                    'confirm',
                                    async () => {
                                        setActionModal(p => ({ ...p, visible: false }));
                                        try {
                                            const tomorrowStr = getTomorrowDateStr();
                                            const all = await aetherFetchAll(COLLECTIONS.DRIVER_AVAILABILITY);
                                            const toDelete = (all as any[]).filter((a: any) => a.targetDate === tomorrowStr);
                                            let deleted = 0;
                                            for (const item of toDelete) {
                                                await aether.db.collection(COLLECTIONS.DRIVER_AVAILABILITY).delete(item.id);
                                                deleted++;
                                            }
                                            showModal('Concluído', `${deleted} disponibilidade(s) de ${tomorrowStr} removidas. A janela pode ser reaberta.`, 'success');
                                            logAudit('admin', 'Admin', 'batch.reset_availability', `Reset de ${deleted} disponibilidades para ${tomorrowStr}`, { count: deleted, targetDate: tomorrowStr });
                                        } catch (e: any) {
                                            showModal('Erro', e.message || 'Falha ao resetar.', 'error');
                                        }
                                    }
                                );
                            }}
                            className="flex-row items-center gap-4 py-3 px-1"
                        >
                            <View className="w-10 h-10 rounded-full bg-amber-500/10 items-center justify-center border border-amber-500/20">
                                <RotateCcw color="#f59e0b" size={18} />
                            </View>
                            <View className="flex-1">
                                <Text className="text-white font-spaceGroteskBold text-[14px]">Resetar Disponibilidades</Text>
                                <Text className="text-[#94a3b8] font-spaceGrotesk text-[11px] mt-0.5">Remove respostas de D+1 para reabrir escala</Text>
                            </View>
                            <ChevronRight color="#4b5563" size={16} />
                        </TouchableOpacity>

                        <View className="h-[1px] bg-border" />

                        {/* Notificar Todos */}
                        <TouchableOpacity
                            onPress={() => {
                                showModal(
                                    'Push em Massa',
                                    'Enviar notificação push para TODOS os motoristas com token cadastrado. Use para avisos urgentes.',
                                    'confirm',
                                    async () => {
                                        setActionModal(p => ({ ...p, visible: false }));
                                        handleSendNotification();
                                    }
                                );
                            }}
                            className="flex-row items-center gap-4 py-3 px-1"
                        >
                            <View className="w-10 h-10 rounded-full bg-blue-500/10 items-center justify-center border border-blue-500/20">
                                <BellRing color="#60a5fa" size={18} />
                            </View>
                            <View className="flex-1">
                                <Text className="text-white font-spaceGroteskBold text-[14px]">Push em Massa</Text>
                                <Text className="text-[#94a3b8] font-spaceGrotesk text-[11px] mt-0.5">Notificar todos os motoristas ativos</Text>
                            </View>
                            <ChevronRight color="#4b5563" size={16} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Section: Logout */}
                <View className="mt-4 pb-32">
                    <Text className="text-[13px] font-spaceGroteskBold text-text-light uppercase tracking-wider mb-3 ml-1">Conta & Segurança</Text>

                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => showModal('Encerrar Sessão', 'Tem certeza que deseja desconectar sua conta administrativa deste aparelho?', 'confirm', async () => {
                            try {
                                setActionModal(p => ({ ...p, visible: false }));
                                await aether.tenantAuth.signOut();
                                logout();
                                router.replace('/');
                            } catch (error) {
                                console.error('Error logging out:', error);
                            }
                        })}
                        className="bg-surface border border-border rounded-2xl p-5 flex-row items-center justify-between shadow-sm"
                    >
                        <View className="flex-row items-center gap-4">
                            <View className="w-12 h-12 rounded-full bg-red-500/10 items-center justify-center border border-red-500/20">
                                <LogOut color="#f87171" size={22} />
                            </View>
                            <View>
                                <Text className="text-red-400 font-spaceGroteskBold text-[15px]">Desconectar Sistema</Text>
                                <Text className="text-text-muted font-spaceGrotesk text-[11px] mt-1">Sair de forma segura do painel.</Text>
                            </View>
                        </View>
                        <ChevronRight color="#475569" size={20} />
                    </TouchableOpacity>
                </View>
            </ScrollView>

            <AdminBottomNav activeTab="settings" />

            {/* Modal - Gerenciar Motoristas */}
            <Modal visible={showDriversModal} animationType="slide" transparent>
                <View className="flex-1 bg-black/80 justify-end">
                    <View className="bg-surface rounded-t-3xl max-h-[85%] border-t border-border">
                        <View className="flex-row items-center justify-between p-6 border-b border-border bg-[#1a1d2e] rounded-t-3xl">
                            <Text className="text-white font-spaceGroteskBold text-lg">Controle de Motoristas</Text>
                            <TouchableOpacity onPress={() => setShowDriversModal(false)} className="w-8 h-8 bg-background items-center justify-center rounded-full">
                                <X color="#94a3b8" size={18} />
                            </TouchableOpacity>
                        </View>

                        <View className="px-6 py-4">
                            <View className="relative justify-center">
                                <TextInput
                                    value={searchDriver}
                                    onChangeText={setSearchDriver}
                                    placeholder="Buscar por placa, nome ou email..."
                                    placeholderTextColor={THEME.colors.textMuted}
                                    className="w-full bg-background border border-border rounded-xl py-3 pl-11 pr-4 text-white font-spaceGrotesk text-[13px]"
                                />
                                <View className="absolute left-4 opacity-50">
                                    <Search color="#94a3b8" size={18} />
                                </View>
                            </View>
                        </View>

                        {driversLoading ? (
                            <View className="py-20 items-center">
                                <ActivityIndicator color={THEME.colors.primary} size="large" />
                            </View>
                        ) : (
                            <FlatList
                                data={drivers.filter(d => {
                                    const name = (d.driverName || d._payload?.driverName || '').toLowerCase();
                                    const plate = (d.driverPlate || d._payload?.driverPlate || '').toLowerCase();
                                    const search = searchDriver.toLowerCase();
                                    return name.includes(search) || plate.includes(search);
                                })}
                                keyExtractor={(item) => item.id}
                                contentContainerStyle={{ paddingBottom: 40 }}
                                renderItem={({ item }) => (
                                    <View className="flex-row items-center justify-between px-6 py-4 border-b border-border/50 hover:bg-white/5">
                                        <View className="flex-row items-center flex-1">
                                            <View className={`w-10 h-10 rounded-full items-center justify-center border ${item.status === 'blocked' ? 'bg-red-500/10 border-red-500/20' : 'bg-background border-border'}`}>
                                                {item.status === 'blocked' ? <UserX color="#f87171" size={18} /> : <UserCheck color="#e2e8f0" size={18} />}
                                            </View>
                                            <View className="ml-4 flex-1">
                                                <Text className="text-white font-spaceGroteskBold text-[15px]" numberOfLines={1}>{item.driverName || 'Motorista'}</Text>
                                                <Text className="text-[#94a3b8] font-spaceGrotesk text-[11px] mt-0.5 tracking-wider uppercase">
                                                    {item.driverPlate || 'S/Placa'} • {item.status === 'blocked' ? 'BLOQUEADO' : 'ATIVO'}
                                                </Text>
                                            </View>
                                        </View>

                                        <View className="flex-row gap-2 flex-shrink-0">
                                            <TouchableOpacity
                                                onPress={() => fetchDriverHistory(item)}
                                                className="w-10 h-10 rounded-full bg-blue-500/10 items-center justify-center border border-blue-500/20"
                                            >
                                                <Target color="#3b82f6" size={16} />
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                onPress={() => toggleDriverBlock(item.id, item.status)}
                                                className={`px-4 flex-row items-center justify-center border rounded-lg ${item.status === 'blocked' ? 'border-primary/50 bg-primary/10' : 'border-red-500/50 bg-red-500/10'}`}
                                            >
                                                <Text className={`font-spaceGroteskBold text-[11px] uppercase tracking-wide ${item.status === 'blocked' ? 'text-primary' : 'text-red-400'}`}>
                                                    {item.status === 'blocked' ? 'Desbloquear' : 'Bloquear'}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}
                            />
                        )}
                    </View>
                </View>
            </Modal>
            {/* Modal de Ações Genéricas (Sucesso, Erro, Confirm) */}
            <Modal visible={actionModal.visible} animationType="fade" transparent>
                <View className="flex-1 bg-black/80 justify-center items-center px-6">
                    <View className="bg-surface border border-border w-full rounded-3xl p-6 items-center">
                        <View className={`w-16 h-16 rounded-full items-center justify-center mb-5 ${actionModal.type === 'error' ? 'bg-red-500/10' : actionModal.type === 'success' ? 'bg-primary/10' : 'bg-blue-500/10'}`}>
                            {actionModal.type === 'error' && <AlertTriangle color="#f87171" size={28} />}
                            {actionModal.type === 'warning' && <AlertTriangle color="#fbbf24" size={28} />}
                            {actionModal.type === 'success' && <CheckCircle2 color={THEME.colors.primary} size={28} />}
                            {actionModal.type === 'confirm' && <ShieldAlert color="#3b82f6" size={28} />}
                            {actionModal.type === 'info' && <ShieldAlert color="#94a3b8" size={28} />}
                        </View>

                        <Text className="text-white font-spaceGroteskBold text-xl text-center mb-2">{actionModal.title}</Text>
                        <Text className="text-[#94a3b8] font-spaceGrotesk text-[14px] text-center mb-8 leading-relaxed">
                            {actionModal.message}
                        </Text>

                        <View className="w-full flex-row gap-3">
                            {actionModal.type === 'confirm' && (
                                <TouchableOpacity
                                    className="flex-1 bg-background border border-border rounded-xl py-3.5 items-center"
                                    onPress={() => setActionModal(p => ({ ...p, visible: false }))}
                                >
                                    <Text className="text-[#94a3b8] font-spaceGroteskBold uppercase text-[13px]">Cancelar</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                className={`flex-1 rounded-xl py-3.5 items-center ${actionModal.type === 'error' ? 'bg-red-500/20 border-red-500/30' :
                                    actionModal.type === 'warning' ? 'bg-yellow-500/20 border-yellow-500/30' :
                                        actionModal.type === 'success' ? 'bg-primary/20 border-primary/30' :
                                            'bg-blue-500/20 border-blue-500/30'
                                    }`}
                                onPress={async () => {
                                    if (actionModal.type === 'confirm' && actionModal.onConfirm) {
                                        await actionModal.onConfirm();
                                    } else {
                                        setActionModal(p => ({ ...p, visible: false }));
                                    }
                                }}
                            >
                                <Text className={`font-spaceGroteskBold uppercase text-[13px] ${actionModal.type === 'error' ? 'text-red-400' :
                                    actionModal.type === 'warning' ? 'text-yellow-400' :
                                        actionModal.type === 'success' ? 'text-primary' :
                                            'text-blue-400'
                                    }`}>
                                    {actionModal.type === 'confirm' ? 'Confirmar' : 'Entendi'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Modal - Create/Edit City */}
            <EnterpriseModal
                visible={showCityModal}
                title={editingCityId ? "Editar Praça" : "Nova Praça Logística"}
                type="form"
                onClose={() => setShowCityModal(false)}
                onConfirm={handleSaveCity}
                confirmText="Salvar Praça"
                isLoading={isActionLoading}
            >
                <View className="gap-4">
                    <View>
                        <Text className="text-[#94a3b8] font-spaceGrotesk text-xs uppercase tracking-widest mb-2 ml-1">UF (Estado)</Text>
                        <TextInput
                            value={cityFormData.state}
                            onChangeText={(text) => setCityFormData({ ...cityFormData, state: text.toUpperCase() })}
                            placeholder="Ex: SP"
                            placeholderTextColor={THEME.colors.textMuted}
                            autoCapitalize="characters"
                            maxLength={2}
                            className="bg-background border border-border rounded-xl px-4 h-14 text-white font-spaceGrotesk text-base"
                        />
                    </View>
                    <View>
                        <Text className="text-[#94a3b8] font-spaceGrotesk text-xs uppercase tracking-widest mb-2 ml-1">Nome da Cidade</Text>
                        <TextInput
                            value={cityFormData.name}
                            onChangeText={(text) => setCityFormData({ ...cityFormData, name: text })}
                            placeholder="Ex: São Paulo"
                            placeholderTextColor={THEME.colors.textMuted}
                            className="bg-background border border-border rounded-xl px-4 h-14 text-white font-spaceGrotesk text-base"
                        />
                    </View>
                </View>
            </EnterpriseModal>

            <DateSelectionModal
                visible={showDatePicker}
                onClose={() => setShowDatePicker(false)}
                onSelectDate={handleGenerateWindowFromDate}
            />
        </SafeAreaView >
    );
}
