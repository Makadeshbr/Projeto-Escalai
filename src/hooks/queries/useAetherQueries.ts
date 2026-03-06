import { useQuery } from '@tanstack/react-query';
import { aether, aetherFetchAll } from '~/src/lib/aether';
import { COLLECTIONS } from '~/src/lib/collections';
import { validateArray, AssignmentSchema, DriverAvailabilitySchema } from '~/src/lib/schemas';
import type { Assignment, DriverAvailability, City } from '~/src/lib/collections';

/**
 * Query keys centralizados — garante invalidação correta do cache.
 * Convencao: [entidade, ...filtros]
 */
export const queryKeys = {
    assignments: ['assignments'] as const,
    driverAvailability: ['driver_availability'] as const,
    driverStatus: ['driver_status'] as const,
    cities: ['cities'] as const,
    adminStatus: ['admin_status'] as const,
};

/**
 * Busca TODOS os assignments com cache e retry automático.
 * staleTime default: 30s (configurado no QueryClient).
 * Aplica Zod validation para garantir type safety.
 *
 * @param options.refetchInterval - Polling interval em ms (default: undefined = sem polling)
 * @param options.enabled - Se false, não faz fetch (útil para condicionais)
 */
export function useAssignmentsQuery(options?: {
    refetchInterval?: number;
    enabled?: boolean;
}) {
    return useQuery({
        queryKey: queryKeys.assignments,
        queryFn: async () => {
            const raw = await aetherFetchAll(COLLECTIONS.ASSIGNMENTS);
            return validateArray(raw, AssignmentSchema, 'assignments') as Assignment[];
        },
        refetchInterval: options?.refetchInterval,
        enabled: options?.enabled,
        staleTime: 0, // Nunca confia no cache pra rotas do motorista - sempre garante que pega do DB
        gcTime: 1000 * 60 * 5, // Limpa o lixo após 5 minutos
    });
}

/**
 * Busca TODAS as disponibilidades de motoristas.
 * Usa cache inteligente — evita re-fetch se dados < 30s.
 */
export function useDriverAvailabilityQuery(options?: {
    refetchInterval?: number;
    enabled?: boolean;
}) {
    return useQuery({
        queryKey: queryKeys.driverAvailability,
        queryFn: async () => {
            const raw = await aetherFetchAll(COLLECTIONS.DRIVER_AVAILABILITY);
            return validateArray(raw, DriverAvailabilitySchema, 'driver_availability') as DriverAvailability[];
        },
        refetchInterval: options?.refetchInterval,
        enabled: options?.enabled,
    });
}

/**
 * Busca TODOS os driver_status (tokens, avatares, etc.).
 */
export function useDriverStatusQuery(options?: {
    enabled?: boolean;
}) {
    return useQuery({
        queryKey: queryKeys.driverStatus,
        queryFn: async () => {
            return await aetherFetchAll(COLLECTIONS.DRIVER_STATUS);
        },
        enabled: options?.enabled,
    });
}

/**
 * Busca todas as cidades cadastradas.
 * Não usa aetherFetchAll (poucas cidades, sem paginação necessária).
 */
export function useCitiesQuery(options?: {
    enabled?: boolean;
}) {
    return useQuery({
        queryKey: queryKeys.cities,
        queryFn: async () => {
            const data = await aether.db.collection(COLLECTIONS.CITIES).list();
            return (data as unknown as City[]) || [];
        },
        enabled: options?.enabled,
    });
}
