import React from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Modal } from 'react-native';
import { X, Check, User } from 'lucide-react-native';
import { THEME } from '~/src/constants/theme';
import { WAVE_META, DriverAvailability } from '~/src/lib/collections';
import type { WaveKey } from '~/src/hooks/useDashboardData';

/**
 * Props do modal de seleção de motoristas com checkboxes.
 */
interface DriverPickerModalProps {
    /** Se o modal está visível */
    visible: boolean;
    /** Lista de motoristas disponíveis no turno/data */
    drivers: DriverAvailability[];
    /** IDs dos motoristas selecionados */
    selectedIds: Set<string>;
    /** Turno atual (para exibir label) */
    selectedWave: WaveKey;
    /** Se está carregando motoristas */
    loading: boolean;
    /** Callback ao clicar em um motorista (toggle seleção) */
    onToggle: (driverId: string) => void;
    /** Callback ao confirmar seleção */
    onConfirm: () => void;
    /** Callback ao fechar o modal */
    onClose: () => void;
}

/**
 * Modal para seleção de motoristas com checkboxes.
 * Exibe nome, placa e quantidade de selecionados.
 */
export function DriverPickerModal({
    visible, drivers, selectedIds, selectedWave, loading,
    onToggle, onConfirm, onClose
}: DriverPickerModalProps) {
    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View className="flex-1 bg-black/80 justify-end">
                <View className="bg-surface rounded-t-3xl max-h-[85%] border-t border-border shadow-2xl">
                    {/* Header */}
                    <View className="flex-row items-center justify-between p-6 border-b border-border bg-[#1a1d2e] rounded-t-3xl">
                        <View>
                            <Text className="text-white font-spaceGroteskBold text-lg">Selecionar Motoristas</Text>
                            <Text className="text-primary font-spaceGrotesk text-xs mt-1 tracking-wider uppercase">TURNO: {WAVE_META[selectedWave].label}</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} className="w-8 h-8 bg-background items-center justify-center rounded-full">
                            <X color="#94a3b8" size={18} />
                        </TouchableOpacity>
                    </View>

                    {/* Counter */}
                    {selectedIds.size > 0 && (
                        <View className="px-6 py-3 bg-primary/10 border-b border-primary/20 flex-row items-center gap-2">
                            <Check color={THEME.colors.primary} size={16} />
                            <Text className="text-primary text-[13px] font-spaceGroteskBold uppercase tracking-wide">
                                {selectedIds.size} MOTORISTA(S) PRONTOS
                            </Text>
                        </View>
                    )}

                    {/* Conteúdo */}
                    {loading ? (
                        <View className="py-20 items-center">
                            <ActivityIndicator color={THEME.colors.primary} size="large" />
                        </View>
                    ) : drivers.length === 0 ? (
                        <View className="py-20 items-center px-8 text-center">
                            <View className="w-16 h-16 rounded-full bg-background items-center justify-center mb-4 border border-border">
                                <User color={THEME.colors.textMuted} size={24} />
                            </View>
                            <Text className="text-white font-spaceGroteskBold text-base mb-1">Nenhum disponível</Text>
                            <Text className="text-[#94a3b8] font-spaceGrotesk text-[13px] text-center">
                                Nenhum motorista sinalizou disponibilidade para o turno {WAVE_META[selectedWave].label} ainda.
                            </Text>
                        </View>
                    ) : (
                        <FlatList
                            data={drivers}
                            keyExtractor={(item) => item.driverId || item.id}
                            contentContainerStyle={{ paddingBottom: 20 }}
                            renderItem={({ item }) => {
                                const driverKey = item.driverId || item.id;
                                const isSelected = selectedIds.has(driverKey);
                                return (
                                    <TouchableOpacity
                                        onPress={() => onToggle(driverKey)}
                                        className={`flex-row items-center px-6 py-4 border-b border-border/50 ${isSelected ? 'bg-primary/5' : ''}`}
                                    >
                                        <View className={`w-6 h-6 rounded border mr-4 items-center justify-center ${isSelected ? 'bg-primary border-primary' : 'border-[#64748b] bg-background'}`}>
                                            {isSelected && <Check color="#000" size={14} strokeWidth={3} />}
                                        </View>
                                        <View className="flex-1">
                                            <Text className={`font-spaceGroteskBold text-[15px] ${isSelected ? 'text-primary' : 'text-white'}`}>
                                                {item.driverName || 'Motorista'}
                                            </Text>
                                            <View className="flex-row items-center gap-2 mt-1">
                                                <View className="bg-background px-2 py-0.5 rounded border border-border">
                                                    <Text className="text-[#94a3b8] text-[10px] font-spaceGrotesk uppercase tracking-wider">
                                                        PLACA: {item.driverPlate || 'N/A'}
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    )}

                    {/* Footer com botão confirmar */}
                    {drivers.length > 0 && (
                        <View className="p-6 border-t border-border bg-surface">
                            <TouchableOpacity
                                onPress={onConfirm}
                                className="bg-primary py-4 rounded-xl items-center flex-row justify-center gap-2"
                                style={{ shadowColor: THEME.colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 }}
                            >
                                <Text className="text-[#13151f] font-spaceGroteskBold text-[15px] tracking-wide">CONFIRMAR SELEÇÃO</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>
        </Modal>
    );
}
