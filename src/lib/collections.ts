// ============================================================
// EscalaiApp — Collection constants & TypeScript interfaces
// ============================================================

export const COLLECTIONS = {
    CITIES: 'cities',
    AVAILABILITY_WINDOWS: 'availability_windows',
    DRIVER_AVAILABILITY: 'driver_availability',
    ASSIGNMENTS: 'assignments',
    DRIVER_STATUS: 'driver_status',
    ADMIN_STATUS: 'admin_status',
    SUPPORT_TICKETS: 'support_tickets',
    AUDIT_LOG: 'audit_log',
    ADMIN_NOTIFICATIONS: 'admin_notifications',
    SACK_QR_CODES: 'sack_qr_codes',
    CHAT_CONVERSATIONS: 'chat_conversations',
    CHAT_MESSAGES: 'chat_messages',
} as const;

// ---- Cities ----
export interface City {
    id: string;
    name: string;
    code: string;
    isActive: boolean;
    createdAt: string;
    updatedAt?: string;
}

// ---- Availability Windows (admin generates) ----
export interface AvailabilityWindow {
    id: string;
    targetDate: string;         // "2026-02-21" (date only, no time)
    createdByAdminId: string;
    isOpen: boolean;
    createdAt: string;
}

// ---- Driver Availability (driver fills, locked after) ----
export interface DriverAvailability {
    id: string;
    driverId: string;
    driverName: string;
    driverPlate: string;
    windowId: string;
    targetDate: string;         // "2026-02-21"
    isAvailable: boolean;
    shifts: {
        morning: boolean;
    };
    lockedAt: string;
    createdAt: string;
    respondedAt?: string;       // [ENTERPRISE] Timestamp BRT de quando o motorista clicou "Confirmar"
}

// ---- Assignments (admin dispatches) ----
export interface Assignment {
    id: string;
    cityId: string;
    cityName: string;
    wave: 'morning';
    waveLabel: string;          // "Manhã"
    waveTime: string;           // "06:00 - 11:00"
    waveNumber?: string;        // "Onda 1", "Onda 2"
    dock: string;               // Número da Doca (ex: "1", "10", "30") — NUMÉRICO
    routeLabel?: string;        // Código da Rota (ex: "B5_AM", "SP_01") — ALFANUMÉRICO
    sacas?: number;             // Quantidade de Sacas Atribuídas à Corrida
    isSdd: boolean;
    driverId: string;
    driverName: string;
    driverPlate: string;
    dockStatus: 'waiting' | 'liberated' | 'departed'; // Ciclo: waiting → liberated (admin) → departed (motorista saiu)
    status: 'pending' | 'confirmed' | 'in_progress' | 'completed';
    driverDidReadNotification?: boolean; // Tracking de leitura (UX do Sino pulsante)
    createdByAdminId: string;
    createdAt: string;
    archived?: boolean; // Tracking de soft-delete longo
}

// ---- Driver Status (block/delete by admin) ----
export interface DriverStatus {
    id: string;
    user_id: string;  // Primary identifier (matches tenant_users.id)
    driverId?: string; // Legacy - for backwards compatibility
    driverName: string;
    driverPlate: string;
    avatarUrl?: string; // URL da foto de perfil (sincronizada do tenant auth metadata)
    expoPushToken?: string;
    status: 'active' | 'blocked' | 'deleted';
    updatedByAdminId?: string;
    reason?: string;
    createdAt: string;
    updatedAt?: string;
    _payload?: {
        driverName?: string;
        driverPlate?: string;
        expoPushToken?: string;
        status?: string;
        updatedByAdminId?: string;
    };
}

// ---- Admin Status (push token storage for admin users) ----
export interface AdminStatus {
    id: string;
    user_id: string;
    adminName: string;
    expoPushToken: string;
    createdAt: string;
    updatedAt?: string;
}

// ---- Support Tickets (motorista → admin) ----
export interface SupportTicket {
    id: string;
    driverId: string;
    driverName: string;
    driverPlate: string;
    assignmentId?: string;
    type: 'problem' | 'suggestion' | 'question';
    message: string;
    status: 'open' | 'in_progress' | 'resolved';
    createdAt: string;
    resolvedAt?: string;
    resolvedByAdminId?: string;
}

// ---- Admin Notifications (Persistent in-app notifications for admins) ----
export interface AdminNotification {
    id: string;
    title: string;
    message: string;
    type: 'availability_answered' | 'route_confirmed' | 'route_completed' | 'ticket_created' | 'system_alert' | 'info';
    read: boolean;
    relatedDriverId?: string;
    relatedAssignmentId?: string;
    createdAt: string;
}

