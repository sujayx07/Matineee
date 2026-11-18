import { AnimatePresence, motion } from 'motion/react';
import { ArrowDown, SendHorizontal } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { CHAT_MAX, type ChatMessage } from '../../../../shared/protocol';
import { actions } from '../../lib/actions';
import { clockTime, cn } from '../../lib/format';
import { useRoom } from '../../state/room';
import { Avatar, nameColor } from '../ui/Avatar';
import { RoleBadge } from '../ui/RoleBadge';

const GROUP_WINDOW = 3 * 60_000;

export function ChatPanel() {
  const chat = useRoom((s) => s.chat);
  const youId = useRoom((s) => s.youId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [missed, setMissed] = useState(0);
  const lastLen = useRef(chat.length);

  // Stick to the bottom unless the reader has scrolled up.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const added = chat.length - lastLen.current;
    lastLen.current = chat.length;
    const mine = chat[chat.length - 1]?.author?.id === youId;
    if (pinned || mine) {
      el.scrollTop = el.scrollHeight;
      setMissed(0);
    } else if (added > 0) {
      setMissed((m) => m + added);
    }
  }, [chat, pinned, youId]);

  const onScroll = () => {
    const el = scrollRef.current!;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setPinned(atBottom);
    if (atBottom) setMissed(0);
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div ref={scrollRef} onScroll={onScroll} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-2">
        {chat.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <p className="font-serif text-[22px]">Say hello.</p>
              <p className="mt-1 text-[13px] text-muted">Messages are shared with everyone in the room.</p>
            </div>
          </div>
        ) : (
          <ol className="space-y-0.5">
            {chat.map((m, i) => (
              <Message key={m.id} m={m} prev={chat[i - 1]} isYou={m.author?.id === youId} />
            ))}
          </ol>
        )}
      </div>

      <AnimatePresence>
        {missed > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            onClick={() => {
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
            }}
            className="absolute bottom-[76px] left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-fg px-3 py-1.5 text-[12.5px] font-medium text-bg shadow-lg"
          >
            <ArrowDown className="size-3.5" />
            {missed} new
          </motion.button>
        )}
      </AnimatePresence>

      <Composer />
    </div>
  );
}

function Message({ m, prev, isYou }: { m: ChatMessage; prev?: ChatMessage; isYou: boolean }) {
  if (m.kind === 'system') {
    return (
      <motion.li initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-1.5 text-center text-[12px] text-faint">
        {m.text}
      </motion.li>
    );
  }
  const grouped = prev?.kind === 'user' && prev.author?.id === m.author?.id && m.at - prev.at < GROUP_WINDOW;
  const a = m.author!;
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={cn('group flex gap-2.5 rounded-lg px-1.5 hover:bg-overlay/40', grouped ? 'py-0.5' : 'mt-2.5 pt-1 pb-0.5')}
    >
      <div className="w-7 shrink-0">{!grouped && <Avatar name={a.name} hue={a.hue} size={28} />}</div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[13px] font-medium" style={{ color: nameColor(a.hue) }}>
              {isYou ? 'You' : a.name}
            </span>
            {(a.role === 'host' || a.role === 'moderator') && <RoleBadge role={a.role} className="h-4 px-1 text-[9px]" />}
            <time className="ml-auto shrink-0 text-[11px] text-faint">{clockTime(m.at)}</time>
          </div>
        )}
        <p className="whitespace-pre-wrap break-words text-[14px] leading-[1.45] text-fg/90">{m.text}</p>
      </div>
    </motion.li>
  );
}

function Composer() {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    const ok = await actions.chat(t);
    setSending(false);
    if (ok) setText('');
    ref.current?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  const left = CHAT_MAX - text.length;
  return (
    <form onSubmit={send} className="border-t border-line p-3">
      <div className="flex items-end gap-2 rounded-xl bg-bg p-1.5 ring-1 ring-line ring-inset transition-shadow focus-within:ring-line-strong">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          maxLength={CHAT_MAX}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="Message the room"
          aria-label="Message"
          className="scrollbar-thin max-h-[120px] min-h-8 flex-1 resize-none bg-transparent px-2 py-1.5 text-[14px] leading-snug outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          aria-label="Send"
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-signal text-signal-ink transition-[background-color,transform] hover:bg-signal-hover active:scale-95 disabled:bg-transparent disabled:text-faint"
        >
          <SendHorizontal className="size-4" />
        </button>
      </div>
      {left < 80 && <p className={cn('mt-1.5 text-right text-[11px] tabular', left < 20 ? 'text-warn' : 'text-faint')}>{left}</p>}
    </form>
  );
}
