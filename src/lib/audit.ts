/**
 * Sistema de Audit Log para rastreamento de ações administrativas.
 * Grava cada ação relevante na collection AUDIT_LOG com timestamp,
 * contexto do usuário e detalhes da operação.
 *
 * IMPORTANTE: Fire-and-forget — erros de audit nunca devem bloquear
 * a operação principal. Logs são registrados de forma assíncrona.
 */

import { aether } from './aether';
import { COLLECTIONS, formatBrazilTimestamp } from './collections';

/**
 * Tipos de ações auditáveis no sistema.
 */
export type AuditAction =
    | 'driver.create'
    | 'driver.update'
    | 'driver.delete'
    | 'driver.block'
    | 'driver.unblock'
    | 'window.create'
    | 'window.delete'
    | 'city.create'
    | 'city.update'
    | 'city.delete'
    | 'assignment.import'
    | 'notification.send'
    | 'batch.reset_availability'
    | 'batch.export'
    | 'batch.mass_push';

/**
 * Estrutura de um registro de auditoria.
 */
export interface AuditEntry {
    /** ID do administrador que executou a ação */
    adminId: string;
    /** Nome do administrador */
    adminName: string;
    /** Tipo da ação executada */
    action: AuditAction;
    /** Descrição legível da ação */
    description: string;
    /** Dados adicionais relevantes (IDs afetados, contagens etc.) */
    metadata?: Record<string, unknown>;
    /** Timestamp ISO da ação */
    timestamp: string;
}

/**
 * Registra uma ação no audit log de forma assíncrona (fire-and-forget).
 * Nunca lança exceção — erros são logados silenciosamente.
 *
 * @param adminId - ID do admin que executou a ação
 * @param adminName - Nome do admin
 * @param action - Tipo da ação (ex: 'driver.create')
 * @param description - Descrição legível em PT-BR
 * @param metadata - Dados adicionais (opcional)
 */
export function logAudit(
    adminId: string,
    adminName: string,
    action: AuditAction,
    description: string,
    metadata?: Record<string, unknown>,
): void {
    const entry: Omit<AuditEntry, 'id'> = {
        adminId,
        adminName,
        action,
        description,
        metadata,
        timestamp: formatBrazilTimestamp(),
    };

    // Fire-and-forget — não bloqueia operação principal
    aether.db.collection(COLLECTIONS.AUDIT_LOG).create(entry as any)
        .catch((err: unknown) => {
            console.warn('[AuditLog] Falha ao registrar audit:', err);
        });
}
