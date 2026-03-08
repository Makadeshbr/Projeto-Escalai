import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react-native';
import { THEME } from '~/src/constants/theme';
import type { ActionModalState } from '~/src/hooks/useActionModal';

/**
 * Props do modal de ação genérico.
 */
interface DashboardActionModalProps {
    /** Estado do modal */
    modal: ActionModalState;
    /** Callback para fechar o modal */
    onDismiss: () => void;
}

/**
 * Modal genérico de ações para o dashboard admin.
 * Exibe mensagens de sucesso, erro, warning, info e confirmação
 * com ícones, cores e botões contextuais.
 */
export function DashboardActionModal({ modal, onDismiss }: DashboardActionModalProps) {
    const [isConfirming, setIsConfirming] = useState(false);

    /** Retorna a cor de fundo do ícone baseada no tipo */
    const getIconBg = () => {
        switch (modal.type) {
            case 'error': return 'bg-red-500/10';
            case 'success': return 'bg-primary/10';
            case 'warning': return 'bg-yellow-500/10';
            default: return 'bg-blue-500/10';
        }
    };

    /** Renderiza ícone apropriado para o tipo de modal */
    const renderIcon = () => {
        switch (modal.type) {
            case 'error': return <AlertTriangle color="#f87171" size={28} />;
            case 'warning': return <AlertTriangle color="#fbbf24" size={28} />;
            case 'success': return <CheckCircle2 color={THEME.colors.primary} size={28} />;
            case 'confirm': return <ShieldAlert color="#3b82f6" size={28} />;
            default: return <ShieldAlert color="#94a3b8" size={28} />;
        }
    };

    /** Retorna a classe CSS do botão de ação baseada no tipo */
    const getButtonClass = () => {
        switch (modal.type) {
            case 'error': return 'bg-red-500/20 border-red-500/30';
            case 'warning': return 'bg-yellow-500/20 border-yellow-500/30';
            case 'success': return 'bg-primary/20 border-primary/30';
            default: return 'bg-blue-500/20 border-blue-500/30';
        }
    };

    /** Retorna a cor do texto do botão de ação */
    const getButtonTextColor = () => {
        switch (modal.type) {
            case 'error': return 'text-red-400';
            case 'warning': return 'text-yellow-400';
            case 'success': return 'text-primary';
            default: return 'text-blue-400';
        }
    };

    return (
        <Modal visible={modal.visible} animationType="fade" transparent>
            <View className="flex-1 bg-black/80 justify-center items-center px-6">
                <View className="bg-surface border border-border w-full rounded-3xl p-6 items-center">
                    {/* Ícone */}
                    <View className={`w-16 h-16 rounded-full items-center justify-center mb-5 ${getIconBg()}`}>
                        {renderIcon()}
                    </View>

                    {/* Título e mensagem */}
                    <Text className="text-white font-spaceGroteskBold text-xl text-center mb-2">{modal.title}</Text>
                    <Text className="text-[#94a3b8] font-spaceGrotesk text-[14px] text-center mb-8 leading-relaxed">
                        {modal.message}
                    </Text>

                    {/* Botões */}
                    <View className="w-full flex-row gap-3">
                        {modal.type === 'confirm' && (
                            <TouchableOpacity
                                className="flex-1 bg-background border border-border rounded-xl py-3.5 items-center"
                                onPress={onDismiss}
                            >
                                <Text className="text-[#94a3b8] font-spaceGroteskBold uppercase text-[13px]">Cancelar</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            className={`flex-1 rounded-xl py-3.5 items-center ${getButtonClass()}`}
                            disabled={isConfirming}
                            onPress={async () => {
                                if (modal.type === 'confirm') {
                                    if (isConfirming) return;
                                    setIsConfirming(true);
                                    onDismiss();
                                    try {
                                        await modal.onConfirm();
                                    } finally {
                                        setIsConfirming(false);
                                    }
                                } else {
                                    onDismiss();
                                }
                            }}
                        >
                            {isConfirming ? (
                                <ActivityIndicator size="small" color="#94a3b8" />
                            ) : (
                                <Text className={`font-spaceGroteskBold uppercase text-[13px] ${getButtonTextColor()}`}>
                                    {modal.type === 'confirm' ? 'Confirmar' : 'Entendi'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
