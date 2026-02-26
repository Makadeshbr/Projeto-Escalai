import { useCallback } from 'react';
import { aether } from '~/src/lib/aether';
import {
    COLLECTIONS, Assignment, DriverAvailability,
    getTodayDateStr
} from '~/src/lib/collections';
import { notifyDriver, diagnosePushError, isExpoGo } from '~/src/lib/push';
import type { ModalType } from './useActionModal';
import { useAuthStore, AuthUser } from '~/src/store/auth';

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Paths, File as ExpoFile } from 'expo-file-system';
import * as XLSX from 'xlsx';

/**
 * Parâmetros necessários para criar um despacho de rota.
 */
export interface CreateAssignmentParams {
    /** Cidade selecionada para o despacho */
    selectedCity: { id: string; name: string } | null;
    /** Número da onda */
    waveNum: string;
    /** Número da doca */
    dock: string;
    /** Quantidade de sacas (Opcional) */
    sacas?: string;
    /** Se envio SDD está ativado */
    isSddEnabled: boolean;
    /** IDs dos motoristas selecionados */
    selectedDriverIds: Set<string>;
    /** Motoristas disponíveis para matching */
    availableDrivers: DriverAvailability[];
}

/**
 * Hook que centraliza todas as ações de mutação de assignments.
 * Extrai lógica de criar, cancelar, reatribuir e exportar do God Class.
 *
 * @param callbacks - Funções de refresh para atualizar dados após mutação
 * @returns Handlers para todas as ações de assignment
 */
