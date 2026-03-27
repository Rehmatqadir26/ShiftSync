# Coastal Shifts

Take-home: web scheduling for the fictional **Coastal Eats** restaurant group (four sites, two US time zones). Stack: **Next.js 15**, **Prisma 5**, **PostgreSQL**, **Luxon** for time zones.

## Quick start

1. Copy env: `cp .env.example .env` and set `SESSION_SECRET` (16+ characters).
2. Start Postgres (port **5433** to avoid clashing with a local server):

   ```bash
   docker compose up -d
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
- **Swap / drop**: staff create requests; swap needs peer accept; manager approves; reassignment runs the same validator; **shift time change** cancels pending coverage with notifications; **three** open requests per staff cap; **drops expire** at T−24h.
- **Realtime**: in-memory **SSE** (`/api/stream`) for notifications and schedule pulses (fine for a single server; use Redis pub/sub for horizontal scale).
- **Fairness / OT**: JSON reports under **Fairness** and `/api/analytics/*`.
- **Audit**: `AuditLog` rows on assigns and shift updates; admin-scale export is left as a thin follow-up over the same table.
- **Clock**: `/api/clock` + **On duty** page for a live-ish view.

## Ambiguity choices (short)

- **Decertify**: certs can be marked inactive; history stays; new assigns blocked.
- **Desired hours**: stored on profile; **not** auto-trimmed from availability—used only in fairness deltas.
- **Consecutive days**: any day with **any** minutes worked counts as one day.
- **After swap approval, shift edited**: normal shift PATCH rules + audit; no silent undo.
- **Venues on a TZ border**: single IANA timezone per location in v1.

## Deploy

Set `DATABASE_URL` and `SESSION_SECRET` on your host. Run `prisma migrate deploy` and `npm run build && npm start`. Use a public Postgres (Neon, RDS, etc.) when Docker is not available.
