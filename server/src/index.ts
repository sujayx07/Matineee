import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { config } from './config';
import { RoomManager } from './domain/RoomManager';
import { createApp } from './http/app';
import { createRepository } from './persistence/RoomRepository';
import { RoomGateway, type IO } from './realtime/RoomGateway';
import { logger } from './util/logger';

async function main() {
  const repo = await createRepository(config.databasePath);
  const pruned = repo.prune(Date.now() - config.roomRetentionMs);
  if (pruned) logger.info('pruned stale rooms', { pruned });

  const rooms = new RoomManager(repo, config);

  // Bundled server lives in dist/server; the SPA build sits next to it in dist/client.
  const here = dirname(fileURLToPath(import.meta.url));
  const clientDir = process.env.CLIENT_DIR ?? resolve(here, '../client');

  const app = createApp(rooms, { clientDir, corsOrigins: config.corsOrigins });
  const http = createServer(app);

  const io: IO = new Server(http, {
    cors: config.corsOrigins.length ? { origin: config.corsOrigins } : undefined,
    pingInterval: 20_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 16 * 1024,
  });

  new RoomGateway(io, rooms, config).attach();

  http.listen(config.port, () => {
    logger.info(`watchparty listening on :${config.port}`, { env: config.isProd ? 'production' : 'development' });
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    rooms.flush();
    io.close();
    http.close(() => {
      repo.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('fatal', { err: err instanceof Error ? err.stack : String(err) });
  process.exit(1);
});
