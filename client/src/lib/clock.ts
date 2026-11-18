import type { PlaybackState } from '../../../shared/protocol';
import { socket } from './socket';

/**
 * Server clock estimate. Playback state is stamped with server time, so each
 * client needs `serverNow()` to know where the video *should* be right now.
 * We take a few NTP-style samples and keep the one with the lowest round trip.
 */
let offset = 0;
let rtt = 0;

export const serverNow = () => Date.now() + offset;
export const clockStats = () => ({ offset, rtt });

export async function syncClock(samples = 5): Promise<void> {
  let best: { offset: number; rtt: number } | null = null;
  for (let i = 0; i < samples; i++) {
    const sent = Date.now();
    try {
      const serverTime = await socket.timeout(3000).emitWithAck('time_sync');
      const received = Date.now();
      const r = received - sent;
      const o = serverTime + r / 2 - received;
      if (!best || r < best.rtt) best = { offset: o, rtt: r };
    } catch {
      /* drop the sample */
    }
  }
  if (best) {
    offset = best.offset;
    rtt = best.rtt;
  }
}

/** Where the authoritative clock says the video is at this instant. */
export function expectedPosition(p: PlaybackState, now = serverNow()): number {
  return p.playing ? p.position + Math.max(0, now - p.updatedAt) / 1000 : p.position;
}
