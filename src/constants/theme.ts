/**
 * [AUDIT FIX — CLEAN-004] Design tokens centralizados do EscalaiApp.
 * Todas as telas devem referenciar estas constantes em vez de cores hardcoded.
 * Mantém consistência visual e facilita futura troca de paleta.
 */
export const THEME = {
    colors: {
        /** Cor primária/destaque (amarelo EscalAI) */
        primary: '#f9e006',
        /** Fundo principal do app */
        background: '#13151f',
        /** Superfície de cards/modais */
        surface: '#1e2332',
        /** Bordas e divisores */
        border: '#2d3345',
        /** Fundo do header/bottom-bar */
        headerBackground: '#0f1118',
        /** Texto principal (branco) */
        text: '#ffffff',
        /** Texto secundário (cinza claro) */
        textSecondary: '#94a3b8',
        /** Texto terciário (cinza escuro) */
        textMuted: '#64748b',
        /** Cor de sucesso (verde) */
        success: '#4ade80',
        /** Cor de perigo/erro (vermelho) */
        danger: '#f87171',
        /** Cor de atenção/aviso (amarelo) */
        warning: '#eab308',
        /** Cor informativa (azul) */
        info: '#3b82f6',
        /** Laranja para SDD/prioridade */
        orange: '#ff9500',
    },
    /** Gradientes padrão usados no background das telas */
    gradients: {
        background: ['#1a1d2e', '#13151f', '#0f1118'] as const,
    },
} as const;

/** Tipo derivado para auto-complete das cores do tema */
export type ThemeColors = typeof THEME.colors;
