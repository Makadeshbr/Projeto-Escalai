import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Lock, Eye, EyeOff, LogIn, Fingerprint } from 'lucide-react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore, AuthUser } from '~/src/store/auth';
import AlertModal from '~/src/components/AlertModal';
import { aether } from '~/src/lib/aether';
import { Input } from '~/src/components/ui/Input';
import { Button } from '~/src/components/ui/Button';

export default function LoginScreen() {
    const [driverId, setDriverId] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Alert Modal State
    const [alertConfig, setAlertConfig] = useState<{
        visible: boolean;
        title: string;
        message: string;
        type: 'success' | 'error' | 'warning' | 'info';
    }>({
        visible: false,
        title: '',
        message: '',
        type: 'info'
    });

    const showAlert = (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
        setAlertConfig({ visible: true, title, message, type });
    };

    const hideAlert = () => setAlertConfig(prev => ({ ...prev, visible: false }));

    const { login } = useAuthStore();

    const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

    const handleLogin = async () => {
        if (!driverId || !password) {
            showAlert('Dados Incompletos', 'Por favor, preencha seu e-mail e senha para acessar o portal.', 'warning');
            return;
        }

        if (!isValidEmail(driverId)) {
            showAlert('E-mail Inválido', 'O formato do e-mail está incorreto. Verifique e tente novamente.', 'warning');
            return;
        }

        setIsLoading(true);
        try {
            await aether.tenantAuth.signIn({ email: driverId.trim(), password });
            const authUser = aether.tenantAuth.getUser();

            if (!authUser) {
                setAlertConfig({ visible: true, title: 'Erro', message: 'Não foi possível recuperar dados do usuário após login.', type: 'error' });
                return;
            }

            // Assume 'driver' as default or explicitly defines 'admin' if role metadata exists
            /**
             * [AUDIT FIX — SEC-004] Determina role a partir dos metadata do backend.
             * IMPORTANTE: Esta verificação é complementar. O backend DEVE reforçar
             * autorização via RLS/middleware independentemente do client.
             */
            const role = authUser?.metadata?.role === 'admin' ? 'admin' : 'driver';

            /** Converte resposta do Aether para nosso tipo tipado AuthUser */
            const typedUser: AuthUser = {
                id: authUser.id || '',
                email: authUser.email || '',
                name: authUser.name || null,
                metadata: (authUser.metadata as Record<string, unknown>) || {},
            };

            login(typedUser, role);

            if (role === 'admin') {
                router.replace('/admin/dashboard');
            } else {
                router.replace('/driver/dashboard');
            }
        } catch (error: any) {
            console.error("[Login Error]", error);

            // Tratamento de mensagens comuns do servidor/auth
            let erroTratado = 'Erro ao conectar com o servidor. Tente novamente mais tarde.';
            if (error?.message?.includes('invalid credentials') || error?.message?.includes('inválido')) {
                erroTratado = 'Credenciais inválidas. Verifique seu e-mail e senha.';
            } else if (error?.message) {
                erroTratado = error.message;
            }

            showAlert('Falha na Autenticação', erroTratado, 'error');
        } finally {
            setIsLoading(false);
        }
    };


    return (
        <SafeAreaView className="flex-1 bg-background">
            {/* Background Smoky Gradient */}
            <LinearGradient
                colors={['#1a1d2e', '#13151f', '#0f1118']}
                style={StyleSheet.absoluteFillObject}
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                className="flex-1"
            >
                <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

                    {/* Header Logo & Title */}
                    <View className="items-center mb-10 pt-10">
                        {/* Logo Container with thick border and glow */}
                        <View style={styles.logoOuterGlow}>
                            <View style={[styles.logoBorder, { padding: 4, backgroundColor: 'transparent' }]}>
                                <Image
                                    source={require('~/assets/icon.png')}
                                    style={{ width: 80, height: 80, borderRadius: 20 }}
                                    resizeMode="contain"
                                />
                            </View>
                        </View>

                        <Text className="text-[28px] font-spaceGroteskBold tracking-tight text-white mb-2">
                            Bem-vindo ao Escalai
                        </Text>
                        <Text className="text-[11px] font-spaceGrotesk text-text-muted uppercase tracking-[0.2em]">
                            ACESSO AO PORTAL
                        </Text>
                    </View>

                    {/* Inputs */}
                    <View className="w-full mb-6 relative z-10">
                        {/* User / Email Input */}
                        <Input
                            label="E-mail de Acesso"
                            value={driverId}
                            onChangeText={setDriverId}
                            placeholder="seu@email.com"
                            autoCapitalize="none"
                            leftIcon={<User color="#94a3b8" size={20} />}
                        />

                        {/* Password Input */}
                        <View className="mb-2">
                            <Input
                                label="Senha"
                                value={password}
                                onChangeText={setPassword}
                                placeholder="••••••••"
                                secureTextEntry={!showPassword}
                                leftIcon={<Lock color="#94a3b8" size={20} />}
                                rightIcon={showPassword ? <EyeOff color="#94a3b8" size={22} /> : <Eye color="#94a3b8" size={22} />}
                                onRightIconPress={() => setShowPassword(!showPassword)}
                                containerClassName="mb-1"
                            />

                            {/* Recuperação de senha — funcionalidade pendente de implementação */}
                            <View className="flex-row justify-end mt-3">
                                <TouchableOpacity disabled onPress={() => { }} style={{ opacity: 0.4 }}>
                                    <Text className="text-[13px] font-spaceGrotesk text-[#94a3b8]">
                                        Esqueci minha senha (em breve)
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    {/* Biometria — funcionalidade pendente de implementação com expo-local-authentication */}
                    <TouchableOpacity disabled className="flex-row items-center justify-center gap-2 mb-8 py-2 relative z-10" style={{ opacity: 0.35 }}>
                        <Fingerprint color="#475569" size={24} />
                        <Text className="text-[13px] font-spaceGrotesk text-text-muted">
                            Biometria (em breve)
                        </Text>
                    </TouchableOpacity>

                    {/* Action Buttons */}
                    <View className="gap-4 w-full relative z-10">
                        <Button
                            label={isLoading ? 'ENTRANDO...' : 'ENTRAR'}
                            onPress={handleLogin}
                            loading={isLoading}
                            className="bg-secondary"
                            leftIcon={!isLoading ? <LogIn color="#ffffff" size={18} /> : undefined}
                            style={{
                                shadowColor: '#1e1e32',
                                shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.5,
                                shadowRadius: 8,
                                elevation: 5
                            }}
                        />

                        <Button
                            label="Criar conta"
                            onPress={() => router.push('/register')}
                            variant="outline"
                        />
                    </View>

                    {/* Support Footer */}
                    <View className="items-center mt-10 relative z-10 pb-4">
                        <Text className="text-[13px] text-text-dark font-spaceGrotesk mb-4">
                            Precisa de ajuda?{' '}
                            <Text className="font-spaceGroteskBold text-[#ffe600] underline" style={{ textDecorationColor: '#ffe600' }}>
                                Suporte
                            </Text>
                        </Text>
                        <Text className="text-[10px] text-slate-600 font-spaceGrotesk tracking-[0.15em] uppercase opacity-60">
                            Feito pela plataforma Aether • v1.1
                        </Text>
                    </View>

                </ScrollView>
            </KeyboardAvoidingView>

            {/* Custom Alert Modal */}
            <AlertModal
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onClose={hideAlert}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    logoOuterGlow: {
        marginBottom: 32,
        shadowColor: 'rgba(255, 230, 0, 0.4)',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 30,
        elevation: 15,
        backgroundColor: '#1b1d29',
        borderRadius: 28,
    },
    logoBorder: {
        width: 104,
        height: 104,
        borderRadius: 28,
        borderWidth: 3.5,
        borderColor: '#ffe600',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1f2230',
    }
});
