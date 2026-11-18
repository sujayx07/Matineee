import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CreateRoomResponse, RoomPreview } from '../../../shared/protocol';
import type { RoomManager } from '../domain/RoomManager';
import { roomCodeSchema, schemas } from '../realtime/schemas';
import { fetchVideoMeta } from '../services/videoMeta';
import { isValidVideoId } from '../../../shared/youtube';
import { DomainError } from '../util/errors';
import { TokenBucket } from '../util/rateLimiter';
import { logger } from '../util/logger';

/** Tiny per-IP limiter for room creation — rooms are the expensive resource. */
function createLimiter() {
  const buckets = new Map<string, TokenBucket>();
  setInterval(() => buckets.clear(), 10 * 60_000).unref();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? 'unknown';
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = new TokenBucket(8, 0.1)));
    if (!b.take()) return res.status(429).json({ error: 'Too many rooms created. Try again in a minute.' });
    next();
  };
}

export function createApp(rooms: RoomManager, opts: { clientDir: string | null; corsOrigins: string[] }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '8kb' }));

  if (opts.corsOrigins.length) {
    app.use('/api', (req, res, next) => {
      const origin = req.headers.origin;
      if (origin && opts.corsOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST');
      }
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      next();
    });
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, uptime: Math.round(process.uptime()), ...rooms.stats() });
  });

  app.post('/api/rooms', createLimiter(), (req, res) => {
    const parsed = schemas.create_room.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid room name.' });
    const name = parsed.data.name || 'Untitled room';
    const { room, hostKey } = rooms.create(name);
    logger.info('room created', { code: room.code });
    const body: CreateRoomResponse = { code: room.code, hostKey, name: room.name };
    res.status(201).json(body);
  });

  app.get('/api/rooms/:code', (req, res) => {
    const parsed = roomCodeSchema.safeParse(req.params.code);
    if (!parsed.success) return res.status(400).json({ error: 'Room codes are 6 characters.' });
    const room = rooms.get(parsed.data);
    if (!room) return res.status(404).json({ error: 'No room with that code.' });
    const body: RoomPreview = {
      code: room.code,
      name: room.name,
      participantCount: room.connectedCount,
      host: room.host?.name ?? null,
      nowPlaying: room.playback.videoId ? { videoId: room.playback.videoId, title: room.playback.title } : null,
    };
    res.json(body);
  });

  // Title lookup for the "paste a link" preview. oEmbed has no CORS, so we proxy it.
  app.get('/api/video/:id', async (req, res) => {
    if (!isValidVideoId(req.params.id)) return res.status(400).json({ error: 'Not a YouTube video id.' });
    const meta = await fetchVideoMeta(req.params.id);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(meta);
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

  // In production the API also serves the built SPA, so one service = one URL.
  if (opts.clientDir && existsSync(join(opts.clientDir, 'index.html'))) {
    app.use(
      express.static(opts.clientDir, {
        index: false,
        setHeaders(res, path) {
          if (path.includes(`${'assets'}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    app.get(/.*/, (_req, res) => res.sendFile(join(opts.clientDir!, 'index.html')));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof DomainError) {
      return res.status(err.code === 'ROOM_FULL' ? 503 : 400).json({ error: err.message });
    }
    logger.error('http error', { err: err instanceof Error ? err.stack : String(err) });
    res.status(500).json({ error: 'Something went wrong.' });
  });

  return app;
}
