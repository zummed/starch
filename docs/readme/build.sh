#!/usr/bin/env bash
# Rebuilds the README images: the demo GIFs and the shapes still from the DSL
# in generate.ts, plus a screenshot of the playground. Needs inkscape and
# ImageMagick; the screenshot also needs a Chrome binary and is skipped
# without one.
set -euo pipefail
cd "$(dirname "$0")/../.."

# Every README image is shown at WIDTH so the page has one left and right
# edge all the way down. Scenes too tall to fill that width are scaled to
# MAX_HEIGHT and centered on a WIDTH-wide canvas instead of being cropped or
# left hanging at half width.
WIDTH=880
MAX_HEIGHT=420
BG='#14161c'

FRAMES=$(mktemp -d)
SERVER=""
cleanup() { [ -n "$SERVER" ] && kill "$SERVER" 2>/dev/null; rm -rf "$FRAMES"; }
trap cleanup EXIT

FRAMES_DIR="$FRAMES" npx vite-node docs/readme/generate.ts

for d in hero animate camera layout; do
  ls "$FRAMES/$d"/*.svg | xargs -P 6 -I{} inkscape {} -o {}.png -w "$WIDTH" -b "$BG" 2>/dev/null
  # Frames share a viewBox, so one frame's height decides for all of them.
  height=$(identify -format '%h' "$(ls "$FRAMES/$d"/*.png | head -1)")
  if [ "$height" -gt "$MAX_HEIGHT" ]; then
    ls "$FRAMES/$d"/*.png | xargs -P 6 -I{} convert {} -resize "x$MAX_HEIGHT" \
      -background "$BG" -gravity center -extent "${WIDTH}x${MAX_HEIGHT}" {}
  fi
  convert -delay 10 -loop 0 "$FRAMES/$d"/*.png -layers Optimize "docs/readme/$d.gif"
  echo "gif    docs/readme/$d.gif"
done

# Stills go out at 2x for crisp text on high-density screens.
inkscape "$FRAMES/shapes.svg" -o "$FRAMES/shapes.png" -w $((WIDTH * 2)) -b "$BG" 2>/dev/null
convert "$FRAMES/shapes.png" -background "$BG" -gravity center \
  -extent "$((WIDTH * 2))x$(identify -format '%h' "$FRAMES/shapes.png")" docs/readme/shapes.png
echo "still  docs/readme/shapes.png"

CHROME=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
if [ -z "$CHROME" ]; then
  echo "skip   docs/readme/playground.png (no chrome binary — keeping the current one)"
  exit 0
fi

npm run build:app >/dev/null
node bin/starch.js --port 4699 --no-open >/dev/null 2>&1 &
SERVER=$!
sleep 1
CHROME_BIN="$CHROME" node docs/readme/playground.mjs http://localhost:4699/ "$FRAMES/playground.png"
convert "$FRAMES/playground.png" -resize "$((WIDTH * 2))x" \
  -bordercolor '#30363d' -border 1 docs/readme/playground.png
echo "still  docs/readme/playground.png"
