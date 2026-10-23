# CollabDocs — Progress

Tracks tasks from `.claude/plan/implementation-plan.md`. After every commit, tick the task(s) it completed and note the commit hash.

Execution order: A → B → C → D → E → F → G → H.

## A — Foundation
- [x] 1.1 Workspace restructure (`8700a4a`)
- [x] 1.2 Server skeleton (`4758dfe`)
- [x] 1.3 Postgres + Prisma (`4758dfe`)
- [x] 1.4 Dev orchestration + proxy (`152dd21`)
- [x] 1.5 Test infrastructure (`c9e9881`)

## B — Auth
- [x] 2.1 Server plumbing (`c3b7fae`, merged in PR #2)
- [x] 2.2 Auth routes (`832091b`, merged in PR #3)
- [x] 2.3 Client scaffolding (`222c8e4`)
- [x] 2.4 Login/Signup pages (`fd545c6`)

## C — Documents
- [x] 3.3 Documents/members migration + `getRole` (`8340310`)
- [x] 3.4 Documents routes (`8340310`)
- [ ] 4.1 Documents page
- [ ] 4.2 Editor page shell

## D — Collab slice
- [ ] 5.1 Storage + compaction
- [ ] 5.2 Registry
- [ ] 5.3 Socket server
- [ ] 5.4 Client provider + hook (includes 4.3 toolbar/editor)
- [ ] 5.5 Persistence end-to-end

## E — Sharing + enforcement
- [ ] 3.5 Members routes (implemented, uncommitted, awaiting your verification)
- [ ] 6.2 Share dialog
- [ ] 6.3 Live permission changes
- [ ] 6.1 Awareness + carets

## F — Hardening
- [ ] 7.2 Gap fill + security/acceptance tests
- [ ] 7.1 E2E smoke test (optional)

## G — Cuttable
- [ ] 6.4 Share-link access
- [x] 3.1 Google OAuth routes (`4e78576`; live Google check still needs credentials in server/.env)
- [x] 3.2 Account linking logic (`4e78576`)

## H — Docs
- [ ] 7.3 README, `.env.example`, CLAUDE.md
