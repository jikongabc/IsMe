#!/usr/bin/env bash
set -euo pipefail

# Bootstrap Let's Encrypt for the HTTPS compose overlay.
# Usage:
#   DOMAIN=example.com CERTBOT_EMAIL=you@example.com ./scripts/init-letsencrypt.sh
# Optional:
#   CERTBOT_STAGING=1  # use Let's Encrypt staging CA

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DOMAIN="${DOMAIN:-}"
EMAIL="${CERTBOT_EMAIL:-}"
PUBLIC_SITE_URL="${SITE_URL:-}"
STAGING="${CERTBOT_STAGING:-0}"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.https.yml)
RSA_KEY_SIZE="${RSA_KEY_SIZE:-4096}"
DATA_PATH="$ROOT/deploy/certbot"
LIVE_PATH="$DATA_PATH/conf/live/isme"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Set DOMAIN and CERTBOT_EMAIL (env or .env)." >&2
  exit 1
fi

case "$PUBLIC_SITE_URL" in
  "https://$DOMAIN"|"https://$DOMAIN/"*) ;;
  *)
    echo "Set SITE_URL=https://$DOMAIN in .env before requesting the production certificate." >&2
    exit 1
    ;;
esac

mkdir -p "$DATA_PATH/conf" "$DATA_PATH/www"

if [[ ! -f "$LIVE_PATH/fullchain.pem" ]]; then
  echo "==> creating temporary self-signed cert so nginx can start"
  mkdir -p "$LIVE_PATH"
  docker run --rm -v "$DATA_PATH/conf:/etc/letsencrypt" alpine/openssl \
    req -x509 -nodes -newkey "rsa:$RSA_KEY_SIZE" -days 1 \
    -keyout /etc/letsencrypt/live/isme/privkey.pem \
    -out /etc/letsencrypt/live/isme/fullchain.pem \
    -subj "/CN=$DOMAIN"
fi

echo "==> starting stack with HTTPS overlay"
"${COMPOSE[@]}" up -d nginx web

STAGING_ARG=()
if [[ "$STAGING" == "1" ]]; then
  STAGING_ARG=(--staging)
fi

echo "==> requesting Let's Encrypt certificate for $DOMAIN"
"${COMPOSE[@]}" run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  "${STAGING_ARG[@]}" \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --cert-name isme \
  --force-renewal

echo "==> reloading nginx"
"${COMPOSE[@]}" exec nginx nginx -s reload

echo "HTTPS ready: https://$DOMAIN"
echo "Keep the stack up with:"
echo "  docker compose -f docker-compose.yml -f docker-compose.https.yml up -d"
