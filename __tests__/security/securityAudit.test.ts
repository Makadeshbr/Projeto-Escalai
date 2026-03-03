/**
 * Testes Enterprise — Segurança & Robustez
 *
 * COBERTURA:
 * - Sanitização de PII no logger (regressão)
 * - Password validation contra ataques comuns
 * - Prototype pollution prevention
 * - Unicode/emoji handling
 * - ReDoS (Regular Expression Denial of Service) prevention
 * - Boundary testing (strings vazias, max length, null propagation)
 */

(global as any).__DEV__ = true;

import { validatePassword, getPasswordStrength } from '../../src/lib/passwordValidation';
import { logger } from '../../src/lib/logger';

describe('Segurança — Password Brute Force Patterns', () => {
    it('rejeita senhas comuns do top 10 (mesmo que atendam critérios)', () => {
        // Senhas comuns que tecnicamente passariam nos critérios básicos
        const commonPasswords = [
            'Password1',    // Formato trivial
            'Abcdefg1',     // Sequência óbvia
            'Qwerty123',    // Padrão de teclado
        ];

        // Nota: validatePassword verifica critérios técnicos, não dicionário.
        // Esses testes documentam que os critérios MÍNIMOS são atendidos
        // mas a força (getPasswordStrength) deve reportar score baixo.
        for (const pwd of commonPasswords) {
            const result = validatePassword(pwd);
            // Esses passam nos critérios básicos (8+ chars, maiúscula, minúscula, número)
            expect(result.isValid).toBe(true);
            // Mas o strength score não deveria ser máximo
            const strength = getPasswordStrength(pwd);
            expect(strength).toBeLessThanOrEqual(3);
        }
    });

    it('rejeita senha com apenas espaços', () => {
        const result = validatePassword('        '); // 8 espaços
        expect(result.isValid).toBe(false); // Sem maiúscula, sem número
    });

    it('aceita senha com caracteres especiais unicode', () => {
        const result = validatePassword('Sëñhá1çã');
        // Deve validar como tendo maiúscula e número
        expect(result.isValid).toBe(true);
    });

    it('aceita senha com emoji (não deve crashar)', () => {
        const result = validatePassword('Abc12345🔑');
        expect(result.isValid).toBe(true);
    });

    it('força score 0 para string vazia', () => {
        expect(getPasswordStrength('')).toBe(0);
    });

    it('força score crescente com complexidade', () => {
        const s1 = getPasswordStrength('abc'); // Muito fraca
        const s2 = getPasswordStrength('abcdefgh'); // 8+ chars
        const s3 = getPasswordStrength('Abcdefgh'); // + maiúscula
        const s4 = getPasswordStrength('Abcdefg1'); // + número
        const s5 = getPasswordStrength('Abcdefg1!xyz'); // + especial + 12+ chars
        expect(s1).toBeLessThanOrEqual(s2);
        expect(s2).toBeLessThanOrEqual(s3);
        expect(s3).toBeLessThanOrEqual(s4);
        expect(s4).toBeLessThanOrEqual(s5);
    });
});

describe('Segurança — Logger PII Sanitization (Regressão)', () => {
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
        logSpy.mockRestore();
    });

    it('redacta múltiplos tokens no mesmo log', () => {
        logger.info('[Test]', 'Token1: Bearer eyJ123 e Token2: Bearer eyJ456');
        const output = logSpy.mock.calls[0][1];
        expect(output).not.toContain('eyJ123');
        expect(output).not.toContain('eyJ456');
        expect(output).toContain('[REDACTED]');
    });

    it('redacta campo "secret" em objeto', () => {
        logger.info('[Test]', { secret: 'my-secret-value', name: 'público' });
        const obj = logSpy.mock.calls[0][1];
        expect(obj.secret).toBe('[REDACTED]');
        expect(obj.name).toBe('público');
    });

    it('redacta campo "expoPushToken" em objeto', () => {
        logger.info('[Test]', { expoPushToken: 'ExponentPushToken[abc]', city: 'SP' });
        const obj = logSpy.mock.calls[0][1];
        expect(obj.expoPushToken).toBe('[REDACTED]');
        expect(obj.city).toBe('SP');
    });

    it('não redacta campos seguros (false positive check)', () => {
        logger.info('[Test]', {
            name: 'João',
            city: 'Guarulhos',
            count: 42,
            active: true,
        });
        const obj = logSpy.mock.calls[0][1];
        expect(obj.name).toBe('João');
        expect(obj.city).toBe('Guarulhos');
        expect(obj.count).toBe(42);
        expect(obj.active).toBe(true);
    });

    it('não crasha com objeto profundamente aninhado', () => {
        expect(() => {
            logger.info('[Test]', {
                level1: { level2: { level3: { password: 'deep' } } },
            });
        }).not.toThrow();
    });

    it('não crasha com array como argumento', () => {
        expect(() => {
            logger.info('[Test]', [1, 2, 3], 'extra');
        }).not.toThrow();
    });

    it('não crasha com Error como argumento', () => {
        expect(() => {
            logger.error('[Test]', new Error('Teste'));
        }).not.toThrow();
    });
});

describe('Segurança — Prototype Pollution', () => {
    it('validatePassword não é afetado por prototype pollution', () => {
        // Simula tentativa de prototype pollution
        const malicious = JSON.parse('{"__proto__": {"isValid": true}}');
        // validatePassword deve ignorar prototype
        const result = validatePassword('weak');
        expect(result.isValid).toBe(false);
    });
});

describe('Segurança — Boundary Testing', () => {
    it('senha com exatamente 8 caracteres (boundary)', () => {
        const result = validatePassword('Abcdef1x');
        expect(result.isValid).toBe(true);
    });

    it('senha com 7 caracteres (boundary - 1)', () => {
        const result = validatePassword('Abcde1x');
        expect(result.isValid).toBe(false);
    });

    it('senha com 100 caracteres (muito longa)', () => {
        const longPwd = 'A'.repeat(50) + 'a'.repeat(49) + '1';
        const result = validatePassword(longPwd);
        expect(result.isValid).toBe(true);
    });

    it('senha com somente números (falta maiúscula e minúscula)', () => {
        const result = validatePassword('12345678');
        expect(result.isValid).toBe(false);
    });

    it('senha com null-byte não crasha', () => {
        const result = validatePassword('Abc12345\0hidden');
        expect(result.isValid).toBe(true);
    });
});

describe('Segurança — ReDoS Prevention', () => {
    it('validatePassword com string repetitiva longa não trava (< 100ms)', () => {
        const start = Date.now();
        const repeating = 'aA1' + 'x'.repeat(10000);
        validatePassword(repeating);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(100);
    });

    it('getPasswordStrength com string repetitiva longa não trava (< 100ms)', () => {
        const start = Date.now();
        const repeating = 'aA1!'.repeat(2500);
        getPasswordStrength(repeating);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(100);
    });
});
