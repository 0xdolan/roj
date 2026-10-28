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
SERIES="${SERIES:-noble resolute}"
REV="${DEB_REVISION:-1}"
export DEBFULLNAME="${DEBFULLNAME:-0xdolan}"
export DEBEMAIL="${DEBEMAIL:-0xdolan@users.noreply.github.com}"
WORK="$ROOT/build/ppa"
owner="${PPA#ppa:}"; name="${owner#*/}"; owner="${owner%%/*}"

if [ -z "${DRY_RUN:-}" ] && [ -z "${GPG_KEY_ID:-}" ]; then
    echo "GPG_KEY_ID is required to sign (or set DRY_RUN=1)" >&2
    exit 2
fi
# Launchpad finds the uploader by the Changed-By email, so it must be one of
# the signing key's addresses.
if [ -z "${DRY_RUN:-}" ]; then
    uids="$(gpg --list-keys --with-colons "$GPG_KEY_ID" | awk -F: '$1 == "uid" {print tolower($10)}')"
    if [[ "$uids" != *"<${DEBEMAIL,,}>"* ]]; then
        echo "DEBEMAIL is not an email address of key $GPG_KEY_ID, so Launchpad would reject the upload" >&2
        exit 1
    fi
    echo "Changed-By email matches key $GPG_KEY_ID"
fi
[ -z "${CHECK:-}" ] || SERIES="${SERIES%% *}"

command rm -rf "$WORK"
mkdir -p "$WORK/orig/roj-$VERSION"
# The upstream tarball: every tracked file except debian/.
(cd "$SOURCE" && git ls-files -co --exclude-standard -z -- . ':(exclude)debian' | xargs -0 tar cf - --no-recursion) \
    | tar xf - -C "$WORK/orig/roj-$VERSION"
# Reproducible, so every upload of this version carries the same bytes.
stamp="$(cd "$SOURCE" && git log -1 --format=%ct)"
tar --sort=name --mtime="@$stamp" --owner=0 --group=0 --numeric-owner -C "$WORK/orig" -cf - "roj-$VERSION" \
    | gzip -n -9 > "$WORK/roj_$VERSION.orig.tar.gz"

# Launchpad keeps one upstream tarball per version: once the PPA has this
# version for any series, use exactly its tarball and leave it out of the upload.
orig_flag=-sa
if [ -z "${DRY_RUN:-}${CHECK:-}" ]; then
    api="https://api.launchpad.net/devel/~$owner/+archive/ubuntu/$name"
    known="$(curl -s -m 60 "$api?ws.op=getPublishedSources&source_name=roj" \
        | jq -r '.entries[].source_package_version' 2>/dev/null | grep -m1 "^$VERSION-" || true)"
    if [ -n "$known" ]; then
        curl -sSfL -m 300 -o "$WORK/roj_$VERSION.orig.tar.gz" \
            "https://launchpad.net/~$owner/+archive/ubuntu/$name/+sourcefiles/roj/$known/roj_$VERSION.orig.tar.gz"
        orig_flag=-sd
        echo "The PPA already has roj $VERSION ($known): using its .orig.tar.gz, uploading without it"
    fi
    # Skip series Launchpad no longer accepts.
    active="$(curl -s -m 60 https://api.launchpad.net/devel/ubuntu/series | jq -r '.entries[] | select(.status != "Obsolete") | .name')"
    keep=""
    for series in $SERIES; do
        if grep -qx "$series" <<<"$active"; then keep="$keep $series"; else echo "skipping $series: obsolete on Launchpad"; fi
    done
    SERIES="${keep# }"
fi

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
        [ "$tries" -lt 5 ] || return 1
        echo "upload failed, retrying in 120 s ($tries/5)"
        sleep 120
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
    (cd "$dir/roj-$VERSION" && dpkg-buildpackage -S "$orig_flag" -d -k"$GPG_KEY_ID" >"$dir/build.log" 2>&1) \
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
    profile="$(curl -s -m 60 "https://launchpad.net/~$owner" | tr -d ' ')"
    if [[ "$profile" == *"$fpr"* ]]; then
        echo "Launchpad: key $fpr is on ~$owner"
    else
        echo "Launchpad: key $fpr is not on ~$owner" >&2
        exit 1
    fi
    status="$(curl -s -m 60 "https://api.launchpad.net/devel/~$owner/+archive/ubuntu/$name" | jq -r '.status // empty')"
    [ "$status" = Active ] && echo "Launchpad: PPA ~$owner/ubuntu/$name is active" \
        || { echo "Launchpad: PPA ~$owner/ubuntu/$name not found or not active ($status)" >&2; exit 1; }
fi
if [ "${#failed[@]}" -gt 0 ]; then
    echo "not uploaded: ${failed[*]}" >&2
    exit 1
fi
