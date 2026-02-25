import React from 'react';
import { View, Image } from 'react-native';
import { User } from 'lucide-react-native';

/**
 * Componente reutilizável para exibir a foto de perfil do motorista.
 * Exibe a imagem do Aether Storage se disponível, ou fallback para ícone User.
 *
 * Quando o motorista define uma foto via /driver/profile, a URL é sincronizada
 * na coleção driver_status, permitindo que telas admin acessem via lookup.
 */
interface DriverAvatarProps {
    /** URL da foto de perfil (Aether Storage). Null/undefined exibe fallback. */
    avatarUrl?: string | null;
    /** Tamanho em pixels (width & height). Default: 48 */
    size?: number;
    /** Cor da borda quando SEM foto. Default: rgba(255,255,255,0.2) */
    borderColor?: string;
}

export function DriverAvatar({
    avatarUrl,
    size = 48,
    borderColor = 'rgba(255,255,255,0.2)',
}: DriverAvatarProps) {
    const hasAvatar = !!avatarUrl && typeof avatarUrl === 'string' && avatarUrl.startsWith('http');
    const iconSize = Math.round(size * 0.5);

    return (
        <View
            style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                overflow: 'hidden',
                backgroundColor: hasAvatar ? '#1e2332' : 'rgba(255,255,255,0.1)',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: hasAvatar ? 2 : 1,
                borderColor: hasAvatar ? 'rgba(255,230,0,0.3)' : borderColor,
            }}
        >
            {hasAvatar ? (
                <Image
                    source={{ uri: avatarUrl! }}
                    style={{ width: size, height: size }}
                    resizeMode="cover"
                />
            ) : (
                <User size={iconSize} color="#94a3b8" />
            )}
        </View>
    );
}
