import React, { Component, ErrorInfo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { THEME } from '~/src/constants/theme';
import { crashReporter } from '~/src/lib/crashReporter';

interface Props {
    children: React.ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * Error Boundary global — captura erros de render em toda a árvore.
 * Exibe tela de fallback com botão "Tentar Novamente".
 * Integrado com CrashReporter para logging persistente.
 */
export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        crashReporter.captureException(error, {
            componentStack: errorInfo.componentStack || undefined,
        });
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <View style={styles.container}>
                    <View style={styles.card}>
                        <Text style={styles.icon}>⚠</Text>
                        <Text style={styles.title}>Algo deu errado</Text>
                        <Text style={styles.message}>
                            O aplicativo encontrou um erro inesperado. Tente novamente ou reinicie o app.
                        </Text>
                        {__DEV__ && this.state.error && (
                            <View style={styles.debugBox}>
                                <Text style={styles.debugText} numberOfLines={4}>
                                    {this.state.error.message}
                                </Text>
                            </View>
                        )}
                        <TouchableOpacity style={styles.retryBtn} onPress={this.handleRetry}>
                            <Text style={styles.retryText}>Tentar Novamente</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            );
        }

        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: THEME.colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    card: {
        backgroundColor: THEME.colors.surface,
        borderRadius: 20,
        padding: 32,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: THEME.colors.border,
        width: '100%',
        maxWidth: 360,
    },
    icon: {
        fontSize: 48,
        marginBottom: 16,
    },
    title: {
        fontSize: 22,
        fontFamily: 'SpaceGrotesk-Bold',
        color: '#ffffff',
        marginBottom: 12,
        textAlign: 'center',
    },
    message: {
        fontSize: 14,
        fontFamily: 'SpaceGrotesk-Regular',
        color: THEME.colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 20,
    },
    debugBox: {
        backgroundColor: THEME.colors.background,
        borderRadius: 8,
        padding: 12,
        width: '100%',
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(248,113,113,0.3)',
    },
    debugText: {
        fontSize: 11,
        fontFamily: 'SpaceGrotesk-Regular',
        color: '#f87171',
    },
    retryBtn: {
        backgroundColor: THEME.colors.primary,
        paddingHorizontal: 32,
        paddingVertical: 14,
        borderRadius: 12,
        width: '100%',
        alignItems: 'center',
    },
    retryText: {
        fontSize: 15,
        fontFamily: 'SpaceGrotesk-Bold',
        color: THEME.colors.background,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
});
