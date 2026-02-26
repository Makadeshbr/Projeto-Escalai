/**
 * Modal premium de detalhes do Assignment (rota).
 * Exibe informações completas da rota com timeline de status visual.
 * Usado no histórico e dashboard do motorista.
 */

import React from 'react';
import { View, Text, Modal, Pressable, TouchableOpacity, ScrollView } from 'react-native';
import { X, MapPin, Truck, Clock, Package, Navigation, Waves, CheckCircle2, Hourglass } from 'lucide-react-native';
import { THEME } from '~/src/constants/theme';
import { Assignment, WAVE_META } from '~/src/lib/collections';

interface AssignmentDetailProps {
    /** Flag de visibilidade */
    visible: boolean;
    /** Callback de fechamento */
    onClose: () => void;
    /** Dados do assignment selecionado */
    assignment: Assignment | null;
}

/** Mapa de status do ciclo de doca para visual */
const DOCK_STATUS_CONFIG = {
    waiting: { label: 'Aguardando Liberação', color: '#eab308', icon: Hourglass },
    liberated: { label: 'Doca Liberada', color: '#4ade80', icon: CheckCircle2 },
    departed: { label: 'Motorista Saiu', color: '#60a5fa', icon: Navigation },
} as const;

/** Mapa de status geral da rota */
const ROUTE_STATUS_CONFIG = {
    pending: { label: 'Pendente', color: '#eab308' },
    confirmed: { label: 'Confirmada', color: '#4ade80' },
    in_progress: { label: 'Em Andamento', color: '#60a5fa' },
    completed: { label: 'Concluída', color: '#a78bfa' },
} as const;

/**
 * Modal bottom-sheet com detalhes completos de uma rota/assignment.
 * Exibe cidade, onda, doca, rota, sacas, status e timeline visual.
 */
