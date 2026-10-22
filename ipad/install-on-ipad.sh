#!/bin/zsh
# Builds the Planet Song Teacher iPad app and installs it on Lester's iPad (plugged in, or on the same wifi once it has
# been paired with this Mac). The same steps as Music Class and Orff Play.
# Run with: zsh ipad/install-on-ipad.sh          (or: zsh ipad/install-on-ipad.sh --build-only, no iPad needed)
set -e
cd "$(dirname "$0")"
# the teacher screens plus the shared code they use (planet and genre data, settings, QR, MP3 encoder, Supabase)
rm -rf web && mkdir web
cp -R ../teacher ../shared web/
mkdir web/js && cp ../js/data.js ../js/config.js web/js/
command -v xcodegen >/dev/null || PATH="/opt/homebrew/bin:$PATH"
xcodegen generate --quiet
if [ "$1" = "--build-only" ]; then
  xcodebuild -project PlanetSongTeacher.xcodeproj -scheme PlanetSongTeacher -configuration Release \
    -destination "generic/platform=iOS" -derivedDataPath build CODE_SIGNING_ALLOWED=NO -quiet build
  echo "Planet Song Teacher builds (not signed, not installed)."
  exit 0
fi
DEVICE=$(xcrun devicectl list devices 2>/dev/null | awk '/iPad/ && / (available|connected)/ {for(i=1;i<=NF;i++) if ($i ~ /^[0-9A-F-]{25,36}$/) {print $i; exit}}')
if [ -z "$DEVICE" ]; then echo "No iPad found. Unlock the iPad, plug it in or join the same wifi, then run this again."; exit 1; fi
xcodebuild -project PlanetSongTeacher.xcodeproj -scheme PlanetSongTeacher -configuration Release \
  -destination "generic/platform=iOS" -derivedDataPath build -allowProvisioningUpdates -quiet build
for attempt in 1 2 3 4; do
  xcrun devicectl device install app --device "$DEVICE" build/Build/Products/Release-iphoneos/PlanetSongTeacher.app && break
  [ "$attempt" = 4 ] && { echo "Could not reach the iPad. Unlock it, then run this again."; exit 1; }
  sleep 10
done
xcrun devicectl device process launch --device "$DEVICE" za.lerouxstudio.planetsongteacher || true
echo "Planet Song Teacher is installed on the iPad."
