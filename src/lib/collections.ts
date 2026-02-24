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
        afternoon: boolean;
        night: boolean;
    };
    lockedAt: string;
    createdAt: string;
}

// ---- Assignments (admin dispatches) ----
export interface Assignment {
    id: string;
    cityId: string;
    cityName: string;
    wave: 'morning' | 'afternoon' | 'night';
    waveLabel: string;          // "Manhã", "Tarde", "Noite"
    waveTime: string;           // "06:00 - 11:00"
    waveNumber?: string;        // "Onda 1", "Onda 2"
    dock: string;               // Número da Doca (ex: "1", "10", "30") — NUMÉRICO
    routeLabel?: string;        // Código da Rota (ex: "B5_AM", "SP_01") — ALFANUMÉRICO
    isSdd: boolean;
    driverId: string;
    driverName: string;
    driverPlate: string;
    dockStatus: 'waiting' | 'liberated' | 'departed'; // Ciclo: waiting → liberated (admin) → departed (motorista saiu)
    status: 'pending' | 'confirmed' | 'in_progress' | 'completed';
    createdByAdminId: string;
    createdAt: string;
}

// ---- Driver Status (block/delete by admin) ----
export interface DriverStatus {
    id: string;
    user_id: string;  // Primary identifier (matches tenant_users.id)
    driverId?: string; // Legacy - for backwards compatibility
    driverName: string;
    driverPlate: string;
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

// ---- Helper: wave metadata ----
export const WAVE_META = {
    morning: { label: 'Manhã', time: '06:00 - 11:00' },
    afternoon: { label: 'Tarde', time: '12:00 - 17:00' },
    night: { label: 'Noite', time: '18:00 - 23:00' },
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
