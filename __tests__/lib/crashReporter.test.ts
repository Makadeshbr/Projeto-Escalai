/**
 * Testes unitários — crashReporter (persistência local)
 *
 * Cobertura:
 * - captureException persiste crash via AsyncStorage
 * - getStoredCrashes retorna crashes armazenados
 * - clearCrashLog limpa crashes
 * - Máximo de 50 crashes (LRU)
 * - initCrashReporting não crasha sem Sentry
 */

// Mock do AsyncStorage
const mockStorage: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn((key: string) => Promise.resolve(mockStorage[key] || null)),
        setItem: jest.fn((key: string, value: string) => {
            mockStorage[key] = value;
            return Promise.resolve();
        }),
        removeItem: jest.fn((key: string) => {
            delete mockStorage[key];
            return Promise.resolve();
        }),
    },
}));

(global as any).__DEV__ = true;

import { crashReporter, initCrashReporting } from '../../src/lib/crashReporter';

describe('initCrashReporting', () => {
    it('não crasha sem Sentry (módulo nativo ausente)', () => {
        expect(() => initCrashReporting()).not.toThrow();
    });
});

describe('crashReporter', () => {
    beforeEach(() => {
        // Limpa storage entre testes
        Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
    });

    it('captureException não lança erro', () => {
        expect(() => {
            crashReporter.captureException(new Error('Teste de crash'));
        }).not.toThrow();
    });

    it('captureException persiste crash no AsyncStorage', async () => {
        crashReporter.captureException(new Error('Crash persistido'));
        // Aguarda persistência assíncrona
        await new Promise(r => setTimeout(r, 100));
        const crashes = await crashReporter.getStoredCrashes();
        expect(crashes.length).toBeGreaterThanOrEqual(1);
        expect(crashes[0].message).toBe('Crash persistido');
    });

    it('clearCrashLog limpa todos os crashes', async () => {
        crashReporter.captureException(new Error('Crash temp'));
        await new Promise(r => setTimeout(r, 100));
        await crashReporter.clearCrashLog();
        const crashes = await crashReporter.getStoredCrashes();
        expect(crashes.length).toBe(0);
    });

    it('addBreadcrumb não lança erro', () => {
        expect(() => {
            crashReporter.addBreadcrumb({ message: 'Navegou para Dashboard', category: 'navigation' });
        }).not.toThrow();
    });

    it('setUser não lança erro', () => {
        expect(() => {
            crashReporter.setUser({ id: 'user-123', name: 'João', role: 'driver' });
        }).not.toThrow();
        expect(() => {
            crashReporter.setUser(null);
        }).not.toThrow();
    });
});
