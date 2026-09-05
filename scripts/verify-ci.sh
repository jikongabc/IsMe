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

audit_once() {
  npm audit --audit-level=high
}

is_quick_audit_400_retirement_failure() {
  local output_file="$1"

  grep -Eqi 'https?://[^[:space:]]+/-/npm/v1/security/audits/quick([^[:alnum:]_-]|$)' "$output_file" \
    && grep -Eqi '(^|[^0-9])400([^0-9]|$)' "$output_file" \
    && grep -Eqi 'bad[[:space:]_-]+request|retir(e|ed|ing|ement)' "$output_file"
}

is_retryable_audit_failure() {
  local output_file="$1"

  # A vulnerability or lockfile failure always wins over transport evidence.
  if grep -Eqi 'lockfile|(severity:[[:space:]]*|[[:digit:]]+[[:space:]]+)(high|critical)|"(high|critical)"[[:space:]]*:[[:space:]]*[1-9]' "$output_file"; then
    return 1
  fi

  # npm's retiring Quick Audit endpoint has returned HTTP 400 / Bad Request
  # together with the misleading text "Invalid package tree". Retry only when
  # all three pieces of that incident signature are present.
  if is_quick_audit_400_retirement_failure "$output_file"; then
    return 0
  fi

  # Outside the exact incident signature, package-tree failures are local and
  # must not be retried.
  if grep -Eqi 'invalid package tree' "$output_file"; then
    return 1
  fi

  grep -Eqi \
    '((408|429|5[0-9][0-9]).*https?://[^[:space:]]+/-/npm/v1/security/audits/|https?://[^[:space:]]+/-/npm/v1/security/audits/.*(408|429|5[0-9][0-9]))' \
    "$output_file"
}

run_dependency_audit() {
  local attempt=1
  local max_attempts=2
  local classification
  local output_file
  output_file="$(mktemp "${TMPDIR:-/tmp}/isme-audit.XXXXXX")"

  while (( attempt <= max_attempts )); do
    local started=$SECONDS
    local exit_code
    : > "$output_file"

    if audit_once >"$output_file" 2>&1; then
      exit_code=0
    else
      exit_code=$?
    fi

    cat "$output_file"

    if (( exit_code == 0 )); then
      classification="passed"
      if (( attempt == 2 )); then
        classification="recovered_after_external_transient"
      fi
      printf 'audit classification=%s attempt=%s elapsed_seconds=%s exit_code=0\n' \
        "$classification" "$attempt" "$((SECONDS - started))"
      rm -f -- "$output_file"
      return 0
    fi

    if is_retryable_audit_failure "$output_file"; then
      if (( attempt == 1 )); then
        printf 'audit classification=external_transient_candidate attempt=1 elapsed_seconds=%s exit_code=%s retry=once\n' \
          "$((SECONDS - started))" "$exit_code" >&2
        attempt=2
        continue
      fi
      classification="external_transient_retry_exhausted"
    elif (( attempt == 2 )); then
      classification="non_retryable_failure_after_retry"
    else
      classification="non_retryable_failure"
    fi

    printf 'audit classification=%s attempt=%s elapsed_seconds=%s exit_code=%s retry=none\n' \
      "$classification" "$attempt" "$((SECONDS - started))" "$exit_code" >&2
    rm -f -- "$output_file"
    return "$exit_code"
  done
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
  run_required_step dependency-tree npm ls --all
  verify_hash_match package.json "$package_hash" "$(hash_file package.json)"
  verify_hash_match package-lock.json "$lock_hash" "$(hash_file package-lock.json)"
  run_required_step lint npm run lint
  run_required_step unit-tests npm test
  run_dependency_audit

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
