#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ci_tmp_dir=""

log_step() {
  printf 'ci step=%s elapsed_seconds=%s exit_code=%s\n' "$1" "$2" "$3"
}

run_required_step() {
  local name="$1"
  shift
  local started=$SECONDS
  local exit_code

  if "$@"; then
    exit_code=0
  else
    exit_code=$?
  fi

  log_step "$name" "$((SECONDS - started))" "$exit_code"
  return "$exit_code"
}

hash_file() {
  sha256sum "$1" | awk '{print $1}'
}

verify_hash_match() {
  local label="$1"
  local before="$2"
  local after="$3"

  if [[ "$before" != "$after" ]]; then
    printf 'ci invariant=%s classification=drift exit_code=1\n' "$label" >&2
    return 1
  fi

  printf 'ci invariant=%s classification=unchanged exit_code=0\n' "$label"
}

run_dependency_audit() {
  node scripts/audit-security-policy.mjs
}

run_sharp_smoke() {
  node -e '
const sharp = require("sharp");

(async () => {
  const input = await sharp({
    create: {
      width: 2,
      height: 3,
      channels: 3,
      background: { r: 12, g: 34, b: 56 },
    },
  }).png().toBuffer();
  const inputMetadata = await sharp(input).metadata();
  const output = await sharp(input).resize(1, 1).png().toBuffer();
  const outputMetadata = await sharp(output).metadata();

  if (
    inputMetadata.width !== 2 ||
    inputMetadata.height !== 3 ||
    inputMetadata.format !== "png" ||
    outputMetadata.width !== 1 ||
    outputMetadata.height !== 1 ||
    outputMetadata.format !== "png" ||
    output.length === 0
  ) {
    throw new Error("sharp metadata/resize smoke invariant failed");
  }

  process.stdout.write(JSON.stringify({
    architecture: process.arch,
    platform: process.platform,
    input: {
      width: inputMetadata.width,
      height: inputMetadata.height,
      format: inputMetadata.format,
    },
    output: {
      width: outputMetadata.width,
      height: outputMetadata.height,
      format: outputMetadata.format,
      bytes: output.length,
    },
  }) + "\n");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
'
}

verify_toolchain() {
  local expected_node
  local expected_npm
  local actual_node
  local actual_npm

  expected_node="$(tr -d '[:space:]' < .nvmrc)"
  expected_npm="$(node -p "require('./package.json').packageManager")"
  [[ "$expected_npm" == npm@* ]] || {
    printf 'Unsupported packageManager: %s\n' "$expected_npm" >&2
    return 1
  }
  expected_npm="${expected_npm#npm@}"
  actual_node="$(node --version)"
  actual_node="${actual_node#v}"
  actual_npm="$(npm --version)"

  printf 'toolchain node=%s npm=%s\n' "$actual_node" "$actual_npm"
  [[ "$actual_node" == "$expected_node" ]] || {
    printf 'Expected Node %s, got %s\n' "$expected_node" "$actual_node" >&2
    return 1
  }
  [[ "$actual_npm" == "$expected_npm" ]] || {
    printf 'Expected npm %s, got %s\n' "$expected_npm" "$actual_npm" >&2
    return 1
  }
}

cleanup() {
  if [[ -n "$ci_tmp_dir" && -d "$ci_tmp_dir" ]]; then
    rm -rf -- "$ci_tmp_dir"
  fi
}

install_playwright() {
  if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
    npm exec -c 'playwright install --with-deps chromium'
  else
    # Local agent sandboxes may expose a read-only shared browser cache. List
    # what is available without taking its write lock; E2E launch is the final
    # readiness check. GitHub runners always install the browser and OS deps.
    npm exec -c 'playwright install --list'
  fi
}

main() {
  cd "$repo_root"

  local initial_status
  local initial_diff_hash
  local package_hash
  local lock_hash
  initial_status="$(git status --short)"
  initial_diff_hash="$(git diff --binary --no-ext-diff HEAD | sha256sum | awk '{print $1}')"
  package_hash="$(hash_file package.json)"
  lock_hash="$(hash_file package-lock.json)"
  ci_tmp_dir="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/isme-ci.XXXXXX")"
  trap cleanup EXIT

  run_required_step toolchain verify_toolchain
  run_required_step npm-ci npm ci
  verify_hash_match package.json "$package_hash" "$(hash_file package.json)"
  verify_hash_match package-lock.json "$lock_hash" "$(hash_file package-lock.json)"
  run_required_step policy-self-test node scripts/audit-security-policy.mjs --self-test
  run_dependency_audit
  run_required_step sharp-smoke run_sharp_smoke
  run_required_step lint npm run lint
  run_required_step unit-tests npm test

  # Compilation must not depend on demo seeding or a pre-populated database.
  run_required_step empty-db-build env ISME_DATABASE_PATH="$ci_tmp_dir/isme-ci-empty.db" npm run build
  run_required_step db-migrate env ISME_DATABASE_PATH="$ci_tmp_dir/isme-ci.db" npm run db:migrate
  run_required_step db-seed env ISME_DATABASE_PATH="$ci_tmp_dir/isme-ci.db" npm run db:seed
  run_required_step playwright-install install_playwright
  run_required_step e2e env ISME_DATABASE_PATH="$ci_tmp_dir/isme-ci.db" npm run test:e2e

  verify_hash_match tracked-diff "$initial_diff_hash" \
    "$(git diff --binary --no-ext-diff HEAD | sha256sum | awk '{print $1}')"
  [[ "$(git status --short)" == "$initial_status" ]] || {
    printf 'ci invariant=worktree-status classification=drift exit_code=1\n' >&2
    return 1
  }
  printf 'ci invariant=worktree-status classification=unchanged exit_code=0\n'
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
