import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { secureStorage } from '~/src/lib/secureStorage';

/**
 * Metadados tipados do perfil do motorista/admin no EscalAI.
 * Mapeamento 1:1 com os campos salvos via aether.tenantAuth.updateProfile().
 *
 * Com o generic TenantUser<EscalaiUserMetadata> do SDK 3.7.0,
 * todos os acessos a user.metadata.* agora são type-safe.
 */
export interface EscalaiUserMetadata {
    /** Nome de exibição do motorista */
    name?: string;
    /** Placa do veículo (formato: XXX-0X00) */
    vehiclePlate?: string;
    /** URL da foto de perfil (Aether Storage) */
    avatarUrl?: string;
    /** Telefone celular do motorista (formato: DDD + número) */
    phone?: string;
    /** Token do Expo Push Notifications */
    expoPushToken?: string;
    /** Tipo de veículo (truck, van, etc.) */
    vehicleType?: string;
}

/**
 * Dados do usuário autenticado no sistema EscalAI.
 * [AUDIT FIX — SEC-004] Tipagem concreta substitui `any` anterior.
 * [SDK 3.7.0] Metadata agora é tipado via EscalaiUserMetadata.
 */
export interface AuthUser {
    /** Identificador único do usuário no Aether BaaS */
    id: string;
    /** E-mail de login */
    email: string;
    /** Nome de exibição (pode ser null se não preenchido) */
    name: string | null;
    /** Metadados extras do perfil (role, avatar, placa, etc.) */
    metadata: EscalaiUserMetadata;
}

/**
 * Estado global de autenticação gerenciado via Zustand.
 * Armazena usuário logado e role (admin/driver).
 *
 * [SEC-001] Persistido via expo-secure-store (encriptado no Keychain/Keystore).
 * O token real de sessão é gerenciado pelo AetherProvider, esta store
 * mantém a UI síncrona com os dados do usuário para roteamento.
 */
interface AuthState {
    /** Usuário autenticado ou null se deslogado */
    user: AuthUser | null;
    /** Role ativo do usuário nesta sessão */
    role: 'driver' | 'admin' | null;
    /** Autentica o usuário e define o role */
    login: (user: AuthUser, role: 'driver' | 'admin') => void;
    /** Limpa estado de autenticação */
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            role: null,
            login: (user, role) => set({ user, role }),
            logout: () => set({ user: null, role: null }),
        }),
        {
            name: 'escalai-auth-secure', // Chave no SecureStore (encriptado)
            storage: createJSONStorage(() => secureStorage),
        }
    )
);
