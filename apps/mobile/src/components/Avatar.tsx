import { avatarById, type AvatarInfo } from '@dyc/core';
import { View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { useTheme } from '../lib/theme';
import { T, fonts } from './ui';

/** Dibujo de un personaje de la app (AVATARS), igual que en la web. */
export function AvatarArt({ avatar, size = 64, label }: { avatar: AvatarInfo; size?: number; label?: string }) {
  return (
    <View accessible={!!label} accessibilityRole={label ? 'image' : undefined} accessibilityLabel={label} importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Circle cx={32} cy={32} r={32} fill={avatar.bg} />
        {avatar.shapes.map((sh, i) => {
          const { el, ...p } = sh;
          if (el === 'circle') return <Circle key={i} {...(p as { cx: number; cy: number; r: number })} strokeLinecap="round" />;
          if (el === 'ellipse') return <Ellipse key={i} {...(p as { cx: number; cy: number; rx: number; ry: number })} strokeLinecap="round" />;
          return <Path key={i} {...(p as { d: string })} strokeLinecap="round" strokeLinejoin="round" />;
        })}
      </Svg>
    </View>
  );
}

/** Foto de perfil: el personaje elegido o las iniciales. */
export function UserAvatar({ avatar, name, size = 40 }: { avatar?: string | null; name?: string | null; size?: number }) {
  const { colors } = useTheme();
  const art = avatarById(avatar);
  if (art) return <AvatarArt avatar={art} size={size} label={`Tu personaje: ${art.name}`} />;
  const initials =
    (name ?? '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || 'TÚ';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
      <T v="body" style={{ fontFamily: fonts.semibold, fontSize: size * 0.36, lineHeight: size * 0.44, color: colors.onPrimary }}>
        {initials}
      </T>
    </View>
  );
}
