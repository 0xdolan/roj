#!/usr/bin/env bash
# Project rule: no em dash, en dash or look-alikes anywhere (code, docs, UI,
# translations, commit-tracked data). Use a comma, colon, "·", "to" or a plain
# hyphen-minus (-) instead. Exits with status 1 and lists every offending line.
#
# Banned: U+2012 figure dash, U+2013 en dash, U+2014 em dash, U+2015 horizontal
# bar, U+2212 minus sign, U+2500/U+2501 box-drawing lines.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    mapfile -t files < <(git ls-files --cached --others --exclude-standard)
else
    mapfile -t files < <(find . -type f -not -path './.git/*' -not -path './build/*' -not -path './dist/*')
fi

found=0
for f in "${files[@]}"; do
    [ -f "$f" ] || continue
    if grep -IqnP '[\x{2012}-\x{2015}\x{2212}\x{2500}\x{2501}]' "$f" 2>/dev/null; then
        grep -InP '[\x{2012}-\x{2015}\x{2212}\x{2500}\x{2501}]' "$f" | sed "s|^|$f:|"
        found=1
    fi
done

if [ "$found" -eq 1 ]; then
    echo "error: dashes are not allowed in this project (see CONTRIBUTING.md)." >&2
    exit 1
fi
echo "no dashes: ok"
