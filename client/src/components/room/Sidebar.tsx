import { AnimatePresence, motion } from 'motion/react';
import { can } from '../../../../shared/roles';
import { cn } from '../../lib/format';
import { useMyRole, useRoom, type SidebarTab } from '../../state/room';
import { ChatPanel } from './ChatPanel';
import { PeoplePanel } from './PeoplePanel';
import { RequestsPanel } from './RequestsPanel';

export function Sidebar() {
  const tab = useRoom((s) => s.tab);
  const setTab = useRoom((s) => s.setTab);
  const unread = useRoom((s) => s.unread);
  const people = useRoom((s) => s.participants.length);
  const requests = useRoom((s) => s.requests.length);
  const staff = can(useMyRole(), 'resolve_requests');

  const tabs: { id: SidebarTab; label: string; count?: number; alert?: boolean }[] = [
    { id: 'chat', label: 'Chat', count: unread || undefined, alert: unread > 0 },
    { id: 'people', label: 'People', count: people },
    { id: 'requests', label: 'Requests', count: requests || undefined, alert: staff && requests > 0 },
  ];

  return (
    <aside className="flex h-full min-h-0 flex-col bg-raised">
      <div role="tablist" className="flex h-12 shrink-0 items-stretch gap-1 border-b border-line px-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'relative flex items-center gap-1.5 px-3 text-[13.5px] transition-colors',
              tab === t.id ? 'text-fg' : 'text-muted hover:text-fg',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  'grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 font-mono text-[10.5px] tabular',
                  t.alert ? 'bg-signal text-signal-ink' : 'bg-overlay text-muted',
                )}
              >
                {t.count}
              </span>
            )}
            {tab === t.id && (
              <motion.span
                layoutId="sidebar-tab"
                className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-signal"
                transition={{ type: 'spring', stiffness: 520, damping: 40 }}
              />
            )}
          </button>
        ))}
      </div>
      <div className="relative min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            role="tabpanel"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className="absolute inset-0"
          >
            {tab === 'chat' ? <ChatPanel /> : tab === 'people' ? <PeoplePanel /> : <RequestsPanel />}
          </motion.div>
        </AnimatePresence>
      </div>
    </aside>
  );
}
