import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  FastForward,
  Hand,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Rewind,
  Tv,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { actions } from '../../lib/actions';
import { clockStats, expectedPosition } from '../../lib/clock';
import { cn, formatTime } from '../../lib/format';
import { usePlaybackIntent } from '../../hooks/usePlaybackIntent';
import { useSyncedPlayer, type SyncedPlayer } from '../../hooks/useSyncedPlayer';
import { useRoom } from '../../state/room';
import { nameColor } from '../ui/Avatar';
import { Timeline } from './Timeline';

export const SAMPLE_VIDEOS = [
  { id: 'aqz-KE-bpKQ', title: 'Big Buck Bunny', note: 'Blender open movie · 10 min' },
  { id: 'eRsGyueVLvQ', title: 'Sintel', note: 'Blender open movie · 15 min' },
  { id: 'R6MlUcmOul8', title: 'Tears of Steel', note: 'Blender open movie · 12 min' },
];

/** The video, its overlays, and the transport bar below it. */
export function Screen() {
  const mountRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const intent = usePlaybackIntent();
  const playback = useRoom((s) => s.playback);

  const player = useSyncedPlayer(mountRef, {
    // When the video ends, staff close the loop so the room clock stops too.
    onEnded: (d) => intent.direct && void actions.pause(d),
  });

  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const on = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frameRef.current?.requestFullscreen?.();
  };

  const togglePlay = () => {
    if (!playback?.videoId) return;
    const t = player.getTime();
    if (playback.playing) void intent.pause(t);
    else void intent.play(t);
  };
  const nudge = (delta: number) => {
    if (!playback?.videoId) return;
    const d = player.getDuration();
    const t = Math.max(0, Math.min(d || Infinity, player.getTime() + delta));
    void intent.seek(t);
  };

  useShortcuts({ togglePlay, nudge, toggleFullscreen });

  const hasVideo = !!playback?.videoId;

  return (
    <div className="space-y-3">
      <div
        ref={frameRef}
        className={cn(
          'group/frame relative aspect-video w-full overflow-hidden bg-black',
          fullscreen ? 'rounded-none' : 'rounded-2xl ring-1 ring-line',
        )}
      >
        <div ref={mountRef} className={cn('absolute inset-0 [&>iframe]:size-full', !hasVideo && 'invisible')} />

        {/* Click shield: the iframe never receives input, so playback only changes through the room. */}
        {hasVideo && (
          <button
            aria-label={playback.playing ? 'Pause' : 'Play'}
            onClick={togglePlay}
            onDoubleClick={toggleFullscreen}
            className="absolute inset-0 cursor-default focus-visible:outline-none"
          />
        )}

        <ActionFlash />
        <FloatingReactions />

        <AnimatePresence>
          {!hasVideo && <EmptyStage key="empty" direct={intent.direct} canAsk={intent.canAsk} />}
          {hasVideo && player.phase === 'loading' && !player.error && <Loading key="loading" />}
          {player.error && (
            <Overlay key="error">
              <AlertTriangle className="size-6 text-warn" />
              <p className="mt-3 max-w-[36ch] text-center text-[14px] text-fg">{player.error}</p>
              {intent.direct && <p className="mt-1 text-[13px] text-muted">Try another link below.</p>}
            </Overlay>
          )}
          {player.needsGesture && !player.error && (
            <Overlay key="gesture" onClick={player.resume} interactive>
              <span className="grid size-16 place-items-center rounded-full bg-signal text-signal-ink transition-transform duration-200 group-hover/overlay:scale-105">
                <Play className="size-6 translate-x-0.5 fill-current" />
              </span>
              <p className="mt-4 text-[14px] font-medium">Join the playback</p>
              <p className="mt-1 text-[13px] text-muted">Your browser needs one click before it can play sound.</p>
            </Overlay>
          )}
        </AnimatePresence>
      </div>

      <TransportBar player={player} onToggle={togglePlay} onNudge={nudge} fullscreen={fullscreen} onFullscreen={toggleFullscreen} />
    </div>
  );
}

