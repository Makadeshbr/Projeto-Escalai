import React, { memo } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, ScrollView, FlatList } from 'react-native';
import { Truck, MapPin, Package, Check, AlertTriangle, AlertCircle } from 'lucide-react-native';
import { RouteDraft } from '~/src/lib/gemini';
import { THEME } from '~/src/constants/theme';

interface ImportPreviewTableProps {
    routes: RouteDraft[];
    onChangeRoute: (index: number, field: keyof RouteDraft, value: string | boolean) => void;
    // Map of plate normalized -> status (true = driver found, false = unlisted)
    validationMap: Record<string, boolean>;
}

/** Verifica se um campo específico é duvidoso */
const isFieldLow = (route: RouteDraft, field: string) =>
    route.lowConfidenceFields?.includes(field) ?? false;

/** Cor da borda: amarelo se campo duvidoso, senão padrão */
const fieldBorder = (route: RouteDraft, field: string, defaultColor: string) =>
    isFieldLow(route, field) ? '#fbbf24' : defaultColor;

// Memoized Row for extreme performance on large lists
const RouteRow = memo(({ route, idx, isMatched, onChangeRoute }: any) => {
    const hasLowConfidence = !!route.lowConfidence;

    return (
        <View
            className="flex-row items-center border-b border-border/50 px-4 py-3"
            style={hasLowConfidence ? { backgroundColor: 'rgba(251, 191, 36, 0.06)' } : undefined}
        >
            {/* Status: 3 estados — verde (ok), amarelo (baixa confiança), vermelho (não cadastrado) */}
            <View className="w-12 items-center justify-center">
                {isMatched && !hasLowConfidence ? (
                    <Check color="#22c55e" size={20} />
                ) : hasLowConfidence ? (
                    <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: 'rgba(251, 191, 36, 0.15)', borderWidth: 1, borderColor: 'rgba(251, 191, 36, 0.3)' }}>
                        <AlertTriangle color="#fbbf24" size={16} />
                    </View>
                ) : (
                    <View className="w-8 h-8 rounded-full bg-red-500/10 items-center justify-center border border-red-500/20">
                        <AlertCircle color="#f87171" size={16} />
                    </View>
                )}
            </View>

            {/* Plate */}
            <View className={`w-24 px-2 py-1 justify-center rounded ${route.isSdd ? 'bg-[#fb923c]/20 border border-[#fb923c]/50' : 'bg-transparent'}`}
                style={isFieldLow(route, 'driverPlate') && !route.isSdd ? { borderWidth: 1, borderColor: '#fbbf24' } : undefined}
            >
                <TextInput
                    className="p-0 m-0 text-[14px] font-spaceGrotesk"
                    style={{ color: route.isSdd ? '#fb923c' : (isMatched ? '#ffffff' : '#f87171'), fontWeight: isMatched || route.isSdd ? 'bold' : 'normal' }}
                    value={route.driverPlate}
                    onChangeText={(val) => onChangeRoute(idx, 'driverPlate', val.toUpperCase())}
                    autoCapitalize="characters"
                />
            </View>

            {/* Driver Name & Missing Alert */}
            <View className={`w-52 px-2 py-1 justify-center rounded ${route.isSdd ? 'bg-[#fb923c]/10' : ''}`}>
                <TextInput
                    className="py-0 m-0 text-[13px] font-spaceGrotesk"
                    style={{ color: route.isSdd ? '#fdba74' : (isMatched ? '#cbd5e1' : '#fca5a5') }}
                    value={route.driverName}
                    onChangeText={(val) => onChangeRoute(idx, 'driverName', val)}
                />
                {!isMatched && (
                    <Text className="text-[10px] text-red-500 font-spaceGroteskBold -mt-1 uppercase">
                        Não cadastrado na base / folga
                    </Text>
                )}
            </View>

            {/* Dock */}
            <TextInput
                className="w-20 px-2 py-1 text-[14px] font-spaceGroteskBold text-center bg-background rounded-lg border"
                style={{
                    color: route.dock ? '#ffffff' : '#f87171',
                    borderColor: !route.dock ? '#ef4444' : fieldBorder(route, 'dock', '#333'),
                    borderWidth: isFieldLow(route, 'dock') ? 2 : 1,
                }}
                value={route.dock}
                placeholder="???"
                placeholderTextColor="#ef4444"
                onChangeText={(val) => onChangeRoute(idx, 'dock', val)}
                keyboardType="numbers-and-punctuation"
                maxLength={4}
            />

            {/* Sacas */}
            <TextInput
                className="w-20 ml-2 px-2 py-1 text-[14px] font-spaceGrotesk text-center bg-background rounded-lg border"
                style={{
                    color: '#f97316',
                    borderColor: fieldBorder(route, 'sacas', 'rgba(249, 115, 22, 0.3)'),
                    borderWidth: isFieldLow(route, 'sacas') ? 2 : 1,
                }}
                value={route.sacas !== undefined ? String(route.sacas) : ''}
                placeholder="Qtd"
                placeholderTextColor="#475569"
                onChangeText={(val) => {
                    const cleaned = val.replace(/[^0-9]/g, '');
                    const parsed = cleaned ? parseInt(cleaned, 10) : 0;
                    onChangeRoute(idx, 'sacas', isNaN(parsed) ? 0 : parsed);
                }}
                keyboardType="numeric"
                maxLength={4}
            />

            {/* Wave */}
            <TextInput
                className="w-24 px-2 py-1 text-[13px] font-spaceGrotesk text-center bg-transparent rounded"
                style={{ color: '#e2e8f0' }}
                value={route.waveLabel}
                onChangeText={(val) => onChangeRoute(idx, 'waveLabel', val)}
            />

            {/* Onda / Wave Number */}
            <TextInput
                className="w-20 px-2 py-1 text-[14px] font-spaceGroteskBold text-center bg-background rounded-lg border"
                style={{
                    color: THEME.colors.primary,
                    borderColor: fieldBorder(route, 'waveNumber', 'rgba(99, 102, 241, 0.3)'),
                    borderWidth: isFieldLow(route, 'waveNumber') ? 2 : 1,
                }}
                value={route.waveNumber || ''}
                placeholder="Nº"
                placeholderTextColor="#475569"
                onChangeText={(val) => onChangeRoute(idx, 'waveNumber', val)}
                autoCapitalize="characters"
                maxLength={10}
            />

            {/* City */}
            <TextInput
                className="w-32 px-2 py-1 text-[13px] font-spaceGrotesk bg-transparent rounded"
                style={{
                    color: isFieldLow(route, 'city') ? '#fbbf24' : '#cbd5e1',
                    borderWidth: isFieldLow(route, 'city') ? 1 : 0,
                    borderColor: '#fbbf24',
                }}
                value={route.city}
                onChangeText={(val) => onChangeRoute(idx, 'city', val)}
                autoCapitalize="words"
            />

            {/* Route Label */}
            <TextInput
                className="w-32 px-2 py-1 text-[13px] font-spaceGrotesk bg-transparent rounded"
                style={{ color: '#cbd5e1' }}
                value={route.routeLabel || ''}
                placeholder="Cód..."
                placeholderTextColor="#475569"
                onChangeText={(val) => onChangeRoute(idx, 'routeLabel', val)}
            />

            {/* SDD Toggle */}
            <View className="w-24 items-center justify-center">
                <Switch
                    value={!!route.isSdd}
                    onValueChange={(val) => onChangeRoute(idx, 'isSdd', val)}
                    trackColor={{ false: THEME.colors.headerBackground, true: '#fb923c' }}
                    thumbColor={route.isSdd ? '#ffffff' : '#94a3b8'}
                    style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                />
            </View>
        </View>
    );
});

