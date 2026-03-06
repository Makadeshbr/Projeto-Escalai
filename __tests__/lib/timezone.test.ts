import { extractBrazilDateStr, formatBrazilTimestamp } from '../../src/lib/collections';

describe('Timezone and Midnight Boundary Tests', () => {
    // Simulando o timezone de São Paulo e garantindo comportamento
    // de rotas que foram criadas num dia UTC mas que no Brasil é outro (ou vice-versa)

    it('deve extrair a data correta do Brasil ignorando o ambiente e fuso horario da maquina', () => {
        // Criado as 02:00 AM UTC de 22 de Fevereiro
        // No Brasil (UTC-3), isso foi as 23:00 do dia 21 de Fevereiro!
        // O motorista NAO deve ver as rotas criadas na madrugada europeia no dia 22 do Brasil,
        // mas sim do dia anterior (21).
        const rawUTC = '2026-02-22T02:00:00Z'; 
        const result = extractBrazilDateStr(rawUTC);
        
        expect(result).toBe('2026-02-21');
    });

    it('deve formatar corretamente a data local de hoje no Brasil a partir de timestamps retroativos', () => {
        // Criado as 03:00 AM UTC de 22 de Fevereiro
        // No Brasil (UTC-3), isso é exatamente Meia Notie (00:00) do dia 22 de Fevereiro!
        const rawUTCMidnight = '2026-02-22T03:00:00Z';
        const midnightResult = extractBrazilDateStr(rawUTCMidnight);

        expect(midnightResult).toBe('2026-02-22');
    });

    it('suporta timestamps complexos formatados originalmente com off-set -03:00', () => {
        // Um timestamp gerado pelo proprio backend BRT (nosso formatBrazilTimestamp)
        const brtPayload = '2026-03-05T20:35:00-03:00';
        const expectedDate = '2026-03-05';
        
        expect(extractBrazilDateStr(brtPayload)).toBe(expectedDate);
    });

    it('Simula o Dashboard - Rejeicao de Dia Anterior na virada da Meia-Noite', () => {
        // A situacao: um motorista abre a tela as 23:50.
        // As 00:05 a tela recarrega.
        
        // Simular o relogio real ao recarregar a tela a 00:05 do dia 6 de Marco
        const clockAt0005 = new Date('2026-03-06T00:05:00-03:00');
        const spTime = new Date(clockAt0005.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        const currentDayStr = `${spTime.getFullYear()}-${String(spTime.getMonth() + 1).padStart(2, '0')}-${String(spTime.getDate()).padStart(2, '0')}`;

        expect(currentDayStr).toBe('2026-03-06'); // App avaliou o hoje vivo do sistema.

        // DB tem 2 assignment criados: um em 5 de Marco (23:50) e um em 6 de Marco (00:01)
        const dbMock = [
            { id: 1, createdAt: '2026-03-05T23:50:00-03:00' }, // Ontem (antigo fantasma)
            { id: 2, createdAt: '2026-03-06T00:01:00-03:00' }  // Hoje (Valido)
        ];

        const todayFiltered = dbMock.filter(a => extractBrazilDateStr(a.createdAt) === currentDayStr);

        // A filtragem deve reter apenas a de hoje, expelindo o Fantasma.
        expect(todayFiltered).toHaveLength(1);
        expect(todayFiltered[0].id).toBe(2);
    });
});
