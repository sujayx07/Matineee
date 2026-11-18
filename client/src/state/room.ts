import { create } from 'zustand';
import type {
  ActionRequest,
  ChatMessage,
  ErrorCode,
  Moment,
  ParticipantDTO,
  PlaybackAction,
  PlaybackState,
  ReactionPayload,
  RoomSnapshot,
  SyncStatePayload,
} from '../../../shared/protocol';
import type { Role } from '../../../shared/roles';

export type RoomStatus =
  | 'connecting'
  | 'joined'
  | 'reconnecting'
  | 'not_found'
  | 'removed'
  | 'replaced'
  | 'full'
  | 'error';

export type SidebarTab = 'chat' | 'people' | 'requests';

export interface FloatingReaction extends ReactionPayload {
  key: number;
  x: number;
}

export interface LastAction {
  action: PlaybackAction;
  by: { id: string; name: string } | null;
  at: number;
  seq: number;
}

interface RoomStore {
  status: RoomStatus;
  error: { code: ErrorCode | 'NETWORK'; message: string } | null;
  code: string;
  name: string;
  youId: string | null;
  participants: ParticipantDTO[];
  playback: PlaybackState | null;
  lastAction: LastAction | null;
  chat: ChatMessage[];
  requests: ActionRequest[];
  moments: Moment[];
  floating: FloatingReaction[];
  tab: SidebarTab;
  unread: number;

  reset: (code: string) => void;
  hydrate: (s: RoomSnapshot) => void;
  setStatus: (status: RoomStatus, error?: RoomStore['error']) => void;
  applySync: (s: SyncStatePayload) => void;
  setParticipants: (p: ParticipantDTO[]) => void;
  addChat: (m: ChatMessage) => void;
  addReaction: (r: ReactionPayload) => void;
  dropFloating: (key: number) => void;
  addRequest: (r: ActionRequest) => void;
  removeRequest: (id: string) => void;
  setTab: (t: SidebarTab) => void;
}

const CHAT_KEEP = 200;
let floatKey = 0;

export const useRoom = create<RoomStore>((set) => ({
  status: 'connecting',
  error: null,
  code: '',
  name: '',
  youId: null,
  participants: [],
  playback: null,
  lastAction: null,
  chat: [],
  requests: [],
  moments: [],
  floating: [],
  tab: 'chat',
  unread: 0,

  reset: (code) =>
    set({
      status: 'connecting',
      error: null,
      code,
      name: '',
      youId: null,
      participants: [],
      playback: null,
      lastAction: null,
      chat: [],
      requests: [],
      moments: [],
      floating: [],
      unread: 0,
    }),

  hydrate: (s) =>
    set({
      status: 'joined',
      error: null,
      code: s.code,
      name: s.name,
      youId: s.you.id,
      participants: s.participants,
      playback: s.playback,
      chat: s.chat,
      requests: s.requests,
      moments: s.moments,
    }),

  setStatus: (status, error = null) => set({ status, error }),

  applySync: (s) =>
    set((st) => {
      // Out-of-order delivery can't happen on one socket, but a resync can race a broadcast.
      if (st.playback && s.seq < st.playback.seq) return {};
      const { serverTime: _t, action, by, ...playback } = s;
      return {
        playback,
        moments: action === 'change_video' ? [] : st.moments,
        lastAction: action === 'resync' ? st.lastAction : { action, by, at: Date.now(), seq: s.seq },
      };
    }),

  setParticipants: (participants) => set({ participants }),

  addChat: (m) =>
    set((st) => ({
      chat: [...st.chat, m].slice(-CHAT_KEEP),
      unread: st.tab === 'chat' || m.kind === 'system' ? st.unread : st.unread + 1,
    })),

  addReaction: (r) =>
    set((st) => ({
      floating: [...st.floating, { ...r, key: ++floatKey, x: Math.random() }].slice(-40),
      moments: r.t !== null ? [...st.moments, { emoji: r.emoji, t: r.t }] : st.moments,
    })),

  dropFloating: (key) => set((st) => ({ floating: st.floating.filter((f) => f.key !== key) })),

  addRequest: (r) => set((st) => ({ requests: [...st.requests.filter((x) => x.id !== r.id), r] })),
  removeRequest: (id) => set((st) => ({ requests: st.requests.filter((r) => r.id !== id) })),

  setTab: (tab) => set((st) => ({ tab, unread: tab === 'chat' ? 0 : st.unread })),
}));

/** The current user's role (participant until we know better). */
export const useMyRole = (): Role =>
  useRoom((s) => s.participants.find((p) => p.id === s.youId)?.role ?? 'participant');

export const useMe = () => useRoom((s) => s.participants.find((p) => p.id === s.youId) ?? null);
