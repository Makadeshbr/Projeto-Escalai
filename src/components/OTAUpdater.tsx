import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as Updates from 'expo-updates';
import { DownloadCloud, CheckCircle } from 'lucide-react-native';
import { THEME } from '~/src/constants/theme';

export default function OTAUpdater() {
    const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isDownloaded, setIsDownloaded] = useState(false);

    useEffect(() => {
        async function checkUpdates() {
            try {
                if (__DEV__) return; // OTA não funciona em ambiente de dev local

                const update = await Updates.checkForUpdateAsync();

                if (update.isAvailable) {
                    setIsUpdateAvailable(true);
                }
            } catch (error) {
                console.log('[OTA Updates] Erro silencioso ao checar update:', error);
            }
        }

        checkUpdates();
    }, []);

    const handleUpdate = async () => {
        setIsDownloading(true);
        try {
            await Updates.fetchUpdateAsync();
            setIsDownloading(false);
            setIsDownloaded(true);

            // Pequeno delay para UX: usuário lê "tudo pronto" e já recarrega
            setTimeout(async () => {
                await Updates.reloadAsync();
            }, 1000);
        } catch (error) {
            console.log('[OTA Updates] Erro ao baixar ou aplicar update OTA:', error);
            setIsDownloading(false);
        }
    };

    if (!isUpdateAvailable) return null;

    return (
        <Modal transparent animationType="fade" visible={isUpdateAvailable}>
            <View className="flex-1 bg-black/70 justify-center items-center px-6" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}>
                <View className="bg-surface w-full p-6 rounded-3xl border border-border shadow-2xl items-center">

                    {!isDownloading && !isDownloaded && (
                        <>
                            <View className="w-16 h-16 bg-primary/20 rounded-full items-center justify-center mb-4 border border-primary/30">
                                <DownloadCloud color={THEME.colors.primary} size={32} />
                            </View>
                            <Text className="text-2xl font-spaceGroteskBold text-white mb-2 text-center leading-7 mt-1">
                                Atualização{'\n'}Disponível
                            </Text>
                            <Text className="text-slate-400 font-spaceGrotesk text-center mb-6 leading-5 text-[14px]">
                                Melhorias de performance e funcionalidades foram liberadas. Atualize para a versão mais recente em poucos segundos.
                            </Text>

                            <TouchableOpacity
                                onPress={handleUpdate}
                                className="w-full bg-primary py-4 rounded-xl items-center"
                            >
                                <Text className="text-[#13151f] font-spaceGroteskBold text-[15px] uppercase tracking-wider">
                                    Aplicar Nova Versão ⚡
                                </Text>
                            </TouchableOpacity>
                        </>
                    )}

                    {isDownloading && (
                        <View className="items-center py-6 w-full">
                            <ActivityIndicator size="large" color={THEME.colors.primary} className="mb-6" />
                            <Text className="text-xl font-spaceGroteskBold text-white mb-2 text-center">Baixando pacote...</Text>
                            <Text className="text-slate-400 font-spaceGrotesk text-center px-2">
                                Preparando a atualização Over-The-Air da plataforma. Não feche o aplicativo.
                            </Text>
                        </View>
                    )}

                    {isDownloaded && (
                        <View className="items-center py-6 w-full">
                            <View className="w-16 h-16 bg-green-500/20 rounded-full items-center justify-center mb-4 border border-green-500/30">
                                <CheckCircle color="#22c55e" size={32} />
                            </View>
                            <Text className="text-xl font-spaceGroteskBold text-green-500 mb-2 text-center">Tudo Pronto!</Text>
                            <Text className="text-slate-400 font-spaceGrotesk text-center">
                                Reiniciando o app magicamente...
                            </Text>
                        </View>
                    )}

                </View>
            </View>
        </Modal>
    );
}
