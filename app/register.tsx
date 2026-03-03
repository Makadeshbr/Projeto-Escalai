import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { THEME } from '~/src/constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Mail, Lock, Eye, EyeOff, Truck, ArrowRight, Globe, User, Phone } from 'lucide-react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { aether } from '~/src/lib/aether';
import { COLLECTIONS } from '~/src/lib/collections';
import AlertModal from '~/src/components/AlertModal';
import { Input } from '~/src/components/ui/Input';
import { Button } from '~/src/components/ui/Button';
import { validatePassword } from '~/src/lib/passwordValidation';

export default function RegisterScreen() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [plate, setPlate] = useState('');
    const [phone, setPhone] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Validações inline
    const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
    const isValidPassword = (p: string) => validatePassword(p).isValid;
    const isValidPlate = (p: string) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p.replace(/[^A-Z0-9]/gi, '').toUpperCase());
    const isValidPhone = (p: string) => /^\d{10,11}$/.test(p.replace(/\D/g, ''));

    // Máscara de telefone brasileiro (99) 99999-9999
    const formatPhone = (text: string) => {
        const digits = text.replace(/\D/g, '').slice(0, 11);
        if (digits.length <= 2) return digits;
        if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    };

    // Alert Modal State
    const [alertConfig, setAlertConfig] = useState<{
        visible: boolean;
        title: string;
        message: string;
        type: 'success' | 'error' | 'warning' | 'info';
        onConfirm?: () => void;
    }>({
        visible: false,
        title: '',
        message: '',
        type: 'info'
    });

    const showAlert = (
        title: string,
        message: string,
        type: 'success' | 'error' | 'warning' | 'info' = 'info',
        onConfirm?: () => void
    ) => {
        setAlertConfig({ visible: true, title, message, type, onConfirm });
    };

    const hideAlert = () => {
        setAlertConfig(prev => {
            if (prev.onConfirm) prev.onConfirm();
            return { ...prev, visible: false, onConfirm: undefined };
        });
    };

    const handleRegister = async () => {
        if (!name || !email || !password || !plate || !phone) {
            showAlert('Dados Incompletos', 'Por favor, preencha todos os campos (Nome, E-mail, Senha, Telefone e Placa) para se cadastrar.', 'warning');
            return;
        }

        if (!isValidEmail(email)) {
            showAlert('E-mail Inválido', 'O formato do e-mail está incorreto. Verifique e tente novamente.', 'warning');
            return;
        }

        if (!isValidPassword(password)) {
            const result = validatePassword(password);
            showAlert('Senha Fraca', result.message, 'warning');
            return;
        }

        if (!isValidPhone(phone)) {
            showAlert('Telefone Inválido', 'Informe um número de celular válido com DDD. Ex: (11) 99999-9999', 'warning');
            return;
        }

        if (!isValidPlate(plate)) {
            showAlert('Placa Inválida', 'Use o formato Mercosul (ABC1D23) ou antigo (ABC1234), sem traços.', 'warning');
            return;
        }

        setIsLoading(true);
        try {
            // 1. Create the Authentication Profile
            // NOTA: O SDK tenantAuth exige que propriedades customizadas vão dentro de 'metadata'
            const { user, error } = await aether.tenantAuth.signUp({
                email: email.trim().toLowerCase(),
                password: password,
                data: {
                    metadata: {
                        name: name.trim(),
                        role: 'driver',
                        vehiclePlate: plate.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''),
                        phone: phone.replace(/\D/g, '')
                    }
                }
            });

            if (error) {
                // Determine if error is an object with a message or just a string
                const errorMsg = typeof error === 'string' ? error : (error as any).message || 'Unknown registration error';
                throw new Error(errorMsg);
            }

            showAlert('Cadastro Concluído!', 'Sua conta foi criada com sucesso no sistema. Faça login para verificar suas entregas.', 'success', () => {
                if (router.canGoBack()) {
                    router.back();
                } else {
                    router.replace('/login');
                }
            });

        } catch (error: any) {
            console.error("[Register Error]", error);
            let erroTratado = 'Encontramos um problema inesperado ao criar seu perfil.';
            if (error?.message?.includes('already exists') || error?.message?.includes('existente')) {
                erroTratado = 'Este e-mail já está cadastrado no sistema.';
            } else if (error?.message?.includes('password')) {
                erroTratado = 'A senha informada é muito fraca. Tente uma senha mais longa.';
            } else if (error?.message) {
                erroTratado = error.message;
            }

            showAlert('Falha no Cadastro', erroTratado, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-[#1a1a1a]">
            {/* Background Smoky Gradients from the Stitch Design */}
            <LinearGradient
                colors={['rgba(45, 50, 119, 0.3)', 'rgba(45, 50, 119, 0.05)', 'transparent']}
                style={styles.topGradient}
            />
            <View style={styles.blurYellow} />
            <View style={styles.blurBlue} />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                className="flex-1"
            >
                <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

                    {/* Header Logo */}
                    <View className="items-center mb-8 relative z-10">
                        <View style={styles.iconContainer} className="w-24 h-24 rounded-3xl items-center justify-center mb-6 border-4 border-[#1a1a1a]/50">
                            <LinearGradient
                                colors={['#fff159', '#f2d005']}
                                style={StyleSheet.absoluteFillObject}
                                className="rounded-2xl"
                            />
                            <Truck color="#1a1a1a" size={48} strokeWidth={2} />
                        </View>

                        <Text className="text-3xl font-spaceGroteskBold tracking-tight text-white mb-2 text-center">
                            Criar Conta
                        </Text>
                        <Text className="text-slate-400 text-sm text-center font-spaceGrotesk leading-relaxed px-4">
                            Cadastre-se na rede logística e acesse a plataforma de entregas.
                        </Text>
                    </View>

                    {/* Form Fields */}
                    <View className="w-full relative z-10 gap-5">
                        {/* Name Input */}
                        <Input
                            label="Nome Completo"
                            value={name}
                            onChangeText={setName}
                            placeholder="João da Silva"
                            autoCapitalize="words"
                            leftIcon={<User color="#94a3b8" size={22} />}
                        />

                        {/* E-mail Input */}
                        <Input
                            label="E-mail"
                            value={email}
                            onChangeText={setEmail}
                            placeholder="seu@email.com"
                            autoCapitalize="none"
                            keyboardType="email-address"
                            leftIcon={<Mail color="#94a3b8" size={22} />}
                        />

                        {/* Password Input */}
                        <Input
                            label="Senha"
                            value={password}
                            onChangeText={setPassword}
                            placeholder="••••••••"
                            secureTextEntry={!showPassword}
                            leftIcon={<Lock color="#94a3b8" size={22} />}
                            rightIcon={showPassword ? <EyeOff color="#94a3b8" size={22} /> : <Eye color="#94a3b8" size={22} />}
                            onRightIconPress={() => setShowPassword(!showPassword)}
                        />

                        {/* Plate Input */}
                        <View>
                            <View className="flex-row justify-between items-end mb-2 ml-1">
                                <Text className="text-sm font-spaceGroteskBold text-slate-300">
                                    Placa do Veículo
                                </Text>
                                <View className="bg-[#3483fa]/10 px-2 rounded-full border border-[#3483fa]/20 items-center justify-center py-0.5">
                                    <Text className="text-[10px] text-[#3483fa] font-spaceGroteskBold uppercase tracking-wider">
                                        Obrigatório
                                    </Text>
                                </View>
                            </View>

                            <View className="flex-row items-center bg-[#151515] border border-slate-700 rounded-xl overflow-hidden focus-within:border-[#ffe600] p-1 h-[68px]">
                                <View className="h-full w-[60px] bg-[#2d3277] flex items-center justify-center rounded-lg relative overflow-hidden">
                                    <View className="absolute top-0 left-0 w-full h-1/2 bg-white/10" />
                                    <Globe color="#ffffff" size={20} className="mb-1" />
                                    <Text className="text-[9px] font-spaceGroteskBold text-white tracking-wider">BRA</Text>
                                </View>
                                <TextInput
                                    value={plate}
                                    onChangeText={setPlate}
                                    placeholder="ABC1D23"
                                    placeholderTextColor="#334155"
                                    className="flex-1 bg-transparent px-4 text-xl font-mono font-bold tracking-[4px] uppercase text-center text-white"
                                    autoCapitalize="characters"
                                    maxLength={7}
                                />
                            </View>
                            <Text className="text-xs text-slate-500 ml-1 mt-2 font-spaceGrotesk flex-row items-center">
                                Digite a placa sem espaços ou traços.
                            </Text>
                        </View>

                        {/* Phone Input */}
                        <Input
                            label="Celular (WhatsApp)"
                            value={phone}
                            onChangeText={(text) => setPhone(formatPhone(text))}
                            placeholder="(11) 99999-9999"
                            keyboardType="phone-pad"
                            maxLength={15}
                            leftIcon={<Phone color="#94a3b8" size={22} />}
                        />
                    </View>

                    {/* Submit Button */}
                    <View className="mt-8 w-full relative z-10">
                        <Button
                            label={isLoading ? 'CADASTRANDO...' : 'Cadastrar'}
                            onPress={handleRegister}
                            loading={isLoading}
                            className="bg-primary"
                            leftIcon={!isLoading ? undefined : undefined}
                        />

                        <View className="flex-row items-center justify-center gap-2 mt-6 pb-4">
                            <Text className="text-sm text-slate-400 font-spaceGrotesk">
                                Já possui uma conta?
                            </Text>
                            <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/login')}>
                                <Text className="text-sm font-spaceGroteskBold text-[#3483fa] underline">
                                    Fazer Login
                                </Text>
                            </TouchableOpacity>
                        </View>
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
    topGradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: 384,
        zIndex: 0
    },
    blurYellow: {
        position: 'absolute',
        top: 0,
        right: -96,
        width: 320,
        height: 320,
        backgroundColor: 'rgba(255, 230, 0, 0.05)',
        borderRadius: 160,
        shadowColor: 'rgba(255, 230, 0, 0.05)',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 80,
        elevation: 10,
        zIndex: 0
    },
    blurBlue: {
        position: 'absolute',
        top: 160,
        left: -80,
        width: 240,
        height: 240,
        backgroundColor: 'rgba(52, 131, 250, 0.1)',
        borderRadius: 120,
        shadowColor: 'rgba(52, 131, 250, 0.1)',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 60,
        elevation: 10,
        zIndex: 0
    },
    iconContainer: {
        shadowColor: 'rgba(255, 230, 0, 0.4)',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 25,
        elevation: 15,
    }
});
