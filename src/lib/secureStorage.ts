import * as SecureStore from 'expo-secure-store';
import type { StateStorage } from 'zustand/middleware';

/**
 * Adapter de SecureStore para Zustand persist middleware.
 * Substitui AsyncStorage (plaintext) por expo-secure-store (encriptado).
 *
 * Dados ficam protegidos por:
 * - iOS: Keychain (hardware-backed)
 * - Android: Keystore + EncryptedSharedPreferences
 *
 * NOTA: Users precisarão re-logar 1x após o update (dados migram de formato).
 */
export const secureStorage: StateStorage = {
    getItem: async (name: string): Promise<string | null> => {
        return SecureStore.getItemAsync(name);
    },
    setItem: async (name: string, value: string): Promise<void> => {
        await SecureStore.setItemAsync(name, value);
    },
    removeItem: async (name: string): Promise<void> => {
        await SecureStore.deleteItemAsync(name);
    },
};
