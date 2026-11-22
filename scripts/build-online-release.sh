#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
release_sha="$(git rev-parse HEAD)"
if [[ -n "${DVOLADA_RELEASE_SHA:-}" && "$DVOLADA_RELEASE_SHA" != "$release_sha" ]]; then
  echo "Checkout SHA does not match the requested release" >&2
  exit 1
fi
export GITHUB_SHA="$release_sha"
export SOURCE_DATE_EPOCH
SOURCE_DATE_EPOCH="$(git show -s --format=%ct HEAD)"
export VITE_DVOLADA_LIVE_MODE=true VITE_DVOLADA_API_URL= VITE_ONESIGNAL_APP_ID=
npm run build
node scripts/package-qa-worker.mjs
mkdir -p online-release
cp dist/qa-worker.mjs online-release/dvolada-online.mjs
printf '%s\n' "$release_sha" > online-release/SHA
(
  cd online-release
  sha256sum dvolada-online.mjs SHA > SHA256SUMS
  sha256sum -c SHA256SUMS
)
node scripts/check-online-release.mjs online-release/dvolada-online.mjs
