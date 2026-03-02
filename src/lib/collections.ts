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

// ---- Helper: wave metadata ----
export const WAVE_META = {
    morning: { label: 'Manhã', time: '06:00 - 11:00' },
} as const;

/**
 * Formata uma data no padrão ISO (YYYY-MM-DD) usando timezone LOCAL.
 * [AUDIT FIX — BP-002] Evita off-by-one causado por `toISOString()` que usa UTC.
 * Exemplo: às 23:30 BRT (GMT-3), `toISOString()` já retorna o dia seguinte.
 * @param date - Objeto Date para formatar
 * @returns String no formato 'YYYY-MM-DD' no timezone local
 */
function formatLocalDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Retorna a data de HOJE no formato 'YYYY-MM-DD' usando timezone local.
 * @returns String no formato 'YYYY-MM-DD'
 */
export function getTodayDateStr(): string {
    return formatLocalDate(new Date());
}

/**
 * Retorna a data de AMANHÃ no formato 'YYYY-MM-DD' usando timezone local.
 * @returns String no formato 'YYYY-MM-DD'
 */
export function getTomorrowDateStr(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return formatLocalDate(d);
}
