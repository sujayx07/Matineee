import { randomBytes, randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../../../shared/protocol';

export function roomCode(): string {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) out += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return out;
}

/** Unguessable secret (session tokens, host keys). */
export function secret(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

/** Short opaque id for participants, messages, requests. */
export function shortId(): string {
  return randomBytes(9).toString('base64url');
}
