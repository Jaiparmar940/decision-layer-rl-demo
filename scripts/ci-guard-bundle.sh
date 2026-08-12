#!/usr/bin/env bash
# Fail if client bundle or Vite-included src leak remote-API / env secrets.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[ci-guard] scanning src/ for forbidden remote-eval tokens..."
if rg -n --ignore-case 'OPENROUTER|openrouter\.ai|OPENROUTER_API_KEY' src/; then
  echo "[ci-guard] FAIL: forbidden token under src/"
  exit 1
fi

if [[ ! -d dist ]]; then
  echo "[ci-guard] dist/ missing — run vite build first"
  exit 1
fi

echo "[ci-guard] scanning dist/ bundle..."
if rg -n --ignore-case 'OPENROUTER|openrouter\.ai|OPENROUTER_API_KEY|api_key|process\.env' dist/; then
  echo "[ci-guard] FAIL: forbidden token in client bundle"
  exit 1
fi

echo "[ci-guard] OK"
