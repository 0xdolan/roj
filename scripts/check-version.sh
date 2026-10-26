#!/usr/bin/env bash
# Check that every place a version is written agrees, and, when a tag is
# given (v1.2.3), that it matches too: scripts/check-version.sh [vX.Y.Z]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
v="$(python3 -c 'import json;print(json.load(open("extension/metadata.json"))["version-name"])')"
fail=0
check() { if [ "$2" != "$v" ]; then echo "$1 has $2, expected $v" >&2; fail=1; fi; }
check package.json "$(python3 -c 'import json;print(json.load(open("package.json"))["version"])')"
check extension/lib/constants.js "$(sed -n "s/^export const VERSION = '\(.*\)';/\1/p" extension/lib/constants.js)"
check debian/changelog "$(sed -n '1s/^roj (\([^-]*\)-.*/\1/p' debian/changelog)"
check man/roj.1 "$(sed -n 's/^\.TH ROJ 1 "[^"]*" "roj \([^"]*\)".*/\1/p' man/roj.1)"
grep -q "^## \[$v\]" CHANGELOG.md || { echo "CHANGELOG.md has no section for $v" >&2; fail=1; }
if [ -n "${1:-}" ] && [ "${1#v}" != "$v" ]; then echo "tag $1 does not match version $v" >&2; fail=1; fi
[ "$fail" -eq 0 ] && echo "version $v: consistent"
exit "$fail"
