import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as Updates from 'expo-updates';
import { DownloadCloud, CheckCircle } from 'lucide-react-native';
import { THEME } from '~/src/constants/theme';

/**
 * Componente global de atualização Over-The-Air (OTA).
 * Monta-se invisível no _layout.tsx raiz e verifica na abertura do app
 * se existe uma versão mais recente publicada via `eas update`.
 * 
 * Quando detecta atualização, exibe um Modal estilizado permitindo
 * ao usuário aplicar a nova versão sem reinstalar o APK.
 * 
 * IMPORTANTE: Só funciona em builds standalone (APK/AAB).
 * Em Expo Go ou __DEV__, o componente retorna null silenciosamente.
 */
export default function OTAUpdater() {
    const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isDownloaded, setIsDownloaded] = useState(false);

    useEffect(() => {
        /**
         * Verifica se existe uma atualização OTA disponível no servidor EAS.
         * Protegido por guards que impedem execução em ambientes incompatíveis.
         */
        async function checkUpdates() {
            try {
                // Guard 1: Ambiente de desenvolvimento local (Metro Bundler)
                if (__DEV__) return;

                // Guard 2: Módulo nativo não disponível (Expo Go ou build sem expo-updates)
                if (!Updates.isEnabled) return;

                const update = await Updates.checkForUpdateAsync();

                if (update.isAvailable) {
                    setIsUpdateAvailable(true);
                }
            } catch (error) {
                // Falha silenciosa — não impede o uso normal do app
                console.log('[OTA] Erro silencioso ao checar update:', error);
            }
        }

        checkUpdates();
    }, []);

    /**
     * Baixa o pacote OTA do servidor EAS e aplica a atualização,
     * reiniciando o app automaticamente após conclusão.
     */
    const handleUpdate = async () => {
        setIsDownloading(true);
        try {
            await Updates.fetchUpdateAsync();
            setIsDownloading(false);
            setIsDownloaded(true);

            // Delay de 1.2s para o usuário ler a confirmação visual antes do reload
            setTimeout(async () => {
                await Updates.reloadAsync();
            }, 1200);
        } catch (error) {
            console.log('[OTA] Erro ao baixar ou aplicar update:', error);
            setIsDownloading(false);
            setIsUpdateAvailable(false);
        }
    };

    // Não renderiza nada se não houver atualização pendente
    if (!isUpdateAvailable) return null;

    return (
        <Modal transparent animationType="fade" visible={isUpdateAvailable}>
            <View
                style={{
                    flex: 1,
                    backgroundColor: 'rgba(0,0,0,0.88)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    paddingHorizontal: 24,
                }}
            >
                <View
                    style={{
                        backgroundColor: '#1e2332',
                        width: '100%',
                        padding: 28,
                        borderRadius: 24,
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.08)',
                        alignItems: 'center',
                    }}
                >

                    {/* Estado 1: Atualização disponível — aguardando ação do usuário */}
                    {!isDownloading && !isDownloaded && (
                        <>
                            <View
                                style={{
                                    width: 64,
                                    height: 64,
                                    borderRadius: 32,
                                    backgroundColor: 'rgba(255,230,0,0.12)',
                                    borderWidth: 1,
                                    borderColor: 'rgba(255,230,0,0.25)',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginBottom: 16,
                                }}
                            >
                                <DownloadCloud color={THEME.colors.primary} size={32} />
                            </View>
                            <Text
                                style={{
                                    fontSize: 22,
                                    fontFamily: 'SpaceGrotesk-Bold',
                                    color: '#ffffff',
                                    textAlign: 'center',
                                    marginBottom: 8,
                                    lineHeight: 28,
                                }}
                            >
                                Atualização{'\n'}Disponível
                            </Text>
                            <Text
                                style={{
                                    fontSize: 14,
                                    fontFamily: 'SpaceGrotesk-Regular',
                                    color: '#94a3b8',
                                    textAlign: 'center',
                                    marginBottom: 24,
                                    lineHeight: 20,
                                }}
                            >
                                Melhorias de performance e funcionalidades foram liberadas. Atualize para a versão mais recente em poucos segundos.
                            </Text>

                            <TouchableOpacity
                                onPress={handleUpdate}
                                activeOpacity={0.85}
                                style={{
                                    width: '100%',
                                    backgroundColor: THEME.colors.primary,
                                    paddingVertical: 16,
                                    borderRadius: 12,
                                    alignItems: 'center',
                                }}
                            >
                                <Text
                                    style={{
                                        color: '#13151f',
                                        fontFamily: 'SpaceGrotesk-Bold',
                                        fontSize: 15,
                                        textTransform: 'uppercase',
                                        letterSpacing: 1.2,
                                    }}
                                >
                                    Aplicar Nova Versão ⚡
                                </Text>
                            </TouchableOpacity>
                        </>
                    )}

                    {/* Estado 2: Baixando pacote OTA */}
                    {isDownloading && (
                        <View style={{ alignItems: 'center', paddingVertical: 24, width: '100%' }}>
                            <ActivityIndicator size="large" color={THEME.colors.primary} style={{ marginBottom: 24 }} />
                            <Text
                                style={{
                                    fontSize: 20,
                                    fontFamily: 'SpaceGrotesk-Bold',
                                    color: '#ffffff',
                                    textAlign: 'center',
                                    marginBottom: 8,
                                }}
                            >
                                Baixando pacote...
                            </Text>
                            <Text
                                style={{
                                    fontSize: 13,
                                    fontFamily: 'SpaceGrotesk-Regular',
                                    color: '#94a3b8',
                                    textAlign: 'center',
                                    paddingHorizontal: 8,
                                }}
                            >
                                Preparando a atualização Over-The-Air da plataforma. Não feche o aplicativo.
                            </Text>
                        </View>
                    )}

                    {/* Estado 3: Download completo — reiniciando */}
                    {isDownloaded && (
                        <View style={{ alignItems: 'center', paddingVertical: 24, width: '100%' }}>
                            <View
                                style={{
                                    width: 64,
                                    height: 64,
                                    borderRadius: 32,
                                    backgroundColor: 'rgba(34,197,94,0.15)',
                                    borderWidth: 1,
                                    borderColor: 'rgba(34,197,94,0.3)',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginBottom: 16,
                                }}
                            >
                                <CheckCircle color="#22c55e" size={32} />
                            </View>
                            <Text
                                style={{
                                    fontSize: 20,
                                    fontFamily: 'SpaceGrotesk-Bold',
                                    color: '#22c55e',
                                    textAlign: 'center',
                                    marginBottom: 8,
                                }}
                            >
                                Tudo Pronto!
                            </Text>
                            <Text
                                style={{
                                    fontSize: 13,
                                    fontFamily: 'SpaceGrotesk-Regular',
                                    color: '#94a3b8',
                                    textAlign: 'center',
                                }}
                            >
                                Reiniciando o app magicamente...
                            </Text>
                        </View>
                    )}

                </View>
            </View>
        </Modal>
    );
}
