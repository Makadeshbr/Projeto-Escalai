import React from 'react';
import { TouchableOpacity, Platform } from 'react-native';
import { THEME } from '~/src/constants/theme';
import { Plus } from 'lucide-react-native';

interface FloatingActionButtonProps {
    onPress: () => void;
    icon?: React.ReactNode;
}

export function FloatingActionButton({ onPress, icon }: FloatingActionButtonProps) {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.8}
            className="absolute right-6 bottom-24 w-14 h-14 rounded-full bg-primary items-center justify-center z-50 shadow-lg"
            style={{
                ...Platform.select({
                    ios: {
                        shadowColor: THEME.colors.primary,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.3,
                        shadowRadius: 8,
                    },
                    android: {
                        elevation: 8,
                    }
                })
            }}
        >
            {icon || <Plus color="#000" size={28} strokeWidth={2.5} />}
        </TouchableOpacity>
    );
}
