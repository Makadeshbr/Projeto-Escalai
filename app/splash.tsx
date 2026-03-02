import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { THEME } from '~/src/constants/theme';
import { useRouter } from 'expo-router';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withRepeat,
    withSequence
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'react-native';
import { useAuthStore } from '~/src/store/auth';
import { isAetherClientReady, getAetherClient } from '@aether-baas/react-native';

const { width, height } = Dimensions.get('window');

export default function SplashScreen() {
    const router = useRouter();
    // Recupera dados já hidratados do persist middleware do Zustand
    const { user, role } = useAuthStore();

    const pulseAnim = useSharedValue(0.2);
    const floatAnim = useSharedValue(0);
    const progressAnim = useSharedValue(0);

    useEffect(() => {
        // Efeito de pulso suave no glow central
        pulseAnim.value = withRepeat(
            withSequence(
                withTiming(0.4, { duration: 2000 }),
                withTiming(0.2, { duration: 2000 })
            ),
            -1,
            true
        );

        // Levitação lenta do container
        floatAnim.value = withRepeat(
            withSequence(
                withTiming(-8, { duration: 3000 }),
                withTiming(0, { duration: 3000 })
            ),
            -1,
            true
        );

        // Barra de loading
        progressAnim.value = withTiming(100, { duration: 2800 });

        const timer = setInterval(() => {
            // Aguarda o SDK Aether montar do AsyncStorage
            if (!isAetherClientReady()) return;

            clearInterval(timer);

            const client = getAetherClient();
            // Verifica a Verdade Universal (O SDK Aether tem Token válido?)
            const trueToken = typeof client.getToken === 'function' ? client.getToken() : null;

            // Se o Zustand acha que tá logado, mas NÃO HÁ TOKEN na Database (Expirou ou Limpou)
            if (user && role && !trueToken) {
                __DEV__ && console.warn('[Splash] Zustand Cache Inutilizado - Token Aether Ausente. Expulsando para Login.');
                useAuthStore.getState().logout(); // Reseta estado fantasma.
                router.replace('/login');
                return;
            }

            // Fluxo Feliz: Tem cache de Zustand E auth viva na SDK.
            if (user && role && trueToken) {
                if (role === 'admin') {
                    router.replace('/admin/dashboard');
                } else {
                    router.replace('/driver/dashboard');
                }
            } else {
                router.replace('/login');
            }
        }, 500); // Checa a cada meio segundo (ao invés de salto cego aos 3s)

        return () => clearInterval(timer);
    }, [user, role, router]);

    const animatedPulseStyle = useAnimatedStyle(() => ({
        opacity: pulseAnim.value,
        transform: [{ scale: 1 + (pulseAnim.value * 0.5) }]
    }));

    const animatedFloatStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: floatAnim.value }]
    }));

    const animatedProgressStyle = useAnimatedStyle(() => ({
        width: `${progressAnim.value}%`
    }));

    return (
        <View className="flex-1 bg-[#0a0a0c] items-center justify-center relative">
            {/* Background Smoky Gradient (Idêntico ao Login) */}
            <LinearGradient
                colors={['#10121a', '#0a0a0c', '#050505']}
                style={StyleSheet.absoluteFillObject}
            />

            <Animated.View style={[animatedFloatStyle, { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }]}>
                {/* Logo Area */}
                <View className="relative w-48 h-48 items-center justify-center mb-16 z-20">
                    {/* Efeito de Borrão/Glow Central Esfumaçado - Múltiplas camadas p/ blur profundo */}
                    <Animated.View style={[styles.centerGlowBlur, animatedPulseStyle]} />
                    <View style={styles.centerOuterGlow} />
                    <View style={styles.ghostRing} />
                    <View className="relative z-10 w-32 h-32 items-center justify-center bg-transparent rounded-3xl p-1 overflow-visible">
                        <Image
                            source={require('~/assets/icon.png')}
                            style={{ width: 120, height: 120, borderRadius: 28 }}
                            resizeMode="contain"
                        />
                    </View>
                    <View className="absolute right-4 top-12 w-2 h-2 bg-[#ffe600] rounded-full" style={styles.smallGlowDot} />
                </View>
            </Animated.View>

            {/* Bottom Loader Area */}
            <View className="w-full max-w-[260px] px-6 absolute bottom-16">
                {/* Progress Bar */}
                <View className="h-1.5 w-full bg-surface rounded-full overflow-hidden flex-row mb-6 mt-4">
                    <Animated.View style={[animatedProgressStyle, { height: '100%', backgroundColor: THEME.colors.primary, shadowColor: THEME.colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 10, elevation: 5 }]} />
                </View>

                {/* Aether Branding */}
                <View className="items-center gap-1 opacity-80 mt-2">
                    <Text className="text-[12px] text-text-light font-spaceGrotesk tracking-widest uppercase">
                        Feito pela plataforma
                    </Text>
                    <Text className="text-[16px] text-[#ffe600] font-spaceGroteskBold tracking-wide">
                        Aether
                    </Text>
                </View>
            </View>

            {/* Ambient Bottom Glow */}
            <View style={styles.ambientBottomGlow} />
        </View>
    );
}

const styles = StyleSheet.create({
    centerGlowBlur: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255, 230, 0, 0.1)',
        borderRadius: 150,
        margin: 10,
        shadowColor: THEME.colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 50,
        elevation: 10,
    },
    centerOuterGlow: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(29, 36, 51, 0.4)',
        borderRadius: 150,
        margin: -10,
        shadowColor: '#1d2433',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 60,
        elevation: 5,
    },
    ghostRing: {
        ...StyleSheet.absoluteFillObject,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 150,
        borderStyle: 'dashed',
        margin: -5,
    },
    smallGlowDot: {
        shadowColor: THEME.colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 10,
        elevation: 5,
    },
    ambientBottomGlow: {
        position: 'absolute',
        bottom: -100,
        right: -100,
        width: 300,
        height: 300,
        borderRadius: 150,
        backgroundColor: 'rgba(255, 230, 0, 0.03)',
        shadowColor: THEME.colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 100,
    },
    logoTextBase: {
        fontSize: 52,
        fontFamily: 'SpaceGroteskBold',
        fontWeight: '900',
        fontStyle: 'italic',
        includeFontPadding: false,
    },
    logoTextHighlight: {
        fontSize: 52,
        fontFamily: 'SpaceGroteskBold',
        fontWeight: '900',
        fontStyle: 'italic',
        textShadowColor: 'rgba(255, 230, 0, 0.8)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 15,
        includeFontPadding: false,
    }
});
