// Serviço Reescrito: Usando REST puro (Fetch) para evitar crashes do Node/React Native Worklets no Expo Go.
// Injeta com segurança se houver. Em produção, isso vira ENV nativo.
const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY || 'AIzaSyAsnjpIuGuhtV4OaYdv9KWYEEIzZHMtLfM'; // Fallback to user key for testing

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
  driverPlate: string;      // Placa do veículo, SEMPRE UPPERCASE sem hífens. Ex: "ABC1D23"
  dock: string;             // ⚠️ SOMENTE O NÚMERO DA DOCA/BALCÃO. É sempre NUMÉRICO. Ex: "1", "2", "10", "30", "45". NUNCA coloque código de rota aqui.
  sacas?: number;           // ⚠️ QUANTIDADE DE SACAS. É sempre NUMÉRICO. Se a coluna se chamar "Sacas", "Saca", "Qtd Sacas", "Volumes". Se não houver, não envie o campo ou envie 0.
  routeLabel: string;       // ⚠️ CÓDIGO ALFANUMÉRICO DA ROTA. Ex: "B5_AM", "SP_01", "RJ-ZONA-SUL", "R12". Este é o identificador comercial/operacional da rota.
  waveLabel: string;        // Turno do dia: "Manhã", "Tarde" ou "Noite". Baseie-se no horário se disponível.
  waveNumber: string;       // Número/Sigla da Onda. Ex: "Onda 1", "01", "W2". Se não houver, use "".
  city: string;             // ⚠️ NOME DA CIDADE/REGIÃO DE ENTREGA. Ex: "São Paulo", "Campinas", "Avaré". NÃO confunda com código de rota ou nome de transportadora.
  isSdd: boolean;           // true se houver indicador laranja, "SDD", "Same Day", "Priority", "Entrega no mesmo dia".
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
    if (!apiKey) {
        throw new Error('API Key do Gemini não encontrada.');
    }

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        const payload = {
            system_instruction: {
                parts: { text: SYSTEM_INSTRUCTION }
            },
            contents: [
                {
                    parts: [
                        { inline_data: { mime_type: mimeType, data: base64String } }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.1,
                response_mime_type: "application/json"
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            if (response.status === 429) {
                // Erro de Limite de Cota/Billing do Google (Free Tier limit: 0)
                throw new Error('As requisições gratuitas da sua Chave do Google estão esgotadas ou bloqueadas (Erro 429). Você precisa acessar o Google AI Studio e cadastrar o Cartão de Crédito (Pagamento por uso) ou o plano gratuito não está disponível para esta conta/região.');
            }
            throw new Error(`Google API Http Error: ${response.status} - ${errorText}`);
        }

        const dataResponse = await response.json();

        let rawJsonString = dataResponse.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        // Cleanup markdown artifacts if any slip through
        const cleanString = rawJsonString.replace(/```json/g, '').replace(/```/g, '').trim();

        const data: RouteDraft[] = JSON.parse(cleanString);
        return data;

    } catch (e: any) {
        console.error('[Gemini AI] Erro no OCR ou Parse JSON:', e);
        throw new Error(`Falha ao extrair rotas nativamente: ${e.message}`);
    }
}
