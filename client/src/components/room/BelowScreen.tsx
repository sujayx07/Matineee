import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Link2, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { REACTION_EMOJIS, type ReactionEmoji } from '../../../../shared/protocol';
import { can } from '../../../../shared/roles';
import { parseYouTubeInput, thumbnailUrl } from '../../../../shared/youtube';
import { actions } from '../../lib/actions';
import { api } from '../../lib/api';
import { expectedPosition } from '../../lib/clock';
import { cn, formatTime } from '../../lib/format';
import { usePlaybackIntent } from '../../hooks/usePlaybackIntent';
import { useMyRole, useRoom } from '../../state/room';

/** Title row, reactions, and the "change video" field under the player. */
export function BelowScreen() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <NowPlaying />
        <ReactionBar />
      </div>
      <VideoSwitcher />
    </div>
  );
}

function NowPlaying() {
  const playback = useRoom((s) => s.playback);
  if (!playback?.videoId) {
    return <p className="pt-1 text-[14px] text-faint">No video loaded</p>;
  }
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={playback.videoId}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.25 }}
        className="min-w-0"
      >
        <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">Now playing</p>
        <h2 className="mt-1 line-clamp-2 text-[17px] font-medium leading-snug">{playback.title ?? 'Untitled video'}</h2>
        {playback.channel && <p className="mt-0.5 truncate text-[13px] text-muted">{playback.channel}</p>}
      </motion.div>
    </AnimatePresence>
  );
}

function ReactionBar() {
  const role = useMyRole();
  const last = useRef(0);
  const [burst, setBurst] = useState<{ e: string; k: number } | null>(null);
  if (!can(role, 'react')) return null;

  const send = (emoji: ReactionEmoji) => {
    const now = Date.now();
    if (now - last.current < 220) return; // client-side throttle; the server also rate-limits
    last.current = now;
    setBurst({ e: emoji, k: now });
    const p = useRoom.getState().playback;
    void actions.react(emoji, p ? expectedPosition(p) : undefined);
  };

  return (
    <div className="flex shrink-0 items-center gap-0.5 self-start rounded-full bg-raised p-1 ring-1 ring-line" role="group" aria-label="React">
      {REACTION_EMOJIS.map((e) => (
        <motion.button
          key={e}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.82 }}
          onClick={() => send(e)}
          aria-label={`React ${e}`}
          className="relative grid size-9 place-items-center rounded-full text-[18px] transition-colors hover:bg-overlay"
        >
          <span>{e}</span>
          <AnimatePresence>
            {burst?.e === e && (
              <motion.span
                key={burst.k}
                initial={{ scale: 0.6, opacity: 0.6 }}
                animate={{ scale: 1.8, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45 }}
                className="absolute inset-0 rounded-full ring-2 ring-signal/50"
              />
            )}
          </AnimatePresence>
        </motion.button>
      ))}
    </div>
  );
}

function VideoSwitcher() {
  const intent = usePlaybackIntent();
  const role = useMyRole();
  const directChange = can(role, 'change_video');
  const [value, setValue] = useState('');
  const [meta, setMeta] = useState<{ id: string; title: string | null; channel: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const parsed = parseYouTubeInput(value);
  const invalid = value.trim().length > 0 && !parsed;

  useEffect(() => {
    setMeta(null);
    if (!parsed) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api
        .videoMeta(parsed.videoId, ctrl.signal)
        .then((m) => setMeta({ id: parsed.videoId, ...m }))
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed?.videoId]);

  if (!intent.canInteract) {
    return (
      <p className="rounded-xl bg-raised px-4 py-3 text-[13px] text-muted ring-1 ring-line">
        You’re watching as a viewer. Chat and reactions are open to you; playback is up to the host.
      </p>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!parsed || busy) return;
    setBusy(true);
    const ok = await intent.changeVideo(parsed.videoId, parsed.start);
    setBusy(false);
    if (ok) setValue('');
  };

  return (
    <form onSubmit={submit} className="rounded-2xl bg-raised p-2 ring-1 ring-line">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={directChange ? 'Paste a YouTube link to play it for everyone' : 'Paste a YouTube link to suggest it'}
            aria-label="YouTube link"
            aria-invalid={invalid}
            className={cn(
              'h-10 w-full rounded-xl bg-bg pr-9 pl-9 text-[14px] ring-1 ring-inset outline-none transition-shadow',
              invalid ? 'ring-danger/60' : 'ring-line focus:ring-signal',
            )}
          />
          {value && (
            <button
              type="button"
              onClick={() => setValue('')}
              aria-label="Clear"
              className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-faint hover:text-fg"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={!parsed || busy}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-signal px-4 text-[13.5px] font-medium text-signal-ink transition-colors hover:bg-signal-hover disabled:bg-overlay disabled:text-faint"
        >
          {directChange ? 'Play now' : 'Suggest'}
          <ArrowRight className="size-4" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {(parsed || invalid) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {invalid ? (
              <p className="px-2 pt-2.5 pb-1 text-[13px] text-danger">That doesn’t look like a YouTube link.</p>
            ) : (
              parsed && (
                <div className="mt-2 flex items-center gap-3 rounded-xl bg-bg p-2">
                  <img src={thumbnailUrl(parsed.videoId)} alt="" className="h-12 w-[84px] shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0 text-[13px]">
                    <p className="truncate font-medium">
                      {meta?.id === parsed.videoId ? (meta.title ?? 'Untitled video') : <span className="text-faint">Fetching title…</span>}
                    </p>
                    <p className="truncate text-muted">
                      {meta?.channel}
                      {parsed.start ? ` · starts at ${formatTime(parsed.start)}` : ''}
                    </p>
                  </div>
                </div>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}
