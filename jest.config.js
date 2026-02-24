/** @type {import('jest').Config} */
module.exports = {
    /**
     * [AUDIT FIX — TEST-001] Configuração Jest para testes unitários puros.
     * Usa ts-jest para transformar TypeScript sem passar pelo babel.config.js
     * do projeto (que contém nativewind/reanimated incompatíveis com Jest).
     */
    testEnvironment: 'node',
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: {
                jsx: 'react-jsx',
                module: 'commonjs',
                esModuleInterop: true,
                allowJs: true,
                strict: false,
                baseUrl: '.',
                paths: { '~/*': ['./*'] },
            },
        }],
    },
    moduleNameMapper: {
        '^~/(.*)$': '<rootDir>/$1',
    },
    testMatch: [
        '**/__tests__/**/*.(test|spec).(ts|tsx)',
    ],
    collectCoverageFrom: [
        'src/**/*.{ts,tsx}',
        '!src/**/*.d.ts',
        '!**/node_modules/**',
    ],
};
