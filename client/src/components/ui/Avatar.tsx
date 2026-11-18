import { cn, initials } from '../../lib/format';

/** Initials on a muted, per-person tint. Hue comes from the server so it's stable everywhere. */
export function Avatar({
  name,
  hue,
  size = 32,
  dim,
  className,
}: {
  name: string;
  hue: number;
  size?: number;
  dim?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn('inline-grid shrink-0 place-items-center rounded-full font-medium transition-opacity', dim && 'opacity-45', className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: `oklch(0.34 0.06 ${hue})`,
        color: `oklch(0.9 0.06 ${hue})`,
        boxShadow: `inset 0 0 0 1px oklch(0.45 0.07 ${hue} / 0.6)`,
      }}
    >
      {initials(name)}
    </span>
  );
}

export function nameColor(hue: number) {
  return `oklch(0.82 0.09 ${hue})`;
}
