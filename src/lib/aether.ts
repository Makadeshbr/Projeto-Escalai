import type { PlataformaClient } from '@aether-baas/core';
import { getAetherClient, isAetherClientReady } from '@aether-baas/react-native';

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
                console.warn(`[Aether] Client não pronto. Aguardando para: ${String(prop)}`);
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
 * @param collectionName - Nome da coleção no banco de dados
 * @returns Array com todos os registros da coleção
 *
 * [NOTA ARQUITETURAL] Esta função baixa TODOS os registros para o client.
 * Para coleções grandes (>1000 registros), considerar uso de queries
 * server-side com filtros e paginação.
 */
export async function aetherFetchAll(collectionName: string): Promise<Record<string, unknown>[]> {
    // Aguarda o client ficar pronto (AetherProvider precisa montar primeiro)
    if (!isAetherClientReady()) {
        await waitForClient(3000);
    }

    // Se mesmo após aguardar, o client não estiver pronto, retorna vazio
    if (!isAetherClientReady()) {
        console.warn(`[aetherFetchAll] Client não pronto após timeout. Coleção: ${collectionName}`);
        return [];
    }

    // Tenta via REST direto (mais rápido, sem overhead do SDK)
    try {
        const client = getAetherClient();
        // CORREÇÃO: chama getToken() diretamente no client para manter binding de `this`
        const token = typeof client.getToken === 'function'
            ? client.getToken()
            : null;

        if (token) {
            const headers: Record<string, string> = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-Project-ID': aetherConfig.apiKey,
            };
            // CORREÇÃO: URL alinhada com o endpoint real do backend Aether
            const url = `${aetherConfig.baseUrl}/v1/db/${collectionName}`;
            const resp = await fetch(url, { headers });
            if (resp.ok) {
                const json = await resp.json();
                const items = (json.data || json.records || json) as Record<string, unknown>[];
                console.log(`[aetherFetchAll] REST OK: ${collectionName} → ${items.length} registros`);
                return items;
            }
            console.warn(`[aetherFetchAll] REST falhou (${resp.status}), usando SDK como fallback.`);
        }
    } catch (restErr) {
        console.warn('[aetherFetchAll] REST indisponível, usando SDK:', restErr);
    }

    // Fallback: usa SDK padrão (com try/catch para não quebrar silenciosamente)
    try {
        const result = await aether.db.collection(collectionName).query().get();
        console.log(`[aetherFetchAll] SDK fallback: ${collectionName} → ${(result || []).length} registros`);
        return (result || []) as Record<string, unknown>[];
    } catch (sdkErr) {
        console.error(`[aetherFetchAll] Fallback SDK falhou para ${collectionName}:`, sdkErr);
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

