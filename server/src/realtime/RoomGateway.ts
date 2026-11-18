import type { Server, Socket } from 'socket.io';
import type { ZodType } from 'zod';
import type {
  ActionRequest,
  ClientToServerEvents,
  ErrorCode,
  PlaybackAction,
  RoomSnapshot,
  ServerToClientEvents,
} from '../../../shared/protocol';
import { ROLE_LABEL } from '../../../shared/roles';
import type { Config } from '../config';
import type { Participant } from '../domain/Participant';
import type { RequestOutcome, Room, RoleChange } from '../domain/Room';
import type { RoomManager } from '../domain/RoomManager';
import { fetchVideoMeta } from '../services/videoMeta';
import { DomainError, forbidden } from '../util/errors';
import { ConnectionLimiter, type LimitCategory } from '../util/rateLimiter';
import { logger } from '../util/logger';
import { schemas } from './schemas';

export interface SocketData {
  roomCode?: string;
  participantId?: string;
  limiter: ConnectionLimiter;
}

export type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AnyAck = (res: unknown) => void;
interface Ctx {
  room: Room;
  me: Participant;
}

const channel = (code: string) => `room:${code}`;

/**
 * Translates socket events into Room operations. Every inbound event goes
 * through the same pipeline: rate limit → schema validation → resolve the
 * caller's seat → domain call (which enforces role permissions) → broadcast.
 */
