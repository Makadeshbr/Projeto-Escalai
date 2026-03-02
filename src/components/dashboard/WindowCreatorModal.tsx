import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, Modal, KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { ArrowLeft, Edit3, Clock, Info, Send } from 'lucide-react-native';
import { THEME } from '~/src/constants/theme';
import { aether, aetherFetchAll } from '~/src/lib/aether';
import { COLLECTIONS } from '~/src/lib/collections';
import { notifyAllDrivers, diagnosePushError } from '~/src/lib/push';
import { logger } from '~/src/lib/logger';

interface WindowCreatorModalProps {
    visible: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function WindowCreatorModal({ visible, onClose, onSuccess }: WindowCreatorModalProps) {
    const [title, setTitle] = useState('');
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [hour, setHour] = useState('10:00');
    const [period, setPeriod] = useState<'AM' | 'PM'>('PM');
    const [driverCount, setDriverCount] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(new Date());

    useEffect(() => {
        if (visible) {
            // Reset state
            setTitle('');
            setSelectedDate(new Date());
            setHour('10:00');
            setPeriod('PM');

            // Fetch potential driver count for the info banner
            fetchDriverCount();
        }
    }, [visible]);

    const fetchDriverCount = async () => {
        try {
            const drivers = await aetherFetchAll(COLLECTIONS.DRIVER_STATUS) as any[];
            setDriverCount(drivers.length);
        } catch (error) {
            logger.error('Failed to fetch drivers', error);
        }
    };

    const getDaysInMonth = (year: number, month: number) => {
        return new Date(year, month + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (year: number, month: number) => {
        return new Date(year, month, 1).getDay();
    };

    const renderCalendar = () => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const daysInMonth = getDaysInMonth(year, month);
        const firstDay = getFirstDayOfMonth(year, month);

        const days = [];
        const daysOfWeek = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

        // Header (days of week)
        const headerRow = daysOfWeek.map((day, index) => (
            <Text key={`header-${index}`} className="flex-1 text-center text-slate-500 font-spaceGroteskBold text-xs py-2">
                {day}
            </Text>
        ));

        // Fill empty cells before the 1st of the month
        for (let i = 0; i < firstDay; i++) {
            days.push(<View key={`empty-${i}`} className="flex-1 w-10 h-10 m-1" />);
        }

        // Fill days of the month
        for (let i = 1; i <= daysInMonth; i++) {
            const dateObj = new Date(year, month, i);
            const isSelected =
                selectedDate.getDate() === i &&
                selectedDate.getMonth() === month &&
                selectedDate.getFullYear() === year;

            const isToday =
                new Date().getDate() === i &&
                new Date().getMonth() === month &&
                new Date().getFullYear() === year;

            const isPast = dateObj < new Date(new Date().setHours(0, 0, 0, 0));

            days.push(
                <TouchableOpacity
                    key={`day-${i}`}
                    disabled={isPast}
                    onPress={() => setSelectedDate(dateObj)}
                    className={`flex-1 w-10 h-10 m-1 items-center justify-center rounded-xl ${isSelected
                        ? 'bg-[#ffd500] shadow-lg shadow-[#ffd500]/50'
                        : isPast
                            ? 'opacity-30'
                            : isToday
                                ? 'bg-white/5 border border-white/10'
                                : ''
                        }`}
                >
                    <Text className={`font-spaceGroteskBold text-sm ${isSelected ? 'text-black' : isPast ? 'text-slate-600' : 'text-slate-200'
                        }`}>
                        {i}
                    </Text>
                </TouchableOpacity>
            );
        }

        // Calculate rows
        const rows: React.ReactNode[] = [];
        let cells: React.ReactNode[] = [];
        days.forEach((day, i) => {
            if (i % 7 !== 0) {
                cells.push(day);
            } else {
                if (cells.length > 0) rows.push(<View key={`row-${i / 7}`} className="flex-row justify-between w-full">{cells}</View>);
                cells = [day];
            }
        });
        if (cells.length > 0) {
            // Fill remaining empty cells to maintain grid width
            while (cells.length < 7) {
                cells.push(<View key={`empty-end-${cells.length}`} className="flex-1 w-10 h-10 m-1" />);
            }
            rows.push(<View key={`row-last`} className="flex-row justify-between w-full">{cells}</View>);
        }

        const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

        return (
            <View className="bg-[#1c1e29] border border-white/5 rounded-3xl p-5 mb-6">
                <View className="flex-row items-center justify-between mb-2">
                    <TouchableOpacity
                        className="p-2"
                        onPress={() => setCurrentMonth(new Date(year, month - 1, 1))}
                    >
                        <Text className="text-slate-400 font-bold text-lg">‹</Text>
                    </TouchableOpacity>
                    <Text className="text-white font-spaceGroteskBold text-[15px]">
                        {monthNames[month]} {year}
                    </Text>
                    <TouchableOpacity
                        className="p-2"
                        onPress={() => setCurrentMonth(new Date(year, month + 1, 1))}
                    >
                        <Text className="text-slate-400 font-bold text-lg">›</Text>
                    </TouchableOpacity>
                </View>
                <View className="flex-row border-b border-white/5 pb-2 mb-2 w-full">{headerRow}</View>
                <View className="items-center w-full">{rows}</View>
            </View>
        );
    };

    const handleCreate = async () => {
        const finalTitle = title.trim() || `Convocação ${selectedDate.toLocaleDateString('pt-BR')}`;
        const timeLimitFormatted = `${hour}${period}`;

        // Format to YYYY-MM-DD
        const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const day = String(selectedDate.getDate()).padStart(2, '0');
        const targetStr = `${selectedDate.getFullYear()}-${month}-${day}`;
        const labelStr = `${day}/${month}`;

        setIsSubmitting(true);

        try {
            // Verify if already exists
            const existing = await aether.db.collection(COLLECTIONS.AVAILABILITY_WINDOWS).query().eq('targetDate', targetStr).get();

            if (existing && existing.length > 0) {
                alert(`Já existe uma janela aberta para a data ${labelStr}.`);
                setIsSubmitting(false);
                return;
            }

            // Create window
            await aether.db.collection(COLLECTIONS.AVAILABILITY_WINDOWS).create({
                title: finalTitle,
                targetDate: targetStr,
                timeLimit: timeLimitFormatted,
                openedAt: new Date().toISOString(),
                isOpen: true
            });

            // Send push notification
            try {
                await notifyAllDrivers(
                    `N0VA CONVOCAÇÃO: ${finalTitle} 🚀`,
                    `Responda até as ${timeLimitFormatted} se você estará disponível dia ${labelStr}. Vagas limitadas, garanta sua escala!`
                );
            } catch (pushErr) {
                logger.warn('Push notification failed, but window was created:', pushErr);
            }

            onSuccess();
            onClose();
        } catch (error: any) {
            logger.error('Erro ao criar janela:', error);
            alert('Falha ao criar janela. Tente novamente.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View className="flex-1 bg-black/60 items-end justify-end">
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    className="w-full bg-[#13151f] rounded-t-[40px] border-t border-white/10"
                    style={{ height: '90%' }}
                >
                    {/* Handle */}
                    <View className="w-12 h-1.5 bg-[#2d3345] rounded-full self-center mt-4 mb-2" />

                    {/* Header */}
                    <View className="flex-row items-center justify-between px-6 pb-4 border-b border-white/5">
                        <TouchableOpacity onPress={onClose} className="p-2 -ml-2">
                            <ArrowLeft color="#94a3b8" size={24} />
                        </TouchableOpacity>
                        <Text className="text-white font-spaceGroteskBold text-lg">Nova Janela</Text>
                        <View className="w-8" />
                    </View>

                    <ScrollView className="flex-1 px-6 pt-6" showsVerticalScrollIndicator={false}>

                        {/* Title Input */}
                        <Text className="text-slate-400 font-spaceGroteskBold text-[10px] uppercase tracking-widest mb-3">Título da Convocação</Text>
                        <View className="bg-[#1c1e29] border border-white/5 rounded-2xl flex-row items-center px-4 h-16 mb-8">
                            <Edit3 color="#ffd500" size={20} className="mr-3" />
                            <TextInput
                                value={title}
                                onChangeText={setTitle}
                                placeholder="Ex: Rota Sul Amanhã"
                                placeholderTextColor="#475569"
                                className="flex-1 text-white font-spaceGroteskBold text-[15px] h-full"
                            />
                        </View>

                        {/* Calendar */}
                        <Text className="text-slate-400 font-spaceGroteskBold text-[10px] uppercase tracking-widest mb-3">Data da Janela</Text>
                        {renderCalendar()}

                        {/* Time Limit */}
                        <Text className="text-slate-400 font-spaceGroteskBold text-[10px] uppercase tracking-widest mb-3">Horário Limite para Resposta</Text>
                        <View className="flex-row gap-4 mb-8">
                            <View className="flex-1 bg-[#1c1e29] border border-white/5 rounded-2xl flex-row items-center px-4 h-16">
                                <Clock color="#ffd500" size={18} className="mr-3" />
                                <TextInput
                                    value={hour}
                                    onChangeText={setHour}
                                    keyboardType="numbers-and-punctuation"
                                    className="flex-1 text-white font-spaceGroteskBold text-[15px] h-full"
                                />
                            </View>
                            <TouchableOpacity
                                onPress={() => setPeriod(p => p === 'AM' ? 'PM' : 'AM')}
                                className="w-1/3 bg-[#1c1e29] border border-white/5 rounded-2xl flex-row items-center justify-center px-4 h-16 gap-2"
                            >
                                <Clock color="#ffd500" size={16} />
                                <Text className="text-white font-spaceGroteskBold text-[15px]">{period}</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Info Banner */}
                        <View className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-5 flex-row items-center gap-4 mb-10">
                            <Info color="#3b82f6" size={24} className="shrink-0" />
                            <Text className="text-slate-300 font-spaceGrotesk leading-relaxed flex-1 text-sm">
                                Esta convocação enviará um push imediato para cerca de <Text className="text-white font-spaceGroteskBold">{driverCount} motoristas</Text> válidos registrados no aplicativo.
                            </Text>
                        </View>

                    </ScrollView>

                    {/* Footer CTA */}
                    <View className="p-6 border-t border-white/5 bg-[#13151f]">
                        <TouchableOpacity
                            onPress={handleCreate}
                            disabled={isSubmitting}
                            className={`bg-[#ffd500] rounded-2xl h-16 flex-row items-center justify-center gap-3 shadow-lg ${isSubmitting ? 'opacity-70' : ''}`}
                            style={{
                                shadowColor: '#ffd500',
                                shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.3,
                                shadowRadius: 12,
                                elevation: 8,
                            }}
                        >
                            {isSubmitting ? (
                                <ActivityIndicator color="#000" />
                            ) : (
                                <>
                                    <Send color="#000" size={20} />
                                    <Text className="text-black font-spaceGroteskBold text-[16px]">Criar e Notificar Motoristas</Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}
