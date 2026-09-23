#!/usr/bin/env bash
#
# Source this file to load the production API secrets from AWS Secrets Manager
# into the environment. Used by start-api.sh (at API start) and deploy.sh (for
# the pre-migration backup and the migrations). Secrets are only ever held in
# process memory — never written to disk.
#
#   API_SECRET_ID=happilee-ecom/prod/api  source load-secrets.sh
#
# The secret is a JSON object. Every key is exported as-is, e.g.:
#
#   {
#     "DB_HOST": "…rds.amazonaws.com", "DB_PORT": "5432",
#     "DB_NAME": "happilee_ecom", "DB_USERNAME": "happilee_ecom",
#     "DB_PASSWORD": "…",
#     "JWT_SECRET": "…", "COOKIE_SECRET": "…", "PHONE_OTP_PEPPER": "…",
#     "HAPPILEE_SSO_SECRET": "…", "AREASENSE_API_KEY": "…",
#     "WHATSAPP_ACCESS_TOKEN": "…", "WHATSAPP_PHONE_NUMBER_ID": "…"
#   }
#
# If DATABASE_URL is not in the secret it is built from the DB_* keys, with the
# password URL-encoded and TLS verified against the RDS CA bundle
# (override with DB_SSLMODE, e.g. "require").
#
# Needs: aws CLI, python3, and an instance role allowed
# secretsmanager:GetSecretValue on this one secret.

RDS_CA_BUNDLE="${RDS_CA_BUNDLE:-/etc/ssl/certs/rds-global-bundle.pem}"

load_api_secrets() {
  local secret_id="${API_SECRET_ID:-}"
  if [[ -z "$secret_id" ]]; then
    echo "load-secrets: API_SECRET_ID is not set" >&2
    return 1
  fi

  local json
  if ! json="$(aws secretsmanager get-secret-value \
      --secret-id "$secret_id" \
      --query SecretString --output text 2>/dev/null)"; then
    echo "load-secrets: cannot read secret '$secret_id' (instance role / network / name?)" >&2
    return 1
  fi

  # Turn the JSON into shell-safe `export KEY=value` lines. Keys must look like
  # env var names; values are quoted, so nothing in them is ever executed.
  local exports
  if ! exports="$(SECRET_JSON="$json" RDS_CA_BUNDLE="$RDS_CA_BUNDLE" python3 - <<'PY'
import json, os, re, shlex, sys
from urllib.parse import quote

try:
    data = json.loads(os.environ["SECRET_JSON"])
except Exception:
    sys.exit("load-secrets: secret is not valid JSON")
if not isinstance(data, dict):
    sys.exit("load-secrets: secret must be a JSON object")

out = {}
for key, value in data.items():
    if not re.fullmatch(r"[A-Z_][A-Z0-9_]*", key):
        sys.exit(f"load-secrets: invalid key name {key!r}")
    out[key] = "" if value is None else str(value)

if not out.get("DATABASE_URL") and out.get("DB_HOST"):
    missing = [k for k in ("DB_USERNAME", "DB_PASSWORD", "DB_NAME") if not out.get(k)]
    if missing:
        sys.exit("load-secrets: DATABASE_URL cannot be built, missing " + ", ".join(missing))
    sslmode = out.get("DB_SSLMODE", "verify-full")
    params = f"sslmode={sslmode}"
    if sslmode in ("verify-ca", "verify-full"):
        params += "&sslrootcert=" + quote(os.environ["RDS_CA_BUNDLE"], safe="/")
    out["DATABASE_URL"] = (
        "postgres://"
        + quote(out["DB_USERNAME"], safe="")
        + ":" + quote(out["DB_PASSWORD"], safe="")
        + "@" + out["DB_HOST"] + ":" + out.get("DB_PORT", "5432")
        + "/" + quote(out["DB_NAME"], safe="")
        + "?" + params
    )

for key, value in out.items():
    print(f"export {key}={shlex.quote(value)}")
PY
)"; then
    return 1
  fi

  eval "$exports"
}
