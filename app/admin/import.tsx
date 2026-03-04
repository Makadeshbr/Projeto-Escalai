import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Modal, TextInput, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, UploadCloud, FileText, CheckCircle2, AlertTriangle, Play, RefreshCw, X, CalendarClock, Zap, Calendar } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { THEME } from '~/src/constants/theme';
import { aether, aetherFetchAll } from '~/src/lib/aether';
import { useAuthStore } from '~/src/store/auth';
import { COLLECTIONS, DriverAvailability, Assignment, getTodayDateStr, getTomorrowDateStr, City, formatBrazilTimestamp } from '~/src/lib/collections';
import { parseLogisticsSheet, RouteDraft } from '~/src/lib/gemini';
import ImportPreviewTable from '~/src/components/ImportPreviewTable';
import { notifyDriver, isExpoGo } from '~/src/lib/push';

export default function ImportRouteScreen() {
    const { user, role } = useAuthStore();
    const [isProcessing, setIsProcessing] = useState(false);
    const [filesCount, setFilesCount] = useState(0);
    const [routes, setRoutes] = useState<RouteDraft[]>([]);
    const [loadingStep, setLoadingStep] = useState(0);

    // Image/PDF Previews
    const [selectedImages, setSelectedImages] = useState<{ uri: string; mimeType: string; name: string }[]>([]);

    // Engine State
    const [availableDrivers, setAvailableDrivers] = useState<DriverAvailability[]>([]);
    const [knownDatabaseCities, setKnownDatabaseCities] = useState<City[]>([]);
    const [validationMap, setValidationMap] = useState<Record<string, boolean>>({});

    // [ENTERPRISE FIX] Remoção da opção D+1. O processo agora é determinístico para Today.
    const isSameDay = true;

    // Action Modal
    const [modalVisible, setModalVisible] = useState(false);
    const [isDispatching, setIsDispatching] = useState(false);

    // [ENTERPRISE FIX] Tracking exato de lote para o usuário não se sentir cego
    const [dispatchProgress, setDispatchProgress] = useState({ current: 0, total: 0 });

    // Execution Result Modal
    const [resultModalVisible, setResultModalVisible] = useState(false);
    const [resultData, setResultData] = useState<{ title: string, message: string, type: 'success' | 'partial' | 'error' }>({ title: '', message: '', type: 'success' });

    // City Automation Modal
    const [unlistedCitiesModalVisible, setUnlistedCitiesModalVisible] = useState(false);
    const [pendingCitiesToRegister, setPendingCitiesToRegister] = useState<string[]>([]);
    const [isRegisteringCities, setIsRegisteringCities] = useState(false);

    /**
     * [FIX F5] Normaliza registros de disponibilidade do Aether REST.
     * Extraído para escopo do módulo — evita duplicação de código.
     * @param raw - Registro bruto da API (pode ter campos em _payload)
     * @returns Objeto DriverAvailability normalizado
     */
    const normalizeAvailability = useCallback((raw: any): DriverAvailability => {
        const p = raw._payload || raw;
        return {
            id: raw.id || p.id || '',
            driverId: p.driverId || raw.driverId || '',
            driverName: p.driverName || raw.driverName || '',
            driverPlate: (p.driverPlate || raw.driverPlate || '').toUpperCase(),
            windowId: p.windowId || raw.windowId || '',
            targetDate: p.targetDate || raw.targetDate || '',
            isAvailable: p.isAvailable ?? raw.isAvailable ?? true,
            shifts: p.shifts || raw.shifts || { morning: true },
            lockedAt: p.lockedAt || raw.lockedAt || '',
            createdAt: p.createdAt || raw.createdAt || '',
        };
    }, []);

    const loadDriversForEngine = useCallback(async () => {
        try {
            const targetDateStr = isSameDay ? getTodayDateStr() : getTomorrowDateStr();

            // [SENIOR DEV] Carrega motoristas de AMBAS as fontes:
            // 1. DRIVER_AVAILABILITY (quem sinalizou disponibilidade p/ o dia) — fonte primária
            // 2. DRIVER_STATUS (todos cadastrados no app) — fallback para matching por placa
            const [availabilityRecords, statusRecords, citiesRaw] = await Promise.all([
                aetherFetchAll(COLLECTIONS.DRIVER_AVAILABILITY),
                aetherFetchAll(COLLECTIONS.DRIVER_STATUS),
                aetherFetchAll(COLLECTIONS.CITIES),
            ]);

            setKnownDatabaseCities(citiesRaw as unknown as City[]);

            // Normaliza e filtra pela data alvo
            const allNormalized = (availabilityRecords as any[]).map(normalizeAvailability);
            const dateFiltered = allNormalized.filter(r => r.targetDate === targetDateStr);

            // Cria mapa de placas já presentes na disponibilidade do dia
            const knownPlates = new Set(
                dateFiltered.map(d => d.driverPlate.replace(/[^A-Z0-9]/g, ''))
            );

            // Motoristas cadastrados no app que NÃO estão na disponibilidade do dia
            const statusFallback = (statusRecords as any[])
                .filter(s => {
                    const p = s._payload || s;
                    const plate = (p.driverPlate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                    const status = p.status || 'active';
                    return plate && status !== 'blocked' && status !== 'deleted' && !knownPlates.has(plate);
                })
                .map(s => {
                    const p = s._payload || s;
                    return {
                        id: s.id,
                        driverId: p.user_id || p.driverId || s.id,
                        driverName: p.driverName || 'Motorista',
                        driverPlate: (p.driverPlate || '').toUpperCase(),
                        windowId: '',
                        targetDate: targetDateStr,
                        isAvailable: true,
                        shifts: { morning: true },
                        lockedAt: '',
                        createdAt: p.createdAt || '',
                    } as DriverAvailability;
                });

            // Merge: disponibilidade do dia + fallback de cadastrados
            const mergedDrivers = [...dateFiltered, ...statusFallback];

            setAvailableDrivers(mergedDrivers);
            recalculateValidationMap(routes, mergedDrivers);
        } catch (e) {
            console.error('[ImportEngine] Falha ao carregar motoristas para matchmaker:', e);
        }
    }, [isSameDay, routes]);

    useEffect(() => {
        loadDriversForEngine();
    }, [isSameDay]);

    /**
     * [AUDIT FIX — SEC-005] Guard de autorização.
     * Redireciona para login se o usuário não possuir role admin.
     */
    useEffect(() => {
        if (role !== 'admin') router.replace('/login');
    }, [role]);

    const recalculateValidationMap = (currentRoutes: RouteDraft[], drivers: DriverAvailability[]) => {
        const map: Record<string, boolean> = {};
        currentRoutes.forEach(route => {
            const cleanTarget = route.driverPlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
            const match = drivers.some(d => d.driverPlate.toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanTarget);
            map[cleanTarget] = match;
        });
        setValidationMap(map);
    };

    // [ENTERPRISE FIX] Intercepta clique de upload para garantir pré-carregamento dos drivers de HOJE 
    const handleUploadPress = async () => {
        try {
            const targetDateStr = getTodayDateStr();
            const [availabilityRecords, statusRecords] = await Promise.all([
                aetherFetchAll(COLLECTIONS.DRIVER_AVAILABILITY),
                aetherFetchAll(COLLECTIONS.DRIVER_STATUS),
            ]);

            // [FIX F5] Usa normalizeAvailability extraída (sem duplicação)
            const allNormalized = (availabilityRecords as any[]).map(normalizeAvailability);
            const dateFiltered = allNormalized.filter(r => r.targetDate === targetDateStr);
            const knownPlates = new Set(dateFiltered.map(d => d.driverPlate.replace(/[^A-Z0-9]/g, '')));

            const statusFallback = (statusRecords as any[])
                .filter(s => {
                    const p = s._payload || s;
                    const plate = (p.driverPlate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                    const status = p.status || 'active';
                    return plate && status !== 'blocked' && status !== 'deleted' && !knownPlates.has(plate);
                })
                .map(s => {
                    const p = s._payload || s;
                    return {
                        id: s.id, driverId: p.user_id || p.driverId || s.id,
                        driverName: p.driverName || 'Motorista',
                        driverPlate: (p.driverPlate || '').toUpperCase(),
                        windowId: '', targetDate: targetDateStr, isAvailable: true,
                        shifts: { morning: true },
                        lockedAt: '', createdAt: p.createdAt || '',
                    } as DriverAvailability;
                });

            const mergedDrivers = [...dateFiltered, ...statusFallback];
            setAvailableDrivers(mergedDrivers);
        } catch (e) {
            console.error('[ImportEngine] Falha ao pré-carregar drivers para Hoje:', e);
        }

        handlePickDocument();
    };

    const handlePickDocument = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'image/jpeg', 'image/png'],
                copyToCacheDirectory: true,
                multiple: true,
            });

            if (result.canceled || !result.assets || result.assets.length === 0) return;

            // [SENIOR FEATURE] Accumulate selected images for preview before AI processing
            const newImages = result.assets.map(file => ({
                uri: file.uri,
                mimeType: file.mimeType || 'application/pdf',
                name: file.name
            }));

            setSelectedImages(prev => [...prev, ...newImages]);
            setFilesCount(prev => prev + newImages.length);

        } catch (err: any) {
            setResultData({ title: 'Erro', message: err.message || 'Falha ao ler documento.', type: 'error' });
            setResultModalVisible(true);
        }
    };

    const handleProcessImages = async () => {
        if (selectedImages.length === 0) return;

        setIsProcessing(true);
        setLoadingStep(0);

        // Animated loading sequence simulation to keep user engaged
        const stepInterval = setInterval(() => {
            setLoadingStep(prev => (prev < 3 ? prev + 1 : prev));
        }, 1800);

        try {
            // Processa todas as imagens da fila sequencialmente ou em paralelo seguro
            let allFormattedRoutes: any[] = [];

            for (const img of selectedImages) {
                const base64 = await FileSystem.readAsStringAsync(img.uri, { encoding: 'base64' });
                const extractedRoutes = await parseLogisticsSheet(base64, img.mimeType);

                // Auto Format Plates
                const formatted = extractedRoutes.map(r => ({
                    ...r,
                    driverPlate: r.driverPlate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
                }));
                allFormattedRoutes = [...allFormattedRoutes, ...formatted];
            }

            // [FIX F1] Deduplicação: remove rotas com mesma placa+doca que já existam na tabela
            setRoutes(prev => {
                const existingKeys = new Set(
                    prev.map(r => `${r.driverPlate.replace(/[^A-Z0-9]/g, '')}_${r.dock}`)
                );
                const uniqueNewRoutes = allFormattedRoutes.filter(r => {
                    const key = `${r.driverPlate.replace(/[^A-Z0-9]/g, '')}_${r.dock}`;
                    if (existingKeys.has(key)) return false;
                    existingKeys.add(key); // Evita duplicatas dentro do próprio lote novo
                    return true;
                });
                const accumulated = [...prev, ...uniqueNewRoutes];
                recalculateValidationMap(accumulated, availableDrivers);
                return accumulated;
            });

            // Cross-check cities
            if (knownDatabaseCities.length > 0) {
                const uniqueExtractedCities = Array.from(new Set(allFormattedRoutes.map(r => r.city.trim().toUpperCase())));
                const knownCityNames = knownDatabaseCities.map((c: any) => c.name.trim().toUpperCase());

                const unlistedCities = uniqueExtractedCities.filter(extCity => !knownCityNames.includes(extCity));

                if (unlistedCities.length > 0) {
                    setPendingCitiesToRegister(unlistedCities);
                    setUnlistedCitiesModalVisible(true);
                }
            }

            setSelectedImages([]); // Limpa a galeria após o sucesso

        } catch (e: any) {
            setResultData({ title: 'Falha na IA', message: e.message || 'Ocorreu um erro no servidor de Visão Computacional.', type: 'error' });
            setResultModalVisible(true);
        } finally {
            clearInterval(stepInterval);
            setIsProcessing(false);
            setLoadingStep(0);
        }
    };

    const processFileWithGemini = async (fileUri: string, mimeType: string) => {
        setIsProcessing(true);
        setLoadingStep(0);

        // Animated loading sequence simulation to keep user engaged
        const stepInterval = setInterval(() => {
            setLoadingStep(prev => (prev < 3 ? prev + 1 : prev));
        }, 1800);

        try {
            const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
            const extractedRoutes = await parseLogisticsSheet(base64, mimeType);

            // Auto Format Plates and Run initial matchmaker
            const formatted = extractedRoutes.map(r => ({
                ...r,
                driverPlate: r.driverPlate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
            }));

            setRoutes(prev => {
                const accumulated = [...prev, ...formatted];
                recalculateValidationMap(accumulated, availableDrivers);
                return accumulated;
            });

            // Cross-check cities
            if (knownDatabaseCities.length > 0) {
                const uniqueExtractedCities = Array.from(new Set(formatted.map(r => r.city.trim().toUpperCase())));
                const knownCityNames = knownDatabaseCities.map((c: any) => c.name.trim().toUpperCase());

                const unlistedCities = uniqueExtractedCities.filter(extCity => !knownCityNames.includes(extCity));

                if (unlistedCities.length > 0) {
                    setPendingCitiesToRegister(unlistedCities);
                    setUnlistedCitiesModalVisible(true);
                }
            }

        } catch (e: any) {
            setResultData({ title: 'Falha na IA', message: e.message || 'Ocorreu um erro no servidor de Visão Computacional.', type: 'error' });
            setResultModalVisible(true);
        } finally {
            clearInterval(stepInterval);
            setIsProcessing(false);
            setLoadingStep(0);
        }
    };

    const handleAutoRegisterCities = async () => {
        setIsRegisteringCities(true);
        let successCount = 0;
        try {
            for (const cityName of pendingCitiesToRegister) {
                await aether.db.collection(COLLECTIONS.CITIES).create({
                    name: cityName,
                    code: cityName.substring(0, 3).toUpperCase(),
                    isActive: true,
                    createdAt: formatBrazilTimestamp(), // [FIX F3] BRT em vez de UTC
                });
                successCount++;
            }
            // Mute background reload so it fetches the newly added cities.
            const citiesRaw = await aetherFetchAll(COLLECTIONS.CITIES);
            setKnownDatabaseCities(citiesRaw as unknown as City[]);

            setUnlistedCitiesModalVisible(false);
            setResultData({
                title: 'Sucesso Automático',
                message: `${successCount} novas áreas logísticas foram cadastradas no BaaS. Elas já farão parte dos seus relatórios.`,
                type: 'success'
            });
            setResultModalVisible(true);
        } catch (e: any) {
            setResultData({
                title: 'Erro ao Cadastrar',
                message: e.message || 'Falha ao registrar locais automaticamente.',
                type: 'error'
            });
            setResultModalVisible(true);
        } finally {
            setIsRegisteringCities(false);
        }
    };

    const updateRouteField = (index: number, field: keyof RouteDraft, value: string | boolean) => {
        const updated = [...routes];
        updated[index] = { ...updated[index], [field]: value };
        setRoutes(updated);

        // Recalculate specific plate match if plate changed
        if (field === 'driverPlate') {
            recalculateValidationMap(updated, availableDrivers);
        }
    };

    const triggerDispatch = async () => {
        if (routes.length === 0) return;
        const invalidCount = Object.values(validationMap).filter(v => !v).length;
        if (invalidCount > 0) {
            setResultData({
                title: 'Atenção na Validação',
                message: `Existem ${invalidCount} motoristas na tabela que NÃO foram encontrados na base de disponibilidade de Hoje/Amanhã. Deseja ignorá-los e disparar as notificações apenas para os motoristas válidos da frota?`,
                type: 'partial'
            });
            // Adapt the result modal to handle action via a Custom Modal or just use the Confirmation Modal for now
            // To keep it simple, I'll redirect them to the Confirmation Modal directly, but they know it's partial.
            setModalVisible(true);
        } else {
            setModalVisible(true);
        }
    };

    const runMassDispatch = async () => {
        setModalVisible(false);
        setIsDispatching(true);
        let failedPushes = 0;
        let successCount = 0;

        try {
            const snapRoutes = [...routes];
            const snapDrivers = [...availableDrivers];
            const snapAdminId = user?.id || '';

            // Filtra apenas motoristas cadastrados no sistema (com match de placa)
            const validRoutes = snapRoutes.filter(r => {
                const cleanPlate = r.driverPlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
                return validationMap[cleanPlate] === true;
            });

            // Rotas de motoristas NÃO cadastrados — ficam na tabela para correção
            const invalidRoutes = snapRoutes.filter(r => {
                const cleanPlate = r.driverPlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
                return validationMap[cleanPlate] !== true;
            });

            if (validRoutes.length === 0) {
                // Nenhum motorista válido — avisa e para
                setResultData({
                    title: 'Nenhum Motorista Cadastrado',
                    message: `Nenhuma das ${snapRoutes.length} placas lidas pela IA foi encontrada na base de motoristas. Todos os motoristas precisam estar cadastrados no app para receber rotas.`,
                    type: 'error'
                });
                setResultModalVisible(true);
                setIsDispatching(false);
                return;
            }

            setDispatchProgress({ current: 0, total: validRoutes.length });

            const BATCH_SIZE = 5;
            const BATCH_DELAY_MS = 300;
            const MAX_RETRIES = 3;

            for (let i = 0; i < validRoutes.length; i += BATCH_SIZE) {
                const batch = validRoutes.slice(i, i + BATCH_SIZE);

                const batchPromises = batch.map(async (route) => {
                    const cleanPlate = route.driverPlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    const driverData = snapDrivers.find(
                        d => d.driverPlate.toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanPlate
                    );

                    if (!driverData) return null;
                    const driverActualId = driverData.driverId || driverData.id;

                    let dbCreated = false;

                    // Anti-duplicata: verifica se Assignment já existe para hoje
                    try {
                        const existingAssignments = await aether.db.collection(COLLECTIONS.ASSIGNMENTS)
                            .query()
                            .eq('driverPlate', driverData.driverPlate)
                            .eq('dock', route.dock)
                            .get();

                        const todayStr = getTodayDateStr();
                        const hasDuplicate = (existingAssignments as any[]).some(a => {
                            const created = a.createdAt || a._payload?.createdAt || '';
                            return created.startsWith(todayStr);
                        });

                        if (hasDuplicate) {
                            __DEV__ && console.warn(`[Anti-Duplicata] ${route.driverPlate} doca ${route.dock} já existe hoje.`);
                            return null;
                        }
                    } catch (dupCheckErr) {
                        __DEV__ && console.warn('[Anti-Duplicata] Checagem falhou, prosseguindo:', dupCheckErr);
                    }

                    // Cria Assignment com RETRY
                    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                        try {
                            await aether.db.collection(COLLECTIONS.ASSIGNMENTS).create({
                                cityId: 'auto-route',
                                cityName: route.city,
                                wave: 'morning',
                                waveLabel: route.waveLabel,
                                waveTime: 'Conforme Rota',
                                waveNumber: route.waveNumber || '',
                                dock: route.dock,
                                ...(typeof route.sacas === 'number' && route.sacas > 0 ? { sacas: route.sacas } : {}),
                                routeLabel: route.routeLabel || '',
                                isSdd: route.isSdd,
                                driverId: driverActualId,
                                driverName: driverData.driverName,
                                driverPlate: driverData.driverPlate,
                                dockStatus: 'waiting',
                                status: 'pending',
                                createdByAdminId: snapAdminId,
                                createdAt: formatBrazilTimestamp(),
                            });
                            dbCreated = true;
                            break;
                        } catch (dbErr: any) {
                            __DEV__ && console.warn(`[Dispatch] Erro DB (T:${attempt}) p/ ${route.driverPlate}:`, dbErr.message);
                            if (attempt === MAX_RETRIES) {
                                console.error(`[Dispatch] Falha final DB p/ ${route.driverPlate}`);
                                return null;
                            }
                            await new Promise(r => setTimeout(r, 800 * attempt));
                        }
                    }

                    if (dbCreated) {
                        try {
                            await notifyDriver(
                                driverActualId,
                                'NOVA ROTA NA ESCALA 📦',
                                `Você foi escalado para a base ${route.city} (Turno: ${route.waveLabel}). Rota: ${route.routeLabel || 'N/A'}. Dirija-se à Doca ${route.dock}${route.isSdd ? ' com URGÊNCIA (Prioridade Laranja)' : ''}.`
                            );
                            return { route, pushSuccess: true };
                        } catch (pushErr) {
                            __DEV__ && console.warn(`[Dispatch] Push falhou p/ ${route.driverPlate}`, pushErr);
                            return { route, pushSuccess: false };
                        }
                    }

                    return null;
                });

                const batchResults = await Promise.allSettled(batchPromises);

                batchResults.forEach(r => {
                    if (r.status === 'fulfilled' && r.value) {
                        successCount++;
                        if (!r.value.pushSuccess) failedPushes++;
                    } else if (r.status === 'rejected') {
                        console.warn('[Dispatch] Falha sistêmica no Batch:', r.reason);
                    }
                });

                setDispatchProgress(prev => ({ ...prev, current: prev.current + batch.length }));

                if (i + BATCH_SIZE < validRoutes.length) {
                    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
                }
            }

            // Mantém rotas de motoristas não cadastrados na tabela
            if (invalidRoutes.length > 0) {
                setRoutes(invalidRoutes);
                const pushNote = failedPushes > 0
                    ? (isExpoGo
                        ? '\n\nPush indisponível no Expo Go (modo dev).'
                        : `\n\n${failedPushes} push(es) falharam.`)
                    : '';
                setResultData({
                    title: 'Despacho Parcial',
                    message: `${successCount} rotas despachadas para motoristas cadastrados.\n\n${invalidRoutes.length} motorista(s) NÃO cadastrados ficaram na tabela. Cadastre-os no app antes de despachar.${pushNote}`,
                    type: 'partial'
                });
            } else {
                setRoutes([]);
                setValidationMap({});
                if (failedPushes > 0) {
                    const pushNote = isExpoGo
                        ? 'Push indisponível no Expo Go (modo dev).'
                        : `${failedPushes} celular(es) não receberam push.`;
                    setResultData({
                        title: 'Rotas Criadas (Push Parcial)',
                        message: `${successCount} rotas criadas com sucesso.\n\n${pushNote}`,
                        type: 'partial'
                    });
                } else {
                    setResultData({
                        title: 'Despacho Perfeito',
                        message: `100% da tabela (${successCount} rotas) despachada para a frota com sucesso!`,
                        type: 'success'
                    });
                }
            }
            setResultModalVisible(true);

        } catch (e: any) {
            setResultData({ title: 'Erro Fatal de Despacho', message: e.message, type: 'error' });
            setResultModalVisible(true);
        } finally {
            setIsDispatching(false);
            setDispatchProgress({ current: 0, total: 0 });
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background">
            <View className="flex-row items-center p-4 border-b border-[#1e2332]">
                <TouchableOpacity onPress={() => router.replace('/admin/dashboard')} className="w-10 h-10 rounded-full items-center justify-center bg-surface mr-3">
                    <ArrowLeft color={THEME.colors.text} size={24} />
                </TouchableOpacity>
                <View>
                    <Text className="text-xl font-spaceGroteskBold text-text">Inteligência de Carga</Text>
                    <Text className="text-sm text-[#94a3b8] font-spaceGrotesk">Auto-Importação de PDF (Gemini OCR)</Text>
                </View>
            </View>

            <View className="flex-1 p-4">
                {/* Upload Zone */}
                {selectedImages.length === 0 && !isProcessing && (
                    <TouchableOpacity
                        onPress={handleUploadPress}
                        disabled={isProcessing || isDispatching}
                        className={`w-full overflow-hidden bg-surface border-2 border-dashed ${isProcessing ? 'border-primary' : 'border-border'} rounded-2xl mb-6 relative`}
                    >
                        <View className="items-center py-10">
                            <UploadCloud color={THEME.colors.primary} size={32} />
                            <Text className="text-white font-spaceGroteskBold mt-2 text-[15px]">
                                {routes.length > 0 ? 'Adicionar Mais Arquivos' : 'Tocar para Escolher Imagens/PDF'}
                            </Text>
                            <Text className="text-text-muted font-spaceGrotesk text-[13px] mt-1">
                                {filesCount > 0
                                    ? `${filesCount} arquivo(s) processado(s) • ${routes.length} rotas na tabela`
                                    : 'PDF, JPEG ou PNG (Permite Múltiplos)'}
                            </Text>
                            {/* [ENTERPRISE FIX] Hoje é fixo, logo mostramos Badge de certeza para o Operador */}
                            <View className="mt-3 px-4 py-1.5 rounded-full border bg-primary/10 border-primary/30 flex-row gap-1 items-center">
                                <Zap color={THEME.colors.primary} size={14} />
                                <Text className="text-[11px] font-spaceGroteskBold uppercase tracking-wider text-primary">
                                    ESCALA HOJE ({getTodayDateStr()})
                                </Text>
                            </View>
                        </View>
                    </TouchableOpacity>
                )}

                {/* Previews / Loading */}
                {(selectedImages.length > 0 || isProcessing) && (
                    <View className="w-full bg-surface border border-border rounded-2xl mb-6 p-4">
                        {isProcessing ? (
                            <View className="items-center justify-center py-6">
                                <ActivityIndicator color={THEME.colors.primary} size="large" />
                                <Text className="text-white font-spaceGroteskBold mt-4 text-[16px]">
                                    {loadingStep === 0 && 'Inicializando Motor OCR...'}
                                    {loadingStep === 1 && 'Enviando Imagens ao Servidor...'}
                                    {loadingStep === 2 && 'Mapeando células da planilha...'}
                                    {loadingStep === 3 && 'Cruzando dados logísticos...'}
                                </Text>
                                <Text className="text-[#94a3b8] font-spaceGrotesk mt-1 text-center text-[12px]">
                                    O Gemini 2.5 Pro está lendo {selectedImages.length} captura(s)...
                                </Text>
                            </View>
                        ) : (
                            <View>
                                <View className="flex-row justify-between items-center mb-3">
                                    <Text className="text-white font-spaceGroteskBold text-[15px]">Preview da Captura</Text>
                                    <TouchableOpacity onPress={() => setSelectedImages([])}>
                                        <X color="#f87171" size={20} />
                                    </TouchableOpacity>
                                </View>

                                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                                    {selectedImages.map((img, idx) => (
                                        <View key={idx} className="mr-3 items-center justify-center bg-background border border-[#2d3345] rounded-xl overflow-hidden w-24 h-24">
                                            {img.mimeType.includes('image') ? (
                                                <FileText color={THEME.colors.primary} size={32} /> // Native image caching was throwing context issues, used standard Icon
                                            ) : (
                                                <FileText color={THEME.colors.primary} size={32} />
                                            )}
                                            <Text className="text-[9px] text-text-muted mt-2 font-mono text-center px-1" numberOfLines={1}>
                                                {img.name}
                                            </Text>
                                        </View>
                                    ))}
                                    <TouchableOpacity
                                        onPress={handleUploadPress}
                                        className="w-24 h-24 rounded-xl border border-dashed border-border items-center justify-center bg-background"
                                    >
                                        <UploadCloud color="#94a3b8" size={24} />
                                        <Text className="text-[10px] font-spaceGrotesk text-[#94a3b8] mt-1">Mais</Text>
                                    </TouchableOpacity>
                                </ScrollView>

                                <TouchableOpacity
                                    onPress={handleProcessImages}
                                    className="w-full bg-primary h-12 rounded-xl flex-row items-center justify-center shadow-lg"
                                >
                                    <Zap color="#000" size={18} className="mr-2" />
                                    <Text className="text-black font-spaceGroteskBold uppercase tracking-wide">
                                        Analisar {selectedImages.length} Arquivo(s) com IA
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                )}

                {/* Matchmaker Info Badge */}
                <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-[14px] font-spaceGroteskBold text-text-light">Engine de Reconciliação</Text>
                    <View className="px-3 py-1 rounded-full border bg-primary/10 border-primary/20">
                        <Text className="text-[11px] font-spaceGroteskBold uppercase tracking-wider text-primary">
                            Alocação: Hoje
                        </Text>
                    </View>
                </View>

                {/* Editor Table */}
                {!isProcessing && routes.length > 0 && (
                    <View className="flex-1 mb-8">
                        <View className="flex-row justify-between items-end mb-2">
                            <Text className="text-[13px] font-spaceGrotesk text-text-muted mb-1">
                                Placas com <CheckCircle2 color="#22c55e" size={12} className="mx-1" /> estão vinculadas e prontas.
                            </Text>
                        </View>

                        <View className="flex-1">
                            <ImportPreviewTable
                                routes={routes}
                                onChangeRoute={updateRouteField}
                                validationMap={validationMap}
                            />
                        </View>

                        <View className="flex-row gap-3 mt-6">
                            <TouchableOpacity
                                onPress={() => { setRoutes([]); setFilesCount(0); setValidationMap({}); }}
                                disabled={isDispatching}
                                className={`bg-surface border border-border rounded-xl h-14 px-4 items-center justify-center ${isDispatching ? 'opacity-50' : ''}`}
                            >
                                <X color="#f87171" size={20} />
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={triggerDispatch}
                                disabled={isDispatching}
                                className={`flex-1 rounded-xl h-14 flex-row items-center justify-center ${isDispatching ? 'bg-primary/50' : 'bg-primary'}`}
                                style={isDispatching ? {} : { elevation: 4 }}
                            >
                                {isDispatching ? (
                                    <>
                                        <ActivityIndicator color="#000" size="small" className="mr-3" />
                                        <Text className="text-black font-spaceGroteskBold text-[15px] uppercase tracking-wider">
                                            {`Processando ${dispatchProgress.current} de ${dispatchProgress.total}...`}
                                        </Text>
                                    </>
                                ) : (
                                    <>
                                        <Play color="#000" size={20} className="mr-2" />
                                        <Text className="text-black font-spaceGroteskBold text-[16px] uppercase tracking-wider">
                                            Despachar Frota ({routes.length})
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            </View>

            {/* Confirmation Modal */}
            <Modal visible={modalVisible} transparent animationType="fade">
                <View className="flex-1 bg-black/60 items-center justify-center p-4">
                    <View className="bg-surface w-full max-w-sm rounded-[24px] p-6 border border-border shadow-2xl">
                        <View className="w-12 h-12 rounded-full bg-surface items-center justify-center mb-4 self-center">
                            <CheckCircle2 color={THEME.colors.primary} size={28} />
                        </View>
                        <Text className="text-xl font-spaceGroteskBold text-white text-center mb-2">Aprovar Routing Board</Text>
                        <Text className="text-[#94a3b8] text-center font-spaceGrotesk mb-6 text-[14px]">
                            {Object.values(validationMap).filter(v => !v).length > 0
                                ? `Existem ${Object.values(validationMap).filter(v => !v).length} motoristas nesta tabela não validados na base. Apenas os motoristas válidos receberão a rota em seus celulares. Confirmar o envio da nuvem?`
                                : `Todos os ${routes.length} motoristas dessa tabela foram validados cruzando a Placa com a base. Os celulares deles vão tocar agora. Confirmar o envio da nuvem?`
                            }
                        </Text>
                        <View className="flex-row gap-3">
                            <TouchableOpacity onPress={() => setModalVisible(false)} className="flex-1 bg-surface h-12 rounded-xl items-center justify-center">
                                <Text className="text-white font-spaceGroteskBold">Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={runMassDispatch} className="flex-1 bg-primary h-12 rounded-xl items-center justify-center shadow-lg">
                                <Text className="text-black font-spaceGroteskBold uppercase">DISPARAR</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Auto City Registration Modal */}
            <Modal visible={unlistedCitiesModalVisible} transparent animationType="slide" style={{ zIndex: 9999 }}>
                <View className="flex-1 bg-black/80 justify-end">
                    <View className="bg-surface rounded-t-[32px] w-full max-h-[80%] border-t border-border shadow-2xl p-6 pb-12">
                        <View className="w-16 h-1 bg-[#2d3345] rounded-full self-center mb-6" />

                        <View className="w-14 h-14 rounded-full bg-blue-500/10 items-center justify-center mb-4 border border-blue-500/20">
                            <AlertTriangle color="#3b82f6" size={28} />
                        </View>

                        <Text className="text-2xl font-spaceGroteskBold text-white mb-2">
                            Novas Praças Detectadas!
                        </Text>

                        <Text className="text-[#94a3b8] font-spaceGrotesk text-[15px] leading-relaxed mb-6">
                            A Inteligência Artificial mapeou as seguintes rotas no PDF, mas elas <Text className="text-white font-spaceGroteskBold">ainda não existem no seu Banco de Dados (BaaS).</Text> Para manter seus relatórios operacionais precisos depois, quer que o sistema cadastre todas elas agora magicamente pra você?
                        </Text>

                        <View className="bg-background rounded-xl border border-border p-4 mb-8 max-h-[200px]">
                            <ScrollView showsVerticalScrollIndicator={false}>
                                <View className="flex-row flex-wrap gap-2">
                                    {pendingCitiesToRegister.map((city, idx) => (
                                        <View key={idx} className="bg-surface border border-border px-3 py-1.5 rounded-lg flex-row items-center">
                                            <Text className="text-white font-spaceGroteskBold text-sm">{city}</Text>
                                        </View>
                                    ))}
                                </View>
                            </ScrollView>
                        </View>

                        <View className="flex-col gap-3">
                            <TouchableOpacity
                                onPress={handleAutoRegisterCities}
                                disabled={isRegisteringCities}
                                className="w-full bg-primary h-14 rounded-xl items-center justify-center shadow-lg flex-row gap-2"
                            >
                                {isRegisteringCities ? (
                                    <ActivityIndicator color="#000" size="small" />
                                ) : (
                                    <>
                                        <CheckCircle2 color="#000" size={20} />
                                        <Text className="text-black font-spaceGroteskBold text-[15px] uppercase tracking-wide">
                                            Cadastrar {pendingCitiesToRegister.length} Magicamente
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => setUnlistedCitiesModalVisible(false)}
                                disabled={isRegisteringCities}
                                className="w-full bg-background border border-border h-14 rounded-xl items-center justify-center flex-row gap-2"
                            >
                                <X color="#94a3b8" size={20} />
                                <Text className="text-[#94a3b8] font-spaceGroteskBold text-[15px] uppercase tracking-wide">
                                    Ignorar e Arrumar Depois
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* O Modal de D+1 foi destruído seguindo a arquitetura Sênior */}

            {/* Generic Result Modal (Mantido para exibir "Despacho Perfeito") */}
            <Modal visible={resultModalVisible} transparent animationType="fade">
                <View className="flex-1 bg-black/60 items-center justify-center p-4">
                    <View className="bg-surface w-full max-w-sm rounded-[24px] p-6 border border-border shadow-2xl items-center">
                        <View className={`w-16 h-16 rounded-full items-center justify-center mb-5 ${resultData.type === 'error' ? 'bg-red-500/10' : resultData.type === 'success' ? 'bg-primary/10' : 'bg-blue-500/10'}`}>
                            {resultData.type === 'error' && <AlertTriangle color="#f87171" size={28} />}
                            {resultData.type === 'partial' && <AlertTriangle color="#3b82f6" size={28} />}
                            {resultData.type === 'success' && <CheckCircle2 color={THEME.colors.primary} size={28} />}
                        </View>

                        <Text className="text-xl font-spaceGroteskBold text-white text-center mb-2">{resultData.title}</Text>
                        <Text className="text-[#94a3b8] font-spaceGrotesk text-[14px] text-center mb-8 leading-relaxed">
                            {resultData.message}
                        </Text>

                        <TouchableOpacity
                            className={`w-full rounded-xl py-4 items-center ${resultData.type === 'error' ? 'bg-red-500/20 border border-red-500/30' :
                                resultData.type === 'partial' ? 'bg-blue-500/20 border border-blue-500/30' :
                                    'bg-primary/20 border border-primary/30'}`}
                            onPress={() => {
                                setResultModalVisible(false);
                                if (resultData.title.includes('Perfeito') || resultData.title.includes('Aviso no Despacho')) {
                                    router.replace('/admin/dashboard');
                                }
                            }}
                        >
                            <Text className={`font-spaceGroteskBold uppercase text-[15px] ${resultData.type === 'error' ? 'text-red-400' :
                                resultData.type === 'partial' ? 'text-blue-400' : 'text-primary'}`}>
                                OK, Entendi
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}
