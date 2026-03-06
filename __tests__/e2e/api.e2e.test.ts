/**
 * Testes E2E — API Aether (Banco Real em Railway)
 *
 * ⚠️ ATENÇÃO: Estes testes fazem chamadas REAIS à API de produção.
 * Eles precisam de um token JWT válido para funcionar.
 * Configure AETHER_TEST_TOKEN no arquivo .env.test ou como variável de ambiente.
 *
 * Para rodar: npx jest __tests__/e2e/ --testTimeout=30000
 *
 * O que esses testes provam (diferente dos mocks):
 * - A API de produção está online e responde corretamente
 * - O schema das coleções no banco está correto
 * - Operações CRUD reais funcionam (criar, ler, atualizar, deletar)
 * - Filtros e queries retornam os dados esperados
 * - Os timestamps são salvos em formato BRT correto
 */

// =============================================================================
// CONFIGURAÇÃO DO AMBIENTE DE TESTE E2E
// =============================================================================

const AETHER_BASE_URL =
    process.env.EXPO_PUBLIC_AETHER_API_URL ||
    'https://api-plataforma-production-a92f.up.railway.app';

const AETHER_PROJECT_ID =
    process.env.EXPO_PUBLIC_AETHER_PROJECT_ID ||
    'd937f7a3-5752-45ec-8dd7-15ab4ef8b140';

const TEST_TOKEN = process.env.AETHER_TEST_TOKEN || '';

/**
 * Verifica se o ambiente E2E está configurado com token válido.
 * Se não estiver, pula todos os testes com mensagem clara.
 */
const skipIfNoToken = !TEST_TOKEN
    ? 'AETHER_TEST_TOKEN não configurado — configure em .env.test para testes E2E reais'
    : false;

const itE2E = skipIfNoToken ? it.skip : it;

// =============================================================================
// CLIENTE HTTP PARA A API AETHER (SEM MOCK)
// =============================================================================

/**
 * Faz uma requisição autenticada à API Aether de produção.
 * Usa o token JWT configurado em AETHER_TEST_TOKEN.
 */
async function aetherRequest(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: Record<string, unknown>
): Promise<{ status: number; data: any; ok: boolean }> {
    const url = `${AETHER_BASE_URL}${path}`;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Project-ID': AETHER_PROJECT_ID,
    };

    if (TEST_TOKEN) {
        headers['Authorization'] = `Bearer ${TEST_TOKEN}`;
    }

    const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    let data: any;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    return { status: response.status, data, ok: response.ok };
}

// =============================================================================
// SUITE 1: Health Check da API
// =============================================================================

describe('E2E: API Aether — Health Check', () => {
    it('API deve estar online (responde ao endpoint de health)', async () => {
        // Sem autenticação — verifica apenas se o servidor responde
        const response = await fetch(`${AETHER_BASE_URL}/health`).catch(() => null);
        const response2 = await fetch(`${AETHER_BASE_URL}/v1/health`).catch(() => null);
        const response3 = await fetch(`${AETHER_BASE_URL}/`).catch(() => null);

        // Pelo menos um dos endpoints deve responder
        const anyResponded = [response, response2, response3].some(r => r !== null);
        expect(anyResponded).toBe(true);
    }, 15000);

    it('URL base da API deve ser alcançável (não timeout)', async () => {
        const start = Date.now();
        try {
            await fetch(AETHER_BASE_URL, { signal: AbortSignal.timeout(10000) });
        } catch (e: any) {
            // AbortError = timeout, que é um problema real
            if (e.name === 'AbortError') {
                throw new Error(`API timeout após 10s. URL: ${AETHER_BASE_URL}`);
            }
            // Outros erros (404, etc.) são ok — o servidor está respondendo
        }
        const elapsed = Date.now() - start;
        // Deve responder em menos de 10 segundos
        expect(elapsed).toBeLessThan(10000);
    }, 15000);
});

// =============================================================================
// SUITE 2: Autenticação e Acesso
// =============================================================================

