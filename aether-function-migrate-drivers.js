/**
 * Função Aether: migrateExistingDrivers
 * 
 * Esta função pode ser executada manualmente na plataforma Aether
 * para popular a coleção driver_status com os motoristas existentes.
 * 
 * USO NA PLATAFORMA AETHER:
 * 1. Crie uma nova função HTTP
 * 2. Cole este código
 * 3. Execute a função
 * 
 * Esta função também pode ser usada como base para corrigir o trigger
 * de banco de dados que você criou na plataforma.
 */

module.exports = async function (context) {
    // Busca todos os usuários com role='driver' em metadata
    // O caminho correto é: data.metadata.role = 'driver'

    const allUsers = await context.db.collection('tenant_users')
        .query()
        .limit(1000)
        .get();

    // Filtra usuários que têm metadata.role = 'driver'
    const drivers = (allUsers || []).filter(u =>
        u.data && u.data.metadata && u.data.metadata.role === 'driver'
    );

    context.log.info(`Encontrados ${drivers.length} motoristas para verificar`);

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const driver of drivers) {
        try {
            const driverId = driver.id;
            const driverName = driver.name || (driver.email ? driver.email.split('@')[0] : 'Motorista');

            // Os dados do veículo estão em driver.data.metadata
            const userMetadata = driver.data || {};
            const vehiclePlate = userMetadata?.metadata?.vehiclePlate || userMetadata?.vehiclePlate || 'S/Placa';
            const expoPushToken = userMetadata?.metadata?.expoPushToken || userMetadata?.expoPushToken || '';

            // Verificar se já existe driver_status
            const existing = await context.db.collection('driver_status')
                .query()
                .eq('driverId', driverId)
                .get();

            if (existing && existing.length > 0) {
                skipped++;
                continue;
            }

            // Criar driver_status
            await context.db.collection('driver_status').create({
                driverId: driverId,
                driverName: driverName,
                expoPushToken: expoPushToken,
                driverPlate: vehiclePlate,
                status: 'active',
                updatedByAdminId: 'system_migration',
                createdAt: new Date().toISOString()
            });

            created++;
            context.log.info(`Criado driver_status para: ${driverName}`);

        } catch (err) {
            errors++;
            context.log.error(`Erro ao processar driver: ${err.message || err}`);
        }
    }

    const result = {
        success: true,
        totalDrivers: drivers.length,
        created,
        skipped,
        errors,
        message: `Migração concluída: ${created} criados, ${skipped} pulados, ${errors} erros`
    };

    context.log.info('Resultado da migração:', JSON.stringify(result));

    return result;
};
