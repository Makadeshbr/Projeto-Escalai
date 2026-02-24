module.exports = function (api) {
    /** Cache invalida quando NODE_ENV muda (test vs development vs production) */
    api.cache.using(() => process.env.NODE_ENV);

    const isTest = process.env.NODE_ENV === 'test';

    /**
     * [AUDIT FIX — TEST-001] Nativewind e Reanimated plugins/presets
     * não são compatíveis com ambiente Jest. Removemos conditionally
     * para que testes unitários rodem sem interferência de transforms nativos.
     */
    const presets = [
        ["babel-preset-expo", { jsxImportSource: isTest ? undefined : "nativewind" }],
    ];
    if (!isTest) {
        presets.push("nativewind/babel");
    }

    const plugins = [];
    if (!isTest) {
        plugins.push('react-native-reanimated/plugin');
    }

    return { presets, plugins };
};

