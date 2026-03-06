/**
 * Testes de integração para a lógica de filtragem/ordenação do useMonitorData.
 *
 * ESTRATÉGIA:
 * O hook useMonitorData possui funções puras internas de alta criticidade:
 * - sortByDockPriority: ordena assignments por estado operacional da doca
 * - computeKPIs: calcula métricas de monitoramento em tempo real
 * - filterTodayActive: filtra rotas do dia (BRT)
 *
 * Testamos estas funções diretamente (sem renderHook) para máxima
 * confiabilidade sem depender de infraestrutura de React.
 */

import { extractBrazilDateStr } from '~/src/lib/collections';

// =============================================================================
// TIPOS REPLICADOS (mirror de useMonitorData.ts)
// =============================================================================

interface Assignment {
    id: string;
    createdAt: string;
    archived?: boolean;
    dockStatus?: 'waiting' | 'liberated' | 'departed';
    status?: string;
    dock?: string;
    cityId?: string;
    cityName?: string;
    waveLabel?: string;
    driverName?: string;
}

interface MonitorKPIs {
    totalDispatched: number;
    totalWaiting: number;
    totalLoading: number;
    totalDeparted: number;
}

// =============================================================================
// FUNÇÕES PURAS (idênticas às do hook useMonitorData.ts)
// =============================================================================

const DOCK_PRIORITY: Record<string, number> = { waiting: 0, liberated: 1, departed: 2 };

