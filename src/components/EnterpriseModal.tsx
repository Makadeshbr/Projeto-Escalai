import React from 'react';
import { View, Text, TouchableOpacity, Modal, ActivityIndicator, ScrollView } from 'react-native';
import { THEME } from '~/src/constants/theme';
import { CheckCircle2, AlertTriangle, X, Info } from 'lucide-react-native';

interface EnterpriseModalProps {
    visible: boolean;
    title: string;
    description?: string;
    type?: 'info' | 'success' | 'warning' | 'error' | 'form';
    onClose: () => void;
    onConfirm?: () => void;
    confirmText?: string;
    cancelText?: string;
    isLoading?: boolean;
    children?: React.ReactNode;
}

export function EnterpriseModal({
    visible,
    title,
    description,
    type = 'info',
    onClose,
    onConfirm,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    isLoading = false,
    children
}: EnterpriseModalProps) {
    if (!visible) return null;

    const getIcon = () => {
        switch (type) {
            case 'success': return <CheckCircle2 color={THEME.colors.primary} size={28} />;
            case 'error': return <AlertTriangle color="#f87171" size={28} />;
            case 'warning': return <AlertTriangle color="#fbbf24" size={28} />;
            default: return <Info color="#3b82f6" size={28} />;
        }
    };

    const getIconBg = () => {
        switch (type) {
            case 'success': return 'bg-primary/10 border-primary/20';
            case 'error': return 'bg-red-500/10 border-red-500/20';
            case 'warning': return 'bg-yellow-500/10 border-yellow-500/20';
            default: return 'bg-blue-500/10 border-blue-500/20';
        }
    };

    return (
        <Modal visible={visible} transparent animationType="fade">
            {/* Dark overlay backdrop */}
            <View className="flex-1 bg-black/80 items-center justify-center p-4">

                {/* Modal Container */}
                <View className="w-full max-w-sm bg-[#1e2332] rounded-[24px] overflow-hidden border border-[#2d3345] shadow-2xl relative">

                    {/* Close Button Top Right */}
                    {type !== 'form' && (
                        <TouchableOpacity
                            onPress={onClose}
                            disabled={isLoading}
                            className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-[#13151f] items-center justify-center"
                        >
                            <X color="#94a3b8" size={18} />
                        </TouchableOpacity>
                    )}

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24 }}>
                        {type !== 'form' && (
                            <View className={`w-14 h-14 rounded-full items-center justify-center mb-5 self-center border ${getIconBg()}`}>
                                {getIcon()}
                            </View>
                        )}

                        {(type === 'form' && title) && (
                            <Text className="text-xl font-spaceGroteskBold text-white mb-2">{title}</Text>
                        )}

                        {(type !== 'form' && title) && (
                            <Text className="text-xl font-spaceGroteskBold text-white text-center mb-2">{title}</Text>
                        )}

                        {description && (
                            <Text className={`text-[#94a3b8] font-spaceGrotesk text-[14px] leading-relaxed ${type === 'form' ? 'mb-6' : 'text-center mb-6'}`}>
                                {description}
                            </Text>
                        )}

                        {/* Custom Content Slot */}
                        {children && (
                            <View className="mb-6 w-full">
                                {children}
                            </View>
                        )}

                        {/* Actions */}
                        {onConfirm ? (
                            <View className="flex-row gap-3 mt-2">
                                <TouchableOpacity
                                    onPress={onClose}
                                    disabled={isLoading}
                                    className="flex-1 bg-[#13151f] border border-[#2d3345] h-12 rounded-xl items-center justify-center"
                                >
                                    <Text className="text-[#94a3b8] font-spaceGroteskBold">{cancelText}</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={onConfirm}
                                    disabled={isLoading}
                                    className={`flex-1 h-12 rounded-xl items-center justify-center flex-row shadow-lg ${type === 'error' ? 'bg-red-500' : 'bg-primary'}`}
                                >
                                    {isLoading ? (
                                        <ActivityIndicator color={type === 'error' ? '#fff' : '#000'} size="small" />
                                    ) : (
                                        <Text className={`font-spaceGroteskBold uppercase ${type === 'error' ? 'text-white' : 'text-black'}`}>
                                            {confirmText}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <TouchableOpacity
                                onPress={onClose}
                                disabled={isLoading}
                                className={`w-full rounded-xl py-4 items-center border ${type === 'error' ? 'bg-red-500/20 border-red-500/30' :
                                        type === 'success' ? 'bg-primary/20 border-primary/30' :
                                            type === 'warning' ? 'bg-yellow-500/20 border-yellow-500/30' :
                                                'bg-blue-500/20 border-blue-500/30'
                                    }`}
                            >
                                <Text className={`font-spaceGroteskBold uppercase text-[15px] ${type === 'error' ? 'text-red-400' :
                                        type === 'success' ? 'text-primary' :
                                            type === 'warning' ? 'text-yellow-400' :
                                                'text-blue-400'
                                    }`}>
                                    {cancelText}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}
