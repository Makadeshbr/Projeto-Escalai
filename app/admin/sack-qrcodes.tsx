import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, ScrollView, FlatList, Image,
    ActivityIndicator, Modal, TextInput, RefreshControl, Alert, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    QrCode, Plus, Trash2, Pencil, Check, X, Eye,
    UploadCloud, Package, ArrowLeft, FileImage, Camera, ImageIcon
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { THEME } from '~/src/constants/theme';
import { aether, aetherFetchAll } from '~/src/lib/aether';
import { useAuthStore } from '~/src/store/auth';
import { COLLECTIONS, SackQRCode } from '~/src/lib/collections';
import { SackQRCodeSchema, validateArray } from '~/src/lib/schemas';
import AdminBottomNav from '~/src/components/AdminBottomNav';
import { LinearGradient } from 'expo-linear-gradient';
import { EnterpriseModal } from '~/src/components/EnterpriseModal';
import { logger } from '~/src/lib/logger';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Extrai o primeiro número encontrado no label para ordenação numérica natural.
 * Ex: "saca 56" → 56, "QR_610" → 610, "saca-57-lote" → 57, "sem numero" → null
 * @param label - Label do QR Code
 * @returns Número extraído ou null se não encontrar
 */
function extractSortNumber(label: string): number | null {
    const match = label.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}

/**
 * Tela de gestão de QR Codes de sacas para o admin.
 *
 * Permite:
 * - Upload múltiplo de imagens/PDFs de QR Codes via DocumentPicker
 * - Listagem de todos os QR Codes ativos com thumbnail
 * - Renomear labels dos QR Codes
 * - Excluir (soft-delete + remoção do S3)
 * - Visualização fullscreen de cada QR Code
 */
