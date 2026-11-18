import { ROLE_LABEL, type Role } from '../../../../shared/roles';
import { cn } from '../../lib/format';

const STYLE: Record<Role, string> = {
  host: 'text-signal bg-signal/10 ring-signal/25',
  moderator: 'text-mod bg-mod/10 ring-mod/25',
  participant: 'text-muted bg-overlay ring-line',
  viewer: 'text-faint bg-transparent ring-line',
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-md px-1.5 font-mono text-[10px] font-medium uppercase tracking-wider ring-1 ring-inset',
        STYLE[role],
        className,
      )}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}