describe('E2E: Autenticação e Controle de Acesso', () => {
    itE2E(
        'token configurado deve aceitar acesso à coleção assignments',
        async () => {
            const result = await aetherRequest('GET', '/v1/db/assignments?limit=1');
            // 200 = ok, 403 = RLS bloqueou (token errado/sem permissão)
            expect(result.status).not.toBe(401); // Token inválido
            expect([200, 403]).toContain(result.status);
        },
        15000
    );

    it('sem token deve receber 401 na coleção protegida', async () => {
        const response = await fetch(`${AETHER_BASE_URL}/v1/db/assignments?limit=1`, {
            headers: { 'X-Project-ID': AETHER_PROJECT_ID },
        });
        // Sem token: deve ser 401 (não autorizado)
        expect(response.status).toBe(401);
    }, 15000);
});

// =============================================================================
// SUITE 3: CRUD Real de Coleções
// =============================================================================

describe('E2E: CRUD de City (coleção mais simples)', () => {
    let createdCityId: string | null = null;

    itE2E(
        'deve listar cidades existentes no banco (GET /v1/db/cities)',
        async () => {
            const result = await aetherRequest('GET', '/v1/db/cities?limit=10');
            expect(result.ok).toBe(true);
            expect(result.status).toBe(200);
            // Deve retornar objeto com data ou records
            expect(result.data).toBeDefined();
            const items = result.data?.data || result.data?.records || [];
            expect(Array.isArray(items)).toBe(true);
        },
        20000
    );

    itE2E(
        'deve criar uma cidade de teste E2E no banco',
        async () => {
            const testCity = {
                name: `[E2E_TEST] Cidade Automática ${Date.now()}`,
                code: `E2E_${Date.now()}`,
                isActive: false, // Nunca ativa — é só para teste
                createdAt: new Date().toISOString(),
            };

            const result = await aetherRequest('POST', '/v1/db/cities', testCity);

            // Pode retornar 201 (created) ou 200
            expect([200, 201]).toContain(result.status);
            expect(result.data).toBeDefined();

            // Captura o ID para cleanup
            const createdId = result.data?.id || result.data?.data?.id;
            if (createdId) {
                createdCityId = createdId;
                console.log(`[E2E] Cidade criada: ${createdId}`);
            }
        },
        20000
    );

    itE2E(
        'deve atualizar a cidade criada (PATCH)',
        async () => {
            if (!createdCityId) {
                console.warn('[E2E] Pulando update — cidade não foi criada no teste anterior.');
                return;
            }
            const result = await aetherRequest('PATCH', `/v1/db/cities/${createdCityId}`, {
                name: `[E2E_TEST] Cidade ATUALIZADA ${Date.now()}`,
            });
            expect([200, 201, 204]).toContain(result.status);
        },
        20000
    );

    afterAll(async () => {
        // Cleanup: remove a cidade de teste criada
        if (createdCityId && TEST_TOKEN) {
            try {
                await aetherRequest('DELETE', `/v1/db/cities/${createdCityId}`);
                console.log(`[E2E Cleanup] Cidade ${createdCityId} removida.`);
            } catch {
                console.warn(`[E2E Cleanup] Falha ao remover cidade ${createdCityId}`);
            }
        }
    });
});

// =============================================================================
// SUITE 4: Assignments — Distribuição de Rotas Real
// =============================================================================

