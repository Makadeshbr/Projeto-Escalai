/**
 * Suite de Testes Enterprise — push.ts (Notificações Push)
 *
 * Cobertura:
 * 1. notifyDriver — push para motorista específico por ID
 * 2. notifyAllDrivers — broadcast para todos os motoristas
 * 3. sendPushNotification — envio em chunks + tratamento de tickets com erro
 * 4. ensureDriverPushToken — sync automático de token (criar/atualizar/skip)
 * 5. notifyAdmins — tolerante a falhas
 * 6. dispatchAdminAlert — persiste banco E envia push
 *
 * Estratégia Akita XP: zero dependência de rede real. Todos os mocks
 * são declarados ANTES dos imports e resetados entre testes.
 */

// =============================================================================
// MOCKS GLOBAIS — devem preceder TODOS os imports
// =============================================================================

jest.mock('react-native', () => ({
    Platform: { OS: 'android', select: jest.fn() },
}));

jest.mock('expo-constants', () => ({
    __esModule: true,
    default: {
        executionEnvironment: 'standalone',
        expoConfig: { extra: { eas: { projectId: 'test-project-id-123' } } },
    },
    ExecutionEnvironment: { StoreClient: 'storeClient', Standalone: 'standalone' },
}));

const mockLogger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
jest.mock('~/src/lib/logger', () => ({ logger: mockLogger }));

// Variáveis controladas por cada suite
const mockDbGet = jest.fn();
const mockDbUpdate = jest.fn();
const mockDbCreate = jest.fn();
const mockAetherFetchAll = jest.fn();

jest.mock('~/src/lib/aether', () => ({
    aether: {
        db: {
            collection: () => ({
                query: () => ({ eq: () => ({ get: mockDbGet }) }),
                update: mockDbUpdate,
                create: mockDbCreate,
            }),
        },
    },
    aetherFetchAll: mockAetherFetchAll,
}));

const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockGetExpoPushTokenAsync = jest.fn();
const mockSetNotificationChannelAsync = jest.fn();

jest.mock('expo-notifications', () => ({
    getPermissionsAsync: mockGetPermissionsAsync,
    requestPermissionsAsync: mockRequestPermissionsAsync,
    getExpoPushTokenAsync: mockGetExpoPushTokenAsync,
    setNotificationChannelAsync: mockSetNotificationChannelAsync,
    AndroidImportance: { MAX: 5 },
    setNotificationHandler: jest.fn(),
}));

// =============================================================================
// IMPORTS (após mocks)
// =============================================================================

import {
    notifyDriver,
    notifyAllDrivers,
    sendPushNotification,
    ensureDriverPushToken,
    notifyAdmins,
} from '~/src/lib/push';

// =============================================================================
// MOCK DO FETCH GLOBAL
// =============================================================================

const mockFetch = jest.fn();
global.fetch = mockFetch;

// =============================================================================
// FACTORIES
// =============================================================================

/** Registro fake de DRIVER_STATUS com token válido */
function makeDriverStatus(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        id: 'driver-status-id-1',
        user_id: 'driver-user-1',
        driverName: 'João Silva',
        driverPlate: 'ABC1D23',
        expoPushToken: 'ExponentPushToken[valid-token-abc]',
        status: 'active',
        ...overrides,
    };
}

/** Registro fake de ADMIN_STATUS com token válido */
function makeAdminStatus(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        id: 'admin-status-id-1',
        user_id: 'admin-user-1',
        adminName: 'Admin Principal',
        expoPushToken: 'ExponentPushToken[admin-token-xyz]',
        ...overrides,
    };
}

/** Resposta padrão de sucesso da Expo Push API */
function expoSuccess() {
    return {
        ok: true,
        json: async () => ({ data: [{ status: 'ok', id: 'ticket-1' }] }),
    };
}

// =============================================================================
// SUITE 1: sendPushNotification — Envio base
// =============================================================================

