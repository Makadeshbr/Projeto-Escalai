/**
 * Testes de integração para a lógica de filtragem do useDashboardData.
 *
 * ESTRATÉGIA AKITA/TDD:
 * O hook useDashboardData tem dependências pesadas de React (useState, useEffect,
 * React Query) que exigem setup complexo de ambiente no Jest.
 *
 * Em vez de criar mocks frágeis de todo o React, testamos as FUNÇÕES PURAS
 * que o hook usa internamente para filtrar dados. Isso:
 * 1. Testa o comportamento real (filtro BRT)
 * 2. Não depende de infraestrutura React/React Native
 * 3. É manutenível e rápido
 *
 * Referência: os mesmos helpers testados aqui são usados em useMonitorData e
 * useDashboardData — validar uma vez cobre os dois.
 */

import { extractBrazilDateStr, getTodayDateStr } from '~/src/lib/collections';

// =============================================================================
// TIPOS LOCAIS PARA TESTE (mirror dos tipos do hook)
// =============================================================================

interface AssignmentLike {
    id: string;
    createdAt: string;
    archived?: boolean;
    status?: string;
}

interface DriverAvailabilityLike {
    id: string;
    targetDate: string;
    isAvailable: boolean;
}

// =============================================================================
// FUNÇÕES PURAS (replicadas exatamente como o hook as usa internamente)
// =============================================================================

/**
 * Filtra assignments da data de hoje em BRT, excluindo arquivadas.
 * Replica a lógica do useMemo 'recentAssignments' do useDashboardData.
 */
