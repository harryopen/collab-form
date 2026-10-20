# Database Design

PostgreSQL via Prisma (`server/prisma/schema.prisma`). Migrations with `prisma migrate dev`.

## Entities
- **User** — `id`, `email` (unique), `name`, `avatarUrl?`, `passwordHash?` (null for Google-only), `createdAt`.
- **AuthAccount** — `id`, `userId`, `provider` ("google"), `providerAccountId`; unique on (`provider`, `providerAccountId`).
- **Document** — `id`, `ownerId`, `title`, `shareMode` (`OFF | VIEWER | EDITOR`), `createdAt`, `updatedAt`.
- **DocumentMember** — `documentId`, `userId`, `role` (`EDITOR | VIEWER`); primary key (`documentId`, `userId`). Owner is `Document.ownerId`, not a member row.
- **DocumentSnapshot** — `documentId` (unique), `state` (`Bytes`), `updatedAt`. One current row per document.
- **DocumentUpdate** — `id` (autoincrement), `documentId`, `data` (`Bytes`), `createdAt`; index on (`documentId`, `id`).

## Rules
- Deleting a document cascades to members, snapshot and updates; deleting a user cascades to auth accounts and owned documents.
- Current document content = snapshot `state` + all `DocumentUpdate` rows in `id` order, applied to a fresh Y.Doc.
- Compaction runs in a single transaction: write the new snapshot, delete the folded update ids.
- No plain-text copy of content is stored (search is out of scope).
