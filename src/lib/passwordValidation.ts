/**
 * Validação de senha enterprise — exige complexidade mínima.
 * Reutilizado em register.tsx e profile.tsx (change password).
 */

export interface PasswordValidationResult {
    isValid: boolean;
    message: string;
}

const MIN_LENGTH = 8;

/**
 * Valida se a senha atende aos critérios de segurança.
 * - Mínimo 8 caracteres
 * - Pelo menos 1 letra maiúscula
 * - Pelo menos 1 letra minúscula
 * - Pelo menos 1 número
 */
export function validatePassword(password: string): PasswordValidationResult {
    if (password.length < MIN_LENGTH) {
        return { isValid: false, message: `A senha deve ter no mínimo ${MIN_LENGTH} caracteres.` };
    }
    if (!/[A-Z]/.test(password)) {
        return { isValid: false, message: 'A senha deve conter pelo menos 1 letra maiúscula.' };
    }
    if (!/[a-z]/.test(password)) {
        return { isValid: false, message: 'A senha deve conter pelo menos 1 letra minúscula.' };
    }
    if (!/[0-9]/.test(password)) {
        return { isValid: false, message: 'A senha deve conter pelo menos 1 número.' };
    }
    return { isValid: true, message: '' };
}

/**
 * Retorna a força da senha como score 0-4 para UI (indicador visual).
 * 0 = muito fraca, 1 = fraca, 2 = razoável, 3 = boa, 4 = forte
 */
export function getPasswordStrength(password: string): number {
    let score = 0;
    if (password.length >= MIN_LENGTH) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return Math.min(score, 4);
}
