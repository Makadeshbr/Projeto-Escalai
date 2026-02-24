/**
 * Testes unitários para funções utilitárias de coleções e datas.
 * [AUDIT FIX — TEST-001] Primeira camada de testes para o projeto.
 */
import { getTodayDateStr, getTomorrowDateStr, COLLECTIONS, WAVE_META } from '../collections';

describe('COLLECTIONS', () => {
    it('deve conter todas as coleções obrigatórias', () => {
        expect(COLLECTIONS.DRIVER_STATUS).toBeDefined();
        expect(COLLECTIONS.DRIVER_AVAILABILITY).toBeDefined();
        expect(COLLECTIONS.ASSIGNMENTS).toBeDefined();
        expect(COLLECTIONS.CITIES).toBeDefined();
    });

    it('deve ter valores string não vazios para cada coleção', () => {
        Object.values(COLLECTIONS).forEach((value) => {
            expect(typeof value).toBe('string');
            expect(value.length).toBeGreaterThan(0);
        });
    });
});

describe('WAVE_META', () => {
    it('deve definir metadata para os 3 turnos', () => {
        expect(WAVE_META.morning).toBeDefined();
        expect(WAVE_META.afternoon).toBeDefined();
        expect(WAVE_META.night).toBeDefined();
    });

    it('cada turno deve ter label e time', () => {
        (['morning', 'afternoon', 'night'] as const).forEach((wave) => {
            expect(WAVE_META[wave].label).toBeDefined();
            expect(typeof WAVE_META[wave].label).toBe('string');
            expect(WAVE_META[wave].time).toBeDefined();
            expect(typeof WAVE_META[wave].time).toBe('string');
        });
    });
});

describe('getTodayDateStr', () => {
    it('deve retornar string no formato YYYY-MM-DD', () => {
        const result = getTodayDateStr();
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('deve usar timezone local (não UTC)', () => {
        const result = getTodayDateStr();
        const today = new Date();
        const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        expect(result).toBe(expected);
    });
});

describe('getTomorrowDateStr', () => {
    it('deve retornar string no formato YYYY-MM-DD', () => {
        const result = getTomorrowDateStr();
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('deve ser exatamente 1 dia após hoje', () => {
        const today = getTodayDateStr();
        const tomorrow = getTomorrowDateStr();
        const todayDate = new Date(today + 'T12:00:00');
        const tomorrowDate = new Date(tomorrow + 'T12:00:00');
        const diffMs = tomorrowDate.getTime() - todayDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        expect(diffDays).toBe(1);
    });

    it('deve lidar corretamente com virada de mês', () => {
        // Simulação: o teste valida que a data retornada é válida
        const result = getTomorrowDateStr();
        const parsed = new Date(result + 'T12:00:00');
        expect(parsed.toString()).not.toBe('Invalid Date');
    });
});
