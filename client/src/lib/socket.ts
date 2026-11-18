import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/protocol';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Same origin in production (server serves the SPA); override for split deploys. */
const SERVER_URL: string | undefined = import.meta.env.VITE_SERVER_URL || undefined;

export const socket: AppSocket = io(SERVER_URL ?? '', {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
});

export const API_BASE = SERVER_URL ?? '';
