import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PlaybackState } from '../../../shared/protocol';
import { logger } from '../util/logger';

export interface StoredRoom {
  code: string;
  name: string;
  createdAt: number;
  lastActiveAt: number;
  hostKey: string | null;
  hostToken: string | null;
  playback: PlaybackState;
}

/** Storage port. The app only depends on this interface. */
export interface RoomRepository {
  save(room: StoredRoom): void;
  find(code: string): StoredRoom | null;
  exists(code: string): boolean;
  prune(olderThan: number): number;
  close(): void;
}

export class MemoryRoomRepository implements RoomRepository {
  private rows = new Map<string, StoredRoom>();
  save(room: StoredRoom) {
    this.rows.set(room.code, structuredClone(room));
  }
  find(code: string) {
    const r = this.rows.get(code);
    return r ? structuredClone(r) : null;
  }
  exists(code: string) {
    return this.rows.has(code);
  }
  prune(olderThan: number) {
    let n = 0;
    for (const [code, r] of this.rows) if (r.lastActiveAt < olderThan && this.rows.delete(code)) n++;
    return n;
  }
  close() {}
}

/**
 * SQLite via Node's built-in `node:sqlite` — zero native build step, which
 * keeps deploys on Render/Railway simple. Only room metadata and the
 * playback clock are stored; live membership is in memory by design.
 */
export class SqliteRoomRepository implements RoomRepository {
  // Typed loosely so the module only loads when SQLite is actually used.
  private db: import('node:sqlite').DatabaseSync;
  private stmts: Record<'save' | 'find' | 'exists' | 'prune', import('node:sqlite').StatementSync>;

  constructor(db: import('node:sqlite').DatabaseSync) {
    this.db = db;
    db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS rooms (
        code           TEXT PRIMARY KEY,
        name           TEXT NOT NULL,
        created_at     INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL,
        host_key       TEXT,
        host_token     TEXT,
        playback       TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS rooms_last_active ON rooms(last_active_at);
    `);
    this.stmts = {
      save: db.prepare(`
        INSERT INTO rooms (code, name, created_at, last_active_at, host_key, host_token, playback)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(code) DO UPDATE SET
          last_active_at = excluded.last_active_at,
          host_key = excluded.host_key,
          host_token = excluded.host_token,
          playback = excluded.playback`),
      find: db.prepare(`SELECT * FROM rooms WHERE code = ?`),
      exists: db.prepare(`SELECT 1 FROM rooms WHERE code = ?`),
      prune: db.prepare(`DELETE FROM rooms WHERE last_active_at < ?`),
    };
  }

  static async open(path: string): Promise<SqliteRoomRepository> {
    mkdirSync(dirname(path), { recursive: true });
    const { DatabaseSync } = await import('node:sqlite');
    return new SqliteRoomRepository(new DatabaseSync(path));
  }

  save(r: StoredRoom) {
    this.stmts.save.run(r.code, r.name, r.createdAt, r.lastActiveAt, r.hostKey, r.hostToken, JSON.stringify(r.playback));
  }

  find(code: string): StoredRoom | null {
    const row = this.stmts.find.get(code) as Record<string, unknown> | undefined;
    if (!row) return null;
    try {
      return {
        code: String(row.code),
        name: String(row.name),
        createdAt: Number(row.created_at),
        lastActiveAt: Number(row.last_active_at),
        hostKey: (row.host_key as string | null) ?? null,
        hostToken: (row.host_token as string | null) ?? null,
        playback: JSON.parse(String(row.playback)) as PlaybackState,
      };
    } catch (err) {
      logger.warn('corrupt room row ignored', { code, err: String(err) });
      return null;
    }
  }

  exists(code: string) {
    return this.stmts.exists.get(code) !== undefined;
  }

  prune(olderThan: number) {
    return Number(this.stmts.prune.run(olderThan).changes);
  }

  close() {
    this.db.close();
  }
}

export async function createRepository(path: string): Promise<RoomRepository> {
  if (path === 'off' || path === ':memory:') return new MemoryRoomRepository();
  try {
    const repo = await SqliteRoomRepository.open(path);
    logger.info('persistence: sqlite', { path });
    return repo;
  } catch (err) {
    logger.warn('sqlite unavailable, falling back to memory', { err: String(err) });
    return new MemoryRoomRepository();
  }
}
