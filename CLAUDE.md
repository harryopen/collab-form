# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

`collabdoc` is currently the unmodified Vite + React + TypeScript starter template (`src/App.tsx` is still the demo page, no routing, state management, backend, or collaboration code yet). Update this file as real architecture emerges.

## Commands

- `npm run dev` — start the Vite dev server (HMR)
- `npm run build` — type-check (`tsc -b`) then `vite build`
- `npm run lint` — ESLint over the whole repo
- `npm run preview` — serve the production build

No test runner is configured. There is no git repository initialized.

## Stack notes

- React 19, TypeScript ~6.0, Vite 8 with `@vitejs/plugin-react` (Oxc-based; React Compiler is not enabled).
- ESLint uses flat config (`eslint.config.js`) with `typescript-eslint`, `react-hooks`, and `react-refresh` plugins.
- TypeScript is split into project references: `tsconfig.app.json` (code in `src/`) and `tsconfig.node.json` (Vite config), referenced from `tsconfig.json`. This is why `build` uses `tsc -b`.