// ───────────────────────────────── transport ─────────────────────────────────

function TransportBar({
  player,
  onToggle,
  onNudge,
  fullscreen,
  onFullscreen,
}: {
  player: SyncedPlayer;
  onToggle: () => void;
  onNudge: (d: number) => void;
  fullscreen: boolean;
  onFullscreen: () => void;
}) {
  const intent = usePlaybackIntent();
  const playback = useRoom((s) => s.playback);
  const moments = useRoom((s) => s.moments);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const playerRef = useRef(player);
  playerRef.current = player;
  useEffect(() => {
    const id = setInterval(() => {
      const pl = playerRef.current;
      const p = useRoom.getState().playback;
      // Before the iframe reports a time, fall back to the room clock.
      const t = pl.ready && pl.phase !== 'loading' ? pl.getTime() : p ? expectedPosition(p) : 0;
      setTime(t);
      setDuration(pl.getDuration());
    }, 250);
    return () => clearInterval(id);
  }, []);

  const hasVideo = !!playback?.videoId;
  const disabled = !hasVideo || !intent.canInteract;
  const playing = !!playback?.playing;
  const askVerb = intent.direct ? '' : 'Ask to ';

  return (
    <div className="flex items-center gap-2 rounded-2xl bg-raised px-2 py-2 ring-1 ring-line sm:gap-3 sm:px-3">
      <div className="flex items-center">
        <CtrlButton label={`${askVerb}rewind 10s`} onClick={() => onNudge(-10)} disabled={disabled} className="hidden sm:grid">
          <Rewind className="size-4" />
        </CtrlButton>
        <button
          onClick={onToggle}
          disabled={disabled}
          aria-label={`${askVerb}${playing ? 'pause' : 'play'}`}
          title={`${askVerb}${playing ? 'pause' : 'play'} (Space)`}
          className={cn(
            'relative mx-1 grid size-10 place-items-center rounded-full transition-[background-color,transform] duration-150 active:scale-95',
            disabled ? 'bg-overlay text-faint' : intent.direct ? 'bg-fg text-bg hover:bg-white' : 'bg-overlay text-fg ring-1 ring-line-strong hover:bg-hover',
          )}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={playing ? 'pause' : 'play'}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ duration: 0.14 }}
            >
              {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 translate-x-px fill-current" />}
            </motion.span>
          </AnimatePresence>
          {!intent.direct && intent.canAsk && hasVideo && (
            <Hand className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full bg-raised p-0.5 text-signal" />
          )}
        </button>
        <CtrlButton label={`${askVerb}skip 10s`} onClick={() => onNudge(10)} disabled={disabled} className="hidden sm:grid">
          <FastForward className="size-4" />
        </CtrlButton>
      </div>

      <span className="hidden shrink-0 font-mono text-[12px] text-muted tabular sm:block">
        {formatTime(time)} <span className="text-faint">/ {duration ? formatTime(duration) : '–:––'}</span>
      </span>

      <Timeline
        current={time}
        duration={duration}
        moments={moments}
        disabled={disabled}
        onSeek={(t) => void intent.seek(t)}
        commitLabel={intent.direct ? undefined : 'release to ask'}
      />

      <SyncPill drift={player.drift} active={hasVideo && playing && player.phase === 'playing'} />
      <VolumeControl player={player} />
      <CtrlButton label={fullscreen ? 'Exit full screen (F)' : 'Full screen (F)'} onClick={onFullscreen} disabled={!hasVideo}>
        {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      </CtrlButton>
    </div>
  );
}

function CtrlButton({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-overlay hover:text-fg disabled:text-faint disabled:hover:bg-transparent',
        className,
      )}
    >
      {children}
    </button>
  );
}

