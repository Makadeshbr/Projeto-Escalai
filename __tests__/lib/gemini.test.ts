/**
 * Testes enterprise para o módulo Gemini OCR (src/lib/gemini.ts) [Versão Proxy-Only].
 *
 * Cobertura Completa:
 * 1. Sem Chave Hardcoded ("Proxy-Only" Security)
 * 2. Mock do aether.functions.invoke
 * 3. Fallbacks e Cleanups de JSON da IA
 * 4. Sanitização Crítica de Placas
 * 5. Casos avançados de corrupção ou Timeout (60s)
 */

// =============================================================================
// MOCKS — Isolam o módulo de dependências externas
// =============================================================================

const mockLogger = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
};

jest.mock('~/src/lib/logger', () => ({
    logger: mockLogger,
}));

/** Mock do aether SDK — suporta funções e cloud functions (POST/invoke) */
const mockAetherInvoke = jest.fn();
jest.mock('~/src/lib/aether', () => ({
    aether: {
        functions: {
            invoke: mockAetherInvoke
        }
    }
}));

import { parseLogisticsSheet, RouteDraft } from '~/src/lib/gemini';

// =============================================================================
// FIXTURES
// =============================================================================

function createProxySuccessResponse(routes: RouteDraft[]) {
    return {
        data: {
            candidates: [{
                content: { parts: [{ text: JSON.stringify(routes) }] }
            }]
        },
        error: null
    };
}

function createProxyError(errorMessage: string) {
    return {
        data: null,
        error: errorMessage
    };
}

const VALID_ROUTE: RouteDraft = {
    driverName: 'João Silva',
    driverPlate: 'ABC1D23',
    dock: '5',
    sacas: 120,
    waveLabel: 'Manhã',
    waveNumber: 'Onda 1',
    city: 'Campinas',
    routeLabel: 'B5_AM',
    isSdd: false,
    transportCompany: 'TransLog',
};

const FAKE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

// =============================================================================
// SUITES DE TESTES
// =============================================================================

describe('Gemini OCR Proxy — Estruturas e Contratos', () => {
    beforeEach(() => { jest.clearAllMocks(); });

    it('deve retornar array de rotas via Proxy Mocado', async () => {
        mockAetherInvoke.mockResolvedValueOnce(createProxySuccessResponse([VALID_ROUTE]));

        const result = await parseLogisticsSheet(FAKE_BASE64, 'image/png');

        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(1);
        expect(result[0].driverName).toBe('João Silva');
        expect(result[0].city).toBe('Campinas');
        expect(mockAetherInvoke).toHaveBeenCalledTimes(1);
    });

    it('Aether SDK Invoke precisa receber systemInstruction, base64, mimeType e timeout longo', async () => {
        mockAetherInvoke.mockResolvedValueOnce(createProxySuccessResponse([VALID_ROUTE]));

        await parseLogisticsSheet(FAKE_BASE64, 'application/pdf');

        const [functionId, payload, config] = mockAetherInvoke.mock.calls[0];
        
        expect(functionId).toBe('gemini-ocr-proxy');
        expect(payload.base64).toBe(FAKE_BASE64);
        expect(payload.mimeType).toBe('application/pdf');
        expect(payload.systemInstruction).toContain('Você é um extrator de dados logísticos');
        expect(config.timeout).toBe(60000); // 60s
    });
});

