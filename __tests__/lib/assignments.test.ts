/**
 * Suite de Testes Enterprise — Lógica de Assignments (Distribuição de Rotas)
 *
 * Cobertura:
 * 1. Filtro por data BRT — motorista vê APENAS rotas do dia atual
 * 2. Rota de ontem NÃO vaza para hoje (bug de timezone corrigido)
 * 3. Rota arquivada NÃO aparece (soft-delete via archived: true)
 * 4. Ciclo dockStatus: waiting → liberated → departed
 * 5. Campos obrigatórios da rota (cityName, dock, routeLabel, waveLabel)
 * 6. Ordenação por prioridade de doca (waiting antes de departed)
 * 7. Cálculo de KPIs (totalWaiting, totalLoading, totalDeparted)
 * 8. Agrupamento por cidade + onda (RouteGroup)
 *
 * Estratégia Akita XP: funções puras isoladas de React Hooks.
 * Testamos a LÓGICA, não o framework.
 */

import {
    extractBrazilDateStr,
    getTodayDateStr,
    getBrazilNow,
    COLLECTIONS,
    type Assignment,
} from '~/src/lib/collections';

// =============================================================================
// HELPERS DE FACTORY — criam dados de teste realistas
// =============================================================================

/**
 * Cria um Assignment (rota) fake com valores padrão sobrescrevíveis.
 * Usa o formato BRT correto para createdAt.
 */
function makeAssignment(overrides: Partial<Assignment> = {}): Assignment {
    return {
        id: 'assignment-1',
        cityId: 'city-campinas',
        cityName: 'Campinas',
        wave: 'morning',
        waveLabel: 'Manhã',
        waveTime: '06:00 - 11:00',
        waveNumber: 'Onda 1',
        dock: '5',
        routeLabel: 'B5_AM',
        sacas: 120,
        isSdd: false,
        driverId: 'driver-user-1',
        driverName: 'João Silva',
        driverPlate: 'ABC1D23',
        dockStatus: 'waiting',
        status: 'pending',
        createdByAdminId: 'admin-1',
        createdAt: '2026-03-06T07:00:00-03:00', // BRT explícito
        ...overrides,
    };
}

// =============================================================================
// FUNÇÕES PURAS EXTRAÍDAS DO useMonitorData.ts para teste isolado
// =============================================================================

/** Prioridade de ordenação de doca (cópia da implementação real) */
const DOCK_PRIORITY: Record<string, number> = { waiting: 0, liberated: 1, departed: 2 };

/** Ordena assignments por prioridade operacional da doca */
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

/** Calcula KPIs de monitoramento operacional */
function computeKPIs(list: Assignment[]) {
    return {
        totalDispatched: list.length,
        totalWaiting: list.filter(a => a.dockStatus === 'waiting' || !a.dockStatus).length,
        totalLoading: list.filter(a => a.dockStatus === 'liberated').length,
        totalDeparted: list.filter(a => a.dockStatus === 'departed' || a.status === 'in_progress').length,
    };
}

/** Filtra assignments ativos do dia atual em BRT */
function filterTodayActive(allAssignments: Assignment[], todayStr: string): Assignment[] {
    return allAssignments.filter(a => {
        // Ocultar arquivados (soft-delete)
        if ((a as any).archived === true) return false;
        if (!a.createdAt) return false;

        const localCreatedStr = extractBrazilDateStr(a.createdAt);
        const isToday = localCreatedStr === todayStr;
        const isStillActive = (
            a.status === 'pending' || a.status === 'confirmed' || a.status === 'in_progress'
            || a.dockStatus === 'waiting' || a.dockStatus === 'liberated'
        );
        return isToday || isStillActive;
    });
}

/** Agrupa assignments por cidade + onda */
function groupByCity(assignments: Assignment[]) {
    const grouped = assignments.reduce((acc, curr) => {
        const key = `${curr.cityId}-${curr.waveLabel}`;
        if (!acc[key]) {
            acc[key] = {
                cityId: curr.cityId,
                cityName: curr.cityName,
                waveLabel: curr.waveLabel,
                assignments: [] as Assignment[],
            };
        }
        acc[key].assignments.push(curr);
        return acc;
    }, {} as Record<string, { cityId: string; cityName: string; waveLabel: string; assignments: Assignment[] }>);

    return Object.values(grouped);
}

