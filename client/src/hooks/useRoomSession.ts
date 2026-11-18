import { useEffect } from 'react';
import type { ActionRequest, RoomSnapshot } from '../../../shared/protocol';
import { can, ROLE_LABEL } from '../../../shared/roles';
import { actions } from '../lib/actions';
import { syncClock } from '../lib/clock';
import { formatTime } from '../lib/format';
import { session } from '../lib/session';
import { socket } from '../lib/socket';
import { useRoom } from '../state/room';
import { toast, useToasts } from '../state/toasts';

type JoinResult = { ok: true; data: RoomSnapshot } | { ok: false; code: string; message: string };

function describeRequest(r: ActionRequest): string {
  switch (r.kind) {
    case 'play':
      return 'wants to resume playback';
    case 'pause':
      return 'wants to pause';
    case 'seek':
      return `wants to jump to ${formatTime(r.time ?? 0)}`;
    case 'change_video':
      return r.title ? `wants to play “${r.title}”` : 'wants to change the video';
  }
}

const myRole = () => {
  const s = useRoom.getState();
  return s.participants.find((p) => p.id === s.youId)?.role ?? 'participant';
};

/**
 * Owns the socket lifecycle for one room: join (and re-join after every
 * reconnect, resuming the same seat via the session token), clock sync, and
 * fanning server events into the store.
 */
export function useRoomSession(code: string, name: string | null) {
  useEffect(() => {
    if (!name) return;
    const store = useRoom.getState();
    store.reset(code);
    let joining = false;
    let clockTimer: ReturnType<typeof setInterval> | undefined;
    const requestToasts = new Map<string, number>();

    const join = async () => {
      if (joining) return;
      joining = true;
      const st = useRoom.getState();
      if (st.status === 'joined') st.setStatus('reconnecting');
      let res: JoinResult;
      try {
        res = (await socket.timeout(8000).emitWithAck('join_room', {
          roomId: code,
          username: name,
          sessionToken: session.getToken(code),
          hostKey: session.getHostKey(code),
        })) as JoinResult;
      } catch {
        joining = false;
        useRoom.getState().setStatus('reconnecting');
        return; // socket.io will reconnect and fire 'connect' again
      }
      joining = false;

      if (!res.ok) {
        const map: Record<string, Parameters<typeof st.setStatus>[0]> = {
          NOT_FOUND: 'not_found',
          REMOVED: 'removed',
          ROOM_FULL: 'full',
        };
        useRoom.getState().setStatus(map[res.code] ?? 'error', { code: res.code as never, message: res.message });
        return;
      }
      session.setToken(code, res.data.you.sessionToken);
      session.clearHostKey(code);
      useRoom.getState().hydrate(res.data);
      void syncClock();
    };

    const onDisconnect = () => {
      const s = useRoom.getState();
      if (s.status === 'joined') s.setStatus('reconnecting');
    };

    socket.on('connect', join);
    socket.on('disconnect', onDisconnect);

    socket.on('sync_state', (p) => useRoom.getState().applySync(p));
    socket.on('user_joined', (p) => useRoom.getState().setParticipants(p.participants));
    socket.on('user_left', (p) => useRoom.getState().setParticipants(p.participants));
    socket.on('presence', (p) => useRoom.getState().setParticipants(p.participants));
    socket.on('participant_removed', (p) => useRoom.getState().setParticipants(p.participants));

    socket.on('role_assigned', (p) => {
      const s = useRoom.getState();
      s.setParticipants(p.participants);
      if (p.userId !== s.youId || p.role === p.previousRole) return;
      const lines: Record<string, string> = {
        host: 'You have full control of the room.',
        moderator: 'You can control playback and answer requests.',
        participant: 'Ask the host or a moderator to make changes.',
        viewer: 'You can watch, chat and react.',
      };
      toast(`You're now ${p.role === 'host' ? 'the host' : `a ${ROLE_LABEL[p.role].toLowerCase()}`}`, {
        body: lines[p.role],
        tone: 'signal',
      });
    });

    // Keep the (now banned) token: a refresh should still say "removed", not sneak back in.
    socket.on('removed', () => useRoom.getState().setStatus('removed'));
    socket.on('session_replaced', () => useRoom.getState().setStatus('replaced'));

    socket.on('chat_message', (m) => useRoom.getState().addChat(m));
    socket.on('reaction', (r) => useRoom.getState().addReaction(r));

    socket.on('request_created', (r) => {
      const s = useRoom.getState();
      s.addRequest(r);
      if (r.from.id === s.youId || !can(myRole(), 'resolve_requests')) return;
      const id = toast(r.from.name, {
        body: describeRequest(r),
        tone: 'signal',
        duration: 0, // stays until the request is answered, withdrawn or expires
        actions: [
          { label: 'Deny', onClick: () => void actions.resolve(r.id, false) },
          { label: 'Approve', primary: true, onClick: () => void actions.resolve(r.id, true) },
        ],
      });
      requestToasts.set(r.id, id);
    });

    socket.on('request_resolved', ({ request, outcome, by }) => {
      const s = useRoom.getState();
      s.removeRequest(request.id);
      const tid = requestToasts.get(request.id);
      if (tid) useToasts.getState().dismiss(tid);
      requestToasts.delete(request.id);
      if (request.from.id !== s.youId || outcome === 'cancelled') return;
      const copy = {
        approved: [`${by?.name ?? 'The host'} approved your request`, 'success'],
        denied: [`${by?.name ?? 'The host'} declined your request`, 'neutral'],
        expired: ['Your request expired', 'neutral'],
        stale: ['Your request no longer applies', 'neutral'],
      } as const;
      const [title, tone] = copy[outcome];
      toast(title, { tone });
    });

    socket.on('error_event', (e) => toast(e.message, { tone: 'error' }));

    if (socket.connected) void join();
    else socket.connect();

    // Re-estimate the clock now and then; drift between machines is real.
    clockTimer = setInterval(() => void syncClock(3), 60_000);

    return () => {
      clearInterval(clockTimer);
      socket.removeAllListeners();
      // A real departure is explicit (Leave button). Unmounting just drops the
      // connection; the server keeps the seat briefly in case we come back.
      socket.disconnect();
    };
  }, [code, name]);
}

export function leaveRoom(code: string) {
  socket.emit('leave_room', { roomId: code });
  session.clearToken(code);
}
