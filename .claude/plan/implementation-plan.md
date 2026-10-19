# CollabDocs — Technical Implementation Plan

Derived from `.claude/specs/00–04`. Nothing here is implemented yet. Package versions and library APIs below are the plan's assumptions; **verify them against the installed versions** when each task starts.

## 0. Conflicts and missing decisions

Resolve these before (or at the start of) implementation. "Default" is what I'll do unless told otherwise.

| # | Issue | Where | Default |
|---|---|---|---|
| D1 | **Route clash.** Specs use unprefixed REST paths (`/documents`, `/auth/login`), but the client will also have a `/documents` page. A dev proxy cannot tell them apart. | 02 | Prefix all REST with `/api` (`/api/documents`, `/api/auth/login`). Update spec 02. |
| D2 | **OAuth redirect URI** is `localhost:4000/auth/google/callback` in spec 00. With the `/api` prefix and a Vite proxy it becomes a different URI, and it must match Google Cloud Console exactly. | 00 | `http://localhost:5173/api/auth/google/callback` (through the proxy), then redirect to `/`. Update spec 00. |
| D3 | **Dev topology.** Specs mention a CORS allowlist, but not whether the client proxies to the server. | 02 | Vite proxies `/api` and `/socket.io` (with WS) to `:4000`, so the browser sees one origin. Keep a CORS allowlist for production/direct use. |
| D4 | **Postgres setup** is unspecified (local install vs Docker). | 00 | `docker-compose.yml` with Postgres. Needs Docker on your machine; otherwise tell me your local setup. |
| D5 | **Client libraries beyond the stack:** router and server-state handling are not specified. | 00 | `react-router-dom` + `@tanstack/react-query`. Auth state in a React Context. Editor state lives in Yjs/Tiptap, not React state. |
| D6 | **Migration split.** Spec 04 says Day 1 creates "the first migration". Creating all tables on Day 1 would be untestable. | 03/04 | Three migrations, added as needed: `001_users_auth` (Day 1), `002_documents_members` (Day 3), `003_collab_storage` (Day 5). |
| D7 | **Tiptap naming.** Specs say `CollaborationCursor`. In Tiptap v3 it is `@tiptap/extension-collaboration-caret`. Also, with Collaboration, the default undo/redo in StarterKit must be disabled (`history` in v2, `undoRedo` in v3). | 00 | Use whichever the installed major provides. Check at install. |
| D8 | **Viewers and awareness.** Spec says viewers cannot edit; it doesn't say whether they appear in presence. | 01 | Viewers may send awareness (visible in presence/cursors) but never document updates. |
| D9 | **Link-opened documents in the list.** Share-link access is a role derived from `shareMode`, with no membership row, so the doc wouldn't appear in "shared with me". | 01/03 | Not listed; reachable only via the link. |
| D10 | **Inviting unknown emails.** Spec 02 says the user must already exist. | 02 | `POST members` returns 404 `USER_NOT_FOUND`; UI says "they need to sign up first". |
| D11 | **Session details** (JWT lifetime, password rules, logout semantics) unspecified. | 02 | JWT 7 days, httpOnly + SameSite=Lax + Secure in prod; password ≥ 8 chars; logout clears the cookie (no server-side revocation). |
| D12 | **Update persistence frequency.** Spec 02 appends every update to Postgres. Per-keystroke inserts are chatty. | 02 | Follow the spec (insert per update). Revisit with a short batching buffer only if testing shows a problem. |
| D13 | **Ports.** Only `4000` is mentioned. | — | Server `4000`, client `5173`. |
| D14 | **Node version** unknown. | — | Check `node -v` at T1.1; require ≥ 20 in `engines`. |

**Review round (approved):** D1–D14 defaults accepted, plus the following. Specs 00, 01, 02, 04 were updated to match.