export function AssignmentDetailModal({
    visible,
    onClose,
    assignment,
}: AssignmentDetailProps) {
    if (!assignment) return null;

    const dockConfig = DOCK_STATUS_CONFIG[assignment.dockStatus] || DOCK_STATUS_CONFIG.waiting;
    const routeConfig = ROUTE_STATUS_CONFIG[assignment.status] || ROUTE_STATUS_CONFIG.pending;
    const DockIcon = dockConfig.icon;
    const waveMeta = WAVE_META[assignment.wave] || { label: assignment.wave, time: '' };

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
                    onPress={() => { }}
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
                        {/* Header */}
                        <View className="flex-row items-center justify-between mt-4 mb-6">
                            <View className="flex-1">
                                <Text className="text-white font-spaceGroteskBold text-xl tracking-tight">
                                    {assignment.cityName}
                                </Text>
                                <Text className="text-[#94a3b8] font-spaceGrotesk text-xs mt-1">
                                    {waveMeta.label} • {waveMeta.time}
                                </Text>
                            </View>
                            <View className="flex-row items-center gap-2">
                                <View
                                    className="px-3 py-1.5 rounded-full border"
                                    style={{ backgroundColor: `${routeConfig.color}15`, borderColor: `${routeConfig.color}30` }}
                                >
                                    <Text style={{ color: routeConfig.color }} className="font-spaceGroteskBold text-[10px] uppercase tracking-wider">
                                        {routeConfig.label}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Grid de informações */}
                        <View className="mb-6">
                            <Text className="text-[11px] font-spaceGroteskBold text-[#94a3b8] uppercase tracking-widest mb-3 ml-1">
                                Detalhes da Rota
                            </Text>
                            <View className="bg-surface rounded-2xl border border-border overflow-hidden">
                                {/* Linha 1: Doca + Rota */}
                                <View className="flex-row border-b border-border">
                                    <View className="flex-1 p-4 border-r border-border">
                                        <Text className="text-[10px] text-[#94a3b8] font-spaceGrotesk uppercase tracking-wider mb-1">Doca</Text>
                                        <Text className="text-white font-spaceGroteskBold text-lg">{assignment.dock || 'N/A'}</Text>
                                    </View>
                                    <View className="flex-1 p-4">
                                        <Text className="text-[10px] text-[#94a3b8] font-spaceGrotesk uppercase tracking-wider mb-1">Rota</Text>
                                        <Text className="text-white font-spaceGroteskBold text-lg">{assignment.routeLabel || 'N/A'}</Text>
                                    </View>
                                </View>

                                {/* Linha 2: Sacas + SDD */}
                                <View className="flex-row border-b border-border">
                                    <View className="flex-1 p-4 border-r border-border">
                                        <Text className="text-[10px] text-[#94a3b8] font-spaceGrotesk uppercase tracking-wider mb-1">Sacas</Text>
                                        <View className="flex-row items-center gap-2">
                                            <Package color={THEME.colors.primary} size={16} />
                                            <Text className="text-white font-spaceGroteskBold text-lg">{assignment.sacas ?? 0}</Text>
                                        </View>
                                    </View>
                                    <View className="flex-1 p-4">
                                        <Text className="text-[10px] text-[#94a3b8] font-spaceGrotesk uppercase tracking-wider mb-1">Tipo</Text>
                                        <View className={`self-start px-2.5 py-1 rounded ${assignment.isSdd ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-surface border border-border'}`}>
                                            <Text className={`text-[11px] font-spaceGroteskBold uppercase tracking-wider ${assignment.isSdd ? 'text-yellow-400' : 'text-[#94a3b8]'}`}>
                                                {assignment.isSdd ? 'SDD' : 'Normal'}
                                            </Text>
                                        </View>
                                    </View>
                                </View>

                                {/* Linha 3: Onda + Motorista */}
                                <View className="flex-row">
                                    <View className="flex-1 p-4 border-r border-border">
                                        <Text className="text-[10px] text-[#94a3b8] font-spaceGrotesk uppercase tracking-wider mb-1">Onda</Text>
                                        <Text className="text-white font-spaceGroteskBold text-sm">{assignment.waveNumber || waveMeta.label}</Text>
                                    </View>
                                    <View className="flex-1 p-4">
                                        <Text className="text-[10px] text-[#94a3b8] font-spaceGrotesk uppercase tracking-wider mb-1">Motorista</Text>
                                        <Text className="text-white font-spaceGrotesk text-sm" numberOfLines={1}>{assignment.driverName}</Text>
                                    </View>
                                </View>
                            </View>
                        </View>

                        {/* Status da Doca — Timeline */}
                        <View className="mb-6">
                            <Text className="text-[11px] font-spaceGroteskBold text-[#94a3b8] uppercase tracking-widest mb-3 ml-1">
                                Ciclo da Doca
                            </Text>
                            <View className="bg-surface rounded-2xl border border-border p-4">
                                {(['waiting', 'liberated', 'departed'] as const).map((step, idx) => {
                                    const config = DOCK_STATUS_CONFIG[step];
                                    const StepIcon = config.icon;
                                    const isActive = assignment.dockStatus === step;
                                    const isPast = (['waiting', 'liberated', 'departed'] as const).indexOf(assignment.dockStatus) >= idx;

                                    return (
                                        <View key={step} className="flex-row items-center mb-3 last:mb-0">
                                            <View
                                                className="w-8 h-8 rounded-full items-center justify-center mr-3 border"
                                                style={{
                                                    backgroundColor: isPast ? `${config.color}15` : '#13151f',
                                                    borderColor: isPast ? `${config.color}30` : '#2d3345',
                                                }}
                                            >
                                                <StepIcon color={isPast ? config.color : '#4b5563'} size={14} />
                                            </View>
                                            <Text
                                                className={`font-spaceGrotesk text-sm ${isActive ? 'font-spaceGroteskBold' : ''}`}
                                                style={{ color: isPast ? config.color : '#4b5563' }}
                                            >
                                                {config.label}
                                            </Text>
                                            {isActive && (
                                                <View className="ml-auto px-2 py-1 bg-white/5 rounded">
                                                    <Text className="text-[9px] text-[#94a3b8] font-spaceGroteskBold uppercase tracking-wider">Atual</Text>
                                                </View>
                                            )}
                                        </View>
                                    );
                                })}
                            </View>
                        </View>

                        {/* ID + Data */}
                        <View className="flex-row items-center justify-between px-1 mb-4">
                            <Text className="text-[#4b5563] font-mono text-[10px]">
                                ID: {assignment.id.substring(0, 12).toUpperCase()}
                            </Text>
                            <Text className="text-[#4b5563] font-spaceGrotesk text-[10px]">
                                {new Date(assignment.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </Text>
                        </View>

                        {/* Fechar */}
                        <TouchableOpacity
                            onPress={onClose}
                            className="w-full py-4 bg-white/5 border border-white/10 rounded-xl items-center"
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