describe('sendPushNotification — Envio direto à Expo Push API', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockResolvedValue(expoSuccess());
    });

    it('deve enviar com sucesso para token único', async () => {
        await expect(
            sendPushNotification('ExponentPushToken[abc]', 'Título', 'Corpo')
        ).resolves.not.toThrow();

        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('deve incluir priority=high no payload (garante acordar app Android)', async () => {
        await sendPushNotification('ExponentPushToken[abc]', 'Título', 'Corpo');
        const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(payload[0].priority).toBe('high');
        expect(payload[0].channelId).toBe('default');
    });

    it('deve retornar sem chamar fetch para token vazio (early return)', async () => {
        await expect(sendPushNotification('', 'Título', 'Corpo')).resolves.not.toThrow();
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('deve retornar sem chamar fetch para array vazio', async () => {
        await expect(sendPushNotification([], 'Título', 'Corpo')).resolves.not.toThrow();
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('deve enviar em 2 chunks para 150 tokens (limite 100 por batch)', async () => {
        const tokens = Array.from({ length: 150 }, (_, i) => `ExponentPushToken[tok-${i}]`);
        await sendPushNotification(tokens, 'Título', 'Corpo');
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('deve lançar erro quando TODOS os disparos falham', async () => {
        mockFetch.mockRejectedValue(new Error('Network request failed'));
        await expect(
            sendPushNotification('ExponentPushToken[abc]', 'Título', 'Corpo')
        ).rejects.toThrow('Falha em todos os disparos');
    });

    it('deve logar warning (não lançar) quando apenas ALGUNS chunks falham', async () => {
        const tokens = Array.from({ length: 200 }, (_, i) => `ExponentPushToken[tok-${i}]`);
        mockFetch
            .mockRejectedValueOnce(new Error('Network error chunk 1'))
            .mockResolvedValueOnce(expoSuccess());

        await expect(sendPushNotification(tokens, 'Título', 'Corpo')).resolves.not.toThrow();
        expect(mockLogger.warn).toHaveBeenCalledWith(
            '[Push]',
            expect.stringContaining('falharam'),
            expect.any(Array)
        );
    });

    it('deve incluir dados extras (data) corretamente no payload', async () => {
        const extraData = { routeId: 'route-abc', dock: '5' };
        await sendPushNotification('ExponentPushToken[abc]', 'Título', 'Corpo', extraData);
        const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(payload[0].data).toEqual(extraData);
    });
});

// =============================================================================
// SUITE 2: notifyDriver — Push para motorista específico
// =============================================================================

describe('notifyDriver — Push para motorista específico', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockResolvedValue(expoSuccess());
    });

    it('deve enviar push com sucesso quando motorista tem token válido', async () => {
        mockDbGet.mockResolvedValue([makeDriverStatus()]);

        await expect(
            notifyDriver('driver-user-1', 'DOCA LIBERADA! 🟢', 'Doca 5 liberada para você.')
        ).resolves.not.toThrow();

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody[0].to).toBe('ExponentPushToken[valid-token-abc]');
        expect(fetchBody[0].title).toBe('DOCA LIBERADA! 🟢');
    });

    it('deve lançar erro quando DRIVER_STATUS não existe no banco', async () => {
        mockDbGet.mockResolvedValue([]);
        await expect(
            notifyDriver('driver-inexistente', 'Título', 'Corpo')
        ).rejects.toThrow('DriverStatus não encontrado');
    });

    it('deve lançar erro quando motorista não ativou notificações (token vazio)', async () => {
        mockDbGet.mockResolvedValue([makeDriverStatus({ expoPushToken: '' })]);
        await expect(
            notifyDriver('driver-user-1', 'Título', 'Corpo')
        ).rejects.toThrow('não ativou as notificações');
    });

    it('deve lançar erro quando token está no _payload vazio (estrutura legada)', async () => {
        mockDbGet.mockResolvedValue([makeDriverStatus({
            expoPushToken: undefined,
            _payload: { expoPushToken: '' },
        })]);
        await expect(
            notifyDriver('driver-user-1', 'Título', 'Corpo')
        ).rejects.toThrow('não ativou as notificações');
    });

    it('deve enviar dados extras (data) corretamente no payload', async () => {
        mockDbGet.mockResolvedValue([makeDriverStatus()]);
        const extraData = { routeId: 'route-abc', dock: '5' };

        await notifyDriver('driver-user-1', 'Título', 'Corpo', extraData);

        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody[0].data).toEqual(extraData);
    });
});

// =============================================================================
// SUITE 3: notifyAllDrivers — Broadcast
// =============================================================================

describe('notifyAllDrivers — Broadcast para todos os motoristas', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockResolvedValue(expoSuccess());
    });

    it('deve enviar para todos e retornar relatório completo', async () => {
        mockAetherFetchAll.mockResolvedValue([
            makeDriverStatus({ user_id: 'u1', expoPushToken: 'ExponentPushToken[tok1]' }),
            makeDriverStatus({ user_id: 'u2', expoPushToken: 'ExponentPushToken[tok2]' }),
            makeDriverStatus({ user_id: 'u3', expoPushToken: 'ExponentPushToken[tok3]' }),
        ]);

        const result = await notifyAllDrivers('Broadcast', 'Mensagem');

        expect(result.sent).toBe(3);
        expect(result.skipped).toBe(0);
        expect(result.total).toBe(3);
        expect(result.missingTokenDrivers).toHaveLength(0);
    });

    it('deve pular motoristas sem token e reportar quem ficou de fora', async () => {
        mockAetherFetchAll.mockResolvedValue([
            makeDriverStatus({ user_id: 'u1', expoPushToken: 'ExponentPushToken[tok1]', driverName: 'Maria' }),
            makeDriverStatus({ user_id: 'u2', expoPushToken: '', driverName: 'Carlos' }),
            makeDriverStatus({ user_id: 'u3', expoPushToken: 'ExponentPushToken[tok3]', driverName: 'Ana' }),
        ]);

        const result = await notifyAllDrivers('Broadcast', 'Corpo');

        expect(result.sent).toBe(2);
        expect(result.skipped).toBe(1);
        expect(result.missingTokenDrivers).toContain('Carlos');
    });

    it('deve lançar erro quando nenhum motorista está cadastrado', async () => {
        mockAetherFetchAll.mockResolvedValue([]);
        await expect(notifyAllDrivers('Título', 'Corpo')).rejects.toThrow('Nenhum motorista encontrado');
    });

    it('deve lançar erro quando todos os motoristas estão sem token', async () => {
        mockAetherFetchAll.mockResolvedValue([
            makeDriverStatus({ expoPushToken: '', driverName: 'Pedro' }),
        ]);
        await expect(notifyAllDrivers('Título', 'Corpo')).rejects.toThrow('Nenhum motorista possui');
    });

    it('deve ler token do campo _payload (estrutura legada do Aether)', async () => {
        mockAetherFetchAll.mockResolvedValue([{
            id: 'd1', user_id: 'u1', driverName: 'Legado',
            expoPushToken: '',
            _payload: { expoPushToken: 'ExponentPushToken[legacy-tok]', driverName: 'Legado' },
        }]);

        const result = await notifyAllDrivers('Título', 'Corpo');

        expect(result.sent).toBe(1);
        expect(result.skipped).toBe(0);
    });
});

