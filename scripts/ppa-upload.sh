#!/usr/bin/env bash
# Build signed source packages for each Ubuntu series and upload them to the
# PPA. Run by the Release and Publish workflows.
#   DRY_RUN=1   build unsigned packages in build/ppa/, no upload
#   CHECK=1     build and sign the first series, verify the signature and
#               that Launchpad knows the key and the PPA; no upload
#   SOURCE=DIR  package another checkout (a release tag) with this script
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$(cd "${SOURCE:-$ROOT}" && pwd)"
VERSION="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["version-name"])' "$SOURCE/extension/metadata.json")"
PPA="${PPA:-ppa:0xdolan/roj}"
SERIES="${SERIES:-noble questing resolute}"
REV="${DEB_REVISION:-1}"
export DEBFULLNAME="${DEBFULLNAME:-0xdolan}"
export DEBEMAIL="${DEBEMAIL:-0xdolan@users.noreply.github.com}"
WORK="$ROOT/build/ppa"
owner="${PPA#ppa:}"; name="${owner#*/}"; owner="${owner%%/*}"

if [ -z "${DRY_RUN:-}" ] && [ -z "${GPG_KEY_ID:-}" ]; then
    echo "GPG_KEY_ID is required to sign (or set DRY_RUN=1)" >&2
    exit 2
fi
[ -z "${CHECK:-}" ] || SERIES="${SERIES%% *}"

command rm -rf "$WORK"
mkdir -p "$WORK/orig/roj-$VERSION"
# The upstream tarball: every tracked file except debian/.
(cd "$SOURCE" && git ls-files -co --exclude-standard -z -- . ':(exclude)debian' | xargs -0 tar cf - --no-recursion) \
    | tar xf - -C "$WORK/orig/roj-$VERSION"
tar czf "$WORK/roj_$VERSION.orig.tar.gz" -C "$WORK/orig" "roj-$VERSION"

# The upload path Launchpad documents: ~OWNER/ubuntu/PPA.
cat > "$WORK/dput.cf" <<CF
[launchpad]
fqdn = ppa.launchpad.net
method = ftp
incoming = ~$owner/ubuntu/$name/
login = anonymous
allow_unsigned_uploads = 0
CF

# Launchpad's upload server sometimes answers 550 under load: try each upload
# a few times, carry on with the other series, and fail at the end.
upload() {
    local tries=0
    until dput -f -c "$WORK/dput.cf" launchpad "$1"; do
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
    cp -r "$SOURCE/debian" "$dir/roj-$VERSION/"
    (cd "$dir/roj-$VERSION" && dch -b --newversion "$version" --distribution "$series" --force-distribution \
        "Build for Ubuntu $series. See CHANGELOG.md for the changes in $VERSION." >/dev/null 2>&1)
    changes="$dir/roj_${version}_source.changes"
    if [ -n "${DRY_RUN:-}" ]; then
        (cd "$dir/roj-$VERSION" && dpkg-buildpackage -S -sa -d -us -uc >"$dir/build.log" 2>&1)
        echo "built $changes (not uploaded)"
        continue
    fi
    (cd "$dir/roj-$VERSION" && dpkg-buildpackage -S -sa -d -k"$GPG_KEY_ID" >"$dir/build.log" 2>&1) \
        || { tail -20 "$dir/build.log" >&2; exit 1; }
    if [ -n "${CHECK:-}" ]; then
        gpg --verify "$changes" 2>&1 | grep -E "Good signature|Primary key fingerprint" || { echo "signature check failed" >&2; exit 1; }
        echo "signed $(basename "$changes") as $(grep -m1 '^Changed-By:' "$changes" | cut -d' ' -f2-)"
        continue
    fi
    if upload "$changes"; then
        echo "uploaded roj $version to ~$owner/ubuntu/$name"
    else
        failed+=("$version")
    fi
done

if [ -n "${CHECK:-}" ]; then
    fpr="$(gpg --list-keys --with-colons "$GPG_KEY_ID" | awk -F: '/^fpr/ {print $10; exit}')"
    curl -s -m 60 "https://launchpad.net/~$owner" | tr -d ' ' | grep -q "$fpr" \
        && echo "Launchpad: key $fpr is on ~$owner" || { echo "Launchpad: key $fpr is not on ~$owner" >&2; exit 1; }
    status="$(curl -s -m 60 "https://api.launchpad.net/devel/~$owner/+archive/ubuntu/$name" | jq -r '.status // empty')"
    [ "$status" = Active ] && echo "Launchpad: PPA ~$owner/ubuntu/$name is active" \
        || { echo "Launchpad: PPA ~$owner/ubuntu/$name not found or not active ($status)" >&2; exit 1; }
fi
if [ "${#failed[@]}" -gt 0 ]; then
    echo "not uploaded: ${failed[*]}" >&2
    exit 1
fi
