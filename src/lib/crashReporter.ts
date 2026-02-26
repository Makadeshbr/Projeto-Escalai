import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * CrashReporter — abstração enterprise para crash reporting.
 *
 * Atualmente implementa logging local (console + AsyncStorage).
 * Pronto para swap direto com Sentry quando houver DSN configurado:
 *
 *   import * as Sentry from '@sentry/react-native';
 *   Sentry.init({ dsn: 'https://...' });
 *   // Substituir captureException por Sentry.captureException, etc.
 *
 * Segue Dependency Inversion — o app depende da interface, não da implementação.
 */

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
     * Equivalente a Sentry.captureException().
     */
    captureException(error: Error, context?: CrashContext): void {
        const entry: CrashEntry = {
            timestamp: new Date().toISOString(),
            message: error.message,
            stack: error.stack,
            context,
        };

        console.error('[CrashReporter]', error.message, context || '');
        persistCrash(entry);
    },

    /**
     * Registra breadcrumb para rastreio de navegação/ações.
     * Equivalente a Sentry.addBreadcrumb().
     */
    addBreadcrumb(breadcrumb: BreadcrumbData): void {
        if (__DEV__) {
            console.log(`[Breadcrumb] [${breadcrumb.category || 'default'}] ${breadcrumb.message}`);
        }
    },

    /**
     * Define o usuário ativo para contexto de crash.
     * Equivalente a Sentry.setUser().
     */
    setUser(user: { id: string; name?: string; role?: string } | null): void {
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
