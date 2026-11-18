import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ClientToServerEvents, RoomSnapshot, ServerToClientEvents } from '../../shared/protocol';
import { RoomManager } from '../src/domain/RoomManager';
import { createApp } from '../src/http/app';
import { MemoryRoomRepository } from '../src/persistence/RoomRepository';
import { RoomGateway, type IO } from '../src/realtime/RoomGateway';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let http: HttpServer;
let url: string;
const clients: Client[] = [];

beforeAll(async () => {
  const rooms = new RoomManager(new MemoryRoomRepository(), { maxRooms: 100, emptyRoomTtlMs: 60_000 });
  http = createServer(createApp(rooms, { clientDir: null, corsOrigins: [] }));
  const io: IO = new Server(http);
  new RoomGateway(io, rooms, { maxParticipantsPerRoom: 50, reconnectGraceMs: 200, requestTtlMs: 5000 }).attach();
  await new Promise<void>((r) => http.listen(0, r));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});

afterAll(() => {
  clients.forEach((c) => c.disconnect());
  http.close();
});

async function createRoom() {
  const res = await fetch(`${url}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Movie night' }),
  });
  return (await res.json()) as { code: string; hostKey: string };
}

async function join(code: string, username: string, hostKey?: string) {
  const socket: Client = connect(url, { transports: ['websocket'], forceNew: true });
  clients.push(socket);
  const res = await socket.emitWithAck('join_room', { roomId: code, username, hostKey });
  if (!res.ok) throw new Error(res.message);
  return { socket, snap: res.data as RoomSnapshot };
}

const next = <E extends keyof ServerToClientEvents>(s: Client, e: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((resolve) =>
    (s as unknown as { once: (e: string, cb: (p: unknown) => void) => void }).once(e, resolve as (p: unknown) => void),
  );

describe('gateway end-to-end', () => {
  it('syncs playback from host to participants and rejects participant control', async () => {
    const { code, hostKey } = await createRoom();
    const host = await join(code, 'Hana', hostKey);
    const guest = await join(code, 'Gus');

    expect(host.snap.participants.find((p) => p.id === host.snap.you.id)?.role).toBe('host');
    expect(guest.snap.participants.find((p) => p.id === guest.snap.you.id)?.role).toBe('participant');

    const changed = next(guest.socket, 'sync_state');
    expect((await host.socket.emitWithAck('change_video', { videoId: 'dQw4w9WgXcQ' })).ok).toBe(true);
    const s = await changed;
    expect(s.videoId).toBe('dQw4w9WgXcQ');
    expect(s.action).toBe('change_video');

    const denied = await guest.socket.emitWithAck('pause', {});
    expect(denied).toMatchObject({ ok: false, code: 'FORBIDDEN' });

    const seeked = next(guest.socket, 'sync_state');
    await host.socket.emitWithAck('seek', { time: 42 });
    expect((await seeked).position).toBe(42);
  });

  it('runs the request → approval flow', async () => {
    const { code, hostKey } = await createRoom();
    const host = await join(code, 'Hana', hostKey);
    const guest = await join(code, 'Gus');
    await host.socket.emitWithAck('change_video', { videoId: 'dQw4w9WgXcQ' });

    const created = next(host.socket, 'request_created');
    expect((await guest.socket.emitWithAck('request_action', { kind: 'seek', time: 99 })).ok).toBe(true);
    const req = await created;

    const synced = next(guest.socket, 'sync_state');
    const resolved = next(guest.socket, 'request_resolved');
    await host.socket.emitWithAck('resolve_request', { requestId: req.id, approve: true });
    expect((await resolved).outcome).toBe('approved');
    expect((await synced).position).toBe(99);
  });

  it('promotes, removes, and transfers host', async () => {
    const { code, hostKey } = await createRoom();
    const host = await join(code, 'Hana', hostKey);
    const mod = await join(code, 'Mo');
    const kicked = await join(code, 'Kit');

    const roled = next(mod.socket, 'role_assigned');
    await host.socket.emitWithAck('assign_role', { userId: mod.snap.you.id, role: 'moderator' });
    expect((await roled).role).toBe('moderator');

    // moderator can control playback now
    expect((await mod.socket.emitWithAck('change_video', { videoId: 'dQw4w9WgXcQ' })).ok).toBe(true);
    // but cannot remove people
    expect(await mod.socket.emitWithAck('remove_participant', { userId: kicked.snap.you.id })).toMatchObject({ ok: false });

    const removed = next(kicked.socket, 'removed');
    await host.socket.emitWithAck('remove_participant', { userId: kicked.snap.you.id });
    await removed;
    expect(await kicked.socket.emitWithAck('play', {})).toMatchObject({ ok: false, code: 'NOT_IN_ROOM' });

    await host.socket.emitWithAck('transfer_host', { userId: mod.snap.you.id });
    expect((await mod.socket.emitWithAck('remove_participant', { userId: host.snap.you.id })).ok).toBe(true);
  });

  it('hands host to the next person when the host disconnects', async () => {
    const { code, hostKey } = await createRoom();
    const host = await join(code, 'Hana', hostKey);
    const guest = await join(code, 'Gus');
    const promoted = next(guest.socket, 'role_assigned');
    host.socket.disconnect();
    const evt = await promoted;
    expect(evt.userId).toBe(guest.snap.you.id);
    expect(evt.role).toBe('host');
  });

  it('validates payloads and unknown rooms', async () => {
    const socket: Client = connect(url, { transports: ['websocket'], forceNew: true });
    clients.push(socket);
    expect(await socket.emitWithAck('join_room', { roomId: 'ZZZZZZ', username: 'x' })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await socket.emitWithAck('join_room', { roomId: 'ZZZZZZ', username: '' })).toMatchObject({ ok: false, code: 'BAD_REQUEST' });
  });
});
