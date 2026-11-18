import { AnimatePresence, motion } from 'motion/react';
import { Check, Copy, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn, inviteUrl } from '../../lib/format';
import { useRoom } from '../../state/room';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Logo } from '../ui/Logo';
import { ShortcutsButton } from './ShortcutsSheet';

export function RoomHeader({ onLeave }: { onLeave: () => void }) {
  const name = useRoom((s) => s.name);
  const code = useRoom((s) => s.code);
  const status = useRoom((s) => s.status);
  const participants = useRoom((s) => s.participants);
  const setTab = useRoom((s) => s.setTab);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl(code));
    } catch {
      window.prompt('Copy this invite link', inviteUrl(code));
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const live = participants.filter((p) => p.connected);

  useEffect(() => {
    const prev = document.title;
    if (name) document.title = `${name} · Matinée`;
    return () => {
      document.title = prev;
    };
  }, [name]);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-3 sm:gap-4 sm:px-5">
      <Logo className="[&>span]:hidden sm:[&>span]:inline" />
      <span className="hidden h-5 w-px bg-line sm:block" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[14.5px] font-medium">{name || 'Room'}</h1>
      </div>

      <AnimatePresence>
        {status === 'reconnecting' && (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center gap-2 rounded-full bg-warn/10 px-2.5 py-1 text-[12px] text-warn ring-1 ring-warn/25"
          >
            <span className="size-1.5 animate-pulse rounded-full bg-warn" />
            Reconnecting
          </motion.span>
        )}
      </AnimatePresence>

      <button
        onClick={() => setTab('people')}
        className="hidden items-center md:flex"
        aria-label={`${live.length} people watching`}
        title={live.map((p) => p.name).join(', ')}
      >
        <div className="flex -space-x-2">
          {live.slice(0, 4).map((p) => (
            <Avatar key={p.id} name={p.name} hue={p.hue} size={26} className="ring-2 ring-bg" />
          ))}
        </div>
        {live.length > 4 && <span className="ml-2 font-mono text-[11px] text-muted">+{live.length - 4}</span>}
      </button>

      <button
        onClick={copy}
        className="group flex h-9 items-center gap-2 rounded-xl bg-raised pr-2.5 pl-3 ring-1 ring-line transition-colors hover:bg-overlay"
        aria-label="Copy invite link"
      >
        <span className="font-mono text-[13px] tracking-[0.16em]">{code}</span>
        <span className="relative grid size-4 place-items-center text-muted group-hover:text-fg">
          <AnimatePresence mode="popLayout" initial={false}>
            {copied ? (
              <motion.span key="c" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}>
                <Check className="size-3.5 text-ok" />
              </motion.span>
            ) : (
              <motion.span key="i" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}>
                <Copy className="size-3.5" />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        <span className={cn('hidden text-[12.5px] text-muted lg:inline', copied && 'text-ok')}>{copied ? 'Link copied' : 'Invite'}</span>
      </button>

      <ShortcutsButton />

      <Button variant="ghost" size="sm" onClick={onLeave} aria-label="Leave room">
        <LogOut className="size-4" />
        <span className="hidden sm:inline">Leave</span>
      </Button>
    </header>
  );
}
