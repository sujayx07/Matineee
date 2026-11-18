import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useRef, useState, type PointerEvent } from 'react';
import type { Moment } from '../../../../shared/protocol';
import { cn, formatTime } from '../../lib/format';

const BUCKETS = 72;

/**
 * Scrubber with a reaction "heat" strip above it — the room's collective
 * memory of where things got good. Drag to preview; release to commit.
 */
export function Timeline({
  current,
  duration,
  moments,
  onSeek,
  disabled,
  commitLabel,
}: {
  current: number;
  duration: number;
  moments: Moment[];
  onSeek: (t: number) => void;
  disabled?: boolean;
  commitLabel?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const known = duration > 0;

  const heat = useMemo(() => {
    if (!known || moments.length === 0) return [];
    const buckets = Array.from({ length: BUCKETS }, () => ({ n: 0, counts: new Map<string, number>() }));
    for (const m of moments) {
      const i = Math.min(BUCKETS - 1, Math.floor((m.t / duration) * BUCKETS));
      if (i < 0) continue;
      const b = buckets[i]!;
      b.n++;
      b.counts.set(m.emoji, (b.counts.get(m.emoji) ?? 0) + 1);
    }
    const max = Math.max(...buckets.map((b) => b.n));
    return buckets.map((b, i) => ({
      i,
      n: b.n,
      h: b.n ? 3 + (b.n / max) * 13 : 0,
      top: [...b.counts.entries()].sort((a, c) => c[1] - a[1])[0]?.[0],
      peak: b.n === max && b.n >= 2,
    }));
  }, [moments, duration, known]);

  const ratioAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };

  const onDown = (e: PointerEvent) => {
    if (disabled || !known) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setScrub(ratioAt(e.clientX) * duration);
  };
  const onMove = (e: PointerEvent) => {
    if (!known) return;
    const t = ratioAt(e.clientX) * duration;
    setHover(t);
    if (scrub !== null) setScrub(t);
  };
  const onUp = () => {
    if (scrub !== null) onSeek(scrub);
    setScrub(null);
  };

  const shown = scrub ?? current;
  const pct = known ? (shown / duration) * 100 : 0;
  const tip = scrub ?? hover;

  return (
    <div className="relative min-w-0 flex-1">
      {/* reaction heat */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(50%+6px)] flex h-4 items-end gap-px">
        {heat.map((b) => (
          <div key={b.i} className="relative flex-1">
            {b.n > 0 && (
              <motion.div
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                style={{ height: b.h, originY: 1 }}
                className="w-full rounded-t-[1px] bg-signal/45"
              />
            )}
            {b.peak && (
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[12px] leading-none">{b.top}</span>
            )}
          </div>
        ))}
      </div>

      <div
        ref={trackRef}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={formatTime(shown)}
        aria-disabled={disabled}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => setScrub(null)}
        onPointerLeave={() => setHover(null)}
        className={cn('group relative h-6 touch-none select-none', disabled || !known ? 'cursor-default' : 'cursor-pointer')}
      >
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-line transition-[height] duration-150 group-hover:h-[5px]">
          {hover !== null && known && scrub === null && (
            <div className="absolute inset-y-0 left-0 rounded-full bg-fg/15" style={{ width: `${(hover / duration) * 100}%` }} />
          )}
          <div className="absolute inset-y-0 left-0 rounded-full bg-fg" style={{ width: `${pct}%` }} />
        </div>
        {known && (
          <div
            className={cn(
              'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal shadow-[0_0_0_3px_var(--color-bg)] transition-transform duration-150',
              scrub !== null ? 'scale-125' : 'scale-100 group-hover:scale-110',
            )}
            style={{ left: `${pct}%` }}
          />
        )}
        <AnimatePresence>
          {tip !== null && known && !disabled && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="pointer-events-none absolute bottom-full mb-6 -translate-x-1/2 whitespace-nowrap rounded-md bg-overlay px-2 py-1 font-mono text-[11px] ring-1 ring-line tabular"
              style={{ left: `${(tip / duration) * 100}%` }}
            >
              {formatTime(tip)}
              {scrub !== null && commitLabel && <span className="ml-1.5 text-signal">{commitLabel}</span>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
