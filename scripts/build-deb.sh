#!/usr/bin/env bash
# Build the Debian/Ubuntu packages from the current working tree:
#   dist/roj_<version>_all.deb                      the roj command
#   dist/gnome-shell-extension-roj_<version>_all.deb the GNOME extension
# The build runs in build/deb/, so nothing is written next to the checkout.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["version-name"])' "$ROOT/extension/metadata.json")"
WORK="$ROOT/build/deb"
SRC="$WORK/roj-$VERSION"

command rm -rf "$WORK"
mkdir -p "$SRC" "$ROOT/dist"
# Tracked and new (not ignored) files, so uncommitted work is packaged too.
(cd "$ROOT" && git ls-files -co --exclude-standard -z | xargs -0 tar cf - --no-recursion) | tar xf - -C "$SRC"

(cd "$SRC" && dpkg-buildpackage -us -uc -b --no-pre-clean >"$WORK/build.log" 2>&1) || {
    tail -30 "$WORK/build.log" >&2
    exit 1
}
for deb in "$WORK"/*.deb; do
    mv "$deb" "$ROOT/dist/"
    echo "dist/$(basename "$deb") ($(du -h "$ROOT/dist/$(basename "$deb")" | cut -f1))"
done
