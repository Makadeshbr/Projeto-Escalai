import { logger } from '~/src/lib/logger';
import { aether } from '~/src/lib/aether';

export interface RouteDraft {
    driverName: string;
    driverPlate: string;
    dock: string;
    sacas?: number;
    waveLabel: string;
    waveNumber: string;     // "Onda 1", "01", etc. (sigla da Onda/Rota no romaneio)
    city: string;
    routeLabel: string;
    isSdd: boolean;
    transportCompany: string;
    lowConfidence?: boolean;        // Flag: IA pode ter errado este registro
    lowConfidenceFields?: string[]; // Quais campos específicos são duvidosos
}

/**
 * Instrução de sistema para o Gemini — define EXATAMENTE o formato de saída.
 * Cada regra existe porque a IA misturava dock/routeLabel ou inventava campos.
 */
const SYSTEM_INSTRUCTION = `
Você é um extrator OCR de romaneios logísticos.

# PASSO 1 — IDENTIFICAR COLUNAS PELOS CABEÇALHOS:

Leia a PRIMEIRA LINHA (cabeçalhos) da tabela. A ordem pode variar. Identifique cada coluna pelo nome:
- CIDADE: cabeçalho contém "cidade"
- ROTA: cabeçalho contém "otimizada", "rota"
- PLACA: cabeçalho contém "placa"
- MOTORISTA: cabeçalho contém "motorista", "nome"
- ONDA: cabeçalho contém "onda", "wave"
- DOCA: cabeçalho contém "doca", "box", "baia", "balcão"
- SACAS: cabeçalho contém "sacas", "saca", "qtd"
- TRANSPORTADORA: cabeçalho contém "transportadora", "empresa"

# PASSO 2 — DIFERENCIAR DOCA vs SACAS:

⚠️ CRÍTICO: DOCA e SACAS são colunas DIFERENTES, ambas numéricas e geralmente lado a lado!
- DOCA = número do box/balcão (geralmente 1 a 50)
- SACAS = quantidade de sacas (frequentemente 0, 1, 2, 3...)
- Identifique cada uma PELO CABEÇALHO, não pela posição
- Se uma coluna tem muitos "0", provavelmente é SACAS, não DOCA

# PASSO 3 — EXTRAIR LINHA POR LINHA:

Para cada linha com PLACA de veículo:
- Siga a linha horizontal estrita
- Leia cada valor na coluna correta conforme identificado no Passo 1
- Nunca misture valores entre colunas

# FORMATO JSON (retorne APENAS o array, sem markdown):

[{
  "driverName": "Nome Completo",
  "driverPlate": "ABC1D23",
  "dock": "33",
  "sacas": 4,
  "routeLabel": "A5_AM",
  "waveLabel": "Manhã",
  "waveNumber": "Onda 2",
  "city": "Barao de antonina",
  "isSdd": false,
  "transportCompany": ""
}]

# REGRAS:
- driverPlate: UPPERCASE, sem hífens, remova prefixo "SDD-"
- dock: string do valor na coluna DOCA (identificada pelo cabeçalho). NUNCA copie valor de SACAS. Se não existir coluna DOCA, use ""
- sacas: número inteiro da coluna SACAS (identificada pelo cabeçalho). Se 0, retorne 0. Se não existir coluna, omita
- waveLabel: sempre "Manhã"
- waveNumber: texto exato da coluna Onda ("Onda 1", "Onda 2", etc.)
- city: texto exato da coluna Cidade
- routeLabel: código da coluna Rota/Otimizada
- isSdd: true se "SDD" aparecer na placa ou linha
- transportCompany: nome da empresa se existir coluna, senão ""
- Pule linhas sem PLACA
- Retorne APENAS o array JSON []
`;

/**
 * API Key do Gemini para chamada direta (fallback quando proxy falha).
 * Disponível via variável pública do Expo.
 */
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

/**
 * JSON Schema que FORÇA o Gemini a retornar exatamente a estrutura esperada.
 * Cada description reforça a distinção entre campos confusos (DOCA vs SACAS).
 */
