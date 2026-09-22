# Production deploy

`deploy.sh` runs **on the production server**. It builds a tagged release beside
the live one, migrates the database, switches over atomically, health-checks,
and rolls itself back if the new release is unhealthy.

```
./deploy.sh deploy v1.4.0     # ship a tag
./deploy.sh rollback          # back to the previous release (seconds, no rebuild)
./deploy.sh status            # what is live, last deploy events
./deploy.sh list              # releases on disk
```

This covers the API and the admin/vendor panels. The storefront lives in its own
repository and deploys separately.

## Layout on the server

```
/home/ubuntu/happilee-prod/
├── repo/                    git clone, used only to create release worktrees
├── releases/
│   ├── 20260921101500-v1.3.0/
│   └── 20260921143000-v1.4.0/
├── current -> releases/20260921143000-v1.4.0      what is live
├── shared/                  secrets + config, linked into every release (chmod 700)
│   ├── api.env                  -> apps/api/.env
│   ├── admin.env.production     -> apps/admin/.env.production
│   ├── vendor.env.production    -> apps/vendor/.env.production
│   ├── ecosystem.config.cjs     pm2 definition for the API
│   └── deploy.env               optional: SMOKE_PUBLISHABLE_KEY=pk_...
├── backups/                 pre-migration pg_dump files (newest 10 kept)
└── deploy.log               who deployed which tag, when, and the result
```

Override paths and limits with environment variables — see the top of
`deploy.sh` (`APP_ROOT`, `KEEP_RELEASES`, `BUILD_HEAP_MB`, `MIN_FREE_MB`, …).

## First-time setup

1. **Server prerequisites:** git, bun, pm2, nginx, curl, `postgresql-client`
   (for `pg_dump`, matching the database's major version).
2. **Run setup:**
   ```
   ./deploy.sh setup
   ```
3. **Fill `shared/`** (every file `chmod 600`):
   - `api.env` — production API env. Must include the production `DATABASE_URL`,
     `REDIS_URL`, `JWT_SECRET`, `COOKIE_SECRET`, CORS values,
     `FIREBASE_PROJECT_ID`, `AREASENSE_API_URL`. Start from
     `apps/api/.env.template`. **Use fresh secrets — never copy dev or stage's.**
   - `admin.env.production`, `vendor.env.production` — `VITE_MERCUR_BACKEND_URL`
     pointing at the production API.
   - `ecosystem.config.cjs` — copy from this folder.
4. **GitHub Packages token** for `@happilee-app/*`, in the deploy user's
   `~/.npmrc` (never in the repo — see the repo's `.npmrc`):
   ```
   //npm.pkg.github.com/:_authToken=<PAT with read:packages only>
   ```
5. **nginx:** adapt `nginx.example.conf` (real hostnames), enable it, run certbot.
   The panels are served as static files from `current/`, so they switch with
   each deploy and need no process.
6. **First deploy**, then make pm2 survive reboots:
   ```
   ./deploy.sh deploy v1.0.0
   pm2 startup     # run the command it prints
   pm2 save
   ```

## Release checklist

1. Merge to `develop`, deploy to stage, verify on stage.
2. Run the integration tests locally — nothing runs them for you.
3. Merge to `main` and tag it:
   ```
   git tag -a v1.4.0 -m "v1.4.0" && git push origin v1.4.0
   ```
4. On the server: `./deploy.sh deploy v1.4.0`.

The script refuses a tag that is not on `main` (override with
`--allow-off-branch` only in an emergency) and refuses branch names outright.

## What a deploy does

| Step | While it runs |
|---|---|
| Check out the tag into a new `releases/` directory | old release serves traffic |
| `bun install --frozen-lockfile`, build packages and panels | old release serves traffic |
| `pg_dump` to `backups/`, then `medusa db:migrate` | old release serves traffic, on the migrated schema |
| Repoint `current`, `pm2 restart` the API | a few seconds of API restart |
| Health check `/health` (+ `/store/regions` if `SMOKE_PUBLISHABLE_KEY` set) | — |
| Unhealthy → repoint `current` back, restart, delete the failed release | — |

A build that fails removes its half-built release and leaves the live site
untouched. Deploys are serialised by a lock file.

## Things it cannot do for you

- **Migrations are not rolled back.** Rollback swaps code, not schema. Keep each
  release's migrations compatible with the release before it: add columns and
  tables freely; drop or rename them only in a *later* release, once nothing
  reads them. To undo a bad migration, restore from `backups/` — and know that
  loses writes made since.
- **The build competes with live traffic** for CPU and RAM. The script refuses to
  start below `MIN_FREE_MB` (2 GB) rather than stopping the API to make room.
  If builds regularly hit that, resize the instance or add swap.
- **Rollback can't reach a release that was pruned.** The newest 5 are kept.
- **Production must not share anything with dev or stage** — its own database,
  its own Redis, its own EC2, its own secrets.
