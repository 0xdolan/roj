#!/usr/bin/env bash
# Run Roj inside an isolated, headless GNOME Shell.
#
#   scripts/sandbox.sh PLAN.json [OUT_DIR]
#
# A throwaway XDG environment is used, so your real session, settings and
# extensions are never touched. scripts/devtools executes PLAN.json (written
# by scripts/screenshots.sh) and the shell exits when the plan is done.
# ROJ_FAKE_NOW="2026-12-17 10:30" pins the date Roj and its settings window see.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLAN="$(realpath "${1:?usage: sandbox.sh PLAN.json [OUT_DIR]}")"
OUT="$(realpath -m "${2:-$ROOT/build/sandbox}")"
UUID="roj@0xdolan.github.io"
DEVTOOLS="roj-devtools@0xdolan.github.io"
SIZE="${ROJ_SANDBOX_SIZE:-1600x1000}"

SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/roj-sandbox.XXXXXX")"
# The document portal mounts runtime/doc and may still be unmounting it when
# the shell exits; unmount it and retry once so cleanup never fails the run.
cleanup() {
  fusermount3 -uz "$SANDBOX/runtime/doc" 2>/dev/null || fusermount -uz "$SANDBOX/runtime/doc" 2>/dev/null || true
  rm -rf "$SANDBOX" 2>/dev/null || { sleep 1; rm -rf "$SANDBOX" || true; }
}
trap cleanup EXIT
mkdir -p "$OUT" "$SANDBOX"/{data/gnome-shell/extensions,config,cache,runtime}
chmod 700 "$SANDBOX/runtime"

glib-compile-schemas "$ROOT/extension/schemas"
ln -s "$ROOT/extension" "$SANDBOX/data/gnome-shell/extensions/$UUID"
ln -s "$ROOT/scripts/devtools" "$SANDBOX/data/gnome-shell/extensions/$DEVTOOLS"

export XDG_DATA_HOME="$SANDBOX/data" XDG_CONFIG_HOME="$SANDBOX/config"
export XDG_CACHE_HOME="$SANDBOX/cache" XDG_RUNTIME_DIR="$SANDBOX/runtime"
export ROJ_DEVTOOLS_PLAN="$PLAN" ROJ_DEVTOOLS_LOG="$OUT/devtools.log"
export ROJ_OUT="$OUT" GSETTINGS_BACKEND=dconf
unset WAYLAND_DISPLAY DISPLAY
: > "$ROJ_DEVTOOLS_LOG"

dbus-run-session -- bash -c "
  gsettings set org.gnome.shell enabled-extensions \"['$UUID', '$DEVTOOLS']\"
  gsettings set org.gnome.shell disable-user-extensions false
  gsettings set org.gnome.shell welcome-dialog-last-shown-version '999'
  gsettings set org.gnome.desktop.interface color-scheme '${ROJ_COLOR_SCHEME:-prefer-dark}'
  gsettings set org.gnome.desktop.interface clock-show-weekday true
  timeout ${ROJ_SANDBOX_TIMEOUT:-240} gnome-shell --headless --wayland --no-x11 --virtual-monitor $SIZE
" > "$OUT/shell.log" 2>&1 || true

echo "--- devtools.log"; cat "$ROJ_DEVTOOLS_LOG"
echo "--- JS errors in shell.log"
grep -E "JS ERROR|JS WARNING|roj|Roj|Error" "$OUT/shell.log" | grep -v '^\s*$' | head -50 || true