const ROUTE_SCHEMA = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            driverName:       { type: 'string', description: 'Nome completo do motorista' },
            driverPlate:      { type: 'string', description: 'Placa do veiculo, UPPERCASE, sem hifens, sem prefixo SDD-' },
            dock:             { type: 'string', description: 'Numero da DOCA/box (coluna com cabecalho DOCA/box/baia). NAO confundir com SACAS. Geralmente 1 a 50.' },
            sacas:            { type: 'integer', description: 'Quantidade de sacas (coluna com cabecalho SACAS/saca/qtd). Geralmente 0 a 10. Diferente de DOCA.' },
            waveLabel:        { type: 'string', description: 'Turno: Manha ou Tarde' },
            waveNumber:       { type: 'string', description: 'Numero da onda exato da tabela: Onda 1, Onda 2, etc.' },
            city:             { type: 'string', description: 'Nome da cidade exato da tabela' },
            routeLabel:       { type: 'string', description: 'Codigo da rota/otimizada' },
            isSdd:            { type: 'boolean', description: 'true se SDD aparece na placa ou linha' },
            transportCompany: { type: 'string', description: 'Nome da transportadora se existir coluna, senao string vazia' },
        },
        required: ['driverName', 'driverPlate', 'dock', 'waveLabel', 'waveNumber', 'city', 'routeLabel', 'isSdd', 'transportCompany'],
    },
};

/**
 * Extrai rotas de um romaneio logístico (imagem/PDF) via Gemini AI.
 *
 * Estratégia Enterprise (2 camadas):
 * 1. Tenta via Aether Cloud Function (proxy seguro, sem API key no client)
 * 2. Se o proxy retornar {} vazio, faz chamada direta à API Gemini
 *
 * @param base64String - Conteúdo do arquivo em base64
 * @param mimeType - Tipo MIME do arquivo (image/jpeg, image/png, application/pdf)
 * @returns Array de RouteDraft com todas as rotas extraídas
 */
export async function parseLogisticsSheet(base64String: string, mimeType: string): Promise<RouteDraft[]> {
    // === CAMADA 1: Tentativa via Aether Cloud Function Proxy ===
    try {
        logger.info('[Gemini AI]', 'Tentando extração via Aether Cloud Function...');

        const result = await aether.functions.invoke<any>('gemini-ocr-proxy', {
            base64: base64String,
            mimeType,
            systemInstruction: SYSTEM_INSTRUCTION,
            responseSchema: ROUTE_SCHEMA,
        }, { timeout: 60000 });

        if (!result.error && result.data) {
            const dataStr = JSON.stringify(result.data);

            // Verifica se o proxy retornou dados reais (não vazio)
            if (dataStr !== '{}' && dataStr !== 'null' && dataStr.length > 5) {
                logger.info('[Gemini AI]', 'Proxy retornou dados! Processando...');
                logger.info('[Gemini AI]', 'Preview:', dataStr.substring(0, 300));
                return cleanRawData(result.data);
            }
        }

        // Se chegou aqui, proxy retornou vazio ou erro — cai pro fallback
        logger.warn('[Gemini AI]', 'Proxy retornou vazio ou erro. Usando chamada direta como fallback.');

    } catch (proxyErr: any) {
        logger.warn('[Gemini AI]', 'Proxy falhou, usando fallback direto:', proxyErr.message);
    }

    // === CAMADA 2: Chamada direta à API Gemini (fallback) ===
    return callGeminiDirectly(base64String, mimeType);
}

/**
 * Chamada direta à API REST do Google Gemini.
 * Usado como fallback quando a Cloud Function do Aether não retorna dados.
 *
 * @param base64String - Conteúdo do arquivo em base64
 * @param mimeType - Tipo MIME do arquivo
 * @returns Array de RouteDraft extraído pela IA
 */
