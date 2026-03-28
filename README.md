# ShiftSync

**Live demo:** [https://shift-sync-silk.vercel.app/dashboard](https://shift-sync-silk.vercel.app/dashboard)

Web scheduling for the fictional **Coastal Eats** restaurant group (four sites, two US time zones). Take-home stack: **Next.js 15**, **Prisma 5**, **PostgreSQL**, **Luxon** for time zones.

Repository: [github.com/Rehmatqadir26/ShiftSync](https://github.com/Rehmatqadir26/ShiftSync)

## Quick start

1. **PostgreSQL** — use your existing install. Create a database (example name `shiftsync`):

   ```bash
   createdb shiftsync
   ```

   Or with `psql`:

   ```sql
   CREATE DATABASE shiftsync;
   ```

2. Copy env and set **`DATABASE_URL`** and **`DIRECT_URL`** (use the same local Postgres URL for both). Copy `SESSION_SECRET` from the example and replace with 16+ random characters. Keep `.env` in the **project root** so `npm run db:seed` can read it (Next.js and the seed script both use it).

   ```bash
   cp .env.example .env
   ```

3. Migrate and seed:

   ```bash
   npm install
   npx prisma migrate deploy
   npm run db:seed
   ```

4. Dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Demo logins

Password for **every** seeded user: `password`

| Role | Email |
| --- | --- |
| Admin | `admin@coastaleats.demo` |
| Manager (PIER + MIST) | `marina@coastaleats.demo` |
| Manager (HEAST + BOARD) | `dante@coastaleats.demo` |
| Staff (multi-site, fairness story) | `sarah@coastaleats.demo` |
| Other staff | `john@…`, `maria@…`, `alex@…`, `jordan@…`, `casey@…` (same domain) |

## What is implemented

- **Roles**: admin (all locations), manager (assigned locations), staff (certified sites).
- **Assignment rules**: no overlap across sites, **10h** rest, skill + active certification + **availability** (wall clock in the staff profile timezone), weekly/daily/consecutive-day labour hints and **12h daily hard block** / **7th day** manager reason.
- **Publish**: per-location published week; staff mostly see published schedules (plus their own assignments anytime).
- **Cutoff**: edits blocked inside **48h** of shift start (configurable on `OrganizationSettings`).
- **Swap / drop**: staff create requests; swap needs peer accept; manager approves; reassignment runs the same validator; **shift time change** cancels pending coverage with notifications; **three** open requests per staff cap; **drops** can be claimed until **shift start** (last-minute callouts supported).
- **Realtime**: in-memory **SSE** (`/api/stream`) for notifications, schedule updates, coverage activity, and clock events (single-server friendly; use Redis pub/sub to scale horizontally).
- **Fairness / OT**: dashboards under **Fairness** (`/api/analytics/*`).
- **Audit**: admin **Audit** page + CSV export (`/api/audit`, `/api/audit/export`).
- **Clock**: `/api/clock` + **On duty** dashboard (live list + SSE refresh).
- **Schedule**: managers get **live** board refresh on `schedule_updated`; **Assign** supports **Check fit** (dry-run via `/api/shifts/.../assign/preview`).
- **Staff profile**: `/dashboard/profile` + `/api/me/profile` and **PUT** `/api/me/availability/recurring` for desired hours, rate, timezone, weekly windows.
- **Requests**: coverage list UI with status badges, shift context, manager approve/deny, SSE refresh.

## Ambiguity choices (short)

- **Decertify**: certs can be marked inactive; history stays; new assigns blocked.
- **Desired hours**: stored on profile; **not** auto-trimmed from availability—used only in fairness deltas.
- **Consecutive days**: any day with **any** minutes worked counts as one day.
- **After swap approval, shift edited**: normal shift PATCH rules + audit; no silent undo.
- **Venues on a TZ border**: single IANA timezone per location in v1.

## Deploy

**Vercel (recommended):** step-by-step guide → [`docs/VERCEL.md`](docs/VERCEL.md). Summary:

- Set **`DATABASE_URL`**, **`DIRECT_URL`**, and **`SESSION_SECRET`** in the Vercel project (Neon: pooled + direct strings; local/single URL: duplicate the same value).
- Use **Build Command** `npm run build:vercel` so migrations run on deploy.
- Run **`npm run db:seed` once** against production (see guide) to load demo data.

**Any Node host:** `prisma migrate deploy`, then `npm run build && npm start`. Use managed Postgres (Neon, RDS, etc.) in production.
