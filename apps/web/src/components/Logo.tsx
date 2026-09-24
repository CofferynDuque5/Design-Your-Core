export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo">
      <svg viewBox="0 0 64 64" width="28" height="28" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="var(--color-primary)" />
        <circle cx="32" cy="32" r="17" fill="none" stroke="var(--color-sand-soft)" strokeWidth="4" />
        <circle cx="32" cy="32" r="6" fill="var(--color-sand)" />
      </svg>
      {!compact && <span className="logo__text">Design Your Core</span>}
    </span>
  );
}
