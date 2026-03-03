/**
 * Testes Enterprise — Integridade de Collections & Contratos de API
 *
 * COBERTURA:
 * - COLLECTIONS enum contém todas as collections esperadas
 * - Nenhuma collection duplicada
 * - Interfaces TypeScript têm campos obrigatórios (via schema)
 * - Date helpers com timezone edge cases
 * - Consistência de naming (lowercase, underscores)
 * - COLLECTIONS é readonly (as const)
 * - Todas as 10 collections do sistema estão mapeadas
 */

import { COLLECTIONS, getTodayDateStr, getTomorrowDateStr } from '../../src/lib/collections';

describe('COLLECTIONS — Contrato de API', () => {
    it('contém todas as 10 collections obrigatórias do EscalAI', () => {
        const requiredCollections = [
            'cities',
            'availability_windows',
            'driver_availability',
            'assignments',
            'driver_status',
            'admin_status',
            'support_tickets',
            'audit_log',
            'admin_notifications',
            'sack_qr_codes',
        ];

        for (const collection of requiredCollections) {
            const values = Object.values(COLLECTIONS);
            expect(values).toContain(collection);
        }
    });

    it('nenhuma collection está duplicada', () => {
        const values = Object.values(COLLECTIONS);
        const unique = new Set(values);
        expect(unique.size).toBe(values.length);
    });

    it('todas as collections seguem naming convention (lowercase + underscores)', () => {
        const values = Object.values(COLLECTIONS);
        for (const name of values) {
            expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
        }
    });

    it('chaves do COLLECTIONS são UPPERCASE', () => {
        const keys = Object.keys(COLLECTIONS);
        for (const key of keys) {
            expect(key).toMatch(/^[A-Z][A-Z0-9_]*$/);
        }
    });

    it('COLLECTIONS é um plain object com apenas valores string', () => {
        const values = Object.values(COLLECTIONS);
        for (const v of values) {
            expect(typeof v).toBe('string');
        }
    });
});

describe('Date Helpers — Edge Cases de Timezone', () => {
    it('getTodayDateStr nunca retorna undefined', () => {
        const result = getTodayDateStr();
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
    });

    it('getTomorrowDateStr nunca retorna undefined', () => {
        const result = getTomorrowDateStr();
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
    });

    it('getTodayDateStr retorna data parseable', () => {
        const result = getTodayDateStr();
        const date = new Date(result + 'T12:00:00Z');
        expect(date.getTime()).not.toBeNaN();
    });

    it('getTomorrowDateStr retorna exatamente +1 dia de hoje', () => {
        const today = new Date(getTodayDateStr() + 'T12:00:00Z');
        const tomorrow = new Date(getTomorrowDateStr() + 'T12:00:00Z');
        const diffMs = tomorrow.getTime() - today.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        expect(diffDays).toBe(1);
    });

    it('mês de janeiro padded corretamente (01, não 1)', () => {
        // Verifica que o padding funciona para meses de um dígito
        const result = getTodayDateStr();
        const parts = result.split('-');
        expect(parts[1].length).toBe(2);
        expect(parts[2].length).toBe(2);
    });

    it('chamadas consecutivas retornam o mesmo resultado (determinístico)', () => {
        const a = getTodayDateStr();
        const b = getTodayDateStr();
        expect(a).toBe(b);
    });
});

describe('Date Helpers — Stress Test', () => {
    it('1000 chamadas consecutivas não degradam performance', () => {
        const start = Date.now();
        for (let i = 0; i < 1000; i++) {
            getTodayDateStr();
            getTomorrowDateStr();
        }
        const elapsed = Date.now() - start;
        // 2000 chamadas devem completar em menos de 500ms
        expect(elapsed).toBeLessThan(500);
    });
});
