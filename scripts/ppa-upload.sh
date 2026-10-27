#!/usr/bin/env bash
# Build signed source packages for each Ubuntu series and upload them to the
# PPA. Run by the Release workflow. DRY_RUN=1 builds unsigned packages in
# build/ppa/ without uploading.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["version-name"])' "$ROOT/extension/metadata.json")"
PPA="${PPA:-ppa:0xdolan/roj}"
SERIES="${SERIES:-noble questing resolute}"
REV="${DEB_REVISION:-1}"
export DEBFULLNAME="${DEBFULLNAME:-0xdolan}"
export DEBEMAIL="${DEBEMAIL:-0xdolan@users.noreply.github.com}"
WORK="$ROOT/build/ppa"

if [ -z "${DRY_RUN:-}" ] && [ -z "${GPG_KEY_ID:-}" ]; then
    echo "GPG_KEY_ID is required to sign uploads (or set DRY_RUN=1)" >&2
    exit 2
fi

command rm -rf "$WORK"
mkdir -p "$WORK/orig/roj-$VERSION"
# The upstream tarball: every tracked file except debian/.
(cd "$ROOT" && git ls-files -co --exclude-standard -z -- . ':(exclude)debian' | xargs -0 tar cf - --no-recursion) \
    | tar xf - -C "$WORK/orig/roj-$VERSION"
tar czf "$WORK/roj_$VERSION.orig.tar.gz" -C "$WORK/orig" "roj-$VERSION"

# Launchpad's upload server sometimes answers 550 under load: try each upload
# a few times, carry on with the other series, and fail at the end.
upload() {
    local tries=0
    until dput -f "$PPA" "$1"; do
        tries=$((tries + 1))
        [ "$tries" -lt 3 ] || return 1
        echo "upload failed, retrying in 60 s ($tries/3)"
        sleep 60
    done
}
failed=()

for series in $SERIES; do
    version="$VERSION-$REV~${series}1"
    dir="$WORK/$series"
    mkdir -p "$dir"
    cp "$WORK/roj_$VERSION.orig.tar.gz" "$dir/"
    tar xzf "$dir/roj_$VERSION.orig.tar.gz" -C "$dir"
    cp -r "$ROOT/debian" "$dir/roj-$VERSION/"
    (cd "$dir/roj-$VERSION" && dch -b --newversion "$version" --distribution "$series" --force-distribution \
        "Build for Ubuntu $series. See CHANGELOG.md for the changes in $VERSION." >/dev/null 2>&1)
    if [ -n "${DRY_RUN:-}" ]; then
        (cd "$dir/roj-$VERSION" && dpkg-buildpackage -S -sa -d -us -uc >"$dir/build.log" 2>&1)
        echo "built $dir/roj_${version}_source.changes (not uploaded)"
    else
        (cd "$dir/roj-$VERSION" && dpkg-buildpackage -S -sa -d -k"$GPG_KEY_ID" >"$dir/build.log" 2>&1)
        if upload "$dir/roj_${version}_source.changes"; then
            echo "uploaded roj $version to $PPA"
        else
            failed+=("$version")
        fi
    fi
done
if [ "${#failed[@]}" -gt 0 ]; then
    echo "not uploaded: ${failed[*]}" >&2
    exit 1
fi
