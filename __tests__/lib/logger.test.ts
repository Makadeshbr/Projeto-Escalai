/**
 * Testes unitários — Logger (sanitização de PII)
 *
 * Cobertura:
 * - Sanitização de tokens JWT
 * - Sanitização de campos sensíveis em objetos
 * - Log levels (debug, info, warn, error)
 * - Campos não-sensíveis permanecem intactos
 */

// Mock __DEV__ como true para ativar logging nos testes
(global as any).__DEV__ = true;

// Importa helper interno — testamos a sanitização diretamente
// Como 'sanitize' é interna, testamos via logger calls + spy no console
import { logger } from '../../src/lib/logger';

describe('logger.sanitize (via output)', () => {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    let logSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, 'log').mockImplementation();
        warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        errorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
        logSpy.mockRestore();
        warnSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it('redacta tokens JWT em strings', () => {
        logger.info('[Test]', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig');
        expect(logSpy).toHaveBeenCalledWith('[Test]', 'Bearer [REDACTED]');
    });

    it('redacta campos sensíveis em objetos (token, password, secret, apikey)', () => {
        logger.info('[Test]', { name: 'João', password: '12345', token: 'abc123' });
        const loggedObj = logSpy.mock.calls[0][1];
        expect(loggedObj.name).toBe('João');
        expect(loggedObj.password).toBe('[REDACTED]');
        expect(loggedObj.token).toBe('[REDACTED]');
    });

    it('mantém campos não-sensíveis intactos', () => {
        logger.info('[Test]', { city: 'São Paulo', count: 42 });
        const loggedObj = logSpy.mock.calls[0][1];
        expect(loggedObj.city).toBe('São Paulo');
        expect(loggedObj.count).toBe(42);
    });

    it('logger.debug usa console.log', () => {
        logger.debug('[Test]', 'debug msg');
        expect(logSpy).toHaveBeenCalled();
    });

    it('logger.warn usa console.warn', () => {
        logger.warn('[Test]', 'warning msg');
        expect(warnSpy).toHaveBeenCalled();
    });

    it('logger.error usa console.error', () => {
        logger.error('[Test]', 'error msg');
        expect(errorSpy).toHaveBeenCalled();
    });

    it('redacta campo apiKey em objeto aninhado', () => {
        logger.info('[Test]', { config: 'normal', apiKey: 'sk-123456' });
        const loggedObj = logSpy.mock.calls[0][1];
        expect(loggedObj.apiKey).toBe('[REDACTED]');
        expect(loggedObj.config).toBe('normal');
    });
});
