#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC_DIR="${REPO_ROOT}/src"
DIST_DIR="${REPO_ROOT}/dist"

if [[ ! -f "${SRC_DIR}/manifest.json" ]]; then
  echo "Error: ${SRC_DIR}/manifest.json not found." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is required to parse src/manifest.json." >&2
  exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "Error: zip is required to build extension archives." >&2
  exit 1
fi

MANIFEST_VERSION="$(
  node -e "const fs=require('fs'); const p=process.argv[1]; process.stdout.write(JSON.parse(fs.readFileSync(p,'utf8')).version);" \
    "${SRC_DIR}/manifest.json"
)"
TAG_NAME="${1:-v${MANIFEST_VERSION}}"

rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}/chromium" "${DIST_DIR}/firefox"

cp -R "${SRC_DIR}/." "${DIST_DIR}/chromium/"
cp -R "${SRC_DIR}/." "${DIST_DIR}/firefox/"

(
  cd "${DIST_DIR}/chromium"
  zip -r -9 "../chromium-extension-${TAG_NAME}.zip" .
)

(
  cd "${DIST_DIR}/firefox"
  zip -r -9 "../firefox-extension-${TAG_NAME}.zip" .
)

echo "Built extension archives:"
echo "  ${DIST_DIR}/chromium-extension-${TAG_NAME}.zip"
echo "  ${DIST_DIR}/firefox-extension-${TAG_NAME}.zip"