| # | Decision | Resolution |
|---|---|---|
| D15 | CSRF | Origin allowlist on non-GET + JSON-only content type; same Origin check in the socket handshake; no tokens; no state-changing GETs |
| D16 | Google vs existing password account | No auto-link; reject `ACCOUNT_EXISTS` (changes spec 01) |
| D17 | Persistence order | Apply (try/catch) → insert → broadcast; on insert failure evict the doc, `doc:error`, clients re-join |
| D18 | Role check per `doc:update` | DB lookup each update; cache only if measured slow |
| D19 | Awareness identity | Server-stamped name/colour from the session |
| D20 | Rate limiting + helmet | Added to 2.2 (auth endpoints limited) |
| D21 | Sync handshake | `doc:join {documentId, stateVector}` → `doc:sync {diff, serverSV}` → client sends diff vs serverSV; editor read-only until first sync |
| D22 | Test DB | Serial server tests (`fileParallelism: false`); `collabdocs_test` created by Docker init; set up via `migrate deploy` |
| D23 | Deployment | Production client and API must be same-site behind one reverse proxy |
| D24 | Scheduling | Order below; share-link (6.4) and Google (3.1, 3.2) are cuttable late slots |

Further rules: no access → 404, insufficient role → 403 on all document routes; `next=` accepts only paths starting with a single `/`; JWT algorithm pinned to HS256; `GOOGLE_REDIRECT_URI` read from env; socket events require the socket to have joined that document; expiry enforced on live sockets.

## 1. Repository structure (target)

```
collabdoc/
├─ package.json            # npm workspaces: client, server, e2e; root scripts
├─ docker-compose.yml      # Postgres (pending D4)
├─ CLAUDE.md               # update after T1.1 and T7.3
├─ .claude/{specs,plan}/
├─ client/
│  ├─ index.html  vite.config.ts  tsconfig*.json  eslint.config.js
│  └─ src/
│     ├─ main.tsx  App.tsx            # providers + routes
│     ├─ api/        http.ts auth.ts documents.ts members.ts
│     ├─ auth/       AuthProvider.tsx useAuth.ts RequireAuth.tsx
│     ├─ pages/      LoginPage SignupPage DocumentsPage EditorPage NotFoundPage
│     ├─ components/ DocumentList NewDocumentButton ShareDialog MemberRow PresenceBar EditorToolbar TitleInput ConnectionStatus
│     └─ editor/     extensions.ts SocketIOProvider.ts useCollabEditor.ts colors.ts
├─ server/
│  ├─ package.json  tsconfig.json  vitest.config.ts  .env.example
│  ├─ prisma/        schema.prisma  migrations/
│  ├─ src/
│  │  ├─ index.ts            # HTTP + Socket.IO bootstrap
│  │  ├─ app.ts              # Express app factory (testable without listen)
│  │  ├─ config/env.ts       # Zod-parsed env
│  │  ├─ db/prisma.ts
│  │  ├─ middleware/         auth.ts validate.ts error.ts requireRole.ts
│  │  ├─ permissions/getRole.ts
│  │  ├─ modules/auth/       routes.ts service.ts session.ts google.ts password.ts
│  │  ├─ modules/documents/  routes.ts service.ts schemas.ts
│  │  ├─ modules/members/    routes.ts service.ts schemas.ts
│  │  └─ realtime/           socket.ts handshake.ts handlers.ts registry.ts persistence.ts
│  └─ test/                  helpers + *.test.ts
└─ e2e/                      playwright config + specs
```

## 2. Frontend design

**Routes:** `/login`, `/signup`, `/` (documents list, protected), `/d/:id` (editor, protected), `*` (not found).

**State approach**
- Auth: `AuthProvider` calls `GET /api/auth/me` on mount; exposes `user`, `loading`, `login`, `signup`, `logout`. `RequireAuth` redirects to `/login?next=…` (so share links survive login).
- Server data (documents, members): TanStack Query with invalidation after mutations.
- Document content and presence: Yjs `Y.Doc` and `Awareness`, owned by `useCollabEditor`. Not duplicated into React state.

**Key components:** `EditorToolbar` (headings, bold, italic, underline, lists, link), `TitleInput` (debounced PATCH), `PresenceBar` (avatars from awareness), `ShareDialog` (add member, change role, remove, share mode), `ConnectionStatus` (connected / reconnecting / read-only).

## 3. Backend design

**Modules:** auth, documents, members (REST); realtime (sockets); permissions (`getRole`, shared by both).

