/**
 * Edge Function: ensure-driver-status
 * 
 * Esta função garante que o driver_status existe para um motorista.
 * Executa com privilégios de servidor, contornando as regras de segurança.
 */

module.exports = async function (context) {
    try {
        const { driverId, driverName, vehiclePlate, expoPushToken } = context.params || context.body || {};

        if (!driverId) {
            return { success: false, error: 'driverId é obrigatório' };
        }

        context.log.info('[ensure-driver-status] Iniciando para driverId:', driverId);

        // Verifica se já existe
        const existing = await context.db.collection('driver_status')
            .query()
            .eq('driverId', driverId)
            .get();

        if (existing && existing.length > 0) {
            // Atualiza o token e status
            await context.db.collection('driver_status').update(existing[0].id, {
                expoPushToken: expoPushToken || '',
                driverPlate: vehiclePlate || existing[0].driverPlate,
                status: 'active',
                updatedByAdminId: 'system_edge_function',
                updatedAt: new Date().toISOString()
            });

            context.log.info('[ensure-driver-status] Atualizado', { driverId, statusId: existing[0].id });

            return {
                success: true,
                action: 'updated',
                driverStatusId: existing[0].id
            };
        }

        // Cria novo registro
        const newStatus = await context.db.collection('driver_status').create({
            driverId,
            driverName: driverName || 'Motorista',
            driverPlate: vehiclePlate || 'S/Placa',
            expoPushToken: expoPushToken || '',
            status: 'active',
            updatedByAdminId: 'system_edge_function',
            createdAt: new Date().toISOString()
        });

        context.log.info('[ensure-driver-status] Criado', { driverId, statusId: newStatus.id });

        return {
            success: true,
            action: 'created',
            driverStatusId: newStatus.id
        };

    } catch (error) {
        context.log.error('[ensure-driver-status] Erro:', error.message || error);
        return {
            success: false,
            error: error.message || 'Erro desconhecido'
        };
    }
};