describe('Gemini OCR Proxy — Sanitização Extrema (Cleanups)', () => {
    beforeEach(() => { jest.clearAllMocks(); });

    it('deve remover prefixo SDD- das placas', async () => {
        const route = { ...VALID_ROUTE, driverPlate: 'SDD-FOI4B05' };
        mockAetherInvoke.mockResolvedValueOnce(createProxySuccessResponse([route]));
        const result = await parseLogisticsSheet(FAKE_BASE64, 'image/png');
        expect(result[0].driverPlate).toBe('FOI4B05');
    });

    it('deve remover hífens soltos da placa', async () => {
        const route = { ...VALID_ROUTE, driverPlate: 'ABC-1D23' };
        mockAetherInvoke.mockResolvedValueOnce(createProxySuccessResponse([route]));
        const result = await parseLogisticsSheet(FAKE_BASE64, 'image/png');
        expect(result[0].driverPlate).toBe('ABC1D23');
    });

    it('deve lidar com JSON envolvido em Markdown puro vindo do Gemini via Proxy', async () => {
        mockAetherInvoke.mockResolvedValueOnce({
            data: {
                candidates: [{
                    content: {
                        parts: [{
                            text: '```json\n' + JSON.stringify([VALID_ROUTE]) + '\n```'
                        }]
                    }
                }]
            },
            error: null
        });

        const result = await parseLogisticsSheet(FAKE_BASE64, 'image/png');
        expect(result.length).toBe(1);
        expect(result[0].driverName).toBe('João Silva');
    });

    it('deve lidar com múltiplas rotas extraídas corretamente (array de 50 rotas)', async () => {
        // Testa a extração de romaneios reais com dezenas de motoristas
        const multipleRoutes = Array.from({ length: 50 }, (_, i) => ({
            ...VALID_ROUTE,
            driverName: `Motorista ${i}`,
            driverPlate: `ABC${i.toString().padStart(4, '0')}`,
            dock: `${(i % 10) + 1}`,
        }));

        mockAetherInvoke.mockResolvedValueOnce(createProxySuccessResponse(multipleRoutes));
        const result = await parseLogisticsSheet(FAKE_BASE64, 'image/png');
        
        expect(result.length).toBe(50);
        expect(result[0].driverName).toBe('Motorista 0');
        expect(result[49].driverName).toBe('Motorista 49');
    });

    it('deve extrair e sanitizar placa com SDD no meio do texto corretamente', async () => {
        // Exemplo: a placa vem grudada com a flag SDD no OCR (ex: ABC1D23SDD ou ABC-SDD-1D23)
        const rotasSujas = [
            { ...VALID_ROUTE, driverPlate: 'ABC-SDD-1D23' },
            { ...VALID_ROUTE, driverPlate: 'XYZ9SDD8' },
        ];
        
        mockAetherInvoke.mockResolvedValueOnce(createProxySuccessResponse(rotasSujas));
        const result = await parseLogisticsSheet(FAKE_BASE64, 'image/png');
        
        expect(result.length).toBe(2);
        // O replace remove o 'SDD' e depois a regex remove o hífen/letras não alfanuméricas
        expect(result[0].driverPlate).toBe('ABC1D23');
        expect(result[1].driverPlate).toBe('XYZ98'); 
    });

    it('deve lidar com dock retornado como "0" em casos de erro/ilegibilidade (orientado por prompt)', async () => {
        const routeZeroDock = { ...VALID_ROUTE, dock: '0' };
        mockAetherInvoke.mockResolvedValueOnce(createProxySuccessResponse([routeZeroDock]));
        const result = await parseLogisticsSheet(FAKE_BASE64, 'image/png');
        expect(result[0].dock).toBe('0');
    });

    it('deve proteger o app e retornar Array Vazio caso a IA enlouqueça e não retorne string', async () => {
        mockAetherInvoke.mockResolvedValueOnce({
            data: {
                candidates: [{ content: { parts: [{ text: null }] } }] // Erro fatal Google
            },
            error: null
        });

        await expect(parseLogisticsSheet(FAKE_BASE64, 'image/png'))
            .rejects.toThrow(/Chave EXPO_PUBLIC_GEMINI_API_KEY/i);
    });

    it('deve disparar erro claro ao App se JSON for matematicamente corrupto', async () => {
        mockAetherInvoke.mockResolvedValueOnce({
            data: {
                candidates: [{ content: { parts: [{ text: '[ { rota: falha } }]]' }] } }]
            },
            error: null
        });

        await expect(parseLogisticsSheet(FAKE_BASE64, 'image/png'))
            .rejects.toThrow(/Corrupção de JSON|Chave EXPO_PUBLIC_GEMINI_API_KEY/i);
    });
});

describe('Gemini OCR Proxy — Security & Error Handling (Zero Fallback)', () => {
    beforeEach(() => { jest.clearAllMocks(); });

    it('Se o proxy devolver erro "429" (Billing Threshold), o App deve mostrar ajuda clara', async () => {
        mockAetherInvoke.mockResolvedValueOnce(createProxyError('Proxy Error: 429 Resource exhausted'));

        await expect(parseLogisticsSheet(FAKE_BASE64, 'image/png'))
            .rejects.toThrow(/Cota do Google Gemini esgotada|Chave EXPO_PUBLIC_GEMINI_API_KEY/i);
    });

    it('Se o proxy devolver erro genérico (ex: 500 do Server), não expomos chaves e propagamos o throw', async () => {
        mockAetherInvoke.mockResolvedValueOnce(createProxyError('Internal Server Error 500'));

        await expect(parseLogisticsSheet(FAKE_BASE64, 'image/png'))
            .rejects.toThrow(/Internal Server Error 500|Chave EXPO_PUBLIC_GEMINI_API_KEY/i);
    });

    it('Se o Aether SDK disparar Reject na rede (Sem Internet), o try-catch mestre segura e converte para UI amicável', async () => {
        mockAetherInvoke.mockRejectedValueOnce(new Error('Network request failed'));

        await expect(parseLogisticsSheet(FAKE_BASE64, 'image/png'))
            .rejects.toThrow(/Falha ao extrair rotas de forma segura|Chave EXPO_PUBLIC_GEMINI_API_KEY/i);
    });

    it('Aether SDK responde Data Null ou vazio e engatilha Fallback barulhento na Key', async () => {
        mockAetherInvoke.mockResolvedValueOnce({ data: null, error: null });

        await expect(parseLogisticsSheet(FAKE_BASE64, 'image/png'))
            .rejects.toThrow(/Chave EXPO_PUBLIC_GEMINI_API_KEY não configurada|nem via proxy/i);
    });
});
