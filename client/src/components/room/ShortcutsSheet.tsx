import { AnimatePresence, motion } from 'motion/react';
import { Keyboard, X } from 'lucide-react';
import { useEffect, useState } from 'react';

const SHORTCUTS: [string[], string][] = [
  [['Space', 'K'], 'Play / pause'],
  [['←', '→'], 'Back / forward 5s'],
  [['J', 'L'], 'Back / forward 10s'],
  [['M'], 'Mute'],
  [['F'], 'Full screen'],
  [['?'], 'Show this list'],
];

/** "?" opens a compact reference. Participants' playback keys become requests. */
export function ShortcutsButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, [contenteditable="true"]')) return;
      if (e.key === '?') setOpen((o) => !o);
      else if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Keyboard shortcuts (?)"
        title="Keyboard shortcuts (?)"
        className="hidden size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-overlay hover:text-fg sm:grid"
      >
        <Keyboard className="size-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Keyboard shortcuts"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 520, damping: 38 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[340px] rounded-2xl bg-overlay p-5 shadow-[0_24px_64px_-16px_rgb(0_0_0/0.8)] ring-1 ring-line-strong"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-serif text-[26px] leading-none">Shortcuts</h2>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="grid size-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-fg"
                >
                  <X className="size-4" />
                </button>
              </div>
              <ul className="space-y-2.5">
                {SHORTCUTS.map(([keys, label]) => (
                  <li key={label + keys.join()} className="flex items-center justify-between text-[13.5px]">
                    <span className="text-muted">{label}</span>
                    <span className="flex gap-1">
                      {keys.map((k) => (
                        <kbd
                          key={k}
                          className="grid h-6 min-w-6 place-items-center rounded-md bg-bg px-1.5 font-mono text-[11px] text-fg ring-1 ring-line-strong"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-line pt-3 text-[12px] leading-relaxed text-faint">
                As a participant, playback keys send a request to the host instead.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