**Auth flow**
- *Email/password:* Zod-validate → argon2 hash/verify → sign JWT `{sub: userId}` → set httpOnly cookie.
- *Google (cuttable, D16):* `GET /api/auth/google` generates `state`, stores it in a 10-minute httpOnly SameSite=Lax cookie scoped to the OAuth path, redirects to Google. Callback handles `error=access_denied`, verifies `state`, exchanges code with `google-auth-library`, verifies the ID token (`aud`, `email_verified`), then: (1) find `AuthAccount(google, sub)` → log in; else (2) `User` with that email exists → reject `ACCOUNT_EXISTS`; else (3) create `User` + `AuthAccount`. Set cookie, redirect to `/`. Redirect URI from env; use `localhost` consistently.
- *CSRF (D15):* middleware rejects non-GET requests whose `Origin` is not in `CLIENT_ORIGINS` and requires `application/json`. Cookie: httpOnly, SameSite=Lax, `Secure` in production, JWT HS256 pinned.
- *Hardening (D20):* `helmet`; `express-rate-limit` on signup/login.
- *Sockets:* handshake middleware parses the same cookie, verifies the JWT, attaches `socket.data.userId`.

**API contract:** as in spec 02, with the `/api` prefix (D1). Error shape `{ error: { code, message } }`; codes: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `EMAIL_TAKEN`, `INVALID_CREDENTIALS`, `USER_NOT_FOUND`. Existence-hiding: a document the user cannot access returns `404`, not `403`, on GET.

## 4. Database and migrations

Schema as in spec 03. Order: `001_users_auth` (User, AuthAccount) → `002_documents_members` (Document, DocumentMember, `ShareMode` and `Role` enums) → `003_collab_storage` (DocumentSnapshot, DocumentUpdate). Yjs binary goes in `Bytes` columns. Tests use a separate database (`collabdocs_test`), reset between test files.

## 5. How Tiptap, Yjs and Socket.IO fit together

**Client**
- `SocketIOProvider` owns a `Y.Doc`, an `Awareness` (from `y-protocols`) and the socket. It exposes `.document` and `.awareness`, which is what Tiptap's Collaboration and caret extensions need.
- The Tiptap `Collaboration` extension binds the editor to `provider.document` (a `Y.XmlFragment`, e.g. `"default"`). The caret extension binds to `provider.awareness`.
- Local edits: `ydoc.on('update', (u, origin) => origin !== provider && emit('doc:update', u))`. Remote updates are applied with `Y.applyUpdate(ydoc, u, provider)`, so they are not echoed back.
- On `connect` (including reconnects) the provider emits `doc:join {documentId, stateVector}`; on `doc:sync {update, stateVector}` it applies the diff and replies with `encodeStateAsUpdate(ydoc, serverSV)` (D21). The editor is non-editable until the first sync; the client never sets initial content; emits are gated on the synced state (no buffered emits before re-join).

**Server**
- `registry`: `Map<documentId, { ydoc, awareness, sockets, loading }>`. Loads share one in-flight promise (avoids two loads racing). Idle entries (no sockets) are compacted and evicted.
- `doc:join`: `getRole` → null ⇒ `doc:error`; else record in `socket.data.joined`, join the room, send `doc:sync` (diff + server state vector).
- `doc:update`: payload shape/size validated; socket must have joined the doc; `getRole` allows editing (DB lookup, D18); apply to the server `ydoc` in try/catch; `INSERT DocumentUpdate`; broadcast excluding the sender. Insert failure ⇒ evict the registry entry, `doc:error` to the room, clients re-join (D17). Token expiry is checked here too.
- Compaction (per-document mutex): read `maxId` → encode the in-memory ydoc → one transaction: upsert snapshot, delete `id <= maxId`. Safe because updates are applied in memory before they are inserted. Never compact a deleted document; document delete first disconnects its sockets and drops the registry entry.
- Awareness: a server-side `Awareness` per document; name/colour stamped from the session, client-supplied identity ignored (D19); track which client IDs each socket controls; on disconnect remove them and broadcast, so ghost cursors don't linger. Payload size capped.
- Socket.IO: handshake checks `Origin` and the cookie JWT; `maxHttpBufferSize` set deliberately.
- Permission changes: a service call from the members/documents routes asks the registry to re-evaluate affected sockets (D8 behaviour for viewers; removed users are dropped from the room).

