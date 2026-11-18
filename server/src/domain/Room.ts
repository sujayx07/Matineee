import type {
  ActionRequest,
  ChatMessage,
  Moment,
  ParticipantDTO,
  PlaybackState,
  ReactionEmoji,
  RequestKind,
} from '../../../shared/protocol';
import { ROLE_RANK, type AssignableRole, type Permission, type Role } from '../../../shared/roles';
import { badRequest, DomainError, forbidden, notFound } from '../util/errors';
import { secret, shortId } from '../util/ids';
import { Participant } from './Participant';

const CHAT_HISTORY = 100;
const MAX_MOMENTS = 400;
const MAX_PENDING_REQUESTS = 30;
const MAX_VIDEO_SECONDS = 24 * 3600;

export interface VideoMeta {
  title: string | null;
  channel: string | null;
}

export interface RoomInit {
  code: string;
  name: string;
  createdAt: number;
  hostKey: string | null;
  hostToken?: string | null;
  playback?: PlaybackState;
}

export type RequestOutcome = 'approved' | 'denied' | 'expired' | 'cancelled' | 'stale';

export interface RoleChange {
  participant: Participant;
  previousRole: Role;
}

function clampTime(t: number): number {
  if (!Number.isFinite(t)) throw badRequest('Invalid time.');
  return Math.min(Math.max(0, t), MAX_VIDEO_SECONDS);
}

/**
 * A watch room: membership, roles, authoritative playback clock, chat,
 * reactions and pending requests. Pure state + rules — no I/O, no timers —
 * so every rule here is unit-testable with an injected `now`.
 */
export class Room {
  readonly code: string;
  readonly name: string;
  readonly createdAt: number;
  readonly participants = new Map<string, Participant>();
  playback: PlaybackState;
  chat: ChatMessage[] = [];
  readonly requests = new Map<string, ActionRequest>();
  moments: Moment[] = [];
  lastActiveAt: number;

  /** One-time secret handed to the creator; consumed on first join. */
  private hostKey: string | null;
  /** Session token of the current host — persisted so a host can reclaim after a restart. */
  hostToken: string | null;
  private readonly tokenIndex = new Map<string, string>();

  /** Unclaimed creator key (for persistence only). */
  get pendingHostKey(): string | null {
    return this.hostKey;
  }

  private readonly removedTokens = new Set<string>();

  constructor(init: RoomInit) {
    this.code = init.code;
    this.name = init.name;
    this.createdAt = init.createdAt;
    this.hostKey = init.hostKey;
    this.hostToken = init.hostToken ?? null;
    this.lastActiveAt = init.createdAt;
    this.playback = init.playback ?? {
      videoId: null,
      title: null,
      channel: null,
      playing: false,
      position: 0,
      updatedAt: init.createdAt,
      seq: 0,
    };
  }

  // ───────────────────────────── membership ─────────────────────────────

  get size(): number {
    return this.participants.size;
  }

  get connectedCount(): number {
    let n = 0;
    for (const p of this.participants.values()) if (p.connected) n++;
    return n;
  }

  get host(): Participant | undefined {
    for (const p of this.participants.values()) if (p.role === 'host') return p;
    return undefined;
  }

  findByToken(token: string | undefined): Participant | undefined {
    if (!token) return undefined;
    const id = this.tokenIndex.get(token);
    return id ? this.participants.get(id) : undefined;
  }

  get(id: string): Participant | undefined {
    return this.participants.get(id);
  }

  /**
   * Seat a new person, or resume an existing seat when `sessionToken` matches.
   * Role rules: the creator (valid hostKey) is Host; a returning host token
   * reclaims Host if the seat is free; everyone else starts as Participant.
   */
  join(
    opts: { name: string; sessionToken?: string; hostKey?: string; maxParticipants: number },
    now: number,
  ): { participant: Participant; resumed: boolean } {
    if (opts.sessionToken && this.removedTokens.has(opts.sessionToken)) {
      throw new DomainError('REMOVED', 'You were removed from this room by the host.');
    }

    const existing = this.findByToken(opts.sessionToken);
    if (existing) {
      existing.name = opts.name;
      existing.clearGrace();
      this.touch(now);
      return { participant: existing, resumed: true };
    }

    if (this.size >= opts.maxParticipants) throw new DomainError('ROOM_FULL', 'This room is full.');

    const claimsHostKey = !!opts.hostKey && opts.hostKey === this.hostKey;
    const reclaimsHost = !!opts.sessionToken && opts.sessionToken === this.hostToken && !this.host;
    const role: Role = (claimsHostKey || reclaimsHost) && !this.host ? 'host' : 'participant';

    // Keep a returning host's token so their links keep working; otherwise mint one.
    const token = reclaimsHost && opts.sessionToken ? opts.sessionToken : secret();
    const participant = new Participant(shortId(), opts.name, role, token, now);
    this.participants.set(participant.id, participant);
    this.tokenIndex.set(token, participant.id);

    if (role === 'host') {
      this.hostKey = null;
      this.hostToken = token;
    }
    this.touch(now);
    return { participant, resumed: false };
  }

