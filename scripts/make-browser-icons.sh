#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Draw the browser extension and web app icons (browser/icons/) and the
# website favicons (docs/) from assets/logo.svg. Needs inkscape and ImageMagick.
# The PNGs are committed, so a build never depends on these tools.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/browser/icons"
LOGO="$ROOT/assets/logo.svg"
SUN='#F5CD0E'
TMP="$(mktemp -d)"
trap 'command rm -rf "$TMP"' EXIT
mkdir -p "$OUT"
png() { inkscape "$LOGO" -o "$2" -w "$1" -h "$1" >/dev/null 2>&1; }
# The round logo on a sun-yellow square: maskable icons keep it inside the safe zone.
square() { # size inner output
    png "$2" "$TMP/inner.png"
    magick -size "$1x$1" "xc:$SUN" "$TMP/inner.png" -gravity center -composite -strip "$3"
}
for s in 16 32 48 96 128 192 512; do png "$s" "$OUT/roj-$s.png"; done
square 192 154 "$OUT/roj-maskable-192.png"
square 512 410 "$OUT/roj-maskable-512.png"
square 180 156 "$OUT/apple-touch-icon.png"
cp "$LOGO" "$OUT/roj.svg"
cp "$LOGO" "$ROOT/docs/favicon.svg"
cp "$OUT/apple-touch-icon.png" "$ROOT/docs/apple-touch-icon.png"
echo "icons written to browser/icons and docs/"