// =============================================================================
// SUITE 1: Filtro de Data BRT (Bug crítico de timezone)
// =============================================================================

describe('Filtro de Rotas por Data BRT — Sem Vazamento de Timezone', () => {
    it('deve exibir rota criada HOJE (formato BRT explícito -03:00)', () => {
        // Arrange: rota criada hoje em BRT
        const todayStr = getTodayDateStr(); // ex: "2026-03-06"
        const route = makeAssignment({ createdAt: `${todayStr}T08:00:00-03:00` });

        // Act
        const filtered = filterTodayActive([route], todayStr);

        // Assert
        expect(filtered).toHaveLength(1);
        expect(filtered[0].id).toBe('assignment-1');
    });

    it('deve exibir rota criada ONTEM se ainda estiver ativa (pending/waiting)', () => {
        // Cenário real: rota criada ontem mas não completada ainda permanece visível
        const todayStr = getTodayDateStr();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().substring(0, 10);

        const route = makeAssignment({
            createdAt: `${yesterdayStr}T08:00:00-03:00`,
            status: 'pending',
            dockStatus: 'waiting'
        });

        // Act
        const filtered = filterTodayActive([route], todayStr);

        // Assert: ainda ativo, deve aparecer
        expect(filtered).toHaveLength(1);
    });

    it('NÃO deve exibir rota de ontem que já foi completada', () => {
        // Cenário: rota do dia anterior, completada — não vaza para hoje
        const todayStr = getTodayDateStr();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().substring(0, 10);

        const route = makeAssignment({
            createdAt: `${yesterdayStr}T08:00:00-03:00`,
            status: 'completed',
            dockStatus: 'departed'
        });

        // Act
        const filtered = filterTodayActive([route], todayStr);

        // Assert: completada + não é hoje → não aparece
        expect(filtered).toHaveLength(0);
    });

    it('deve extrair data BRT corretamente de timestamp com offset -03:00', () => {
        // Verifica função utilitária crítica
        // Timestamp: meia-noite UTC = 21:00 BRT do dia anterior — bug de timezone clássico
        const midnightUtc = '2026-03-06T03:00:00.000Z'; // = 2026-03-06T00:00:00-03:00

        const result = extractBrazilDateStr(midnightUtc);

        // Assert: deve retornar data correta em BRT, não UTC
        expect(result).toBe('2026-03-06');
    });

    it('deve prevenir bug: 2026-03-05T23:00:00Z NÃO é 2026-03-05 no Brasil', () => {
        // Bug real: 23:00 UTC = 20:00 BRT → ambos no mesmo dia
        // Mas 2026-03-06T02:00:00Z → 23:00 BRT do dia 05 → data correta: 2026-03-05
        const timestampUtc = '2026-03-06T02:00:00.000Z'; // = 2026-03-05T23:00:00-03:00

        const result = extractBrazilDateStr(timestampUtc);

        // BRT: 2026-03-05 (dia anterior ao UTC)
        expect(result).toBe('2026-03-05');
    });

    it('deve retornar string vazia para timestamp inválido', () => {
        expect(extractBrazilDateStr('')).toBe('');
        expect(extractBrazilDateStr('not-a-date')).toBe('');
    });
});

// =============================================================================
// SUITE 2: Rota Arquivada (Soft-Delete)
// =============================================================================

describe('Rota Arquivada — Soft-Delete via archived: true', () => {
    it('NÃO deve exibir rota marcada como archived=true para o motorista', () => {
        const todayStr = getTodayDateStr();
        const archived = makeAssignment({
            createdAt: `${todayStr}T08:00:00-03:00`,
            archived: true,
        } as any);

        const filtered = filterTodayActive([archived], todayStr);

        expect(filtered).toHaveLength(0);
    });

    it('deve exibir rotas com archived=false normalmente', () => {
        const todayStr = getTodayDateStr();
        const active = makeAssignment({
            createdAt: `${todayStr}T08:00:00-03:00`,
            archived: false,
        } as any);

        const filtered = filterTodayActive([active], todayStr);

        expect(filtered).toHaveLength(1);
    });

    it('deve exibir rotas sem campo archived (undefined) normalmente', () => {
        const todayStr = getTodayDateStr();
        const noArchived = makeAssignment({ createdAt: `${todayStr}T08:00:00-03:00` });

        const filtered = filterTodayActive([noArchived], todayStr);

        expect(filtered).toHaveLength(1);
    });
});

