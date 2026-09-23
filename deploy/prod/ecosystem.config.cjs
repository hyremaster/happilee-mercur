// pm2 process for the production API. Copy to $APP_ROOT/shared/ on the server.
//
// Only the API runs under pm2. The admin and vendor panels are static builds
// served by nginx straight from $APP_ROOT/current (see nginx.example.conf) —
// `vite preview` is a local preview tool, not a production server.
//
// The script goes through the `current` symlink, so `pm2 restart` after a
// deploy or rollback starts whichever release `current` points at.
//
// start-api.sh loads the secrets from AWS Secrets Manager (API_SECRET_ID) into
// the process at start, so they never sit in pm2's saved state or on disk.

const APP_ROOT = process.env.APP_ROOT || "/home/ubuntu/happilee-prod"

module.exports = {
  apps: [
    {
      name: "happilee-api",
      cwd: `${APP_ROOT}/current`,
      script: `${APP_ROOT}/current/deploy/prod/start-api.sh`,
      interpreter: "bash",
      env: {
        NODE_ENV: "production",
        API_SECRET_ID: process.env.API_SECRET_ID || "happilee-ecom/prod/api",
      },
      // Medusa boots in ~10-15s; don't count that as a crash loop.
      min_uptime: "30s",
      max_restarts: 10,
      restart_delay: 5000,
      kill_timeout: 15000,
      max_memory_restart: "1500M",
      time: true,
    },
  ],
}
