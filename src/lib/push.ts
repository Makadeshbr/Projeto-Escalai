import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { aether, aetherFetchAll } from './aether';
import { COLLECTIONS, formatBrazilTimestamp } from './collections';
import { logger } from './logger';

export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Diagnostica o motivo real de uma falha de Push Notification.
 * Retorna mensagem legível para o usuário final, diferenciando:
 * - Expo Go (modo dev) vs. build de produção
 * - Token inexistente vs. permissão negada vs. erro de rede vs. erro de API
 *
 * @param error - Erro capturado no catch de push
 * @returns Mensagem explicativa para exibir ao usuário
 */
export function diagnosePushError(error: unknown): string {
    if (isExpoGo) {
        return 'Push indisponível no Expo Go (modo de desenvolvimento). Funcionará normalmente na build de produção (APK/IPA).';
    }

    if (error instanceof Error) {
        const msg = error.message.toLowerCase();

        if (msg.includes('nenhum motorista encontrado')) {
            return 'Nenhum motorista cadastrado no controle de frota. Cadastre motoristas antes de enviar notificações.';
        }
        if (msg.includes('nenhum motorista possui')) {
            return 'Nenhum motorista abriu o aplicativo ainda. O token de push é gerado automaticamente no primeiro acesso do app.';
        }
        if (msg.includes('não ativou as notificações')) {
            return 'O motorista não ativou as notificações no celular. Peça para ele ativar em Configurações > Notificações.';
        }
        if (msg.includes('driverstatus não encontrado')) {
            return 'Motorista não encontrado no sistema. Verifique se o cadastro está correto e se ele já acessou o app ao menos uma vez.';
        }
        if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout') || msg.includes('rede')) {
            return 'Sem conexão com os servidores de push. Verifique sua internet e tente novamente.';
        }
        if (msg.includes('falha em todos os disparos')) {
            return 'O serviço Expo Push está temporariamente indisponível. Os dados foram salvos — tente reenviar em alguns minutos.';
        }

        return error.message;
    }

    return 'Erro desconhecido no serviço de notificações.';
}

/**
 * Referência ao módulo expo-notifications.
 * Carregado dinamicamente para evitar crash no Expo Go (Android SDK 53+).
 */
let Notifications: typeof import('expo-notifications') | null = null;
if (!isExpoGo) {
    try {
        Notifications = require('expo-notifications');
    } catch (error) {
        logger.warn('[Push]', 'expo-notifications falhou ao carregar:', error);
    }
} else {
    logger.info('[Push]', 'Notificações desabilitadas no Expo Go.');
}

/**
 * [AUDIT FIX — CLEAN-003] Inicializa o handler de notificações de forma centralizada.
 * Deve ser chamada UMA vez no _layout.tsx. Evita duplicação de configuração.
 */
export function initializeNotificationHandler(): void {
    if (!Notifications) return;
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
            shouldShowBanner: true,
            shouldShowList: true,
        }),
    });
}

/**
 * Registra o dispositivo para receber Push Tokens do Expo.
 * Solicita permissão ao usuário e retorna o token ou null.
 * @returns Token Expo Push ou null se não autorizado/indisponível
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
    if (!Notifications) return null;

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }
    if (finalStatus !== 'granted') {
        logger.info('[Push]', 'Permissão de notificação negada pelo usuário.');
        throw new Error('Permissão de notificação negada pelo seu dispositivo.');
    }

    try {
        /**
         * [AUDIT FIX — SEC-003] Usa env var ou Constants em vez de hardcode.
         * Garante que mudança de projeto não exija edição manual aqui.
         */
        const projectId = Constants.expoConfig?.extra?.eas?.projectId
            || process.env.EXPO_PUBLIC_AETHER_PROJECT_ID
            || '2df3cb3a-25ab-4246-9596-8c608bff2603'; // Atualizado para o ID da conta naah22santtos

        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
        return tokenData.data;
    } catch (e: any) {
        logger.error('[Push]', 'Erro ao gerar token:', e);
        throw new Error(`Falha nos servidores de Notificação (Expo): ${e.message}`);
    }
}

/**
 * Dispara notificações Push via Expo Push API.
 * Gerencia envio em lotes de 100 tokens (limite da API Expo).
 * @param expoPushToken - Token(s) de destino
 * @param title - Título da notificação
 * @param body - Corpo da notificação
 * @param data - Dados extras opcionais
 */
