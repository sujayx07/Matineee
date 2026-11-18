import { motion } from 'motion/react';
import { useState } from 'react';
import { normalizeRoomCode, ROOM_CODE_LENGTH } from '../../../../shared/protocol';
import { cn } from '../../lib/format';

/** Pull a code out of a pasted invite link, or clean up a typed one. */
export function extractCode(raw: string): string {
  const fromLink = raw.match(/\/r\/([A-Za-z0-9]{6})(?:[/?#]|$)/);
  return normalizeRoomCode(fromLink ? fromLink[1]! : raw).slice(0, ROOM_CODE_LENGTH);
}

/**
 * Six visible cells backed by one real input — so typing, paste, autofill,
 * screen readers and mobile keyboards all behave normally.
 */
export function CodeInput({
  value,
  onChange,
  invalid,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative">
      <input
        aria-label="Room code"
        value={value}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        inputMode="text"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(extractCode(e.target.value))}
        className="absolute inset-0 z-10 w-full cursor-text opacity-0"
        style={{ fontSize: 16 }}
      />
      <motion.div
        className="grid grid-cols-6 gap-2"
        animate={invalid ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
        transition={{ duration: 0.36 }}
      >
        {Array.from({ length: ROOM_CODE_LENGTH }, (_, i) => {
          const ch = value[i];
          const active = focused && (i === value.length || (i === ROOM_CODE_LENGTH - 1 && value.length === ROOM_CODE_LENGTH));
          return (
            <div
              key={i}
              className={cn(
                'relative grid h-14 place-items-center rounded-xl bg-bg font-mono text-[22px] font-medium ring-1 ring-inset transition-[box-shadow,color] duration-150',
                invalid ? 'ring-danger/60' : active ? 'ring-signal' : ch ? 'ring-line-strong' : 'ring-line',
              )}
            >
              {ch ? (
                <motion.span initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.16 }}>
                  {ch}
                </motion.span>
              ) : (
                active && <span className="h-6 w-px animate-pulse bg-signal" />
              )}
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}
