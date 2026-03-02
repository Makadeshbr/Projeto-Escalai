import { useEffect } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from '~/src/store/auth';

/**
 * Hook centralizado de auth guard.
 * Redireciona para /login se o role do usuário não bater com o esperado.
 *
 * Substitui o pattern duplicado em 4+ telas:
 *   useEffect(() => { if (role !== 'admin') router.replace('/login'); }, [role]);
 *
 * Uso:
 *   useRequireAuth('admin');   // Protege tela de admin
 *   useRequireAuth('driver');  // Protege tela de driver
 *
 * @param requiredRole - Role necessário para acessar a tela
 */
export function useRequireAuth(requiredRole: 'admin' | 'driver'): void {
    const { role } = useAuthStore();

    useEffect(() => {
        if (role !== requiredRole) {
            router.replace('/login');
        }
    }, [role, requiredRole]);
}