export async function sendPushNotification(
    expoPushToken: string | string[],
    title: string,
    body: string,
    data: Record<string, unknown> = {}
): Promise<void> {
    if (!expoPushToken) return;

    const tokens = Array.isArray(expoPushToken) ? expoPushToken : [expoPushToken];
    const validTokens = tokens.filter(t => t);

    if (validTokens.length === 0) return;

    const CHUNK_SIZE = 100;
    const errors: string[] = [];

    for (let i = 0; i < validTokens.length; i += CHUNK_SIZE) {
        const chunk = validTokens.slice(i, i + CHUNK_SIZE);
        const messages = chunk.map(token => ({
            to: token,
            sound: 'default',
            title,
            body,
            data,
            priority: 'high', // Força despertar no Android Killed State (Estilo WhatsApp)
            channelId: 'default',
        }));

        try {
            const response = await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Accept-encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(messages),
            });

            const dataStatus = await response.json();

            // 1. Checa Erros Globais da API
            if (dataStatus?.errors?.length > 0) {
                errors.push(`Expo API Error Global: ${dataStatus.errors[0]?.message || 'Desconhecido'}`);
            }

            // 2. Checa Erros Individuais Visuais escondidos nos "Tickets" de disparo
            if (dataStatus?.data && Array.isArray(dataStatus.data)) {
                dataStatus.data.forEach((ticket: any) => {
                    if (ticket.status === 'error') {
                        const errorReason = ticket.details?.error || ticket.message || 'Desconhecido';
                        errors.push(`Ticket Falhou: ${errorReason}`);
                    }
                });
            }

        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Erro desconhecido';
            errors.push(msg);
        }
    }

    if (errors.length > 0 && errors.length === Math.ceil(validTokens.length / CHUNK_SIZE)) {
        throw new Error('Falha em todos os disparos: ' + errors[0]);
    } else if (errors.length > 0) {
        logger.warn('[Push]', 'Alguns disparos falharam:', errors);
    }
}

/**
 * Resultado do disparo de notificações em massa.
 * Inclui detalhes de quantos receberam e quais ficaram de fora.
 */
export interface MassNotifyResult {
    /** Quantidade de tokens que receberam a notificação */
    sent: number;
    /** Quantidade de motoristas sem token (não receberão push) */
    skipped: number;
    /** Total de motoristas na base */
    total: number;
    /** Nomes dos motoristas que NÃO possuem push token */
    missingTokenDrivers: string[];
}

/**
 * Envia notificação Push para TODOS os motoristas ativos na base.
 * Busca tokens do DRIVER_STATUS e dispara via Expo Push API.
 * Retorna relatório detalhado incluindo motoristas sem token.
 *
 * @param title - Título da notificação
 * @param body - Corpo da mensagem
 * @param data - Dados extras opcionais
 * @returns Relatório completo do disparo (sent, skipped, missingTokenDrivers)
 */
export async function notifyAllDrivers(
    title: string,
    body: string,
    data: Record<string, unknown> = {}
): Promise<MassNotifyResult> {
    const allStats = await aetherFetchAll(COLLECTIONS.DRIVER_STATUS);
    if (!allStats || (allStats as Record<string, unknown>[]).length === 0) {
        throw new Error('Nenhum motorista encontrado no controle de frota.');
    }

    const drivers = allStats as Record<string, unknown>[];
    const tokens: string[] = [];
    const missingTokenDrivers: string[] = [];

    // Classifica cada motorista: tem token válido ou está sem
    drivers.forEach(d => {
        const payload = d._payload as Record<string, unknown> | undefined;
        const token = (d.expoPushToken as string) || (payload?.expoPushToken as string) || '';
        const name = (d.driverName as string) || (payload?.driverName as string) || 'Sem nome';

        if (token && token.trim() !== '') {
            tokens.push(token.trim());
        } else {
            missingTokenDrivers.push(name);
        }
    });

    if (tokens.length === 0) {
        throw new Error('Nenhum motorista possui um aplicativo registrado para receber notificações.');
    }

    await sendPushNotification(tokens, title, body, data);

    // Log diagnóstico para depuração
    if (missingTokenDrivers.length > 0) {
        logger.warn('[Push]', `${missingTokenDrivers.length} motorista(s) SEM push token: ${missingTokenDrivers.join(', ')}`);
    }

    return {
        sent: tokens.length,
        skipped: missingTokenDrivers.length,
        total: drivers.length,
        missingTokenDrivers,
    };
}

