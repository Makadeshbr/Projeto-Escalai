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
}

/**
 * Instrução de sistema para o Gemini — define EXATAMENTE o formato de saída.
 * Cada regra existe porque a IA misturava dock/routeLabel ou inventava campos.
 */
const SYSTEM_INSTRUCTION = `
Você é um extrator de dados logísticos (OCR Avançado). 
Eu fornecerei a imagem ou PDF em base64 de um romaneio de rotas de entregas.
Sua ÚNICA missão é me devolver um arquivo JSON (Array de objetos) contendo todas as rotas listadas no documento.

⚠️ REGRAS ESTRITAS DE FORMATAÇÃO E TIPAGEM:
O array deve seguir exatamente este formato TypeScript:

interface RouteDraft {
  driverName: string;       // Nome completo do motorista (Capitalize). Ex: "João Silva"
  driverPlate: string;      // ⚠️ Placa do veículo, SEMPRE UPPERCASE sem hífens. Ex: "ABC1D23". IMPORTANTE: Se a placa contiver o prefixo "SDD-" (ex: "SDD-FOI4B05"), REMOVA o prefixo e retorne APENAS a placa ("FOI4B05").
  dock: string;             // ⚠️ SOMENTE O NÚMERO DA DOCA/BALCÃO. É sempre NUMÉRICO. Ex: "1", "2", "10", "30", "45". NUNCA coloque código de rota aqui.
  sacas?: number;           // ⚠️ QUANTIDADE DE SACAS. É sempre NUMÉRICO. Se a coluna se chamar "Sacas", "Saca", "Qtd Sacas", "Volumes". Se não houver, não envie o campo ou envie 0.
  routeLabel: string;       // ⚠️ CÓDIGO ALFANUMÉRICO DA ROTA. Ex: "B5_AM", "SP_01", "RJ-ZONA-SUL", "R12". Este é o identificador comercial/operacional da rota.
  waveLabel: string;        // Turno do dia: Sempre retorne "Manhã" independente do horário.
  waveNumber: string;       // Número/Sigla da Onda. Ex: "Onda 1", "01", "W2". Se não houver, use "".
  city: string;             // ⚠️ NOME DA CIDADE/REGIÃO DE ENTREGA. Ex: "São Paulo", "Campinas", "Avaré". NÃO confunda com código de rota ou nome de transportadora.
  isSdd: boolean;           // true se houver indicador laranja, "SDD", placa começar com "SDD-", "Same Day", "Priority", "Entrega no mesmo dia".
  transportCompany: string; // Nome da transportadora/empresa. Se não houver, use "".
}

⚠️⚠️⚠️ REGRAS ANTI-CONFUSÃO (CRÍTICAS):

DOCK vs ROTA — COMO DIFERENCIAR:
- dock = NÚMERO puro da doca/balcão de saída. Geralmente 1 a 2 dígitos (1, 2, 10, 30). Se a coluna diz "Doca", "Balcão", "Gate", "Bay".
- routeLabel = CÓDIGO alfanumérico da rota. Contém letras E números ou underscores (B5_AM, SP_01, R12, AVR-003). Se a coluna diz "Rota", "Route", "Cód. Rota", "Código".
- SE O VALOR CONTÉM LETRAS + NÚMEROS (como "B5_AM"), ele é routeLabel, NÃO dock.
- SE O VALOR É SOMENTE NÚMEROS (como "10"), ele é dock.

CITY — COMO IDENTIFICAR:
- city = sempre é o NOME REAL de uma cidade ou região (São Paulo, Campinas, Avaré, Zona Sul).
- NÃO confunda com siglas de rota (B5_AM NÃO é cidade), nem nome de transportadora, nem nome de motorista.
- Procure colunas: "Cidade", "Destino", "Praça", "Região", "City".

REGRAS DE CONFORMIDADE:
- IGNORAR títulos de tabelas, sumários, cabeçalhos que não sejam dados de rota.
- NUNCA introduza texto conversacional. Devolva APENAS O ARRAY JSON [].
- CORRIJA erros lógicos de OCR: "ABC-l098" → "ABC1098", "O" (letra) → "0" (zero) em placas.
- Se um campo não existir no documento, use string vazia "".
- CADA LINHA DO ROMANEIO = 1 objeto no array.
`;

/**
 * API Key do Gemini para chamada direta (fallback quando proxy falha).
 * Disponível via variável pública do Expo.
 */
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

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
            systemInstruction: SYSTEM_INSTRUCTION
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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

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
            temperature: 0.1,
            response_mime_type: 'application/json'
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

/**
 * Sanitiza placas de veículos extraídas pela IA.
 * Remove prefixo SDD-, hífens, espaços e força uppercase.
 *
 * @param routes - Array bruto de rotas da IA
 * @returns Array sanitizado
 */
function sanitizeRoutes(routes: RouteDraft[]): RouteDraft[] {
    return routes.map(route => {
        let cleanPlate = route.driverPlate || '';
        // Se a IA mandou SDD-ABC1234, extrai só o ABC1234
        cleanPlate = cleanPlate.replace(/SDD-?/i, '');
        // Remove qualquer outro hífen ou espaço que a IA inventar
        cleanPlate = cleanPlate.replace(/[^A-Z0-9]/gi, '').toUpperCase();

        return {
            ...route,
            driverPlate: cleanPlate
        };
    });
}
