import { z } from 'zod';
import { CHAT_MAX, NAME_MAX, REACTION_EMOJIS, ROOM_CODE_LENGTH, normalizeRoomCode } from '../../../shared/protocol';
import { ASSIGNABLE_ROLES } from '../../../shared/roles';
import { isValidVideoId } from '../../../shared/youtube';

const time = z.number().finite().min(0).max(24 * 3600);
const id = z.string().min(1).max(64);

export const displayName = z
  .string()
  .transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1, 'Pick a name.').max(NAME_MAX, `Names are ${NAME_MAX} characters max.`));

export const roomCodeSchema = z
  .string()
  .transform(normalizeRoomCode)
  .pipe(z.string().length(ROOM_CODE_LENGTH, 'Room codes are 6 characters.'));

const videoId = z.string().refine(isValidVideoId, 'Not a valid YouTube video.');

export const schemas = {
  join_room: z.object({
    roomId: roomCodeSchema,
    username: displayName,
    sessionToken: z.string().max(128).optional(),
    hostKey: z.string().max(128).optional(),
  }),
  play: z.object({ time: time.optional() }).default({}),
  pause: z.object({ time: time.optional() }).default({}),
  seek: z.object({ time }),
  change_video: z.object({ videoId, start: time.optional() }),
  assign_role: z.object({ userId: id, role: z.enum(ASSIGNABLE_ROLES) }),
  remove_participant: z.object({ userId: id }),
  transfer_host: z.object({ userId: id }),
  chat_send: z.object({ text: z.string().min(1).max(CHAT_MAX) }),
  reaction: z.object({ emoji: z.enum(REACTION_EMOJIS), videoTime: time.optional() }),
  request_action: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('play') }),
    z.object({ kind: z.literal('pause') }),
    z.object({ kind: z.literal('seek'), time }),
    z.object({ kind: z.literal('change_video'), videoId, start: time.optional() }),
  ]),
  resolve_request: z.object({ requestId: id, approve: z.boolean() }),
  cancel_request: z.object({ requestId: id }),
  create_room: z.object({ name: z.string().trim().max(48).optional() }),
};
