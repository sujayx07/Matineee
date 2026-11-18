const ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function isValidVideoId(id: unknown): id is string {
  return typeof id === 'string' && ID_RE.test(id);
}

/** Parses "90", "1m30s", "1h2m3s" into seconds. */
function parseStart(raw: string | null): number | undefined {
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || (!m[1] && !m[2] && !m[3])) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export interface ParsedVideo {
  videoId: string;
  start?: number;
}

/**
 * Accepts any common YouTube URL shape (watch, youtu.be, shorts, embed, live,
 * music, mobile) or a bare 11-character id. Returns null when nothing usable
 * is found.
 */
export function parseYouTubeInput(input: string): ParsedVideo | null {
  const raw = input.trim();
  if (!raw) return null;
  if (isValidVideoId(raw)) return { videoId: raw };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  const start = parseStart(url.searchParams.get('t') ?? url.searchParams.get('start'));
  let id: string | null = null;

  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') {
      id = url.searchParams.get('v');
    } else {
      const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
      id = m?.[1] ?? null;
    }
  }

  if (!isValidVideoId(id)) return null;
  return start !== undefined ? { videoId: id, start } : { videoId: id };
}

export function thumbnailUrl(videoId: string, quality: 'mq' | 'hq' = 'mq'): string {
  return `https://i.ytimg.com/vi/${videoId}/${quality}default.jpg`;
}