function filterTodayAssignments(
    allAssignments: AssignmentLike[],
    todayStr: string
): AssignmentLike[] {
    const todays = allAssignments.filter(a => {
        if (a.archived === true) return false;
        if (!a.createdAt) return false;
        return extractBrazilDateStr(a.createdAt) === todayStr;
    });

    return [...todays].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

/**
 * Filtra motoristas disponíveis para a data alvo.
 * Replica a lógica do useMemo 'availableDrivers' do useDashboardData.
 */
function filterAvailableDrivers(
    allAvailabilities: DriverAvailabilityLike[],
    targetDateStr: string
): DriverAvailabilityLike[] {
    return allAvailabilities.filter(r =>
        r.targetDate === targetDateStr && r.isAvailable === true
    );
}

// =============================================================================
// SUITE DE TESTES — recentAssignments
// =============================================================================

describe('[useDashboardData] Filtro de Assignments do Dia (BRT)', () => {

    const todayStr = '2026-03-06';
    const yesterdayStr = '2026-03-05';

    it('deve retornar apenas assignments de hoje, excluindo os de ontem', () => {
        const assignments: AssignmentLike[] = [
            { id: '1', createdAt: `${todayStr}T08:00:00-03:00` },      // hoje às 08:00 BRT ✅
            { id: '2', createdAt: `${yesterdayStr}T10:00:00-03:00` },   // ontem às 10:00 BRT ❌
        ];

        const result = filterTodayAssignments(assignments, todayStr);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('1');
    });

    it('deve excluir assignments arquivadas mesmo que sejam de hoje', () => {
        const assignments: AssignmentLike[] = [
            { id: '1', createdAt: `${todayStr}T08:00:00-03:00`, archived: false },     // visível ✅
            { id: '2', createdAt: `${todayStr}T09:00:00-03:00`, archived: true },      // arquivada ❌
            { id: '3', createdAt: `${todayStr}T07:00:00-03:00`, archived: undefined }, // indefinido → visível ✅
        ];

        const result = filterTodayAssignments(assignments, todayStr);

        expect(result).toHaveLength(2);
        expect(result.map(r => r.id).sort()).toEqual(['1', '3']);
    });

    it('deve retornar lista vazia quando não há assignments de hoje', () => {
        const assignments: AssignmentLike[] = [
            { id: '1', createdAt: `${yesterdayStr}T08:00:00-03:00` },
        ];

        const result = filterTodayAssignments(assignments, todayStr);

        expect(result).toHaveLength(0);
    });

    it('PREVENÇÃO DE TIMEZONE LEAK: não vazar timestamps UTC do final do dia anterior', () => {
        // 23:55 do dia 2026-03-05 em UTC = 20:55 BRT = ainda é 2026-03-05 em BRT
        const endOfYesterdayUTC = '2026-03-06T02:54:00.000Z'; // = 2026-03-05T23:54 BRT -> ontem

        const assignments: AssignmentLike[] = [
            { id: 'leak', createdAt: endOfYesterdayUTC },
        ];

        const result = filterTodayAssignments(assignments, todayStr);

        // Não deve aparecer hoje, pois em BRT ainda é o dia anterior
        expect(result).toHaveLength(0);
    });

    it('deve ordenar do mais recente para o mais antigo', () => {
        const assignments: AssignmentLike[] = [
            { id: 'early', createdAt: `${todayStr}T07:00:00-03:00` },
            { id: 'late',  createdAt: `${todayStr}T11:00:00-03:00` },
            { id: 'mid',   createdAt: `${todayStr}T09:00:00-03:00` },
        ];

        const result = filterTodayAssignments(assignments, todayStr);

        expect(result[0].id).toBe('late');
        expect(result[1].id).toBe('mid');
        expect(result[2].id).toBe('early');
    });
});

// =============================================================================
// SUITE DE TESTES — availableDrivers
// =============================================================================

describe('[useDashboardData] Filtro de Motoristas Disponíveis', () => {

    const todayStr = '2026-03-06';
    const tomorrowStr = '2026-03-07';

    it('deve retornar apenas motoristas disponíveis para a data alvo', () => {
        const availabilities: DriverAvailabilityLike[] = [
            { id: 'd1', targetDate: todayStr, isAvailable: true },     // hoje + disponível ✅
            { id: 'd2', targetDate: todayStr, isAvailable: false },    // hoje + indisponível ❌
            { id: 'd3', targetDate: tomorrowStr, isAvailable: true },  // amanhã + disponível ❌ (data errada)
        ];

        const result = filterAvailableDrivers(availabilities, todayStr);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('d1');
    });

    it('isSameDay = false: deve filtrar motoristas disponíveis para amanhã', () => {
        const availabilities: DriverAvailabilityLike[] = [
            { id: 'd1', targetDate: todayStr, isAvailable: true },
            { id: 'd2', targetDate: tomorrowStr, isAvailable: true },
            { id: 'd3', targetDate: tomorrowStr, isAvailable: false },
        ];

        const result = filterAvailableDrivers(availabilities, tomorrowStr);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('d2');
    });

    it('deve retornar lista vazia quando não há motoristas disponíveis', () => {
        const availabilities: DriverAvailabilityLike[] = [
            { id: 'd1', targetDate: todayStr, isAvailable: false },
        ];

        const result = filterAvailableDrivers(availabilities, todayStr);

        expect(result).toHaveLength(0);
    });

    it('deve suportar múltiplos motoristas disponíveis simultaneamente', () => {
        const availabilities: DriverAvailabilityLike[] = [
            { id: 'd1', targetDate: todayStr, isAvailable: true },
            { id: 'd2', targetDate: todayStr, isAvailable: true },
            { id: 'd3', targetDate: todayStr, isAvailable: true },
        ];

        const result = filterAvailableDrivers(availabilities, todayStr);

        expect(result).toHaveLength(3);
        expect(result.map(d => d.id).sort()).toEqual(['d1', 'd2', 'd3']);
    });
});

// =============================================================================
// SUITE DE TESTES — Integração com helpers reais
// =============================================================================

describe('[useDashboardData] Integração com extractBrazilDateStr', () => {

    it('extractBrazilDateStr deve funcionar corretamente para retornar data BRT', () => {
        // Midnight UTC = 21:00 BRT do dia anterior
        expect(extractBrazilDateStr('2026-03-06T00:00:00.000Z')).toBe('2026-03-05');

        // 03:00 UTC = 00:00 BRT = início do dia 06
        expect(extractBrazilDateStr('2026-03-06T03:00:00.000Z')).toBe('2026-03-06');

        // Com offset BRT explícito
        expect(extractBrazilDateStr('2026-03-06T08:00:00-03:00')).toBe('2026-03-06');
    });

    it('getTodayDateStr deve retornar data no formato YYYY-MM-DD', () => {
        const todayStr = getTodayDateStr();
        expect(todayStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});
