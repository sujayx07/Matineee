import type { ClientToServerEvents, ReactionEmoji, RequestKind } from '../../../shared/protocol';
import type { AssignableRole } from '../../../shared/roles';
import { toast } from '../state/toasts';
import { formatTime } from './format';
import { socket } from './socket';

type Result = { ok: true; data?: unknown } | { ok: false; code: string; message: string };

/** Emit with an ack, a timeout, and a toast on failure. Resolves to success. */
async function send<E extends keyof ClientToServerEvents>(event: E, payload: unknown, quiet = false): Promise<boolean> {
  let res: Result;
  try {
    const emitter = socket.timeout(6000) as unknown as {
      emitWithAck: (e: string, p: unknown) => Promise<Result>;
    };
    res = await emitter.emitWithAck(event, payload);
  } catch {
    res = { ok: false, code: 'NETWORK', message: 'The server didn’t respond. Check your connection.' };
  }
  if (!res.ok && !quiet) toast(res.message, { tone: 'error' });
  return res.ok;
}

export const actions = {
  play: (time?: number) => send('play', { time }),
  pause: (time?: number) => send('pause', { time }),
  seek: (time: number) => send('seek', { time }),
  changeVideo: (videoId: string, start?: number) => send('change_video', { videoId, start }),

  assignRole: (userId: string, role: AssignableRole) => send('assign_role', { userId, role }),
  transferHost: (userId: string) => send('transfer_host', { userId }),
  remove: (userId: string) => send('remove_participant', { userId }),

  chat: (text: string) => send('chat_send', { text }),
  react: (emoji: ReactionEmoji, videoTime?: number) => send('reaction', { emoji, videoTime }, true),

  async request(kind: RequestKind, extra: { time?: number; videoId?: string; start?: number } = {}) {
    const ok = await send('request_action', { kind, ...extra });
    if (ok) {
      const what =
        kind === 'seek'
          ? `jump to ${formatTime(extra.time ?? 0)}`
          : kind === 'change_video'
            ? 'play your video'
            : kind;
      toast('Request sent', { body: `Waiting for the host or a moderator to ${what}.` });
    }
    return ok;
  },
  resolve: (requestId: string, approve: boolean) => send('resolve_request', { requestId, approve }),
  cancelRequest: (requestId: string) => send('cancel_request', { requestId }),
};
