/**
 * Testes Enterprise — diagnosePushError (Resiliência de Notificações)
 *
 * COBERTURA:
 * - Cada branch de diagnóstico de erro
 * - Expo Go detection
 * - Erro com mensagem desconhecida
 * - Erro não-Error (string, null, undefined)
 * - Todos os cenários de falha do push
 */

// Mock react-native (evita import ESM que Jest não suporta)
jest.mock('react-native', () => ({
    Platform: { OS: 'android', select: jest.fn() },
}));

// Mock do expo-constants para isExpoGo
jest.mock('expo-constants', () => ({
    __esModule: true,
    default: { executionEnvironment: 'storeClient' },
    ExecutionEnvironment: { StoreClient: 'storeClient', Standalone: 'standalone' },
}));

// Mock do aether (push.ts importa)
jest.mock('../../src/lib/aether', () => ({
    aether: { db: { collection: () => ({ query: () => ({ get: () => Promise.resolve([]) }) }) } },
    aetherFetchAll: jest.fn(() => Promise.resolve([])),
}));

// Mock expo-notifications
jest.mock('expo-notifications', () => null);

(global as any).__DEV__ = true;

import { diagnosePushError } from '../../src/lib/push';

describe('diagnosePushError — Diagnóstico (Expo Go)', () => {
    it('detecta Expo Go e retorna mensagem apropriada', () => {
        // isExpoGo é true quando executionEnvironment === storeClient
        const result = diagnosePushError(new Error('qualquer'));
        expect(result).toContain('Expo Go');
    });
});

// Para testar os branches internos, re-importamos com mock diferente (produção)
describe('diagnosePushError — Cenários de erro (produção)', () => {
    let diagnoseProd: typeof diagnosePushError;

    beforeAll(() => {
        jest.resetModules();
        jest.mock('react-native', () => ({
            Platform: { OS: 'android', select: jest.fn() },
        }));
        jest.mock('expo-constants', () => ({
            __esModule: true,
            default: { executionEnvironment: 'standalone' },
            ExecutionEnvironment: { StoreClient: 'storeClient', Standalone: 'standalone' },
        }));
        jest.mock('../../src/lib/aether', () => ({
            aether: { db: { collection: () => ({ query: () => ({ get: () => Promise.resolve([]) }) }) } },
            aetherFetchAll: jest.fn(() => Promise.resolve([])),
        }));
        jest.mock('expo-notifications', () => null);
        (global as any).__DEV__ = true;
        const pushMod = require('../../src/lib/push');
        diagnoseProd = pushMod.diagnosePushError;
    });

    it('detecta "nenhum motorista encontrado"', () => {
        const result = diagnoseProd(new Error('Nenhum motorista encontrado no sistema'));
        expect(result).toContain('motorista');
    });

    it('detecta "nenhum motorista possui" (token ausente)', () => {
        const result = diagnoseProd(new Error('Nenhum motorista possui token de push'));
        expect(result).toContain('primeiro acesso');
    });

    it('detecta "não ativou as notificações"', () => {
        const result = diagnoseProd(new Error('Motorista não ativou as notificações'));
        expect(result).toContain('ativ');
    });

    it('detecta "driverstatus não encontrado"', () => {
        const result = diagnoseProd(new Error('Erro: driverstatus não encontrado'));
        expect(result).toContain('Motorista não encontrado');
    });

    it('detecta erros de rede (network, fetch, timeout)', () => {
        for (const keyword of ['network error', 'fetch failed', 'timeout exceeded', 'sem rede']) {
            const result = diagnoseProd(new Error(keyword));
            expect(result).toContain('conexão');
        }
    });

    it('detecta "falha em todos os disparos"', () => {
        const result = diagnoseProd(new Error('Falha em todos os disparos de push'));
        expect(result).toContain('Expo Push');
    });

    it('retorna mensagem original para erro desconhecido', () => {
        const result = diagnoseProd(new Error('Erro totalmente novo'));
        expect(result).toBe('Erro totalmente novo');
    });

    it('retorna mensagem genérica para erro não-Error (string)', () => {
        const result = diagnoseProd('string de erro' as any);
        expect(result).toContain('desconhecido');
    });

    it('retorna mensagem genérica para null', () => {
        const result = diagnoseProd(null);
        expect(result).toContain('desconhecido');
    });

    it('retorna mensagem genérica para undefined', () => {
        const result = diagnoseProd(undefined);
        expect(result).toContain('desconhecido');
    });
});
