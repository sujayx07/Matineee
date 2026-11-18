import { Link } from 'react-router-dom';
import { cn } from '../../lib/format';

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn('group inline-flex items-center gap-2', className)} aria-label="Matinée home">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-overlay" />
        <rect x="7" y="9.5" width="2" height="13" rx="1" className="fill-fg" />
        <path d="M12 9.5v13l11-6.5z" className="fill-signal transition-transform duration-300 group-hover:translate-x-px" />
      </svg>
      <span className="font-serif text-[22px] italic leading-none tracking-tight">Matinée</span>
    </Link>
  );
}