export default function ImportPreviewTable({ routes, onChangeRoute, validationMap }: ImportPreviewTableProps) {
    if (routes.length === 0) {
        return (
            <View className="py-10 items-center justify-center bg-background rounded-2xl border border-dashed border-border">
                <Text className="text-[#94a3b8] font-spaceGrotesk text-center px-4">
                    Nenhuma rota extraída ainda.{'\n'}Faça upload do PDF/Imagem acima.
                </Text>
            </View>
        );
    }

    const renderHeader = () => (
        <View className="flex-row items-center bg-[#2d3345]/30 px-4 py-3 border-b border-border">
            <Text className="text-[12px] font-spaceGroteskBold text-[#94a3b8] w-12 text-center uppercase">Status</Text>
            <Text className="text-[12px] font-spaceGroteskBold text-[#94a3b8] w-24 pl-2 uppercase">Placa</Text>
            <Text className="text-[12px] font-spaceGroteskBold text-[#94a3b8] w-52 pl-2 uppercase">Motorista</Text>
            <Text className="text-[12px] font-spaceGroteskBold text-[#94a3b8] w-20 text-center uppercase">Doca</Text>
            <Text className="text-[12px] font-spaceGroteskBold text-[#f97316] w-20 ml-2 text-center uppercase">Sacas</Text>
            <Text className="text-[12px] font-spaceGroteskBold text-[#94a3b8] w-24 text-center uppercase">Turno</Text>
            <Text className="text-[12px] font-spaceGroteskBold text-primary w-20 text-center uppercase">Onda</Text>
            <Text className="text-[12px] font-spaceGroteskBold text-[#94a3b8] w-32 pl-2 uppercase">Cidade</Text>
            <Text className="text-[12px] font-spaceGroteskBold text-[#94a3b8] w-32 pl-2 uppercase">Rota</Text>
            <Text className="text-[12px] font-spaceGroteskBold text-[#94a3b8] w-24 text-center uppercase flex-row items-center">
                <Text className="text-[#fb923c] font-spaceGroteskBold">SDD</Text> (Prioridade)
            </Text>
        </View>
    );

    return (
        <ScrollView horizontal className="bg-surface rounded-xl border border-border pb-2 mt-4" contentContainerStyle={{ flexDirection: 'column' }}>
            {renderHeader()}

            <FlatList
                data={routes}
                keyExtractor={(_, index) => index.toString()}
                renderItem={({ item, index }) => {
                    const isMatched = validationMap[item.driverPlate.replace(/[^A-Z0-9]/g, '')];
                    return (
                        <RouteRow
                            route={item}
                            idx={index}
                            isMatched={isMatched}
                            onChangeRoute={onChangeRoute}
                        />
                    );
                }}
                initialNumToRender={10}
                maxToRenderPerBatch={15}
                windowSize={5}
                removeClippedSubviews={true}
                ItemSeparatorComponent={null}
            />
        </ScrollView>
    );
}
