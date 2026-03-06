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
Você é um extrator de dados logísticos de precisão absoluta (OCR Espacial Avançado). 
Eu fornecerei a imagem ou PDF em base64 de um romaneio de rotas.
Sua ÚNICA missão é me devolver um array JSON contendo todas as rotas.

⚠️ REGRAS ESTRITAS DE FORMATAÇÃO E TIPAGEM:
O array deve seguir exatamente este formato TypeScript:

interface RouteDraft {
  driverName: string;       // Nome completo do motorista (Capitalize). Ex: "João Silva"
  driverPlate: string;      // Placa (UPPERCASE sem hífens). Importante: Remova o prefixo "SDD-" se existir. Ex: "ABC1D23".
  dock: string;             // ⚠️ DOCA/BALCÃO. ATENÇÃO MÁXIMA AQUI. Leia EXATAMENTE na linha horizontal correspondente à placa. É SEMPRE NUMÉRICO ("1", "2", "10"). Nunca confunda com informações numéricas da linha de cima ou de baixo. Se estiver em branco ou ilegível, não chute, envie "0".
  sacas?: number;           // QUANTIDADE DE SACAS. Valor inteiro correspondente à linha.
  routeLabel: string;       // CÓDIGO DA ROTA (Letras + Números). Ex: "B5_AM", "SP_01".
  waveLabel: string;        // Turno: Sempre retorne "Manhã".
  waveNumber: string;       // Número/Sigla da Onda. Ex: "Onda 1", "01". Se não houver, use "".
  city: string;             // CIDADE REAL. Não confunda com as siglas da Rota.
  isSdd: boolean;           // true se houver texto "SDD" na placa ou linha.
  transportCompany: string; // Nome da transportadora/empresa. Se não houver, use "".
}

⚠️⚠️ ALINHAMENTO ESPACIAL (MUITO IMPORTANTE):
1. Preste MUITA atenção ao alinhamento vertical e horizontal das linhas da planilha!
2. Ocasionalmente você erra misturando a DOCA da linha inferior com o Motorista da linha atual. Siga uma linha horizontal estrita com os olhos. Um motorista = uma linha. A Doca da mesma linha pertence A ELE, e a ninguém mais.
3. Se a linha não tiver um MOTORISTA ou PLACA óbvia, pule-a, pois não é uma atribuição válida.
4. Ao final, audite os números da Doca e veja se correspondem à imagem. O seu modelo de geometria tem capacidade superior. Utilize-a.
5. Devolva APENAS O ARRAY JSON []. Sem markdown.
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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`;

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