export default function SackQRCodesScreen() {
    const { user } = useAuthStore();
    const [qrCodes, setQrCodes] = useState<SackQRCode[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    // Estado para edição de label
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editLabel, setEditLabel] = useState('');

    // Estado para visualização fullscreen
    const [viewingQR, setViewingQR] = useState<SackQRCode | null>(null);

    // Estado para menu de seleção de upload (Foto vs PDF)
    const [showUploadMenu, setShowUploadMenu] = useState(false);

    // Modal de feedback
    const [actionModal, setActionModal] = useState({
        visible: false,
        title: '',
        message: '',
        type: 'info' as 'info' | 'error' | 'success' | 'warning',
    });

    /**
     * Exibe modal de feedback com tipagem de severidade.
     * @param title - Título do modal
     * @param message - Mensagem descritiva
     * @param type - Tipo visual (success, error, warning, info)
     */
    const showModal = (title: string, message: string, type: 'info' | 'error' | 'success' | 'warning' = 'info') => {
        setActionModal({ visible: true, title, message, type });
    };

    /**
     * Busca todos os QR Codes ativos da coleção sack_qr_codes.
     * Filtra soft-deleted (archived) e ordena por data de criação.
     */
    const fetchQRCodes = useCallback(async () => {
        setIsLoading(true);
        try {
            const raw = await aetherFetchAll(COLLECTIONS.SACK_QR_CODES);
            const validated = validateArray(raw, SackQRCodeSchema, 'sack_qr_codes');
            const active = validated.filter(qr => qr.archived !== true);

            // Ordenação numérica natural: extrai o número do label para ordenar corretamente
            // Ex: "saca 56" → 56, "QR_610" → 610, "saca-57-lote" → 57
            active.sort((a, b) => {
                const numA = extractSortNumber(a.label);
                const numB = extractSortNumber(b.label);

                // Se ambos têm número, ordena numericamente
                if (numA !== null && numB !== null) return numA - numB;
                // Itens com número vêm antes dos sem número
                if (numA !== null) return -1;
                if (numB !== null) return 1;
                // Fallback: ordem alfabética
                return a.label.localeCompare(b.label, 'pt-BR', { numeric: true });
            });

            setQrCodes(active);
        } catch (error) {
            logger.error('[QR Admin]', 'Erro ao buscar QR Codes:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchQRCodes();
    }, [fetchQRCodes]);

    /**
     * Abre o DocumentPicker para selecionar imagens ou PDFs.
     * Suporta seleção múltipla (até 10 arquivos por batch).
     * Converte cada arquivo para Blob e faz upload via aether.storage.
     */
    const handleUploadQRCodes = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['image/*', 'application/pdf'],
                multiple: true,
                copyToCacheDirectory: true,
            });

            if (result.canceled || !result.assets || result.assets.length === 0) return;

            // Limite de segurança: máximo 10 arquivos por vez
            const MAX_BATCH = 10;
            const files = result.assets.slice(0, MAX_BATCH);

            if (result.assets.length > MAX_BATCH) {
                showModal('Limite Atingido', `Máximo ${MAX_BATCH} arquivos por vez. Apenas os primeiros ${MAX_BATCH} serão enviados.`, 'warning');
            }

            setIsUploading(true);
            setUploadProgress(0);

            let successCount = 0;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                try {
                    // 1. Converter URI local em Blob para o Aether Storage
                    const response = await fetch(file.uri);
                    const blob = await response.blob();

                    // 2. Upload para AWS S3 via Aether Storage
                    const uploadResult = await aether.storage.upload(blob, {
                        folder: 'sack_qrcodes',
                        fileName: file.name || `qr_code_${Date.now()}_${i}.jpg`,
                        contentType: file.mimeType || 'image/jpeg',
                    });

                    if (uploadResult.success) {
                        // 3. Salvar metadados na coleção do banco
                        const fileData = uploadResult.data;
                        await aether.db.collection(COLLECTIONS.SACK_QR_CODES).create({
                            label: file.name?.replace(/\.[^/.]+$/, '') || `QR Code ${Date.now()}`,
                            storageFileId: fileData.id,
                            downloadUrl: fileData.downloadUrl || fileData.publicUrl || fileData.url || '',
                            fileName: file.name || `qr_${Date.now()}.jpg`,
                            mimeType: file.mimeType || 'image/jpeg',
                            fileSize: file.size || fileData.size || 0,
                            uploadedByAdminId: user?.id || 'admin',
                            createdAt: new Date().toISOString(),
                        });
                        successCount++;
                    } else {
                        logger.warn('[QR Admin]', `Upload falhou para ${file.name}:`, uploadResult.error);
                    }
                } catch (fileError) {
                    logger.error('[QR Admin]', `Erro no upload de ${file.name}:`, fileError);
                }

                // Atualiza progresso visual
                setUploadProgress(Math.round(((i + 1) / files.length) * 100));
            }

            if (successCount > 0) {
                showModal('Upload Concluído', `${successCount} QR Code${successCount > 1 ? 's' : ''} enviado${successCount > 1 ? 's' : ''} com sucesso!`, 'success');
                await fetchQRCodes();
            } else {
                showModal('Falha no Upload', 'Nenhum arquivo foi enviado. Verifique sua conexão.', 'error');
            }
        } catch (error) {
            logger.error('[QR Admin]', 'Erro no processo de upload:', error);
            showModal('Erro', 'Falha ao selecionar arquivos.', 'error');
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    /**
     * Upload via ImagePicker com crop nativo do OS.
     * Permite ao admin tirar foto ou escolher da galeria,
     * com editor de corte integrado para enquadrar o QR Code.
     *
     * @param source - 'camera' para abrir câmera, 'gallery' para galeria
     */
    const handleUploadFromImage = async (source: 'camera' | 'gallery') => {
        try {
            setShowUploadMenu(false);

            // Solicita permissão adequada
            if (source === 'camera') {
                const { status } = await ImagePicker.requestCameraPermissionsAsync();
                if (status !== 'granted') {
                    showModal('Permissão Negada', 'Acesso à câmera é necessário para tirar foto do QR Code.', 'warning');
                    return;
                }
            } else {
                const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (status !== 'granted') {
                    showModal('Permissão Negada', 'Acesso à galeria é necessário para selecionar imagem.', 'warning');
                    return;
                }
            }

            // Abre picker com crop nativo do OS
            const launchFn = source === 'camera'
                ? ImagePicker.launchCameraAsync
                : ImagePicker.launchImageLibraryAsync;

            const result = await launchFn({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,  // Habilita crop nativo do OS
                quality: 0.9,         // Alta qualidade para QR Code nítido
            });

            if (result.canceled || !result.assets || result.assets.length === 0) return;

            setIsUploading(true);
            setUploadProgress(0);

            const asset = result.assets[0];
            const fileName = `qr_code_${Date.now()}.jpg`;

            try {
                // Converte URI local em Blob
                const response = await fetch(asset.uri);
                const blob = await response.blob();

                // Upload para Aether Storage
                const uploadResult = await aether.storage.upload(blob, {
                    folder: 'sack_qrcodes',
                    fileName,
                    contentType: 'image/jpeg',
                });

                if (uploadResult.success) {
                    const fileData = uploadResult.data;
                    await aether.db.collection(COLLECTIONS.SACK_QR_CODES).create({
                        label: `QR Code ${Date.now()}`,
                        storageFileId: fileData.id,
                        downloadUrl: fileData.downloadUrl || fileData.publicUrl || fileData.url || '',
                        fileName,
                        mimeType: 'image/jpeg',
                        fileSize: asset.fileSize || blob.size || 0,
                        uploadedByAdminId: user?.id || 'admin',
                        createdAt: new Date().toISOString(),
                    });

                    showModal('Upload Concluído', 'QR Code enviado com sucesso!', 'success');
                    await fetchQRCodes();
                } else {
                    logger.warn('[QR Admin]', 'Upload falhou:', uploadResult.error);
                    showModal('Falha no Upload', 'Não foi possível enviar a imagem.', 'error');
                }
            } catch (fileError) {
                logger.error('[QR Admin]', 'Erro no upload de imagem:', fileError);
                showModal('Erro', 'Falha ao enviar a imagem.', 'error');
            }
        } catch (error) {
            logger.error('[QR Admin]', 'Erro ao abrir picker:', error);
            showModal('Erro', 'Falha ao abrir seletor de imagem.', 'error');
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    /**
     * Salva o novo label de um QR Code.
     * @param qrId - ID do QR Code sendo editado
     */
    const handleSaveLabel = async (qrId: string) => {
        if (!editLabel.trim()) return;
        try {
            await aether.db.collection(COLLECTIONS.SACK_QR_CODES).update(qrId, {
                label: editLabel.trim().substring(0, 100),
            });
            setEditingId(null);
            await fetchQRCodes();
        } catch (error) {
            logger.error('[QR Admin]', 'Erro ao renomear:', error);
            showModal('Erro', 'Falha ao renomear o QR Code.', 'error');
        }
    };

    /**
     * Executa soft-delete do QR Code (archived: true) e remove o arquivo do S3.
     * @param qr - Objeto SackQRCode a ser excluído
     */
    const handleDelete = async (qr: SackQRCode) => {
        Alert.alert(
            'Excluir QR Code',
            `Tem certeza que deseja excluir "${qr.label}"?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Excluir',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            // 1. Soft-delete na coleção
                            await aether.db.collection(COLLECTIONS.SACK_QR_CODES).update(qr.id, {
                                archived: true,
                            });

                            // 2. Remove arquivo do S3 (fire-and-forget)
                            if (qr.storageFileId) {
                                aether.storage.delete(qr.storageFileId).catch(err =>
                                    logger.warn('[QR Admin]', 'Falha ao deletar do S3 (não-crítico):', err)
                                );
                            }

                            showModal('Excluído', 'QR Code removido com sucesso.', 'success');
                            await fetchQRCodes();
                        } catch (error) {
                            logger.error('[QR Admin]', 'Erro ao excluir:', error);
                            showModal('Erro', 'Falha ao excluir o QR Code.', 'error');
                        }
                    },
                },
            ]
        );
    };

    /**
     * Formata o tamanho do arquivo em formato legível (KB ou MB).
     * @param bytes - Tamanho em bytes
     * @returns String formatada
     */
    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <LinearGradient
                colors={['#1a1d2e', THEME.colors.background, THEME.colors.headerBackground]}
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
            />

            {/* Header */}
            <View className="flex-row items-center justify-between px-5 py-4 z-10">
                <TouchableOpacity
                    onPress={() => router.canGoBack() ? router.back() : router.replace('/admin/overview')}
                    className="w-10 h-10 items-center justify-center rounded-full bg-surface border border-border"
                >
                    <ArrowLeft color="#fff" size={20} />
                </TouchableOpacity>
                <View className="items-center">
                    <Text className="text-lg font-spaceGroteskBold text-white uppercase tracking-widest">
                        QR Codes Sacas
                    </Text>
                    <Text className="text-[#94a3b8] font-spaceGrotesk text-xs">
                        {qrCodes.length} QR Code{qrCodes.length !== 1 ? 's' : ''} ativo{qrCodes.length !== 1 ? 's' : ''}
                    </Text>
                </View>
                <View className="w-10 h-10" />
            </View>

            {/* Conteúdo */}
            {/* Conteúdo */}
            <FlatList
                className="flex-1 z-10 px-5"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 120 }}
                refreshControl={
                    <RefreshControl refreshing={isLoading} onRefresh={fetchQRCodes} tintColor={THEME.colors.primary} />
                }
                data={qrCodes}
                keyExtractor={(item) => item.id}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={5}
                ListHeaderComponent={
                    <TouchableOpacity
                        onPress={() => setShowUploadMenu(true)}
                        disabled={isUploading}
                        className={`w-full bg-surface border-2 border-dashed border-orange-500/30 rounded-2xl p-6 items-center mt-2 mb-6 ${isUploading ? 'opacity-50' : ''}`}
                        activeOpacity={0.7}
                    >
                        {isUploading ? (
                            <View className="items-center">
                                <ActivityIndicator size="large" color="#f97316" />
                                <Text className="text-orange-400 font-spaceGroteskBold text-base mt-3">
                                    Enviando... {uploadProgress}%
                                </Text>
                            </View>
                        ) : (
                            <>
                                <View className="w-16 h-16 rounded-full bg-orange-500/10 border border-orange-500/20 items-center justify-center mb-3">
                                    <UploadCloud color="#f97316" size={28} />
                                </View>
                                <Text className="text-white font-spaceGroteskBold text-base">
                                    Enviar QR Codes
                                </Text>
                                <Text className="text-[#94a3b8] font-spaceGrotesk text-xs text-center mt-1">
                                    Toque para selecionar imagens ou PDFs (até 10 por vez)
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>
                }
                ListEmptyComponent={
                    isLoading ? (
                        <View className="items-center py-12">
                            <ActivityIndicator size="large" color={THEME.colors.primary} />
                            <Text className="text-[#94a3b8] mt-4 font-spaceGrotesk">Carregando QR Codes...</Text>
                        </View>
                    ) : (
                        <View className="items-center py-12 px-4">
                            <View className="w-20 h-20 rounded-full bg-surface border border-border items-center justify-center mb-4">
                                <Package color="#94a3b8" size={36} />
                            </View>
                            <Text className="text-white text-lg font-spaceGroteskBold text-center mb-2">
                                Nenhum QR Code cadastrado
                            </Text>
                            <Text className="text-[#94a3b8] font-spaceGrotesk text-center leading-relaxed">
                                Envie os QR Codes das sacas usando o botão acima.{'\n'}
                                Os motoristas com sacas poderão consultá-los diretamente no app.
                            </Text>
                        </View>
                    )
                }
                renderItem={({ item: qr }) => (
                    <View className="bg-surface rounded-2xl border border-border overflow-hidden mb-3">
                        <View className="flex-row items-center p-4">
                            {/* Thumbnail */}
                            <TouchableOpacity
                                onPress={() => setViewingQR(qr)}
                                className="mr-4"
                            >
                                <View className="w-16 h-16 rounded-xl bg-white overflow-hidden items-center justify-center border border-border">
                                    {qr.mimeType.startsWith('image/') ? (
                                        <Image
                                            source={{ uri: qr.downloadUrl }}
                                            className="w-full h-full"
                                            resizeMode="contain"
                                        />
                                    ) : (
                                        <FileImage color="#94a3b8" size={24} />
                                    )}
                                </View>
                            </TouchableOpacity>

                            {/* Info */}
                            <View className="flex-1">
                                {editingId === qr.id ? (
                                    <TextInput
                                        value={editLabel}
                                        onChangeText={setEditLabel}
                                        autoFocus
                                        maxLength={100}
                                        className="text-white font-spaceGroteskBold text-[15px] bg-background rounded-lg px-3 py-2 border border-primary/30"
                                        placeholderTextColor={THEME.colors.textMuted}
                                    />
                                ) : (
                                    <Text className="text-white font-spaceGroteskBold text-[15px]" numberOfLines={1}>
                                        {qr.label}
                                    </Text>
                                )}
                                <Text className="text-[#94a3b8] font-spaceGrotesk text-[11px] mt-1">
                                    {formatFileSize(qr.fileSize)} • {new Date(qr.createdAt).toLocaleDateString('pt-BR')}
                                </Text>
                            </View>

                            {/* Ações */}
                            <View className="flex-row items-center gap-2 ml-2">
                                {editingId === qr.id ? (
                                    <>
                                        <TouchableOpacity
                                            onPress={() => handleSaveLabel(qr.id)}
                                            className="w-9 h-9 rounded-full bg-green-500/10 border border-green-500/20 items-center justify-center"
                                        >
                                            <Check color="#4ade80" size={16} />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => setEditingId(null)}
                                            className="w-9 h-9 rounded-full bg-surface border border-border items-center justify-center"
                                        >
                                            <X color="#94a3b8" size={16} />
                                        </TouchableOpacity>
                                    </>
                                ) : (
                                    <>
                                        <TouchableOpacity
                                            onPress={() => setViewingQR(qr)}
                                            className="w-9 h-9 rounded-full bg-surface border border-border items-center justify-center"
                                        >
                                            <Eye color="#94a3b8" size={16} />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => { setEditingId(qr.id); setEditLabel(qr.label); }}
                                            className="w-9 h-9 rounded-full bg-surface border border-border items-center justify-center"
                                        >
                                            <Pencil color="#94a3b8" size={14} />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => handleDelete(qr)}
                                            className="w-9 h-9 rounded-full bg-red-500/10 border border-red-500/20 items-center justify-center"
                                        >
                                            <Trash2 color="#ef4444" size={14} />
                                        </TouchableOpacity>
                                    </>
                                )}
                            </View>
                        </View>
                    </View>
                )}
            />

            {/* Modal Fullscreen de Visualização com Zoom */}
            <Modal visible={!!viewingQR} animationType="fade" transparent onRequestClose={() => setViewingQR(null)}>
                <View className="flex-1 bg-black/95 items-center justify-center">
                    <TouchableOpacity
                        onPress={() => setViewingQR(null)}
                        className="absolute top-14 right-5 w-10 h-10 rounded-full bg-white/10 items-center justify-center z-50"
                    >
                        <X color="#fff" size={22} />
                    </TouchableOpacity>

                    {viewingQR && (
                        <View className="items-center px-6">
                            <Text className="text-white font-spaceGroteskBold text-xl mb-6 text-center">
                                {viewingQR.label}
                            </Text>
                            <View className="bg-white rounded-2xl overflow-hidden" style={{ width: 320, height: 320 }}>
                                <ScrollView
                                    maximumZoomScale={5}
                                    minimumZoomScale={1}
                                    bouncesZoom
                                    showsHorizontalScrollIndicator={false}
                                    showsVerticalScrollIndicator={false}
                                    contentContainerStyle={{ width: 320, height: 320 }}
                                >
                                    <Image
                                        source={{ uri: viewingQR.downloadUrl }}
                                        style={{ width: 320, height: 320 }}
                                        resizeMode="contain"
                                    />
                                </ScrollView>
                            </View>
                            <Text className="text-[#64748b] text-xs font-spaceGrotesk mt-4">
                                {viewingQR.fileName} • {formatFileSize(viewingQR.fileSize)}
                            </Text>
                        </View>
                    )}
                </View>
            </Modal>

            {/* FAB para upload rápido */}
            <TouchableOpacity
                onPress={() => setShowUploadMenu(true)}
                disabled={isUploading}
                style={{
                    position: 'absolute',
                    bottom: 100,
                    right: 20,
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: '#f97316',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 50,
                    elevation: 10,
                    shadowColor: '#f97316',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.4,
                    shadowRadius: 10,
                }}
            >
                <Plus color="#000" size={26} strokeWidth={3} />
            </TouchableOpacity>

            {/* Modal de seleção: Foto (com crop) vs PDF */}
            <Modal visible={showUploadMenu} animationType="slide" transparent onRequestClose={() => setShowUploadMenu(false)}>
                <TouchableOpacity
                    className="flex-1 bg-black/60"
                    activeOpacity={1}
                    onPress={() => setShowUploadMenu(false)}
                >
                    <View className="flex-1" />
                    <View className="bg-[#1a1d2e] rounded-t-3xl px-6 pt-6 pb-10 border-t border-border">
                        <Text className="text-white font-spaceGroteskBold text-lg text-center mb-2">
                            Enviar QR Code
                        </Text>
                        <Text className="text-[#94a3b8] font-spaceGrotesk text-xs text-center mb-6">
                            Escolha como enviar o QR Code
                        </Text>

                        {/* Opção 1: Câmera (com crop) */}
                        <TouchableOpacity
                            onPress={() => handleUploadFromImage('camera')}
                            className="flex-row items-center bg-surface border border-border rounded-xl px-4 py-4 mb-3"
                            activeOpacity={0.7}
                        >
                            <View className="w-12 h-12 rounded-full bg-orange-500/10 border border-orange-500/20 items-center justify-center">
                                <Camera color="#f97316" size={22} />
                            </View>
                            <View className="ml-4 flex-1">
                                <Text className="text-white font-spaceGroteskBold text-base">
                                    Tirar Foto
                                </Text>
                                <Text className="text-[#94a3b8] font-spaceGrotesk text-xs mt-0.5">
                                    Fotografe e corte o QR Code
                                </Text>
                            </View>
                        </TouchableOpacity>

                        {/* Opção 2: Galeria (com crop) */}
                        <TouchableOpacity
                            onPress={() => handleUploadFromImage('gallery')}
                            className="flex-row items-center bg-surface border border-border rounded-xl px-4 py-4 mb-3"
                            activeOpacity={0.7}
                        >
                            <View className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 items-center justify-center">
                                <ImageIcon color="#3b82f6" size={22} />
                            </View>
                            <View className="ml-4 flex-1">
                                <Text className="text-white font-spaceGroteskBold text-base">
                                    Galeria
                                </Text>
                                <Text className="text-[#94a3b8] font-spaceGrotesk text-xs mt-0.5">
                                    Selecione e corte da galeria
                                </Text>
                            </View>
                        </TouchableOpacity>

                        {/* Opção 3: PDF / Múltiplos arquivos */}
                        <TouchableOpacity
                            onPress={() => { setShowUploadMenu(false); handleUploadQRCodes(); }}
                            className="flex-row items-center bg-surface border border-border rounded-xl px-4 py-4 mb-3"
                            activeOpacity={0.7}
                        >
                            <View className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 items-center justify-center">
                                <FileImage color="#10b981" size={22} />
                            </View>
                            <View className="ml-4 flex-1">
                                <Text className="text-white font-spaceGroteskBold text-base">
                                    PDF / Múltiplos Arquivos
                                </Text>
                                <Text className="text-[#94a3b8] font-spaceGrotesk text-xs mt-0.5">
                                    Até 10 imagens ou PDFs por vez
                                </Text>
                            </View>
                        </TouchableOpacity>

                        {/* Botão cancelar */}
                        <TouchableOpacity
                            onPress={() => setShowUploadMenu(false)}
                            className="items-center py-3 mt-2"
                        >
                            <Text className="text-[#94a3b8] font-spaceGroteskBold text-sm">Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            <EnterpriseModal
                visible={actionModal.visible}
                title={actionModal.title}
                description={actionModal.message}
                type={actionModal.type}
                cancelText="Fechar"
                onClose={() => setActionModal(prev => ({ ...prev, visible: false }))}
            />

            <AdminBottomNav activeTab="sack-qrcodes" />
        </SafeAreaView>
    );
}
