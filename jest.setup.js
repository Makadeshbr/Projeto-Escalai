/**
 * Setup global para testes jest-expo.
 * Mocka módulos nativos que não funcionam no ambiente de teste.
 */
jest.mock('react-native-reanimated', () => {
    const Reanimated = require('react-native-reanimated/mock');
    Reanimated.default.call = () => { };
    return Reanimated;
});
