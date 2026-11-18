# Code Walkthrough Guide

Use this as a guide for presenting the project. It gives a demo script, the tech stack and why each piece was chosen, a guided tour of the code in the order to present it, and answers to likely questions.

---

## 1. Two-minute demo script

1. **Landing page:** enter a name, then **Start the room**. `POST /api/rooms` returns a room code and a one-time `hostKey`.
2. **Room:** click **Big Buck Bunny**. The host emits `change_video`, and the server broadcasts `sync_state`.
3. **Second tab:** open the invite link (`/r/CODE`). This user joins as a *Participant* and the video jumps to the host's current position ("Catching up" → "In sync").
4. **Participant presses pause.** The pause doesn't happen right away. It becomes a **request**, and the host sees a toast and a badge on the Requests tab.
5. **Host approves.** Both tabs pause at the same frame.
6. **Chat and reactions:** send a message and an emoji. Every tab receives them instantly.
7. **People tab:** promote the participant to Moderator. They can now control playback directly.
8. **Refresh a tab.** The user gets the same seat and role back (session token plus a 20s grace period).

Screenshots of these steps are in [`docs/screenshots/`](screenshots/).

---

## 2. Tech stack, and why

| Layer | Tech | Why |
|---|---|---|
| Frontend | React 19 + Vite + TypeScript | Fast dev server with a proxy to the API; typed end to end |
| Styling / motion | Tailwind v4, `motion` | Utility CSS with no extra build step |
| Client state | zustand | A small store that socket handlers can write to from outside React |
| Video | YouTube IFrame Player API | The official way to embed and script YouTube playback |
| Backend | Node 24 + Express 5 | REST for room creation, health check, and serving the built SPA |
| Realtime | **Socket.IO** (WebSocket transport) | Rooms/channels, acknowledgements, and automatic reconnection built in |
| Validation | zod | Every socket payload is untrusted, so each one is schema-checked |
| Persistence | `node:sqlite` (built in) | No native module to compile, which matters on Render |
| Tests | vitest | 33 tests: domain unit tests plus real-socket integration tests |
| Deploy | Render (Blueprint, `render.yaml`) | One service serves API, WebSocket and SPA on one URL, so there's no CORS |

---

## 3. Code tour (present in this order)

### `shared/` is the contract between client and server
- **`protocol.ts`**: TypeScript types for every client→server and server→client event, plus `PlaybackState`. Both sides import it, so a renamed event is a compile error rather than a runtime bug.
- **`roles.ts`**: the **permission matrix**. `can(role, permission)` is the single source of truth. The server uses it to *enforce*; the client uses it only to *disable buttons*.
- **`youtube.ts`**: parses any YouTube URL form (watch, youtu.be, shorts, embed) into an 11-character video ID.

### `server/src/index.ts` wires everything up
Repository → `RoomManager` → Express app → `http.Server` → Socket.IO `Server` → `new RoomGateway(io, rooms).attach()`. It also flushes state to the database on SIGTERM.

### `server/src/realtime/RoomGateway.ts` is the WebSocket layer (**the key file**)
Every inbound event goes through the same pipeline inside the private `on()` helper:

```
rate limit → zod validate → resolve caller's seat (socket.data) → Room method (permission check) → broadcast to `room:CODE` → ack {ok}
```

- `join_room`: claims the host seat with `hostKey`, or resumes a seat with `sessionToken`. Then `socket.join('room:CODE')`, and it returns a full **snapshot** (participants, playback, chat, requests).
- `play` / `pause` / `seek` call `room.play(me, time, now)` and then `afterPlayback()`, which emits `sync_state` to **everyone in the room, including the sender**.
- `request_action` / `resolve_request`: participant requests. An approved request runs **with the approver's authority**, so it passes through the same permission check.
- Disconnects don't remove the user immediately. A grace timer (`RECONNECT_GRACE_MS`) holds the seat so a page refresh doesn't drop them.

### `server/src/domain/` holds the business rules (OOP, no socket code)
- **`Room.ts`**: roles, the playback clock, chat, requests. Every mutating method starts with `require(actor, permission)`.
- **`Participant.ts`**: id, name, role, socketId, `can()`.
- **`RoomManager.ts`**: creates and looks up rooms, evicts empty ones, persists them.
- **`persistence/RoomRepository.ts`**: an interface with SQLite and in-memory implementations.

### Client side
- **`lib/socket.ts`**: a single Socket.IO client. It tries WebSocket first and falls back to HTTP long-polling. `VITE_SERVER_URL` points it at a separate backend for split deploys.
- **`lib/clock.ts`**: **NTP-style clock sync**. It pings `time_sync` five times and keeps the sample with the lowest round trip: `offset = serverTime + rtt/2 − receivedAt`. `expectedPosition()` = `position + (serverNow − updatedAt)` if playing.
- **`hooks/useRoomSession.ts`**: joins, listens to every server event, writes to the zustand store, and re-joins on reconnect.
- **`hooks/useSyncedPlayer.ts`**: drives the YouTube player from `sync_state`. A **1-second drift loop** seeks if the player is more than **0.75s** away from where the server says it should be.
- **`hooks/usePlaybackIntent.ts`**: "can I act directly?" If yes, it emits `play`/`pause`/`seek`. If not, it emits `request_action`.

---

## 4. How WebSockets fit the flow (one-paragraph answer)

> The HTTP API only creates rooms. Everything after that goes over one persistent WebSocket per tab. Each room is a Socket.IO channel (`room:CODE`). A client never changes playback locally. It sends an **intent** (`pause {time}`), and the server validates it, checks the sender's role, updates its authoritative playback clock (`{videoId, playing, position, updatedAt, seq}`), and broadcasts `sync_state` to the whole channel. Each client converts that state into "where should the video be *right now*" using its estimated server-clock offset, and seeks if it's off by more than 0.75s. Late joiners get a full snapshot in the `join_room` acknowledgement, and reconnects re-join with a session token.

---

## 5. Likely questions

**Why server-authoritative instead of peer-to-peer?** One source of truth avoids conflicts when two people press play at the same moment, and it's the only place permissions can actually be enforced.

**How do you avoid echo loops (player event → emit → broadcast → player event)?** The iframe never receives user input: native controls are off and a transparent click shield covers it. Only *our* transport bar emits. Player state changes are never re-broadcast.

**What happens if a client lies about its role?** Nothing. The server ignores client-claimed roles. The role comes from the server-side `Participant` looked up from `socket.data`, and `Room` re-checks `can()` on every action.

**How do you handle network latency?** Playback is stamped with server time (`updatedAt`). Clients estimate their clock offset, so a 200 ms delay still lands at the correct frame. The `seq` counter discards out-of-order updates.

**What about buffering, ads, or background tabs?** The drift loop runs every second and on `visibilitychange`, so any client that fell behind seeks back into sync.

**How would you scale to multiple servers?** Use the Socket.IO Redis adapter for cross-instance broadcasts, and move room state into Redis (or use sticky sessions keyed by room). Persistence already sits behind the `RoomRepository` interface.

**Security and abuse?** zod schemas on every payload, per-connection rate limits (`util/rateLimiter.ts`), a 16 KB max message size, unguessable session tokens, and banned tokens for removed users.

**How is it tested?** `server/test/room.test.ts` covers domain rules (permissions, clock math, requests). `server/test/gateway.test.ts` starts a real server and connects real `socket.io-client`s to test join, sync, the request/approve flow, and kicks end to end.
