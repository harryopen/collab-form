# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

CollabDocs (Google Docs-style collaborative editor) is being built from the plan in `.claude/plan/implementation-plan.md`, with specs in `.claude/specs/`. Milestone order and task IDs live in the plan; check it before starting work. Currently only task 1.1 is done: the Vite starter lives in `client/` and is otherwise unmodified (`client/src/App.tsx` is still the demo page). `server/` and `e2e/` do not exist yet. Update this file as real architecture emerges (task 7.3).

## Layout

npm workspaces monorepo; `client/` is the only workspace so far (`server/` and `e2e/` are added by later tasks). Run installs from the repo root.

## Commands (from the repo root)

- `npm run dev` — start the client Vite dev server (HMR)
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