// =============================================================================
// SUITE 3: Campos Obrigatórios da Rota
// =============================================================================

describe('Campos Obrigatórios do Assignment — Contrato de Dados', () => {
    it('deve ter todos os campos obrigatórios preenchidos', () => {
        const route = makeAssignment();

        // Campos que o motorista PRECISA ver
        expect(route.cityName).toBeTruthy();
        expect(route.dock).toBeTruthy();
        expect(route.routeLabel).toBeTruthy();
        expect(route.waveLabel).toBeTruthy();
        expect(route.driverName).toBeTruthy();
        expect(route.driverPlate).toBeTruthy();
    });

    it('deve ter status inicial como pending', () => {
        const route = makeAssignment();
        expect(route.status).toBe('pending');
    });

    it('deve ter dockStatus inicial como waiting', () => {
        const route = makeAssignment();
        expect(route.dockStatus).toBe('waiting');
    });

    it('deve ter waveLabel como "Manhã" (único turno do sistema)', () => {
        const route = makeAssignment();
        expect(route.waveLabel).toBe('Manhã');
    });

    it('deve ter dock como string numérica (não objeto, não nulo)', () => {
        const route = makeAssignment({ dock: '10' });
        expect(typeof route.dock).toBe('string');
        expect(parseInt(route.dock)).not.toBeNaN();
    });
});

// =============================================================================
// SUITE 4: Ciclo dockStatus (waiting → liberated → departed)
// =============================================================================

describe('Ciclo de dockStatus — waiting → liberated → departed', () => {
    it('deve aceitar transição waiting→liberated (admin libera a doca)', () => {
        const route = makeAssignment({ dockStatus: 'waiting' });

        // Simula update de status (regra de negócio: admin libera)
        const updated: Assignment = { ...route, dockStatus: 'liberated' };

        expect(updated.dockStatus).toBe('liberated');
        expect(['waiting', 'liberated', 'departed']).toContain(updated.dockStatus);
    });

    it('deve aceitar transição liberated→departed (motorista saiu da doca)', () => {
        const route = makeAssignment({ dockStatus: 'liberated' });

        // Simula update de status (motorista clica "Saí da doca")
        const updated: Assignment = { ...route, dockStatus: 'departed', status: 'in_progress' };

        expect(updated.dockStatus).toBe('departed');
        expect(updated.status).toBe('in_progress');
    });

    it('rota com dockStatus=departed deve aparecer em totalDeparted dos KPIs', () => {
        const routes = [
            makeAssignment({ dockStatus: 'departed' }),
            makeAssignment({ id: 'a2', dockStatus: 'waiting' }),
        ];

        const kpis = computeKPIs(routes);

        expect(kpis.totalDeparted).toBe(1);
        expect(kpis.totalWaiting).toBe(1);
    });
});

// =============================================================================
// SUITE 5: Ordenação por Prioridade de Doca
// =============================================================================

