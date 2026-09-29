#!/bin/bash
# Spread Trading Game for Mac: joins the downloaded parts, checks them, and installs the app.
# Run it from Terminal: type "bash " (with a space), drag this file into the window, press Return.
set -e
cd "$(dirname "$0")"
VERSION=__VERSION__
case "$(uname -m)" in
  arm64) ARCH=arm64; EXPECTED=__SUM_ARM64__; KIND="Apple chip (M1 and later)" ;;
  *) ARCH=x64; EXPECTED=__SUM_X64__; KIND="Intel" ;;
esac
ZIP="SpreadTradingGame-mac-$ARCH-$VERSION.zip"
if ! ls "$ZIP".part* >/dev/null 2>&1; then
  echo "This Mac has an $KIND processor, so it needs the files named $ZIP.part0, .part1 ..."
  echo "Put them in the same folder as this script and run it again."
  exit 1
fi
echo "Joining $ZIP ..."
cat "$ZIP".part? > "$ZIP"
echo "Checking it ..."
SUM=$(shasum -a 256 "$ZIP" | cut -d' ' -f1)
if [ "$SUM" != "$EXPECTED" ]; then
  echo "The joined file doesn't match. One of the parts is incomplete: download the parts again."
  exit 1
fi
echo "Unpacking ..."
rm -rf "Spread Trading Game.app"
ditto -x -k "$ZIP" .
xattr -dr com.apple.quarantine "Spread Trading Game.app" 2>/dev/null || true
APP="$PWD/Spread Trading Game.app"
if [ -w /Applications ]; then
  rm -rf "/Applications/Spread Trading Game.app"
  mv "Spread Trading Game.app" /Applications/
  APP="/Applications/Spread Trading Game.app"
fi
echo "Done. The game is at: $APP"
open "$APP"
