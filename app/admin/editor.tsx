import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Edit3, HelpCircle } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { THEME } from '~/src/constants/theme';
import AdminBottomNav from '~/src/components/AdminBottomNav';
import { DashboardActionModal } from '~/src/components/dashboard/DashboardActionModal';
import { SkeletonList } from '~/src/components/ui/Skeleton';

// Hook de Edição + Componentes
import { useEditorData } from '~/src/hooks/useEditorData';
import { EditorCard, EditorFormModal } from '~/src/components/dashboard/EditorComponents';
import { aetherFetchAll } from '~/src/lib/aether';
import { COLLECTIONS } from '~/src/lib/collections';

export default function AdminEditorScreen() {
    const router = useRouter();
    const data = useEditorData();
    const [driverAvatars, setDriverAvatars] = useState<Record<string, string>>({});

    // Carrega avatares dos motoristas para os cards visuais
    useEffect(() => {
        (async () => {
            try {
                const allDrivers = await aetherFetchAll(COLLECTIONS.DRIVER_STATUS);
                const map: Record<string, string> = {};
                (allDrivers as any[]).forEach((d: any) => {
                    const payload = d._payload || d;
                    // Procura avatarUrl no payload principal (Padrão mais moderno do admin)
                    if (d.user_id && payload.avatarUrl) {
                        map[d.user_id] = payload.avatarUrl;
                    } else if (payload.driverId && payload.avatarUrl) {
                        map[payload.driverId] = payload.avatarUrl;
                    }
                });
                setDriverAvatars(map);
            } catch (e) {
                console.warn('[Editor] Erro ao buscar avatars:', e);
            }
        })();
    }, [data.assignments]);

    return (
        <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <LinearGradient
                colors={['#1a1d2e', THEME.colors.background, THEME.colors.headerBackground]}
                style={StyleSheet.absoluteFillObject}
            />

            {/* Header */}
            <View className="px-5 py-4 border-b border-white/5 z-20 flex-row items-center justify-between">
                <View className="flex-row items-center gap-4">
                    <TouchableOpacity onPress={() => router.back()} className="w-10 h-10 rounded-full bg-surface border border-border items-center justify-center">
                        <ArrowLeft color="#fff" size={20} />
                    </TouchableOpacity>
                    <View>
                        <Text className="text-xl font-spaceGroteskBold tracking-tight text-white mb-0.5">Editor de Escalas</Text>
                        <Text className="text-[10px] font-spaceGrotesk text-primary uppercase tracking-widest">Correção em Tempo Real</Text>
                    </View>
                </View>
            </View>

            {/* Banner Informativo */}
            <View className="px-5 py-4 border-b border-white/5 bg-primary/5 flex-row items-center gap-3">
                <View className="w-8 h-8 rounded-full bg-primary/20 items-center justify-center border border-primary/30">
                    <Edit3 size={14} color={THEME.colors.primary} />
                </View>
                <View className="flex-1">
                    <Text className="text-[#cbd5e1] text-xs font-spaceGrotesk">Se o motorista foi escalado com dados errados (nome, placa, doca, rota), altere aqui e ele será notificado automaticamente.</Text>
                </View>
            </View>

            {/* Lista Principal Virtualizada */}
            <FlatList
                data={data.assignments}
                keyExtractor={(item) => item.id}
                className="flex-1 px-5 pt-5"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 120, flexGrow: 1 }}
                refreshControl={
                    <RefreshControl
                        refreshing={data.isLoading}
                        onRefresh={data.refresh}
                        tintColor={THEME.colors.primary}
                        colors={[THEME.colors.primary]}
                    />
                }
                initialNumToRender={8}
                maxToRenderPerBatch={10}
                windowSize={5}
                removeClippedSubviews={true}
                ListEmptyComponent={
                    data.isLoading && data.assignments.length === 0 ? (
                        <SkeletonList count={4} />
                    ) : (
                        <View className="items-center justify-center pt-20 pb-10 opacity-60">
                            <HelpCircle size={48} color="#475569" />
                            <Text className="text-center font-spaceGrotesk text-[#64748b] mt-4 max-w-[250px]">
                                Nenhuma escala pendente de hoje encontrada. Se as rotas foram concluídas, elas não podem ser alteradas.
                            </Text>
                        </View>
                    )
                }
                renderItem={({ item: assignment }) => (
                    <EditorCard
                        assignment={assignment}
                        onEdit={data.editor.start}
                        avatarUrl={driverAvatars[assignment.driverId]}
                    />
                )}
            />

            {/* Modal de Formulário de Edição */}
            <EditorFormModal
                visible={data.editor.isOpen}
                assignment={data.editor.assignment}
                plate={data.editor.plate} setPlate={data.editor.setPlate}
                city={data.editor.city} setCity={data.editor.setCity}
                dock={data.editor.dock} setDock={data.editor.setDock}
                route={data.editor.route} setRoute={data.editor.setRoute}
                onSave={data.editor.save}
                onCancel={data.editor.cancel}
            />

            {/* Modal Global de Ação (Avisos/Loadings) */}
            <DashboardActionModal
                modal={data.actionModal}
                onDismiss={data.dismissModal}
            />

            <AdminBottomNav activeTab="overview" />
        </SafeAreaView>
    );
}
