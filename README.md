# Load Shedding & Power Management — Backend ⚡

A REST API for managing electrical load shedding across distribution zones, substations, feeders, and areas. Customers report outages, zone managers schedule load shedding, field operators (technicians & operators) get dispatched, and super admins keep the whole grid running.

**Stack:** Node.js · Express 5 · TypeScript · Prisma 7 · PostgreSQL · JWT auth · Google OAuth · Zod validation

---

## Table of Contents

- [Where the project stands today](#where-the-project-stands-today)
- [System overview](#system-overview)
- [Architecture](#architecture)
- [Domain model (database)](#domain-model-database)
- [Roles & permissions](#roles--permissions)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [The API](#the-api)
- [Authentication flow](#authentication-flow)
- [Database seeding](#database-seeding)
- [Scripts](#scripts)
- [Extending this starter](#extending-this-starter)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)

---

## Where the project stands today

This is an **early, auth-first build**. The only fully wired feature is authentication (email/password + Google OAuth). The Prisma schema for the entire domain — zones, substations, feeders, areas, outages, outage reports, schedules, assignments, notifications, audit logs — is in place, a seed script exists to populate demo infrastructure and system users, but the HTTP routes for those modules are not yet mounted in `app.ts`.

The skeleton for every planned feature module is already in the codebase: data model, role-aware middleware, request validation, error envelope, and a seed for the infrastructure tree. New modules plug in by adding files under `src/app/module/<name>/` and a single `app.use(...)` line.

---

## System overview

The platform models a real distribution grid and the people who run it.

```
┌────────────────────────────────────────────────────────────────────┐
│                       LOAD SHEDDING PLATFORM                       │
└────────────────────────────────────────────────────────────────────┘

  ┌─────────────┐         ┌──────────────────┐         ┌────────────┐
  │   Zone      │ 1───*   │   Substation     │ 1───*   │  Feeder    │
  │ (e.g. Dhaka │         │  (e.g. Mirpur    │         │  (e.g.     │
  │  North)     │         │   Substation)    │         │  Mirpur-F1)│
  └─────────────┘         └──────────────────┘         └─────┬──────┘
        │                                                     │ 1
        │ 1                                                   │
        │                                                     ▼ *
        │                                              ┌────────────┐
        │                                              │   Area     │
        │                                              │ (consumer  │
        │                                              │  pockets)  │
        │                                              └────────────┘
        │
        │ 1
        ▼ *
  ┌──────────────────┐         ┌─────────────────────┐
  │ Load Shedding    │ 1───*   │  ScheduleSlot       │ *───1 Feeder
  │ Schedule         │         │  (start/end, MW     │
  │ (per zone, per   │         │   reduction)        │
  │  date)           │         └─────────────────────┘
  └──────────────────┘
        │
        │ references Zone

  ┌──────────────────┐         ┌─────────────────────┐
  │     Outage       │ 1───*   │  OutageReport       │
  │  (status,        │         │  (customer-         │
  │   severity,      │         │   submitted)        │
  │   timestamps)    │         └─────────────────────┘
  └──────────────────┘
        │
        │ 1
        ▼ *
  ┌──────────────────────────┐
  │ TechnicianAssignment     │  *───1 User (technician)
  │ (PENDING → ACCEPTED →    │
  │  IN_PROGRESS → COMPLETED)│
  └──────────────────────────┘

  ┌──────────────────┐         ┌─────────────────────┐
  │  Notification    │         │   AuditLog          │
  │  (per user)      │         │  (entity history)   │
  └──────────────────┘         └─────────────────────┘
```

The `User` model sits on top of all of this, carrying a role and a structural anchor — `zoneId` for managers/operators, `areaId` for customers — that scopes what they can see and do.

---

## Architecture

Layered, modular Express app. Each module follows the same four-file pattern, keeping HTTP wiring separate from business logic separate from the database.

```
Request
  │
  ▼
[ Express 5 app ]
  │   • cors (FRONTEND_URL allowlist, credentials: true)
  │   • cookie-parser + express.json + urlencoded
  │   • global /health and / routes
  │
  ▼
[ validateRequest ]  ─── Zod schema  → throws AppError(400) on failure
  │
  ▼
[ auth(...) ]        ─── JWT verify + role check + DB lookup → req.user
  │
  ▼
[ Controller ]       ─── thin: reads req, calls service, sends response
  │
  ▼
[ Service ]          ─── all business rules + every Prisma call
  │
  ▼
[ Prisma + @prisma/adapter-pg ]  ─── single shared PrismaClient (pg driver)
  │
  ▼
PostgreSQL
  │
  ▼
[ sendResponse ]     ─── uniform { success, statusCode, message, data, meta }
  │
  ▼
[ globalErrorHandler / notFound ]  ─── catch-all JSON envelope
```

Key architectural decisions:

- **One shared `PrismaClient`** lives in `src/app/lib/prisma.ts`. Every service imports it from there; no module creates its own client.
- **Services never touch `req` or `res`.** Controllers hand services small typed payloads (e.g. `{ userId, email, role, zoneId }`).
- **Role-based authorization is centralized** in `auth(...requiredRoles)`. It reads the JWT, checks the role from the token payload, then re-fetches the user from the DB to enforce current state (account active, not soft-deleted, role still matches the token).
- **Zod-validated request bodies** flow through `validateRequest(schema)` before the controller is invoked, so every handler can trust `req.body`.
- **Every error reaches a single JSON envelope** via `globalErrorHandler`, which honours `AppError.statusCode` if thrown.
- **TypeScript is strict**; module boundaries are reinforced by per-module `*.interface.ts` and `*.validation.ts` files.
- **Code style is enforced by Biome** (formatter + linter, double-quoted JS, tab indent, import organization on save).

---

## Domain model (database)

Twelve Prisma models split across files in `prisma/schema/`. UUID primary keys throughout, plus `createdAt` / `updatedAt` / `deletedAt` for soft delete.

### Enums (`prisma/schema/enums.prisma`)

| Enum               | Values                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------- |
| `UserRole`         | `CUSTOMER`, `FIELD_OPERATOR`, `ZONE_MANAGER`, `SUPER_ADMIN`                             |
| `JobType`          | `OPERATOR`, `TECHNICIAN`                                                                |
| `UserStatus`\*     | `ACTIVE`, `BLOCKED`, `DELETED`                                                          |
| `FeederPriority`   | `CRITICAL`, `HIGH`, `NORMAL`, `LOW`                                                     |
| `OutageStatus`     | `REPORTED`, `VERIFIED`, `ASSIGNED`, `IN_PROGRESS`, `RESTORED`, `CLOSED`, `REJECTED`     |
| `OutageSeverity`   | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`                                                     |
| `ScheduleStatus`   | `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `ACTIVE`, `COMPLETED`, `CANCELLED`             |
| `AssignmentStatus` | `PENDING`, `ACCEPTED`, `REJECTED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`              |
| `NotificationType` | `OUTAGE_REPORTED`, `OUTAGE_VERIFIED`, `OUTAGE_ASSIGNED`, `OUTAGE_STARTED`, `POWER_RESTORED`, `SCHEDULE_CREATED`, `SCHEDULE_APPROVED`, `SYSTEM` |

\* Declared but not yet wired into the `User` model — the user account state is currently expressed via `isActive: Boolean` + `deletedAt: DateTime?`.

### Models

| Model                  | Purpose                                                                                                              | Notable fields                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `User`                 | All actors: customers, field operators, zone managers, super admins.                                                  | `role`, `jobType`, optional `zoneId`/`areaId`, `googleId`, `password?`, `isActive`, `deletedAt` |
| `Zone`                 | Top-level distribution zone (e.g. "Dhaka North").                                                                    | `code` (unique), `description`                                                                  |
| `Substation`           | Power substation inside a zone.                                                                                      | `capacityMW`, `zoneId`                                                                          |
| `Feeder`               | A circuit leaving a substation; feeders carry priority for load shedding.                                            | `capacityMW`, `currentLoadMW`, `priority`, `substationId`                                       |
| `Area`                 | Consumer pocket served by exactly one feeder.                                                                        | `feederId`                                                                                      |
| `Outage`               | A power outage event scoped to a specific zone/feeder/area, with full lifecycle timestamps.                          | `status`, `severity`, `reportedAt`/`verifiedAt`/`startedAt`/`restoredAt`/`closedAt`              |
| `OutageReport`         | Customer-submitted report; may or may not yet be linked to a verified `Outage`.                                      | `latitude`/`longitude`, `userId`, `areaId`, `outageId?`                                         |
| `LoadSheddingSchedule` | A planned load-shedding plan for a zone on a specific date with demand/supply/reduction figures.                     | `expectedDemandMW`, `availableSupplyMW`, `requiredReductionMW`, `status`                        |
| `ScheduleSlot`         | One concrete time window inside a schedule, on one feeder, with a planned MW reduction.                               | `startTime`, `endTime`, `durationHours`, `plannedLoadReductionMW`                               |
| `TechnicianAssignment` | Dispatch record linking an outage to a technician/operator user.                                                     | `status`, `assignedAt`/`acceptedAt`/`startedAt`/`completedAt`, `notes`                          |
| `Notification`         | In-app notification for a user.                                                                                       | `type`, `isRead`                                                                                |
| `AuditLog`             | History of mutations: who did what to which entity, with `oldData`/`newData` JSON snapshots.                         | `userId?`, `action`, `entity`, `entityId`, `oldData`, `newData`, `ipAddress`, `userAgent`       |

### Cardinality at a glance

```
Zone 1 ── * Substation 1 ── * Feeder 1 ── * Area 1 ── * User (CUSTOMER)
Zone 1 ── * User (ZONE_MANAGER, FIELD_OPERATOR)
Zone 1 ── * LoadSheddingSchedule 1 ── * ScheduleSlot * ── 1 Feeder
Zone 1 ── * Outage 1 ── * OutageReport
Outage 1 ── * TechnicianAssignment * ── 1 User (FIELD_OPERATOR)
User 1 ── * OutageReport
User 1 ── * Notification
User 1 ── * AuditLog
```

### Soft delete

Every long-lived model has a `deletedAt: DateTime?` column. Reads filter `deletedAt: null` so deletions are reversible. There is no delete endpoint yet, but the convention is established.

### Indices

Models carry `@@index` annotations on every foreign key and on every field likely to appear in WHERE clauses (`role`, `jobType`, `isActive`, `status`, `severity`, `createdAt`, `deletedAt`, …). Production-grade reads should stay on indexed columns.

---

## Roles & permissions

Four roles, enforced by `auth(...roles)` and the `req.user.role` field populated after a successful JWT check.

| Role             | Scope                                     | Job type        | Anchor (`zoneId` / `areaId`) |
| ---------------- | ----------------------------------------- | --------------- | ---------------------------- |
| `CUSTOMER`       | One specific area                         | –               | `areaId` only                |
| `FIELD_OPERATOR` | One specific zone                         | `OPERATOR` or `TECHNICIAN` | `zoneId` only      |
| `ZONE_MANAGER`   | One specific zone                         | –               | `zoneId` only                |
| `SUPER_ADMIN`    | Everything (no zone/area anchor)          | –               | none                         |

Rules enforced in `auth.service.ts → createSystemUser`:

- `CUSTOMER` **must** have an `areaId`, must **not** have a `zoneId`, must **not** have a `jobType`.
- `FIELD_OPERATOR` **must** have a `zoneId`, **must** have a `jobType`, must **not** have an `areaId`.
- `ZONE_MANAGER` **must** have a `zoneId`, must **not** have a `jobType`, must **not** have an `areaId`.
- `SUPER_ADMIN` must **not** have any of `zoneId`, `areaId`, `jobType`.

Public self-registration (`POST /api/v1/auth/register`) **always** creates a `CUSTOMER`. Staff accounts are created via `createSystemUser` (currently exposed only through the seed script) or directly in the database.

---

## Getting started

### Prerequisites

| Tool           | Version | Check with         |
| -------------- | ------- | ------------------ |
| **Node.js**    | 20+     | `node -v`          |
| **PostgreSQL** | 14+     | `psql -V`          |

Any package manager works (npm, pnpm, yarn, bun). Examples below use `npm`.

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

A `.env` is already present with demo values. Edit it if needed:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/load_shedding?schema=public"
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
GOOGLE_CLIENT_ID=...
```

The `.env` shipped in the repo points at a hosted Prisma Postgres demo instance; replace it with your own for local development. See [Environment variables](#environment-variables) for the full list.

### 3. Generate the Prisma client

```bash
npx prisma generate
```

The client is emitted to `src/generated/prisma/` (git-ignored). Skip this and nothing in `src/` typechecks.

### 4. Apply migrations

```bash
npx prisma migrate dev
```

This creates all twelve tables from the committed SQL.

### 5. (Optional) Seed demo infrastructure and users

Uncomment the line in `src/server.ts`:

```ts
await seedDatabase();
```

Then start the server — see below. This is idempotent: re-running it updates rather than duplicates.

### 6. Start the server

```bash
npm run dev
```

You should see:

```
Connected to the database successfully.
Server is running on port 5000
API: http://localhost:5000/api/v1
Health: http://localhost:5000/health
```

Verify:

```bash
curl http://localhost:5000/
# {"success":true,"message":"Welcome to Load Shedding & Power Management ⚡"}
```

---

## Environment variables

All variables are read in `src/app/config/index.ts` — application code should import `config` from there, not reach for `process.env` directly.

| Variable                   | Purpose                                                                  |
| -------------------------- | ------------------------------------------------------------------------ |
| `NODE_ENV`                 | `development` / `production` — affects cookie `secure` flag and Google-error verbosity |
| `PORT`                     | HTTP port (default `5000`)                                               |
| `DATABASE_URL`             | Postgres connection string used by Prisma + the runtime pg adapter        |
| `BACKEND_URL`              | Reserved for absolute link generation (not yet wired into a route)        |
| `FRONTEND_URL`             | Added to the CORS allowlist                                              |
| `BCRYPT_SALT_ROUNDS`       | Cost factor for password hashing (used by the seed script)                |
| `JWT_ACCESS_SECRET`        | Signing key for access tokens                                             |
| `JWT_REFRESH_SECRET`       | Signing key for refresh tokens                                            |
| `JWT_ACCESS_EXPIRES_IN`    | Access token lifetime (`1d` default)                                      |
| `JWT_REFRESH_EXPIRES_IN`   | Refresh token lifetime (`7d` default)                                     |
| `GOOGLE_CLIENT_ID`         | OAuth client ID for Google sign-in                                        |
| `SUPER_ADMIN_*`            | Seed credentials for the super admin                                      |
| `ZONE_MANAGER_*`           | Seed credentials for the zone manager                                     |
| `FIELD_OPERATOR_*`         | Seed credentials for field operator 1 (technician)                         |
| `FIELD_OPERATOR_2_*`       | Seed credentials for field operator 2 (operator)                           |
| `CUSTOMER_*`               | Seed credentials for the demo customer                                    |

**Before deploying anywhere**, rotate the JWT secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

There is no startup validation: a missing variable simply becomes `undefined`, and the first sign of trouble is a runtime error the moment that value is actually used.

---

## Project structure

```
.
├── prisma.config.ts                   # loads .env, points Prisma at prisma/schema + migrations
├── biome.json                         # formatter + linter config
├── tsconfig.json
└── src/
    ├── server.ts                      # prisma.$connect(), then app.listen()
    ├── app.ts                         # express app: cors, body parsing, routes, error handling
    ├── generated/prisma/              # ← Prisma client (git-ignored, regenerate after schema edits)
    └── app/
        ├── config/index.ts            # only place process.env is read
        ├── lib/
        │   ├── prisma.ts              # shared PrismaClient (pg adapter)
        │   └── googleAuth.ts          # shared OAuth2Client for Google ID-token verification
        ├── middleware/
        │   ├── checkAuth.ts           # auth(...roles) — JWT + role + DB freshness guard
        │   ├── validateRequest.ts     # Zod-driven body validator, throws AppError(400)
        │   ├── globalErrorHandler.ts  # AppError → JSON envelope
        │   └── notFound.ts            # catch-all for unmatched routes
        ├── utils/
        │   ├── AppError.ts            # typed error with statusCode
        │   ├── catchAsync.ts          # async wrapper that forwards thrown errors
        │   ├── jwt.ts                 # createToken / verifyToken
        │   ├── sendResponse.ts        # uniform { success, statusCode, message, data, meta }
        │   └── seed.ts                # infrastructure + system-user seeding
        └── module/
            └── auth/                  # the one feature module wired today
                ├── auth.route.ts
                ├── auth.controller.ts
                ├── auth.service.ts
                ├── auth.interface.ts
                └── auth.validation.ts
```

Prisma's schema is intentionally split across multiple files (`schema.prisma`, `user.prisma`, `zone.prisma`, …) and stitched together by `prisma.config.ts` at the repo root.

---

## The API

Base URL: `http://localhost:5000`

| Method | Path                            | Auth                                        | Body                                              |
| ------ | ------------------------------- | ------------------------------------------- | ------------------------------------------------- |
| `GET`  | `/`                             | –                                           | health welcome                                    |
| `GET`  | `/health`                       | –                                           | service health                                    |
| `POST` | `/api/v1/auth/register`         | –                                           | `name`, `email`, `password`, `areaId`             |
| `POST` | `/api/v1/auth/login`            | –                                           | `email`, `password`                               |
| `POST` | `/api/v1/auth/google`           | –                                           | `idToken` (Google)                                |
| `GET`  | `/api/v1/auth/me`               | any role                                    | –                                                 |
| `POST` | `/api/v1/auth/refresh-token`    | –                                           | reads `refreshToken` cookie                       |
| `POST` | `/api/v1/auth/logout`           | –                                           | clears cookies                                    |

### Response envelope

Every response that goes through `sendResponse` has the same shape:

```json
{ "success": true, "statusCode": 200, "message": "...", "data": { /* ... */ } }
```

Paginated responses additionally carry a `meta` object: `{ page, limit, total, totalPages }`.

### Error envelope

Errors from `globalErrorHandler`:

```json
{
  "success": false,
  "statusCode": 400,
  "name": "AppError",
  "message": "Password Must Minimum 8 Characters Long."
}
```

---

## Authentication flow

JWT-based with access + refresh tokens. Tokens are issued **both in the JSON body** and as `httpOnly` cookies — clients can use whichever is convenient.

```bash
# 1. Register a customer
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Alice",
    "email":"alice@example.com",
    "password":"Strong@Pass1",
    "areaId":"<uuid-of-an-area>"
  }'

# 2. Call a protected route with the access token from the response
curl http://localhost:5000/api/v1/auth/me \
  -H "Authorization: Bearer <accessToken>"
```

### Google sign-in

`POST /api/v1/auth/google` accepts a Google `idToken`. The server verifies it against `GOOGLE_CLIENT_ID`, then either links the Google identity to an existing customer (matching by email) or rejects if the Google email isn't already a registered customer. **Staff accounts cannot log in via Google.**

### How `auth(...roles)` actually decides

For each request it:

1. Reads the token from the `accessToken` cookie, falling back to the `Authorization` header (`Bearer <token>` or raw).
2. Verifies the JWT signature with `JWT_ACCESS_SECRET`.
3. Reads the role from the **token payload** and checks it against `requiredRoles`.
4. Looks up the user in the DB by `id` (filtered by `deletedAt: null`).
5. Re-fetches `isActive` — rejects inactive accounts.
6. Re-checks `role` — if the DB role differs from the token role, the token is stale and the request is rejected.
7. Re-checks `email` — same drift protection.
8. Attaches `{ userId, email, name, role, jobType, zoneId, areaId }` to `req.user`.

Because roles and identity are checked against both the token and the live database row, simply editing a user's role in the database is **not** enough — they must log in again to receive a fresh token.

---

## Database seeding

`src/app/utils/seed.ts` exposes `seedDatabase()`, currently called from `server.ts` (commented out by default). It is **idempotent** — re-runs upsert rather than throw.

It populates:

| Tier                  | Records                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------- |
| Infrastructure        | 1 Zone (`DHK-NORTH`) → 1 Substation (`MIRPUR-SS-01`) → 2 Feeders (`MIRPUR-F01`, `MIRPUR-F02`) → 2 Areas (`MIRPUR-01`, `MIRPUR-02`) |
| System users          | Super admin, zone manager, field operator (technician), field operator (operator), customer — all sourced from `.env` and each scoped to its proper anchor |

To enable seeding, uncomment `await seedDatabase();` in `src/server.ts` and restart the server. Re-comment it once your database is populated.

---

## Scripts

```bash
npm run dev         # start with auto-reload (tsx watch) — use while developing
npm run build       # typecheck with tsc, emit to dist/
npm run start       # run via tsx (NOT node dist/) — see note below
npm run format:fix  # biome formatter --write
npm run format:check
npm run lint:fix    # biome lint --write
npm run lint:check
```

Prisma's CLI is used directly (no wrapper script):

```bash
npx prisma generate     # regenerate client after schema edits
npx prisma migrate dev  # create + apply a migration
npx prisma studio       # browser GUI at http://localhost:5555
```

### A note on `npm run start`

`npm run build` is great for catching type errors, but `dist/` is not directly runnable with Node because the source uses extensionless relative imports (`from './app'`) that `tsx` resolves but Node's native ESM loader doesn't. `npm run start` therefore runs the TypeScript source through `tsx` rather than executing `dist/`.

---

## Extending this starter

New feature modules go under `src/app/module/<name>/` as four files with strict responsibilities:

| File                       | Responsibility                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `<name>.route.ts`          | Wires `validateRequest(...)` and `auth(...roles)` to controller functions; exports the router |
| `<name>.controller.ts`     | Reads `req.body` / `req.user`, calls the service, calls `sendResponse`             |
| `<name>.service.ts`        | All business logic and every Prisma call for the module                            |
| `<name>.interface.ts`      | TypeScript types for the module's payloads                                        |
| `<name>.validation.ts`     | (recommended) Zod schemas for `validateRequest`                                   |

Then mount the router in `src/app.ts`:

```ts
app.use('/api/v1/zones', ZoneRoutes);
app.use('/api/v1/outages', OutageRoutes);
app.use('/api/v1/load-shedding', LoadSheddingRoutes);
// ...per the placeholder block already in app.ts
```

Two rules keep module boundaries useful rather than decorative:

- **Controllers never call Prisma directly**, and **services never touch `req` or `res`.** If a service needs to know who's calling it, pass it the small `{ userId, email, role, zoneId, areaId }` shape.
- **Never spread `req.body` straight into a Prisma `create`/`update`.** Use a Zod schema via `validateRequest` and destructure the parsed result. With no manual role-checking elsewhere, that schema is what stops a customer POST from setting `role: SUPER_ADMIN` on themselves.

---

## Known limitations

Worth knowing before you spend time debugging what looks like your own mistake:

- **Only the `auth` module is wired into `app.ts`.** All twelve Prisma models exist and `seedDatabase` populates them, but `Zone`, `Outage`, `LoadSheddingSchedule`, `TechnicianAssignment`, `Notification`, `AuditLog`, etc. don't have routes yet — only the commented placeholder block in `app.ts` hints at where they'll go.
- **`UserStatus` enum is declared but unused** — account state is currently expressed via `isActive: Boolean` + `deletedAt`. The `auth` middleware only checks `deletedAt === null` and `isActive === true`; it does not consult `UserStatus`.
- **No request validation on refresh/logout endpoints.** `/auth/refresh-token` and `/auth/logout` don't go through `validateRequest`; only `/register`, `/login`, and `/google` do.
- **Public registration is locked to `CUSTOMER`.** Staff accounts (`FIELD_OPERATOR`, `ZONE_MANAGER`, `SUPER_ADMIN`) can currently only be created via the seed script or directly in the DB.
- **No tests.** `npm test` is a placeholder script.
- **Cookies may be silently dropped in browsers** if `FRONTEND_URL` is on a different origin than `BACKEND_URL` — `sameSite: "none"` requires `secure: true` per the cookie spec, but `secure` is only set when `NODE_ENV === "production"`. During local dev over plain HTTP, browsers will ignore the cookies. The fix is to read `data.accessToken` from the JSON body and send it in `Authorization: Bearer ...`.

---

## Troubleshooting

**`Cannot find module '.../src/generated/prisma/client'`**
Run `npx prisma generate`.

**`Can't reach database server` / `ECONNREFUSED`**
Postgres isn't running, or `DATABASE_URL` points somewhere unreachable. Confirm with `pg_isready -h localhost -p 5432`.

**`P1010: User was denied access on the database`**
The username or password in `DATABASE_URL` doesn't match a real role on your Postgres server. `psql -c '\du'` lists the roles that actually exist.

**Login/register throws instead of returning a token**
`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` aren't set in `.env` — `jsonwebtoken` throws if the signing secret is `undefined`, and this project doesn't validate environment variables on startup.

**Google login rejects an existing customer with "Google account is not registered"**
Google login links an existing email to a Google identity, but **does not auto-create a new customer** — the customer must register with `areaId` first, then re-attempt Google login.

**Biome flags formatting differences on save**
Run `npm run format:fix` — the project uses tabs for indent and double quotes for JS strings.

---

**Load Shedding & Power Management** — a backend for running a distribution grid: zones, substations, feeders, areas, outages, schedules, assignments, notifications, audits.
