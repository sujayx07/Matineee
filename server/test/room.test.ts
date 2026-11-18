import { describe, expect, it } from 'vitest';
import { Room } from '../src/domain/Room';
import { parseYouTubeInput } from '../../shared/youtube';

const T0 = 1_700_000_000_000;
const MAX = 50;

function setup() {
  const room = new Room({ code: 'ABC234', name: 'Test', createdAt: T0, hostKey: 'key' });
  const host = room.join({ name: 'Hana', hostKey: 'key', maxParticipants: MAX }, T0).participant;
  const bob = room.join({ name: 'Bob', maxParticipants: MAX }, T0 + 1).participant;
  const cy = room.join({ name: 'Cy', maxParticipants: MAX }, T0 + 2).participant;
  room.changeVideo(host, 'dQw4w9WgXcQ', { title: 'T', channel: null }, 0, T0);
  return { room, host, bob, cy };
}

describe('roles', () => {
  it('makes the creator host and everyone else a participant', () => {
    const { host, bob } = setup();
    expect(host.role).toBe('host');
    expect(bob.role).toBe('participant');
  });

  it('host key is single-use', () => {
    const { room } = setup();
    const imposter = room.join({ name: 'X', hostKey: 'key', maxParticipants: MAX }, T0).participant;
    expect(imposter.role).toBe('participant');
  });

  it('only host can assign roles', () => {
    const { room, host, bob, cy } = setup();
    expect(() => room.assignRole(bob, cy.id, 'moderator')).toThrow(/Only the host/);
    room.assignRole(host, bob.id, 'moderator');
    expect(bob.role).toBe('moderator');
    // moderators still can't manage roles
    expect(() => room.assignRole(bob, cy.id, 'moderator')).toThrow(/Only the host/);
  });

  it('transfer host demotes the old host to moderator', () => {
    const { room, host, bob } = setup();
    room.transferHost(host, bob.id);
    expect(bob.role).toBe('host');
    expect(host.role).toBe('moderator');
    expect([...room.participants.values()].filter((p) => p.role === 'host')).toHaveLength(1);
  });

  it('kicked users cannot rejoin with the same session', () => {
    const { room, host, bob } = setup();
    room.kick(host, bob.id);
    expect(room.get(bob.id)).toBeUndefined();
    expect(() => room.join({ name: 'Bob', sessionToken: bob.sessionToken, maxParticipants: MAX }, T0)).toThrow(/removed/);
  });

  it('elects a new host when the host leaves, preferring moderators', () => {
    const { room, host, bob, cy } = setup();
    room.assignRole(host, cy.id, 'moderator');
    room.remove(host.id);
    const change = room.ensureHost();
    expect(change?.participant.id).toBe(cy.id);
    expect(bob.role).toBe('participant');
  });

  it('resuming with a session token keeps the seat and role', () => {
    const { room, host } = setup();
    const again = room.join({ name: 'Hana', sessionToken: host.sessionToken, maxParticipants: MAX }, T0 + 5);
    expect(again.resumed).toBe(true);
    expect(again.participant).toBe(host);
  });

  it('enforces capacity', () => {
    const room = new Room({ code: 'ABC234', name: 'T', createdAt: T0, hostKey: null });
    room.join({ name: 'a', maxParticipants: 1 }, T0);
    expect(() => room.join({ name: 'b', maxParticipants: 1 }, T0)).toThrow(/full/);
  });
});

