# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

CollabDocs (Google Docs-style collaborative editor) is being built from the plan in `.claude/plan/implementation-plan.md`, with specs in `.claude/specs/`. Milestone order and task IDs live in the plan; check it before starting work. Task status lives in `.claude/progress.md`: after every commit, tick the completed task(s) there (with the commit hash) and include that update in the work. Done so far: 1.1 (Vite starter moved to `client/`, still the unmodified demo page) and 1.2 (`server/` Express + TS skeleton with `GET /api/health`). `e2e/` does not exist yet. Update this file as real architecture emerges (task 7.3).

## Layout

npm workspaces monorepo; Workspaces: `client/`, `server/` (`e2e/` comes later). Server config is Zod-validated in `server/src/config/env.ts` and fails fast; copy `server/.env.example` to `server/.env`. `app.ts` is the Express factory (testable without listening); `index.ts` bootstraps the HTTP server. Run installs from the repo root.

## Commands (from the repo root)

- `npm run dev -w client` / `npm run dev -w server` — Vite dev server (HMR) / `tsx watch` API on :4000 (root `npm run dev` still starts only the client until task 1.4)
- `docker compose up -d` — Postgres 17 (dev DB `collabdocs`, test DB `collabdocs_test`); `npm run db:migrate -w server` applies/creates Prisma migrations (client is generated on `npm install` into gitignored `server/src/generated`)
- `npm run build` — type-check (`tsc -b`) then `vite build`, in every workspace
- `npm run lint` — ESLint in every workspace
- Single workspace: `npm run <script> -w client`

No test runner is configured yet.

## Stack notes

- React 19, TypeScript ~6.0, Vite 8 with `@vitejs/plugin-react` (Oxc-based; React Compiler is not enabled).
- ESLint uses flat config (`client/eslint.config.js`) with `typescript-eslint`, `react-hooks`, and `react-refresh` plugins.
- TypeScript in `client/` is split into project references: `tsconfig.app.json` (code in `src/`) and `tsconfig.node.json` (Vite config), referenced from `tsconfig.json`. This is why `build` uses `tsc -b`.
- Node >= 20 (`engines`); developed on Node 24.
- `.env*` files are gitignored except `.env.example`.