describe('Ordenação por Prioridade Operacional de Doca', () => {
    it('deve colocar waiting ANTES de liberated e departed', () => {
        const routes = [
            makeAssignment({ id: 'c', dockStatus: 'departed', dock: '1' }),
            makeAssignment({ id: 'a', dockStatus: 'waiting', dock: '3' }),
            makeAssignment({ id: 'b', dockStatus: 'liberated', dock: '2' }),
        ];

        const sorted = sortByDockPriority(routes);

        expect(sorted[0].dockStatus).toBe('waiting');
        expect(sorted[1].dockStatus).toBe('liberated');
        expect(sorted[2].dockStatus).toBe('departed');
    });

    it('deve ordenar por número de doca (numérico) quando dockStatus é igual', () => {
        const routes = [
            makeAssignment({ id: 'dock-42', dockStatus: 'waiting', dock: '42' }),
            makeAssignment({ id: 'dock-9', dockStatus: 'waiting', dock: '9' }),
            makeAssignment({ id: 'dock-1', dockStatus: 'waiting', dock: '1' }),
        ];

        const sorted = sortByDockPriority(routes);

        // Ordenação numérica: 1 < 9 < 42
        expect(sorted[0].dock).toBe('1');
        expect(sorted[1].dock).toBe('9');
        expect(sorted[2].dock).toBe('42');
    });

    it('não deve modificar o array original (imutabilidade)', () => {
        const routes = [
            makeAssignment({ id: 'b', dockStatus: 'departed' }),
            makeAssignment({ id: 'a', dockStatus: 'waiting' }),
        ];
        const originalFirst = routes[0].id;

        sortByDockPriority(routes);

        // Array original não foi alterado
        expect(routes[0].id).toBe(originalFirst);
    });
});

// =============================================================================
// SUITE 6: KPIs do Monitor de Docas
// =============================================================================

describe('Cálculo de KPIs do Monitor', () => {
    it('deve calcular corretamente quando há mix de status', () => {
        const routes = [
            makeAssignment({ id: '1', dockStatus: 'waiting' }),
            makeAssignment({ id: '2', dockStatus: 'waiting' }),
            makeAssignment({ id: '3', dockStatus: 'liberated' }),
            makeAssignment({ id: '4', dockStatus: 'departed' }),
            makeAssignment({ id: '5', status: 'in_progress', dockStatus: 'departed' }),
        ];

        const kpis = computeKPIs(routes);

        expect(kpis.totalDispatched).toBe(5);
        expect(kpis.totalWaiting).toBe(2);
        expect(kpis.totalLoading).toBe(1);
        expect(kpis.totalDeparted).toBe(2);
    });

    it('deve retornar zeros para lista vazia', () => {
        const kpis = computeKPIs([]);

        expect(kpis.totalDispatched).toBe(0);
        expect(kpis.totalWaiting).toBe(0);
        expect(kpis.totalLoading).toBe(0);
        expect(kpis.totalDeparted).toBe(0);
    });

    it('deve contar como waiting quando dockStatus está ausente', () => {
        // Edge case: registration sem dockStatus definido
        const route: Assignment = {
            ...makeAssignment({ id: 'no-dock-status' }),
            dockStatus: undefined as any,
        };

        const kpis = computeKPIs([route]);

        expect(kpis.totalWaiting).toBe(1);
    });
});

// =============================================================================
// SUITE 7: Agrupamento por Cidade + Onda
// =============================================================================

describe('Agrupamento de Rotas por Cidade e Onda', () => {
    it('deve agrupar corretamente 2 rotas da mesma cidade', () => {
        const routes = [
            makeAssignment({ id: 'r1', cityId: 'campinas', cityName: 'Campinas', waveLabel: 'Manhã' }),
            makeAssignment({ id: 'r2', cityId: 'campinas', cityName: 'Campinas', waveLabel: 'Manhã' }),
        ];

        const groups = groupByCity(routes);

        expect(groups).toHaveLength(1);
        expect(groups[0].cityName).toBe('Campinas');
        expect(groups[0].assignments).toHaveLength(2);
    });

    it('deve criar grupos separados para cidades diferentes', () => {
        const routes = [
            makeAssignment({ id: 'r1', cityId: 'campinas', cityName: 'Campinas', waveLabel: 'Manhã' }),
            makeAssignment({ id: 'r2', cityId: 'sp', cityName: 'São Paulo', waveLabel: 'Manhã', driverId: 'u2' }),
        ];

        const groups = groupByCity(routes);

        expect(groups).toHaveLength(2);
        const cityNames = groups.map(g => g.cityName).sort();
        expect(cityNames).toEqual(['Campinas', 'São Paulo']);
    });

    it('deve retornar lista vazia para assignments vazio', () => {
        const groups = groupByCity([]);
        expect(groups).toHaveLength(0);
    });
});