**Yjs hygiene:** one copy of `yjs` across workspaces (duplicates break Yjs); updates are `Uint8Array`, not JSON.

## 6. Implementation tasks

Format: **Files** · **Needs** (prerequisites) · **Verify**. Task IDs are stable (`<n>.<n>`); the sections below keep their original numbering, but **execution order is this table**. Package installs happen only when a task begins, with your approval. Days are budgets, not gates.

| Order | Milestone | Tasks | Working result |
|---|---|---|---|
| A | Foundation | 1.1–1.5 | Both apps start, DB migrated, test harness runs |
| B | Auth | 2.1–2.4 | Signup/login/logout survive reload |
| C | Documents | 3.3, 3.4, 4.1, 4.2 | Create/list/rename/delete in the UI |
| D | **Collab slice** | 5.1, 5.2, 5.3, 5.4 (includes the toolbar/editor from 4.3), 5.5 | Same user, two tabs: converge, survive server restart |
| E | Sharing + enforcement | 3.5, 6.2, 6.3, 6.1 | Two users collaborate; viewer blocked server-side; revocation within 1 s; cursors |
| F | Hardening | 7.2 + security/acceptance tests (§10), 7.1 optional | Suite green |
| G | Cuttable | 6.4, then 3.1, 3.2 | Share-link access, then Google login |
| H | Docs | 7.3 | README verified from a clean clone |

Notes: 4.3 is folded into 5.4 (no standalone unsaved editor). 6.3 no longer needs 6.2 (tests call the service directly). `next=` handling (validated) moves into 2.3/2.4. Share-link `getRole` tests move into 3.3/3.4; `getRole` treats `shareMode` as OFF until 6.4.

### M1 — Foundation (Day 1)

**1.1 Workspace restructure.** *Files:* move `src/ public/ index.html vite.config.ts tsconfig*.json eslint.config.js` and the client deps into `client/`; new root `package.json`; modified `CLAUDE.md`, `.gitignore` (add `.env`). *Needs:* D14 answered, clean git state (commit specs first). *Verify:* `npm install`; `npm run dev -w client` shows the starter page; `npm run build -w client` and `npm run lint` pass.

**1.2 Server skeleton.** *Files:* `server/package.json tsconfig.json src/index.ts src/app.ts src/config/env.ts .env.example`. *Needs:* 1.1. *Verify:* `npm run dev -w server`; `curl localhost:4000/api/health` → `{"status":"ok"}`; missing env var fails fast with a clear message.

**1.3 Postgres + Prisma.** *Files:* `docker-compose.yml`, `server/prisma/schema.prisma` (User, AuthAccount), migration `001`, `src/db/prisma.ts`; `/api/health` also runs `SELECT 1`. *Needs:* 1.2, D4. *Verify:* `docker compose up -d`; `prisma migrate dev` applies; `prisma studio` shows both tables; health reports `db: "ok"`.

**1.4 Dev orchestration + proxy.** *Files:* root `package.json` scripts, `client/vite.config.ts` (proxy `/api`, `/socket.io` with `ws: true`). *Needs:* 1.3, D1/D3. *Verify:* one command starts both; the client fetching `/api/health` through `:5173` returns ok.

**1.5 Test infrastructure.** *Files:* `server/vitest.config.ts` (`fileParallelism: false`), `server/test/helpers.ts` (app factory, DB reset), `.env.test`, Docker init script creating `collabdocs_test`. *Needs:* 1.3. *Verify:* a trivial health test passes against `collabdocs_test`; `prisma migrate deploy` succeeds on an empty database.

### M2 — Email/password auth (Day 2)

**2.1 Server plumbing.** *Files:* `middleware/error.ts validate.ts auth.ts`, `modules/auth/session.ts`. *Needs:* 1.5. *Verify:* unit tests: JWT sign/verify, expired/tampered token rejected; invalid body → `VALIDATION_ERROR`.

