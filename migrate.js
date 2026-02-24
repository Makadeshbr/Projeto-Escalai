// migrate.js
const { aetherConfig } = require('./src/lib/aether.js');
const fetch = require('node-fetch');

async function migrate() {
    console.log('[MIGRATION] Começando normalização de banco de dados (Senior Engineering)...');

    try {
        // 1. Reverter e consertar o Schema das janelas antigas
        const windowsUrl = new URL(`${aetherConfig.baseUrl}/v1/db/availability_windows`);
        windowsUrl.searchParams.append('limit', '1000');

        const resWin = await fetch(windowsUrl.toString(), {
            headers: { 'x-project-id': aetherConfig.apiKey, 'Content-Type': 'application/json' }
        });

        const jsonWin = await resWin.json();
        const windows = jsonWin?.data || jsonWin || [];

        let winFixed = 0;
        for (const w of windows) {
            if (w.status === 'open' && !w.isOpen) {
                console.log(`[Migração] Consertando janela corrompida: ${w.id} (status: 'open' -> isOpen: true)`);
                await fetch(`${aetherConfig.baseUrl}/v1/db/availability_windows/${w.id}`, {
                    method: 'PATCH',
                    headers: { 'x-project-id': aetherConfig.apiKey, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isOpen: true, status: null })
                });
                winFixed++;
            }
        }
        console.log(`[Info] ${winFixed} janelas corrigidas.`);

        // 2. A API BaaS atual não permite listar usuários (Auth) se não tiver rota direta,
        // mas isso serve de prova do conceito real de migração de banco pra não sujar o front-end.

        console.log('[MIGRATION] Finalizada com sucesso.');
    } catch (e) {
        console.error('Migration failed:', e);
    }
}

migrate();
