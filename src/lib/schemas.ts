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
/** Aceita string OU número e converte para string. Resolve dock numérico vindo do Aether. */
const safeStringOrNumber = z.union([z.string(), z.number().transform(String)]).catch('');
const safeBoolean = z.boolean().catch(false);

// ---- Assignment ----
export const AssignmentSchema = z.object({
    id: safeString,
    cityId: safeString,
    cityName: safeString,
    wave: z.enum(['morning']).catch('morning'),
    waveLabel: safeString,
    waveTime: safeString,
    waveNumber: z.string().optional().catch(undefined),
    dock: safeStringOrNumber,
    routeLabel: z.string().optional().catch(undefined),
    sacas: z.number().optional().catch(undefined),
    isSdd: safeBoolean,
    driverId: safeString,
    driverName: safeString,
    driverPlate: safeString,
    dockStatus: z.enum(['waiting', 'liberated', 'departed']).catch('waiting'),
    status: z.enum(['pending', 'confirmed', 'in_progress', 'completed']).catch('pending'),
    driverDidReadNotification: z.boolean().optional().catch(undefined),
    createdByAdminId: safeString,
    createdAt: safeString,
    archived: z.boolean().optional().catch(undefined),
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
    }).catch({ morning: false }),
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

// ---- Sack QR Codes ----
export const SackQRCodeSchema = z.object({
    id: safeString,
    label: safeString,
    storageFileId: safeString,
    downloadUrl: safeString,
    fileName: safeString,
    mimeType: safeString,
    fileSize: z.number().catch(0),
    uploadedByAdminId: safeString,
    createdAt: safeString,
    archived: z.boolean().optional().catch(undefined),
});

// ---- Chat Conversations ----
export const ChatConversationSchema = z.object({
    id: safeString,
    driverId: safeString,
    driverName: safeString,
    driverPlate: safeString,
    driverAvatarUrl: z.string().optional().catch(undefined),
    lastMessageText: safeString,
    lastMessageSender: z.enum(['driver', 'admin']).catch('driver'),
    lastMessageAt: safeString,
    unreadCountAdmin: z.number().catch(0),
    unreadCountDriver: z.number().catch(0),
    createdAt: safeString,
});

// ---- Chat Messages ----
export const ChatMessageSchema = z.object({
    id: safeString,
    conversationId: safeString,
    senderId: safeString,
    senderName: safeString,
    senderRole: z.enum(['driver', 'admin']).catch('driver'),
    text: safeString,
    type: z.enum(['text', 'quick_reply', 'broadcast', 'assignment_link']).catch('text'),
    metadata: z.object({
        assignmentId: z.string().optional().catch(undefined),
        assignmentLabel: z.string().optional().catch(undefined),
        broadcastId: z.string().optional().catch(undefined),
        quickReplyKey: z.string().optional().catch(undefined),
    }).optional().catch(undefined),
    readBy: z.array(z.string()).catch([]),
    createdAt: safeString,
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
        const record = item as Record<string, unknown>;
        // Normaliza: extrai _payload se existir (padrão Aether BaaS)
        // Preserva `id` do nível superior — _payload pode não contê-lo
        const payload = record?._payload as Record<string, unknown> | undefined;
        const raw = payload
            ? { ...payload, id: payload.id || record.id }
            : record;
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