// ---- Sack QR Codes (admin uploads, motorista consulta) ----
export interface SackQRCode {
    id: string;
    label: string;              // Nome identificador (ex: "Saca 001 - Lote A")
    storageFileId: string;      // ID do arquivo no Aether Storage (para delete)
    downloadUrl: string;        // URL pública S3 (para exibir no Image)
    fileName: string;           // Nome original do arquivo enviado
    mimeType: string;           // "image/png" | "image/jpeg" | "application/pdf"
    fileSize: number;           // Tamanho em bytes
    uploadedByAdminId: string;  // ID do admin que fez o upload
    createdAt: string;
    archived?: boolean;         // Soft-delete (nunca remove fisicamente para auditabilidade)
}

// ---- Chat Conversations (1 per driver, shared by all admins) ----
export interface ChatConversation {
    id: string;
    driverId: string;
    driverName: string;
    driverPlate: string;
    driverAvatarUrl?: string;
    lastMessageText: string;
    lastMessageSender: 'driver' | 'admin';
    lastMessageAt: string;
    unreadCountAdmin: number;
    unreadCountDriver: number;
    createdAt: string;
}

// ---- Chat Messages ----
export type ChatMessageType = 'text' | 'quick_reply' | 'broadcast' | 'assignment_link';

export interface ChatMessage {
    id: string;
    conversationId: string;
    senderId: string;
    senderName: string;
    senderRole: 'driver' | 'admin';
    text: string;
    type: ChatMessageType;
    metadata?: {
        assignmentId?: string;
        assignmentLabel?: string;
        broadcastId?: string;
        quickReplyKey?: string;
    };
    readBy: string[];
    createdAt: string;
}

// ---- Helper: wave metadata ----
export const WAVE_META = {
    morning: { label: 'Manhã', time: '06:00 - 11:00' },
} as const;

// ============================================================
// [ENTERPRISE] Utilitários de Timezone — America/Sao_Paulo
// ============================================================
// Regra: TODAS as datas e horários do Escalai devem respeitar
// o fuso horário do Brasil (BRT/BRST), independente do timezone
// configurado no celular do motorista.
// ============================================================

/**
 * Retorna a data/hora ATUAL no fuso horário de São Paulo (America/Sao_Paulo).
 * Usa Intl.DateTimeFormat para converter UTC → BRT de forma confiável,
 * sem depender do timezone do dispositivo do motorista.
 * @returns Objeto Date representando o momento atual em BRT
 */
export function getBrazilNow(): Date {
    const now = new Date();
    // Intl.DateTimeFormat com timeZone força a conversão para BRT/BRST
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const get = (type: string) => parts.find(p => p.type === type)?.value || '0';
    return new Date(
        parseInt(get('year')),
        parseInt(get('month')) - 1,
        parseInt(get('day')),
        parseInt(get('hour')),
        parseInt(get('minute')),
        parseInt(get('second'))
    );
}

/**
 * Gera um timestamp ISO legível em BRT para persistência no banco.
 * Formato: "2026-03-03T20:35:00-03:00"
 * @returns String ISO com offset fixo de BRT (-03:00)
 */
