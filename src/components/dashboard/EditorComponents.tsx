import React from 'react';
import { View, Text, TouchableOpacity, TextInput, Modal, StyleSheet, Animated } from 'react-native';
import { Edit3, MapPin, Package, Navigation, X, CreditCard, ChevronRight } from 'lucide-react-native';
import { THEME } from '~/src/constants/theme';
import type { Assignment } from '~/src/lib/collections';
import { DriverAvatar } from '~/src/components/ui/DriverAvatar';
import { LinearGradient } from 'expo-linear-gradient';

interface EditorCardProps {
    assignment: Assignment;
    onEdit: (assignment: Assignment) => void;
    avatarUrl?: string;
}

export function EditorCard({ assignment, onEdit, avatarUrl }: EditorCardProps) {
    return (
        <View className="mb-4 bg-surface rounded-2xl border border-border p-5 relative overflow-hidden shadow-sm">
            {/* Header com Status e Hora */}
            <View className="flex-row justify-between items-center mb-4">
                <View className="bg-primary/10 px-2 py-1 rounded border border-primary/20">
                    <Text className="text-primary text-[10px] uppercase font-spaceGroteskBold tracking-wider">
                        {assignment.waveLabel || 'Onda'} {assignment.waveNumber ? `• ${assignment.waveNumber}` : ''}
                    </Text>
                </View>
                <Text className="text-text-muted text-[11px] font-mono">
                    {new Date(assignment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
            </View>

            {/* Content Principal (Motorista e Destino) */}
            <View className="flex-row gap-4 mb-5 items-center">
                <View className="w-14 h-14 shrink-0">
                    <DriverAvatar avatarUrl={avatarUrl} size={56} />
                </View>

                <View className="flex-1">
                    <Text className="text-white text-lg font-spaceGroteskBold mb-1" numberOfLines={1}>
                        {assignment.driverName}
                    </Text>
                    <View className="flex-row gap-2">
                        <View className="bg-background px-2 py-1 rounded border border-border flex-row items-center gap-1">
                            <CreditCard size={12} color="#94a3b8" />
                            <Text className="text-[#94a3b8] text-[10px] uppercase font-spaceGroteskBold tracking-widest leading-none mt-[1px]">
                                {assignment.driverPlate || '--'}
                            </Text>
                        </View>
                        {assignment.isSdd && (
                            <View className="bg-orange-500/10 px-2 py-1 rounded border border-orange-500/20 items-center justify-center">
                                <Text className="text-orange-500 text-[10px] uppercase font-spaceGroteskBold tracking-widest leading-none mt-[1px]">SDD</Text>
                            </View>
                        )}
                    </View>
                </View>
            </View>

            {/* Rotas Info (Destino, Rota, Doca) */}
            <View className="flex-row gap-2 mb-6">
                <View className="flex-[1.5] bg-background border border-border p-3 rounded-xl flex-row items-center gap-2">
                    <MapPin size={16} color="#64748b" />
                    <View className="flex-1">
                        <Text className="text-[#94a3b8] text-[9px] uppercase tracking-wider mb-0.5">Destino</Text>
                        <Text className="text-white text-sm font-spaceGroteskBold shrink" numberOfLines={1}>{assignment.cityName}</Text>
                    </View>
                </View>

                <View className="flex-[1] bg-background border border-border p-3 rounded-xl flex-row items-center gap-2">
                    <Navigation size={16} color="#64748b" />
                    <View className="flex-1">
                        <Text className="text-[#94a3b8] text-[9px] uppercase tracking-wider mb-0.5">Rota</Text>
                        <Text className="text-white text-sm font-spaceGroteskBold shrink" numberOfLines={1}>{assignment.routeLabel || '--'}</Text>
                    </View>
                </View>

                <View className="w-16 bg-background border border-border p-3 rounded-xl items-center justify-center">
                    <Text className="text-[#94a3b8] text-[9px] uppercase tracking-wider mb-0.5">Doca</Text>
                    <Text className="text-primary text-lg font-spaceGroteskBold">{assignment.dock}</Text>
                </View>
            </View>

            {/* Ação de Edição */}
            <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => onEdit(assignment)}
                className="w-full bg-[#1e2332] border border-[#2d3345] rounded-xl flex-row items-center justify-center py-3.5 gap-2"
            >
                <Edit3 color="#cbd5e1" size={16} />
                <Text className="text-slate-300 font-spaceGroteskBold uppercase text-xs tracking-wider">Ajustar Escala</Text>
            </TouchableOpacity>
        </View>
    );
}

// ------------------------------------------------------------
// MODAL DE EDIÇÃO EM TEMPO REAL
// ------------------------------------------------------------
interface EditorFormProps {
    visible: boolean;
    assignment: Assignment | null;
    plate: string; setPlate: (t: string) => void;
    city: string; setCity: (t: string) => void;
    dock: string; setDock: (t: string) => void;
    route: string; setRoute: (t: string) => void;
    onSave: () => void;
    onCancel: () => void;
}

export function EditorFormModal(props: EditorFormProps) {
    if (!props.visible || !props.assignment) return null;

    return (
        <Modal visible={props.visible} transparent animationType="slide">
            <View className="flex-1 bg-black/60 justify-end">
                <View className="bg-background rounded-t-3xl border-t border-border overflow-hidden">
                    {/* Handle */}
                    <View className="w-10 h-1 bg-[#2d3345] rounded-full self-center mt-3 mb-2" />

                    <View className="px-5 pb-8 pt-2">
                        <View className="flex-row justify-between items-center mb-6">
                            <View>
                                <Text className="text-xl font-spaceGroteskBold text-white text-shadow-sm">Editar Escala Ativa</Text>
                                <Text className="text-[#94a3b8] font-spaceGrotesk text-[11px] uppercase tracking-wider mt-1">Correção Online e Push</Text>
                            </View>
                            <TouchableOpacity onPress={props.onCancel} className="w-8 h-8 rounded-full bg-white/5 items-center justify-center border border-white/10">
                                <X size={18} color="#cbd5e1" />
                            </TouchableOpacity>
                        </View>

                        {/* Motorista Box (Focado em Placa => Reatribuição mágica) */}
                        <View className="mb-5 bg-surface p-4 rounded-xl border border-primary/20">
                            <View className="flex-row items-center gap-2 mb-3">
                                <View className="w-6 h-6 rounded-full bg-primary/20 items-center justify-center"><Navigation size={12} color={THEME.colors.primary} /></View>
                                <Text className="text-[#cbd5e1] font-spaceGrotesk text-xs uppercase tracking-wider">Identidade e Destino</Text>
                            </View>

                            {/* Placa Input - Crítico para Reparar IA */}
                            <Text className="text-[11px] text-[#94a3b8] font-spaceGroteskBold uppercase tracking-wider ml-1 mb-1.5">Placa do Veículo (Busca Master)</Text>
                            <TextInput
                                value={props.plate}
                                onChangeText={props.setPlate}
                                placeholder="AAA1B23"
                                placeholderTextColor="#475569"
                                autoCapitalize="characters"
                                className="w-full h-12 bg-background border border-border rounded-lg px-4 text-white font-spaceGroteskBold mb-4 text-[15px]"
                            />
                            <Text className="text-[10px] text-primary/70 font-spaceGrotesk mt-[-10px] mb-4 ml-1">
                                * Mudando a placa e salvando, o proprietário correto receberá a rota no app.
                            </Text>

                            {/* Cidade Input */}
                            <Text className="text-[11px] text-[#94a3b8] font-spaceGroteskBold uppercase tracking-wider ml-1 mb-1.5">Cidade Base / CD</Text>
                            <TextInput
                                value={props.city}
                                onChangeText={props.setCity}
                                placeholder="Qual a praça?"
                                placeholderTextColor="#475569"
                                className="w-full h-12 bg-background border border-border rounded-lg px-4 text-white font-spaceGroteskBold text-[15px]"
                            />
                        </View>

                        {/* Destino Box (Rota/Doca) */}
                        <View className="flex-row gap-3 mb-8">
                            <View className="flex-[1.5]">
                                <Text className="text-[11px] text-[#94a3b8] font-spaceGroteskBold uppercase tracking-wider ml-1 mb-1.5">Cód. Rota</Text>
                                <TextInput
                                    value={props.route}
                                    onChangeText={props.setRoute}
                                    placeholder="Ex: AM_19"
                                    placeholderTextColor="#475569"
                                    autoCapitalize="characters"
                                    className="w-full h-12 bg-surface flex-1 border border-border rounded-lg px-4 text-white font-spaceGroteskBold text-[15px]"
                                />
                            </View>

                            <View className="flex-1">
                                <Text className="text-[11px] text-[#94a3b8] font-spaceGroteskBold uppercase tracking-wider ml-1 mb-1.5">Doca</Text>
                                <TextInput
                                    value={props.dock}
                                    onChangeText={props.setDock}
                                    placeholder="Nº"
                                    placeholderTextColor="#475569"
                                    className="w-full h-12 bg-surface/50 border border-[#3b82f6]/30 rounded-lg px-4 text-[#3b82f6] font-spaceGroteskBold text-lg text-center"
                                />
                            </View>
                        </View>

                        {/* Save Actions */}
                        <TouchableOpacity
                            onPress={props.onSave}
                            activeOpacity={0.8}
                            className="w-full h-14 rounded-xl overflow-hidden"
                        >
                            <LinearGradient
                                colors={['#eab308', '#ca8a04']}
                                style={StyleSheet.absoluteFill}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            />
                            <View className="flex-1 flex-row items-center justify-center gap-2">
                                <Text className="text-[#13151f] font-spaceGroteskBold text-[15px] uppercase tracking-wider">Salvar Modificação</Text>
                                <ChevronRight size={18} color="#13151f" />
                            </View>
                        </TouchableOpacity>

                    </View>
                </View>
            </View>
        </Modal>
    );
}
