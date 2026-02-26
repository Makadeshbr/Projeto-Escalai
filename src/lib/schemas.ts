import { z } from 'zod/v4';

/**
 * Schemas Zod para validação runtime dos dados vindos da API.
 *
 * Protege contra campos null/undefined/tipo-errado que podem crashar o app.
 * Cada schema usa .catch() para fornecer fallback seguro em vez de throw,
 * garantindo que o app nunca morre por dados malformados do backend.
 */

// ---- Shared helpers ----
const safeString = z.string().catch('');
const safeBoolean = z.boolean().catch(false);

// ---- Assignment ----
export const AssignmentSchema = z.object({
    id: safeString,
    cityId: safeString,
    cityName: safeString,
    wave: z.enum(['morning', 'afternoon', 'night']).catch('morning'),
    waveLabel: safeString,
    waveTime: safeString,
    waveNumber: z.string().optional().catch(undefined),
    dock: safeString,
    routeLabel: z.string().optional().catch(undefined),
    sacas: z.number().optional().catch(undefined),
    isSdd: safeBoolean,
    driverId: safeString,
    driverName: safeString,
    driverPlate: safeString,
    dockStatus: z.enum(['waiting', 'liberated', 'departed']).catch('waiting'),
    status: z.enum(['pending', 'confirmed', 'in_progress', 'completed']).catch('pending'),
    createdByAdminId: safeString,
    createdAt: safeString,
});

// ---- Driver Availability ----
export const DriverAvailabilitySchema = z.object({
    id: safeString,
    driverId: safeString,
    driverName: safeString,
    driverPlate: safeString,
    windowId: safeString,
    targetDate: safeString,
    isAvailable: safeBoolean,
    shifts: z.object({
        morning: safeBoolean,
        afternoon: safeBoolean,
        night: safeBoolean,
    }).catch({ morning: false, afternoon: false, night: false }),
    lockedAt: safeString,
    createdAt: safeString,
});

// ---- Driver Status ----
export const DriverStatusSchema = z.object({
    id: safeString,
    user_id: safeString,
    driverId: z.string().optional().catch(undefined),
    driverName: safeString,
    driverPlate: safeString,
    avatarUrl: z.string().optional().catch(undefined),
    expoPushToken: z.string().optional().catch(undefined),
    status: z.enum(['active', 'blocked', 'deleted']).catch('active'),
    updatedByAdminId: z.string().optional().catch(undefined),
    reason: z.string().optional().catch(undefined),
    createdAt: safeString,
    updatedAt: z.string().optional().catch(undefined),
});

// ---- Batch validation utilities ----

/**
 * Valida um array de dados da API contra um schema Zod.
 * Itens inválidos são silenciosamente descartados (log em __DEV__).
 * Nunca throw — sempre retorna array (pode ser vazio).
 */
export function validateArray<T>(
    data: unknown[],
    schema: z.ZodType<T>,
    collectionName?: string
): T[] {
    const results: T[] = [];
    for (const item of data) {
        // Normaliza: extrai _payload se existir (padrão Aether BaaS)
        const raw = (item as Record<string, unknown>)?._payload || item;
        const parsed = schema.safeParse(raw);
        if (parsed.success) {
            results.push(parsed.data);
        } else if (__DEV__) {
            console.warn(
                `[Schema] Item inválido descartado${collectionName ? ` em ${collectionName}` : ''}:`,
                parsed.error.issues?.[0]?.message || 'unknown'
            );
        }
    }
    return results;
}