**2.2 Auth routes.** *Files:* `modules/auth/{routes,service,password}.ts`, `middleware/csrf.ts` (Origin + JSON check), `helmet`, `express-rate-limit` on signup/login, wire in `app.ts`. *Needs:* 2.1. *Verify:* Supertest: signup → 201 + cookie with HttpOnly/SameSite=Lax flags; duplicate email → `EMAIL_TAKEN`; wrong password → `INVALID_CREDENTIALS`; `/me` with and without cookie; logout clears it; non-GET with a bad `Origin` or form content type → rejected; repeated failed logins → 429. Manual: `curl -c jar` flow.

**2.3 Client scaffolding.** *Files:* `main.tsx App.tsx api/http.ts api/auth.ts auth/*`, deps `react-router-dom @tanstack/react-query`. *Needs:* 2.2, D5. *Verify:* app loads, unknown route shows NotFound; `http.ts` surfaces the server error shape; `RequireAuth` redirects to `/login?next=…` and `next` is accepted only if it is a same-origin path starting with a single `/` (`//evil.com` and absolute URLs ignored).

**2.4 Login/Signup pages.** *Files:* `pages/LoginPage.tsx SignupPage.tsx`, `components/` form bits. *Needs:* 2.3. *Verify (manual):* sign up → lands on `/`; reload stays signed in; logout returns to `/login`; wrong password shows an error.

### M3 — Documents API (milestone C); Google OAuth is milestone G

**3.1 Google OAuth routes (milestone G, cuttable).** *Files:* `modules/auth/google.ts`, env additions (`GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`). *Needs:* 2.2, Google Cloud client created (spec 00), D2. *Verify (manual):* "Continue with Google" completes and sets the cookie; negative cases: tampered `state`, missing `state` cookie, replayed code, `error=access_denied`, wrong `aud` — all rejected with a friendly error.

**3.2 Account linking logic (milestone G, cuttable).** *Files:* `modules/auth/service.ts` (`findOrCreateGoogleUser`), unit tests. *Needs:* 3.1. *Verify:* mocked payload: new user ⇒ created; returning user ⇒ logged in; email of an existing password account ⇒ `ACCOUNT_EXISTS` (D16); `email_verified=false` ⇒ rejected.

**3.3 Documents/members migration + `getRole`.** *Files:* schema + migration `002` (includes `shareMode` column), `permissions/getRole.ts`, tests. *Needs:* 2.2. *Verify:* role matrix test (owner / editor / viewer / stranger × shareMode OFF/VIEWER/EDITOR once 6.4 lands; until then `shareMode` is treated as OFF); explicit member wins over share mode.

**3.4 Documents routes.** *Files:* `modules/documents/*`, `middleware/requireRole.ts`. *Needs:* 3.3. *Verify:* Supertest for list/create/get/patch/delete and every 401/403/404 path (no access → 404, insufficient role → 403); only the owner can change `shareMode` or delete; editor can rename.

**3.5 Members routes (milestone E).** *Files:* `modules/members/*`. *Needs:* 3.4. *Verify:* owner adds/changes/removes; non-owner gets 403; unknown email → `USER_NOT_FOUND`; cannot add the owner as a member.

### M4 — Documents UI and single-user editor (Day 4)

**4.1 Documents page.** *Files:* `pages/DocumentsPage.tsx`, `api/documents.ts`, `components/DocumentList NewDocumentButton`. *Needs:* 3.4. *Verify (manual):* create, rename, delete; shared docs show your role; empty state.

**4.2 Editor page shell.** *Files:* `pages/EditorPage.tsx`, `components/TitleInput.tsx`. *Needs:* 4.1. *Verify:* `/d/:id` shows title and role; stranger sees not-found; title edits persist after reload.

**4.3 Tiptap extensions + toolbar (folded into 5.4; no standalone unsaved editor).** *Files:* `editor/extensions.ts`, `components/EditorToolbar.tsx`; deps `@tiptap/react @tiptap/pm @tiptap/starter-kit` (+ underline/link if the installed major needs them). *Needs:* 4.2, built together with 5.4. *Verify (manual):* every toolbar format applies; viewer role ⇒ `editable: false`.

