import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { NAME_MAX, ROOM_CODE_LENGTH, type RoomPreview } from '../../../shared/protocol';
import { thumbnailUrl } from '../../../shared/youtube';
import { CodeInput } from '../components/landing/CodeInput';
import { SyncVisual } from '../components/landing/SyncVisual';
import { Button } from '../components/ui/Button';
import { Logo } from '../components/ui/Logo';
import { api, ApiError } from '../lib/api';
import { cn } from '../lib/format';
import { session } from '../lib/session';

type Mode = 'create' | 'join';

const fade = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
};

export function Landing() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('create');
  const [name, setName] = useState(session.getName);
  const [roomName, setRoomName] = useState('');
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  const [lookup, setLookup] = useState<'idle' | 'loading' | 'missing'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live room lookup once a full code is entered.
  useEffect(() => {
    setPreview(null);
    setError(null);
    if (code.length !== ROOM_CODE_LENGTH) return setLookup('idle');
    const ctrl = new AbortController();
    setLookup('loading');
    api
      .getRoom(code, ctrl.signal)
      .then((p) => {
        setPreview(p);
        setLookup('idle');
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setLookup(e instanceof ApiError && e.status === 404 ? 'missing' : 'idle');
      });
    return () => ctrl.abort();
  }, [code]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && (mode === 'create' || (code.length === ROOM_CODE_LENGTH && lookup !== 'missing'));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || busy) return;
    session.setName(trimmed);
    if (mode === 'join') return navigate(`/r/${code}`);
    setBusy(true);
    setError(null);
    try {
      const room = await api.createRoom(roomName.trim());
      session.setHostKey(room.code, room.hostKey);
      navigate(`/r/${room.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the room.');
      setBusy(false);
    }
  };

  return (
    <div className="grain relative min-h-dvh overflow-hidden">
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-[1180px] flex-col px-5 sm:px-8">
        <header className="flex h-20 items-center justify-between">
          <Logo />
          <span className="hidden font-mono text-[11px] uppercase tracking-[0.14em] text-faint sm:block">
            Watch parties for YouTube
          </span>
        </header>

        <main className="grid flex-1 items-center gap-14 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-20 lg:py-0">
          <motion.div
            initial="initial"
            animate="animate"
            transition={{ staggerChildren: 0.08 }}
            className="max-w-[520px]"
          >
            <motion.h1
              variants={fade}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="font-serif text-[52px] leading-[0.95] tracking-[-0.02em] sm:text-[68px]"
            >
              Watch together,
              <br />
              <em className="text-signal">frame for frame.</em>
            </motion.h1>
            <motion.p
              variants={fade}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="mt-6 max-w-[42ch] text-[16px] leading-relaxed text-muted"
            >
              Open a room, share the code. Play, pause and scrubbing stay in lockstep for everyone — and the host
              decides who gets the remote.
            </motion.p>

            <motion.form
              variants={fade}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              onSubmit={submit}
              className="mt-10 rounded-2xl bg-raised p-2 ring-1 ring-line"
            >
              <div role="tablist" className="relative grid grid-cols-2 gap-1 rounded-xl bg-bg p-1">
                {(['create', 'join'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => setMode(m)}
                    className={cn(
                      'relative h-9 rounded-lg text-[13.5px] transition-colors',
                      mode === m ? 'text-fg' : 'text-muted hover:text-fg',
                    )}
                  >
                    {mode === m && (
                      <motion.span
                        layoutId="mode-pill"
                        className="absolute inset-0 rounded-lg bg-overlay ring-1 ring-line"
                        transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                      />
                    )}
                    <span className="relative">{m === 'create' ? 'Start a room' : 'Join with a code'}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-4 p-3 pt-5 sm:p-4 sm:pt-5">
                <Field label="Your name" htmlFor="name">
                  <input
                    id="name"
                    value={name}
                    maxLength={NAME_MAX}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="How others will see you"
                    autoComplete="nickname"
                    className="h-11 w-full rounded-xl bg-bg px-3.5 text-[15px] ring-1 ring-line ring-inset outline-none transition-shadow focus:ring-signal"
                  />
                </Field>

                <AnimatePresence mode="wait" initial={false}>
                  {mode === 'create' ? (
                    <motion.div
                      key="create"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      transition={{ duration: 0.18 }}
                    >
                      <Field label="Room name" hint="optional" htmlFor="room">
                        <input
                          id="room"
                          value={roomName}
                          maxLength={48}
                          onChange={(e) => setRoomName(e.target.value)}
                          placeholder="Friday film club"
                          className="h-11 w-full rounded-xl bg-bg px-3.5 text-[15px] ring-1 ring-line ring-inset outline-none transition-shadow focus:ring-signal"
                        />
                      </Field>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="join"
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.18 }}
                    >
                      <Field label="Room code" hint="or paste an invite link">
                        <CodeInput value={code} onChange={setCode} invalid={lookup === 'missing'} />
                      </Field>
                      <RoomPeek code={code} preview={preview} lookup={lookup} />
                    </motion.div>
                  )}
                </AnimatePresence>

                {error && <p className="text-[13px] text-danger">{error}</p>}

                <Button type="submit" variant="primary" size="lg" className="w-full justify-center" disabled={!canSubmit} loading={busy}>
                  {mode === 'create' ? 'Start the room' : preview ? `Join ${preview.name}` : 'Join room'}
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </motion.form>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="flex justify-center lg:justify-end"
          >
            <SyncVisual />
          </motion.div>
        </main>

        <footer className="grid gap-6 border-t border-line py-8 text-[13.5px] sm:grid-cols-3 sm:gap-10">
          {[
            ['01', 'One clock', 'The server owns the timeline. Clients correct drift quietly, every second.'],
            ['02', 'Roles that mean it', 'Hosts and moderators drive. Everyone else asks — and the host decides.'],
            ['03', 'React in the moment', 'Reactions land on the timeline, so you can see where the room lost it.'],
          ].map(([n, title, body]) => (
            <div key={n} className="flex gap-4">
              <span className="font-mono text-[11px] text-signal">{n}</span>
              <div>
                <p className="font-medium">{title}</p>
                <p className="mt-1 leading-relaxed text-muted">{body}</p>
              </div>
            </div>
          ))}
        </footer>
      </div>
    </div>
  );
}

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 flex items-baseline justify-between text-[12.5px] text-muted">
        <span>{label}</span>
        {hint && <span className="text-faint">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function RoomPeek({ code, preview, lookup }: { code: string; preview: RoomPreview | null; lookup: string }) {
  return (
    <div className="mt-3 min-h-[52px]">
      <AnimatePresence mode="wait" initial={false}>
        {lookup === 'loading' && (
          <motion.p key="l" {...peek} className="py-3 text-[13px] text-faint">
            Looking up {code}…
          </motion.p>
        )}
        {lookup === 'missing' && (
          <motion.p key="m" {...peek} className="py-3 text-[13px] text-danger">
            No room with that code. Double-check it with your host.
          </motion.p>
        )}
        {preview && (
          <motion.div key={preview.code} {...peek} className="flex items-center gap-3 rounded-xl bg-bg p-2 ring-1 ring-line">
            {preview.nowPlaying ? (
              <img src={thumbnailUrl(preview.nowPlaying.videoId)} alt="" className="h-10 w-[70px] rounded-md object-cover" />
            ) : (
              <div className="grid h-10 w-[70px] place-items-center rounded-md bg-overlay font-mono text-[10px] text-faint">IDLE</div>
            )}
            <div className="min-w-0 flex-1 text-[13px]">
              <p className="truncate font-medium">{preview.name}</p>
              <p className="flex items-center gap-1.5 truncate text-muted">
                <Users className="size-3" />
                {preview.participantCount} watching{preview.host && ` · ${preview.host} hosting`}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const peek = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.16 },
};
