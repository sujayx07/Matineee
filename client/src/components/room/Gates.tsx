import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { NAME_MAX, type RoomPreview } from '../../../../shared/protocol';
import { api, ApiError } from '../../lib/api';
import type { RoomStatus } from '../../state/room';
import { Button } from '../ui/Button';
import { Logo } from '../ui/Logo';

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="grain relative grid min-h-dvh place-items-center px-5">
      <Logo className="absolute top-6 left-5 sm:left-8" />
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-[400px]"
      >
        {children}
      </motion.div>
    </div>
  );
}

/** Shown when someone opens an invite link without a name yet. */
export function NamePrompt({ code, onSubmit }: { code: string; onSubmit: (name: string) => void }) {
  const [name, setName] = useState('');
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api
      .getRoom(code)
      .then(setPreview)
      .catch((e) => e instanceof ApiError && e.status === 404 && setMissing(true));
  }, [code]);

  if (missing) return <StatusScreen status="not_found" code={code} />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) onSubmit(name.trim());
  };

  return (
    <Shell>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">You’re invited · {code}</p>
      <h1 className="mt-3 font-serif text-[40px] leading-[1.02]">{preview ? preview.name : 'Join the room'}</h1>
      <p className="mt-2 text-[14px] text-muted">
        {preview
          ? `${preview.participantCount} watching${preview.host ? ` · hosted by ${preview.host}` : ''}${preview.nowPlaying?.title ? ` · now playing “${preview.nowPlaying.title}”` : ''}`
          : 'Pick a name so others know who’s here.'}
      </p>
      <form onSubmit={submit} className="mt-8 space-y-3">
        <input
          autoFocus
          value={name}
          maxLength={NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          aria-label="Your name"
          autoComplete="nickname"
          className="h-12 w-full rounded-xl bg-raised px-4 text-[15px] ring-1 ring-line ring-inset outline-none transition-shadow focus:ring-signal"
        />
        <Button type="submit" variant="primary" size="lg" className="w-full justify-center" disabled={!name.trim()}>
          Join room <ArrowRight className="size-4" />
        </Button>
      </form>
    </Shell>
  );
}

const COPY: Partial<Record<RoomStatus, { title: string; body: string }>> = {
  not_found: { title: 'This room doesn’t exist.', body: 'The code may be mistyped, or the room closed after sitting empty for a while.' },
  removed: { title: 'You were removed.', body: 'The host removed you from this room.' },
  replaced: { title: 'Opened somewhere else.', body: 'This seat is now active in another tab or window.' },
  full: { title: 'This room is full.', body: 'Try again when someone leaves.' },
  error: { title: 'Something went wrong.', body: 'We couldn’t join the room.' },
};

export function StatusScreen({ status, code, message, onRetry }: { status: RoomStatus; code: string; message?: string; onRetry?: () => void }) {
  const c = COPY[status] ?? COPY.error!;
  return (
    <Shell>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">Room {code}</p>
      <h1 className="mt-3 font-serif text-[40px] leading-[1.02]">{c.title}</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-muted">{message && status === 'error' ? message : c.body}</p>
      <div className="mt-8 flex gap-2">
        <Link to="/" className="inline-flex h-11 items-center rounded-xl bg-signal px-4 text-[14px] font-medium text-signal-ink hover:bg-signal-hover">
          Start a new room
        </Link>
        {onRetry && (
          <Button variant="secondary" size="lg" className="h-11" onClick={onRetry}>
            {status === 'replaced' ? 'Use it here' : 'Try again'}
          </Button>
        )}
      </div>
    </Shell>
  );
}

export function Connecting({ code }: { code: string }) {
  return (
    <Shell>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint">Room {code}</p>
      <h1 className="mt-3 font-serif text-[40px] leading-[1.02]">Finding your seat…</h1>
      <div className="mt-8 h-[2px] w-full overflow-hidden rounded-full bg-line">
        <motion.div
          className="h-full w-1/4 rounded-full bg-signal"
          animate={{ x: ['-100%', '400%'] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </Shell>
  );
}
