import type { ParticipantDTO } from '../../../shared/protocol';
import type { Role } from '../../../shared/roles';
import { can, type Permission } from '../../../shared/roles';

export class Participant {
  socketId: string | null = null;
  /** Pending removal after an unexpected disconnect. */
  graceTimer: NodeJS.Timeout | null = null;
  readonly hue: number;

  constructor(
    readonly id: string,
    public name: string,
    public role: Role,
    /** Secret the client presents to resume this seat after reconnecting. */
    readonly sessionToken: string,
    readonly joinedAt: number,
  ) {
    // Stable per-person accent, derived from id so it survives reconnects.
    let h = 0;
    for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    this.hue = h % 360;
  }

  get connected(): boolean {
    return this.socketId !== null;
  }

  can(permission: Permission): boolean {
    return can(this.role, permission);
  }

  clearGrace(): void {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
  }

  ref() {
    return { id: this.id, name: this.name };
  }

  toDTO(): ParticipantDTO {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      connected: this.connected,
      joinedAt: this.joinedAt,
      hue: this.hue,
    };
  }
}
