import { avatarById, type AvatarInfo, type AvatarShape } from '@dyc/core';

const draw = (s: AvatarShape, i: number) => {
  const { el, ...props } = s;
  if (el === 'circle') return <circle key={i} {...(props as Omit<Extract<AvatarShape, { el: 'circle' }>, 'el'>)} strokeLinecap="round" />;
  if (el === 'ellipse') return <ellipse key={i} {...(props as Omit<Extract<AvatarShape, { el: 'ellipse' }>, 'el'>)} strokeLinecap="round" />;
  return <path key={i} {...(props as Omit<Extract<AvatarShape, { el: 'path' }>, 'el'>)} strokeLinecap="round" strokeLinejoin="round" />;
};

/** Dibujo de un personaje de la app (AVATARS). */
export function AvatarArt({ avatar, size = 64, label }: { avatar: AvatarInfo; size?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} className="avatar-art">
      <circle cx={32} cy={32} r={32} fill={avatar.bg} />
      {avatar.shapes.map(draw)}
    </svg>
  );
}

/** Foto de perfil: el personaje elegido o, si no hay, las iniciales. */
export function UserAvatar({ avatar, name, size = 40 }: { avatar?: string | null; name?: string | null; size?: number }) {
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
    <span className="avatar-initials" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">
      {initials}
    </span>
  );
}
