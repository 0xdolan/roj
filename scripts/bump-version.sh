#!/usr/bin/env bash
# Set the release version everywhere: scripts/bump-version.sh 0.2.0
#
# Updates metadata.json, package.json, constants.js, the man page and
# debian/changelog, opens a CHANGELOG.md section from "Unreleased" and
# rebuilds the website's copy of the engine.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
V="${1:?usage: bump-version.sh X.Y.Z}"
[[ "$V" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version must look like 1.2.3" >&2; exit 2; }
python3 - "$ROOT" "$V" "${DEBFULLNAME:-0xdolan}" "${DEBEMAIL:-0xdolan@users.noreply.github.com}" <<'PY'
import json, pathlib, re, sys
from email.utils import formatdate
root, v, name, email = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4]
for path, key in (("extension/metadata.json", "version-name"), ("package.json", "version")):
    p = root / path
    data = json.loads(p.read_text())
    data[key] = v
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
c = root / "extension/lib/constants.js"
c.write_text(re.sub(r"export const VERSION = '.*';", f"export const VERSION = '{v}';", c.read_text()))
m = root / "man/roj.1"
m.write_text(re.sub(r'^\.TH ROJ 1 "[^"]*" "roj [^"]*"', f'.TH ROJ 1 "{v}" "roj {v}"', m.read_text(), flags=re.M))
d = root / "debian/changelog"
text = d.read_text()
if not text.startswith(f"roj ({v}-"):
    entry = (f"roj ({v}-1) unstable; urgency=medium\n\n  * New upstream release. See CHANGELOG.md.\n\n"
             f" -- {name} <{email}>  {formatdate(localtime=True)}\n\n")
    d.write_text(entry + text)
log = root / "CHANGELOG.md"
text = log.read_text()
if f"## [{v}]" not in text:
    from datetime import date
    text = text.replace("## [Unreleased]", f"## [Unreleased]\n\n## [{v}] - {date.today().isoformat()}", 1)
    # Links: Unreleased compares from the new tag; the new version from the last one.
    m = re.search(r"^\[Unreleased\]: (\S+)/compare/(v[0-9.]+)\.\.\.HEAD$", text, flags=re.M)
    if m:
        base, prev = m.groups()
        text = text.replace(m.group(0), f"[Unreleased]: {base}/compare/v{v}...HEAD\n[{v}]: {base}/compare/{prev}...v{v}", 1)
    log.write_text(text)
PY
# The website calendar imports a copy of constants.js, which holds the version.
node "$ROOT/scripts/build-web.mjs" >/dev/null
"$ROOT/scripts/check-version.sh"
echo "Now edit CHANGELOG.md under [$V], run make screenshots marketing if the interface changed, then commit and open the release pull request into main (RELEASING.md)."
