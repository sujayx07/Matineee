import { AnimatePresence, motion } from 'motion/react';
import { FastForward, Film, Pause, Play } from 'lucide-react';
import type { ActionRequest } from '../../../../shared/protocol';
import { can } from '../../../../shared/roles';
import { thumbnailUrl } from '../../../../shared/youtube';
import { actions } from '../../lib/actions';
import { serverNow } from '../../lib/clock';
import { formatTime } from '../../lib/format';
import { useMyRole, useRoom } from '../../state/room';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';

const ICON = { play: Play, pause: Pause, seek: FastForward, change_video: Film };

function describe(r: ActionRequest) {
  switch (r.kind) {
    case 'play':
      return 'Resume playback';
    case 'pause':
      return 'Pause';
    case 'seek':
      return `Jump to ${formatTime(r.time ?? 0)}`;
    case 'change_video':
      return r.title ?? 'Play a different video';
  }
}

export function RequestsPanel() {
  const requests = useRoom((s) => s.requests);
  const youId = useRoom((s) => s.youId);
  const role = useMyRole();
  const staff = can(role, 'resolve_requests');

  if (requests.length === 0) {
    return (
      <div className="grid h-full place-items-center px-8 text-center">
        <div>
          <p className="font-serif text-[22px]">No open requests.</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            {staff
              ? 'When participants ask to pause, seek or change the video, it shows up here for you to approve.'
              : can(role, 'request')
                ? 'Press play, scrub, or paste a link — it’s sent here for the host or a moderator to approve.'
                : 'Participants’ requests to the host appear here.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="scrollbar-thin h-full space-y-2 overflow-y-auto p-3">
      <AnimatePresence initial={false}>
        {[...requests].reverse().map((r) => {
          const Icon = ICON[r.kind];
          const mine = r.from.id === youId;
          return (
            <motion.li
              key={r.id}
              layout
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
              transition={{ type: 'spring', stiffness: 480, damping: 36 }}
              className="overflow-hidden rounded-xl bg-bg ring-1 ring-line"
            >
              <div className="p-3">
                <div className="flex items-center gap-2 text-[12.5px] text-muted">
                  <Avatar name={r.from.name} hue={r.from.hue} size={20} />
                  <span className="truncate">{mine ? 'You asked' : `${r.from.name} asked`}</span>
                </div>
                <div className="mt-2.5 flex items-center gap-3">
                  {r.kind === 'change_video' && r.videoId ? (
                    <img src={thumbnailUrl(r.videoId)} alt="" className="h-11 w-[78px] shrink-0 rounded-md object-cover" />
                  ) : (
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-overlay text-signal">
                      <Icon className="size-4" />
                    </span>
                  )}
                  <p className="line-clamp-2 text-[14px] font-medium leading-snug">{describe(r)}</p>
                </div>
                {(staff || mine) && (
                  <div className="mt-3 flex gap-2">
                    {staff && !mine ? (
                      <>
                        <Button size="sm" variant="secondary" className="flex-1 justify-center" onClick={() => void actions.resolve(r.id, false)}>
                          Deny
                        </Button>
                        <Button size="sm" variant="primary" className="flex-1 justify-center" onClick={() => void actions.resolve(r.id, true)}>
                          Approve
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void actions.cancelRequest(r.id)}>
                        Withdraw
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <ExpiryBar createdAt={r.createdAt} expiresAt={r.expiresAt} />
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

/** Drains over the request's lifetime — a quiet countdown, no numbers. */
function ExpiryBar({ createdAt, expiresAt }: { createdAt: number; expiresAt: number }) {
  const total = expiresAt - createdAt;
  const remaining = Math.max(0, expiresAt - serverNow());
  return (
    <div className="h-[2px] bg-line">
      <motion.div
        className="h-full origin-left bg-signal/70"
        initial={{ scaleX: remaining / total }}
        animate={{ scaleX: 0 }}
        transition={{ duration: remaining / 1000, ease: 'linear' }}
      />
    </div>
  );
}