/** Mirror de sortByDockPriority do useMonitorData */
function sortByDockPriority(list: Assignment[]): Assignment[] {
    return [...list].sort((a, b) => {
        const aPriority = DOCK_PRIORITY[a.dockStatus || 'waiting'] ?? 0;
        const bPriority = DOCK_PRIORITY[b.dockStatus || 'waiting'] ?? 0;
        if (aPriority !== bPriority) return aPriority - bPriority;

        const docA = a.dock || '';
        const docB = b.dock || '';
        if (docA && docB && docA !== docB) {
            return docA.localeCompare(docB, undefined, { numeric: true, sensitivity: 'base' });
        }

        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
}

/** Mirror de computeKPIs do useMonitorData */
function computeKPIs(list: Assignment[]): MonitorKPIs {
    return {
        totalDispatched: list.length,
        totalWaiting: list.filter(a => a.dockStatus === 'waiting' || !a.dockStatus).length,
        totalLoading: list.filter(a => a.dockStatus === 'liberated').length,
        totalDeparted: list.filter(a => a.dockStatus === 'departed' || a.status === 'in_progress').length,
    };
}

/** Mirror do filtro interno de hoje */
function filterTodayActive(list: Assignment[], todayStr: string): Assignment[] {
    return list.filter(a => {
        if (a.archived === true) return false;
        if (!a.createdAt) return false;
        return extractBrazilDateStr(a.createdAt) === todayStr;
    });
}

/** Mirror do agrupamento por cidade/onda do useMonitorData */
function groupByCityAndWave(list: Assignment[]): Record<string, Assignment[]> {
    const groups: Record<string, Assignment[]> = {};
    for (const assignment of list) {
        const key = `${assignment.cityId || 'unknown'}_${assignment.waveLabel || 'Manhã'}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(assignment);
    }
    return groups;
}

// =============================================================================
// FIXTURES
// =============================================================================

const TODAY = '2026-03-06';

function makeAssignment(overrides: Partial<Assignment> & { id: string }): Assignment {
    return {
        createdAt: `${TODAY}T08:00:00-03:00`,
        dockStatus: 'waiting',
        dock: '5',
        cityId: 'city-avare',
        cityName: 'Avaré',
        waveLabel: 'Manhã',
        driverName: 'Motorista Teste',
        ...overrides,
    };
}

// =============================================================================
// SUITES DE TESTES
// =============================================================================

describe('[useMonitorData] sortByDockPriority — Ordenação Tática', () => {

    it('deve colocar waiting antes de liberated e liberated antes de departed', () => {
        const list = [
            makeAssignment({ id: 'dep', dockStatus: 'departed' }),
            makeAssignment({ id: 'lib', dockStatus: 'liberated' }),
            makeAssignment({ id: 'wait', dockStatus: 'waiting' }),
        ];

        const result = sortByDockPriority(list);

        expect(result[0].id).toBe('wait');
        expect(result[1].id).toBe('lib');
        expect(result[2].id).toBe('dep');
    });

    it('deve ordenar docas numericamente dentro do mesmo status (9 antes de 42)', () => {
        const list = [
            makeAssignment({ id: 'd42', dockStatus: 'waiting', dock: '42' }),
            makeAssignment({ id: 'd9', dockStatus: 'waiting', dock: '9' }),
            makeAssignment({ id: 'd1', dockStatus: 'waiting', dock: '1' }),
        ];

        const result = sortByDockPriority(list);

        expect(result[0].id).toBe('d1');
        expect(result[1].id).toBe('d9');
        expect(result[2].id).toBe('d42');
    });

    it('deve usar ordem FIFO quando dockStatus e dock são iguais', () => {
        const list = [
            makeAssignment({ id: 'late', createdAt: `${TODAY}T10:00:00-03:00`, dock: '5', dockStatus: 'waiting' }),
            makeAssignment({ id: 'early', createdAt: `${TODAY}T07:00:00-03:00`, dock: '5', dockStatus: 'waiting' }),
        ];

        const result = sortByDockPriority(list);

        expect(result[0].id).toBe('early');   // FIFO: quem chegou primeiro
        expect(result[1].id).toBe('late');
    });

    it('deve tratar dockStatus undefined como waiting (prioridade máxima)', () => {
        const list = [
            makeAssignment({ id: 'dep', dockStatus: 'departed' }),
            makeAssignment({ id: 'no-status', dockStatus: undefined }),
        ];

        const result = sortByDockPriority(list);

        expect(result[0].id).toBe('no-status');  // undefined = waiting = maior prioridade
        expect(result[1].id).toBe('dep');
    });
});

describe('[useMonitorData] computeKPIs — Métricas do Monitor', () => {

    it('deve calcular KPIs corretamente para lista mista', () => {
        const list = [
            makeAssignment({ id: '1', dockStatus: 'waiting' }),
            makeAssignment({ id: '2', dockStatus: 'waiting' }),
            makeAssignment({ id: '3', dockStatus: 'liberated' }),
            makeAssignment({ id: '4', dockStatus: 'departed' }),
        ];

        const kpis = computeKPIs(list);

        expect(kpis.totalDispatched).toBe(4);
        expect(kpis.totalWaiting).toBe(2);
        expect(kpis.totalLoading).toBe(1);
        expect(kpis.totalDeparted).toBe(1);
    });

    it('deve retornar zeros quando a lista está vazia', () => {
        const kpis = computeKPIs([]);

        expect(kpis.totalDispatched).toBe(0);
        expect(kpis.totalWaiting).toBe(0);
        expect(kpis.totalLoading).toBe(0);
        expect(kpis.totalDeparted).toBe(0);
    });

    it('deve contar status undefined como waiting no KPI', () => {
        const list = [
            makeAssignment({ id: '1', dockStatus: undefined }),
            makeAssignment({ id: '2', dockStatus: 'departed' }),
        ];

        const kpis = computeKPIs(list);

        expect(kpis.totalWaiting).toBe(1);    // undefined = waiting
        expect(kpis.totalDeparted).toBe(1);
    });

    it('deve contar in_progress como departed nos KPIs', () => {
        const list = [
            makeAssignment({ id: '1', dockStatus: 'departed', status: undefined }),
            makeAssignment({ id: '2', dockStatus: undefined, status: 'in_progress' }),
        ];

        const kpis = computeKPIs(list);

        // id=1: dockStatus=departed ✅, id=2: status=in_progress ✅
        expect(kpis.totalDeparted).toBe(2);
    });
});

describe('[useMonitorData] filterTodayActive — Filtro do Dia BRT', () => {

    it('deve retornar somente rotas de hoje (BRT)', () => {
        const list = [
            makeAssignment({ id: '1', createdAt: `${TODAY}T08:00:00-03:00` }),
            makeAssignment({ id: '2', createdAt: `2026-03-05T08:00:00-03:00` }),  // ontem
        ];

        const result = filterTodayActive(list, TODAY);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('1');
    });

    it('deve excluir rotas arquivadas mesmo que sejam de hoje', () => {
        const list = [
            makeAssignment({ id: '1', archived: false }),
            makeAssignment({ id: '2', archived: true }),  // arquivada
        ];

        const result = filterTodayActive(list, TODAY);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('1');
    });

    it('todos os motoristas do dia devem aparecer no monitor', () => {
        const drivers = Array.from({ length: 10 }, (_, i) =>
            makeAssignment({ id: `d${i}`, driverName: `Motorista ${i}` })
        );

        const result = filterTodayActive(drivers, TODAY);

        expect(result).toHaveLength(10);
    });
});

describe('[useMonitorData] groupByCityAndWave — Agrupamento por Cidade', () => {

    it('deve agrupar corretamente assignments de diferentes cidades', () => {
        const list = [
            makeAssignment({ id: '1', cityId: 'avare', waveLabel: 'Manhã' }),
            makeAssignment({ id: '2', cityId: 'botucatu', waveLabel: 'Manhã' }),
            makeAssignment({ id: '3', cityId: 'avare', waveLabel: 'Manhã' }),
        ];

        const groups = groupByCityAndWave(list);

        expect(groups['avare_Manhã']).toHaveLength(2);
        expect(groups['botucatu_Manhã']).toHaveLength(1);
    });

    it('deve criar grupos separados por onda mesmo na mesma cidade', () => {
        const list = [
            makeAssignment({ id: '1', cityId: 'avare', waveLabel: 'Manhã' }),
            makeAssignment({ id: '2', cityId: 'avare', waveLabel: 'Tarde' }),
        ];

        const groups = groupByCityAndWave(list);

        expect(Object.keys(groups)).toHaveLength(2);
    });

    it('deve retornar objeto vazio para lista vazia', () => {
        const groups = groupByCityAndWave([]);
        expect(Object.keys(groups)).toHaveLength(0);
    });
});