function SyncPill({ drift, active }: { drift: number; active: boolean }) {
  const off = Math.abs(drift);
  const state = !active ? 'idle' : off < 0.35 ? 'tight' : off < 0.75 ? 'close' : 'catching';
  const { rtt } = clockStats();
  const label = { idle: 'Synced', tight: 'In sync', close: `${drift > 0 ? '+' : '−'}${off.toFixed(1)}s`, catching: 'Catching up' }[state];
  return (
    <span
      title={`Clock offset estimated with ${Math.round(rtt)} ms round trip`}
      className="hidden h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 font-mono text-[11px] text-muted ring-1 ring-line md:inline-flex"
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          state === 'tight' || state === 'idle' ? 'bg-ok' : state === 'close' ? 'bg-warn' : 'animate-pulse bg-warn',
          state === 'idle' && 'opacity-50',
        )}
      />
      <span className="tabular">{label}</span>
    </span>
  );
}

function VolumeControl({ player }: { player: SyncedPlayer }) {
  const [volume, setVolume] = useState(() => Number(localStorage.getItem('matinee:volume') ?? 80));
  const [muted, setMuted] = useState(() => localStorage.getItem('matinee:muted') === '1');

  useEffect(() => {
    const onKey = (e: Event) => {
      const next = !(e as CustomEvent<boolean>).detail;
      setMuted(next);
      player.setMuted(next);
    };
    window.addEventListener('matinee:toggle-mute', onKey);
    return () => window.removeEventListener('matinee:toggle-mute', onKey);
  });

  const Icon = muted || volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  return (
    <div className="group/vol hidden items-center sm:flex">
      <CtrlButton
        label={muted ? 'Unmute (M)' : 'Mute (M)'}
        onClick={() => {
          setMuted(!muted);
          player.setMuted(!muted);
        }}
      >
        <Icon className="size-4" />
      </CtrlButton>
      <input
        type="range"
        min={0}
        max={100}
        value={muted ? 0 : volume}
        aria-label="Volume"
        onChange={(e) => {
          const v = Number(e.target.value);
          setVolume(v);
          player.setVolume(v);
          if (muted && v > 0) {
            setMuted(false);
            player.setMuted(false);
          }
        }}
        className="h-1 w-0 cursor-pointer appearance-none rounded-full bg-line accent-fg opacity-0 transition-all duration-200 group-hover/vol:w-20 group-hover/vol:opacity-100 focus-visible:w-20 focus-visible:opacity-100 [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-fg"
      />
    </div>
  );
}

// ───────────────────────────────── overlays ──────────────────────────────────

function Overlay({ children, onClick, interactive }: { children: ReactNode; onClick?: () => void; interactive?: boolean }) {
  const Tag = interactive ? motion.button : motion.div;
  return (
    <Tag
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className="group/overlay absolute inset-0 z-20 flex flex-col items-center justify-center bg-bg/80 p-6 backdrop-blur-sm"
    >
      {children}
    </Tag>
  );
}

function Loading() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-black"
    >
      <div className="h-[2px] w-28 overflow-hidden rounded-full bg-line">
        <motion.div
          className="h-full w-1/3 rounded-full bg-signal"
          animate={{ x: ['-100%', '300%'] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </motion.div>
  );
}

