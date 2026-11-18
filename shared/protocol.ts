/**
 * Wire protocol shared by the Socket.IO server and client.
 * Event names follow the assignment spec (join_room, sync_state, play, …);
 * a few extras cover chat, reactions, the request/approval flow and clock sync.
 */
import type { AssignableRole, Role } from './roles';

export const ROOM_CODE_LENGTH = 6;
/** Unambiguous alphabet: no 0/O, 1/I/L. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const NAME_MAX = 24;
export const CHAT_MAX = 500;
export const REACTION_EMOJIS = ['🔥', '😂', '😮', '❤️', '👏', '💀'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export interface PlaybackState {
  videoId: string | null;
  title: string | null;
  channel: string | null;
  playing: boolean;
  /** Seconds into the video at `updatedAt`. */
  position: number;
  /** Server epoch ms when `position` was captured. */
  updatedAt: number;
  /** Monotonic counter; clients drop stale states. */
  seq: number;
}

export type PlaybackAction = 'play' | 'pause' | 'seek' | 'change_video' | 'resync';

export interface SyncStatePayload extends PlaybackState {
  serverTime: number;
  action: PlaybackAction;
  by: { id: string; name: string } | null;
}

export interface ParticipantDTO {
  id: string;
  name: string;
  role: Role;
  connected: boolean;
  joinedAt: number;
  hue: number;
}

export interface ChatMessage {
  id: string;
  kind: 'user' | 'system';
  text: string;
  at: number;
  author?: { id: string; name: string; role: Role; hue: number };
}

export type RequestKind = 'play' | 'pause' | 'seek' | 'change_video';

export interface ActionRequest {
  id: string;
  kind: RequestKind;
  from: { id: string; name: string; hue: number };
  time?: number;
  videoId?: string;
  title?: string | null;
  /** Video playing when the request was made — seek requests go stale on change. */
  contextVideoId: string | null;
  createdAt: number;
  expiresAt: number;
}

export interface Moment {
  emoji: ReactionEmoji;
  t: number;
}

export interface ReactionPayload {
  id: string;
  emoji: ReactionEmoji;
  userId: string;
  name: string;
  hue: number;
  /** Video time the reaction landed on, for the timeline. Null when nothing is loaded. */
  t: number | null;
}

export interface RoomSnapshot {
  code: string;
  name: string;
  createdAt: number;
  serverTime: number;
  you: { id: string; sessionToken: string };
  participants: ParticipantDTO[];
  playback: PlaybackState;
  chat: ChatMessage[];
  requests: ActionRequest[];
  moments: Moment[];
}

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'NOT_IN_ROOM'
  | 'ROOM_FULL'
  | 'RATE_LIMITED'
  | 'REMOVED'
  | 'INTERNAL';

export type AckResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; code: ErrorCode; message: string };

export type Ack<T = undefined> = (result: AckResult<T>) => void;

export interface JoinRoomPayload {
  roomId: string;
  username: string;
  sessionToken?: string;
  hostKey?: string;
}

export interface ClientToServerEvents {
  join_room: (p: JoinRoomPayload, ack: Ack<RoomSnapshot>) => void;
  leave_room: (p: { roomId: string }) => void;
  play: (p: { time?: number }, ack?: Ack) => void;
  pause: (p: { time?: number }, ack?: Ack) => void;
  seek: (p: { time: number }, ack?: Ack) => void;
  change_video: (p: { videoId: string; start?: number }, ack?: Ack) => void;
  assign_role: (p: { userId: string; role: AssignableRole }, ack?: Ack) => void;
  remove_participant: (p: { userId: string }, ack?: Ack) => void;
  transfer_host: (p: { userId: string }, ack?: Ack) => void;
  chat_send: (p: { text: string }, ack?: Ack) => void;
  reaction: (p: { emoji: ReactionEmoji; videoTime?: number }, ack?: Ack) => void;
  request_action: (
    p: { kind: RequestKind; time?: number; videoId?: string; start?: number },
    ack?: Ack,
  ) => void;
  resolve_request: (p: { requestId: string; approve: boolean }, ack?: Ack) => void;
  cancel_request: (p: { requestId: string }, ack?: Ack) => void;
  request_sync: () => void;
  time_sync: (ack: (serverTime: number) => void) => void;
}

export interface ServerToClientEvents {
  sync_state: (p: SyncStatePayload) => void;
  user_joined: (p: { username: string; userId: string; role: Role; participants: ParticipantDTO[] }) => void;
  user_left: (p: { username: string; userId: string; participants: ParticipantDTO[] }) => void;
  presence: (p: { participants: ParticipantDTO[] }) => void;
  role_assigned: (p: {
    userId: string;
    username: string;
    role: Role;
    previousRole: Role;
    participants: ParticipantDTO[];
    by: { id: string; name: string } | null;
  }) => void;
  participant_removed: (p: { userId: string; username: string; participants: ParticipantDTO[] }) => void;
  removed: (p: { by: string }) => void;
  session_replaced: () => void;
  chat_message: (m: ChatMessage) => void;
  reaction: (r: ReactionPayload) => void;
  request_created: (r: ActionRequest) => void;
  request_resolved: (p: {
    request: ActionRequest;
    outcome: 'approved' | 'denied' | 'expired' | 'cancelled' | 'stale';
    by: { id: string; name: string } | null;
  }) => void;
  error_event: (p: { code: ErrorCode; message: string }) => void;
}

/** REST: POST /api/rooms */
export interface CreateRoomResponse {
  code: string;
  hostKey: string;
  name: string;
}

/** REST: GET /api/rooms/:code */
export interface RoomPreview {
  code: string;
  name: string;
  participantCount: number;
  host: string | null;
  nowPlaying: { videoId: string; title: string | null } | null;
}
