import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, TouchableOpacityProps, View } from 'react-native';
import { THEME } from '~/src/constants/theme';

export interface ButtonProps extends TouchableOpacityProps {
    variant?: 'primary' | 'outline' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    label: string;
    loading?: boolean;
    leftIcon?: React.ReactNode;
}

/**
 * Componente Atômico de Botão [UI-Kit]
 * Gerencia cores (Primary, Outline) e estados de disabled/loading centralmente.
 */
export const Button: React.FC<ButtonProps> = ({
    variant = 'primary',
    size = 'lg',
    label,
    loading = false,
    leftIcon,
    disabled,
    className = '',
    style,
    ...props
}) => {
    // Variantes Visuais
    const getVariantStyles = () => {
        switch (variant) {
            case 'outline':
                return 'bg-background border border-border';
            case 'ghost':
                return 'bg-transparent';
            case 'danger':
                return 'bg-red-500/10 border border-red-500/20';
            case 'primary':
            default:
                return 'bg-primary';
        }
    };

    // Tamanhos
    const getSizeStyles = () => {
        switch (size) {
            case 'sm':
                return 'h-10 px-4 rounded-lg';
            case 'md':
                return 'h-12 px-5 rounded-xl';
            case 'lg':
            default:
                return 'h-14 w-full rounded-xl';
        }
    };

    // Cor do Texto baseado na Variante
    const getTextStyles = () => {
        switch (variant) {
            case 'outline':
            case 'ghost':
                return 'text-text-light';
            case 'danger':
                return 'text-red-400';
            case 'primary':
            default:
                return 'text-background'; // O primary é amarelo, texto sempre precisa ser contrastante dark
        }
    };

    const isInteractionDisabled = disabled || loading;

    return (
        <TouchableOpacity
            disabled={isInteractionDisabled}
            activeOpacity={0.8}
            className={`
                flex-row items-center justify-center gap-2 
                ${getVariantStyles()} 
                ${getSizeStyles()} 
                ${isInteractionDisabled ? 'opacity-50' : ''} 
                ${className}
            `}
            style={style}
            {...props}
        >
            {loading ? (
                <ActivityIndicator
                    color={variant === 'primary' ? THEME.colors.background : THEME.colors.primary}
                    size="small"
                />
            ) : (
                <>
                    {leftIcon && <View>{leftIcon}</View>}
                    <Text className={`font-spaceGroteskBold text-[15px] uppercase tracking-wider ${getTextStyles()}`}>
                        {label}
                    </Text>
                </>
            )}
        </TouchableOpacity>
    );
};
