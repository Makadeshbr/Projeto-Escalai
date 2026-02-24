import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import {
    CheckCircle2, Package, Zap, Trash2, RefreshCw
} from 'lucide-react-native';
import { THEME } from '~/src/constants/theme';
import type { Assignment } from '~/src/lib/collections';
import { EnterpriseModal } from '~/src/components/EnterpriseModal';

/**
 * Props para o componente de detalhes de atribuição de rota.
 */
interface AssignmentDetailModalProps {
    /** Se o modal está visível */
    visible: boolean;
    /** Atribuição selecionada para exibir detalhes */
    assignment: Assignment | null;
    /** Callback ao fechar o modal */
    onClose: () => void;
    /** Callback ao cancelar a rota */
    onCancel: (assignment: Assignment) => void;
    /** Callback ao reatribuir a rota */
    onReassign: (assignment: Assignment) => void;
}

/**
 * Lista de despachos recentes + botões de ação (Recarregar/Limpar).
 */
interface RecentAssignmentsListProps {
    /** Lista de assignments recentes */
    assignments: Assignment[];
    /** Callback ao clicar em um assignment */
    onSelect: (assignment: Assignment) => void;
    /** Callback para recarregar a lista */
    onRefresh: () => void;
    /** Callback para limpar todos */
    onClear: () => void;
}

/**
 * Exibe lista de despachos recentes com cards interativos.
 * Inclui botões Recarregar e Limpar no header.
 */
