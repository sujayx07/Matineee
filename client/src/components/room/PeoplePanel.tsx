import { AnimatePresence, motion } from 'motion/react';
import { Check, Copy, Crown, MoreHorizontal, UserMinus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ParticipantDTO } from '../../../../shared/protocol';
import { ASSIGNABLE_ROLES, can, ROLE_DESCRIPTION, ROLE_LABEL, type AssignableRole } from '../../../../shared/roles';
import { actions } from '../../lib/actions';
import { cn, inviteUrl } from '../../lib/format';
import { toast } from '../../state/toasts';
import { useMyRole, useRoom } from '../../state/room';
import { Avatar } from '../ui/Avatar';
import { RoleBadge } from '../ui/RoleBadge';

export function PeoplePanel() {
  const participants = useRoom((s) => s.participants);
  const youId = useRoom((s) => s.youId);
  const myRole = useMyRole();
  const manage = can(myRole, 'assign_role');
  const online = participants.filter((p) => p.connected).length;

  return (
    <div className="flex h-full flex-col">
      <p className="px-4 pt-4 pb-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">
        {online} online{participants.length > online && ` · ${participants.length - online} reconnecting`}
      </p>
      <ul className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        <AnimatePresence initial={false}>
          {participants.map((p) => (
            <motion.li
              key={p.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -12, transition: { duration: 0.16 } }}
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            >
              <PersonRow p={p} isYou={p.id === youId} manage={manage && p.id !== youId} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {participants.length === 1 && <InviteNudge />}
      {!manage && (
        <p className="border-t border-line px-4 py-3 text-[12.5px] leading-relaxed text-faint">
          {ROLE_LABEL[myRole]} — {ROLE_DESCRIPTION[myRole].toLowerCase()}.
        </p>
      )}
    </div>
  );
}

function PersonRow({ p, isYou, manage }: { p: ParticipantDTO; isYou: boolean; manage: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="group relative flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-overlay/60">
      <div className="relative">
        <Avatar name={p.name} hue={p.hue} size={34} dim={!p.connected} />
        <span
          className={cn(
            'absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-raised',
            p.connected ? 'bg-ok' : 'animate-pulse bg-warn',
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn('flex items-center gap-1.5 truncate text-[14px]', !p.connected && 'text-muted')}>
          <span className="truncate">{p.name}</span>
          {isYou && <span className="text-[12px] text-faint">(you)</span>}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          <RoleBadge role={p.role} />
          {!p.connected && <span className="text-[11.5px] text-warn">reconnecting…</span>}
        </div>
      </div>
      {manage && (
        <>
          <button
            aria-label={`Manage ${p.name}`}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={cn(
              'grid size-8 place-items-center rounded-lg text-muted transition-[opacity,background-color] hover:bg-hover hover:text-fg focus-visible:opacity-100',
              open ? 'bg-hover text-fg opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100',
            )}
          >
            <MoreHorizontal className="size-4" />
          </button>
          <AnimatePresence>{open && <ManageMenu p={p} onClose={() => setOpen(false)} />}</AnimatePresence>
        </>
      )}
    </div>
  );
}

/** Host menu. Destructive actions take a second, deliberate click instead of a modal. */
function ManageMenu({ p, onClose }: { p: ParticipantDTO; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [confirm, setConfirm] = useState<'host' | 'remove' | null>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest('[aria-haspopup="menu"]')) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const setRole = async (role: AssignableRole) => {
    if (role !== p.role) await actions.assignRole(p.id, role);
    onClose();
  };

  return (
    <motion.div
      ref={ref}
      role="menu"
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1 } }}
      transition={{ type: 'spring', stiffness: 600, damping: 36 }}
      style={{ originX: 1, originY: 0 }}
      className="absolute top-12 right-2 z-40 w-64 rounded-xl bg-overlay p-1.5 shadow-[0_16px_48px_-12px_rgb(0_0_0/0.8)] ring-1 ring-line-strong"
    >
      <p className="px-2.5 pt-1.5 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">Role</p>
      {ASSIGNABLE_ROLES.map((r) => (
        <button
          key={r}
          role="menuitemradio"
          aria-checked={p.role === r}
          onClick={() => void setRole(r)}
          className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
        >
          <span className="mt-0.5 grid size-4 place-items-center">{p.role === r && <Check className="size-3.5 text-signal" />}</span>
          <span>
            <span className="block text-[13.5px]">{ROLE_LABEL[r]}</span>
            <span className="block text-[12px] text-muted">{ROLE_DESCRIPTION[r]}</span>
          </span>
        </button>
      ))}
      <div className="my-1.5 h-px bg-line" />
      <button
        role="menuitem"
        onClick={async () => {
          if (confirm !== 'host') return setConfirm('host');
          await actions.transferHost(p.id);
          onClose();
        }}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors focus-visible:outline-none',
          confirm === 'host' ? 'bg-signal/15 text-signal' : 'hover:bg-hover focus-visible:bg-hover',
        )}
      >
        <Crown className="size-4" />
        {confirm === 'host' ? `Hand host to ${p.name}? You’ll become a moderator.` : 'Make host'}
      </button>
      <button
        role="menuitem"
        onClick={async () => {
          if (confirm !== 'remove') return setConfirm('remove');
          await actions.remove(p.id);
          onClose();
        }}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] text-danger transition-colors focus-visible:outline-none',
          confirm === 'remove' ? 'bg-danger/15' : 'hover:bg-danger/10 focus-visible:bg-danger/10',
        )}
      >
        <UserMinus className="size-4" />
        {confirm === 'remove' ? `Click again to remove ${p.name}` : 'Remove from room'}
      </button>
    </motion.div>
  );
}

/** When you're the only one here, the obvious next step is inviting someone. */
function InviteNudge() {
  const code = useRoom((s) => s.code);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-3 mb-3 rounded-xl bg-bg p-4 ring-1 ring-line"
    >
      <p className="font-serif text-[20px] leading-tight">It’s just you so far.</p>
      <p className="mt-1 text-[13px] text-muted">
        Share the code <span className="font-mono text-fg">{code}</span> or send the link.
      </p>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(inviteUrl(code));
            toast('Invite link copied', { tone: 'success', duration: 2200 });
          } catch {
            window.prompt('Copy this invite link', inviteUrl(code));
          }
        }}
        className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-overlay px-3 text-[13px] ring-1 ring-line transition-colors hover:bg-hover"
      >
        <Copy className="size-3.5" /> Copy invite link
      </button>
    </motion.div>
  );
}
