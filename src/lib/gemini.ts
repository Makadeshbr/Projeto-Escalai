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

export async function parseLogisticsSheet(base64String: string, mimeType: string): Promise<RouteDraft[]> {
    try {
        logger.info('[Gemini AI]', 'Iniciando extração via Aether Cloud Function OCR Proxy...');
        
        // Chamada segura e encampsulada pelo Node.js/Vercel (Aether Plattform)
        // O Client SDK passa Bearer e Project-ID silenciosamente
        const result = await aether.functions.invoke<any>('gemini-ocr-proxy', {
            base64: base64String,
            mimeType,
            systemInstruction: SYSTEM_INSTRUCTION
        }, { timeout: 60000 }); // Permite OCR de romaneios de até ~2-3 páginas com segurança

        if (result.error) {
            logger.error('[Gemini AI]', 'Aether Proxy rejeitou a operação:', result.error);
            // Captura explicitamente bloqueio por cota (retorno 429 propagado pela CF)
            if (typeof result.error === 'string' && result.error.includes('429')) {
                throw new Error('Cota do Google Gemini esgotada no Backend Aether. Adicione créditos no AI Studio.');
            }
            throw new Error(result.error);
        }

        if (!result.data) {
            throw new Error('Proxy respondeu SUCESSO, porém sem os dados do OCR.');
        }

        logger.info('[Gemini AI]', 'Extração via proxy bem-sucedida!');
        return cleanRawData(result.data);

    } catch (e: any) {
        logger.error('[Gemini AI]', 'Erro fatal na pipeline OCR (SDK/Proxy):', e);
        throw new Error(`Falha ao extrair rotas de forma segura: ${e.message}`);
    }
}

/**
 * Função utilitária para limpar a resposta e extrair JSON da IA do Proxy.
 */
function cleanRawData(dataResponse: any): RouteDraft[] {
    let rawJsonString = dataResponse.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!rawJsonString || typeof rawJsonString !== 'string') {
        logger.warn('[Gemini AI]', 'Fallback: Proxy retornou payload irregular, assumindo array vazio', dataResponse);
        return [];
    }

    // Cleanup markdown artifacts if any slip through
    const cleanString = rawJsonString.replace(/```json/g, '').replace(/```/g, '').trim();

    let rawData: RouteDraft[] = [];
    try {
        rawData = JSON.parse(cleanString);
    } catch (err: any) {
        logger.error('[Gemini AI]', 'A IA não devolveu um JSON válido.', cleanString);
        throw new Error('Formato logístico retornado foi processado mas é ilegível pelo App (Corrupção de JSON).');
    }

    if (!Array.isArray(rawData)) {
        logger.warn('[Gemini AI]', 'Fallback: IA retornou JSON não-Array', rawData);
        return [];
    }

    // Limpeza rigorosa a nível de código: a IA às vezes ignora o prompt
    const sanitizedData = rawData.map(route => {
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

    return sanitizedData;
}

