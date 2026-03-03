/**
 * Testes unitários — validatePassword e getPasswordStrength
 *
 * Cobertura:
 * - Senhas curtas, sem maiúscula, sem minúscula, sem número
 * - Senhas válidas (critérios mínimos)
 * - Score de força (0-4) para UI
 */
import { validatePassword, getPasswordStrength } from '../../src/lib/passwordValidation';

describe('validatePassword', () => {
    it('rejeita senha menor que 8 caracteres', () => {
        const result = validatePassword('Ab1');
        expect(result.isValid).toBe(false);
        expect(result.message).toContain('8 caracteres');
    });

    it('rejeita senha sem letra maiúscula', () => {
        const result = validatePassword('abcdefg1');
        expect(result.isValid).toBe(false);
        expect(result.message).toContain('maiúscula');
    });

    it('rejeita senha sem letra minúscula', () => {
        const result = validatePassword('ABCDEFG1');
        expect(result.isValid).toBe(false);
        expect(result.message).toContain('minúscula');
    });

    it('rejeita senha sem número', () => {
        const result = validatePassword('Abcdefgh');
        expect(result.isValid).toBe(false);
        expect(result.message).toContain('número');
    });

    it('aceita senha válida com todos os critérios', () => {
        const result = validatePassword('Abcdefg1');
        expect(result.isValid).toBe(true);
        expect(result.message).toBe('');
    });

    it('aceita senha forte com caracteres especiais', () => {
        const result = validatePassword('Str0ng!P@ss');
        expect(result.isValid).toBe(true);
    });

    it('rejeita string vazia', () => {
        const result = validatePassword('');
        expect(result.isValid).toBe(false);
    });
});

describe('getPasswordStrength', () => {
    it('retorna 0 para senha vazia', () => {
        expect(getPasswordStrength('')).toBe(0);
    });

    it('retorna 1 para senha com 8+ chars', () => {
        expect(getPasswordStrength('aaaaaaaa')).toBe(1);
    });

    it('retorna score mais alto com maiúscula+minúscula+número', () => {
        const score = getPasswordStrength('Abcdefg1');
        expect(score).toBeGreaterThanOrEqual(3);
    });

    it('retorna 4 (máximo) para senha forte com especiais e 12+ chars', () => {
        const score = getPasswordStrength('MyStr0ng!Pass');
        expect(score).toBe(4);
    });

    it('nunca ultrapassa 4', () => {
        const score = getPasswordStrength('MyV3ry$tr0ng&C0mplex!Pass');
        expect(score).toBeLessThanOrEqual(4);
    });
});