async function callGeminiDirectly(base64String: string, mimeType: string): Promise<RouteDraft[]> {
    if (!GEMINI_API_KEY) {
        throw new Error(
            'Chave EXPO_PUBLIC_GEMINI_API_KEY não configurada. ' +
            'Não é possível chamar a IA diretamente nem via proxy.'
        );
    }

    logger.info('[Gemini AI]', 'Chamada direta à API Gemini (fallback)...');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`;

    const payload = {
        system_instruction: { parts: { text: SYSTEM_INSTRUCTION } },
        contents: [{
            parts: [{
                inline_data: {
                    mime_type: mimeType,
                    data: base64String
                }
            }]
        }],
        generationConfig: {
            temperature: 1.0,
            response_mime_type: 'application/json',
            response_json_schema: ROUTE_SCHEMA,
            media_resolution: 'MEDIA_RESOLUTION_MEDIUM',
            thinking_config: { thinking_level: 'medium' }
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = errorData?.error?.message || `HTTP ${response.status}`;

            if (response.status === 429) {
                throw new Error('Cota do Google Gemini esgotada. Aguarde ou adicione créditos no AI Studio.');
            }
            throw new Error(`Gemini API erro: ${errorMsg}`);
        }

        const data = await response.json();

        logger.info('[Gemini AI]', 'Resposta direta recebida!');
        logger.info('[Gemini AI]', 'Keys:', Object.keys(data));

        return cleanRawData(data);

    } catch (e: any) {
        logger.error('[Gemini AI]', 'Erro na chamada direta:', e.message);

        if (e.message.includes('Cota')) throw e;
        throw new Error(`Falha na extração OCR: ${e.message}`);
    }
}

/**
 * Extrai o JSON de rotas do payload da IA (aceita múltiplos formatos).
 * O Gemini pode retornar em diferentes estruturas dependendo da versão/proxy.
 *
 * @param dataResponse - Resposta bruta da IA (formato variável)
 * @returns Array de RouteDraft sanitizado
 */
function cleanRawData(dataResponse: any): RouteDraft[] {
    let rawJsonString: string | undefined;

    // === TENTATIVA 1: Formato padrão Gemini REST API ===
    // { candidates: [{ content: { parts: [{ text: "..." }] } }] }
    rawJsonString = dataResponse?.candidates?.[0]?.content?.parts?.[0]?.text;

    // === TENTATIVA 2: { text: "..." } direto ===
    if (!rawJsonString && typeof dataResponse?.text === 'string') {
        rawJsonString = dataResponse.text;
    }

    // === TENTATIVA 3: { response: { text: "..." } } ===
    if (!rawJsonString && typeof dataResponse?.response?.text === 'string') {
        rawJsonString = dataResponse.response.text;
    }

    // === TENTATIVA 4: { result: "..." } como string JSON ===
    if (!rawJsonString && typeof dataResponse?.result === 'string') {
        rawJsonString = dataResponse.result;
    }

    // === TENTATIVA 5: { response: { candidates... } } (wrapper extra) ===
    if (!rawJsonString && dataResponse?.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
        rawJsonString = dataResponse.response.candidates[0].content.parts[0].text;
    }

    // === TENTATIVA 6: dataResponse é a string diretamente ===
    if (!rawJsonString && typeof dataResponse === 'string') {
        rawJsonString = dataResponse;
    }

    // === TENTATIVA 7: dataResponse já é array (proxy fez o parse) ===
    if (!rawJsonString && Array.isArray(dataResponse)) {
        logger.info('[Gemini AI]', `Array direto com ${dataResponse.length} rotas`);
        return sanitizeRoutes(dataResponse);
    }

    if (!rawJsonString || typeof rawJsonString !== 'string') {
        logger.error('[Gemini AI]', 'Nenhum formato reconhecido:', JSON.stringify(dataResponse).substring(0, 500));
        throw new Error('A IA retornou um formato irreconhecível. Tente enviar uma imagem mais nítida.');
    }

    // Limpa artefatos de markdown que a IA pode incluir
    const cleanString = rawJsonString.replace(/```json/g, '').replace(/```/g, '').trim();

    let rawData: RouteDraft[];
    try {
        rawData = JSON.parse(cleanString);
    } catch (err: any) {
        logger.error('[Gemini AI]', 'JSON inválido:', cleanString.substring(0, 300));
        throw new Error('A IA retornou texto, mas o JSON está corrompido. Tente com outra imagem.');
    }

    if (!Array.isArray(rawData)) {
        logger.warn('[Gemini AI]', 'IA retornou JSON não-Array');
        return [];
    }

    logger.info('[Gemini AI]', `Extraídas ${rawData.length} rotas com sucesso!`);
    return sanitizeRoutes(rawData);
}

// Placa Mercosul brasileira: 3 letras + 1 número + 1 alfanumérico + 2 números
const PLATE_REGEX = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
// Dock válido: número 1-999
const DOCK_REGEX = /^[1-9][0-9]{0,2}$/;

/**
 * Sanitiza e valida rotas extraídas pela IA.
 * Remove prefixos, força uppercase, e marca campos duvidosos com lowConfidence.
 */
function sanitizeRoutes(routes: RouteDraft[]): RouteDraft[] {
    return routes.map(route => {
        const fields: string[] = [];

        // --- Placa ---
        let cleanPlate = (route.driverPlate || '').replace(/SDD-?/i, '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
        if (cleanPlate && !PLATE_REGEX.test(cleanPlate)) {
            fields.push('driverPlate');
        }

        // --- Dock ---
        let cleanDock = (route.dock || '').toString().trim();
        if (cleanDock === '0') {
            logger.warn('[Gemini AI]', `Dock "0" para placa ${cleanPlate} — substituído por vazio`);
            cleanDock = '';
        }
        if (cleanDock && !DOCK_REGEX.test(cleanDock)) {
            fields.push('dock');
        }
        if (!cleanDock) {
            fields.push('dock');
        }

        // --- Sacas (range 0-99) ---
        if (route.sacas !== undefined && (route.sacas < 0 || route.sacas > 99)) {
            fields.push('sacas');
        }

        // --- Wave (deve conter "Onda" + número) ---
        if (route.waveNumber && !/onda\s*\d/i.test(route.waveNumber)) {
            fields.push('waveNumber');
        }

        return {
            ...route,
            driverPlate: cleanPlate,
            dock: cleanDock,
            lowConfidence: fields.length > 0 ? true : undefined,
            lowConfidenceFields: fields.length > 0 ? [...new Set(fields)] : undefined,
        };
    });
}

/**
 * Distância de Levenshtein entre duas strings.
 * Usada para fuzzy-match de placas e cidades com erros de 1-2 caracteres.
 */
function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

/**
 * Encontra o candidato mais próximo por Levenshtein (máx 1 char de diferença).
 */
function findClosestMatch(target: string, candidates: string[]): string | null {
    if (!target || candidates.length === 0) return null;
    for (const candidate of candidates) {
        if (levenshtein(target, candidate) <= 1) return candidate;
    }
    return null;
}

/**
 * Cross-reference: compara rotas extraídas contra dados REAIS do banco.
 * Auto-corrige placas e cidades com erros de 1 caractere (OCR leu errado).
 * Marca como lowConfidence campos que não batem com nenhum dado conhecido.
 */
export function crossReferenceRoutes(
    routes: RouteDraft[],
    knownPlates: string[],
    knownCities: string[],
): RouteDraft[] {
    return routes.map(route => {
        const fields: string[] = [...(route.lowConfidenceFields || [])];

        // --- Auto-correção de placa ---
        const cleanPlate = route.driverPlate.replace(/[^A-Z0-9]/g, '');
        if (cleanPlate && !knownPlates.includes(cleanPlate)) {
            const closest = findClosestMatch(cleanPlate, knownPlates);
            if (closest) {
                logger.info('[CrossRef]', `Placa ${cleanPlate} → auto-corrigida para ${closest}`);
                route = { ...route, driverPlate: closest };
            } else if (!fields.includes('driverPlate')) {
                fields.push('driverPlate');
            }
        }

        // --- Auto-correção de cidade ---
        const upperCity = (route.city || '').trim().toUpperCase();
        if (upperCity && knownCities.length > 0 && !knownCities.includes(upperCity)) {
            const closestCity = findClosestMatch(upperCity, knownCities);
            if (closestCity) {
                logger.info('[CrossRef]', `Cidade "${route.city}" → auto-corrigida para "${closestCity}"`);
                route = { ...route, city: closestCity };
            } else if (!fields.includes('city')) {
                fields.push('city');
            }
        }

        return {
            ...route,
            lowConfidence: fields.length > 0 ? true : route.lowConfidence,
            lowConfidenceFields: fields.length > 0 ? [...new Set(fields)] : route.lowConfidenceFields,
        };
    });
}
