import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Grid, Navigation, Users, Zap, MoreHorizontal, ScanLine, Settings, X } from 'lucide-react-native';
import { router } from 'expo-router';
import { THEME } from '~/src/constants/theme';

/**
 * Tipo das tabs disponíveis no painel administrativo.
 * Inclui tabs primárias (visíveis) e secundárias (dentro do menu "Mais").
 */
type AdminTab = 'overview' | 'dashboard' | 'monitor' | 'import' | 'drivers' | 'settings';

interface AdminBottomNavProps {
    activeTab: AdminTab;
}

/** Tabs exibidas diretamente na barra inferior (máximo 4 + botão Mais) */
const PRIMARY_TABS = [
    { key: 'overview' as const, label: 'Geral', href: '/admin/overview', Icon: Grid },
    { key: 'dashboard' as const, label: 'Despacho', href: '/admin/dashboard', Icon: Navigation },
    { key: 'monitor' as const, label: 'Docas', href: '/admin/monitor', Icon: Zap },
    { key: 'drivers' as const, label: 'Motoristas', href: '/admin/drivers', Icon: Users },
];

/** Tabs exibidas no menu "Mais" (bottom sheet) */
const SECONDARY_TABS = [
    { key: 'import' as const, label: 'Scanner IA (PDF)', href: '/admin/import', Icon: ScanLine, description: 'Importar rotas via OCR Gemini' },
    { key: 'settings' as const, label: 'Ajustes', href: '/admin/settings', Icon: Settings, description: 'Configurações do sistema' },
];

/**
 * Componente de navegação inferior do administrador.
 * Exibe 4 tabs primárias + botão "Mais" que abre um bottom sheet
 * com as opções secundárias (Scanner, Ajustes).
 * Padrão visual inspirado em apps enterprise (YouTube, Instagram, banking apps).
 */
export default function AdminBottomNav({ activeTab }: AdminBottomNavProps) {
    const [showMore, setShowMore] = useState(false);

    /** Verifica se a tab ativa pertence ao menu secundário (pra destacar o botão "Mais") */
    const isSecondaryActive = SECONDARY_TABS.some(t => t.key === activeTab);

    return (
        <>
            {/* Barra fixa inferior */}
            <View className="absolute bottom-0 w-full bg-header-bg/95 border-t border-border px-4 pb-6 pt-3 flex-row justify-between items-end z-30">
                {PRIMARY_TABS.map(({ key, label, href, Icon }) => {
                    const isActive = activeTab === key;
                    return (
                        <TouchableOpacity
                            key={key}
                            onPress={() => router.replace(href as any)}
                            className={`flex-1 items-center justify-center gap-1 ${isActive ? 'opacity-100' : 'opacity-60'}`}
                        >
                            <Icon color={isActive ? THEME.colors.primary : '#94a3b8'} size={22} />
                            <Text
                                className={`text-[10px] uppercase tracking-wider ${isActive ? 'font-spaceGroteskBold text-primary' : 'font-spaceGrotesk text-[#94a3b8]'}`}
                            >
                                {label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}

                {/* Botão "Mais" */}
                <TouchableOpacity
                    onPress={() => setShowMore(true)}
                    className={`flex-1 items-center justify-center gap-1 ${isSecondaryActive ? 'opacity-100' : 'opacity-60'}`}
                >
                    <MoreHorizontal color={isSecondaryActive ? THEME.colors.primary : '#94a3b8'} size={22} />
                    <Text
                        className={`text-[10px] uppercase tracking-wider ${isSecondaryActive ? 'font-spaceGroteskBold text-primary' : 'font-spaceGrotesk text-[#94a3b8]'}`}
                    >
                        Mais
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Bottom Sheet do "Mais" */}
            <Modal visible={showMore} transparent animationType="slide" onRequestClose={() => setShowMore(false)}>
                <Pressable onPress={() => setShowMore(false)} className="flex-1 bg-black/60 justify-end">
                    <Pressable onPress={() => {/* Impede fechar ao clicar no conteúdo */ }} className="bg-[#1a1d2e] rounded-t-3xl border-t border-border px-6 pt-4 pb-10">
                        {/* Handle decorativo */}
                        <View className="w-10 h-1 bg-[#2d3345] rounded-full self-center mb-5" />

                        {/* Título */}
                        <View className="flex-row justify-between items-center mb-5">
                            <Text className="text-white text-lg font-spaceGroteskBold">Mais Opções</Text>
                            <TouchableOpacity onPress={() => setShowMore(false)} className="w-8 h-8 rounded-full bg-white/5 items-center justify-center">
                                <X color="#94a3b8" size={18} />
                            </TouchableOpacity>
                        </View>

                        {/* Lista de items secundários */}
                        <View className="gap-2">
                            {SECONDARY_TABS.map(({ key, label, href, Icon, description }) => {
                                const isActive = activeTab === key;
                                return (
                                    <TouchableOpacity
                                        key={key}
                                        onPress={() => {
                                            setShowMore(false);
                                            router.replace(href as any);
                                        }}
                                        className={`flex-row items-center gap-4 p-4 rounded-xl border ${isActive
                                            ? 'bg-primary/10 border-primary/20'
                                            : 'bg-background border-border'
                                            }`}
                                    >
                                        <View className={`w-11 h-11 rounded-full items-center justify-center ${isActive ? 'bg-primary/20' : 'bg-white/5'}`}>
                                            <Icon color={isActive ? THEME.colors.primary : '#94a3b8'} size={22} />
                                        </View>
                                        <View className="flex-1">
                                            <Text className={`text-[15px] ${isActive ? 'font-spaceGroteskBold text-primary' : 'font-spaceGroteskBold text-white'}`}>
                                                {label}
                                            </Text>
                                            <Text className="text-text-muted text-xs font-spaceGrotesk mt-0.5">{description}</Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>
        </>
    );
}