  /** Drop someone from the room (leave, grace expiry, or kick). */
  remove(id: string): Participant | undefined {
    const p = this.participants.get(id);
    if (!p) return undefined;
    p.clearGrace();
    this.participants.delete(id);
    this.tokenIndex.delete(p.sessionToken);
    return p;
  }

  /**
   * Guarantee exactly one host while anyone is present. Succession prefers
   * connected people, then seniority (moderator > participant > viewer),
   * then whoever joined first.
   */
  ensureHost(): RoleChange | null {
    if (this.host || this.size === 0) return null;
    const next = [...this.participants.values()].sort(
      (a, b) =>
        Number(b.connected) - Number(a.connected) ||
        ROLE_RANK[a.role] - ROLE_RANK[b.role] ||
        a.joinedAt - b.joinedAt,
    )[0]!;
    const previousRole = next.role;
    next.role = 'host';
    this.hostToken = next.sessionToken;
    return { participant: next, previousRole };
  }

  participantList(): ParticipantDTO[] {
    return [...this.participants.values()]
      .sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.joinedAt - b.joinedAt)
      .map((p) => p.toDTO());
  }

  // ─────────────────────────── role management ──────────────────────────

  private require(actor: Participant, permission: Permission, message?: string): void {
    if (!this.participants.has(actor.id)) throw new DomainError('NOT_IN_ROOM', 'You are not in this room.');
    if (!actor.can(permission)) throw forbidden(message);
  }

  private target(id: string): Participant {
    const t = this.participants.get(id);
    if (!t) throw notFound('That person is no longer in the room.');
    return t;
  }

  assignRole(actor: Participant, targetId: string, role: AssignableRole): RoleChange {
    this.require(actor, 'assign_role', 'Only the host can change roles.');
    const target = this.target(targetId);
    if (target.id === actor.id) throw badRequest("You can't change your own role. Transfer host instead.");
    const previousRole = target.role;
    target.role = role;
    return { participant: target, previousRole };
  }

  transferHost(actor: Participant, targetId: string): { newHost: RoleChange; oldHost: RoleChange } {
    this.require(actor, 'transfer_host', 'Only the host can transfer host.');
    const target = this.target(targetId);
    if (target.id === actor.id) throw badRequest('You are already the host.');
    const newHost = { participant: target, previousRole: target.role };
    target.role = 'host';
    actor.role = 'moderator';
    this.hostToken = target.sessionToken;
    return { newHost, oldHost: { participant: actor, previousRole: 'host' } };
  }

  kick(actor: Participant, targetId: string): Participant {
    this.require(actor, 'remove_participant', 'Only the host can remove people.');
    const target = this.target(targetId);
    if (target.id === actor.id) throw badRequest("You can't remove yourself.");
    this.removedTokens.add(target.sessionToken);
    this.remove(target.id);
    return target;
  }

  // ─────────────────────────────── playback ─────────────────────────────

  /** Authoritative position right now, extrapolated from the last update. */
  currentPosition(now: number): number {
    const { playing, position, updatedAt } = this.playback;
    return playing ? position + Math.max(0, now - updatedAt) / 1000 : position;
  }

  private commit(patch: Partial<PlaybackState>, now: number): PlaybackState {
    this.playback = { ...this.playback, ...patch, updatedAt: now, seq: this.playback.seq + 1 };
    this.touch(now);
    return this.playback;
  }

  private requireVideo(): void {
    if (!this.playback.videoId) throw badRequest('Load a video first.');
  }

  play(actor: Participant, time: number | undefined, now: number): PlaybackState {
    this.require(actor, 'playback', 'Only the host or a moderator can control playback.');
    this.requireVideo();
    const position = time === undefined ? this.currentPosition(now) : clampTime(time);
    return this.commit({ playing: true, position }, now);
  }

  pause(actor: Participant, time: number | undefined, now: number): PlaybackState {
    this.require(actor, 'playback', 'Only the host or a moderator can control playback.');
    this.requireVideo();
    const position = time === undefined ? this.currentPosition(now) : clampTime(time);
    return this.commit({ playing: false, position }, now);
  }

  seek(actor: Participant, time: number, now: number): PlaybackState {
    this.require(actor, 'playback', 'Only the host or a moderator can seek.');
    this.requireVideo();
    return this.commit({ position: clampTime(time) }, now);
  }

  changeVideo(actor: Participant, videoId: string, meta: VideoMeta, start: number | undefined, now: number): PlaybackState {
    this.require(actor, 'change_video', 'Only the host or a moderator can change the video.');
    this.moments = [];
    // Pending seeks refer to the old video; they are resolved as stale by the caller.
    return this.commit(
      { videoId, title: meta.title, channel: meta.channel, playing: true, position: clampTime(start ?? 0) },
      now,
    );
  }

  /** Freeze the clock when the room empties so nobody returns mid-way through. */
  freeze(now: number): void {
    if (this.playback.playing) this.commit({ playing: false, position: this.currentPosition(now) }, now);
  }

  // ───────────────────────────── chat & reactions ───────────────────────

  private pushChat(m: ChatMessage): ChatMessage {
    this.chat.push(m);
    if (this.chat.length > CHAT_HISTORY) this.chat.splice(0, this.chat.length - CHAT_HISTORY);
    return m;
  }

  addChat(actor: Participant, text: string, now: number): ChatMessage {
    this.require(actor, 'chat');
    const clean = text.replace(/\s+\n/g, '\n').trim();
    if (!clean) throw badRequest('Message is empty.');
    this.touch(now);
    return this.pushChat({
      id: shortId(),
      kind: 'user',
      text: clean,
      at: now,
      author: { id: actor.id, name: actor.name, role: actor.role, hue: actor.hue },
    });
  }

  addSystem(text: string, now: number): ChatMessage {
    return this.pushChat({ id: shortId(), kind: 'system', text, at: now });
  }

  /** Records a reaction; returns a timeline moment when it maps onto the current video. */
  react(actor: Participant, emoji: ReactionEmoji, videoTime: number | undefined, now: number): Moment | null {
    this.require(actor, 'react');
    if (!this.playback.videoId) return null;
    const t = videoTime !== undefined && Number.isFinite(videoTime) ? clampTime(videoTime) : this.currentPosition(now);
    const moment: Moment = { emoji, t: Math.round(t * 10) / 10 };
    this.moments.push(moment);
    if (this.moments.length > MAX_MOMENTS) this.moments.shift();
    return moment;
  }

  // ─────────────────────────────── requests ─────────────────────────────

  createRequest(
    actor: Participant,
    input: { kind: RequestKind; time?: number; videoId?: string; title?: string | null },
    now: number,
    ttlMs: number,
  ): { request: ActionRequest; replaced: ActionRequest | null } {
    if (actor.can('playback')) throw badRequest('You can do that directly.');
    this.require(actor, 'request', 'Viewers can’t send requests.');
    if (input.kind !== 'change_video') this.requireVideo();
    if (input.kind === 'seek' && input.time === undefined) throw badRequest('Seek needs a time.');
    if (input.kind === 'change_video' && !input.videoId) throw badRequest('Pick a video.');

    // One open request per person per kind — a newer ask replaces the older one.
    let replaced: ActionRequest | null = null;
    for (const r of this.requests.values()) {
      if (r.from.id === actor.id && r.kind === input.kind) {
        replaced = r;
        this.requests.delete(r.id);
        break;
      }
    }
    if (this.requests.size >= MAX_PENDING_REQUESTS) {
      throw new DomainError('RATE_LIMITED', 'Too many pending requests. Try again shortly.');
    }

    const request: ActionRequest = {
      id: shortId(),
      kind: input.kind,
      from: { id: actor.id, name: actor.name, hue: actor.hue },
      time: input.time !== undefined ? clampTime(input.time) : undefined,
      videoId: input.videoId,
      title: input.title ?? null,
      contextVideoId: this.playback.videoId,
      createdAt: now,
      expiresAt: now + ttlMs,
    };
    this.requests.set(request.id, request);
    return { request, replaced };
  }

  /**
   * Approve or deny a request. Approval performs the action with the
   * approver's authority — so the action is still permission-checked.
   */
  resolveRequest(
    actor: Participant,
    requestId: string,
    approve: boolean,
    now: number,
  ): { request: ActionRequest; outcome: RequestOutcome; playback: PlaybackState | null } {
    this.require(actor, 'resolve_requests', 'Only the host or a moderator can answer requests.');
    const request = this.requests.get(requestId);
    if (!request) throw notFound('That request was already handled.');
    this.requests.delete(requestId);

    if (!approve) return { request, outcome: 'denied', playback: null };

    const isStale = request.kind !== 'change_video' && request.contextVideoId !== this.playback.videoId;
    if (isStale) return { request, outcome: 'stale', playback: null };

    let playback: PlaybackState;
    switch (request.kind) {
      case 'play':
        playback = this.play(actor, undefined, now);
        break;
      case 'pause':
        playback = this.pause(actor, undefined, now);
        break;
      case 'seek':
        playback = this.seek(actor, request.time!, now);
        break;
      case 'change_video':
        playback = this.changeVideo(actor, request.videoId!, { title: request.title ?? null, channel: null }, request.time, now);
        break;
    }
    return { request, outcome: 'approved', playback };
  }

  cancelRequest(actor: Participant, requestId: string): ActionRequest {
    const request = this.requests.get(requestId);
    if (!request) throw notFound('That request was already handled.');
    if (request.from.id !== actor.id) throw forbidden('You can only cancel your own requests.');
    this.requests.delete(requestId);
    return request;
  }

  takeRequest(requestId: string): ActionRequest | undefined {
    const r = this.requests.get(requestId);
    if (r) this.requests.delete(requestId);
    return r;
  }

  /** Remove requests that no longer make sense (author left, or video changed under a seek). */
  pruneRequests(predicate: (r: ActionRequest) => boolean): ActionRequest[] {
    const dropped: ActionRequest[] = [];
    for (const r of this.requests.values()) {
      if (predicate(r)) {
        this.requests.delete(r.id);
        dropped.push(r);
      }
    }
    return dropped;
  }

  touch(now: number): void {
    this.lastActiveAt = now;
  }
}
