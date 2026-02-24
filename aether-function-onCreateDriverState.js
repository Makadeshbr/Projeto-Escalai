/**
 * Trigger: onCreateDriverState
 * 
 * Este trigger é executado quando um novo usuário é criado na coleção 'tenant_users'.
 * Verifica se o usuário é um motorista (role='driver' em data.metadata.role)
 * e cria um registro correspondente na coleção 'driver_status'.
 * 
 * Estrutura dos dados:
 * - context.data = linha do usuário (após mergeData)
 * - context.data.id = ID do usuário
 * - context.data.email = email do usuário
 * - context.data.name = nome do usuário
 * - context.data.data = { metadata: { role: 'driver', vehiclePlate: 'xxx' } }
 */

module.exports = async function (context) {
    // Para DB Triggers, context.data contém a linha do usuário diretamente
    // (após applyMergeData no helpers.ts da plataforma)
    const userRow = context.data;

    // Os dados personalizados estão em userRow.data (coluna JSONB)
    // Estrutura: { metadata: { role: 'driver', vehiclePlate: 'xxx' } }
    const userMetadata = userRow?.data || {};
    const userRole = userMetadata?.metadata?.role;
    const isDriver = userRole === 'driver';

    if (isDriver) {
        await context.db.collection('driver_status').create({
            driverId: userRow.id,
            driverName: userRow.name || (userRow.email ? userRow.email.split('@')[0] : 'Motorista'),
            expoPushToken: userMetadata?.expoPushToken || userMetadata?.metadata?.expoPushToken || '',
            driverPlate: userMetadata?.vehiclePlate || userMetadata?.metadata?.vehiclePlate || 'S/Placa',
            status: 'active',
            updatedByAdminId: 'system',
            createdAt: new Date().toISOString()
        });
        context.log.info('Driver Status criado via DB Trigger com sucesso', { driverId: userRow.id });
    }

    return { ok: true, created: isDriver };
};