function EmptyStage({ direct, canAsk }: { direct: boolean; canAsk: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
      className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-raised p-6 text-center"
    >
      {/* projector cone */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: 'radial-gradient(60% 55% at 50% 0%, rgb(255 91 46 / 0.10), transparent 70%)' }}
      />
      <Tv className="relative size-6 text-faint" />
      <h2 className="relative mt-4 font-serif text-[30px] leading-tight sm:text-[38px]">Nothing’s playing yet.</h2>
      <p className="relative mt-2 max-w-[44ch] text-[14px] text-muted">
        {direct
          ? 'Paste a YouTube link below, or start with one of these.'
          : canAsk
            ? 'Suggest something below — the host or a moderator will see it.'
            : 'The host will put something on soon.'}
      </p>
      {direct && (
        <div className="relative mt-6 flex flex-wrap justify-center gap-2">
          {SAMPLE_VIDEOS.map((v, i) => (
            <motion.button
              key={v.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06 }}
              onClick={() => void actions.changeVideo(v.id)}
              className="rounded-full bg-overlay px-3.5 py-1.5 text-[13px] ring-1 ring-line transition-colors hover:bg-hover hover:ring-line-strong"
            >
              {v.title}
            </motion.button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

const VERB: Record<string, string> = {
  play: 'pressed play',
  pause: 'paused',
  seek: 'jumped to',
  change_video: 'changed the video',
};

/** Brief caption whenever someone changes playback — who did what. */
function ActionFlash() {
  const last = useRoom((s) => s.lastAction);
  const youId = useRoom((s) => s.youId);
  const position = useRoom((s) => s.playback?.position ?? 0);
  const [visible, setVisible] = useState<typeof last>(null);

  useEffect(() => {
    if (!last || Date.now() - last.at > 2000) return;
    setVisible(last);
    const id = setTimeout(() => setVisible(null), 1800);
    return () => clearTimeout(id);
  }, [last]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center">
      <AnimatePresence>
        {visible && (
          <motion.div
            key={visible.seq}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 500, damping: 34 }}
            className="flex items-center gap-2 rounded-full bg-bg/85 px-3.5 py-1.5 text-[13px] ring-1 ring-white/10 backdrop-blur-md"
          >
            <span className="font-medium">{visible.by?.id === youId ? 'You' : (visible.by?.name ?? 'Room')}</span>
            <span className="text-muted">{VERB[visible.action]}</span>
            {visible.action === 'seek' && <span className="font-mono text-[12px] text-signal tabular">{formatTime(position)}</span>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FloatingReactions() {
  const floating = useRoom((s) => s.floating);
  const drop = useRoom((s) => s.dropFloating);
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <AnimatePresence>
        {floating.map((f) => (
          <motion.div
            key={f.key}
            initial={{ opacity: 0, y: 0, scale: 0.5 }}
            animate={{
              opacity: [0, 1, 1, 0],
              y: -220 - f.x * 60,
              x: (f.x - 0.5) * 50,
              scale: [0.5, 1.15, 1, 0.95],
              rotate: (f.x - 0.5) * 24,
            }}
            transition={{ duration: 2.6, ease: [0.22, 1, 0.36, 1], times: [0, 0.15, 0.7, 1] }}
            onAnimationComplete={() => drop(f.key)}
            className="absolute bottom-6 flex flex-col items-center"
            style={{ left: `${68 + f.x * 26}%` }}
          >
            <span className="text-[34px] leading-none drop-shadow-[0_4px_12px_rgb(0_0_0/0.5)]">{f.emoji}</span>
            <span
              className="mt-1 rounded-full bg-black/60 px-1.5 py-px text-[10.5px] font-medium backdrop-blur"
              style={{ color: nameColor(f.hue) }}
            >
              {f.name}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ───────────────────────────────── shortcuts ─────────────────────────────────

function useShortcuts(h: { togglePlay: () => void; nudge: (d: number) => void; toggleFullscreen: () => void }) {
  const ref = useRef(h);
  ref.current = h;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (el.closest('input, textarea, select, [contenteditable="true"], [role="menu"]')) return;
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'k') {
        if (el.tagName === 'BUTTON' && k === ' ') return; // let buttons click
        e.preventDefault();
        ref.current.togglePlay();
      } else if (k === 'arrowleft') ref.current.nudge(-5);
      else if (k === 'arrowright') ref.current.nudge(5);
      else if (k === 'j') ref.current.nudge(-10);
      else if (k === 'l') ref.current.nudge(10);
      else if (k === 'f') ref.current.toggleFullscreen();
      else if (k === 'm') window.dispatchEvent(new CustomEvent('matinee:toggle-mute', { detail: localStorage.getItem('matinee:muted') === '1' }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
