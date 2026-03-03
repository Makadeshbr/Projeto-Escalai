import { useEffect, useRef } from 'react';
import { aether } from '~/src/lib/aether';
import { logger } from '~/src/lib/logger';

/** Configuração do subscribe realtime */
interface RealtimeOptions {
    /** Nome da collection do Aether BaaS para assinar */
    collection: string;
    /** Callback executado quando o dado muda no servidor */
    onEvent: (data: any) => void;
    /** Tempo de debounce em ms (default: 1000ms). Protege contra burst de eventos em batch ops */
    debounceMs?: number;
    /** Tag para logging (ex: '[Dashboard]', '[Monitor]') */
    tag?: string;
    /** Se false, não assina (útil para condicionais). Default: true */
    enabled?: boolean;
}

/**
 * Hook centralizado de subscribe realtime no Aether BaaS.
 *
 * Responsabilidades:
 * - Subscribe WebSocket com try/catch (fallback gracioso)
 * - Debounce configurável para evitar N+1 refetches em batch operations
 * - Cleanup automático (unsubscribe + clearTimeout) no unmount
 * - Logging padronizado via logger
 *
 * Substitui o pattern duplicado em 8+ pontos do app:
 *   try { unsub = aether.db.collection(X).subscribe(cb); } catch { ... }
 *
 * Uso:
 *   useRealtimeSubscribe({
 *       collection: COLLECTIONS.ASSIGNMENTS,
 *       onEvent: (data) => handleUpdate(data),
 *       debounceMs: 1500,
 *       tag: '[Dashboard]',
 *   });
 *
 * @param options - Configuração do subscribe
 */
export function useRealtimeSubscribe(options: RealtimeOptions): void {
    const {
        collection,
        onEvent,
        debounceMs = 1000,
        tag = '[Realtime]',
        enabled = true,
    } = options;

    // Ref para manter referência estável do callback (evita re-subscribe desnecessário)
    const onEventRef = useRef(onEvent);
    onEventRef.current = onEvent;

    useEffect(() => {
        if (!enabled) return;

        let unsubscribe: (() => void) | undefined;
        let debounceTimer: ReturnType<typeof setTimeout>;

        try {
            unsubscribe = aether.db.collection(collection)
                .subscribe((updatedData: any) => {
                    // Debounce protege contra burst de eventos
                    // Exemplo: admin arquiva 10 rotas → 10 eventos → 1 callback
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => {
                        logger.debug(tag, 'Evento realtime recebido');
                        onEventRef.current(updatedData);
                    }, debounceMs);
                });

            logger.info(tag, `Realtime conectado: ${collection}`);
        } catch (subErr) {
            logger.warn(tag, `Subscribe indisponível para ${collection}, polling ativo como fallback:`, subErr);
        }

        return () => {
            if (unsubscribe) {
                unsubscribe();
                logger.debug(tag, `Realtime desconectado: ${collection}`);
            }
            clearTimeout(debounceTimer);
        };
    }, [collection, debounceMs, tag, enabled]);
}
