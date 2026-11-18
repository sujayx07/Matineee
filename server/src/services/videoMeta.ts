import type { VideoMeta } from '../domain/Room';
import { isValidVideoId } from '../../../shared/youtube';

const cache = new Map<string, VideoMeta>();
const CACHE_MAX = 500;

/**
 * Title + channel via YouTube's public oEmbed endpoint (no API key). Purely
 * cosmetic, so it never blocks for long and never throws.
 */
export async function fetchVideoMeta(videoId: string, timeoutMs = 2500): Promise<VideoMeta> {
  const empty: VideoMeta = { title: null, channel: null };
  if (!isValidVideoId(videoId)) return empty;
  const hit = cache.get(videoId);
  if (hit) return hit;

  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return empty;
    const body = (await res.json()) as { title?: unknown; author_name?: unknown };
    const meta: VideoMeta = {
      title: typeof body.title === 'string' ? body.title.slice(0, 200) : null,
      channel: typeof body.author_name === 'string' ? body.author_name.slice(0, 100) : null,
    };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(videoId, meta);
    return meta;
  } catch {
    return empty;
  }
}
