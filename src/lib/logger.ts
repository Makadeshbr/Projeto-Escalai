/**
 * Logger centralizado — substitui console.log/warn/error espalhados pelo app.
 *
 * Em __DEV__: loga no console normalmente.
 * Em produção: silencia tudo (ou encaminha para Sentry quando integrado).
 *
 * Uso:
 *   import { logger } from '~/src/lib/logger';
 *   logger.info('[Dashboard]', 'Dados carregados', { count: 10 });
 *   logger.warn('[Auth]', 'Token próximo de expirar');
 *   logger.error('[Push]', 'Falha ao enviar notificação', error);
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

/** Nível mínimo: debug em dev, error em prod (só erros críticos escapam) */
const MIN_LEVEL: LogLevel = __DEV__ ? 'debug' : 'error';

function shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];
}

/**
 * Sanitiza dados sensíveis antes de logar.
 * Remove tokens, senhas, e-mails parciais.
 */
function sanitize(args: unknown[]): unknown[] {
    return args.map((arg) => {
        if (typeof arg === 'string') {
            // Mascara tokens JWT (Bearer xxx...xxx → Bearer ***...***)
            return arg.replace(/Bearer\s+[\w\-.]+/gi, 'Bearer [REDACTED]');
        }
        if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
            const obj = arg as Record<string, unknown>;
            const sanitized: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(obj)) {
                const lk = key.toLowerCase();
                if (lk.includes('token') || lk.includes('password') || lk.includes('secret') || lk.includes('apikey')) {
                    sanitized[key] = '[REDACTED]';
                } else {
                    sanitized[key] = value;
                }
            }
            return sanitized;
        }
        return arg;
    });
}

export const logger = {
    debug(tag: string, ...args: unknown[]): void {
        if (shouldLog('debug')) {
            console.log(tag, ...sanitize(args));
        }
    },

    info(tag: string, ...args: unknown[]): void {
        if (shouldLog('info')) {
            console.log(tag, ...sanitize(args));
        }
    },

    warn(tag: string, ...args: unknown[]): void {
        if (shouldLog('warn')) {
            console.warn(tag, ...sanitize(args));
        }
    },

    error(tag: string, ...args: unknown[]): void {
        if (shouldLog('error')) {
            console.error(tag, ...sanitize(args));
        }
        // TODO: Quando Sentry estiver integrado, encaminhar erros aqui
        // Sentry.captureMessage(tag + ' ' + args.map(String).join(' '), 'error');
    },
};
