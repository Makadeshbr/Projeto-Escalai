import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { CheckCircle2, AlertTriangle, AlertCircle, X } from 'lucide-react-native';
import { THEME } from '~/src/constants/theme';

interface AlertModalProps {
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    onClose: () => void;
}

export default function AlertModal({ visible, title, message, type, onClose }: AlertModalProps) {
    if (!visible) return null;

    const getIcon = () => {
        switch (type) {
            case 'success': return <CheckCircle2 color="#4ade80" size={32} />;
            case 'error': return <AlertTriangle color="#ef4444" size={32} />;
            case 'warning': return <AlertTriangle color="#eab308" size={32} />;
            case 'info': default: return <AlertCircle color="#3b82f6" size={32} />;
        }
    };

    const getBorderColor = () => {
        switch (type) {
            case 'success': return '#166534';
            case 'error': return '#7f1d1d';
            case 'warning': return '#854d0e';
            case 'info': default: return '#1e3a8a';
        }
    };

    return (
        <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
            <View className="flex-1 bg-black/80 items-center justify-center px-6">
                <View
                    style={[styles.container, { borderColor: getBorderColor() }]}
                    className="w-full bg-surface rounded-3xl overflow-hidden relative"
                >
                    {/* Header bg strip indicating severity */}
                    <View style={{ height: 6, backgroundColor: type === 'success' ? '#4ade80' : type === 'error' ? '#ef4444' : type === 'warning' ? '#eab308' : '#3b82f6' }} />

                    <View className="p-6 items-center">
                        <View className="bg-background rounded-full p-4 mb-4 border border-border">
                            {getIcon()}
                        </View>

                        <Text className="text-white text-xl font-spaceGroteskBold mb-3 text-center">
                            {title}
                        </Text>

                        <Text className="text-[#94a3b8] text-sm font-spaceGrotesk text-center leading-relaxed mb-6">
                            {message}
                        </Text>

                        <TouchableOpacity
                            onPress={onClose}
                            className="w-full bg-[#333b52] border border-text-dark h-[52px] rounded-xl items-center justify-center flex-row gap-2"
                        >
                            <Text className="text-white font-spaceGroteskBold text-base">Entendido</Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        onPress={onClose}
                        className="absolute top-5 right-5 w-8 h-8 bg-background rounded-full items-center justify-center border border-border"
                    >
                        <X color="#94a3b8" size={16} />
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    }
});
