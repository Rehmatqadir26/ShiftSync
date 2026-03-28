# Deploy ShiftSync on Vercel

## 1. Create a PostgreSQL database (Neon recommended)

1. Sign up at [neon.tech](https://neon.tech) and create a project.
2. In the Neon dashboard, open **Connection details**:
   - Copy the **pooled** connection string → use as `DATABASE_URL` (often contains `-pooler` in the host).
   - Copy the **direct** (non-pooling) connection string → use as `DIRECT_URL` (migrations require this; pooled URLs can fail on `prisma migrate deploy`).

If you use **Supabase**, **Railway**, or a single Postgres URL with no pooler, set **`DATABASE_URL` and `DIRECT_URL` to the same value** in Vercel.

## 2. Push code to GitHub

Ensure this repo is on GitHub (e.g. `Rehmatqadir26/ShiftSync`). Vercel will build from the connected repo.

## 3. Import the project in Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New…** → **Project** → import the GitHub repo.
2. **Root Directory**: set to the folder that contains `package.json` if the repo is not only ShiftSync.
3. **Framework Preset**: Next.js (auto-detected).
4. **Build Command**: `npm run build:vercel`  
   (runs `prisma migrate deploy` then `next build` so the production DB gets migrations on each deploy.)
5. **Install Command**: leave default `npm install` (runs `postinstall` → `prisma generate`).

## 4. Environment variables

In the project → **Settings** → **Environment Variables**, add for **Production** (and Preview if you want):

| Name | Value |
|------|--------|
| `DATABASE_URL` | Pooled Postgres URL (Neon “pooled” / serverless). |
| `DIRECT_URL` | Direct Postgres URL (Neon “direct”); or same as `DATABASE_URL` if you have no pooler. |
| `SESSION_SECRET` | At least 16 random characters (generate e.g. `openssl rand -base64 32`). |

Redeploy after saving env vars (Deployments → … → Redeploy).

## 5. First deploy

The first successful build applies migrations. If the build fails on `migrate deploy`, check:

- URLs are correct and the DB accepts SSL (`sslmode=require` is usually in Neon strings).
- `DIRECT_URL` is set when using Neon’s pooler for `DATABASE_URL`.

## 6. Seed demo data (once)

Seeding is **not** part of the Vercel build (so production data is not reset every deploy). Run it **once** against production:

**Option A — from your laptop**

```bash
# Temporarily point at production (or use `vercel env pull` to write .env.local)
export DATABASE_URL="postgresql://..."   # same as Vercel
export DIRECT_URL="postgresql://..."     # same as Vercel
export SESSION_SECRET="..."              # optional for seed; seed uses Prisma only

npm run db:seed
```

**Option B — Vercel CLI**

```bash
npx vercel link
npx vercel env pull .env.production.local
```

Then run `npm run db:seed` with those variables loaded in your shell (e.g. `export $(grep -v '^#' .env.production.local | xargs)` in bash, or paste `DATABASE_URL` / `DIRECT_URL` manually).

## 7. Smoke test

Open your `*.vercel.app` URL, log in with a seeded account (see README: e.g. `admin@coastaleats.demo` / `password`), and open **Schedule** and **Dashboard**.

## Notes

- **SSE** (`/api/stream`): works for typical demos on Vercel; very long-lived connections can be limited by serverless timeouts. For heavy realtime load, a dedicated Node host helps.
- **Cron / background jobs**: not required for this app’s core flows.