export function useAssignmentActions(callbacks: {
    fetchRecentAssignments: () => Promise<void>;
    fetchStats: () => Promise<void>;
    showModal: (title: string, message: string, type?: ModalType, onConfirm?: () => void) => void;
}) {
    const { user } = useAuthStore();
    const { fetchRecentAssignments, fetchStats, showModal } = callbacks;

    /**
     * Cria atribuições de rota para os motoristas selecionados.
     * Usa snapshot dos dados para segurança da closure assíncrona.
     *
     * @param params - Parâmetros do formulário de despacho
     * @param setIsLoading - Setter de estado de loading
     * @param onSuccess - Callback de sucesso (limpa form)
     */
    const handleCreateAssignments = useCallback(async (
        params: CreateAssignmentParams,
        setIsLoading: (v: boolean) => void,
        onSuccess: () => void
    ) => {
        const { selectedCity, waveNum, dock, sacas, isSddEnabled, selectedDriverIds, availableDrivers } = params;

        if (!selectedCity) {
            showModal('Atenção', 'Selecione a Cidade/Centro de Distribuição.', 'error');
            return;
        }
        if (!dock.trim()) {
            showModal('Atenção', 'Informe a doca para os motoristas.', 'error');
            return;
        }
        if (selectedDriverIds.size === 0) {
            showModal('Atenção', 'Selecione ao menos um veículo.', 'error');
            return;
        }

        // Snapshot para segurança da closure
        const snapUser = user;
        const snapCity = selectedCity;

        const runCreate = async () => {
            setIsLoading(true);
            let failedPushes = 0;

            try {
                const waveLabel = waveNum.trim() || 'Geral';
                const selectedDriversList = availableDrivers.filter(
                    d => selectedDriverIds.has(d.driverId || d.id)
                );

                if (selectedDriversList.length === 0) {
                    showModal('Aviso', 'Nenhum motorista válido na seleção. Recarregue.', 'error');
                    setIsLoading(false);
                    return;
                }

                for (const driver of selectedDriversList) {
                    await aether.db.collection(COLLECTIONS.ASSIGNMENTS).create({
                        cityId: snapCity.id,
                        cityName: snapCity.name,
                        wave: 'general',
                        waveLabel: waveLabel,
                        waveTime: 'Conforme Rota',
                        waveNumber: waveNum.trim(),
                        dock: dock.trim(),
                        ...(sacas && sacas.trim() ? { sacas: parseInt(sacas.trim(), 10) } : {}),
                        isSdd: isSddEnabled,
                        driverId: driver.driverId || driver.id,
                        driverName: driver.driverName,
                        driverPlate: driver.driverPlate,
                        dockStatus: 'waiting',
                        status: 'pending',
                        createdByAdminId: snapUser?.id || '',
                        createdAt: new Date().toISOString(),
                    });

                    try {
                        await notifyDriver(
                            driver.driverId || driver.id,
                            'ROTA ATRIBUÍDA DISPONÍVEL 📦',
                            `Designado para ${snapCity.name} (${waveLabel}). Doca ${dock.trim()}${isSddEnabled ? ' - Priority SDD' : ''}.`
                        );
                    } catch (pushErr) {
                        console.warn(`[Fault Tolerance] Push falhou para ${driver.driverId}:`, pushErr);
                        failedPushes++;
                    }
                }

                if (failedPushes > 0) {
                    const reason = isExpoGo
                        ? 'Push indisponível no Expo Go (modo dev). Na build de produção, os motoristas serão notificados normalmente.'
                        : `${failedPushes} motorista(s) não receberam o push. Possível causa: app não aberto ou notificações desativadas no celular.`;
                    showModal('Atribuições Criadas', `${selectedDriversList.length} rota(s) criada(s) com sucesso.\n\n${reason}`, 'warning');
                } else {
                    showModal('Despacho Sucesso', `${selectedDriversList.length} atribuição(ões) criada(s) com Push enviado!`, 'success');
                }

                onSuccess();
                fetchRecentAssignments();
                fetchStats();
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : 'Erro de rede ao alocar motoristas.';
                showModal('Erro no Despacho', msg, 'error');
            } finally {
                setIsLoading(false);
            }
        };

        showModal(
            'Despachar Frota',
            `Alocar ${selectedDriverIds.size} veículos para ${selectedCity.name}?\nSerão notificados instantaneamente.`,
            'confirm',
            runCreate
        );
    }, [user, showModal, fetchRecentAssignments, fetchStats]);

    /**
     * Cancela uma atribuição de rota e notifica o motorista.
     */
    const handleCancelAssignment = useCallback(async (
        assignment: Assignment,
        setIsLoading: (v: boolean) => void,
        onSuccess: () => void
    ) => {
        showModal('Cancelar Rota?', `Cancelar a rota de ${assignment.driverName}?`, 'confirm', async () => {
            setIsLoading(true);
            try {
                await aether.db.collection(COLLECTIONS.ASSIGNMENTS).delete(assignment.id);
                try {
                    await notifyDriver(assignment.driverId, 'ROTA CANCELADA ❌', 'Sua movimentação foi cancelada.');
                } catch (pushErr) {
                    console.warn('[Fault Tolerance] Push cancelamento falhou:', diagnosePushError(pushErr));
                }
                showModal('Rota Cancelada', 'A atribuição foi removida.', 'success');
                onSuccess();
                fetchRecentAssignments();
                fetchStats();
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Erro ao cancelar.';
                showModal('Erro', msg, 'error');
            } finally {
                setIsLoading(false);
            }
        });
    }, [showModal, fetchRecentAssignments, fetchStats]);

    /**
     * Reatribui uma rota para um novo motorista selecionado.
     */
    const handleReassign = useCallback(async (
        reassignTarget: Assignment,
        newDriverId: string,
        newDriver: DriverAvailability,
        setIsLoading: (v: boolean) => void,
        onSuccess: () => void
    ) => {
        setIsLoading(true);
        try {
            await aether.db.collection(COLLECTIONS.ASSIGNMENTS).update(reassignTarget.id, {
                driverId: newDriverId,
                driverName: newDriver.driverName,
                driverPlate: newDriver.driverPlate,
                status: 'pending',
            });
            try {
                await notifyDriver(newDriverId, 'ROTA REATRIBUÍDA 📦', 'Nova rota alocada para você.');
                await notifyDriver(reassignTarget.driverId, 'ROTA REMOVIDA ❌', 'Sua rota foi reatribuída.');
            } catch (pushErr) {
                console.warn('[Fault Tolerance] Push reatribuição falhou:', diagnosePushError(pushErr));
            }

            showModal('Sucesso', 'Rota reatribuída com sucesso.', 'success');
            onSuccess();
            fetchRecentAssignments();
            fetchStats();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Erro ao reatribuir.';
            showModal('Erro', msg, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [showModal, fetchRecentAssignments, fetchStats]);

    /**
     * Busca assignments de hoje para exportação.
     */
    const getTodayAssignments = useCallback(async (): Promise<Assignment[]> => {
        const { aetherFetchAll } = require('~/src/lib/aether');
        const todayStr = getTodayDateStr();
        const all = await aetherFetchAll(COLLECTIONS.ASSIGNMENTS);
        if (!all) return [];

        return (all as unknown as Assignment[]).filter(a => {
            if (!a.createdAt) return false;
            // Valida robusta de timezone (ex: 2026-02-24T02:00:00Z em BRT é 2026-02-23)
            const createdDate = new Date(a.createdAt);
            const year = createdDate.getFullYear();
            const month = String(createdDate.getMonth() + 1).padStart(2, '0');
            const day = String(createdDate.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}` === todayStr;
        });
    }, []);

    /**
     * Gera e compartilha relatório PDF com atribuições de hoje.
     */
    const handleGeneratePDF = useCallback(async () => {
        try {
            const assignments = await getTodayAssignments();
            if (assignments.length === 0) {
                showModal('Exportação Inválida', 'Não há roteirizações para exportar.', 'info');
                return;
            }
            const todayLabel = new Date().toLocaleDateString('pt-BR');
            const rows = assignments.map(a =>
                `<tr><td>${a.driverName}</td><td>${a.driverPlate || '-'}</td><td>${a.cityName || '-'}</td><td>${a.dock || '-'}</td><td>${a.waveLabel || '-'}</td></tr>`
            ).join('');
            const html = `<html><head><style>body{font-family:sans-serif}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f9e006}</style></head><body><h2>EscalAI — Relatório ${todayLabel}</h2><table><tr><th>Motorista</th><th>Placa</th><th>Cidade</th><th>Doca</th><th>Turno</th></tr>${rows}</table></body></html>`;
            const { uri } = await Print.printToFileAsync({ html });
            await Sharing.shareAsync(uri);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Erro ao gerar PDF.';
            showModal('Falha na Geração', msg, 'error');
        }
    }, [getTodayAssignments, showModal]);

    /**
     * Gera e compartilha relatório Excel com atribuições de hoje.
     */
    const handleGenerateExcel = useCallback(async () => {
        try {
            const assignments = await getTodayAssignments();
            if (assignments.length === 0) {
                showModal('Exportação Inválida', 'Nenhuma rota para exportar.', 'info');
                return;
            }
            const wsData = assignments.map(a => ({ 'Motorista': a.driverName || '-' }));
            const ws = XLSX.utils.json_to_sheet(wsData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Atribuições');
            const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
            const file = new ExpoFile(Paths.document, 'relatorio_escalai.xlsx');
            file.write(new Uint8Array(wbout));
            await Sharing.shareAsync(file.uri);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Erro ao gerar Excel.';
            showModal('Falha na Geração', msg, 'error');
        }
    }, [getTodayAssignments, showModal]);

    return {
        handleCreateAssignments,
        handleCancelAssignment,
        handleReassign,
        handleGeneratePDF,
        handleGenerateExcel,
    };
}
