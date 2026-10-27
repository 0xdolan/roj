#!/usr/bin/env bash
# Render the marketing images into docs/images/marketing/ with headless Chrome.
# Needs the screenshots first (make screenshots). Uses a throwaway browser
# profile, so your own Chrome profile is never touched.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERE="$ROOT/scripts/marketing"
OUT="$ROOT/docs/images/marketing"
BUILD="$ROOT/build/marketing"
CHROME="${CHROME:-$(command -v google-chrome || command -v chromium || command -v chromium-browser)}"
mkdir -p "$OUT" "$BUILD"

node "$HERE/data.mjs" > "$BUILD/data.js"

# Real CLI output, with colours, converted to HTML spans.
python3 - "$ROOT" "$BUILD/cli.js" <<'PY'
import html, json, os, re, shlex, subprocess, sys
root, out = sys.argv[1], sys.argv[2]
cmds = ["roj -l kmr", "roj cal --with g,p -l kmr", "roj convert 2027-03-21 -l kmr", "roj events --month --date 2027-03-21 -l kmr"]
def to_html(text):
    parts, open_ = [], 0
    for chunk in re.split(r"(\x1b\[[0-9;]*m)", text):
        m = re.fullmatch(r"\x1b\[([0-9;]*)m", chunk)
        if m:
            code = m.group(1)
            if code in ("0", ""):
                parts.append("</span>" * open_); open_ = 0
            else:
                parts.append(f'<span class="a{code}">'); open_ += 1
        else:
            parts.append(html.escape(chunk))
    return "".join(parts) + "</span>" * open_
items = []
for cmd in cmds:
    args = shlex.split(cmd)[1:]
    # "Today" is 17 December 2026, the day the screenshots show.
    env = {**os.environ, "ROJ_FAKE_NOW": "2026-12-17 10:30"}
    res = subprocess.run([f"{root}/bin/roj", *args, "--color", "--no-config"], capture_output=True, text=True, check=True, env=env)
    items.append({"cmd": html.escape(cmd), "html": to_html(res.stdout)})
open(out, "w").write("window.CLI = " + json.dumps(items, ensure_ascii=False) + ";\n")
PY

PROFILE="$(mktemp -d)"
trap 'command rm -rf "$PROFILE"' EXIT
render() { # template width height output
    "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check \
        --user-data-dir="$PROFILE" --allow-file-access-from-files --force-device-scale-factor=1 \
        --window-size="$2,$3" --virtual-time-budget=3000 \
        --screenshot="$OUT/$4" "file://$HERE/$1" >/dev/null 2>&1
    echo "$OUT/$4"
}
render banner.html 1280 640 banner.png
render features.html 1600 1000 features.png
render store.html 1600 1000 store.png
render themes.html 1600 1000 themes.png
render cli.html 1600 1000 cli.png
