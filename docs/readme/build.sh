#!/usr/bin/env bash
# Rebuilds the README demo images (hero/animate/camera/layout GIFs + shapes
# still) from the DSL in generate.ts. Needs inkscape and ImageMagick.
set -euo pipefail
cd "$(dirname "$0")/../.."

FRAMES=$(mktemp -d)
trap 'rm -rf "$FRAMES"' EXIT

FRAMES_DIR="$FRAMES" npx vite-node docs/readme/generate.ts

for d in hero animate camera layout; do
  ls "$FRAMES/$d"/*.svg | xargs -P 6 -I{} inkscape {} -o {}.png -w 720 -b '#14161c' 2>/dev/null
  convert -delay 10 -loop 0 "$FRAMES/$d"/*.png -layers Optimize "docs/readme/$d.gif"
  echo "docs/readme/$d.gif"
done
inkscape "$FRAMES/shapes.svg" -o docs/readme/shapes.png -w 1440 -b '#14161c' 2>/dev/null
echo "docs/readme/shapes.png"
