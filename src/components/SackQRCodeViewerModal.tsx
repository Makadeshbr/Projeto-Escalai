import React, { useEffect, useState } from 'react';
import {
    View, Text, Modal, TouchableOpacity, ScrollView,
    Image, ActivityIndicator, Dimensions, FlatList
} from 'react-native';
import { X, ChevronLeft, ChevronRight, QrCode, Package } from 'lucide-react-native';
import { THEME } from '~/src/constants/theme';
import { aetherFetchAll } from '~/src/lib/aether';
import { COLLECTIONS, SackQRCode } from '~/src/lib/collections';
import { SackQRCodeSchema } from '~/src/lib/schemas';
import { validateArray } from '~/src/lib/schemas';
import { logger } from '~/src/lib/logger';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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

interface SackQRCodeViewerModalProps {
    /** Controla a visibilidade do modal */
    visible: boolean;
    /** Callback para fechar o modal */
    onClose: () => void;
}

/**
 * Modal de visualização de QR Codes de sacas para motoristas.
 *
 * Exibe todos os QR Codes disponíveis em formato carousel horizontal.
 * O motorista pode deslizar entre eles para consultar cada um de forma prática.
 *
 * Busca os dados diretamente da coleção sack_qr_codes do Aether BaaS.
 * Filtra apenas registros não-arquivados (archived !== true).
 */
