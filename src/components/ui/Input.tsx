import React, { forwardRef, useState } from 'react';
import { View, TextInput, Text, TouchableOpacity, TextInputProps, StyleSheet } from 'react-native';
import { THEME } from '~/src/constants/theme';

export interface InputProps extends TextInputProps {
    label?: string;
    error?: string;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    onRightIconPress?: () => void;
    containerClassName?: string;
}

/**
 * Componente Atômico de Input [UI-Kit]
 * Centraliza foco, borda amarela de active, paddings internos e posicionamento de ícones.
 */
export const Input = forwardRef<TextInput, InputProps>(
    ({ label, error, leftIcon, rightIcon, onRightIconPress, containerClassName = '', className = '', ...props }, ref) => {
        const [isFocused, setIsFocused] = useState(false);

        return (
            <View className={`mb-4 w-full ${containerClassName}`}>
                {label && (
                    <Text className="text-[13px] font-spaceGroteskBold text-text-light mb-2 ml-1">
                        {label}
                    </Text>
                )}
                <View className="relative justify-center w-full">
                    {/* Icone Esquerdo */}
                    {leftIcon && (
                        <View className="absolute left-4 z-10 opacity-70">
                            {leftIcon}
                        </View>
                    )}

                    <TextInput
                        ref={ref}
                        onFocus={(e) => {
                            setIsFocused(true);
                            props.onFocus?.(e);
                        }}
                        onBlur={(e) => {
                            setIsFocused(false);
                            props.onBlur?.(e);
                        }}
                        placeholderTextColor={THEME.colors.textMuted}
                        className={`
                            w-full bg-surface rounded-xl py-4 text-white font-spaceGrotesk text-[15px] border transition-colors
                            ${leftIcon ? 'pl-12' : 'pl-4'}
                            ${rightIcon ? 'pr-12' : 'pr-4'}
                            ${isFocused ? 'border-primary' : error ? 'border-danger' : 'border-border'}
                            ${className}
                        `}
                        {...props}
                    />

                    {/* Icone Direito (Ex: Reveal Password) */}
                    {rightIcon && (
                        <TouchableOpacity
                            onPress={onRightIconPress}
                            className={`absolute right-4 ${!onRightIconPress ? 'opacity-50' : ''}`}
                            disabled={!onRightIconPress}
                        >
                            {rightIcon}
                        </TouchableOpacity>
                    )}
                </View>
                {/* Error Message */}
                {error && (
                    <Text className="text-danger text-xs font-spaceGrotesk mt-1.5 ml-1">
                        {error}
                    </Text>
                )}
            </View>
        );
    }
);

Input.displayName = 'Input';
