# Implementation Plan (7 days, ~2h/day)

Each day ends with something runnable and a commit.

| Day | Goal | Done when |
|---|---|---|
| 1 | Move Vite app to `client/`; create `server/` (Express + TS); Postgres; Prisma schema + first migration; `/health` | `npm run dev` starts both; migration applied |
| 2 | Email/password auth, session cookie middleware, `/auth/me`; login/signup UI | Login survives reload; logout works |
| 3 | Documents CRUD + `getRole`; documents list UI, editor page shell | CRUD respects roles; create/rename/delete in the UI |
| 4 | **Collab slice:** storage + compaction, registry, socket server, Tiptap editor + custom provider | Same user in two tabs converges; content survives server restart |
| 5 | Members API, share dialog, awareness (cursors), viewer enforcement, live revocation | Viewer cannot edit even via raw socket; revoke removes within 1 s |
| 6 | Hardening: security/acceptance tests, optional Playwright smoke; then cuttable: share-link mode, Google OAuth | Test suite green |
| 7 | README + deploy notes | README run instructions verified from a clean clone |

Days are budgets, not gates; milestone order in `.claude/plan/implementation-plan.md` is authoritative.

## Testing
- **Unit (Vitest):** `getRole` matrix, compaction.
- **API (Supertest, test DB):** auth, CRUD, member management, 401/403 paths.
- **Sync:** two `socket.io-client` instances converge; viewer updates are rejected; reconnect re-syncs; revoked user is removed.
- **E2E (Playwright, one smoke test):** two browser contexts edit the same document.
- Google OAuth is verified manually (not automated).

## Definition of done
All MVP items in `01-requirements.md` work locally, tests above pass, and README documents setup (including Google credentials).
