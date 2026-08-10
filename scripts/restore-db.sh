#!/usr/bin/env bash
set -euo pipefail

# Restore IsMe SQLite from a standalone backup.
#
# Usage:
#   ./scripts/restore-db.sh backups/isme-YYYYMMDD-HHMMSS.db
#   ./scripts/restore-db.sh backups/isme-YYYYMMDD-HHMMSS.db --docker
#
# Local mode refuses to continue while the database is held open. Docker mode
# creates an online safety snapshot, stops `web`, swaps the database on the
# named volume, then commits only after the service becomes healthy.

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)"
SRC_INPUT="${1:-}"
MODE="${2:-}"

usage() {
  echo "usage: $0 <backup.db> [--docker]" >&2
}

fail() {
  echo "restore aborted: $*" >&2
  exit 1
}

if [[ -z "$SRC_INPUT" ]]; then
  usage
  exit 1
fi

if [[ -n "$MODE" && "$MODE" != "--docker" ]]; then
  usage
  exit 1
fi

if [[ ! -f "$SRC_INPUT" ]]; then
  fail "backup file does not exist: $SRC_INPUT"
fi

SRC="$(CDPATH= cd -- "$(dirname -- "$SRC_INPUT")" && pwd -P)/$(basename -- "$SRC_INPUT")"

