# Database setup

How Postgres, Docker and Prisma fit together in CollabDocs.

## Overview

```
server (Express) ──Prisma Client + pg adapter──▶ Postgres 17 (Docker container, localhost:5432)
                                                  ├─ collabdocs       dev data
                                                  └─ collabdocs_test  server tests (task 1.5)
```

- **PostgreSQL** stores users, auth accounts and (in later tasks) documents, members and Yjs snapshots/updates.
- **Docker Compose** runs Postgres so nobody installs it locally. `docker-compose.yml` at the repo root defines one service, `postgres`.
- **Prisma** is the ORM and migration tool. The schema lives in `server/prisma/schema.prisma`.

## Docker

| Item | Value |
|---|---|
| Image | `postgres:17` |
| User / password / DB | `collabdocs` / `collabdocs` / `collabdocs` (dev-only credentials) |
| Port | `5432` on the host |
| Data | named volume `pgdata`, so data survives restarts |
| Init | `docker/postgres-init/*.sql` creates `collabdocs_test` |

Init scripts run only the first time the volume is created. To re-run them, or to wipe all data, run `docker compose down -v`.

Common commands (from the repo root):

```
docker compose up -d        # start Postgres
docker compose ps           # check it is healthy
docker compose logs postgres
docker compose down         # stop, keep data
docker compose down -v      # stop and delete all data
```

## Connection

The server reads one variable, `DATABASE_URL`, validated in `server/src/config/env.ts` (the server refuses to start without it):

```
DATABASE_URL=postgresql://collabdocs:collabdocs@localhost:5432/collabdocs
```

Copy `server/.env.example` to `server/.env` to get it. `.env` is gitignored.

Prisma 7 connects through a driver adapter. `server/src/db/prisma.ts` exports a single `prisma` client built with `@prisma/adapter-pg`. Import that instance everywhere; do not create new clients. The Prisma CLI reads the same variable through `server/prisma.config.ts`.

`GET /api/health` runs `SELECT 1` through this client. It returns `{"status":"ok","db":"ok"}`, or 503 `{"status":"degraded","db":"down"}` if the database is unreachable.

## Schema and migrations

Current models: `User` and `AuthAccount` (migration `001_users_auth`). Later migrations add documents and members (`002`) and collaboration storage (`003`).

```
npm run db:migrate -w server                 # create + apply a migration in dev (prompts for a name)
npm run db:deploy -w server                  # apply existing migrations (CI, test DB, production)
npm run db:studio -w server                  # browse data in a UI
npx prisma generate                          # regenerate the client (run from server/)
```

- Migration files in `server/prisma/migrations/` are committed.
- The generated client goes to `server/src/generated/prisma` and is gitignored. A `postinstall` script regenerates it on `npm install`, so after changing the schema run `npx prisma generate` (done automatically by `db:migrate`).

## Troubleshooting

- **`Invalid environment configuration`**: `server/.env` is missing or lacks `DATABASE_URL`.
- **Health says `db: "down"`**: run `docker compose ps`; start the container with `docker compose up -d`.
- **Port 5432 already in use**: another Postgres is running locally. Stop it or change the host port in `docker-compose.yml` and `DATABASE_URL`.
- **Import error for `generated/prisma`**: run `npm install` (or `npx prisma generate` in `server/`).
