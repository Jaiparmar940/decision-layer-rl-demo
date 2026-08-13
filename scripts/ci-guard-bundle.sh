#!/usr/bin/env bash
# Fail if client src or Vite bundle leak remote-eval API tokens / keys.
# Usage:
#   bash scripts/ci-guard-bundle.sh           # scan src/ + dist/assets/
#   bash scripts/ci-guard-bundle.sh --self-test
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PATTERN='OPENROUTER|openrouter\.ai|OPENROUTER_API_KEY|sk-or-'

if ! command -v grep >/dev/null 2>&1; then
  echo "[ci-guard] FATAL: grep not found on PATH — cannot scan; refusing to pass" >&2
  exit 1
fi

# Prefer GNU/BSD grep -r; fail loudly if -E/-r unsupported
if ! echo ok | grep -E 'ok' >/dev/null 2>&1; then
  echo "[ci-guard] FATAL: grep does not support -E" >&2
  exit 1
fi

scan_path() {
  local target="$1"
  local label="$2"
  if [[ ! -e "$target" ]]; then
    echo "[ci-guard] FAIL: scan target missing: $target ($label)" >&2
    return 1
  fi
  echo "[ci-guard] scanning $label ($target)..."
  # grep exits 1 when no match — that is success for us.
  # Exit 0 (match found) is failure.
  # Exit 2 is error — fail.
  set +e
  local out
  out=$(grep -rniE "$PATTERN" "$target" 2>&1)
  local rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    echo "$out" >&2
    echo "[ci-guard] FAIL: forbidden token in $label" >&2
    return 1
  fi
  if [[ $rc -ge 2 ]]; then
    echo "$out" >&2
    echo "[ci-guard] FAIL: grep error while scanning $label (exit $rc)" >&2
    return 1
  fi
  return 0
}

run_self_test() {
  echo "[ci-guard] --self-test: planting forbidden token and asserting detection..."
  local tmp
  tmp=$(mktemp -d "${TMPDIR:-/tmp}/ci-guard-selftest.XXXXXX")
  trap 'rm -rf "$tmp"' EXIT
  printf 'leak OPENROUTER_API_KEY=sk-or-test-token\n' >"$tmp/planted.txt"

  set +e
  local out
  out=$(grep -rniE "$PATTERN" "$tmp" 2>&1)
  local rc=$?
  set -e
  if [[ $rc -ne 0 ]]; then
    echo "[ci-guard] SELF-TEST FAIL: planted token was NOT detected (grep exit $rc)" >&2
    echo "$out" >&2
    exit 1
  fi
  if ! echo "$out" | grep -qiE 'OPENROUTER|sk-or-'; then
    echo "[ci-guard] SELF-TEST FAIL: grep matched but output missing expected tokens" >&2
    echo "$out" >&2
    exit 1
  fi

  # Negative control: clean tree must not match
  printf 'clean file no secrets\n' >"$tmp/clean.txt"
  rm -f "$tmp/planted.txt"
  set +e
  out=$(grep -rniE "$PATTERN" "$tmp" 2>&1)
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    echo "[ci-guard] SELF-TEST FAIL: clean tree falsely matched" >&2
    echo "$out" >&2
    exit 1
  fi
  if [[ $rc -ge 2 ]]; then
    echo "[ci-guard] SELF-TEST FAIL: grep error on clean tree" >&2
    exit 1
  fi

  echo "[ci-guard] SELF-TEST OK"
  exit 0
}

if [[ "${1:-}" == "--self-test" ]]; then
  run_self_test
fi

scan_path "src" "src/" || exit 1

if [[ ! -d dist/assets ]]; then
  echo "[ci-guard] FAIL: dist/assets/ missing — run vite build first" >&2
  exit 1
fi

scan_path "dist/assets" "dist/assets/" || exit 1

echo "[ci-guard] OK"