/**
 * Garante que o motorista tem um push token válido e atualizado
 * no DRIVER_STATUS. Chamada automaticamente a cada abertura do app.
 *
 * Fluxo:
 * 1. Solicita permissão de notificação (se ainda não concedida)
 * 2. Obtém o token mais recente do dispositivo
 * 3. Compara com o token atual no DRIVER_STATUS
 * 4. Se diferente ou inexistente, atualiza via upsert
 *
 * TOLERANTE A FALHAS: nunca lança exceção. Se algo falhar,
 * loga o motivo e retorna null. O app continua funcionando normalmente.
 *
 * @param userId - ID do motorista autenticado
 * @param driverName - Nome do motorista (para criação de registro)
 * @param driverPlate - Placa do veículo (para criação de registro)
 * @param avatarUrl - URL do avatar (opcional)
 * @returns Token atualizado ou null se indisponível
 */
export async function ensureDriverPushToken(
    userId: string,
    driverName: string,
    driverPlate: string,
    avatarUrl?: string
): Promise<string | null> {
    try {
        // Guard 1: Módulo de notificações não disponível (Expo Go)
        if (!Notifications) {
            logger.info('[PushSync]', 'Notificações indisponíveis (Expo Go ou módulo ausente).');
            return null;
        }

        // Guard 2: Verificar permissão sem solicitar novamente (não-intrusivo)
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
            // Solicita permissão uma vez — se negar, respeita
            const { status: newStatus } = await Notifications.requestPermissionsAsync();
            if (newStatus !== 'granted') {
                logger.info('[PushSync]', 'Permissão de notificação negada pelo usuário.');
                return null;
            }
        }

        // Obtém token mais recente do dispositivo
        const projectId = Constants.expoConfig?.extra?.eas?.projectId
            || process.env.EXPO_PUBLIC_AETHER_PROJECT_ID
            || '2df3cb3a-25ab-4246-9596-8c608bff2603';

        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
        const freshToken = tokenData.data;

        if (!freshToken) {
            logger.warn('[PushSync]', 'Token retornado vazio pelo Expo.');
            return null;
        }

        // Verifica se o token já está correto no DRIVER_STATUS (evita write desnecessário)
        const statusRecords = await aether.db.collection(COLLECTIONS.DRIVER_STATUS)
            .query()
            .eq('user_id', userId)
            .get();

        if (statusRecords && (statusRecords as any[]).length > 0) {
            const record = (statusRecords as any[])[0];
            const currentToken = record.expoPushToken || record._payload?.expoPushToken || '';

            // Só atualiza se o token mudou (evita writes desnecessários no banco)
            if (currentToken === freshToken) {
                logger.debug('[PushSync]', 'Token já está atualizado no DRIVER_STATUS');
                return freshToken;
            }

            // Atualiza com o token fresco
            await aether.db.collection(COLLECTIONS.DRIVER_STATUS).update(record.id, {
                expoPushToken: freshToken,
                updatedAt: formatBrazilTimestamp(),
            });
            logger.info('[PushSync]', `Token atualizado no DRIVER_STATUS (${currentToken ? 'renovado' : 'primeiro registro'})`);
        } else {
            // Motorista sem DRIVER_STATUS — cria com token (self-healing + push)
            await aether.db.collection(COLLECTIONS.DRIVER_STATUS).create({
                user_id: userId,
                driverName,
                driverPlate,
                avatarUrl: avatarUrl || '',
                expoPushToken: freshToken,
                status: 'active',
                updatedByAdminId: 'system_push_auto_sync',
                created_at: formatBrazilTimestamp(),
            });
            logger.info('[PushSync]', 'DRIVER_STATUS criado com push token (novo motorista)');
        }

        return freshToken;
    } catch (error: unknown) {
        // Tolerância total: qualquer falha é logada mas não impede o uso do app
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn('[PushSync]', `Falha tolerada no auto-sync de push token: ${msg}`);
        return null;
    }
}

/**
 * Registra o push token do admin na coleção ADMIN_STATUS.
 * Usa upsert pattern: atualiza se já existe, cria se não.
 * @param adminId - ID do admin autenticado
 * @param adminName - Nome do admin para referência
 * @param token - Expo Push Token
 */