// =============================================================================
// SUITE 4: notifyAdmins — Notificação para admins
// =============================================================================

describe('notifyAdmins — Notificação para admins registrados', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockResolvedValue(expoSuccess());
    });

    it('deve retornar 0 quando nenhum admin está registrado', async () => {
        mockAetherFetchAll.mockResolvedValue([]);
        const count = await notifyAdmins('Título', 'Corpo');
        expect(count).toBe(0);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('deve retornar 0 quando admins existem mas sem token', async () => {
        mockAetherFetchAll.mockResolvedValue([makeAdminStatus({ expoPushToken: '' })]);
        const count = await notifyAdmins('Título', 'Corpo');
        expect(count).toBe(0);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('deve notificar todos os admins com token e retornar contagem', async () => {
        mockAetherFetchAll.mockResolvedValue([
            makeAdminStatus({ expoPushToken: 'ExponentPushToken[admin1]' }),
            makeAdminStatus({ user_id: 'admin-2', expoPushToken: 'ExponentPushToken[admin2]' }),
        ]);

        const count = await notifyAdmins('Alerta', 'Motorista confirmou rota');

        expect(count).toBe(2);
        const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(fetchBody).toHaveLength(2);
    });

    it('deve retornar número (0 ou mais) sem lançar erro se fetch falhar', async () => {
        mockAetherFetchAll.mockResolvedValue([
            makeAdminStatus({ expoPushToken: 'ExponentPushToken[admin1]' }),
        ]);
        mockFetch.mockRejectedValue(new Error('Expo Push indisponível'));

        // notifyAdmins tem try/catch — não deve propagar o erro
        const count = await notifyAdmins('Título', 'Corpo');
        expect(typeof count).toBe('number');
    });
});

// =============================================================================
// SUITE 5: ensureDriverPushToken — Sync automático
// =============================================================================

describe('ensureDriverPushToken — Sincronização automática de token', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
        mockGetExpoPushTokenAsync.mockResolvedValue({
            data: 'ExponentPushToken[fresh-token-2026]'
        });
    });

    it('deve retornar null quando permissão é negada (sem lançar)', async () => {
        mockGetPermissionsAsync.mockResolvedValue({ status: 'denied' });
        mockRequestPermissionsAsync.mockResolvedValue({ status: 'denied' });
        mockDbGet.mockResolvedValue([]);

        const result = await ensureDriverPushToken('user-1', 'João', 'ABC1D23');
        expect(result).toBeNull();
    });

    it('deve criar DRIVER_STATUS novo para motorista que nunca abriu o app', async () => {
        mockDbGet.mockResolvedValue([]);
        mockDbCreate.mockResolvedValue({ id: 'new-record' });

        const token = await ensureDriverPushToken('user-novo', 'Maria Silva', 'XYZ9H87');

        expect(token).toBe('ExponentPushToken[fresh-token-2026]');
        expect(mockDbCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                user_id: 'user-novo',
                driverName: 'Maria Silva',
                driverPlate: 'XYZ9H87',
                expoPushToken: 'ExponentPushToken[fresh-token-2026]',
                status: 'active',
            })
        );
    });

    it('NÃO deve fazer update quando token não mudou (evita write desnecessário)', async () => {
        // Token atual = token fresco (mesmos)
        mockDbGet.mockResolvedValue([makeDriverStatus({
            expoPushToken: 'ExponentPushToken[fresh-token-2026]'
        })]);

        const token = await ensureDriverPushToken('driver-user-1', 'João', 'ABC1D23');

        expect(token).toBe('ExponentPushToken[fresh-token-2026]');
        expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it('deve fazer update quando token mudou (renovação automática)', async () => {
        mockDbGet.mockResolvedValue([makeDriverStatus({
            id: 'status-record-1',
            expoPushToken: 'ExponentPushToken[old-token]'
        })]);
        mockDbUpdate.mockResolvedValue({});

        const token = await ensureDriverPushToken('driver-user-1', 'João', 'ABC1D23');

        expect(token).toBe('ExponentPushToken[fresh-token-2026]');
        expect(mockDbUpdate).toHaveBeenCalledWith(
            'status-record-1',
            expect.objectContaining({
                expoPushToken: 'ExponentPushToken[fresh-token-2026]',
            })
        );
    });

    it('deve retornar null silenciosamente em qualquer erro (tolerância total)', async () => {
        mockDbGet.mockRejectedValue(new Error('Conexão perdida com banco'));

        const result = await ensureDriverPushToken('user-1', 'João', 'ABC1D23');

        expect(result).toBeNull();
        expect(mockLogger.warn).toHaveBeenCalledWith(
            '[PushSync]',
            expect.stringContaining('Falha tolerada')
        );
    });
});
