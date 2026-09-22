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
│   └── deploy.env               API_SECRET_ID=..., optional SMOKE_PUBLISHABLE_KEY=pk_...
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
   - `api.env` — **non-secret** API settings only: URLs, CORS, `REDIS_URL`,
     `AREASENSE_API_URL`, S3 bucket, etc. Start from `apps/api/.env.template`.
     Secrets go in Secrets Manager (next step), not here.
   - `admin.env.production`, `vendor.env.production` — `VITE_MERCUR_BACKEND_URL`
     pointing at the production API.
   - `deploy.env` — `API_SECRET_ID=<secret name>`.
   - `ecosystem.config.cjs` — copy from this folder.
   - Install the AWS CLI and the RDS CA bundle (TLS to the DB is verified):
     ```
     sudo curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
       -o /etc/ssl/certs/rds-global-bundle.pem
     ```
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

## Secrets (AWS Secrets Manager)

Secrets never live on disk. `start-api.sh` (pm2's entry point) and the deploy's
backup/migrate steps load them from one Secrets Manager secret into process
memory via `load-secrets.sh`, using the instance role.

**1. A dedicated database user for the app.** Do not let the app use the RDS
master user: its RDS-managed secret rotates every 7 days, and the API only reads
credentials at start. As the master user:

```sql
CREATE ROLE happilee_ecom LOGIN PASSWORD '<generate a long random one>';
CREATE DATABASE happilee_ecom OWNER happilee_ecom;
REVOKE ALL ON DATABASE happilee_ecom FROM PUBLIC;
```

**2. The secret** (e.g. `happilee-ecom/prod/api`), a JSON object — every key is
exported to the API as an environment variable:

```json
{
  "DB_HOST": "<rds endpoint>",
  "DB_PORT": "5432",
  "DB_NAME": "happilee_ecom",
  "DB_USERNAME": "happilee_ecom",
  "DB_PASSWORD": "<from step 1>",
  "JWT_SECRET": "<openssl rand -hex 48>",
  "COOKIE_SECRET": "<openssl rand -hex 48>",
  "PHONE_OTP_PEPPER": "<openssl rand -hex 32>",
  "HAPPILEE_SSO_SECRET": "<main app's production SSO secret>",
  "AREASENSE_API_KEY": "...",
  "WHATSAPP_ACCESS_TOKEN": "...",
  "WHATSAPP_PHONE_NUMBER_ID": "..."
}
```

`DATABASE_URL` is built from the `DB_*` keys with TLS verified against the RDS
CA bundle (`sslmode=verify-full`); set `DB_SSLMODE` to change that, or put a
full `DATABASE_URL` in the secret instead. Keep rotation **off**: the API reads
secrets only at start, so a rotation needs `pm2 restart happilee-api`.

**3. Least-privilege IAM** on the instance role — this one secret only:

```json
{
  "Effect": "Allow",
  "Action": "secretsmanager:GetSecretValue",
  "Resource": "arn:aws:secretsmanager:<region>:<account>:secret:happilee-ecom/prod/api-*"
}
```

Anyone with a shell on the server can still read the secret through the role;
this keeps secrets off disk, out of backups and AMIs, and audited in CloudTrail.

## Redis

`REDIS_URL` moves Medusa's event bus, workflow engine and locking onto Redis
(`apps/api/src/lib/runtime-config.ts`); without it they run in process memory,
losing events and workflow state on restart. For a local Redis, keep it bound to
localhost with `appendonly yes` and `maxmemory-policy noeviction` — evicting
keys would drop queued jobs.

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