export class RoomGateway {
  private requestTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly io: IO,
    private readonly rooms: RoomManager,
    private readonly cfg: Pick<Config, 'maxParticipantsPerRoom' | 'reconnectGraceMs' | 'requestTtlMs'>,
  ) {}

  attach(): void {
    this.io.on('connection', (socket) => this.onConnection(socket));
  }

  // ─────────────────────────────── plumbing ─────────────────────────────

  private onConnection(socket: ClientSocket): void {
    socket.data.limiter = new ConnectionLimiter();

    socket.on('time_sync', (ack) => {
      if (typeof ack === 'function') ack(Date.now());
    });

    this.on(socket, 'join_room', 'join', schemas.join_room, (p) => this.join(socket, p), false);
    socket.on('leave_room', () => this.leave(socket));
    socket.on('request_sync', () => {
      const ctx = this.context(socket);
      if (ctx) socket.emit('sync_state', this.syncPayload(ctx.room, 'resync', null));
    });

    this.on(socket, 'play', 'control', schemas.play, ({ room, me }, p) => {
      room.play(me, p.time, Date.now());
      this.afterPlayback(room, 'play', me);
    });
    this.on(socket, 'pause', 'control', schemas.pause, ({ room, me }, p) => {
      room.pause(me, p.time, Date.now());
      this.afterPlayback(room, 'pause', me);
    });
    this.on(socket, 'seek', 'control', schemas.seek, ({ room, me }, p) => {
      room.seek(me, p.time, Date.now());
      this.afterPlayback(room, 'seek', me);
    });
    this.on(socket, 'change_video', 'control', schemas.change_video, async (ctx, p) => {
      if (!ctx.me.can('change_video')) throw forbidden('Only the host or a moderator can change the video.');
      const meta = await fetchVideoMeta(p.videoId);
      const fresh = this.requireContext(socket); // role or membership may have changed while we awaited
      fresh.room.changeVideo(fresh.me, p.videoId, meta, p.start, Date.now());
      this.afterVideoChange(fresh.room, fresh.me);
    });

    this.on(socket, 'assign_role', 'admin', schemas.assign_role, ({ room, me }, p) => {
      const change = room.assignRole(me, p.userId, p.role);
      this.announceRole(room, change, me);
      // Newly promoted staff don't need their own open requests any more.
      if (change.participant.can('playback')) {
        this.dropRequests(room, (r) => r.from.id === change.participant.id, 'cancelled');
      }
      this.rooms.persist(room);
    });
    this.on(socket, 'transfer_host', 'admin', schemas.transfer_host, ({ room, me }, p) => {
      const { newHost, oldHost } = room.transferHost(me, p.userId);
      this.announceRole(room, newHost, me);
      this.announceRole(room, oldHost, me, false);
      this.dropRequests(room, (r) => r.from.id === newHost.participant.id, 'cancelled');
      this.rooms.persist(room);
    });
    this.on(socket, 'remove_participant', 'admin', schemas.remove_participant, ({ room, me }, p) => {
      const target = room.kick(me, p.userId);
      this.detachSocket(target.socketId, (s) => s.emit('removed', { by: me.name }));
      this.dropRequests(room, (r) => r.from.id === target.id, 'cancelled');
      this.io.to(channel(room.code)).emit('participant_removed', {
        userId: target.id,
        username: target.name,
        participants: room.participantList(),
      });
      this.system(room, `${me.name} removed ${target.name}`);
      this.afterMembershipChange(room);
    });

    this.on(socket, 'chat_send', 'chat', schemas.chat_send, ({ room, me }, p) => {
      this.io.to(channel(room.code)).emit('chat_message', room.addChat(me, p.text, Date.now()));
    });
    this.on(socket, 'reaction', 'reaction', schemas.reaction, ({ room, me }, p) => {
      const moment = room.react(me, p.emoji, p.videoTime, Date.now());
      this.io.to(channel(room.code)).emit('reaction', {
        id: `${me.id}:${Date.now()}`,
        emoji: p.emoji,
        userId: me.id,
        name: me.name,
        hue: me.hue,
        t: moment?.t ?? null,
      });
    });

    this.on(socket, 'request_action', 'request', schemas.request_action, async (ctx, p) => {
      if (!ctx.me.can('request')) {
        throw ctx.me.can('playback') ? new DomainError('BAD_REQUEST', 'You can do that directly.') : forbidden('Viewers can’t send requests.');
      }
      const title = p.kind === 'change_video' ? (await fetchVideoMeta(p.videoId)).title : null;
      const { room, me } = this.requireContext(socket);
      const { request, replaced } = room.createRequest(
        me,
        {
          kind: p.kind,
          time: p.kind === 'seek' ? p.time : p.kind === 'change_video' ? p.start : undefined,
          videoId: p.kind === 'change_video' ? p.videoId : undefined,
          title,
        },
        Date.now(),
        this.cfg.requestTtlMs,
      );
      if (replaced) this.resolved(room, replaced, 'cancelled', null);
      this.io.to(channel(room.code)).emit('request_created', request);
      this.requestTimers.set(
        request.id,
        setTimeout(() => {
          const expired = room.takeRequest(request.id);
          if (expired) this.resolved(room, expired, 'expired', null);
        }, this.cfg.requestTtlMs),
      );
    });
    this.on(socket, 'resolve_request', 'control', schemas.resolve_request, ({ room, me }, p) => {
      const { request, outcome, playback } = room.resolveRequest(me, p.requestId, p.approve, Date.now());
      this.resolved(room, request, outcome, me);
      if (playback) {
        if (request.kind === 'change_video') this.afterVideoChange(room, me);
        else this.afterPlayback(room, request.kind, me);
      }
    });
    this.on(socket, 'cancel_request', 'request', schemas.cancel_request, ({ room, me }, p) => {
      this.resolved(room, room.cancelRequest(me, p.requestId), 'cancelled', me);
    });

    socket.on('disconnect', () => this.onDisconnect(socket));
  }

  /**
   * Register a handler with validation, rate limiting and uniform error
   * replies. `needsRoom=false` is only for join_room.
   */
  private on<S extends ZodType, R>(
    socket: ClientSocket,
    event: keyof ClientToServerEvents,
    category: LimitCategory,
    schema: S,
    handler: (ctx: Ctx, payload: S['_output']) => R | Promise<R>,
    needsRoom?: true,
  ): void;
  private on<S extends ZodType, R>(
    socket: ClientSocket,
    event: keyof ClientToServerEvents,
    category: LimitCategory,
    schema: S,
    handler: (payload: S['_output']) => R | Promise<R>,
    needsRoom: false,
  ): void;
  private on(
    socket: ClientSocket,
    event: keyof ClientToServerEvents,
    category: LimitCategory,
    schema: ZodType,
    handler: (...args: never[]) => unknown,
    needsRoom = true,
  ): void {
    (socket.on as (e: string, l: (...a: unknown[]) => void) => void)(event, async (raw: unknown, maybeAck: unknown) => {
      // Clients may omit the payload: `emit('play', ack)`.
      let payload = raw;
      let ack = maybeAck as AnyAck | undefined;
      if (typeof raw === 'function') {
        ack = raw as AnyAck;
        payload = undefined;
      }
      const reply = (res: unknown) => (typeof ack === 'function' ? ack(res) : undefined);

      try {
        if (!socket.data.limiter.allow(category)) {
          throw new DomainError('RATE_LIMITED', 'Slow down a little.');
        }
        const parsed = schema.safeParse(payload ?? {});
        if (!parsed.success) {
          throw new DomainError('BAD_REQUEST', parsed.error.issues[0]?.message ?? 'Invalid request.');
        }
        const result = needsRoom
          ? await (handler as (c: Ctx, p: unknown) => unknown)(this.requireContext(socket), parsed.data)
          : await (handler as (p: unknown) => unknown)(parsed.data);
        reply(result === undefined ? { ok: true } : { ok: true, data: result });
      } catch (err) {
        const { code, message } = this.toClientError(err, event);
        if (typeof ack === 'function') ack({ ok: false, code, message });
        else socket.emit('error_event', { code, message });
      }
    });
  }

  private toClientError(err: unknown, event: string): { code: ErrorCode; message: string } {
    if (err instanceof DomainError) return { code: err.code, message: err.message };
    logger.error('unhandled event error', { event, err: err instanceof Error ? err.stack : String(err) });
    return { code: 'INTERNAL', message: 'Something went wrong on our side.' };
  }

  private context(socket: ClientSocket): Ctx | null {
    const { roomCode, participantId } = socket.data;
    if (!roomCode || !participantId) return null;
    const room = this.rooms.get(roomCode);
    const me = room?.get(participantId);
    if (!room || !me || me.socketId !== socket.id) return null;
    return { room, me };
  }

  private requireContext(socket: ClientSocket): Ctx {
    const ctx = this.context(socket);
    if (!ctx) throw new DomainError('NOT_IN_ROOM', 'You are not in a room.');
    return ctx;
  }

  /** Remove a socket from its room channel without disconnecting it. */
  private detachSocket(socketId: string | null, before?: (s: ClientSocket) => void): void {
    if (!socketId) return;
    const s = this.io.sockets.sockets.get(socketId);
    if (!s) return;
    before?.(s);
    if (s.data.roomCode) s.leave(channel(s.data.roomCode));
    s.data.roomCode = undefined;
    s.data.participantId = undefined;
  }

  // ─────────────────────────────── membership ───────────────────────────

  private join(socket: ClientSocket, p: (typeof schemas.join_room)['_output']): RoomSnapshot {
    const room = this.rooms.get(p.roomId);
    if (!room) throw new DomainError('NOT_FOUND', `There's no room with the code ${p.roomId}.`);

    if (socket.data.roomCode) this.leave(socket);

    const { participant: me, resumed } = room.join(
      { name: p.username, sessionToken: p.sessionToken, hostKey: p.hostKey, maxParticipants: this.cfg.maxParticipantsPerRoom },
      Date.now(),
    );
    this.rooms.cancelEviction(room.code);

    // Same seat opened somewhere else (e.g. a refreshed tab racing the old one).
    if (me.socketId && me.socketId !== socket.id) {
      this.detachSocket(me.socketId, (s) => s.emit('session_replaced'));
    }
    me.socketId = socket.id;
    socket.data.roomCode = room.code;
    socket.data.participantId = me.id;
    void socket.join(channel(room.code));

    const promoted = room.ensureHost();
    const to = this.io.to(channel(room.code)).except(socket.id);

    if (resumed) {
      to.emit('presence', { participants: room.participantList() });
    } else {
      to.emit('user_joined', { username: me.name, userId: me.id, role: me.role, participants: room.participantList() });
      this.system(room, `${me.name} joined`, socket.id);
    }
    if (promoted) this.announceRole(room, promoted, null);
    this.rooms.persist(room);

    logger.info('join', { room: room.code, user: me.id, role: me.role, resumed });
    return {
      code: room.code,
      name: room.name,
      createdAt: room.createdAt,
      serverTime: Date.now(),
      you: { id: me.id, sessionToken: me.sessionToken },
      participants: room.participantList(),
      playback: room.playback,
      chat: room.chat,
      requests: [...room.requests.values()],
      moments: room.moments,
    };
  }

  private leave(socket: ClientSocket): void {
    const ctx = this.context(socket);
    this.detachSocket(socket.id);
    if (ctx) this.depart(ctx.room, ctx.me);
  }

  private onDisconnect(socket: ClientSocket): void {
    const ctx = this.context(socket);
    if (!ctx) return;
    const { room, me } = ctx;
    // Keep the seat warm for a moment so a flaky network or a refresh doesn't
    // cost someone their role.
    me.socketId = null;
    this.io.to(channel(room.code)).emit('presence', { participants: room.participantList() });
    me.graceTimer = setTimeout(() => {
      if (!me.connected && room.get(me.id)) this.depart(room, me);
    }, this.cfg.reconnectGraceMs);
  }

  private depart(room: Room, me: Participant): void {
    if (!room.remove(me.id)) return;
    this.dropRequests(room, (r) => r.from.id === me.id, 'cancelled');
    this.io.to(channel(room.code)).emit('user_left', {
      username: me.name,
      userId: me.id,
      participants: room.participantList(),
    });
    this.system(room, `${me.name} left`);
    const promoted = room.ensureHost();
    if (promoted) this.announceRole(room, promoted, null);
    this.afterMembershipChange(room);
  }

  private afterMembershipChange(room: Room): void {
    if (room.size === 0) {
      room.freeze(Date.now());
      this.rooms.scheduleEviction(room);
    }
    this.rooms.persist(room);
  }

  // ─────────────────────────────── broadcasts ───────────────────────────

  private syncPayload(room: Room, action: PlaybackAction, by: Participant | null) {
    return { ...room.playback, serverTime: Date.now(), action, by: by ? by.ref() : null };
  }

  private afterPlayback(room: Room, action: PlaybackAction, by: Participant): void {
    this.io.to(channel(room.code)).emit('sync_state', this.syncPayload(room, action, by));
    this.rooms.persist(room);
  }

  private afterVideoChange(room: Room, by: Participant): void {
    this.dropRequests(room, (r) => r.kind !== 'change_video' && r.contextVideoId !== room.playback.videoId, 'stale');
    this.afterPlayback(room, 'change_video', by);
    this.system(room, `${by.name} put on ${room.playback.title ? `“${room.playback.title}”` : 'a new video'}`);
  }

  private announceRole(room: Room, change: RoleChange, by: Participant | null, withMessage = true): void {
    const { participant: p, previousRole } = change;
    this.io.to(channel(room.code)).emit('role_assigned', {
      userId: p.id,
      username: p.name,
      role: p.role,
      previousRole,
      participants: room.participantList(),
      by: by ? by.ref() : null,
    });
    if (!withMessage) return;
    const label = ROLE_LABEL[p.role].toLowerCase();
    this.system(room, by ? `${by.name} made ${p.name} ${p.role === 'host' ? 'the host' : `a ${label}`}` : `${p.name} is now the host`);
  }

  private resolved(room: Room, request: ActionRequest, outcome: RequestOutcome, by: Participant | null): void {
    const t = this.requestTimers.get(request.id);
    if (t) clearTimeout(t);
    this.requestTimers.delete(request.id);
    this.io.to(channel(room.code)).emit('request_resolved', { request, outcome, by: by ? by.ref() : null });
  }

  private dropRequests(room: Room, predicate: (r: ActionRequest) => boolean, outcome: RequestOutcome): void {
    for (const r of room.pruneRequests(predicate)) this.resolved(room, r, outcome, null);
  }

  private system(room: Room, text: string, exceptSocket?: string): void {
    const msg = room.addSystem(text, Date.now());
    const target = this.io.to(channel(room.code));
    (exceptSocket ? target.except(exceptSocket) : target).emit('chat_message', msg);
  }
}
