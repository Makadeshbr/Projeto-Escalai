/**
 * Botão de exportação reutilizável com dropdown de formato (CSV/PDF).
 * Visual premium que segue o design system do Escalai.
 */

import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Download, FileText, FileSpreadsheet, X } from 'lucide-react-native';
import { THEME } from '~/src/constants/theme';
import { exportToCSV, exportToPDF, ExportColumn } from '~/src/lib/export';
import { EnterpriseModal } from './EnterpriseModal';

interface ExportButtonProps<T extends Record<string, unknown>> {
    /** Dados a exportar */
    data: T[];
    /** Definição das colunas */
    columns: ExportColumn<T>[];
    /** Título do relatório (usado no PDF) */
    title: string;
    /** Nome do arquivo sem extensão */
    filename: string;
}

/**
 * Renderiza um botão de export com dropdown para CSV ou PDF.
 * Gerencia loading state e feedback de sucesso/erro via modal.
 */
export function ExportButton<T extends Record<string, unknown>>({
    data,
    columns,
    title,
    filename,
}: ExportButtonProps<T>) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [feedback, setFeedback] = useState<{
        visible: boolean;
        title: string;
        message: string;
        type: 'success' | 'error';
    }>({ visible: false, title: '', message: '', type: 'success' });

    /** Executa a exportação no formato escolhido */
    const handleExport = useCallback(async (format: 'csv' | 'pdf') => {
        setIsMenuOpen(false);
        setIsExporting(true);

        try {
            if (format === 'csv') {
                await exportToCSV(data, columns, filename);
            } else {
                await exportToPDF(data, columns, title, filename);
            }
            // Sucesso silencioso — a share sheet já deu feedback visual
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Erro desconhecido';
            setFeedback({
                visible: true,
                title: 'Falha na Exportação',
                message: msg,
                type: 'error',
            });
        } finally {
            setIsExporting(false);
        }
    }, [data, columns, title, filename]);

    return (
        <>
            {/* Ícone de export no header */}
            <TouchableOpacity
                onPress={() => setIsMenuOpen(true)}
                disabled={isExporting || data.length === 0}
                className="w-10 h-10 rounded-full bg-surface border border-border items-center justify-center"
                style={{ opacity: data.length === 0 ? 0.3 : 1 }}
            >
                <Download
                    color={isExporting ? THEME.colors.textMuted : THEME.colors.primary}
                    size={18}
                />
            </TouchableOpacity>

            {/* Dropdown de formato */}
            <Modal
                visible={isMenuOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setIsMenuOpen(false)}
            >
                <Pressable
                    className="flex-1 justify-center items-center bg-black/60"
                    onPress={() => setIsMenuOpen(false)}
                >
                    <Pressable className="bg-[#1a1d2e] rounded-2xl p-6 mx-8 w-72 border border-border">
                        <View className="flex-row items-center justify-between mb-5">
                            <Text className="text-white font-spaceGroteskBold text-lg">
                                Exportar Relatório
                            </Text>
                            <TouchableOpacity onPress={() => setIsMenuOpen(false)}>
                                <X color="#94a3b8" size={20} />
                            </TouchableOpacity>
                        </View>

                        <Text className="text-[#94a3b8] text-xs font-spaceGrotesk mb-4">
                            {data.length} registro(s) serão exportados
                        </Text>

                        {/* Opção CSV */}
                        <TouchableOpacity
                            onPress={() => handleExport('csv')}
                            className="flex-row items-center gap-3 py-4 px-4 bg-surface rounded-xl border border-border mb-3"
                        >
                            <View className="w-10 h-10 rounded-full bg-green-500/10 items-center justify-center">
                                <FileSpreadsheet color="#4ade80" size={20} />
                            </View>
                            <View className="flex-1">
                                <Text className="text-white font-spaceGroteskBold text-sm">
                                    Planilha CSV
                                </Text>
                                <Text className="text-[#94a3b8] text-[11px] font-spaceGrotesk">
                                    Compatível com Excel e Google Sheets
                                </Text>
                            </View>
                        </TouchableOpacity>

                        {/* Opção PDF */}
                        <TouchableOpacity
                            onPress={() => handleExport('pdf')}
                            className="flex-row items-center gap-3 py-4 px-4 bg-surface rounded-xl border border-border"
                        >
                            <View className="w-10 h-10 rounded-full bg-red-500/10 items-center justify-center">
                                <FileText color="#f87171" size={20} />
                            </View>
                            <View className="flex-1">
                                <Text className="text-white font-spaceGroteskBold text-sm">
                                    Relatório PDF
                                </Text>
                                <Text className="text-[#94a3b8] text-[11px] font-spaceGrotesk">
                                    Layout profissional para impressão
                                </Text>
                            </View>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Feedback de erro */}
            <EnterpriseModal
                visible={feedback.visible}
                title={feedback.title}
                description={feedback.message}
                type={feedback.type}
                cancelText="Entendi"
                onClose={() => setFeedback(prev => ({ ...prev, visible: false }))}
            />
        </>
    );
}
