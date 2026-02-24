import React from 'react';
import { View, Text, TouchableOpacity, FlatList, TextInput, ActivityIndicator, Modal } from 'react-native';
import { X, Check, Plus } from 'lucide-react-native';
import { THEME } from '~/src/constants/theme';
import type { City } from '~/src/lib/collections';

/**
 * Props do modal de seleção de cidade com opção de cadastro inline.
 */
interface CityPickerModalProps {
    /** Se o modal está visível */
    visible: boolean;
    /** Lista de cidades disponíveis */
    cities: City[];
    /** Cidade atualmente selecionada */
    selectedCity: City | null;
    /** Callback ao selecionar uma cidade */
    onSelect: (city: City) => void;
    /** Callback ao fechar o modal */
    onClose: () => void;
    /** Callback ao salvar nova cidade */
    onAddCity: (name: string, code: string, setLoading: (v: boolean) => void, onSuccess: () => void) => void;
}

/**
 * Modal para seleção de cidade com formulário inline de cadastro.
 * Exibe lista de cidades ativas com opção de adicionar nova.
 */
export function CityPickerModal({
    visible, cities, selectedCity, onSelect, onClose, onAddCity
}: CityPickerModalProps) {
    const [showAddCity, setShowAddCity] = React.useState(false);
    const [newCityName, setNewCityName] = React.useState('');
    const [newCityCode, setNewCityCode] = React.useState('');
    const [addingCity, setAddingCity] = React.useState(false);

    /** Reseta formulário e fecha tudo */
    const handleClose = () => {
        setShowAddCity(false);
        onClose();
    };

    return (
        <Modal visible={visible} animationType="fade" transparent>
            <View className="flex-1 bg-black/80 justify-center px-4">
                <View className="bg-surface rounded-3xl max-h-[70%] border border-border overflow-hidden">
                    {/* Header */}
                    <View className="flex-row items-center justify-between p-5 border-b border-border bg-[#1a1d2e]">
                        <Text className="text-white font-spaceGroteskBold text-lg">Selecionar Cidade</Text>
                        <TouchableOpacity onPress={handleClose} className="w-8 h-8 bg-background items-center justify-center rounded-full">
                            <X color="#94a3b8" size={18} />
                        </TouchableOpacity>
                    </View>

                    {/* Lista de cidades */}
                    <FlatList
                        data={cities}
                        keyExtractor={(item) => item.id}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                onPress={() => { onSelect(item); handleClose(); }}
                                className={`flex-row items-center justify-between p-5 border-b border-border/50 ${selectedCity?.id === item.id ? 'bg-primary/5' : ''}`}
                            >
                                <View>
                                    <Text className={`font-spaceGroteskBold text-base ${selectedCity?.id === item.id ? 'text-primary' : 'text-white'}`}>{item.name}</Text>
                                    {item.code && <Text className="text-text-muted text-[11px] font-spaceGrotesk mt-0.5 tracking-wider uppercase">{item.code}</Text>}
                                </View>
                                {selectedCity?.id === item.id && (
                                    <View className="w-6 h-6 bg-primary rounded-full items-center justify-center">
                                        <Check color="#000" size={14} />
                                    </View>
                                )}
                            </TouchableOpacity>
                        )}
                        ListFooterComponent={
                            <View className="p-5">
                                {!showAddCity ? (
                                    <TouchableOpacity onPress={() => setShowAddCity(true)} className="flex-row items-center justify-center gap-2 py-4 bg-background rounded-xl border border-border border-dashed">
                                        <Plus color={THEME.colors.primary} size={18} />
                                        <Text className="text-primary font-spaceGroteskBold text-[13px]">CADASTRAR NOVA CIDADE</Text>
                                    </TouchableOpacity>
                                ) : (
                                    <View className="bg-background p-4 rounded-xl border border-border gap-3">
                                        <TextInput
                                            value={newCityName}
                                            onChangeText={setNewCityName}
                                            placeholder="Nome da cidade (Ex: São Paulo)"
                                            placeholderTextColor={THEME.colors.textMuted}
                                            className="bg-surface border border-border rounded-xl py-3.5 px-4 text-white font-spaceGrotesk text-sm"
                                        />
                                        <TextInput
                                            value={newCityCode}
                                            onChangeText={setNewCityCode}
                                            placeholder="Código (Ex: SPO01)"
                                            placeholderTextColor={THEME.colors.textMuted}
                                            autoCapitalize="characters"
                                            className="bg-surface border border-border rounded-xl py-3.5 px-4 text-white font-spaceGrotesk text-sm"
                                        />
                                        <TouchableOpacity
                                            onPress={() => onAddCity(newCityName, newCityCode, setAddingCity, () => { setNewCityName(''); setNewCityCode(''); setShowAddCity(false); })}
                                            disabled={addingCity}
                                            className={`bg-primary py-3.5 rounded-xl items-center mt-2 ${addingCity ? 'opacity-50' : ''}`}
                                        >
                                            {addingCity ? <ActivityIndicator color="#000" size="small" /> : <Text className="text-[#13151f] font-spaceGroteskBold text-sm tracking-wide">SALVAR CIDADE</Text>}
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        }
                    />
                </View>
            </View>
        </Modal>
    );
}
