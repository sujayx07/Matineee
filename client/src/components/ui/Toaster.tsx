import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '../../lib/format';
import { useToasts, type ToastTone } from '../../state/toasts';

const BAR: Record<ToastTone, string> = {
  neutral: 'bg-line-strong',
  success: 'bg-ok',
  error: 'bg-danger',
  signal: 'bg-signal',
};

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-5 sm:left-5 sm:items-start"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto relative flex w-full max-w-[360px] overflow-hidden rounded-xl bg-overlay/95 shadow-[0_12px_40px_-12px_rgb(0_0_0/0.7)] ring-1 ring-line backdrop-blur-md"
          >
            <span className={cn('w-[3px] shrink-0', BAR[t.tone])} />
            <div className="min-w-0 flex-1 py-3 pr-2 pl-3.5">
              <p className="text-[13.5px] font-medium leading-snug">{t.title}</p>
              {t.body && <p className="mt-0.5 text-[13px] leading-snug text-muted">{t.body}</p>}
              {t.actions && (
                <div className="mt-2.5 flex gap-2">
                  {t.actions.map((a) => (
                    <button
                      key={a.label}
                      onClick={() => {
                        a.onClick();
                        dismiss(t.id);
                      }}
                      className={cn(
                        'h-7 rounded-md px-2.5 text-[12.5px] font-medium transition-colors',
                        a.primary ? 'bg-signal text-signal-ink hover:bg-signal-hover' : 'bg-hover text-fg hover:bg-line-strong',
                      )}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="m-1.5 grid size-7 shrink-0 place-items-center rounded-md text-faint transition-colors hover:bg-hover hover:text-fg"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