export async function registerAdminPushToken(
    adminId: string,
    adminName: string,
    token: string
): Promise<void> {
    if (!token) return;

    try {
        const existing = await aether.db.collection(COLLECTIONS.ADMIN_STATUS)
            .query()
            .eq('user_id', adminId)
            .get();

        if (existing && (existing as any[]).length > 0) {
            const record = (existing as any[])[0];
            await aether.db.collection(COLLECTIONS.ADMIN_STATUS).update(record.id, {
                expoPushToken: token,
                adminName,
                updatedAt: formatBrazilTimestamp(),
            });
        } else {
            await aether.db.collection(COLLECTIONS.ADMIN_STATUS).create({
                user_id: adminId,
                adminName,
                expoPushToken: token,
                createdAt: formatBrazilTimestamp(),
            });
        }
        logger.info('[Push]', 'Admin push token registrado com sucesso.');
    } catch (error) {
        logger.warn('[Push]', 'Erro ao registrar admin push token:', error);
    }
}

/**
 * Envia notificação Push para TODOS os admins registrados.
 * Busca tokens do ADMIN_STATUS e dispara via Expo Push API.
 * Tolerante a falhas: não lança exceção se nenhum admin estiver registrado.
 * @param title - Título da notificação
 * @param body - Corpo da mensagem
 * @param data - Dados extras opcionais
 * @returns Quantidade de tokens notificados (0 se nenhum admin registrado)
 */
export async function notifyAdmins(
    title: string,
    body: string,
    data: Record<string, unknown> = {}
): Promise<number> {
    try {
        const allAdmins = await aetherFetchAll(COLLECTIONS.ADMIN_STATUS);
        if (!allAdmins || (allAdmins as Record<string, unknown>[]).length === 0) {
            logger.info('[Push]', 'Nenhum admin registrado para receber notificações.');
            return 0;
        }

        const tokens = (allAdmins as Record<string, unknown>[]).map(a => {
            return (a.expoPushToken as string) || '';
        }).filter(t => t && t.trim() !== '');

        if (tokens.length === 0) {
            logger.info('[Push]', 'Admins encontrados, mas nenhum possui push token.');
            return 0;
        }

        await sendPushNotification(tokens, title, body, data);
        return tokens.length;
    } catch (error) {
        logger.warn('[Push]', 'Erro ao notificar admins (tolerado):', error);
        return 0;
    }
}

/**
 * [SENIOR UX] Dispara um Alerta para o Admin que persiste no banco 
 * e envia Notificação Push simultaneamente.
 */
export async function dispatchAdminAlert(
    title: string,
    message: string,
    type: 'availability_answered' | 'route_confirmed' | 'route_completed' | 'ticket_created' | 'system_alert' | 'info',
    relatedDriverId?: string,
    relatedAssignmentId?: string
): Promise<void> {
    try {
        // 1. Salva no banco (para a Notification Center In-App do Admin)
        await aether.db.collection(COLLECTIONS.ADMIN_NOTIFICATIONS).create({
            title,
            message,
            type,
            read: false,
            relatedDriverId: relatedDriverId || null,
            relatedAssignmentId: relatedAssignmentId || null,
            createdAt: formatBrazilTimestamp()
        });
    } catch (e) {
        logger.warn('[Push]', 'Erro ao persistir notificação de admin:', e);
    }

    // 2. Dispara Push Notification (padrão nativo do Expo)
    await notifyAdmins(title, message, {
        type, relatedDriverId, relatedAssignmentId
    });
}

/**
 * Envia notificação Push para um motorista específico pelo ID.
 * Busca o token do DRIVER_STATUS e dispara via Expo Push API.
 * @param driverId - ID do motorista no sistema
 * @param title - Título da notificação
 * @param body - Corpo da mensagem
 * @param data - Dados extras opcionais
 */
export async function notifyDriver(
    driverId: string,
    title: string,
    body: string,
    data: Record<string, unknown> = {}
): Promise<void> {
    const statusRecord = await aether.db.collection(COLLECTIONS.DRIVER_STATUS)
        .query()
        .eq('user_id', driverId)
        .get();

    if (!statusRecord || statusRecord.length === 0) {
        throw new Error('DriverStatus não encontrado para este motorista.');
    }

    const record = statusRecord[0] as Record<string, unknown>;
    const payload = record._payload as Record<string, unknown> | undefined;
    const token = (record.expoPushToken as string) || (payload?.expoPushToken as string) || '';
    if (!token) {
        throw new Error('O motorista não ativou as notificações no celular.');
    }

    await sendPushNotification(token, title, body, data);
}
