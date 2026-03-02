import type { PlataformaClient } from '@aether-baas/core';
import { getAetherClient, isAetherClientReady } from '@aether-baas/react-native';
import { logger } from './logger';

/**
 * Configuração de conexão com o Aether BaaS.
 * Valores lidos de variáveis de ambiente com fallback para desenvolvimento.
 */
export const aetherConfig = {
    baseUrl: process.env.EXPO_PUBLIC_AETHER_API_URL || 'https://api-plataforma-production-a92f.up.railway.app',
    apiKey: process.env.EXPO_PUBLIC_AETHER_PROJECT_ID || 'd937f7a3-5752-45ec-8dd7-15ab4ef8b140',
};

/**
 * Proxy que delega ao client autenticado do AetherProvider.
 * Garante que todas as chamadas usem o client com token de auth.
 * Se o client não estiver pronto, loga warning e tenta servir mesmo assim.
 */
function createAetherProxy(): PlataformaClient {
    return new Proxy({} as PlataformaClient, {
        get(_target: PlataformaClient, prop: string | symbol) {
            if (!isAetherClientReady()) {
                logger.warn('[Aether]', `Client não pronto. Aguardando para: ${String(prop)}`);
            }
            const client = getAetherClient();
            const value = (client as unknown as Record<string | symbol, unknown>)[prop];
            if (typeof value === 'function') {
                return value.bind(client);
            }
            return value;
        }
    });
}

/** Instância singleton do proxy Aether para uso em toda a aplicação */
export const aether = createAetherProxy();

/**
 * Busca TODOS os registros de uma coleção com paginação automática.
 * Usa REST direto quando o token está disponível, com fallback para SDK.
 *
 * [FIX] Passa limit=5000 e faz paginação automática via cursor para
 * garantir que TODOS os registros são retornados (backend tem LIMIT default de 1000).
 *
 * @param collectionName - Nome da coleção no banco de dados
 * @returns Array com todos os registros da coleção
 */
export async function aetherFetchAll(collectionName: string): Promise<Record<string, unknown>[]> {
    // Aguarda o client ficar pronto (AetherProvider precisa montar primeiro)
    if (!isAetherClientReady()) {
        await waitForClient(3000);
    }

    // Se mesmo após aguardar, o client não estiver pronto, retorna vazio
    if (!isAetherClientReady()) {
        logger.warn('[aetherFetchAll]', `Client não pronto após timeout. Coleção: ${collectionName}`);
        return [];
    }

    // Tenta via REST direto (mais rápido, sem overhead do SDK)
    try {
        const client = getAetherClient();
        const token = typeof client.getToken === 'function'
            ? client.getToken()
            : null;

        if (token) {
            const headers: Record<string, string> = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-Project-ID': aetherConfig.apiKey,
                'X-Skip-Cache': 'true', // [FIX] Sempre pula cache para dados realtime
            };

            // [FIX] Paginação automática: busca todas as páginas via cursor
            let allItems: Record<string, unknown>[] = [];
            let cursor: string | null = null;
            let pageCount = 0;
            const MAX_PAGES = 10; // Segurança: no máximo 10 páginas (50.000 registros)

            do {
                // [FIX] limit=5000 para maximizar registros por request
                let url = `${aetherConfig.baseUrl}/v1/db/${collectionName}?limit=5000`;
                if (cursor) {
                    url += `&cursor=${encodeURIComponent(cursor)}`;
                }

                const resp = await fetch(url, { headers });
                if (!resp.ok) {
                    // [SENIOR FIX - SILENT FAIL PREVENT] Se token expirou, desloga na força bruta.
                    // Evita que o fallback do SDK rode (que também vai falhar) e avise lista vazia para o UI.
                    // [HOTFIX CRÍTICO] - 403 Forbidden OCORRE QUANDO O MOTORISTA TENTA DISPARAR NOTIFICAÇÃO AOS ADMINS
                    // e barra no RLS ao tentar ler ADMIN_STATUS. Nunca deslongue no 403! Apenas 401!!!
                    if (resp.status === 401) {
                        logger.error('[aetherFetchAll]', `Token Expirado (${resp.status})! Executando logout de emergência.`);
                        const { useAuthStore } = require('~/src/store/auth');
                        const { router } = require('expo-router');
                        useAuthStore.getState().logout();

                        // Envia pra fora usando router (se montado)
                        setTimeout(() => {
                            try { router.replace('/login'); } catch (e) { }
                        }, 100);
                        throw new Error('AUTH_EXPIRED'); // Interrompe imediatamente toda a stack
                    }

                    logger.warn('[aetherFetchAll]', `REST falhou (${resp.status}), usando SDK como fallback.`);
                    break;
                }

                const json = await resp.json();
                const items = (json.data || json.records || []) as Record<string, unknown>[];
                allItems = allItems.concat(items);

                // Verifica se há mais páginas
                cursor = json.cursor || null;
                const hasMore = json.hasMore === true;
                pageCount++;

                logger.debug('[aetherFetchAll]', `${collectionName} página ${pageCount}: ${items.length} registros (total acumulado: ${allItems.length}, hasMore: ${hasMore})`);

                if (!hasMore || !cursor) break;
            } while (pageCount < MAX_PAGES);

            if (allItems.length > 0) {
                logger.info('[aetherFetchAll]', `REST OK: ${collectionName} → ${allItems.length} registros TOTAL em ${pageCount} página(s)`);
                return allItems;
            }
        }
    } catch (restErr: any) {
        if (restErr.message === 'AUTH_EXPIRED') throw restErr; // Repassa erro fatal
        logger.warn('[aetherFetchAll]', 'REST indisponível, usando SDK:', restErr);
    }

    // Segurança: Se chegou aqui e REALMENTE não tem token na SDK instanciada (seja por expiração local ou limpeza).
    // Vamos intervir e não deixar o SDK explodir exceptions sujas vazando pros componentes.
    try {
        const client = getAetherClient();
        const tk = typeof client.getToken === 'function' ? client.getToken() : null;
        if (!tk) {
            logger.error('[aetherFetchAll]', 'Fallback preventivo bloqueado: Token Ausente! Expirando sessão.');
            const { useAuthStore } = require('~/src/store/auth');
            const { router } = require('expo-router');
            useAuthStore.getState().logout();
            setTimeout(() => { try { router.replace('/login'); } catch (e) { } }, 100);
            throw new Error('AUTH_MISSING');
        }
    } catch (e: any) {
        if (e.message === 'AUTH_MISSING') throw e;
    }

    // Fallback: usa SDK padrão (com try/catch para não quebrar silenciosamente)
    try {
        const result = await aether.db.collection(collectionName).query().get();
        logger.info('[aetherFetchAll]', `SDK fallback: ${collectionName} → ${(result || []).length} registros`);
        return (result || []) as Record<string, unknown>[];
    } catch (sdkErr) {
        logger.error('[aetherFetchAll]', `Fallback SDK falhou para ${collectionName}:`, sdkErr);
        return [];
    }
}

/**
 * Aguarda o client Aether ficar pronto com polling.
 * Resolve quando isAetherClientReady() retorna true ou timeout.
 *
 * @param timeoutMs - Tempo máximo de espera em ms (default: 3000)
 */
function waitForClient(timeoutMs = 3000): Promise<void> {
    return new Promise((resolve) => {
        const interval = 100;
        let elapsed = 0;
        const check = () => {
            if (isAetherClientReady() || elapsed >= timeoutMs) {
                resolve();
                return;
            }
            elapsed += interval;
            setTimeout(check, interval);
        };
        check();
    });
}

