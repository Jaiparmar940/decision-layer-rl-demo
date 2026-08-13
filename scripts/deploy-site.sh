#!/usr/bin/env bash
# Local publish of dist/ → Jaiparmar940/second-nature-site/decision-layer/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITE_DIR="${TMPDIR:-/tmp}/second-nature-site-deploy-$$"
BASE="${DEPLOY_BASE:-/decision-layer/}"

cleanup() { rm -rf "$SITE_DIR"; }
trap cleanup EXIT

cd "$ROOT"
npx tsc --noEmit
npx vite build --base "$BASE"
bash scripts/ci-guard-bundle.sh

git clone --depth 1 git@github.com:Jaiparmar940/second-nature-site.git "$SITE_DIR"
rm -rf "$SITE_DIR/decision-layer"
mkdir -p "$SITE_DIR/decision-layer"
cp -R "$ROOT/dist/." "$SITE_DIR/decision-layer/"
touch "$SITE_DIR/decision-layer/.nojekyll"

cd "$SITE_DIR"
git add decision-layer
if git diff --staged --quiet; then
  echo "No site changes to publish"
  exit 0
fi
git commit -m "Deploy decision-layer from local build"
git push origin HEAD:main
echo "Published → https://snlabs.dev/decision-layer/"