export function RecentAssignmentsList({
    assignments, onSelect, onRefresh, onClear
}: RecentAssignmentsListProps) {
    return (
        <View className="pb-28">
            {/* Header com ações */}
            <View className="flex-row justify-between items-center mb-4 px-1">
                <Text className="text-white text-base font-spaceGroteskBold">Despachos Recentes</Text>
                <View className="flex-row gap-3">
                    <TouchableOpacity onPress={onRefresh}>
                        <Text className="text-primary text-[13px] font-spaceGrotesk">Recarregar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onClear}>
                        <View className="px-3 py-1 bg-red-500/10 rounded border border-red-500/20">
                            <Text className="text-[#ef4444] text-[11px] font-spaceGrotesk uppercase tracking-wider">Limpar</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Lista ou estado vazio */}
            <View className="gap-3">
                {assignments.length === 0 ? (
                    <View className="p-6 items-center justify-center border border-border rounded-xl bg-surface/50 border-dashed">
                        <Text className="text-text-muted font-spaceGrotesk text-sm">Nenhum despacho realizado hoje.</Text>
                    </View>
                ) : (
                    assignments.map((assignment, idx) => (
                        <TouchableOpacity
                            key={assignment.id || idx}
                            onPress={() => onSelect(assignment)}
                            className="flex-row items-center justify-between p-4 rounded-xl bg-surface border border-border"
                        >
                            <View className="flex-row items-center gap-4 flex-1">
                                <View className="w-12 h-12 rounded-full bg-background flex flex-row items-center justify-center border border-border">
                                    {assignment.isSdd ? <Zap color={THEME.colors.primary} size={18} /> : <Package color="#94a3b8" size={18} />}
                                </View>
                                <View className="flex-1">
                                    <View className="flex-row items-center gap-2">
                                        <Text className="text-white text-[15px] font-spaceGroteskBold" numberOfLines={1}>
                                            {assignment.driverName || 'Motorista'}
                                        </Text>
                                        {assignment.status === 'confirmed' && (
                                            <View className="bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded flex-row items-center">
                                                <CheckCircle2 color="#4ade80" size={10} className="mr-1" />
                                                <Text className="text-green-400 text-[9px] font-spaceGroteskBold uppercase tracking-wider">Aceito</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text className="text-[#94a3b8] text-xs font-spaceGrotesk mt-0.5" numberOfLines={1}>
                                        {assignment.cityName || '-'} • Doca {assignment.dock || '--'}{assignment.routeLabel ? ` • Rota ${assignment.routeLabel}` : ''}
                                    </Text>
                                </View>
                            </View>
                            <View className="items-end ml-2">
                                <View className="bg-background border border-border px-2 py-1 rounded mb-1">
                                    <Text className="text-[10px] text-primary font-spaceGroteskBold">
                                        {assignment.waveNumber ? assignment.waveNumber.toUpperCase() : assignment.waveLabel?.toUpperCase() || 'ONDA'}
                                    </Text>
                                </View>
                                <Text className="text-[10px] text-text-muted font-mono">
                                    {assignment.createdAt ? new Date(assignment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Agora'}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    ))
                )}
            </View>
        </View>
    );
}

/**
 * Modal de detalhes de uma atribuição de rota específica,
 * com opções de cancelar ou reatribuir.
 */
export function AssignmentDetailModal({
    visible, assignment, onClose, onCancel, onReassign
}: AssignmentDetailModalProps) {
    if (!assignment) return null;

    return (
        <EnterpriseModal visible={visible} title="Detalhes da Rota" type="info" onClose={onClose} cancelText="Fechar">
            <View className="gap-4">
                {/* Motorista */}
                <View className="bg-background p-4 rounded-xl border border-border">
                    <Text className="text-[#94a3b8] text-[10px] font-spaceGrotesk uppercase tracking-wider mb-1">Motorista</Text>
                    <Text className="text-white text-base font-spaceGroteskBold">{assignment.driverName}</Text>
                    <Text className="text-[#94a3b8] text-xs font-spaceGrotesk uppercase">{assignment.driverPlate}</Text>
                </View>

                {/* Praça e Doca */}
                <View className="flex-row gap-3">
                    <View className="flex-1 bg-background p-4 rounded-xl border border-border">
                        <Text className="text-[#94a3b8] text-[10px] font-spaceGrotesk uppercase tracking-wider mb-1">Praça</Text>
                        <Text className="text-white text-sm font-spaceGroteskBold" numberOfLines={1}>{assignment.cityName}</Text>
                    </View>
                    <View className="flex-1 bg-background p-4 rounded-xl border border-border">
                        <Text className="text-[#94a3b8] text-[10px] font-spaceGrotesk uppercase tracking-wider mb-1">Doca</Text>
                        <Text className="text-white text-sm font-spaceGroteskBold">{assignment.dock}</Text>
                    </View>
                </View>

                {/* Código da rota */}
                {assignment.routeLabel ? (
                    <View className="bg-background p-4 rounded-xl border border-border">
                        <Text className="text-[#94a3b8] text-[10px] font-spaceGrotesk uppercase tracking-wider mb-1">Código da Rota</Text>
                        <Text className="text-primary text-base font-spaceGroteskBold">{assignment.routeLabel}</Text>
                    </View>
                ) : null}

                {/* Turno */}
                <View className="bg-background p-4 rounded-xl border border-border flex-row justify-between items-center">
                    <View>
                        <Text className="text-[#94a3b8] text-[10px] font-spaceGrotesk uppercase tracking-wider mb-1">Turno</Text>
                        <View className="flex-row items-center gap-2">
                            <Text className="text-primary text-sm font-spaceGroteskBold uppercase">{assignment.waveLabel}</Text>
                            {assignment.waveNumber && (
                                <Text className="text-white text-xs font-spaceGroteskBold bg-surface px-2 py-0.5 rounded border border-border">
                                    {assignment.waveNumber.toUpperCase()}
                                </Text>
                            )}
                        </View>
                    </View>
                    <Text className="text-text-muted font-mono text-xs">{assignment.waveTime}</Text>
                </View>

                {/* Ações */}
                <View className="flex-row gap-3 mt-4 border-t border-border pt-4">
                    <TouchableOpacity
                        onPress={() => onCancel(assignment)}
                        className="flex-1 py-3.5 rounded-xl border border-red-500/30 bg-red-500/10 flex-row justify-center items-center gap-2"
                    >
                        <Trash2 color="#f87171" size={16} />
                        <Text className="text-red-400 font-spaceGroteskBold text-[12px] uppercase">Cancelar Rota</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => onReassign(assignment)}
                        className="flex-1 py-3.5 rounded-xl border border-[#d9c400] bg-primary flex-row justify-center items-center gap-2"
                    >
                        <RefreshCw color={THEME.colors.background} size={16} />
                        <Text className="text-[#13151f] font-spaceGroteskBold text-[12px] uppercase">Reatribuir Rota</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </EnterpriseModal>
    );
}
