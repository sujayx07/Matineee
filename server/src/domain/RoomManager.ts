import type { Config } from '../config';
import type { RoomRepository } from '../persistence/RoomRepository';
import { DomainError } from '../util/errors';
import { roomCode, secret } from '../util/ids';
import { logger } from '../util/logger';
import { Room } from './Room';

/**
 * Owns the set of live rooms. Rooms are hydrated lazily from the repository,
 * written back on a debounce, and evicted from memory once they sit empty.
 */
export class RoomManager {
  private rooms = new Map<string, Room>();
  private saveTimers = new Map<string, NodeJS.Timeout>();
  private evictTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly repo: RoomRepository,
    private readonly cfg: Pick<Config, 'maxRooms' | 'emptyRoomTtlMs'>,
  ) {}

  get liveCount(): number {
    return this.rooms.size;
  }

  create(name: string): { room: Room; hostKey: string } {
    if (this.rooms.size >= this.cfg.maxRooms) {
      throw new DomainError('ROOM_FULL', 'The server is at capacity. Try again in a few minutes.');
    }
    let code = roomCode();
    for (let i = 0; this.rooms.has(code) || this.repo.exists(code); i++) {
      if (i > 20) throw new DomainError('INTERNAL', 'Could not allocate a room code.');
      code = roomCode();
    }
    const hostKey = secret();
    const room = new Room({ code, name, createdAt: Date.now(), hostKey });
    this.rooms.set(code, room);
    this.persistNow(room);
    // A freshly created room with nobody in it should still expire.
    this.scheduleEviction(room);
    return { room, hostKey };
  }

  /** Live room, or hydrate it from storage. */
  get(code: string): Room | undefined {
    const live = this.rooms.get(code);
    if (live) return live;
    const stored = this.repo.find(code);
    if (!stored) return undefined;
    const room = new Room({
      code: stored.code,
      name: stored.name,
      createdAt: stored.createdAt,
      hostKey: stored.hostKey,
      hostToken: stored.hostToken,
      // Nobody is watching a cold room, so it resumes paused.
      playback: { ...stored.playback, playing: false },
    });
    this.rooms.set(code, room);
    this.scheduleEviction(room);
    logger.info('room hydrated', { code });
    return room;
  }

  /** Persist on a short debounce — playback can change many times a second while scrubbing. */
  persist(room: Room): void {
    clearTimeout(this.saveTimers.get(room.code));
    this.saveTimers.set(
      room.code,
      setTimeout(() => {
        this.saveTimers.delete(room.code);
        this.persistNow(room);
      }, 750),
    );
  }

  private persistNow(room: Room): void {
    try {
      this.repo.save({
        code: room.code,
        name: room.name,
        createdAt: room.createdAt,
        lastActiveAt: room.lastActiveAt,
        hostKey: room.pendingHostKey,
        hostToken: room.hostToken,
        playback: room.playback,
      });
    } catch (err) {
      logger.error('persist failed', { code: room.code, err: String(err) });
    }
  }

  scheduleEviction(room: Room): void {
    this.cancelEviction(room.code);
    this.evictTimers.set(
      room.code,
      setTimeout(() => {
        if (room.size > 0) return;
        this.evictTimers.delete(room.code);
        this.persistNow(room);
        this.rooms.delete(room.code);
        logger.info('room evicted from memory', { code: room.code });
      }, this.cfg.emptyRoomTtlMs),
    );
  }

  cancelEviction(code: string): void {
    const t = this.evictTimers.get(code);
    if (t) clearTimeout(t);
    this.evictTimers.delete(code);
  }

  /** Flush everything — used on graceful shutdown. */
  flush(): void {
    for (const t of this.saveTimers.values()) clearTimeout(t);
    this.saveTimers.clear();
    for (const room of this.rooms.values()) this.persistNow(room);
  }

  stats() {
    let participants = 0;
    for (const r of this.rooms.values()) participants += r.connectedCount;
    return { rooms: this.rooms.size, participants };
  }
}