# A copied SQLite main file is not a valid backup when it still depends on WAL.
if [[ -e "${SRC}-wal" || -e "${SRC}-shm" ]]; then
  fail "backup has SQLite sidecars; create a standalone snapshot with 'npm run backup' first"
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)-$$"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
if [[ "$BACKUP_DIR" != /* ]]; then
  BACKUP_DIR="$ROOT/${BACKUP_DIR#./}"
fi

integrity_check_local() {
  local database_path="$1"

  node - "$ROOT" "$database_path" <<'NODE'
const path = require("node:path");
const projectRoot = process.argv[2];
const databasePath = process.argv[3];
const Database = require(path.join(projectRoot, "node_modules", "better-sqlite3"));

let db;
try {
  db = new Database(databasePath, { readonly: true, fileMustExist: true });
  const rows = db.pragma("integrity_check");
  const results = rows.flatMap((row) => Object.values(row).map(String));
  if (results.length !== 1 || results[0].toLowerCase() !== "ok") {
    throw new Error(results.join("; ") || "integrity_check returned no result");
  }
} catch (error) {
  console.error(`SQLite integrity_check failed for ${databasePath}: ${error.message}`);
  process.exitCode = 1;
} finally {
  db?.close();
}
NODE
}

backup_sqlite_local() {
  local source_path="$1"
  local destination_path="$2"

  node - "$ROOT" "$source_path" "$destination_path" <<'NODE'
const path = require("node:path");
const projectRoot = process.argv[2];
const sourcePath = process.argv[3];
const destinationPath = process.argv[4];
const Database = require(path.join(projectRoot, "node_modules", "better-sqlite3"));

const db = new Database(sourcePath, { readonly: true, fileMustExist: true });
db.pragma("busy_timeout = 10000");
db.backup(destinationPath)
  .then(() => db.close())
  .catch((error) => {
    db.close();
    console.error(`SQLite safety backup failed: ${error.message}`);
    process.exitCode = 1;
  });
NODE
}

assert_database_is_closed() {
  local database_path="$1"
  local -a files=("$database_path")
  local sidecar

  for sidecar in "${database_path}-wal" "${database_path}-shm"; do
    if [[ -e "$sidecar" ]]; then
      files+=("$sidecar")
    fi
  done

  if command -v fuser >/dev/null 2>&1; then
    local holders
    holders="$(fuser "${files[@]}" 2>/dev/null || true)"
    if [[ -n "${holders//[[:space:]]/}" ]]; then
      fail "database is open by process(es):${holders}. Stop the local Next.js process and retry"
    fi
    return
  fi

  if command -v lsof >/dev/null 2>&1; then
    local holders
    holders="$(lsof -t -- "${files[@]}" 2>/dev/null || true)"
    if [[ -n "${holders//[[:space:]]/}" ]]; then
      fail "database is open by process(es): ${holders//$'\n'/ }. Stop the local Next.js process and retry"
    fi
    return
  fi

  fail "cannot prove the database is closed (install 'fuser' or 'lsof')"
}

restore_local() (
  local database_path="${ISME_DATABASE_PATH:-$ROOT/data/isme.db}"
  if [[ "$database_path" != /* ]]; then
    database_path="$ROOT/${database_path#./}"
  fi

  if [[ -L "$database_path" ]]; then
    fail "refusing to replace a database symlink: $database_path"
  fi

  local database_dir
  database_dir="$(dirname -- "$database_path")"
  mkdir -p "$database_dir" "$BACKUP_DIR"

  if [[ "$(readlink -f -- "$SRC")" == "$(readlink -m -- "$database_path")" ]]; then
    fail "source and destination are the same file"
  fi

  integrity_check_local "$SRC"

  local target_existed=0
  local safety_snapshot=""
  if [[ -e "$database_path" ]]; then
    target_existed=1
    assert_database_is_closed "$database_path"
    safety_snapshot="$BACKUP_DIR/pre-restore-local-$STAMP.db"
    backup_sqlite_local "$database_path" "$safety_snapshot"
    integrity_check_local "$safety_snapshot"
    echo "Safety snapshot: $safety_snapshot"
  fi

  local staged
  staged="$(mktemp "$database_dir/.isme-restore.XXXXXX")"
  local replacement_installed=0

  on_local_exit() {
    local status=$?
    trap - EXIT
    rm -f -- "$staged"

    if [[ "$status" -ne 0 && "$replacement_installed" -eq 1 ]]; then
      echo "Restore failed; rolling back the local database." >&2
      rm -f -- "${database_path}-wal" "${database_path}-shm"
      if [[ "$target_existed" -eq 1 && -n "$safety_snapshot" && -f "$safety_snapshot" ]]; then
        local rollback_staged
        rollback_staged="$(mktemp "$database_dir/.isme-rollback.XXXXXX")"
        cp -- "$safety_snapshot" "$rollback_staged"
        mv -f -- "$rollback_staged" "$database_path"
      else
        rm -f -- "$database_path"
      fi
    fi

    exit "$status"
  }
  trap on_local_exit EXIT

  cp -- "$SRC" "$staged"
  integrity_check_local "$staged"

  # The replacement is on the same filesystem, so rename(2) is atomic.
  mv -f -- "$staged" "$database_path"
  replacement_installed=1
  rm -f -- "${database_path}-wal" "${database_path}-shm"
  integrity_check_local "$database_path"

  replacement_installed=0
  trap - EXIT
  echo "Restored $SRC -> $database_path"
  if [[ -n "$safety_snapshot" ]]; then
    echo "Previous database retained at $safety_snapshot"
  fi
  echo "Start the Next.js process; startup migrations will update older schemas."
)

docker_integrity_check() {
  local database_path="$1"

  "${COMPOSE[@]}" run --rm --no-deps \
    --env "RESTORE_CHECK_PATH=$database_path" \
    --entrypoint node web -e '
const Database = require("better-sqlite3");
let db;
try {
  db = new Database(process.env.RESTORE_CHECK_PATH, { readonly: true, fileMustExist: true });
  const rows = db.pragma("integrity_check");
  const results = rows.flatMap((row) => Object.values(row).map(String));
  if (results.length !== 1 || results[0].toLowerCase() !== "ok") {
    throw new Error(results.join("; ") || "integrity_check returned no result");
  }
} catch (error) {
  console.error(`SQLite integrity_check failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  db?.close();
}
'
}

wait_for_docker_health() {
  local timeout_seconds="${RESTORE_HEALTH_TIMEOUT:-90}"
  local deadline=$((SECONDS + timeout_seconds))
  local container_id health

  while (( SECONDS < deadline )); do
    container_id="$("${COMPOSE[@]}" ps -q web)"
    if [[ -n "$container_id" ]]; then
      health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
      if [[ "$health" == "healthy" || "$health" == "running" ]]; then
        return 0
      fi
      if [[ "$health" == "exited" || "$health" == "dead" ]]; then
        return 1
      fi
    fi
    sleep 2
  done

  return 1
}

restore_docker() (
  COMPOSE=(docker compose -f "$ROOT/docker-compose.yml")

  command -v docker >/dev/null 2>&1 || fail "docker is not installed"
  docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is not available"

  local container_id
  container_id="$("${COMPOSE[@]}" ps -aq web | head -n 1)"
  if [[ -z "$container_id" ]]; then
    "${COMPOSE[@]}" create --no-recreate web >/dev/null
    container_id="$("${COMPOSE[@]}" ps -aq web | head -n 1)"
  fi
  [[ -n "$container_id" ]] || fail "could not create or find the Docker web container"

  local database_path
  database_path="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container_id" \
    | sed -n 's/^ISME_DATABASE_PATH=//p' | head -n 1)"
  database_path="${database_path:-/app/data/isme.db}"
  if [[ "$database_path" != /app/data/* || "$database_path" == */ ]]; then
    fail "Docker restore target must be a file inside /app/data (got: $database_path)"
  fi

  local database_dir="${database_path%/*}"
  local staged_candidate="$database_dir/.isme-restore-$STAMP.db"
  local staged_rollback="$database_dir/.isme-rollback-$STAMP.db"
  local target_existed=0
  local restore_pending=0
  local web_stopped=0
  local safety_snapshot=""

  # Validate exactly the standalone file that will be copied into the volume.
  "${COMPOSE[@]}" run --rm --no-deps \
    --volume "$SRC:/restore/source.db:ro" \
    --env RESTORE_CHECK_PATH=/restore/source.db \
    --entrypoint node web -e '