### M5 — Real-time sync and persistence (milestone D, riskiest — first vertical slice)

**5.1 Storage + compaction.** *Files:* migration `003`, `realtime/persistence.ts` (`appendUpdate`, `loadDoc`, `compact`), tests. *Needs:* 3.3. *Verify:* build a doc from updates; compaction yields identical decoded state and fewer rows; interrupted compaction leaves data intact (transaction); an update appended during compaction is not lost; a deleted document is never compacted.

**5.2 Registry.** *Files:* `realtime/registry.ts`, tests. *Needs:* 5.1. *Verify:* concurrent first joins load once; idle entry is compacted and evicted.

**5.3 Socket server.** *Files:* `realtime/{socket,handshake,handlers}.ts`, `index.ts`; deps `socket.io yjs y-protocols`. *Needs:* 5.2, 2.1. *Verify:* tests with two `socket.io-client` instances: unauthenticated rejected; stranger join ⇒ `doc:error`; A's edit reaches B; viewer's `doc:update` is rejected and not stored; `doc:update`/`doc:awareness` for a document the socket has not joined is rejected; malformed or oversized payload is rejected without crashing; a failed insert is not broadcast and evicts the doc (D17); wrong-`Origin` handshake rejected; randomized 3-client concurrent-edit test converges; p95 delivery < 300 ms locally.

**5.4 Client provider + hook.** *Files:* `editor/SocketIOProvider.ts useCollabEditor.ts`, `components/ConnectionStatus.tsx`, `EditorPage.tsx`; deps `@tiptap/extension-collaboration yjs y-protocols socket.io-client`. *Needs:* 5.3, 4.3, D7. *Verify (manual):* two browsers, same doc, typing appears in both; undo/redo only undoes your own changes; stop/start server ⇒ reconnects and converges; edits made offline for 30 s converge after reconnect; no duplicate content when two tabs open a brand-new document simultaneously; same-user two-tab test is the milestone-D acceptance (second user comes in milestone E).

**5.5 Persistence end-to-end.** *Needs:* 5.4. *Verify:* edit, restart server, reload ⇒ content restored; after > 200 updates the update table shrinks (compaction fired).

### M6 — Presence, sharing, enforcement (milestone E; 6.4 is milestone G)

**6.1 Awareness + carets.** *Files:* server awareness handling in `handlers.ts`/`registry.ts`, `editor/colors.ts`, `components/PresenceBar.tsx`, caret extension. *Needs:* 5.4, 3.5. *Verify:* two users see each other's named, coloured cursors; closing a tab removes the cursor promptly; a client sending a spoofed name/colour is overridden by the server (D19). `PresenceBar` is the first thing to cut if time is short.

**6.2 Share dialog.** *Files:* `components/ShareDialog.tsx MemberRow.tsx`, `api/members.ts`. *Needs:* 3.5, 4.2. *Verify (manual):* invite by email, change role, remove, set share mode; unknown email shows D10 message.

**6.3 Live permission changes.** *Files:* registry re-evaluation hook called from members/documents routes; `doc:permission-changed` handling in the client. *Needs:* 3.5, 5.3 (tests call the service directly; the UI from 6.2 is not required). *Verify:* tests: demote editor → viewer: further updates rejected within 1 s; revoke: socket removed from the room within 1 s; `shareMode` change removes/downgrades sockets whose access came only from the link (once 6.4 exists); document delete disconnects its sockets; expired JWT on a live socket is dropped. Manual: the affected browser goes read-only or is sent to the list immediately.

**6.4 Share-link access (milestone G, cuttable).** *Files:* enable `shareMode` in `getRole`; the client `next=` handling already exists from 2.3. *Needs:* 6.3. *Verify:* with `shareMode=VIEWER`, a logged-in stranger can open `/d/:id` read-only; with `OFF` they get not-found; logged-out ⇒ login ⇒ back to the doc.

### M7 — Hardening and docs (milestones F and H)

**7.1 E2E smoke test (optional, first to cut).** *Files:* `e2e/playwright.config.ts`, `e2e/collab.spec.ts`; dep `@playwright/test`. *Needs:* M6. *Verify:* two browser contexts (users seeded via API) edit one document and converge.

