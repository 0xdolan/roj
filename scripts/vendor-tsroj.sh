#!/usr/bin/env bash
# Refresh extension/lib/tsroj.js from npm: scripts/vendor-tsroj.sh [VERSION|latest]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WANT="${1:-latest}"
TMP="$(mktemp -d)"
trap 'command rm -rf "$TMP"' EXIT

(cd "$TMP" && npm pack --silent "@0xdolan/tsroj@$WANT" >/dev/null && tar xzf ./*.tgz)
VERSION="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["version"])' "$TMP/package/package.json")"
{
    echo '// SPDX-License-Identifier: GPL-3.0-only'
    echo "// Vendored from @0xdolan/tsroj v$VERSION (dist/index.mjs): https://github.com/0xdolan/tsroj"
    echo '// Do not edit by hand: run `make vendor` to refresh.'
    echo
    cat "$TMP/package/dist/index.mjs"
} > "$ROOT/extension/lib/tsroj.js"
sed -i "s/^export const TSROJ_VERSION = '.*';/export const TSROJ_VERSION = '$VERSION';/" "$ROOT/extension/lib/constants.js"
echo "tsroj $VERSION vendored"