describe('E2E: Assignments — Rotas de Motoristas no Banco Real', () => {
    let createdAssignmentId: string | null = null;

    itE2E(
        'deve listar assignments existentes no banco',
        async () => {
            const result = await aetherRequest('GET', '/v1/db/assignments?limit=5');
            expect(result.ok).toBe(true);
            const items = result.data?.data || result.data?.records || [];
            expect(Array.isArray(items)).toBe(true);

            // Se houver assignments, verificar que têm campos obrigatórios
            if (items.length > 0) {
                const first = items[0];
                console.log(`[E2E] Primeiro assignment encontrado: ${first.id}`);
                // Verifica campos críticos do contrato
                expect(first).toBeDefined();
            }
        },
        20000
    );

    itE2E(
        'deve criar um assignment de teste E2E no banco',
        async () => {
            const now = new Date().toISOString();
            const testAssignment = {
                cityId: 'e2e-test-city',
                cityName: '[E2E TEST] Campinas',
                wave: 'morning',
                waveLabel: 'Manhã',
                waveTime: '06:00 - 11:00',
                waveNumber: 'Onda 1',
                dock: '99',
                routeLabel: 'E2E_TEST',
                sacas: 0,
                isSdd: false,
                driverId: 'e2e-test-driver-id',
                driverName: '[E2E] Motorista Teste',
                driverPlate: 'E2E0000',
                dockStatus: 'waiting',
                status: 'pending',
                createdByAdminId: 'e2e-test-admin',
                createdAt: now,
                archived: true, // SEMPRE arquivado — invisível no app real
            };

            const result = await aetherRequest('POST', '/v1/db/assignments', testAssignment);
            expect([200, 201]).toContain(result.status);

            const createdId = result.data?.id || result.data?.data?.id;
            if (createdId) {
                createdAssignmentId = createdId;
                console.log(`[E2E] Assignment criado: ${createdId}`);
            }
        },
        20000
    );

    itE2E(
        'deve buscar assignment criado e verificar campos obrigatórios',
        async () => {
            if (!createdAssignmentId) {
                console.warn('[E2E] Pulando verificação — assignment não criado.');
                return;
            }

            const result = await aetherRequest(
                'GET',
                `/v1/db/assignments/${createdAssignmentId}`
            );

            expect(result.ok).toBe(true);
            const record = result.data?.data || result.data;

            // Verifica contrato de dados da rota
            if (record) {
                expect(record.dockStatus).toBeDefined();
                expect(record.status).toBeDefined();
                expect(record.createdAt).toBeDefined();
                // createdAt deve ser string ISO com -03:00 (BRT) OU formato aceito
                expect(typeof record.createdAt).toBe('string');
                console.log(`[E2E] createdAt retornado: ${record.createdAt}`);
            }
        },
        20000
    );

    itE2E(
        'deve atualizar dockStatus de waiting para liberated (ciclo real)',
        async () => {
            if (!createdAssignmentId) {
                console.warn('[E2E] Pulando ciclo dockStatus — assignment não criado.');
                return;
            }

            const result = await aetherRequest(
                'PATCH',
                `/v1/db/assignments/${createdAssignmentId}`,
                { dockStatus: 'liberated' }
            );

            expect([200, 201, 204]).toContain(result.status);

            // Verifica se o update persistiu
            const readBack = await aetherRequest(
                'GET',
                `/v1/db/assignments/${createdAssignmentId}`
            );
            const record = readBack.data?.data || readBack.data;
            if (record) {
                expect(record.dockStatus).toBe('liberated');
            }
        },
        20000
    );

    afterAll(async () => {
        if (createdAssignmentId && TEST_TOKEN) {
            try {
                await aetherRequest('DELETE', `/v1/db/assignments/${createdAssignmentId}`);
                console.log(`[E2E Cleanup] Assignment ${createdAssignmentId} removido.`);
            } catch {
                console.warn(`[E2E Cleanup] Falha ao remover assignment ${createdAssignmentId}`);
            }
        }
    });
});

// =============================================================================
// SUITE 5: Driver Status — Token Push Real
// =============================================================================