export function formatBrazilTimestamp(): string {
    const brt = getBrazilNow();
    const year = brt.getFullYear();
    const month = String(brt.getMonth() + 1).padStart(2, '0');
    const day = String(brt.getDate()).padStart(2, '0');
    const hours = String(brt.getHours()).padStart(2, '0');
    const minutes = String(brt.getMinutes()).padStart(2, '0');
    const seconds = String(brt.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-03:00`;
}

/**
 * Formata um timestamp (ISO ou qualquer formato parseable) para exibição legível em BRT.
 * Exemplo: "14:32" ou "14:32 - 03/03"
 * @param isoTimestamp - String de timestamp para converter
 * @param includeDate - Se true, inclui a data no formato dd/mm
 * @returns String formatada para exibição no App (ex: "14:32")
 */
export function formatBrazilTime(isoTimestamp: string, includeDate = false): string {
    try {
        const date = new Date(isoTimestamp);
        if (isNaN(date.getTime())) return '--:--';
        const formatter = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit',
            minute: '2-digit',
            ...(includeDate ? { day: '2-digit', month: '2-digit' } : {}),
            hour12: false,
        });
        return formatter.format(date);
    } catch {
        return '--:--';
    }
}

// ============================================================
// [ENTERPRISE] Sistema de Deadline Automático
// ============================================================
// Regra de Negócio Fixa:
//   • Segunda a Sábado → Horário limite: 18:00 BRT
//   • Domingo           → Horário limite: 12:00 BRT
// ============================================================

/** Mapeamento do dia da semana para o horário limite de resposta (0=Dom, 6=Sáb) */
const DEADLINE_HOURS: Record<number, number> = {
    0: 12, // Domingo: 12:00
    1: 18, // Segunda: 18:00
    2: 18, // Terça: 18:00
    3: 18, // Quarta: 18:00
    4: 18, // Quinta: 18:00
    5: 18, // Sexta: 18:00
    6: 18, // Sábado: 18:00
};

/**
 * Retorna o horário limite (Date em BRT) para responder a disponibilidade de uma data-alvo.
 * O deadline é no PRÓPRIO dia em que a janela pede resposta (dia corrente),
 * baseado no dia da semana ATUAL (quando o motorista está respondendo).
 * @param _targetDate - Data alvo da janela (formato YYYY-MM-DD). Parâmetro reservado para futura granularidade.
 * @returns Objeto Date representando o deadline em BRT
 */
export function getDeadlineForDate(_targetDate: string): Date {
    const brazilNow = getBrazilNow();
    const dayOfWeek = brazilNow.getDay(); // 0=Dom, 6=Sáb
    const deadlineHour = DEADLINE_HOURS[dayOfWeek] ?? 18;
    const deadline = new Date(
        brazilNow.getFullYear(),
        brazilNow.getMonth(),
        brazilNow.getDate(),
        deadlineHour, 0, 0, 0
    );
    return deadline;
}

/**
 * Verifica se o prazo para responder a disponibilidade já expirou.
 * Compara o horário atual em BRT com o deadline do dia.
 * @param targetDate - Data alvo da janela (formato YYYY-MM-DD)
 * @returns true se o prazo expirou, false se ainda pode responder
 */
export function isDeadlinePassed(targetDate: string): boolean {
    const brazilNow = getBrazilNow();
    const deadline = getDeadlineForDate(targetDate);
    return brazilNow >= deadline;
}

/**
 * Calcula quantos milissegundos faltam para o deadline expirar.
 * Retorna 0 se já expirou. Usado para o countdown timer no formulário.
 * @param targetDate - Data alvo da janela (formato YYYY-MM-DD)
 * @returns Milissegundos restantes (0 se expirado)
 */
export function getTimeRemainingMs(targetDate: string): number {
    const brazilNow = getBrazilNow();
    const deadline = getDeadlineForDate(targetDate);
    const diff = deadline.getTime() - brazilNow.getTime();
    return Math.max(0, diff);
}

/**
 * Formata uma data no padrão ISO (YYYY-MM-DD) usando timezone de São Paulo.
 * [ENTERPRISE FIX] Usa getBrazilNow() em vez de timezone local do dispositivo.
 * @param date - Objeto Date para formatar (opcional, usa BRT agora se omitido)
 * @returns String no formato 'YYYY-MM-DD' em BRT
 */
function formatLocalDate(date?: Date): string {
    const d = date || getBrazilNow();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Retorna a data de HOJE no formato 'YYYY-MM-DD' usando timezone de São Paulo.
 * @returns String no formato 'YYYY-MM-DD'
 */
export function getTodayDateStr(): string {
    return formatLocalDate(getBrazilNow());
}

/**
 * Retorna a data de AMANHÃ no formato 'YYYY-MM-DD' usando timezone de São Paulo.
 * @returns String no formato 'YYYY-MM-DD'
 */
export function getTomorrowDateStr(): string {
    const d = getBrazilNow();
    d.setDate(d.getDate() + 1);
    return formatLocalDate(d);
}

/**
 * [ENTERPRISE FIX] Extrai a data (YYYY-MM-DD) de uma string ISO
 * respeitando o Fuso Horário do Brasil, independente de em qual fuso o app esteja rodando.
 * Garante que rotas do dia anterior não vazem para hoje por causa do fuso do celular UTC/local.
 * @param isoTimestamp - String de timestamp ISO
 * @returns String no formato 'YYYY-MM-DD' alinhado ao Brasil
 */
export function extractBrazilDateStr(isoTimestamp: string): string {
    if (!isoTimestamp) return '';
    
    // Fast path: se foi gerado pelo formatBrazilTimestamp do backend (termina em -03:00)
    // o começo YYYY-MM-DD já está correto no Brasil.
    if (isoTimestamp.length >= 10 && isoTimestamp.includes('T') && isoTimestamp.includes('-03:00')) {
         return isoTimestamp.substring(0, 10);
    }

    try {
        const date = new Date(isoTimestamp);
        if (isNaN(date.getTime())) return '';
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
        const parts = formatter.formatToParts(date);
        const get = (type: string) => parts.find(p => p.type === type)?.value || '0';
        return `${get('year')}-${get('month')}-${get('day')}`;
    } catch {
        return '';
    }
}
