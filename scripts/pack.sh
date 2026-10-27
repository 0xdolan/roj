#!/usr/bin/env bash
# Build the extension bundle for extensions.gnome.org:
#   dist/roj@0xdolan.github.io.shell-extension.zip
# The files come from scripts/extension-files. Compiled schemas are left out on
# purpose: GNOME Shell 45 and later compile them on install. The roj command
# (cli/ and lib/icsExport.js, which only it uses) is left out too: the
# extension never runs it, and extensions.gnome.org asks for no unused files.
# The packages, the tarball and make install ship it separately.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UUID="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["uuid"])' "$ROOT/extension/metadata.json")"
OUT="$ROOT/dist/$UUID.shell-extension.zip"
mapfile -t FILES < "$ROOT/scripts/extension-files"

glib-compile-schemas --strict --dry-run "$ROOT/extension/schemas"
mkdir -p "$ROOT/dist"
command rm -f "$OUT"
(cd "$ROOT/extension" && zip -qr -9 "$OUT" "${FILES[@]}" -x '*/.*' -x 'schemas/gschemas.compiled' -x 'cli/*' -x 'lib/icsExport.js')
echo "$OUT ($(du -h "$OUT" | cut -f1))"
