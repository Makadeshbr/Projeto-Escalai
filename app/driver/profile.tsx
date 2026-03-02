import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, Image, StyleSheet, ActivityIndicator, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Settings, Camera, Star, Mail, CarFront, Bell, LogOut, Pencil, Check, Lock } from 'lucide-react-native';
import { router } from 'expo-router';
import { useAuthStore } from '~/src/store/auth';
import * as ImagePicker from 'expo-image-picker';
import { aether, aetherConfig } from '~/src/lib/aether';
import { getAetherClient } from '@aether-baas/react-native';
import DriverBottomNav from '~/src/components/DriverBottomNav';
import { ensureDriverPushToken, isExpoGo } from '~/src/lib/push';
import { COLLECTIONS } from '~/src/lib/collections';
import { THEME } from '~/src/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { EnterpriseModal } from '~/src/components/EnterpriseModal';
import { validatePassword } from '~/src/lib/passwordValidation';

export default function DriverProfileScreen() {
    const { user, logout, login } = useAuthStore();
    // Parse metadata
    const meta: Record<string, any> = user?.metadata || {};
    const defaultAvatar = 'https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=256&auto=format&fit=crop';

    // States
    const [avatarUrl, setAvatarUrl] = useState(meta.avatarUrl || defaultAvatar);
    const [notificationsEnabled, setNotificationsEnabled] = useState(!!meta.pushEnabled);
    const [isUpdatingOption, setIsUpdatingOption] = useState(false);

    const [actionModal, setActionModal] = useState({
        visible: false,
        title: '',
        message: '',
        type: 'info' as 'info' | 'error' | 'success' | 'warning',
    });

    // Estados de edição de perfil
    const [isEditingName, setIsEditingName] = useState(false);
    const [editName, setEditName] = useState(String(meta.name || user?.email?.split('@')[0] || ''));
    const [isEditingPlate, setIsEditingPlate] = useState(false);
    const [editPlate, setEditPlate] = useState(String(meta.vehiclePlate || ''));
    const [isSavingProfile, setIsSavingProfile] = useState(false);

    // Estados do modal de senha
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ current: '', newPass: '', confirm: '' });
    const [isChangingPassword, setIsChangingPassword] = useState(false);

    const showModal = (title: string, message: string, type: 'info' | 'error' | 'success' | 'warning' = 'info') => {
        setActionModal({ visible: true, title, message, type });
    };
    const handleLogout = async () => {
        try {
            await aether.tenantAuth.signOut();
        } catch (e) { }
        logout();
        router.replace('/login');
    };

    /**
     * Salva alteração de nome ou placa no perfil do usuário.
     * Sincroniza com DRIVER_STATUS para manter consistência.
     * @param field - Campo a salvar: 'name' ou 'vehiclePlate'
     * @param value - Novo valor do campo
     */
    const saveProfileField = async (field: 'name' | 'vehiclePlate', value: string) => {
        if (!user?.id || !value.trim()) return;
        setIsSavingProfile(true);
        try {
            const updatedMeta = { ...meta, [field]: value.trim() };
            const updatedUser = await aether.tenantAuth.updateProfile({ metadata: updatedMeta });
            if (updatedUser) login(updatedUser as any, meta.role as 'driver' | 'admin');

            // Sincroniza com DRIVER_STATUS
            const statusRecords = await aether.db.collection(COLLECTIONS.DRIVER_STATUS)
                .query().eq('user_id', user.id).get();
            if (statusRecords && (statusRecords as any[]).length > 0) {
                const updatePayload: Record<string, string> = { updatedAt: new Date().toISOString() };
                if (field === 'name') updatePayload.driverName = value.trim();
                if (field === 'vehiclePlate') updatePayload.driverPlate = value.trim();
                await aether.db.collection(COLLECTIONS.DRIVER_STATUS).update(
                    (statusRecords[0] as any).id, updatePayload
                );
            }

            showModal('Atualizado', `${field === 'name' ? 'Nome' : 'Placa'} atualizado com sucesso.`, 'success');
        } catch (error) {
            showModal('Erro', 'Falha ao salvar. Verifique sua conexão e tente novamente.', 'error');
        } finally {
            setIsSavingProfile(false);
            if (field === 'name') setIsEditingName(false);
            if (field === 'vehiclePlate') setIsEditingPlate(false);
        }
    };

    /**
     * Altera a senha do usuário após validação.
     * Verifica se as senhas coincidem e têm tamanho mínimo.
     */
    const handleChangePassword = async () => {
        const { current, newPass, confirm } = passwordForm;
        if (!current || !newPass || !confirm) {
            showModal('Atenção', 'Preencha todos os campos.', 'warning');
            return;
        }
        const passResult = validatePassword(newPass);
        if (!passResult.isValid) {
            showModal('Senha Fraca', passResult.message, 'warning');
            return;
        }
        if (newPass !== confirm) {
            showModal('Atenção', 'As senhas não coincidem.', 'warning');
            return;
        }
        setIsChangingPassword(true);
        try {
            // Chamada REST direta ao endpoint /change-password do backend Aether
            const client = getAetherClient();
            const token = typeof client.getToken === 'function' ? client.getToken() : null;
            if (!token) {
                showModal('Erro', 'Sessão expirada. Faça login novamente.', 'error');
                return;
            }

            const projectId = aetherConfig.apiKey;
            const url = `${aetherConfig.baseUrl}/v1/projects/${projectId}/tenant-auth/change-password`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-Project-ID': projectId,
                },
                body: JSON.stringify({
                    currentPassword: current,
                    newPassword: newPass,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                // Tratamento específico por código de erro do backend
                const code = data?.code || '';
                if (code === 'INVALID_CURRENT_PASSWORD') {
                    showModal('Erro', 'Senha atual incorreta.', 'error');
                } else if (code === 'SAME_PASSWORD') {
                    showModal('Atenção', 'A nova senha deve ser diferente da atual.', 'warning');
                } else {
                    showModal('Erro', data?.error || 'Falha ao alterar senha.', 'error');
                }
                return;
            }

            showModal('Sucesso', 'Senha alterada com sucesso!', 'success');
            setShowPasswordModal(false);
            setPasswordForm({ current: '', newPass: '', confirm: '' });
        } catch (error: any) {
            console.error('[Profile] Erro ao alterar senha:', error);
            showModal('Erro', 'Falha na comunicação com o servidor. Verifique sua conexão.', 'error');
        } finally {
            setIsChangingPassword(false);
        }
    };

    const handlePickImage = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8, // Podemos usar melhor qualidade agora!
                // base64: true (não precisamos mais)
            });

            if (!result.canceled && result.assets[0].uri) {
                setIsUpdatingOption(true);
                const uri = result.assets[0].uri;

                // 1. Converter a Imagem Local (URI) em Blob para envio
                const response = await fetch(uri);
                const blob = await response.blob();

                // 2. Upload Organizado no Aether Storage
                const uploadResult = await aether.storage.upload(blob, {
                    folder: `avatars_motoristas/${user?.id || 'anonimo'}`,
                    fileName: `foto_perfil_${Date.now()}.jpg`,
                    contentType: 'image/jpeg',
                });

                if (uploadResult.success) {
                    // 3. Pegar a URL real gerada pelo Storage
                    const novaAvatarUrl = uploadResult.data.downloadUrl || uploadResult.data.url;
                    setAvatarUrl(novaAvatarUrl as string);

                    // 4. Salvar essa URL bonitinha nos metadados da conta
                    const updatedUser = await aether.tenantAuth.updateProfile({
                        metadata: { ...meta, avatarUrl: novaAvatarUrl }
                    });

                    // 5. Sincronizar avatarUrl no driver_status para visibilidade do admin
                    if (user?.id) {
                        try {
                            const statusRecords = await aether.db.collection(COLLECTIONS.DRIVER_STATUS)
                                .query().eq('user_id', user.id).get();
                            if (statusRecords && (statusRecords as any[]).length > 0) {
                                await aether.db.collection(COLLECTIONS.DRIVER_STATUS).update(
                                    (statusRecords[0] as any).id,
                                    { avatarUrl: novaAvatarUrl }
                                );
                            }
                        } catch (syncErr) {
                            console.warn('[Profile] Erro ao sincronizar avatar com driver_status:', syncErr);
                        }
                    }

                    // 6. Atualizar estado local
                    if (updatedUser) login(updatedUser as any, meta.role as 'driver' | 'admin');
                    showModal('Sucesso', 'Sua foto de perfil foi atualizada com sucesso!', 'success');
                } else {
                    showModal('Erro no Upload', uploadResult.error || 'Erro desconhecido', 'error');
                }
            }
        } catch (error: any) {
            console.error('Error de upload de foto:', error);
            showModal('Falha Interna', 'Não foi possível carregar sua foto. Tente novamente.', 'error');
        } finally {
            setIsUpdatingOption(false);
        }
    };

    const handleToggleNotifications = async (val: boolean) => {
        setNotificationsEnabled(val);
        setIsUpdatingOption(true);

        try {
            if (val) {
                // Toggle ON: usa função centralizada que obtém token + sincroniza com DRIVER_STATUS
                if (!user?.id) {
                    showModal('Erro', 'Usuário não autenticado.', 'error');
                    setNotificationsEnabled(false);
                    setIsUpdatingOption(false);
                    return;
                }

                const token = await ensureDriverPushToken(
                    user.id,
                    user.metadata?.name || user.name || user.email?.split('@')[0] || 'Motorista',
                    user.metadata?.vehiclePlate || 'S/Placa',
                    user.metadata?.avatarUrl || ''
                );

                if (!token) {
                    if (isExpoGo) {
                        showModal('Modo Desenvolvimento', 'Push notifications estão indisponíveis no Expo Go. Na build de produção (APK/IPA), funcionarão normalmente.', 'info');
                    } else {
                        showModal('Permissão Negada', 'Ative as notificações nas configurações do seu celular para receber alertas de rotas.', 'warning');
                    }
                    setNotificationsEnabled(false);
                    setIsUpdatingOption(false);
                    return;
                }

                // Atualiza metadata do usuário auth com a flag de push habilitado
                const updatedUser = await aether.tenantAuth.updateProfile({
                    metadata: { ...meta, pushEnabled: true, expoPushToken: token }
                });
                if (updatedUser) login(updatedUser as any, meta.role as 'driver' | 'admin');

            } else {
                // Toggle OFF: limpa o token do auth e do DRIVER_STATUS
                const updatedUser = await aether.tenantAuth.updateProfile({
                    metadata: { ...meta, pushEnabled: false, expoPushToken: null }
                });

                // Remove token do DRIVER_STATUS para parar de receber pushes
                if (user?.id) {
                    try {
                        const statusRecords = await aether.db.collection(COLLECTIONS.DRIVER_STATUS)
                            .query()
                            .eq('user_id', user.id)
                            .get();

                        if (statusRecords && (statusRecords as any[]).length > 0) {
                            await aether.db.collection(COLLECTIONS.DRIVER_STATUS).update(
                                (statusRecords[0] as any).id,
                                { expoPushToken: '', updatedAt: new Date().toISOString() }
                            );
                        }
                    } catch (syncErr) {
                        console.error('[Profile] Erro ao limpar token do DRIVER_STATUS:', syncErr);
                    }
                }

                if (updatedUser) login(updatedUser as any, meta.role as 'driver' | 'admin');
            }
        } catch (error) {
            const reason = isExpoGo
                ? 'Push indisponível no Expo Go (modo dev). Na build de produção, funcionará normalmente.'
                : 'Falha ao salvar preferências de notificação. Verifique sua conexão e tente novamente.';
            showModal('Erro', reason, 'error');
            setNotificationsEnabled(!val);
        } finally {
            setIsUpdatingOption(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <LinearGradient colors={['#1a1d2e', THEME.colors.background, THEME.colors.headerBackground]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />

            {/* Header */}
            <View className="flex-row items-center justify-between px-4 py-4 z-10">
                <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/driver/dashboard')} className="w-10 h-10 items-center justify-center rounded-full bg-surface border border-border">
                    <ArrowLeft color="#fff" size={20} />
                </TouchableOpacity>
                <Text className="text-lg font-spaceGroteskBold text-white uppercase tracking-widest">
                    Meu Perfil
                </Text>
                <TouchableOpacity className="w-10 h-10 items-center justify-center rounded-full bg-surface border border-border">
                    <Settings color="#fff" size={20} />
                </TouchableOpacity>
            </View>

            <ScrollView className="flex-1 px-5 pt-8 z-10" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
                {/* Avatar Section */}
                <View className="items-center mb-10">
                    <View className="relative">
                        <View style={styles.avatarGlow} />
                        <View className="w-32 h-32 rounded-full border-[3px] border-primary overflow-hidden bg-background z-10">
                            <Image
                                source={{ uri: String(avatarUrl) }}
                                className="w-full h-full"
                                resizeMode="cover"
                            />
                        </View>
                        {/* Camera Badge */}
                        <TouchableOpacity
                            onPress={handlePickImage}
                            disabled={isUpdatingOption}
                            className="absolute bottom-0 right-0 w-10 h-10 bg-surface rounded-full border-2 border-[#13151f] items-center justify-center z-20 shadow-md"
                        >
                            <Camera color={THEME.colors.primary} size={18} />
                        </TouchableOpacity>
                    </View>

                    <Text className="text-[26px] font-spaceGroteskBold text-white mt-5 tracking-tight shadow-sm">
                        {String(meta.name || user?.email?.split('@')[0] || 'Motorista MvP')}
                    </Text>

                    <View className="flex-row items-center justify-center mt-3 gap-3">
                        <View className="bg-primary/10 px-4 py-1.5 rounded-full border border-primary/20">
                            <Text className="text-[10px] text-primary font-spaceGroteskBold uppercase tracking-widest">
                                Parceiro Homologado
                            </Text>
                        </View>
                        <View className="flex-row items-center gap-1 bg-background px-3 py-1.5 rounded-full border border-border">
                            <Star color={THEME.colors.primary} size={14} fill={THEME.colors.primary} />
                            <Text className="text-white font-spaceGroteskBold text-[13px]">5.0</Text>
                        </View>
                    </View>
                </View>

                {/* NOME Section (editável) */}
                <View className="mb-6">
                    <Text className="text-[11px] font-spaceGroteskBold text-[#94a3b8] uppercase tracking-widest mx-1 mb-2">
                        Nome
                    </Text>
                    <View className="bg-surface rounded-2xl p-4 flex-row items-center justify-between h-[68px] border border-border">
                        <View className="flex-row items-center flex-1">
                            <View className="w-10 h-10 rounded-full bg-background items-center justify-center mr-3 border border-border">
                                <Mail color={THEME.colors.primary} size={18} />
                            </View>
                            {isEditingName ? (
                                <TextInput
                                    value={editName}
                                    onChangeText={setEditName}
                                    autoFocus
                                    className="text-white font-spaceGrotesk text-[15px] flex-1 bg-background rounded-lg px-3 py-2 border border-primary/30"
                                    placeholderTextColor={THEME.colors.textMuted}
                                />
                            ) : (
                                <Text className="text-white font-spaceGrotesk text-[15px]">
                                    {String(meta.name || user?.email?.split('@')[0] || 'Motorista')}
                                </Text>
                            )}
                        </View>
                        <TouchableOpacity
                            onPress={() => {
                                if (isEditingName) {
                                    saveProfileField('name', editName);
                                } else {
                                    setIsEditingName(true);
                                }
                            }}
                            disabled={isSavingProfile}
                            className="w-9 h-9 rounded-full bg-background items-center justify-center border border-border ml-2"
                        >
                            {isSavingProfile && isEditingName ? (
                                <ActivityIndicator size="small" color={THEME.colors.primary} />
                            ) : isEditingName ? (
                                <Check color="#4ade80" size={16} />
                            ) : (
                                <Pencil color="#94a3b8" size={14} />
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                {/* E-MAIL Section (somente leitura) */}
                <View className="mb-6">
                    <Text className="text-[11px] font-spaceGroteskBold text-[#94a3b8] uppercase tracking-widest mx-1 mb-2">
                        E-mail
                    </Text>
                    <View className="bg-surface rounded-2xl p-4 flex-row items-center h-[68px] border border-border">
                        <View className="w-10 h-10 rounded-full bg-background items-center justify-center mr-3 border border-border">
                            <Mail color={THEME.colors.primary} size={18} />
                        </View>
                        <Text className="text-white font-spaceGrotesk text-[15px]">{user?.email || 'Nenhum e-mail.'}</Text>
                    </View>
                </View>

                {/* PLACA DO VEÍCULO Section (editável) */}
                <View className="mb-6">
                    <Text className="text-[11px] font-spaceGroteskBold text-[#94a3b8] uppercase tracking-widest mx-1 mb-2">
                        Placa do Veículo
                    </Text>
                    <View className="bg-surface rounded-2xl p-4 flex-row items-center justify-between h-[68px] border border-border">
                        <View className="flex-row items-center flex-1">
                            <View className="w-10 h-10 rounded-full bg-background items-center justify-center mr-3 border border-border">
                                <CarFront color="#4ade80" size={18} />
                            </View>
                            {isEditingPlate ? (
                                <TextInput
                                    value={editPlate}
                                    onChangeText={(t) => setEditPlate(t.toUpperCase())}
                                    autoFocus
                                    autoCapitalize="characters"
                                    maxLength={7}
                                    className="text-white font-spaceGroteskBold tracking-[1.5px] text-[16px] flex-1 bg-background rounded-lg px-3 py-2 border border-primary/30"
                                />
                            ) : (
                                <Text className="text-white font-spaceGroteskBold tracking-[1.5px] text-[16px]">
                                    {String(meta.vehiclePlate || 'NÃO APTO.')}
                                </Text>
                            )}
                        </View>
                        <View className="flex-row items-center gap-2">
                            {!isEditingPlate && (
                                <View className="bg-green-500/10 border border-green-500/20 px-2.5 py-1.5 rounded flex-row items-center gap-2">
                                    <View className="w-1.5 h-1.5 bg-[#4ade80] rounded-full" />
                                    <Text className="text-[#4ade80] text-[10px] font-spaceGroteskBold uppercase tracking-widest">Ativo</Text>
                                </View>
                            )}
                            <TouchableOpacity
                                onPress={() => {
                                    if (isEditingPlate) {
                                        saveProfileField('vehiclePlate', editPlate);
                                    } else {
                                        setIsEditingPlate(true);
                                    }
                                }}
                                disabled={isSavingProfile}
                                className="w-9 h-9 rounded-full bg-background items-center justify-center border border-border"
                            >
                                {isSavingProfile && isEditingPlate ? (
                                    <ActivityIndicator size="small" color={THEME.colors.primary} />
                                ) : isEditingPlate ? (
                                    <Check color="#4ade80" size={16} />
                                ) : (
                                    <Pencil color="#94a3b8" size={14} />
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                {/* Alterar Senha */}
                <View className="mb-8">
                    <TouchableOpacity
                        onPress={() => setShowPasswordModal(true)}
                        className="bg-surface rounded-2xl p-4 flex-row items-center justify-between h-[68px] border border-border"
                    >
                        <View className="flex-row items-center">
                            <View className="w-10 h-10 rounded-full bg-background items-center justify-center mr-3 border border-border">
                                <Lock color="#f59e0b" size={18} />
                            </View>
                            <View>
                                <Text className="text-white font-spaceGroteskBold text-[15px]">Alterar Senha</Text>
                                <Text className="text-[#94a3b8] font-spaceGrotesk text-[11px]">Atualize sua senha de acesso</Text>
                            </View>
                        </View>
                        <ArrowLeft color="#94a3b8" size={16} style={{ transform: [{ rotate: '180deg' }] }} />
                    </TouchableOpacity>
                </View>

                {/* Configurações Separator */}
                <View className="flex-row items-center justify-center mb-6 mt-2">
                    <View className="flex-1 h-[1px] bg-[#2d3345]" />
                    <Text className="text-[11px] font-spaceGroteskBold text-text-muted uppercase tracking-[0.2em] mx-6">
                        Configurações
                    </Text>
                    <View className="flex-1 h-[1px] bg-[#2d3345]" />
                </View>

                {/* Configurações Section */}
                <View className="mb-10">
                    <View className="bg-surface rounded-2xl p-4 flex-row items-center justify-between h-[76px] border border-border">
                        <View className="flex-row items-center flex-1">
                            <View className="w-12 h-12 bg-background rounded-xl items-center justify-center mr-4 border border-border">
                                <Bell color={THEME.colors.primary} size={20} fill={THEME.colors.primary} />
                            </View>
                            <View>
                                <Text className="text-white font-spaceGroteskBold text-[15px] mb-0.5">Notificações</Text>
                                <Text className="text-[#94a3b8] font-spaceGrotesk text-[12px]">Alertas de rota e sistema</Text>
                            </View>
                        </View>
                        <Switch
                            trackColor={{ false: THEME.colors.background, true: '#4ade80' }}
                            thumbColor={notificationsEnabled ? '#fff' : '#94a3b8'}
                            onValueChange={handleToggleNotifications}
                            value={notificationsEnabled}
                            disabled={isUpdatingOption}
                            style={{ transform: [{ scale: 0.9 }] }}
                        />
                    </View>
                </View>

                {/* Logout Button */}
                <TouchableOpacity
                    onPress={handleLogout}
                    className="w-full bg-surface border border-red-900/50 rounded-2xl h-[68px] flex-row justify-center items-center gap-3 mb-12"
                >
                    <LogOut color="#ef4444" size={20} />
                    <Text className="text-[#ef4444] font-spaceGrotesk text-base tracking-wider">
                        Sair da Conta
                    </Text>
                </TouchableOpacity>

            </ScrollView>

            <EnterpriseModal
                visible={actionModal.visible}
                title={actionModal.title}
                description={actionModal.message}
                type={actionModal.type}
                cancelText="Entendi"
                onClose={() => setActionModal(prev => ({ ...prev, visible: false }))}
            />

            {/* Modal de Alterar Senha */}
            <EnterpriseModal
                visible={showPasswordModal}
                title="Alterar Senha"
                type="form"
                onClose={() => { setShowPasswordModal(false); setPasswordForm({ current: '', newPass: '', confirm: '' }); }}
                onConfirm={handleChangePassword}
                confirmText="Salvar Nova Senha"
                isLoading={isChangingPassword}
            >
                <View className="gap-4">
                    <View>
                        <Text className="text-[#94a3b8] font-spaceGrotesk text-xs uppercase tracking-widest mb-2 ml-1">Senha Atual</Text>
                        <TextInput
                            value={passwordForm.current}
                            onChangeText={(t) => setPasswordForm(prev => ({ ...prev, current: t }))}
                            secureTextEntry
                            placeholder="Digite a senha atual"
                            placeholderTextColor={THEME.colors.textMuted}
                            className="bg-background border border-border rounded-xl px-4 h-14 text-white font-spaceGrotesk text-base"
                        />
                    </View>
                    <View>
                        <Text className="text-[#94a3b8] font-spaceGrotesk text-xs uppercase tracking-widest mb-2 ml-1">Nova Senha</Text>
                        <TextInput
                            value={passwordForm.newPass}
                            onChangeText={(t) => setPasswordForm(prev => ({ ...prev, newPass: t }))}
                            secureTextEntry
                            placeholder="Mín. 8 chars, maiúscula + número"
                            placeholderTextColor={THEME.colors.textMuted}
                            className="bg-background border border-border rounded-xl px-4 h-14 text-white font-spaceGrotesk text-base"
                        />
                    </View>
                    <View>
                        <Text className="text-[#94a3b8] font-spaceGrotesk text-xs uppercase tracking-widest mb-2 ml-1">Confirmar Nova Senha</Text>
                        <TextInput
                            value={passwordForm.confirm}
                            onChangeText={(t) => setPasswordForm(prev => ({ ...prev, confirm: t }))}
                            secureTextEntry
                            placeholder="Repita a nova senha"
                            placeholderTextColor={THEME.colors.textMuted}
                            className="bg-background border border-border rounded-xl px-4 h-14 text-white font-spaceGrotesk text-base"
                        />
                    </View>
                </View>
            </EnterpriseModal>

            <DriverBottomNav activeTab="profile" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    avatarGlow: {
        position: 'absolute',
        top: -8,
        left: -8,
        right: -8,
        bottom: -8,
        borderRadius: 100,
        backgroundColor: 'rgba(255, 230, 0, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255, 230, 0, 0.2)',
        shadowColor: THEME.colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 15,
        elevation: 10,
        zIndex: 0
    }
});