export function SackQRCodeViewerModal({ visible, onClose }: SackQRCodeViewerModalProps) {
    const [qrCodes, setQrCodes] = useState<SackQRCode[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeIndex, setActiveIndex] = useState(0);

    /**
     * Busca todos os QR Codes ativos (não arquivados) do Aether BaaS.
     * Ordena por data de criação (mais recente primeiro).
     */
    useEffect(() => {
        if (!visible) return;

        const fetchQRCodes = async () => {
            setIsLoading(true);
            try {
                const raw = await aetherFetchAll(COLLECTIONS.SACK_QR_CODES);
                const validated = validateArray(raw, SackQRCodeSchema, 'sack_qr_codes');

                // Filtra apenas QR Codes ativos (não soft-deleted)
                const active = validated.filter(qr => qr.archived !== true);

                // Ordenação numérica natural: extrai o número do label para ordenar
                // Ex: "saca 56" → 56, "saca 610" → 610 — ordem crescente
                active.sort((a, b) => {
                    const numA = extractSortNumber(a.label);
                    const numB = extractSortNumber(b.label);
                    if (numA !== null && numB !== null) return numA - numB;
                    if (numA !== null) return -1;
                    if (numB !== null) return 1;
                    return a.label.localeCompare(b.label, 'pt-BR', { numeric: true });
                });

                setQrCodes(active);
                setActiveIndex(0);
            } catch (error) {
                logger.error('[QRViewer]', 'Erro ao buscar QR Codes:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchQRCodes();
    }, [visible]);

    /**
     * Renderiza cada slide do carousel com a imagem do QR Code.
     * Usa width fixa do dispositivo para paginação perfeita.
     */
    const renderQRSlide = ({ item, index }: { item: SackQRCode; index: number }) => (
        <View style={{ width: SCREEN_WIDTH, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
            {/* Label do QR Code */}
            <View className="bg-surface border border-border rounded-xl px-5 py-3 mb-6">
                <Text className="text-white text-lg font-spaceGroteskBold text-center tracking-wide">
                    {item.label || `QR Code ${index + 1}`}
                </Text>
                <Text className="text-[#94a3b8] text-xs font-spaceGrotesk text-center mt-1">
                    {item.fileName}
                </Text>
            </View>

            {/* Imagem do QR Code - ocupa área máxima */}
            <View className="bg-white rounded-2xl p-4 items-center justify-center shadow-lg"
                style={{ width: SCREEN_WIDTH - 64, height: SCREEN_WIDTH - 64 }}
            >
                <Image
                    source={{ uri: item.downloadUrl }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="contain"
                />
            </View>

            {/* Tamanho do arquivo */}
            <Text className="text-[#64748b] text-[10px] font-spaceGrotesk uppercase tracking-widest mt-4">
                {(item.fileSize / 1024).toFixed(0)} KB • {item.mimeType.split('/')[1]?.toUpperCase()}
            </Text>
        </View>
    );

    /**
     * Handler de scroll — calcula o índice do slide ativo baseado no offset.
     */
    const handleScroll = (event: any) => {
        const offsetX = event.nativeEvent.contentOffset.x;
        const index = Math.round(offsetX / SCREEN_WIDTH);
        if (index >= 0 && index < qrCodes.length) {
            setActiveIndex(index);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
            <View className="flex-1 bg-background">
                {/* Header */}
                <View className="flex-row items-center justify-between px-5 pt-14 pb-4 border-b border-border">
                    <View className="flex-row items-center gap-3">
                        <View className="w-10 h-10 rounded-full bg-orange-500/10 border border-orange-500/20 items-center justify-center">
                            <QrCode color="#f97316" size={20} />
                        </View>
                        <View>
                            <Text className="text-white font-spaceGroteskBold text-lg">QR Codes das Sacas</Text>
                            <Text className="text-[#94a3b8] font-spaceGrotesk text-xs">
                                {isLoading ? 'Carregando...' : `${qrCodes.length} QR Code${qrCodes.length !== 1 ? 's' : ''} disponíve${qrCodes.length !== 1 ? 'is' : 'l'}`}
                            </Text>
                        </View>
                    </View>

                    <TouchableOpacity
                        onPress={onClose}
                        className="w-10 h-10 rounded-full bg-surface border border-border items-center justify-center"
                    >
                        <X color="#94a3b8" size={20} />
                    </TouchableOpacity>
                </View>

                {/* Conteúdo */}
                {isLoading ? (
                    <View className="flex-1 items-center justify-center">
                        <ActivityIndicator size="large" color={THEME.colors.primary} />
                        <Text className="text-[#94a3b8] mt-4 font-spaceGrotesk">Buscando QR Codes...</Text>
                    </View>
                ) : qrCodes.length === 0 ? (
                    <View className="flex-1 items-center justify-center px-8">
                        <View className="w-20 h-20 rounded-full bg-surface border border-border items-center justify-center mb-6">
                            <Package color="#94a3b8" size={36} />
                        </View>
                        <Text className="text-white text-xl font-spaceGroteskBold text-center mb-2">
                            Nenhum QR Code disponível
                        </Text>
                        <Text className="text-[#94a3b8] font-spaceGrotesk text-center leading-relaxed">
                            O administrador ainda não subiu os QR Codes das sacas. Quando estiverem disponíveis, aparecerão aqui.
                        </Text>
                    </View>
                ) : (
                    <View className="flex-1 justify-center">
                        {/* Indicador de posição */}
                        <View className="flex-row items-center justify-center mb-6 gap-2">
                            <View className="bg-orange-500/10 border border-orange-500/20 px-4 py-2 rounded-full">
                                <Text className="text-orange-400 font-spaceGroteskBold text-sm tracking-wider">
                                    {activeIndex + 1} de {qrCodes.length}
                                </Text>
                            </View>
                        </View>

                        {/* Carousel horizontal */}
                        <FlatList
                            data={qrCodes}
                            renderItem={renderQRSlide}
                            keyExtractor={(item) => item.id}
                            horizontal
                            pagingEnabled
                            showsHorizontalScrollIndicator={false}
                            onScroll={handleScroll}
                            scrollEventThrottle={16}
                            getItemLayout={(_, index) => ({
                                length: SCREEN_WIDTH,
                                offset: SCREEN_WIDTH * index,
                                index,
                            })}
                        />

                        {/* Dots indicadores */}
                        <View className="flex-row items-center justify-center mt-6 gap-2 pb-8">
                            {qrCodes.map((_, index) => (
                                <View
                                    key={index}
                                    className={`rounded-full ${index === activeIndex
                                        ? 'w-8 h-2 bg-orange-500'
                                        : 'w-2 h-2 bg-[#2d3345]'
                                        }`}
                                />
                            ))}
                        </View>
                    </View>
                )}
            </View>
        </Modal>
    );
}