describe('playback', () => {
  it('rejects playback control from participants', () => {
    const { room, bob } = setup();
    expect(() => room.pause(bob, 3, T0)).toThrow(/host or a moderator/);
    expect(() => room.seek(bob, 3, T0)).toThrow();
    expect(() => room.changeVideo(bob, 'aaaaaaaaaaa', { title: null, channel: null }, 0, T0)).toThrow();
  });

  it('extrapolates position while playing and freezes on pause', () => {
    const { room, host } = setup();
    room.play(host, 10, T0);
    expect(room.currentPosition(T0 + 2500)).toBeCloseTo(12.5);
    room.pause(host, undefined, T0 + 4000);
    expect(room.playback.position).toBeCloseTo(14);
    expect(room.currentPosition(T0 + 60_000)).toBeCloseTo(14);
  });

  it('increments seq on every change', () => {
    const { room, host } = setup();
    const s0 = room.playback.seq;
    room.play(host, 0, T0);
    room.seek(host, 30, T0);
    expect(room.playback.seq).toBe(s0 + 2);
  });

  it('clamps bad times', () => {
    const { room, host } = setup();
    room.seek(host, -5, T0);
    expect(room.playback.position).toBe(0);
    expect(() => room.seek(host, Number.NaN, T0)).toThrow();
  });

  it('change video resets reaction moments', () => {
    const { room, host, bob } = setup();
    room.react(bob, '🔥', 12, T0);
    expect(room.moments).toHaveLength(1);
    room.changeVideo(host, 'aaaaaaaaaaa', { title: null, channel: null }, 0, T0);
    expect(room.moments).toHaveLength(0);
  });
});

describe('requests', () => {
  it('participant request → approve applies the action', () => {
    const { room, host, bob } = setup();
    room.play(host, 0, T0);
    const { request } = room.createRequest(bob, { kind: 'pause' }, T0, 60_000);
    const res = room.resolveRequest(host, request.id, true, T0 + 1000);
    expect(res.outcome).toBe('approved');
    expect(room.playback.playing).toBe(false);
  });

  it('participants cannot approve', () => {
    const { room, bob, cy } = setup();
    const { request } = room.createRequest(bob, { kind: 'seek', time: 40 }, T0, 60_000);
    expect(() => room.resolveRequest(cy, request.id, true, T0)).toThrow();
  });

  it('a newer request of the same kind replaces the older one', () => {
    const { room, bob } = setup();
    const a = room.createRequest(bob, { kind: 'seek', time: 10 }, T0, 60_000);
    const b = room.createRequest(bob, { kind: 'seek', time: 20 }, T0, 60_000);
    expect(b.replaced?.id).toBe(a.request.id);
    expect(room.requests.size).toBe(1);
  });

  it('seek requests go stale when the video changes', () => {
    const { room, host, bob } = setup();
    const { request } = room.createRequest(bob, { kind: 'seek', time: 10 }, T0, 60_000);
    room.changeVideo(host, 'aaaaaaaaaaa', { title: null, channel: null }, 0, T0);
    expect(room.resolveRequest(host, request.id, true, T0).outcome).toBe('stale');
  });

  it('viewers cannot request; staff are told to act directly', () => {
    const { room, host, bob, cy } = setup();
    room.assignRole(host, cy.id, 'viewer');
    expect(() => room.createRequest(cy, { kind: 'play' }, T0, 1)).toThrow(/Viewers/);
    room.assignRole(host, bob.id, 'moderator');
    expect(() => room.createRequest(bob, { kind: 'play' }, T0, 1)).toThrow(/directly/);
  });
});

describe('parseYouTubeInput', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ', undefined],
    ['youtu.be/dQw4w9WgXcQ?t=90', 'dQw4w9WgXcQ', 90],
    ['https://youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ', undefined],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s', 'dQw4w9WgXcQ', 90],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ', undefined],
    ['dQw4w9WgXcQ', 'dQw4w9WgXcQ', undefined],
  ])('%s', (input, id, start) => {
    expect(parseYouTubeInput(input)).toEqual(start === undefined ? { videoId: id } : { videoId: id, start });
  });

  it.each(['', 'hello', 'https://vimeo.com/123', 'https://youtube.com/watch?v=short'])('rejects %s', (input) => {
    expect(parseYouTubeInput(input)).toBeNull();
  });
});
