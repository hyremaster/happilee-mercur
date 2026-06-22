# Local Development Setup

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Bun | 1.x | Only package manager allowed — no npm/yarn/pnpm |
| Node.js | 18+ | Required by Medusa |
| PostgreSQL | 14+ | Must be running before starting |
| Redis | 6+ | Must be running before starting |

Check prerequisites:

```bash
bun --version
node --version
pg_isready
redis-cli ping   # should return PONG
```

---

## Step 1 — Clone and install

```bash
git clone https://github.com/mercurjs/mercur
cd mercur
bun install
```

---

## Step 2 — Create the database

```bash
createdb mercur
# or via psql:
psql -U postgres -c "CREATE DATABASE mercur;"
```

---

## Step 3 — Configure environment

Create `apps/api/.env`:

```env
DATABASE_URL=postgres://postgres@localhost:5432/mercur
REDIS_URL=redis://localhost:6379
STORE_CORS=http://localhost:8000
ADMIN_CORS=http://localhost:7000
VENDOR_CORS=http://localhost:7001
AUTH_CORS=http://localhost:7000,http://localhost:7001
JWT_SECRET=supersecret
COOKIE_SECRET=supersecret
```

Adjust `DATABASE_URL` username/password for your local Postgres setup.

---

## Step 4 — Build all packages

**This step is required before running migrations or starting the dev server.**
The API loads compiled JS from `node_modules/@mercurjs/core/.medusa/server/` —
if that directory is missing, migrations and server start will fail.

```bash
bun run build
```

Takes ~2 minutes. Wait for `Tasks: N successful, N total`.

---

## Step 5 — Run database migrations

```bash
cd apps/api
bunx medusa db:migrate
```

When prompted `Select tables to act upon` (for removed links), press **Enter**
to skip without deleting anything.

---

## Step 6 — Start development servers

**Important:** `bun run dev` from the repo root starts all services via Turborepo but
triggers `tsup --watch` for each package, which cleans compiled output before Vite
starts. This causes a race condition that breaks the Vite dep scan.

**Recommended approach — start services individually:**

**Terminal 1 — API:**
```bash
cd apps/api
node node_modules/.bin/medusa develop
```

**Terminal 2 — Vendor panel:**
```bash
cd apps/vendor
bun run dev
```

**Terminal 3 — Admin panel:**
```bash
cd apps/admin-test
bun run dev
```

Services:

| Service | URL | Description |
|---|---|---|
| API | http://localhost:9000 | Medusa + Mercur backend |
| Admin panel | http://localhost:7000 | Operator dashboard |
| Vendor panel | http://localhost:7001 | Seller dashboard |

---

## Adding a new vendor page

Drop a `page.tsx` with a default export under `apps/vendor/src/routes/<your-path>/`:

```
apps/vendor/src/routes/
  my-feature/
    page.tsx       ← becomes /my-feature route
```

Minimal `page.tsx`:

```tsx
export default function MyFeaturePage() {
  return <div>Hello from my feature</div>
}
```

Vite HMR picks it up automatically — no import or registration needed.
The page appears at `http://localhost:7001/my-feature` after the vendor app reloads.

---

## Adding a new admin page

Same pattern, but under `apps/admin-test/src/routes/`:

```
apps/admin-test/src/routes/
  my-admin-feature/
    page.tsx       ← becomes /my-admin-feature route at :7000
```

---

## Package locations

| What you're changing | Where code lives |
|---|---|
| Vendor UI pages | `packages/vendor/src/pages/` |
| Admin UI pages | `packages/admin/src/pages/` |
| Shared components | `packages/dashboard-shared/src/` |
| API routes | `packages/core/src/api/` |
| Workflows | `packages/core/src/workflows/` |
| DB modules | `packages/core/src/modules/` |

---

## Issues Encountered & Solutions

### Issue 1 — Migration fails with "Cannot find module"

**Error:**
```
Error: Cannot find module '.../@mercurjs/core/.medusa/server/src/with-mercur.js'
```

**Cause:** Packages not built. The API config imports compiled output from
`node_modules/@mercurjs/core/.medusa/server/`, which only exists after build.

**Fix:** Run `bun run build` from project root before any migration or server
start command.

---

### Issue 2 — Migration shows interactive "Select tables to DELETE" prompt

**Cause:** Medusa's link sync detects DB link tables for modules that no longer
exist in config (e.g., `reviews` module links from a previous schema state).

**Fix:** Press **Enter** at the prompt to submit with no selections — this
skips deletion and marks the DB as up-to-date. Nothing is deleted.

