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

// Memoized Row for extreme performance on large lists 
const RouteRow = memo(({ route, idx, isMatched, onChangeRoute }: any) => {
    return (
        <View className="flex-row items-center border-b border-[#2d3345]/50 px-4 py-3">
            {/* Validation Status Indicator */}
            <View className="w-12 items-center justify-center">
                {isMatched ? (
                    <Check color="#22c55e" size={20} />
                ) : (
                    <View className="w-8 h-8 rounded-full bg-red-500/10 items-center justify-center border border-red-500/20">
                        <AlertTriangle color="#f87171" size={16} />
                    </View>
                )}
            </View>

            {/* Plate */}
            <TextInput
                className={`w-24 px-2 py-0 my-0 text-[14px] font-spaceGrotesk bg-transparent rounded`}
                style={{ color: isMatched ? '#ffffff' : '#f87171', fontWeight: isMatched ? 'normal' : 'bold' }}
                value={route.driverPlate}
                onChangeText={(val) => onChangeRoute(idx, 'driverPlate', val.toUpperCase())}
                autoCapitalize="characters"
            />

            {/* Driver Name & Missing Alert */}
            <View className="w-52 px-2 justify-center">
                <TextInput
                    className={`py-1 text-[13px] font-spaceGrotesk bg-transparent rounded`}
                    style={{ color: isMatched ? '#cbd5e1' : '#fca5a5' }}
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
                className="w-20 px-2 py-1 text-[14px] font-spaceGrotesk text-center bg-[#13151f] rounded-lg border border-[#2d3345]"
                style={{ color: '#ffffff' }}
                value={route.dock}
                onChangeText={(val) => onChangeRoute(idx, 'dock', val)}
                keyboardType="numbers-and-punctuation"
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
                className="w-20 px-2 py-1 text-[14px] font-spaceGroteskBold text-center bg-[#13151f] rounded-lg border border-primary/30"
                style={{ color: THEME.colors.primary }}
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
                style={{ color: '#cbd5e1' }}
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
                    trackColor={{ false: '#0f1118', true: '#fb923c' }}
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
            <View className="py-10 items-center justify-center bg-[#13151f] rounded-2xl border border-dashed border-[#2d3345]">
                <Text className="text-[#94a3b8] font-spaceGrotesk text-center px-4">
                    Nenhuma rota extraída ainda.{'\n'}Faça upload do PDF/Imagem acima.
                </Text>
            </View>
        );
    }

    const renderHeader = () => (
        <View className="flex-row items-center bg-[#2d3345]/30 px-4 py-3 border-b border-[#2d3345]">
            <Text className="text-[12px] font-spaceGroteskBold text-[#94a3b8] w-12 text-center uppercase">Status</Text>
            <Text className="text-[12px] font-spaceGroteskBold text-[#94a3b8] w-24 pl-2 uppercase">Placa</Text>
            <Text className="text-[12px] font-spaceGroteskBold text-[#94a3b8] w-52 pl-2 uppercase">Motorista</Text>
            <Text className="text-[12px] font-spaceGroteskBold text-[#94a3b8] w-20 text-center uppercase">Doca</Text>
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
        <ScrollView horizontal className="bg-[#1e2332] rounded-xl border border-[#2d3345] pb-2 mt-4" contentContainerStyle={{ flexDirection: 'column' }}>
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
