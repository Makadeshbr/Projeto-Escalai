import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';

/**
 * CrashReporter — abstração enterprise para crash reporting.
 *
 * Usa Sentry em produção (quando DSN configurado via env).
 * Mantém fallback local (AsyncStorage) para dev e quando Sentry não está disponível.
 *
 * Segue Dependency Inversion — o app depende da interface, não da implementação.
 */

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';

interface BreadcrumbData {
    category?: string;
    message: string;
    level?: 'debug' | 'info' | 'warning' | 'error';
    data?: Record<string, unknown>;
}

interface CrashContext {
    componentStack?: string;
    [key: string]: unknown;
}

interface CrashEntry {
    timestamp: string;
    message: string;
    stack?: string;
    context?: CrashContext;
}

const CRASH_LOG_KEY = '@escalai_crash_log';
const MAX_STORED_CRASHES = 50;

/**
 * Inicializa o Sentry se o DSN estiver configurado.
 * Deve ser chamada UMA vez no _layout.tsx antes de qualquer render.
 */
export function initCrashReporting(): void {
    if (SENTRY_DSN) {
        Sentry.init({
            dsn: SENTRY_DSN,
            tracesSampleRate: __DEV__ ? 1.0 : 0.2,
            enabled: !__DEV__,
            environment: __DEV__ ? 'development' : 'production',
        });
    }
}

/**
 * Armazena crash no AsyncStorage para análise posterior.
 * Mantém os últimos 50 crashes para não consumir storage infinito.
 */
async function persistCrash(entry: CrashEntry): Promise<void> {
    try {
        const existing = await AsyncStorage.getItem(CRASH_LOG_KEY);
        const crashes: CrashEntry[] = existing ? JSON.parse(existing) : [];
        crashes.unshift(entry);
        if (crashes.length > MAX_STORED_CRASHES) {
            crashes.length = MAX_STORED_CRASHES;
        }
        await AsyncStorage.setItem(CRASH_LOG_KEY, JSON.stringify(crashes));
    } catch {
        // Falha silenciosa — não pode crashar dentro do crash reporter
    }
}

export const crashReporter = {
    /**
     * Captura e loga uma exceção com contexto opcional.
     * Envia para Sentry em produção + persiste localmente.
     */
    captureException(error: Error, context?: CrashContext): void {
        const entry: CrashEntry = {
            timestamp: new Date().toISOString(),
            message: error.message,
            stack: error.stack,
            context,
        };

        // Sentry em produção
        if (SENTRY_DSN) {
            Sentry.captureException(error, {
                extra: context,
            });
        }

        if (__DEV__) {
            console.error('[CrashReporter]', error.message, context || '');
        }

        persistCrash(entry);
    },

    /**
     * Registra breadcrumb para rastreio de navegação/ações.
     */
    addBreadcrumb(breadcrumb: BreadcrumbData): void {
        if (SENTRY_DSN) {
            Sentry.addBreadcrumb({
                category: breadcrumb.category || 'default',
                message: breadcrumb.message,
                level: breadcrumb.level || 'info',
                data: breadcrumb.data,
            });
        }

        if (__DEV__) {
            console.log(`[Breadcrumb] [${breadcrumb.category || 'default'}] ${breadcrumb.message}`);
        }
    },

    /**
     * Define o usuário ativo para contexto de crash.
     */
    setUser(user: { id: string; name?: string; role?: string } | null): void {
        if (SENTRY_DSN) {
            if (user) {
                Sentry.setUser({ id: user.id, username: user.name, segment: user.role });
            } else {
                Sentry.setUser(null);
            }
        }

        if (__DEV__ && user) {
            console.log(`[CrashReporter] User set: ${user.id} (${user.role || 'unknown'})`);
        }
    },

    /**
     * Retorna crashes armazenados localmente.
     * Útil para tela de debug/admin ou export para suporte.
     */
    async getStoredCrashes(): Promise<CrashEntry[]> {
        try {
            const data = await AsyncStorage.getItem(CRASH_LOG_KEY);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    },

    /**
     * Limpa o log de crashes local.
     */
    async clearCrashLog(): Promise<void> {
        await AsyncStorage.removeItem(CRASH_LOG_KEY);
    },
};
