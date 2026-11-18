import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { formatTime } from '../../lib/format';
import { Avatar } from '../ui/Avatar';

/**
 * A scripted miniature of the product: four people, one clock. Pause, seek,
 * a dropped connection, a request — every playhead moves as one.
 */
const PEOPLE = [
  { name: 'Hana', hue: 28, role: 'host' },
  { name: 'Mo Reyes', hue: 230, role: 'mod' },
  { name: 'Gus', hue: 150, role: '' },
  { name: 'Ivy Chen', hue: 320, role: '' },
] as const;

const DURATION = 248; // a 4:08 "video"
const SPEED = 6; // demo runs fast so movement reads

type Beat = { at: number; log: string; run: (s: Sim) => void };
interface Sim {
  t: number;
  playing: boolean;
  offline: number | null; // index of a lagging viewer
  laggedAt: number;
}

const SCRIPT: Beat[] = [
  { at: 0, log: 'Hana started “Night Drive (Live)”', run: (s) => ((s.t = 12), (s.playing = true)) },
  { at: 3.6, log: 'Hana paused', run: (s) => (s.playing = false) },
  { at: 5.4, log: 'Hana resumed', run: (s) => (s.playing = true) },
  { at: 7.8, log: 'Mo jumped to 2:14', run: (s) => (s.t = 134) },
  { at: 9.6, log: 'Gus lost connection', run: (s) => ((s.offline = 2), (s.laggedAt = s.t)) },
  { at: 11.8, log: 'Gus is back — resynced', run: (s) => (s.offline = null) },
  { at: 13.6, log: 'Ivy asked to rewind to 1:30', run: () => {} },
  { at: 15, log: 'Hana approved · jumped to 1:30', run: (s) => (s.t = 90) },
];
const LOOP = 18.5;

export function SyncVisual() {
  const reduce = useReducedMotion();
  const [sim, setSim] = useState<Sim>({ t: 12, playing: true, offline: null, laggedAt: 0 });
  const [log, setLog] = useState<{ id: number; text: string; stamp: number }[]>([]);
  const ref = useRef({ start: 0, beat: 0, sim: { t: 12, playing: true, offline: null as number | null, laggedAt: 0 }, last: 0, id: 0 });

  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    const r = ref.current;
    r.start = performance.now();
    r.last = r.start;
    const frame = (now: number) => {
      const elapsed = (now - r.start) / 1000;
      const dt = (now - r.last) / 1000;
      r.last = now;
      if (elapsed > LOOP) {
        r.start = now;
        r.beat = 0;
      }
      const e = (now - r.start) / 1000;
      while (r.beat < SCRIPT.length && SCRIPT[r.beat]!.at <= e) {
        const b = SCRIPT[r.beat]!;
        b.run(r.sim);
        const id = ++r.id;
        const stamp = r.sim.t;
        setLog((l) => [{ id, text: b.log, stamp }, ...l].slice(0, 3));
        r.beat++;
      }
      if (r.sim.playing) r.sim.t = Math.min(DURATION, r.sim.t + dt * SPEED);
      setSim({ ...r.sim });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reduce]);

  return (
    <div className="relative w-full max-w-[520px] select-none rounded-2xl bg-raised/80 p-5 ring-1 ring-line sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="relative flex size-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-signal opacity-60" />
            <span className="relative size-2 rounded-full bg-signal" />
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Room KX7M2Q · live</span>
        </div>
        <span className="font-mono text-[11px] text-faint tabular">{sim.playing ? 'playing' : 'paused'}</span>
      </div>

      <ul className="space-y-4">
        {PEOPLE.map((p, i) => {
          const lagging = sim.offline === i;
          const t = lagging ? sim.laggedAt : sim.t;
          return (
            <li key={p.name} className="grid grid-cols-[auto_1fr] items-center gap-3">
              <Avatar name={p.name} hue={p.hue} size={30} dim={lagging} />
              <div className="min-w-0">
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span className={lagging ? 'text-faint' : 'text-fg'}>
                    {p.name}
                    {p.role && (
                      <span className={`ml-2 font-mono text-[10px] uppercase tracking-wider ${p.role === 'host' ? 'text-signal' : 'text-mod'}`}>
                        {p.role}
                      </span>
                    )}
                    {lagging && <span className="ml-2 text-[11px] text-warn">reconnecting…</span>}
                  </span>
                  <span className="font-mono text-[11px] text-muted tabular">{formatTime(t)}</span>
                </div>
                <div className="relative h-1 rounded-full bg-line">
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full ${lagging ? 'bg-faint' : 'bg-fg/80'}`}
                    style={{ width: `${(t / DURATION) * 100}%` }}
                  />
                  <div
                    className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-raised ${lagging ? 'bg-faint' : 'bg-signal'}`}
                    style={{ left: `${(t / DURATION) * 100}%` }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 h-[66px] overflow-hidden border-t border-line pt-3">
        <AnimatePresence initial={false}>
          {(reduce ? [{ id: 0, text: 'Mo jumped to 2:14', stamp: 134 }] : log).map((l, i) => (
            <motion.p
              key={l.id}
              layout
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1 - i * 0.35, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="flex gap-3 font-mono text-[11.5px] leading-[20px] text-muted"
            >
              <span className="w-9 shrink-0 text-faint tabular">{formatTime(l.stamp)}</span>
              <span className="truncate">{l.text}</span>
            </motion.p>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
