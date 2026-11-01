#!/usr/bin/env bash
# Puts the built APK on the server, where the app finds it through latest.json. Everyone gets the update prompt on their
# next launch, so test the APK first.
#
#   EDGE_DEPLOY_HOST=user@server pnpm --filter @edge/mobile publish-apk
#   EDGE_MIN_VERSION_CODE=7 ...    forces phones older than versionCode 7 to update before they can continue
set -euo pipefail
cd "$(dirname "$0")/.."

: "${EDGE_DEPLOY_HOST:?Set EDGE_DEPLOY_HOST to the server, e.g. user@server}"
version=$(node -p "require('./package.json').version")
apk="dist/edge-crm-$version.apk"
[ -f "$apk" ] || { echo "Build it first: $apk not found" >&2; exit 1; }

version_code=$(grep -E 'versionCode:' app.config.ts | grep -oE '[0-9]+' | head -1)
sha256=$(shasum -a 256 "$apk" | cut -d' ' -f1)
name="edge-crm-$version.apk"
manifest=$(mktemp)
cat > "$manifest" <<JSON
{
  "version": "$version",
  "versionCode": $version_code,
  "minVersionCode": ${EDGE_MIN_VERSION_CODE:-1},
  "url": "https://crm.edgeacademy.ae/android/$name",
  "sha256": "$sha256"
}
JSON

ssh "$EDGE_DEPLOY_HOST" "mkdir -p /var/www/edge-crm/android"
scp "$apk" "$EDGE_DEPLOY_HOST:/var/www/edge-crm/android/$name"
# The manifest goes last, so no phone is ever pointed at a file that isn't there yet.
scp "$manifest" "$EDGE_DEPLOY_HOST:/var/www/edge-crm/android/latest.json"
rm -f "$manifest"
echo "Published $version (versionCode $version_code): https://crm.edgeacademy.ae/android/$name"
