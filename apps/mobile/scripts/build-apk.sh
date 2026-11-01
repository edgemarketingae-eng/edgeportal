#!/usr/bin/env bash
# Builds a signed release APK. Run from anywhere: pnpm --filter @edge/mobile apk
# A test build for a local API: EDGE_ALLOW_HTTP=1 EXPO_PUBLIC_API_URL=http://10.0.2.2:4100 pnpm --filter @edge/mobile apk
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f "$HOME/.edge-crm/keystore.properties" ]; then
  echo "Missing ~/.edge-crm/keystore.properties. See apps/mobile/README.md." >&2
  exit 1
fi

# The JVM can time out reaching download hosts over IPv6 where curl doesn't.
export JAVA_TOOL_OPTIONS="-Djava.net.preferIPv4Stack=true"

CI=1 pnpm exec expo prebuild --platform android --no-install
(cd android && ./gradlew :app:assembleRelease --console=plain -PreactNativeArchitectures=arm64-v8a,armeabi-v7a)

version=$(node -p "require('./package.json').version")
suffix=${EDGE_ALLOW_HTTP:+-test}
out="$PWD/dist/edge-crm-$version$suffix.apk"
mkdir -p dist
cp android/app/build/outputs/apk/release/app-release.apk "$out"
echo "APK: $out"
