# CollabDocs — Project Overview

Google Docs-style collaborative rich-text editor. Built as a 7-day (~2h/day) learning project by a frontend engineer moving to full stack.

## Status
Only the Vite + React starter exists. Everything in these specs is **planned, not implemented**.

## Stack
| Layer | Choice |
|---|---|
| Client | React 19, TypeScript, Vite, Tiptap (Collaboration + CollaborationCursor) |
| Server | Node.js, Express, TypeScript, Socket.IO |
| Data | PostgreSQL via Prisma |
| Realtime | Yjs CRDT over a custom Socket.IO provider |
| Auth | Email/password + Google OAuth, httpOnly cookie session |
| Validation / tests | Zod; Vitest, Supertest, Playwright |

## Repository layout (target)
npm workspaces: `client/` (current Vite app moves here), `server/`, `.claude/specs/`.

## Spec index
- `01-requirements.md` — scope, user stories, non-functional needs
- `02-architecture.md` — data flow, auth, permissions, API and socket contracts, risks
- `03-database-design.md` — Prisma schema and persistence strategy
- `04-implementation-plan.md` — daily milestones and testing

## Decisions (approved)
- Prisma as the ORM.
- Google OAuth added alongside email/password.
- Share links require an account (no anonymous access).
- Local development first, with brief deploy notes.
- Custom Socket.IO Yjs provider (not `y-websocket`).
- Frontend moves to `client/`.
- Latest state only; no version history.
- REST is prefixed `/api`; Google OAuth and share-link mode are cuttable late milestones (see plan).

## Google OAuth setup (manual, one-time)
Create an OAuth client in Google Cloud Console (type: Web). Authorized redirect URI: `http://localhost:5173/api/auth/google/callback` (through the Vite proxy; always use `localhost`, not `127.0.0.1`). Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` in `server/.env`; the redirect URI is read from env, never derived from the request Host.

## Dev topology and deployment
Dev: Vite (`:5173`) proxies `/api` and `/socket.io` (WebSocket) to the server (`:4000`), so the browser sees one origin. Postgres runs via `docker-compose.yml`. Production client and API must be same-site (one reverse proxy), otherwise the SameSite=Lax cookie breaks.
