#!/bin/sh
set -eu

db_path="${ISME_DATABASE_PATH:-/app/data/isme.db}"

if [ ! -f "$db_path" ]; then
  mkdir -p "$(dirname "$db_path")"
  cp /app/defaults/isme.db "$db_path"
  echo "Initialized $db_path with the IsMe demo dataset."
fi

# Existing volumes are deliberately never overwritten here. Next.js runs
# src/instrumentation.ts before accepting traffic; it applies additive schema
# migrations to both newly initialized and existing databases.
exec node server.js
