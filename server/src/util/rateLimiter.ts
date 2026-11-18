/**
 * Token bucket. One instance per (socket, category). Cheap enough to keep
 * per-connection; no shared state, so it works unchanged when scaled out.
 */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.last = now();
  }

  take(cost = 1): boolean {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.refillPerSecond);
    this.last = t;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

export type LimitCategory = 'control' | 'chat' | 'reaction' | 'request' | 'admin' | 'join';

const LIMITS: Record<LimitCategory, [capacity: number, perSecond: number]> = {
  control: [12, 4],
  chat: [6, 1],
  reaction: [10, 3],
  request: [4, 0.5],
  admin: [10, 2],
  join: [5, 0.5],
};

export class ConnectionLimiter {
  private buckets = new Map<LimitCategory, TokenBucket>();

  allow(category: LimitCategory): boolean {
    let b = this.buckets.get(category);
    if (!b) {
      const [cap, rate] = LIMITS[category];
      b = new TokenBucket(cap, rate);
      this.buckets.set(category, b);
    }
    return b.take();
  }
}
