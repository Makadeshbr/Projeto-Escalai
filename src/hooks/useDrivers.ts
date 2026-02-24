import { useState, useEffect, useCallback } from 'react';
import { aetherFetchAll } from '~/src/lib/aether';
import { COLLECTIONS } from '~/src/lib/collections';

/**
 * Dados de um usuário administrativo retornado pelo Aether Auth.
 * [AUDIT FIX — CLEAN-002] Interface concreta substitui `Record<string, any>`.
 */
export interface AdminUser {
    /** ID único do usuário no Aether */
    id: string;
    /** E-mail de login */
    email: string;
    /** Nome de exibição */
    name: string | null;
    /** Telefone de contato */
    phone: string | null;
    /** URL do avatar */
    avatarUrl: string | null;
    /** Role no sistema (admin, driver, etc.) */
    role: string;
    /** Metadados extras do perfil */
    metadata: Record<string, unknown>;
    /** Status da conta */
    status: 'active' | 'inactive' | 'suspended';
    /** Se o e-mail foi verificado */
    emailVerified: boolean;
    /** Data de criação da conta (ISO 8601) */
    createdAt: string;
    /** Data da última atualização (ISO 8601 ou null) */
    updatedAt: string | null;
    /** Data do último login (ISO 8601 ou null) */
    lastLoginAt: string | null;
}

/**
 * Hook que busca a lista de motoristas cadastrados no DRIVER_STATUS.
 * Normaliza dados do Aether para suportar tanto formato flat quanto _payload.
 *
 * @returns Lista de motoristas, estado de carregamento e função de refresh
 */
export function useDrivers() {
    const [drivers, setDrivers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);

    /** Busca e normaliza todos os registros de motoristas */
    const fetchDrivers = useCallback(async () => {
        setLoading(true);
        try {
            const data = await aetherFetchAll(COLLECTIONS.DRIVER_STATUS);
            if (data) {
                const mapped: AdminUser[] = data.map((d) => {
                    const payload = (d._payload as Record<string, unknown>) || d;
                    return {
                        id: (d.id as string) || '',
                        email: (payload.email as string) || '',
                        name: (payload.driverName as string) || (payload.name as string) || null,
                        phone: (payload.phone as string) || null,
                        avatarUrl: (payload.avatarUrl as string) || null,
                        role: (payload.role as string) || 'driver',
                        metadata: (payload.metadata as Record<string, unknown>) || {},
                        status: ((payload.status as string) || 'active') as 'active' | 'inactive' | 'suspended',
                        emailVerified: (payload.emailVerified as boolean) || false,
                        createdAt: (payload.createdAt as string) || '',
                        updatedAt: (payload.updatedAt as string) || null,
                        lastLoginAt: (payload.lastLoginAt as string) || null,
                    };
                });
                setDrivers(mapped);
            }
        } catch (error) {
            console.error('[useDrivers] Falha ao buscar motoristas:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDrivers();
    }, [fetchDrivers]);

    return { drivers, loading, refetch: fetchDrivers };
}
