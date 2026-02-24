import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, Pressable } from 'react-native';
import { Calendar, X, ChevronRight } from 'lucide-react-native';
import { THEME } from '~/src/constants/theme';

interface DateSelectionModalProps {
    visible: boolean;
    onClose: () => void;
    onSelectDate: (dateStr: string) => void;
}

export default function DateSelectionModal({ visible, onClose, onSelectDate }: DateSelectionModalProps) {
    const [dates, setDates] = useState<{ raw: string; day: string; month: string; weekday: string }[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>('');

    useEffect(() => {
        // Generate next 15 days starting from today
        const generated = [];
        const today = new Date();
        for (let i = 0; i < 15; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            const raw = d.toISOString().split('T')[0];
            const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '').toUpperCase();
            const day = d.toLocaleDateString('pt-BR', { day: '2-digit', timeZone: 'UTC' });
            const month = d.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '').toUpperCase();
            generated.push({ raw, day, month, weekday });
        }
        setDates(generated);
        if (generated.length > 0) {
            setSelectedDate(generated[0].raw); // Default to today
        }
    }, [visible]);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View className="flex-1 bg-black/80 justify-center items-center px-4">
                <View className="bg-surface w-full max-w-[400px] rounded-3xl border border-border overflow-hidden">
                    {/* Header */}
                    <View className="p-6 border-b border-border flex-row items-center justify-between">
                        <View className="flex-row items-center gap-3">
                            <View className="w-10 h-10 rounded-full bg-background items-center justify-center border border-border">
                                <Calendar color={THEME.colors.primary} size={20} />
                            </View>
                            <View>
                                <Text className="text-white font-spaceGroteskBold text-lg tracking-wide">Nova Escala</Text>
                                <Text className="text-[#94a3b8] font-spaceGrotesk text-xs mt-0.5">Selecione a data base no calendário</Text>
                            </View>
                        </View>
                        <TouchableOpacity onPress={onClose} className="w-8 h-8 rounded-full bg-background items-center justify-center border border-border">
                            <X color="#94a3b8" size={16} />
                        </TouchableOpacity>
                    </View>

                    {/* Content */}
                    <View className="p-6">
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6">
                            <View className="flex-row gap-3 pe-4">
                                {dates.map((item) => {
                                    const isSelected = selectedDate === item.raw;
                                    return (
                                        <Pressable
                                            key={item.raw}
                                            onPress={() => setSelectedDate(item.raw)}
                                            className={`w-[76px] h-[92px] rounded-2xl items-center justify-center border transition-colors ${isSelected ? 'bg-primary border-primary' : 'bg-background border-border'}`}
                                        >
                                            <Text className={`text-[10px] font-spaceGroteskBold uppercase tracking-wider mb-1 ${isSelected ? 'text-[#1e2332]' : 'text-text-muted'}`}>{item.weekday}</Text>
                                            <Text className={`text-[28px] font-spaceGroteskBold leading-none ${isSelected ? 'text-[#13151f]' : 'text-white'}`}>{item.day}</Text>
                                            <Text className={`text-[10px] font-spaceGrotesk uppercase tracking-wider mt-1 ${isSelected ? 'text-[#1e2332]/80' : 'text-text-muted'}`}>{item.month}</Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </ScrollView>

                        <TouchableOpacity
                            onPress={() => {
                                onSelectDate(selectedDate);
                                onClose();
                            }}
                            className="w-full bg-primary rounded-xl h-14 flex-row items-center justify-center gap-2"
                        >
                            <Text className="text-[#13151f] font-spaceGroteskBold text-[15px] uppercase tracking-wider">Continuar para Abertura</Text>
                            <ChevronRight color={THEME.colors.background} size={20} />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
