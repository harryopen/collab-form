# Architecture

## Components
Browser (React + Tiptap + Y.Doc) ⇄ HTTP/JSON and Socket.IO ⇄ Express server (REST + socket handlers + in-memory Y.Doc registry) ⇄ PostgreSQL (Prisma).

## Edit data flow
1. Tiptap edit → local Y.Doc produces a binary update.
2. Client emits `doc:update` over the socket.
3. Server checks the socket has joined that document and that `getRole` (a DB lookup per update) allows editing; otherwise drops the update.
4. Server applies it to the in-memory Y.Doc inside try/catch (a malformed update is neither stored nor crashes the process), appends it to `DocumentUpdate`, then broadcasts to the other clients in the room. If the insert fails, the registry entry is evicted, the room gets `doc:error`, and clients re-join (memory and DB must not diverge).
5. Awareness (cursor, colour) is relayed only, never persisted. The server stamps name and colour from the session, ignoring client-supplied identity.

**Join / sync:** client emits `doc:join {documentId, stateVector}` → server authorizes, loads (or reuses) the Y.Doc from snapshot + later updates, replies `doc:sync {update: diff, stateVector: serverSV}` → client applies it and replies with `doc:update` of `encodeStateAsUpdate(ydoc, serverSV)`. The editor is non-editable until the first sync, and the client never sets initial content. Emits are gated on the synced state (no buffered emits before re-join after reconnect).

**Compaction:** after N updates (e.g. 200) or on last client leaving, under a per-document mutex: read `maxId`, encode the in-memory Y.Doc, then in one transaction write the snapshot and delete rows with `id <= maxId` (safe because updates are applied in memory before being inserted). Never compact a deleted document. Evict idle Y.Docs from memory.

**Document delete:** disconnect its sockets and drop its registry entry first.

**Limits:** socket payloads are Zod/shape-validated and size-capped; `maxHttpBufferSize` is set deliberately (default 1 MB).

## Authentication
- All REST paths below are served under the `/api` prefix.
- Email/password: argon2 hash; login sets a signed JWT (HS256 pinned, 7 days) in an httpOnly, SameSite=Lax cookie (`Secure` in production). No server-side revocation; expiry is also enforced on live sockets.
- Google (cuttable): `GET /api/auth/google` redirects (random `state` in a 10-minute httpOnly SameSite=Lax cookie scoped to the OAuth path); the callback verifies `state` and the ID token `aud`, handles `error=access_denied`, exchanges the code via `google-auth-library`, then: existing `AuthAccount` → log in; email belongs to a password account → reject `ACCOUNT_EXISTS`; else create `User` + `AuthAccount`. Sets the same session cookie, redirects to `/`. Redirect URI comes from env.
- Socket.IO reads the same cookie during the handshake and checks `Origin`; unauthenticated or wrong-origin sockets are rejected.
- CSRF: no tokens. Non-GET requests with an `Origin` outside the allowlist are rejected, and only `Content-Type: application/json` is accepted. No state-changing GETs.
- Post-login `next=` redirects accept only same-origin paths starting with a single `/`.
- Auth endpoints are rate-limited; `helmet` is enabled.
- Error rule: no access → 404, insufficient role → 403, on every document route.
- CORS: client origin allowlist with credentials.

## Authorization
One function `getRole(userId, documentId)` returns owner | editor | viewer | null. It resolves the explicit `DocumentMember` first, then the document's share-link mode. It is used by REST middleware and by every socket event. When membership or the share mode changes, the server emits `doc:permission-changed` and re-evaluates/evicts affected sockets (including those whose access came only from the share link).

## REST contract (JSON; Zod-validated; errors `{ error: { code, message } }`)
| Method & path | Notes |
|---|---|
| POST `/auth/signup`, `/auth/login`, `/auth/logout` | |
| GET `/auth/me` | current user or 401 |
| GET `/auth/google`, `/auth/google/callback` | OAuth redirect flow |
| GET `/documents` | owned + shared, with role |
| POST `/documents` | create |
| GET `/documents/:id` | metadata + caller's role |
| PATCH `/documents/:id` | title (owner/editor); `shareMode` (owner) |
| DELETE `/documents/:id` | owner |
| GET/POST `/documents/:id/members` | owner; POST body `{email, role}` (user must already exist) |
| PATCH/DELETE `/documents/:id/members/:userId` | owner |

## Socket contract
Client → server: `doc:join`, `doc:update`, `doc:awareness`, `doc:leave`.
Server → client: `doc:sync`, `doc:update`, `doc:awareness`, `doc:permission-changed`, `doc:error`.
Updates and sync payloads are `Uint8Array`.

## Risks
| Risk | Mitigation |
|---|---|
| Custom Yjs provider is the hardest piece | Built in the first vertical slice (milestone D); test against two socket clients first; fall back to `y-websocket` if blocked (needs approval) |
| Update log grows unbounded | Compaction + test |
| Revocation while connected | `permission-changed` handling + test |
| Reconnect / lost updates | State-vector re-sync on every reconnect |
| OAuth redirect/`state` mistakes | Fixed redirect URI via env; verify `state` |
| Single-process memory registry | Accepted for MVP; eviction of idle docs |
| Schedule overload | Google OAuth and share-link mode are late, cuttable milestones |
