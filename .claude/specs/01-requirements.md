# Requirements

## MVP
**Accounts**
- Sign up / log in with email + password.
- Sign in with Google (cuttable, late milestone). Requires `email_verified`. If a password account already exists for that email, do **not** auto-link: reject with `ACCOUNT_EXISTS` and ask the user to log in with their password (email signup is unverified, so linking would allow account pre-hijacking).
- Log out; `GET /auth/me` restores the session on reload.

**Documents**
- List (owned + shared), create, rename, delete (owner only).

**Editing**
- Tiptap rich text: headings, bold, italic, underline, bullet/ordered lists, links.
- Real-time multi-user editing with live cursors and a presence list.
- Autosave; reopening restores the latest state, including after server restart.

**Sharing**
- Invite by email with role `editor` or `viewer`; change or revoke roles.
- Share-link mode: `off` | `viewer` | `editor`. Opening a link requires login. (Cuttable; until implemented, `getRole` treats `shareMode` as `off`.)
- Viewers are read-only, enforced on the server.

## Roles
| Action | Owner | Editor | Viewer |
|---|---|---|---|
| Read / join | ✓ | ✓ | ✓ |
| Edit content | ✓ | ✓ | ✗ |
| Rename | ✓ | ✓ | ✗ |
| Manage members, share link | ✓ | ✗ | ✗ |
| Delete | ✓ | ✗ | ✗ |

## Out of scope
Comments/suggestions, version history, offline editing, tables, images/uploads, export (PDF/DOCX), other OAuth providers, email notifications, search, folders, mobile layout, horizontal scaling (Redis adapter), rate limiting beyond auth endpoints.

## Non-functional
- Edits reach collaborators with p95 < 300 ms on localhost.
- Concurrent edits converge (randomized 3-client test); no lost writes; edits made offline for 30 s converge after reconnect.
- Access changes (including `shareMode` changes) remove or downgrade connected sockets within 1 s.
- Passwords hashed (argon2); secrets only via env.
- Rate limiting and helmet on the server; auth endpoints rate-limited.
