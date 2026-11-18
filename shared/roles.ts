/**
 * Role-based access control — single source of truth for both server
 * (enforcement) and client (disabling UI). The server never trusts the
 * client's opinion of its own role; it always re-checks with `can()`.
 */

export const ROLES = ['host', 'moderator', 'participant', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/** Roles the host may hand out with `assign_role`. Host itself moves via `transfer_host`. */
export const ASSIGNABLE_ROLES = ['moderator', 'participant', 'viewer'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export type Permission =
  | 'playback' // play / pause / seek
  | 'change_video'
  | 'assign_role'
  | 'remove_participant'
  | 'transfer_host'
  | 'resolve_requests' // approve / deny participant requests
  | 'request' // ask staff to perform a playback action
  | 'chat'
  | 'react';

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  host: new Set<Permission>([
    'playback',
    'change_video',
    'assign_role',
    'remove_participant',
    'transfer_host',
    'resolve_requests',
    'chat',
    'react',
  ]),
  moderator: new Set<Permission>(['playback', 'change_video', 'resolve_requests', 'chat', 'react']),
  participant: new Set<Permission>(['request', 'chat', 'react']),
  // Viewer: a quieter participant. Watches, chats and reacts, but can't file requests.
  viewer: new Set<Permission>(['chat', 'react']),
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].has(permission);
}

export const ROLE_LABEL: Record<Role, string> = {
  host: 'Host',
  moderator: 'Moderator',
  participant: 'Participant',
  viewer: 'Viewer',
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  host: 'Full control of the room',
  moderator: 'Controls playback and approves requests',
  participant: 'Watches and can request changes',
  viewer: 'Watch, chat and react only',
};

/** Lower = more senior. Used for sorting and host succession. */
export const ROLE_RANK: Record<Role, number> = {
  host: 0,
  moderator: 1,
  participant: 2,
  viewer: 3,
};
