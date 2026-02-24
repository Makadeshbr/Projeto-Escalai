/**
 * Script de Migração: Popula driver_status para Motoristas Existentes
 * 
 * Este script busca todos os usuários com role='driver' na coleção de usuários
 * e cria entradas correspondentes na coleção driver_status.
 * 
 * USO:
 * 1. Configure as variáveis de ambiente ou edite as configurações abaixo
 * 2. Execute: node migrate-drivers-to-status.js
 * 
 * ou incorpore a lógica em uma função Aether se preferir executar via plataforma
 */

const AETHER_API_URL = process.env.AETHER_API_URL || 'https://api-plataforma-production-a92f.up.railway.app';
const PROJECT_ID = process.env.PROJECT_ID || 'd937f7a3-5752-45ec-8dd7-15ab4ef8b140';

// Não altere estas coleções
const DRIVER_STATUS_COLLECTION = 'driver_status';
const USERS_COLLECTION = 'tenant_users';

async function migrate() {
    console.log('🚀 Iniciando migração de drivers para driver_status...\n');

    // Pegar token via API Key (modo admin)
    const authResponse = await fetch(`${AETHER_API_URL}/v1/auth/api-key`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-project-id': PROJECT_ID
        },
        body: JSON.stringify({
            apiKey: process.env.AETHER_API_KEY // Necessário configurar
        })
    });

    if (!authResponse.ok) {
        // Fallback: tentar listar usuários sem auth (se允许)
        console.log('⚠️ Autenticação falhou, tentando método alternativo...\n');
    }

    // Listar todos os usuários com role='driver'
    const usersUrl = new URL(`${AETHER_API_URL}/v1/db/${USERS_COLLECTION}`);
    usersUrl.searchParams.append('limit', '1000');
    usersUrl.searchParams.append('where', JSON.stringify({ 'data.metadata.role': { $eq: 'driver' } }));

    const usersResponse = await fetch(usersUrl.toString(), {
        headers: {
            'x-project-id': PROJECT_ID,
            'Content-Type': 'application/json'
        }
    });

    if (!usersResponse.ok) {
        console.error('❌ Erro ao buscar usuários:', await usersResponse.text());
        process.exit(1);
    }

    const usersData = await usersResponse.json();
    const drivers = usersData.data || [];

    console.log(`📋 Encontrados ${drivers.length} motoristas para migrar.\n`);

    if (drivers.length === 0) {
        console.log('✅ Nenhum motorista encontrado para migrar.');
        process.exit(0);
    }

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const driver of drivers) {
        try {
            const driverId = driver.id;
            const driverName = driver.name || driver.email?.split('@')[0] || 'Motorista';
            const vehiclePlate = driver.data?.metadata?.vehiclePlate || driver.data?.vehiclePlate || 'S/Placa';

            // Verificar se já existe driver_status
            const existingUrl = new URL(`${AETHER_API_URL}/v1/db/${DRIVER_STATUS_COLLECTION}`);
            existingUrl.searchParams.append('where', JSON.stringify({ driverId: { $eq: driverId } }));

            const existingResponse = await fetch(existingUrl.toString(), {
                headers: {
                    'x-project-id': PROJECT_ID,
                    'Content-Type': 'application/json'
                }
            });

            const existingData = await existingResponse.json();
            const existingStatus = existingData.data || [];

            if (existingStatus.length > 0) {
                console.log(`⏭️  Pulando ${driverName} (já possui driver_status)`);
                skipCount++;
                continue;
            }

            // Criar driver_status
            const createResponse = await fetch(`${AETHER_API_URL}/v1/db/${DRIVER_STATUS_COLLECTION}`, {
                method: 'POST',
                headers: {
                    'x-project-id': PROJECT_ID,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    driverId,
                    driverName,
                    expoPushToken: '', // Será preenchido quando o driver fazer login no app
                    driverPlate: vehiclePlate,
                    status: 'active',
                    updatedByAdminId: 'system_migration',
                    createdAt: new Date().toISOString()
                })
            });

            if (createResponse.ok) {
                console.log(`✅ Criado driver_status para: ${driverName} (Placa: ${vehiclePlate})`);
                successCount++;
            } else {
                const errorText = await createResponse.text();
                console.log(`❌ Erro ao criar para ${driverName}: ${errorText}`);
                errorCount++;
            }

        } catch (err) {
            console.log(`❌ Erro processando driver: ${err.message}`);
            errorCount++;
        }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 RESUMO DA MIGRAÇÃO:');
    console.log(`   ✅ Sucesso: ${successCount}`);
    console.log(`   ⏭️  Pulados (já existiam): ${skipCount}`);
    console.log(`   ❌ Erros: ${errorCount}`);
    console.log('='.repeat(50));

    if (successCount > 0) {
        console.log('\n🎉 Migração concluída! Os drivers agora aparecerão no sistema.');
    }
}

migrate().catch(console.error);
