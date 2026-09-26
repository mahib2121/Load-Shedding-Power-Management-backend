# Load Shedding & Power Management — Backend ⚡

A REST API for managing electrical load shedding across distribution zones, substations, feeders, and areas. Customers report outages (and pay a service fee via SSLCommerz), zone managers plan load-shedding schedules, field operators (technicians & operators) get dispatched, and super admins approve/activate plans and keep the whole grid running.

**Stack:** Node.js · Express 5 · TypeScript · Prisma 7 · PostgreSQL · Redis · JWT auth · Google OAuth · Zod validation · SSLCommerz payments · Cloudinary · Nodemailer

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Database diagram](#database-diagram)
- [Roles & permissions](#roles--permissions)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [The API](#the-api)
  - [Auth](#auth-apiv1auth)
  - [Load-shedding schedules](#load-shedding-schedules-apiv1load-shedding)
  - [Outages](#outages-apiv1outages)
  - [Payments](#payments-apiv1payments)
  - [System](#system)
- [Response & error envelopes](#response--error-envelopes)
- [Authentication flow](#authentication-flow)
- [Database seeding](#database-seeding)
- [Scripts](#scripts)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)

---

## Features

- **Auth** — email/password registration & login, JWT (access + refresh) tokens issued both in the body and as `httpOnly` cookies, Google OAuth login, forgot/reset password via email OTP (Redis-stored), `GET /me` for the current session.
- **Outage reporting** — customers create outage reports (gated behind a service-fee payment), field operators / zone managers verify and assign technicians, technicians start and restore repairs.
- **Load-shedding schedules** — zone managers create schedules for a zone on a date (demand / supply / reduction), add time slots on specific feeders, submit them for approval, and customers can fetch the schedule that affects their area.
- **Admin controls** — super admins approve, reject, or activate submitted schedules.
- **Payments** — SSLCommerz integration to initialize a session for an outage report, plus an IPN callback to settle the payment.
- **Audit + notifications + assignments** — underlying data model in place (audit log per mutation, in-app notifications, technician dispatch records).
- **CORS locked to the frontend URL**, all bodies parsed, all routes go through a single error envelope.

---

## Architecture

Layered, modular Express app. Each module follows the same five-file pattern (route → controller → service → interface → validation), keeping HTTP wiring separate from business logic separate from the database.

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
[ auth(...roles) ]   ─── JWT verify + role check + DB lookup → req.user
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
- **Redis** is connected in `server.ts` for OTP / refresh-token storage.
- **Services never touch `req` or `res`.** Controllers hand services small typed payloads (e.g. `{ userId, role, zoneId }`).
- **Role-based authorization is centralized** in `auth(...requiredRoles)`. It reads the JWT, checks the role from the token payload, then re-fetches the user from the DB to enforce current state (account active, not soft-deleted, role still matches the token).
- **Zod-validated request bodies** flow through `validateRequest(schema)` before the controller is invoked, so every handler can trust `req.body`.
- **Every error reaches a single JSON envelope** via `globalErrorHandler`, which honours `AppError.statusCode` if thrown.
- **TypeScript is strict**; module boundaries are reinforced by per-module `*.interface.ts` and `*.validation.ts` files.
- **Code style is enforced by Biome** (formatter + linter, double-quoted JS, tab indent, import organization on save).

---

## Database diagram

Twelve Prisma models, split across files in `prisma/schema/`. UUID primary keys throughout, plus `createdAt` / `updatedAt` / `deletedAt` for soft delete.

```mermaid
erDiagram
    User ||--o{ OutageReport : "files"
    User ||--o{ TechnicianAssignment : "assigned to"
    User ||--o{ Notification : "receives"
    User ||--o{ AuditLog : "actor"
    User ||--o{ Payment : "makes"
    User }o--|| Area : "lives in (CUSTOMER)"
    User }o--|| Zone : "manages/operates (ZONE_MANAGER, FIELD_OPERATOR)"

    Zone ||--o{ Substation : "contains"
    Zone ||--o{ User : "staff"
    Zone ||--o{ Outage : "scoped to"
    Zone ||--o{ LoadSheddingSchedule : "plans for"

    Substation ||--o{ Feeder : "feeds"

    Feeder ||--o{ Area : "serves"
    Feeder ||--o{ ScheduleSlot : "cut on"
    Feeder ||--o{ Outage : "affects"

    Area ||--o{ User : "customers"
    Area ||--o{ OutageReport : "filed in"
    Area ||--o{ Outage : "experiences"

    Outage ||--o{ OutageReport : "linked to"
    Outage ||--o{ TechnicianAssignment : "dispatched via"
    Outage }o--|| Zone : "zone"
    Outage }o--|| Feeder : "feeder"
    Outage }o--|| Area : "area"

    LoadSheddingSchedule ||--o{ ScheduleSlot : "has"
    LoadSheddingSchedule }o--|| Zone : "for zone"
    ScheduleSlot }o--|| Feeder : "on feeder"

    OutageReport ||--|| Payment : "fee for"
    OutageReport }o--o| Outage : "may attach to"

    User {
        uuid id PK
        string name
        string email UK
        string password "nullable for Google"
        string phone
        string googleId UK
        enum role "CUSTOMER | FIELD_OPERATOR | ZONE_MANAGER | SUPER_ADMIN"
        enum jobType "OPERATOR | TECHNICIAN (nullable)"
        bool isActive
        uuid areaId FK "nullable"
        uuid zoneId FK "nullable"
        datetime createdAt
        datetime updatedAt
        datetime deletedAt "soft delete"
    }

    Zone {
        uuid id PK
        string name
        string code UK
        string description
        datetime createdAt
        datetime updatedAt
        datetime deletedAt
    }

    Substation {
        uuid id PK
        string name
        string code UK
        float capacityMW
        uuid zoneId FK
        datetime createdAt
        datetime updatedAt
        datetime deletedAt
    }

    Feeder {
        uuid id PK
        string name
        string code UK
        float capacityMW
        float currentLoadMW
        enum priority "CRITICAL | HIGH | NORMAL | LOW"
        uuid substationId FK
        bool isActive
        datetime createdAt
        datetime updatedAt
        datetime deletedAt
    }

    Area {
        uuid id PK
        string name
        string code UK
        uuid feederId FK
        datetime createdAt
        datetime updatedAt
        datetime deletedAt
    }

    Outage {
        uuid id PK
        string title
        string description
        enum status "REPORTED | VERIFIED | ASSIGNED | IN_PROGRESS | RESTORED | CLOSED | REJECTED"
        enum severity "LOW | MEDIUM | HIGH | CRITICAL"
        uuid zoneId FK
        uuid feederId FK
        uuid areaId FK
        datetime reportedAt
        datetime verifiedAt "nullable"
        datetime startedAt "nullable"
        datetime restoredAt "nullable"
        datetime closedAt "nullable"
        datetime createdAt
        datetime updatedAt
        datetime deletedAt
    }

    OutageReport {
        uuid id PK
        string description
        float latitude
        float longitude
        uuid userId FK
        uuid areaId FK
        uuid outageId FK "nullable"
        datetime createdAt
    }

    LoadSheddingSchedule {
        uuid id PK
        string name
        datetime date
        float expectedDemandMW
        float availableSupplyMW
        float requiredReductionMW
        enum status "DRAFT | PENDING_APPROVAL | APPROVED | ACTIVE | COMPLETED | CANCELLED"
        uuid zoneId FK
        datetime createdAt
        datetime updatedAt
        datetime deletedAt
    }

    ScheduleSlot {
        uuid id PK
        uuid scheduleId FK
        uuid feederId FK
        datetime startTime
        datetime endTime
        int durationHours
        float plannedLoadReductionMW
        datetime createdAt
        datetime updatedAt
    }

    TechnicianAssignment {
        uuid id PK
        uuid outageId FK
        uuid technicianId FK
        enum status "PENDING | ACCEPTED | REJECTED | IN_PROGRESS | COMPLETED | CANCELLED"
        datetime assignedAt
        datetime acceptedAt "nullable"
        datetime startedAt "nullable"
        datetime completedAt "nullable"
        string notes
    }

    Notification {
        uuid id PK
        uuid userId FK
        enum type "OUTAGE_REPORTED | OUTAGE_VERIFIED | OUTAGE_ASSIGNED | OUTAGE_STARTED | POWER_RESTORED | SCHEDULE_CREATED | SCHEDULE_APPROVED | SYSTEM"
        string title
        string message
        bool isRead
        datetime createdAt
    }

    AuditLog {
        uuid id PK
        uuid userId FK "nullable"
        string action
        string entity
        string entityId
        json oldData
        json newData
        string ipAddress
        string userAgent
        datetime createdAt
    }

    Payment {
        uuid id PK
        float amount
        string currency "default BDT"
        enum status "PENDING | PAID | FAILED | CANCELLED | REFUNDED"
        enum method "SSLCOMMERZ"
        string transactionId UK
        string gatewaySessionId
        json gatewayResponse
        uuid userId FK
        uuid outageReportId UK FK
        datetime createdAt
        datetime updatedAt
    }
```

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
| `PaymentStatus`    | `PENDING`, `PAID`, `FAILED`, `CANCELLED`, `REFUNDED`                                    |
| `PaymentMethod`    | `SSLCOMMERZ`                                                                            |

\* Declared but not yet wired into the `User` model — the user account state is currently expressed via `isActive: Boolean` + `deletedAt: DateTime?`.

### Cardinality at a glance

```
Zone 1 ── * Substation 1 ── * Feeder 1 ── * Area 1 ── * User (CUSTOMER)
Zone 1 ── * User (ZONE_MANAGER, FIELD_OPERATOR)
Zone 1 ── * LoadSheddingSchedule 1 ── * ScheduleSlot * ── 1 Feeder
Zone 1 ── * Outage 1 ── * OutageReport * ── 1 Payment
Outage 1 ── * TechnicianAssignment * ── 1 User (FIELD_OPERATOR)
User 1 ── * OutageReport
User 1 ── * Notification
User 1 ── * AuditLog
User 1 ── * Payment
```

### Soft delete

Every long-lived model has a `deletedAt: DateTime?` column. Reads filter `deletedAt: null` so deletions are reversible. There is no delete endpoint yet, but the convention is established.

### Indices

Models carry `@@index` annotations on every foreign key and on every field likely to appear in `WHERE` clauses (`role`, `jobType`, `isActive`, `status`, `severity`, `createdAt`, `deletedAt`, …). Production-grade reads should stay on indexed columns.

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

Public self-registration (`POST /api/v1/auth/register`) **always** creates a `CUSTOMER`. Staff accounts are created via the seed script or directly in the database.

---

## Getting started

### Prerequisites

| Tool           | Version | Check with         |
| -------------- | ------- | ------------------ |
| **Node.js**    | 20+     | `node -v`          |
| **PostgreSQL** | 14+     | `psql -V`          |
| **Redis**      | 6+      | `redis-cli -v`     |

Any package manager works (npm, pnpm, yarn, bun). Examples below use `npm`.

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

A `.env` is already present with demo values. Edit it if needed — see [Environment variables](#environment-variables) for the full list.

### 3. Generate the Prisma client

```bash
npx prisma generate
```

The client is emitted to `src/generated/prisma/` (git-ignored). Skip this and nothing in `src/` typechecks.

### 4. Apply migrations

```bash
npx prisma migrate deploy      # apply existing migrations in production
# or
npx prisma migrate dev         # develop with auto-generated migration files
```

This creates all twelve tables from the committed SQL.

### 5. (Optional) Seed demo infrastructure and users

Call `seedDatabase()` once on startup — for example, temporarily add it at the top of `src/server.ts`:

```ts
import { seedDatabase } from "./app/utils/seed";
// ...
await seedDatabase();
```

It's idempotent: re-running it updates rather than duplicates. Remove the call once the DB is populated.

### 6. Start the server

```bash
npm run dev
```

You should see:

```
Connected to the database successfully.
Connected to redis
Server is running on port 5000
API: http://localhost:5000/api/v1
Health: http://localhost:5000/health
```

Verify:

```bash
curl http://localhost:5000/
# {"success":true,"message":"Welcome to Load Shedding & Power Management ⚡ Mahib Alam Khan AIUB CSE"}
```

---

## Environment variables

All variables are read in `src/app/config/index.ts` — application code should import `config` from there, not reach for `process.env` directly.

| Variable                   | Purpose                                                                  |
| -------------------------- | ------------------------------------------------------------------------ |
| `NODE_ENV`                 | `development` / `production` — affects cookie `secure` flag and Google-error verbosity |
| `PORT`                     | HTTP port (default `5000`)                                               |
| `DATABASE_URL`             | Postgres connection string used by Prisma + the runtime pg adapter        |
| `BACKEND_URL`              | Base backend URL for absolute link generation                             |
| `FRONTEND_URL`             | Added to the CORS allowlist                                              |
| `BCRYPT_SALT_ROUNDS`       | Cost factor for password hashing (used by the seed script)                |
| `JWT_ACCESS_SECRET`        | Signing key for access tokens                                             |
| `JWT_REFRESH_SECRET`       | Signing key for refresh tokens                                            |
| `JWT_ACCESS_EXPIRES_IN`    | Access token lifetime (`1d` default)                                      |
| `JWT_REFRESH_EXPIRES_IN`   | Refresh token lifetime (`7d` default)                                     |
| `GOOGLE_CLIENT_ID`         | OAuth client ID for Google sign-in                                        |
| `REDIS_URL` / `REDIS_*`    | Redis connection used for OTP + session storage                          |
| `CLOUDINARY_*`             | Cloudinary credentials for profile / asset uploads                       |
| `SMTP_*`                   | Nodemailer transport for OTP / notification emails                        |
| `SSLCOMMERZ_STORE_ID` / `SSLCOMMERZ_STORE_PASSWORD` / `SSLCOMMERZ_IS_LIVE` | SSLCommerz payment gateway credentials |
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
├── tsup.config.ts                     # production build config
├── vercel.json                        # Vercel deploy hooks
└── src/
    ├── server.ts                      # prisma.$connect() + redis.connect() + app.listen()
    ├── app.ts                         # express app: cors, body parsing, routes, error handling
    ├── generated/prisma/              # ← Prisma client (git-ignored, regenerate after schema edits)
    └── app/
        ├── config/index.ts            # only place process.env is read
        ├── lib/
        │   ├── prisma.ts              # shared PrismaClient (pg adapter)
        │   ├── redis.ts               # Redis client (OTP / sessions)
        │   ├── googleAuth.ts          # shared OAuth2Client for Google ID-token verification
        │   ├── nodeMailer.ts          # Nodemailer transport
        │   ├── cloudinary.ts          # Cloudinary uploader
        │   └── multer.ts              # multipart upload helper
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
            ├── auth/                  # email/password + Google + OTP password reset
            ├── user/                  # (placeholder — profile image upload not yet mounted)
            ├── load-sheddingschedules/   # schedule + slot workflow (DRAFT → … → ACTIVE)
            ├── OutageReport/          # outage report + verify / assign / start / restore
            └── payment/               # SSLCommerz init + IPN
```

Prisma's schema is intentionally split across multiple files (`schema.prisma`, `user.prisma`, `zone.prisma`, …) and stitched together by `prisma.config.ts` at the repo root.

---

## The API

Base URL: `http://localhost:5000`  ·  API root: `/api/v1`

### System

| Method | Path        | Auth | Body                | Description                |
| ------ | ----------- | ---- | ------------------- | -------------------------- |
| `GET`  | `/`         | –    | –                   | Welcome payload            |
| `GET`  | `/health`   | –    | –                   | Service health             |

### Auth (`/api/v1/auth`)

| Method | Path                         | Auth                                       | Body / Params |
| ------ | ---------------------------- | ------------------------------------------ | ------------- |
| `POST` | `/api/v1/auth/register`      | –                                          | `{ name, email, password, phone, areaId }` — creates a `CUSTOMER`. |
| `POST` | `/api/v1/auth/login`         | –                                          | `{ email, password }` — returns `{ accessToken, refreshToken }` + sets `httpOnly` cookies. |
| `POST` | `/api/v1/auth/google`        | –                                          | `{ idToken }` — Google sign-in (existing customer only). |
| `POST` | `/api/v1/auth/refresh-token` | –                                          | Reads `refreshToken` cookie; issues a new access + refresh pair. |
| `POST` | `/api/v1/auth/logout`        | –                                          | Clears cookies. |
| `POST` | `/api/v1/auth/forgot-password` | –                                        | `{ email }` — sends a 6-digit OTP to the email. |
| `POST` | `/api/v1/auth/reset-password`  | –                                        | `{ email, otp, newPassword }` — verifies OTP and updates the password. |
| `GET`  | `/api/v1/auth/me`            | any role                                   | Returns the current user profile from the JWT. |

**Register body**

```json
{
  "name": "Alice",
  "email": "alice@example.com",
  "password": "Strong@Pass1",
  "phone": "+8801712345678",
  "areaId": "<uuid-of-an-area>"
}
```

Password rules: ≥ 8 chars, must contain lowercase, uppercase, digit, and special character.

### Load-shedding schedules (`/api/v1/load-shedding`)

| Method | Path                                        | Auth                                       | Body / Query |
| ------ | ------------------------------------------- | ------------------------------------------ | ------------ |
| `POST` | `/api/v1/load-shedding/schedules`           | `SUPER_ADMIN`, `ZONE_MANAGER`              | Create a schedule. |
| `GET`  | `/api/v1/load-shedding/schedules`           | `SUPER_ADMIN`, `ZONE_MANAGER`              | List schedules, optional `?zoneId=`, `?status=`, `?date=`. |
| `GET`  | `/api/v1/load-shedding/schedules/:scheduleId` | `SUPER_ADMIN`, `ZONE_MANAGER`            | One schedule by id. |
| `POST` | `/api/v1/load-shedding/schedules/:scheduleId/slots` | `SUPER_ADMIN`, `ZONE_MANAGER`     | Add a `ScheduleSlot` to a schedule. |
| `GET`  | `/api/v1/load-shedding/schedules/:scheduleId/slots` | `SUPER_ADMIN`, `ZONE_MANAGER`     | List slots of a schedule. |
| `DELETE` | `/api/v1/load-shedding/slots/:slotId`     | `SUPER_ADMIN`, `ZONE_MANAGER`              | Delete a slot. |
| `POST` | `/api/v1/load-shedding/schedules/:scheduleId/submit` | `SUPER_ADMIN`, `ZONE_MANAGER`     | Submit a schedule for approval (`DRAFT → PENDING_APPROVAL`). |
| `POST` | `/api/v1/load-shedding/schedules/:scheduleId/approve` | `SUPER_ADMIN`                  | Approve a pending schedule. |
| `POST` | `/api/v1/load-shedding/schedules/:scheduleId/reject` | `SUPER_ADMIN`                    | Reject a pending schedule. |
| `POST` | `/api/v1/load-shedding/schedules/:scheduleId/activate` | `SUPER_ADMIN`                  | Activate an approved schedule. |
| `GET`  | `/api/v1/load-shedding/my-schedule`         | `CUSTOMER`                                 | Returns the schedule that affects the calling customer's area. |

**Create schedule body**

```json
{
  "name": "Mirpur Evening Plan",
  "date": "2026-09-26",
  "expectedDemandMW": 48,
  "availableSupplyMW": 40,
  "zoneId": "<uuid-of-zone>"
}
```

`requiredReductionMW` is derived from `expectedDemandMW - availableSupplyMW`.

**Create slot body**

```json
{
  "feederId": "<uuid-of-feeder>",
  "startTime": "2026-09-26T18:00:00Z",
  "endTime":   "2026-09-26T20:00:00Z",
  "durationHours": 2,
  "plannedLoadReductionMW": 3.5
}
```

Slot duration is hard-validated to be between 1 and 2 hours.

### Outages (`/api/v1/outages`)

| Method | Path                                | Auth                                                  | Body |
| ------ | ----------------------------------- | ----------------------------------------------------- | ---- |
| `POST` | `/api/v1/outages/reports`           | `CUSTOMER`                                            | File a new outage report. The customer is charged a service fee (a `Payment` row is created with status `PENDING`). |
| `PATCH`| `/api/v1/outages/:outageId/verify`  | `FIELD_OPERATOR`, `ZONE_MANAGER`                      | Verifies the outage (status `REPORTED → VERIFIED`). |
| `POST` | `/api/v1/outages/:outageId/assign`  | `FIELD_OPERATOR`, `ZONE_MANAGER`                      | `{ technicianId, notes? }` — dispatches a `TechnicianAssignment` to the given `FIELD_OPERATOR`. |
| `PATCH`| `/api/v1/outages/:outageId/start`   | `FIELD_OPERATOR`                                      | Assigned technician marks the outage `IN_PROGRESS`. |
| `PATCH`| `/api/v1/outages/:outageId/restore` | `FIELD_OPERATOR`                                      | Marks the outage `RESTORED` and sets `restoredAt`. |

**Create outage report body**

```json
{
  "description": "No power since 5 PM",
  "latitude": 23.8069,
  "longitude": 90.3687
}
```

The customer's `areaId` is taken from their session — `areaId` in the body is **not** accepted. Customers can only have one report with a `PENDING` payment at a time (409 otherwise).

### Payments (`/api/v1/payments`)

| Method | Path                                          | Auth        | Body / Notes |
| ------ | --------------------------------------------- | ----------- | ------------ |
| `POST` | `/api/v1/payments/:paymentId/initialize`      | `CUSTOMER`  | Initializes an SSLCommerz session for the payment row; returns the gateway URL/payload to redirect the customer to. |
| `POST` | `/api/v1/payments/ipn`                        | –           | SSLCommerz Instant Payment Notification callback (public, signature-verified in the service). Settles the payment and updates `Payment.status`. |

### `req.user` shape (populated by `auth(...)`)

```ts
{
  userId: string;
  email: string;
  name: string;
  role: UserRole;        // CUSTOMER | FIELD_OPERATOR | ZONE_MANAGER | SUPER_ADMIN
  jobType: JobType | null;
  zoneId: string | null;
  areaId: string | null;
}
```

---

## Response & error envelopes

### Success envelope

Every response that goes through `sendResponse` (or the inline `res.status(...).json(...)` calls) has the same shape:

```json
{ "success": true, "statusCode": 200, "message": "...", "data": { /* ... */ } }
```

Paginated responses additionally carry a `meta` object: `{ page, limit, total, totalPages }`.

Auth responses additionally set two `httpOnly` cookies:

| Cookie         | Lifetime | Purpose                                       |
| -------------- | -------- | --------------------------------------------- |
| `accessToken`  | 1 day    | Sent automatically to the same origin         |
| `refreshToken` | 7 days   | Used by `POST /api/v1/auth/refresh-token`     |

In production, cookies are `secure` + `sameSite: none`; in development they are `sameSite: lax` (read `data.accessToken` from the body and send `Authorization: Bearer <token>` to be safe across origins).

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
    "phone":"+8801712345678",
    "areaId":"<uuid-of-an-area>"
  }'

# 2. Call a protected route with the access token from the response
curl http://localhost:5000/api/v1/auth/me \
  -H "Authorization: Bearer <accessToken>"
```

### Forgot / reset password flow

1. `POST /api/v1/auth/forgot-password` with `{ email }` — server generates a 6-digit OTP, stores it in Redis (`OTP:<email>`), and emails it.
2. `POST /api/v1/auth/reset-password` with `{ email, otp, newPassword }` — server verifies the OTP against Redis and updates the password (still subject to the password complexity rules).

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

`src/app/utils/seed.ts` exposes `seedDatabase()`, which can be called once on startup. It is **idempotent** — re-runs upsert rather than throw.

It populates:

| Tier                  | Records                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------- |
| Infrastructure        | 1 Zone (`DHK-NORTH`) → 1 Substation (`MIRPUR-SS-01`) → 2 Feeders (`MIRPUR-F01`, `MIRPUR-F02`) → 2 Areas (`MIRPUR-01`, `MIRPUR-02`) |
| System users          | Super admin, zone manager, field operator (technician), field operator (operator), customer — all sourced from `.env` and each scoped to its proper anchor |

Seed credentials are taken from `SUPER_ADMIN_*`, `ZONE_MANAGER_*`, `FIELD_OPERATOR_*`, `FIELD_OPERATOR_2_*`, and `CUSTOMER_*` env vars. The customer is anchored to `area1.id` (i.e. the area attached to `MIRPUR-F01`).

---

## Scripts

```bash
npm run dev         # start with auto-reload (tsx watch) — use while developing
npm run build       # typecheck and bundle via tsup
npm run start       # run via tsx (see note below)
npm run format:fix  # biome formatter --write
npm run format:check
npm run lint:fix    # biome lint --write
npm run lint:check
```

Prisma's CLI is used directly (no wrapper script):

```bash
npx prisma generate            # regenerate client after schema edits
npx prisma migrate dev         # create + apply a migration
npx prisma migrate deploy      # apply existing migrations in production
npx prisma studio              # browser GUI at http://localhost:5555
```

### A note on `npm run start`

The source uses extensionless relative imports (`from './app'`) that `tsx` resolves but Node's native ESM loader doesn't. `npm run start` therefore runs the TypeScript source through `tsx` rather than executing `dist/` directly. Use `npm run dev` (or `tsx src/server.ts`) for development and your platform's Node-aware runner (or `tsx`) in production.

---

## Known limitations

Worth knowing before you spend time debugging what looks like your own mistake:

- **The `user` module is not mounted** in `app.ts`. `src/app/module/user/user.route.ts` is entirely commented out, so the profile-image upload endpoint is not currently reachable. The file structure is kept ready for re-enablement.
- **`UserStatus` enum is declared but unused** — account state is currently expressed via `isActive: Boolean` + `deletedAt`. The `auth` middleware only checks `deletedAt === null` and `isActive === true`; it does not consult `UserStatus`.
- **No request validation on `login`, `forgot-password`, `reset-password`, `refresh-token`, `logout`, outage `assign`, outage `verify/start/restore`.** Validation Zod schemas exist for `register`, `google`, and the load-shedding create flows; the rest rely on the service layer to throw.
- **Public registration is locked to `CUSTOMER`.** Staff accounts (`FIELD_OPERATOR`, `ZONE_MANAGER`, `SUPER_ADMIN`) can currently only be created via the seed script or directly in the DB.
- **No CRUD endpoints for zones / substations / feeders / areas.** They exist in the schema and the seed populates them, but there's no HTTP surface yet to create or edit them — outages and schedules reference them by id.
- **No notification / audit-log / assignment endpoints.** These models are populated by services (e.g. when an outage is verified, an assignment is created) but have no read endpoints yet.
- **No tests.** `npm test` is a placeholder script.
- **Cookies may be silently dropped in browsers** if `FRONTEND_URL` is on a different origin than `BACKEND_URL` — `sameSite: "none"` requires `secure: true` per the cookie spec, but `secure` is only set when `NODE_ENV === "production"`. During local dev over plain HTTP, browsers will ignore the cookies. The fix is to read `data.accessToken` from the JSON body and send it in `Authorization: Bearer ...`.
- **Outage report payment gating** — creating an outage report immediately creates a `Payment` row in `PENDING` status; the report is only attached to an `Outage` once the SSLCommerz IPN fires and settles the payment.

---

## Troubleshooting

**`Cannot find module '.../src/generated/prisma/client'`**
Run `npx prisma generate`.

**`Can't reach database server` / `ECONNREFUSED`**
Postgres isn't running, or `DATABASE_URL` points somewhere unreachable. Confirm with `pg_isready -h localhost -p 5432`.

**`P1010: User was denied access on the database`**
The username or password in `DATABASE_URL` doesn't match a real role on your Postgres server. `psql -c '\du'` lists the roles that actually exist.

**Redis connection refused on boot**
`server.ts` calls `redisClient.connect()` before listening. Make sure Redis is running locally (`redis-server`) or that your `REDIS_*` env vars point to a reachable instance.

**Login/register throws instead of returning a token**
`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` aren't set in `.env` — `jsonwebtoken` throws if the signing secret is `undefined`, and this project doesn't validate environment variables on startup.

**OTP "expired or invalid"**
OTPs are stored in Redis with a TTL. If you're hitting it from a different process, check `REDIS_URL` and that the OTP hasn't already been consumed (`POST /auth/reset-password` is one-shot).

**Google login rejects an existing customer with "Google account is not registered"**
Google login links an existing email to a Google identity, but **does not auto-create a new customer** — the customer must register with `areaId` first, then re-attempt Google login.

**SSLCommerz init returns but the gateway URL never loads**
Verify `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`, and `SSLCOMMERZ_IS_LIVE` (use `false` for sandbox). The IPN endpoint must also be reachable from the SSLCommerz servers.

**Biome flags formatting differences on save**
Run `npm run format:fix` — the project uses tabs for indent and double quotes for JS strings.

---

**Load Shedding & Power Management** — a backend for running a distribution grid: zones, substations, feeders, areas, outages, schedules, assignments, notifications, audits, payments.
