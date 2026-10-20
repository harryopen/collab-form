# CollabDocs — Progress

Tracks tasks from `.claude/plan/implementation-plan.md`. After every commit, tick the task(s) it completed and note the commit hash.

Execution order: A → B → C → D → E → F → G → H.

## A — Foundation
- [x] 1.1 Workspace restructure (`8700a4a`)
- [x] 1.2 Server skeleton (`4758dfe`)
- [x] 1.3 Postgres + Prisma (`4758dfe`)
- [x] 1.4 Dev orchestration + proxy (uncommitted)
- [ ] 1.5 Test infrastructure

## B — Auth
- [ ] 2.1 Server plumbing
- [ ] 2.2 Auth routes
- [ ] 2.3 Client scaffolding
- [ ] 2.4 Login/Signup pages

## C — Documents
- [ ] 3.3 Documents/members migration + `getRole`
- [ ] 3.4 Documents routes
- [ ] 4.1 Documents page
- [ ] 4.2 Editor page shell

## D — Collab slice
- [ ] 5.1 Storage + compaction
- [ ] 5.2 Registry
- [ ] 5.3 Socket server
- [ ] 5.4 Client provider + hook (includes 4.3 toolbar/editor)
- [ ] 5.5 Persistence end-to-end

## E — Sharing + enforcement
- [ ] 3.5 Members routes
- [ ] 6.2 Share dialog
- [ ] 6.3 Live permission changes
- [ ] 6.1 Awareness + carets

## F — Hardening
- [ ] 7.2 Gap fill + security/acceptance tests
- [ ] 7.1 E2E smoke test (optional)

## G — Cuttable
- [ ] 6.4 Share-link access
- [ ] 3.1 Google OAuth routes
- [ ] 3.2 Account linking logic

## H — Docs
- [ ] 7.3 README, `.env.example`, CLAUDE.md