**7.2 Gap fill.** Loading/error states, empty states, fix findings from test runs. *Verify:* full test suite green; `npm run lint` and `npm run build` clean.

**7.3 Docs.** *Files:* `README.md`, `server/.env.example`, `CLAUDE.md` (real commands/architecture), deploy notes. *Verify:* follow the README from a clean clone ⇒ app runs.

## 7. Milestone acceptance summary

| Milestone (execution order) | Accepted when |
|---|---|
| A (1.1–1.5) | Both apps start with one command; `migrate deploy` works on an empty DB; health reports DB ok; test harness runs serially |
| B (2.x) | Signup/login/logout survive reload; auth tests incl. cookie flags, bad Origin, rate limit pass |
| C (3.3, 3.4, 4.1, 4.2) | Role matrix and document endpoints tested incl. 404-vs-403; documents list/CRUD in the UI |
| D (5.x) | Same user, two tabs: convergence, formatting, p95 < 300 ms, offline-30 s reconnect, restart persistence, compaction invariants, randomized 3-client test |
| E (3.5, 6.1–6.3) | Two users collaborate; viewer enforced server-side; revocation/downgrade within 1 s; spoofed awareness overridden |
| F | Full suite green; lint and build clean; E2E if kept |
| G (6.4, 3.1, 3.2) | Share-link access works (or deferred); Google login works incl. negative cases (or deferred) |
| H (7.3) | README verified from a clean clone |

## 8. Dependencies

- **Server:** `express zod argon2 jsonwebtoken cookie-parser cors helmet express-rate-limit google-auth-library socket.io yjs y-protocols @prisma/client dotenv`; dev: `typescript tsx prisma vitest supertest socket.io-client @types/*`.
- **Client:** `react-router-dom @tanstack/react-query socket.io-client yjs y-protocols @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-collaboration` + the caret extension (D7).
- **Root/dev:** `concurrently` (or equivalent) for the `dev` script; `@playwright/test`.
- **External:** Docker (D4), a Google Cloud OAuth client (before 3.1), Node ≥ 20 (D14).
- Check the installed Prisma major's setup requirements (newer majors may need a `prisma.config.ts` and/or a driver adapter) at task 1.3.

## 9. Technical risks

| Risk | Mitigation |
|---|---|
| Custom provider bugs (echo loops, missed syncs) | Origin tagging; test the provider with two plain clients before the UI (5.3); fallback: `y-websocket` (a spec-approved alternative would need your say-so) |
| Duplicate `yjs` copies break the editor | Workspaces dedupe; add a check (`npm ls yjs`) in 5.4 |
| Schedule overload | Google (3.1, 3.2) and share-link (6.4) are late cuttable milestones (G) |
| Update table growth | Compaction on threshold and on last-leave (5.1, 5.5) |
| Ghost cursors | Server-side awareness with per-socket client ID tracking |
| Revocation gaps | Role re-check on every `doc:update` plus eviction (6.3) |
| OAuth misconfiguration | Single env-driven redirect URI (D2); `state` check; manual checklist in README |
| Load race on first join | Shared loading promise in the registry |
| Tiptap/Prisma major-version differences from this plan | D7 and the Prisma check; verify before coding each affected task |
| Single-process memory model | Accepted for MVP; idle eviction |

## 10. Test plan summary

- **Unit (Vitest):** session tokens, `getRole` matrix, Google linking, compaction (identical decoded state, fewer rows, concurrent append not lost).
- **Security:** cookie flags, bad `Origin` rejected on REST and socket handshake, non-JSON content type rejected, auth rate limit, `next=` open-redirect cases, OAuth negative cases.
- **Property/performance:** randomized 3-client convergence; offline-30 s reconnect; p95 delivery < 300 ms; revocation within 1 s.
- **API (Supertest + test DB):** auth, documents, members, every 401/403/404 path.
- **Realtime (Vitest + socket.io-client):** auth handshake, join authorization, convergence, viewer rejection, persistence failure, reconnect re-sync, revocation.
- **E2E (Playwright):** two-user editing smoke test.
- **Manual:** Google OAuth, visual cursor behaviour, toolbar formatting.