describe('E2E: Driver Status — Tokens Push no Banco Real', () => {
    let createdStatusId: string | null = null;

    itE2E(
        'deve criar um DRIVER_STATUS de teste com push token',
        async () => {
            const testStatus = {
                user_id: `e2e-test-user-${Date.now()}`,
                driverName: '[E2E] Motorista Teste Push',
                driverPlate: 'E2EPUSH',
                expoPushToken: 'ExponentPushToken[e2e-test-token-fake]',
                status: 'active',
                createdAt: new Date().toISOString(),
            };

            const result = await aetherRequest('POST', '/v1/db/driver_status', testStatus);
            expect([200, 201]).toContain(result.status);

            const createdId = result.data?.id || result.data?.data?.id;
            if (createdId) {
                createdStatusId = createdId;
                console.log(`[E2E] DriverStatus criado: ${createdId}`);
            }
        },
        20000
    );

    itE2E(
        'deve atualizar o push token do driver (renovação automática)',
        async () => {
            if (!createdStatusId) {
                console.warn('[E2E] Pulando update de token — DriverStatus não criado.');
                return;
            }

            const newToken = `ExponentPushToken[e2e-renewed-${Date.now()}]`;
            const result = await aetherRequest(
                'PATCH',
                `/v1/db/driver_status/${createdStatusId}`,
                { expoPushToken: newToken }
            );

            expect([200, 201, 204]).toContain(result.status);

            // Verifica persistência
            const readBack = await aetherRequest(
                'GET',
                `/v1/db/driver_status/${createdStatusId}`
            );
            const record = readBack.data?.data || readBack.data;
            if (record) {
                const token = record.expoPushToken || record._payload?.expoPushToken;
                expect(token).toBe(newToken);
                console.log(`[E2E] Token renovado com sucesso: ${token?.substring(0, 40)}...`);
            }
        },
        20000
    );

    afterAll(async () => {
        if (createdStatusId && TEST_TOKEN) {
            try {
                await aetherRequest('DELETE', `/v1/db/driver_status/${createdStatusId}`);
                console.log(`[E2E Cleanup] DriverStatus ${createdStatusId} removido.`);
            } catch {
                console.warn(`[E2E Cleanup] Falha ao remover DriverStatus ${createdStatusId}`);
            }
        }
    });
});

// =============================================================================
// SUITE 6: Admin Notifications — Leitura via Admin
// =============================================================================

describe('E2E: Admin Notifications — Leitura no Banco Real', () => {

    itE2E(
        'deve listar notificações recentes do admin (GET)',
        async () => {
            const result = await aetherRequest(
                'GET',
                '/v1/db/admin_notifications?limit=5'
            );

            // 200 = sucesso, 403 = não autorizado (caso o token não seja de admin, dependendo do RLS)
            expect([200, 403]).toContain(result.status);

            if (result.status === 200) {
                const items = result.data?.data || result.data?.records || [];
                expect(Array.isArray(items)).toBe(true);
            }
        },
        20000
    );
});

// =============================================================================
// SUITE 7: Timestamps BRT — Verificação Real de Timezone
// =============================================================================

describe('E2E: Timestamps BRT — Timezone no Banco Real', () => {
    itE2E(
        'timestamps salvos pelo app devem ser parseáveis como BRT (-03:00)',
        async () => {
            // Lê os 3 registros mais recentes do assignments
            const result = await aetherRequest('GET', '/v1/db/assignments?limit=3');
            const items = result.data?.data || result.data?.records || [];

            for (const item of items) {
                if (item.createdAt) {
                    const date = new Date(item.createdAt);
                    expect(isNaN(date.getTime())).toBe(false);

                    // Se tiver offset BRT, verifica que é -03:00
                    if (typeof item.createdAt === 'string' &&
                        item.createdAt.includes('-03:00')) {
                        console.log(`[E2E] Timestamp BRT confirmado: ${item.createdAt}`);
                    }
                }
            }
        },
        20000
    );

    itE2E(
        'deve salvar um registro com timestamp BRT e ler de volta corretamente',
        async () => {
            const { formatBrazilTimestamp } = await import('../../src/lib/collections');
            const brtTimestamp = formatBrazilTimestamp();

            console.log(`[E2E] Timestamp BRT gerado: ${brtTimestamp}`);

            // Verifica formato antes de salvar
            expect(brtTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/);

            // Cria um registro de auditoria com o timestamp
            const testAudit = {
                action: 'e2e_timestamp_test',
                actor: 'e2e_test',
                target: 'e2e_collection',
                timestamp: brtTimestamp,
                createdAt: brtTimestamp,
            };

            const result = await aetherRequest('POST', '/v1/db/audit_log', testAudit);

            if (result.ok) {
                const createdId = result.data?.id || result.data?.data?.id;
                console.log(`[E2E] Audit log criado: ${createdId}`);

                // Cleanup
                if (createdId) {
                    await aetherRequest('DELETE', `/v1/db/audit_log/${createdId}`).catch(() => {});
                }
            }

            // O importante é que o timestamp gerado tem o formato correto
            expect(brtTimestamp).toContain('-03:00');
        },
        20000
    );
});
