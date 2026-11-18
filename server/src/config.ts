function int(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** `--port=3001` beats $PORT, so dev tooling that injects PORT can't collide with Vite. */
const argPort = process.argv.find((a) => a.startsWith('--port='))?.slice(7);

export const config = {
  port: argPort ? Number(argPort) : int('PORT', 3001),
  isProd: process.env.NODE_ENV === 'production',
  /** Comma-separated allowed origins for CORS / Socket.IO in split deployments. */
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  /** SQLite file. Set to "off" to run purely in memory. */
  databasePath: process.env.DATABASE_PATH ?? './data/watchparty.db',
  maxParticipantsPerRoom: int('MAX_PARTICIPANTS_PER_ROOM', 50),
  maxRooms: int('MAX_ROOMS', 1000),
  /** How long a dropped connection keeps its seat (and role). */
  reconnectGraceMs: int('RECONNECT_GRACE_MS', 20_000),
  /** Idle empty rooms are evicted from memory after this long (still persisted). */
  emptyRoomTtlMs: int('EMPTY_ROOM_TTL_MS', 10 * 60_000),
  /** Persisted rooms untouched for this long are deleted. */
  roomRetentionMs: int('ROOM_RETENTION_MS', 7 * 24 * 3600_000),
  requestTtlMs: int('REQUEST_TTL_MS', 60_000),
};

export type Config = typeof config;
