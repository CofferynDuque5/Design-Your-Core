export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo">
      <svg viewBox="0 0 64 64" width="28" height="28" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="var(--color-primary)" />
        {/* Brote en tierra: tallo, dos hojas y su sombra. */}
        <g transform="translate(32 32) scale(0.8) translate(-33 -33.5)">
          <ellipse cx="32" cy="53" rx="10" ry="3" fill="var(--color-sand)" opacity="0.45" />
          <path d="M32 50 V30" fill="none" stroke="var(--color-sand-soft)" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M31 41 C23 41 16 35.5 15 26 C24 26 30.5 31.5 31 41 Z" fill="var(--color-sand-soft)" />
          <path d="M33 32 C33 21.5 40.5 13 51 11.5 C51 23 43.5 31 33 32 Z" fill="var(--color-sand-soft)" />
        </g>
      </svg>
      {!compact && <span className="logo__text">Design Your Core</span>}
    </span>
  );
}
