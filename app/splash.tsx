import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withRepeat,
    withSequence
} from 'react-native-reanimated';
import { Fingerprint } from 'lucide-react-native';
import Svg, { Polygon, Rect, G } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

export default function SplashScreen() {
    const router = useRouter();

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

        const timer = setTimeout(() => {
            router.replace('/login');
        }, 3000);

        return () => clearTimeout(timer);
    }, []);

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
                <View className="relative w-48 h-48 items-center justify-center mb-10">

                    {/* Efeito de Borrão/Glow Central Esfumaçado - Múltiplas camadas p/ blur profundo */}
                    <Animated.View style={[styles.centerGlowBlur, animatedPulseStyle]} />
                    <View style={styles.centerOuterGlow} />

                    {/* Detalhe Sutil Tracejado (mantido bem apagado apenas p/ profundidade se houver no design) */}
                    <View style={styles.ghostRing} />

                    {/* Abstract ML Driver Logo Icon com SVG Nativo */}
                    <View className="relative z-10 w-24 h-24 items-center justify-center" style={{ transform: [{ skewX: '-12deg' }] }}>
                        <Svg width="96" height="96" viewBox="0 0 96 96" style={{ overflow: 'visible' }}>
                            <G x="8" y="32">
                                <Polygon points="12.8,0 64,0 51.2,32 0,32" fill="#2d3277" opacity={0.9} />
                            </G>
                            <G x="32" y="24">
                                <Polygon points="48,0 64,24 48,48 0,48 16,24 0,0" fill="#ffe600" />
                            </G>
                            <Rect x="-16" y="8" width="32" height="4" rx="2" fill="rgba(255,255,255,0.2)" />
                            <Rect x="-32" y="80" width="48" height="4" rx="2" fill="rgba(255,255,255,0.1)" />
                        </Svg>
                    </View>

                    {/* Pontinho amarelo flutuando (Pequeno efeito glow) */}
                    <View className="absolute right-4 top-12 w-2 h-2 bg-[#ffe600] rounded-full" style={styles.smallGlowDot} />
                </View>

                {/* Typography Logo */}
                <View className="items-center mb-16 z-20">
                    <View className="flex-row items-baseline">
                        <Text style={styles.logoTextBase} className="text-white">ML</Text>
                        <Text style={styles.logoTextHighlight} className="text-[#ffe600]">Driver</Text>
                    </View>

                    <View className="flex-row items-center justify-center mt-3 opacity-90">
                        <View style={{ height: 1, width: 40, flex: 1, maxWidth: 40, backgroundColor: 'rgba(255,230,0,0.4)', marginRight: 12 }} />
                        <Text style={{ color: '#9ca3af', fontSize: 10, letterSpacing: 4, fontFamily: 'SpaceGrotesk', textTransform: 'uppercase' }}>
                            LOGISTICS CORE
                        </Text>
                        <View style={{ height: 1, width: 40, flex: 1, maxWidth: 40, backgroundColor: 'rgba(255,230,0,0.4)', marginLeft: 12 }} />
                    </View>
                </View>
            </Animated.View>

            {/* Bottom Loader Area */}
            <View className="w-full max-w-[260px] px-6 absolute bottom-16">
                <View className="flex-row justify-between mb-2">
                    <Text className="text-[10px] font-mono font-bold text-[#ffe600]">SYSTEM CHECK</Text>
                    <Text className="text-[10px] font-mono font-bold text-[#ffe600]">OK</Text>
                </View>

                {/* Progress Bar */}
                <View className="h-1.5 w-full bg-[#1e2332] rounded-full overflow-hidden flex-row">
                    <Animated.View style={[animatedProgressStyle, { height: '100%', backgroundColor: '#ffe600', shadowColor: '#ffe600', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 10, elevation: 5 }]} />
                </View>

                <View className="flex-row justify-between mt-2 mb-10">
                    <Text className="text-[9px] font-mono text-[#64748b]">ID: 8492-X</Text>
                    <Text className="text-[9px] font-mono text-[#64748b]">SYNCING...</Text>
                </View>

                {/* Security Badge */}
                <View className="items-center gap-1 opacity-80 mt-2">
                    <Fingerprint size={24} color="#475569" />
                    <Text className="text-[10px] text-[#475569] font-mono mt-1">SECURE CONNECTION ESTABLISHED</Text>
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
        shadowColor: '#ffe600',
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
        shadowColor: '#ffe600',
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
        shadowColor: '#ffe600',
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
