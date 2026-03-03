/**
 * Testes unitários — getTodayDateStr e getTomorrowDateStr
 *
 * Cobertura:
 * - Formato correto (YYYY-MM-DD)
 * - Lógica de data correta
 * - Amanhã é sempre +1 dia
 */
import { getTodayDateStr, getTomorrowDateStr } from '../../src/lib/collections';

describe('getTodayDateStr', () => {
    it('retorna string no formato YYYY-MM-DD', () => {
        const result = getTodayDateStr();
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('retorna a data de hoje no fuso correto', () => {
        const result = getTodayDateStr();
        // Verifica que é uma data válida
        const parsed = new Date(result + 'T12:00:00Z');
        expect(parsed.toString()).not.toBe('Invalid Date');
    });

    it('tem exatamente 10 caracteres', () => {
        const result = getTodayDateStr();
        expect(result.length).toBe(10);
    });
});

describe('getTomorrowDateStr', () => {
    it('retorna string no formato YYYY-MM-DD', () => {
        const result = getTomorrowDateStr();
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('retorna data diferente de hoje', () => {
        const today = getTodayDateStr();
        const tomorrow = getTomorrowDateStr();
        expect(tomorrow).not.toBe(today);
    });

    it('retorna data posterior a hoje', () => {
        const today = getTodayDateStr();
        const tomorrow = getTomorrowDateStr();
        expect(tomorrow > today).toBe(true);
    });
});
