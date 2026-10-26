#!/usr/bin/env bash
# Write the roj launcher: scripts/write-launcher.sh /path/to/cli/roj.js OUTPUT
# It runs the CLI with gjs (which can read the extension's settings) and falls
# back to Node.js on systems without GNOME.
set -euo pipefail
cli="${1:?path to cli/roj.js}"
out="${2:?output file}"
cat > "$out" <<SH
#!/bin/sh
# Launcher for roj, the Kurdish calendar CLI. https://github.com/0xdolan/roj
ROJ_CLI='$cli'
if command -v gjs >/dev/null 2>&1; then exec gjs -m "\$ROJ_CLI" "\$@"; fi
if command -v node >/dev/null 2>&1; then exec node "\$ROJ_CLI" "\$@"; fi
echo "roj needs gjs or Node.js" >&2
exit 127
SH
chmod 755 "$out"