Automated (non-interactive) workaround:

```bash
echo "" | bunx medusa db:migrate
```

---

### Issue 3 — `redisUrl not found` warning during migration

**Log line:**
```
info: redisUrl not found. A fake redis instance will be used.
```

**Cause:** The migration command doesn't load `.env` from the API directory
the same way the dev server does, so `REDIS_URL` is not picked up.

**Impact:** None for migrations. The fake Redis is sufficient for schema
migration. The actual dev server uses real Redis from `.env`.

---

### Issue 4 — `bun run dev` causes Vite dep scan failure for `@mercurjs/vendor`

**Error:**
```
Error: Failed to resolve entry for package "@mercurjs/vendor".
The package may have incorrect main/module/exports specified in its package.json.
```

**Cause:** Turbo starts `tsup --watch` for `packages/vendor` in parallel with Vite for
`apps/vendor`. The `clean: true` in `tsup.config.ts` deletes the compiled `dist/` output
just before Vite tries to scan it, so Vite can't resolve `@mercurjs/vendor`.

**Fix:** Run `apps/vendor` Vite separately (not via root `bun run dev`) AFTER building:

```bash
# Build packages first
bun run build
# Start vendor Vite directly
cd apps/vendor && bun run dev
```

Similarly for the API, build `packages/core` first:
```bash
cd packages/core && bun run build
cd apps/api && node node_modules/.bin/medusa develop
```

---

### Issue 5 — `i18next` not found by Vite in vendor or admin app

**Error:**
```
Error: The following dependencies are imported but could not be resolved:
  i18next (imported by .../packages/vendor/dist/chunk-*.js)
Are they installed?
```

Same error appears for the admin app referencing `packages/admin/dist/chunk-*.js`.

**Cause:** Both `packages/vendor` and `packages/admin` list `i18next` in their own
`dependencies`; tsup externalizes it as expected for a library. But neither
`apps/vendor` nor `apps/admin-test` listed `i18next` directly. Bun stores `i18next`
in `.bun/` internal cache (not a standard `node_modules/i18next` symlink), so Vite's
scanner can't find it.

**Fix:** Add `i18next` explicitly to **both** app `package.json` files:

`apps/vendor/package.json` and `apps/admin-test/package.json`:
```json
"i18next": "23.7.11"
```
Then run `bun install` from the repo root.

---

### Issue 6 — `Failed to resolve import "" from "virtual:mercur/components"`

**Error:**
```
[plugin:vite:import-analysis] Failed to resolve import "" from "virtual:mercur/components"
import _StoreSetup from ""/path/to/store-setup""
```

**Cause:** Bug in `packages/dashboard-sdk/src/virtual-modules.ts` line 69.
`JSON.stringify(resolvedPath)` inside a template string that already wraps the value
in `"..."` produces `""path""` — a double-quoted path that is not a valid module
specifier.

**Fix applied** (already committed): Change line 69 from:
```ts
imports.push(`import _${name} from "${JSON.stringify(resolvedPath)}"`)
```
to:
```ts
imports.push(`import _${name} from "${resolvedPath}"`)
```

After the fix, rebuild `packages/dashboard-sdk` and restart the Vite apps:
```bash
cd packages/dashboard-sdk && bun run build
cd apps/vendor && bun run dev       # terminal 1
cd apps/admin-test && bun run dev   # terminal 2
```

---

### Issue 7 — Knex times out connecting to AWS RDS even though `psql` works

**Symptom:**
```
warn: Pg connection failed to connect to the database. Retrying...
{"name":"KnexTimeoutError","sql":"SELECT 1"}
```

**Cause:** AWS RDS requires SSL. `psql` tries SSL automatically and falls back gracefully,
but Knex (used by Medusa) does not negotiate SSL unless told explicitly.

**Fix:** Add SSL params to `DATABASE_URL` in `apps/api/.env`:
```env
DATABASE_URL=postgres://user:pass@host.rds.amazonaws.com:5432/dbname?ssl=true&sslmode=no-verify
```

`sslmode=no-verify` skips RDS certificate chain verification (acceptable for development).
For production, use the RDS CA bundle and `sslmode=require`.

---

## Verification

After setup, confirm everything works:

```bash
# API health
curl http://localhost:9000/health
# expected: OK

# Vendor panel
curl -s -o /dev/null -w "%{http_code}" http://localhost:7001
# expected: 200

# Test page (after adding dummy route)
# Open http://localhost:7001/test-page in browser
```
