/**
 * Testes de integração para a lógica de filtragem do useDashboardData.
 * Agora fortalecido: Testando a resiliência a mutabilidade da SDK (_payload).
 */

import { extractBrazilDateStr, getTodayDateStr } from '~/src/lib/collections';
import { validateArray, AssignmentSchema } from '~/src/lib/schemas';

// =============================================================================
// FUNÇÕES PURAS (replicadas da arquitetura REST/SDK atual)
// =============================================================================

function filterTodayAssignments(
    allAssignmentsRaw: any[],
    todayStr: string,
    userId: string
): any[] {
    // 1. A nova proteção embutida: o Validador e Extrator universal
    const validAssignments = validateArray(allAssignmentsRaw, AssignmentSchema, 'assignments');

    // 2. Filtro estrito por data e ownership
    const todays = validAssignments.filter(a => {
        if (a.driverId !== userId || a.archived === true || !a.createdAt) return false;
        return extractBrazilDateStr(a.createdAt) === todayStr;
    });

    return [...todays].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

// =============================================================================
// SUITE DE TESTES
// =============================================================================

describe('[useDashboardData] Filtro de Assignments do Dia c/ Fallback de Payload', () => {

    const todayStr = '2026-03-06';
    const fakeUserId = 'driver-123';

    it('CENÁRIO 1: Payload embrulhado (Comportamento Retorno SDK Firestore)', () => {
        const payloadEmbrulhado = [
            {
                id: '1',
                _payload: {
                    id: '1',
                    driverId: fakeUserId, 
                    createdAt: `${todayStr}T08:00:00-03:00`,
                    archived: false,
                    dock: '5',
                    status: 'pending'
                }
            }
        ];

        const result = filterTodayAssignments(payloadEmbrulhado, todayStr, fakeUserId);
        
        // Deveria conseguir extrair pra dentro de _payload e aceitar o user id "driver-123"
        expect(result).toHaveLength(1);
        expect(result[0].driverId).toBe(fakeUserId);
    });

    it('CENÁRIO 2: Payload exposto / Direto (Comportamento API REST Direta)', () => {
         const payloadExposto = [
            {
                id: '2',
                driverId: fakeUserId, 
                createdAt: `${todayStr}T09:00:00-03:00`,
                archived: false,
                dock: '7',
                status: 'pending'
            }
        ];

        const result = filterTodayAssignments(payloadExposto, todayStr, fakeUserId);
        
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('2');
    });

    it('CENÁRIO 3: Descartando sem crashes em caso de lixo na API (Zod Catching)', () => {
         const payloadsSujos = [
            { id: '10' }, // sem _payload, faltando driver, null check
            { _payload: { id: '11', driverId: null } }, // lixo DB
         ];

        const result = filterTodayAssignments(payloadsSujos, todayStr, fakeUserId);
        expect(result).toHaveLength(0); // App ignorou ao invés de lançar erro Cannot read property
    });
});

describe('[useDashboardData] Prevenção de Timezone Leak', () => {
    it('não vaza timestamps UTC da fronteira da virada', () => {
        // 23:55 do dia 05 em UTC = 20:55 BRT = Não é dia 06.
        const endOfYesterdayUTC = '2026-03-06T02:54:00.000Z'; 

        const fakeData = [
            { driverId: 'u-1', createdAt: endOfYesterdayUTC }
        ];

        const result = filterTodayAssignments(fakeData, '2026-03-06', 'u-1');
        expect(result).toHaveLength(0); 
    });
});
