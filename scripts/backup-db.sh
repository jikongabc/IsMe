#!/usr/bin/env bash
set -euo pipefail

# WAL-safe SQLite backup via better-sqlite3 backup API.
# Usage:
#   ./scripts/backup-db.sh
#   ISME_DATABASE_PATH=./data/isme.db ./scripts/backup-db.sh
#   ./scripts/backup-db.sh --docker
#   ./scripts/backup-db.sh /path/to/out.db

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${BACKUP_DIR:-$ROOT/backups}"
mkdir -p "$OUT_DIR"

if [[ "${1:-}" == "--docker" ]]; then
  CONTAINER="$(docker compose -f "$ROOT/docker-compose.yml" ps -q web)"
  if [[ -z "$CONTAINER" ]]; then
    echo "web container not running" >&2
    exit 1
  fi
  DEST="$OUT_DIR/isme-$STAMP.db"
  REMOTE="/tmp/isme-backup-$STAMP.db"
  # Snapshot inside the container so WAL pages are included.
  docker exec \
    -e ISME_DATABASE_PATH=/app/data/isme.db \
    "$CONTAINER" \
    node -e "
const Database = require('better-sqlite3');
const fs = require('fs');
const src = process.env.ISME_DATABASE_PATH || '/app/data/isme.db';
const dest = process.argv[1];
if (!fs.existsSync(src)) { console.error('missing ' + src); process.exit(1); }
const db = new Database(src, { readonly: true, fileMustExist: true });
db.backup(dest).then(() => { db.close(); console.log('ok'); }).catch((e) => {
  console.error(e); process.exit(1);
});
" "$REMOTE"
  docker cp "$CONTAINER:$REMOTE" "$DEST"
  docker exec "$CONTAINER" rm -f "$REMOTE" || true
  echo "backed up docker db -> $DEST"
  exit 0
fi

if [[ -n "${1:-}" && "${1:-}" != --* ]]; then
  DEST="$1"
else
  DEST="$OUT_DIR/isme-$STAMP.db"
fi

cd "$ROOT"
npx --yes tsx scripts/backup-db.ts "$DEST"