const Database = require("better-sqlite3");
let db;
try {
  db = new Database(process.env.RESTORE_CHECK_PATH, { readonly: true, fileMustExist: true });
  const rows = db.pragma("integrity_check");
  const results = rows.flatMap((row) => Object.values(row).map(String));
  if (results.length !== 1 || results[0].toLowerCase() !== "ok") {
    throw new Error(results.join("; ") || "integrity_check returned no result");
  }
} catch (error) {
  console.error(`SQLite integrity_check failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  db?.close();
}
'

  if "${COMPOSE[@]}" run --rm --no-deps \
    --env "RESTORE_DB_PATH=$database_path" \
    --entrypoint /bin/sh web -c 'test -f "$RESTORE_DB_PATH"'; then
    target_existed=1
    mkdir -p "$BACKUP_DIR"
    safety_snapshot="$BACKUP_DIR/pre-restore-docker-$STAMP.db"

    # better-sqlite3 backup() produces a consistent snapshot even while WAL is active.
    "${COMPOSE[@]}" run --rm --no-deps \
      --env "RESTORE_DB_PATH=$database_path" \
      --env "RESTORE_ROLLBACK_PATH=$staged_rollback" \
      --entrypoint node web -e '
const Database = require("better-sqlite3");
const db = new Database(process.env.RESTORE_DB_PATH, { readonly: true, fileMustExist: true });
db.pragma("busy_timeout = 10000");
db.backup(process.env.RESTORE_ROLLBACK_PATH)
  .then(() => db.close())
  .catch((error) => {
    db.close();
    console.error(`SQLite safety backup failed: ${error.message}`);
    process.exitCode = 1;
  });
'
    docker_integrity_check "$staged_rollback"
    docker cp "$container_id:$staged_rollback" "$safety_snapshot"
    echo "Safety snapshot: $safety_snapshot"
  fi

  # Stage with the target's ownership/mode. The helper runs as root only so it
  # can read restrictive host backup files; the application never runs as root.
  "${COMPOSE[@]}" run --rm --no-deps --user 0:0 \
    --volume "$SRC:/restore/source.db:ro" \
    --env "RESTORE_DB_PATH=$database_path" \
    --env "RESTORE_CANDIDATE_PATH=$staged_candidate" \
    --entrypoint /bin/sh web -c '
set -eu
cp /restore/source.db "$RESTORE_CANDIDATE_PATH"
if [ -e "$RESTORE_DB_PATH" ]; then
  chown --reference="$RESTORE_DB_PATH" "$RESTORE_CANDIDATE_PATH"
  chmod --reference="$RESTORE_DB_PATH" "$RESTORE_CANDIDATE_PATH"
else
  chown 1001:1001 "$RESTORE_CANDIDATE_PATH"
  chmod 0640 "$RESTORE_CANDIDATE_PATH"
fi
'
  docker_integrity_check "$staged_candidate"

  rollback_docker() {
    set +e
    echo "Restore failed; rolling back the Docker database." >&2
    "${COMPOSE[@]}" stop web >/dev/null 2>&1

    if [[ "$target_existed" -eq 1 ]]; then
      "${COMPOSE[@]}" run --rm --no-deps --user 0:0 \
        --env "RESTORE_DB_PATH=$database_path" \
        --env "RESTORE_ROLLBACK_PATH=$staged_rollback" \
        --entrypoint /bin/sh web -c '
set -eu
test -f "$RESTORE_ROLLBACK_PATH"
rm -f "${RESTORE_DB_PATH}-wal" "${RESTORE_DB_PATH}-shm"
mv -f "$RESTORE_ROLLBACK_PATH" "$RESTORE_DB_PATH"
'
    else
      "${COMPOSE[@]}" run --rm --no-deps --user 0:0 \
        --env "RESTORE_DB_PATH=$database_path" \
        --entrypoint /bin/sh web -c '
rm -f "$RESTORE_DB_PATH" "${RESTORE_DB_PATH}-wal" "${RESTORE_DB_PATH}-shm"
'
    fi

    "${COMPOSE[@]}" start web >/dev/null 2>&1
    echo "Rollback attempted. Safety snapshot remains at: ${safety_snapshot:-<no previous database>}" >&2
  }

  on_docker_exit() {
    local status=$?
    trap - EXIT
    if [[ "$status" -ne 0 ]]; then
      if [[ "$restore_pending" -eq 1 ]]; then
        rollback_docker
      elif [[ "$web_stopped" -eq 1 ]]; then
        "${COMPOSE[@]}" start web >/dev/null 2>&1 || true
      fi
    fi
    exit "$status"
  }
  trap on_docker_exit EXIT

  "${COMPOSE[@]}" stop web
  web_stopped=1
  restore_pending=1

  # With web stopped, remove the old WAL/SHM pair and atomically rename the
  # staged standalone database over the target on the same named volume.
  "${COMPOSE[@]}" run --rm --no-deps --user 0:0 \
    --env "RESTORE_DB_PATH=$database_path" \
    --env "RESTORE_CANDIDATE_PATH=$staged_candidate" \
    --entrypoint /bin/sh web -c '
set -eu
test -f "$RESTORE_CANDIDATE_PATH"
rm -f "${RESTORE_DB_PATH}-wal" "${RESTORE_DB_PATH}-shm"
mv -f "$RESTORE_CANDIDATE_PATH" "$RESTORE_DB_PATH"
'

  "${COMPOSE[@]}" start web
  web_stopped=0
  if ! wait_for_docker_health; then
    fail "restored service did not become healthy within ${RESTORE_HEALTH_TIMEOUT:-90}s"
  fi

  docker_integrity_check "$database_path"
  restore_pending=0
  trap - EXIT

  # The host-side snapshot is intentionally retained; only remove volume temps.
  docker exec "$container_id" rm -f -- "$staged_candidate" "$staged_rollback" >/dev/null 2>&1 || true

  echo "Restored $SRC -> Docker $database_path"
  if [[ -n "$safety_snapshot" ]]; then
    echo "Previous database retained at $safety_snapshot"
  fi
  echo "The healthy startup also applied any pending additive schema migrations."
)

if [[ "$MODE" == "--docker" ]]; then
  restore_docker
else
  restore_local
fi
