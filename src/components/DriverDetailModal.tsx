/**
 * Modal premium de detalhes do motorista.
 * Exibe avatar, dados, métricas consolidadas e ações rápidas.
 * Usado na tela de condutores para visualização detalhada.
 */

import React from 'react';
import { View, Text, Modal, Pressable, TouchableOpacity, ScrollView } from 'react-native';
import { X, User, Truck, MapPin, Package, Calendar, Shield, ShieldAlert, Bell } from 'lucide-react-native';
import { THEME } from '~/src/constants/theme';
import { DriverAvatar } from './ui/DriverAvatar';

interface DriverDetailProps {
    /** Flag de visibilidade do modal */
    visible: boolean;
    /** Callback de fechamento */
    onClose: () => void;
    /** Dados do motorista selecionado */
    driver: {
        id: string;
        driverName: string;
        driverPlate: string;
        avatarUrl?: string;
        status: 'confirmed' | 'pending' | 'denied' | 'inactive';
        neverAccessed?: boolean;
    } | null;
    /** Ação de edição — abre formulário CRUD existente */
    onEdit?: (driver: any) => void;
    /** Ação de notificação individual */
    onNotify?: (driver: any) => void;
}

/** Mapa de status para label e cor visual */
const STATUS_CONFIG = {
    confirmed: { label: 'Confirmado', color: '#4ade80', bg: 'bg-green-500/10', border: 'border-green-500/20' },
    pending: { label: 'Pendente', color: '#eab308', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
    denied: { label: 'Ausente', color: '#f87171', bg: 'bg-red-500/10', border: 'border-red-500/20' },
    inactive: { label: 'Inativo', color: '#64748b', bg: 'bg-slate-500/10', border: 'border-slate-500/20' },
} as const;

/**
 * Modal de detalhes do motorista com visual premium.
 * Renderiza informações completas + ações contextuais.
 */
export function DriverDetailModal({
    visible,
    onClose,
    driver,
    onEdit,
    onNotify,
}: DriverDetailProps) {
    if (!driver) return null;

    const statusConfig = STATUS_CONFIG[driver.status] || STATUS_CONFIG.inactive;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <Pressable
                className="flex-1 justify-end bg-black/70"
                onPress={onClose}
            >
                <Pressable
                    className="bg-[#13151f] rounded-t-3xl border-t border-border"
                    onPress={() => { }} // Impede propagação do toque para o backdrop
                >
                    {/* Handle bar */}
                    <View className="items-center pt-3 pb-2">
                        <View className="w-10 h-1 bg-[#2d3345] rounded-full" />
                    </View>

                    <ScrollView
                        className="px-6 pb-8"
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 30 }}
                    >
                        {/* Header com Avatar */}
                        <View className="items-center mt-4 mb-6">
                            <View className="mb-4">
                                <DriverAvatar
                                    avatarUrl={driver.avatarUrl}
                                    size={80}
                                />
                            </View>

                            <Text className="text-white font-spaceGroteskBold text-2xl tracking-tight text-center">
                                {driver.driverName}
                            </Text>

                            <View className="flex-row items-center gap-3 mt-3">
                                {/* Badge de Placa */}
                                <View className="flex-row items-center gap-1.5 bg-surface px-3 py-1.5 rounded-full border border-border">
                                    <Truck color="#94a3b8" size={14} />
                                    <Text className="text-[#94a3b8] font-spaceGroteskBold text-xs tracking-wider">
                                        {driver.driverPlate}
                                    </Text>
                                </View>

                                {/* Badge de Status */}
                                <View className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full ${statusConfig.bg} border ${statusConfig.border}`}>
                                    <View className="w-2 h-2 rounded-full" style={{ backgroundColor: statusConfig.color }} />
                                    <Text style={{ color: statusConfig.color }} className="font-spaceGroteskBold text-xs uppercase tracking-wider">
                                        {statusConfig.label}
                                    </Text>
                                </View>
                            </View>

                            {driver.neverAccessed && (
                                <View className="flex-row items-center gap-2 mt-3 bg-amber-500/10 px-4 py-2 rounded-xl border border-amber-500/20">
                                    <ShieldAlert color="#f59e0b" size={14} />
                                    <Text className="text-amber-400 text-xs font-spaceGrotesk">
                                        Nunca acessou o aplicativo
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* Informações do perfil */}
                        <View className="mb-6">
                            <Text className="text-[11px] font-spaceGroteskBold text-[#94a3b8] uppercase tracking-widest mb-3 ml-1">
                                Identificação
                            </Text>
                            <View className="bg-surface rounded-2xl border border-border divide-y divide-border">
                                <View className="flex-row items-center px-4 py-3.5">
                                    <View className="w-8 h-8 rounded-full bg-background items-center justify-center mr-3 border border-border">
                                        <User color={THEME.colors.primary} size={14} />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-[10px] text-[#94a3b8] font-spaceGrotesk uppercase tracking-wider">ID do Motorista</Text>
                                        <Text className="text-white font-spaceGrotesk text-xs mt-0.5">{driver.id.substring(0, 12).toUpperCase()}</Text>
                                    </View>
                                </View>
                                <View className="flex-row items-center px-4 py-3.5">
                                    <View className="w-8 h-8 rounded-full bg-background items-center justify-center mr-3 border border-border">
                                        <Shield color="#4ade80" size={14} />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-[10px] text-[#94a3b8] font-spaceGrotesk uppercase tracking-wider">Status da Conta</Text>
                                        <Text style={{ color: statusConfig.color }} className="font-spaceGroteskBold text-xs mt-0.5">
                                            {statusConfig.label}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </View>

                        {/* Ações */}
                        <View>
                            <Text className="text-[11px] font-spaceGroteskBold text-[#94a3b8] uppercase tracking-widest mb-3 ml-1">
                                Ações Rápidas
                            </Text>
                            <View className="flex-row gap-3">
                                {onEdit && (
                                    <TouchableOpacity
                                        onPress={() => { onClose(); setTimeout(() => onEdit(driver), 300); }}
                                        className="flex-1 bg-surface border border-border rounded-2xl py-4 items-center"
                                    >
                                        <User color={THEME.colors.primary} size={20} />
                                        <Text className="text-white font-spaceGroteskBold text-[11px] mt-2 uppercase tracking-wider">
                                            Editar
                                        </Text>
                                    </TouchableOpacity>
                                )}

                                {onNotify && (
                                    <TouchableOpacity
                                        onPress={() => { onClose(); setTimeout(() => onNotify(driver), 300); }}
                                        className="flex-1 bg-surface border border-border rounded-2xl py-4 items-center"
                                    >
                                        <Bell color="#eab308" size={20} />
                                        <Text className="text-white font-spaceGroteskBold text-[11px] mt-2 uppercase tracking-wider">
                                            Notificar
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>

                        {/* Fechar */}
                        <TouchableOpacity
                            onPress={onClose}
                            className="w-full mt-6 py-4 bg-white/5 border border-white/10 rounded-xl items-center"
                        >
                            <Text className="text-[#94a3b8] font-spaceGroteskBold text-sm tracking-wider">
                                Fechar
                            </Text>
                        </TouchableOpacity>
                    </ScrollView>
                </Pressable>
            </Pressable>
        </Modal>
    );
}
