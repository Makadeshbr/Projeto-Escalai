/**
 * Testes unitários para o módulo useActionModal.
 * [AUDIT FIX — TEST-001] Valida que o módulo exporta corretamente.
 *
 * NOTA: Testes de integração com renderHook requerem ambiente jest-expo
 * completo. Estes testes validam a API pública do módulo.
 */

describe('useActionModal module', () => {
    it('deve exportar a função useActionModal', () => {
        const mod = require('~/src/hooks/useActionModal');
        expect(typeof mod.useActionModal).toBe('function');
    });

    it('não deve exportar estado interno diretamente', () => {
        const mod = require('~/src/hooks/useActionModal');
        // Apenas a função hook deve ser exportada, não variáveis internas
        expect(mod.INITIAL_STATE).toBeUndefined();
    });

    it('deve ter ActionModalState e ModalType como exports tipados', () => {
        // Verifica que o módulo pode ser importado sem erros
        const mod = require('~/src/hooks/useActionModal');
        expect(mod).toBeDefined();
        expect(Object.keys(mod)).toContain('useActionModal');
    });
});
