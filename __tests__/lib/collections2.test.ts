import { 
    formatBrazilTimestamp, 
    formatBrazilTime, 
    getTodayDateStr, 
    getTomorrowDateStr,
    getBrazilNow,
    getDeadlineForDate,
    getTimeRemainingMs
} from '../../src/lib/collections';

describe('Colecoes - Funcionalidades de Timezone e Regras de Negocio', () => {

    beforeAll(() => {
        // Garantir que a variavel de ambiente do Node nao influencie (Mocking UTC server environment)
        process.env.TZ = 'UTC';
    });

    describe('Conversoes de Tempo BRT (America/Sao_Paulo)', () => {
        it('formatBrazilTimestamp - Deve gerar um timestamp com offset -03:00', () => {
            const timestamp = formatBrazilTimestamp();
            
            // O formato deve ser ISO terminando em -03:00
            // Exemplo: 2026-03-05T20:35:00-03:00
            expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/);
        });

        it('formatBrazilTime - Formatar DateTime raw em hh:mm ignorando fuso da string de entrada', () => {
            // String sem timezone explicito (assumida como UTC se parseada cruamente ou local)
            // Fixando um timestamp UTC absoluto. "14:00Z" significa "14:00 em Greenwich". No Brasil, sao 11:00.
            const utcTimestamp = '2026-03-05T14:00:00Z'; 
            
            const displayTime = formatBrazilTime(utcTimestamp);
            expect(displayTime).toBe('11:00');
        });

        it('formatBrazilTime - Formatar com inclusao de data', () => {
            const utcTimestamp = '2026-03-05T14:00:00Z'; // 11:00 BRT
            
            const displayTime = formatBrazilTime(utcTimestamp, true);
            // O padrao Intl para pt-BR geralmente e '11:00, 05/03' ou '11:00 05/03' dependendo do Node
            // Apenas garanto que reflete corretamente o relogio
            expect(displayTime).toContain('11:00');
            expect(displayTime).toContain('05/03');
        });

        it('formatBrazilTime - Falta de data ou string invalida retorna "--:--"', () => {
            expect(formatBrazilTime('data_invalida_string_xyz')).toBe('--:--');
            expect(formatBrazilTime('')).toBe('--:--');
        });
    });

    describe('Limites do Relogio na Virada do Dia (getTodayDateStr / getTomorrowDateStr)', () => {
        // Usamos spy do Jest sobre a Date global para testar a "Meia Noite" absoluta
        
        beforeAll(() => {
            jest.useFakeTimers();
        });

        afterAll(() => {
            jest.useRealTimers();
        });

        it('Deve computar getTodayDateStr e getTomorrowDateStr corretamente com base no fuso SP', () => {
            // Simular relogio global como 5 de Marco, as 02:00 da madrugada UTC
            // NO BRASIL (-3): 4 de Marco, as 23:00 da NOITE.
            jest.setSystemTime(new Date('2026-03-05T02:00:00Z'));

            expect(getTodayDateStr()).toBe('2026-03-04'); // Tem que ser ontem no calendario real BR!
            expect(getTomorrowDateStr()).toBe('2026-03-05'); // Amanha no BR seria dia 5
        });

        it('Apoio de virada de dia - Quando vira para 05/03 00:01 no BR', () => {
             // Simular relogio global como 5 de Marco, as 03:01 da madrugada UTC
             // NO BRASIL (-3): 5 de Marco, as 00:01 da MADRUGADA. Agora o dia virou!
             jest.setSystemTime(new Date('2026-03-05T03:01:00Z'));
 
             expect(getTodayDateStr()).toBe('2026-03-05'); // Virou o relogio pro dia atual BR!
             expect(getTomorrowDateStr()).toBe('2026-03-06');
        });
    });

    describe('Sistema de Deadline Automatico de Rotas (getDeadlineForDate)', () => {
        beforeAll(() => {
            jest.useFakeTimers();
        });

        afterAll(() => {
            jest.useRealTimers();
        });

        it('De Segunda a Sabado o deadline e calculado para as 18:00 no Brasil', () => {
            // 6 de Marco de 2026 sera uma Sexta-feira
            // Configurar relogio as 12:00 PM UTC (09:00 AM em Sao Paulo, Sexta-feira)
            jest.setSystemTime(new Date('2026-03-06T12:00:00Z')); // Sexta-feira
            
            const deadline = getDeadlineForDate('2026-03-06');
            
            // O prazo resultante tem que bater com 18:00 local (21:00 UTC)!
            expect(deadline.getHours()).toBe(18); // Horario local deve apontar pra 18
            expect(deadline.getMinutes()).toBe(0);
        });

        it('Aos Domingos o deadline cai para 12:00 no Brasil', () => {
            // 8 de Marco de 2026 sera um Domingo
            // Configurar relogio para 09:00 AM SP (12:00 UTC) domingo
            jest.setSystemTime(new Date('2026-03-08T12:00:00Z')); // Domingo
            
            const deadline = getDeadlineForDate('2026-03-08');
            
            expect(deadline.getHours()).toBe(12); // Testar dia de domingo
            expect(deadline.getMinutes()).toBe(0);
        });

        it('Calculo Time Remaining lida corretamente antes e depois com tempo real BRT', () => {
            // Sexta-feira as 17:50 PM em Sao Paulo (Faltam exatos 10 minutos para as 18:00!)
            // 17h50 SP = 20h50 UTC
            jest.setSystemTime(new Date('2026-03-06T20:50:00Z'));
            
            // Se faltam 10 minutos = 10 * 60 * 1000 milissegundos = 600.000
            const leftMs = getTimeRemainingMs('2026-03-06');
            expect(leftMs).toBe(10 * 60 * 1000); 

            // Avancando para as 18:05 PM em Sao Paulo (Passou do prazo!)
            jest.setSystemTime(new Date('2026-03-06T21:05:00Z'));
            const passedMs = getTimeRemainingMs('2026-03-06');
            
            // Nao deve estourar com conta negativa, deve cap em 0.
            expect(passedMs).toBe(0);
        });
    });
}); 
