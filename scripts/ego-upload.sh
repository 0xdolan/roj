#!/usr/bin/env bash
# Upload the extension zip to extensions.gnome.org:
#   scripts/ego-upload.sh ZIP        log in, upload, print the site's reply
#   scripts/ego-upload.sh --check    only log in
# Reads EGO_USERNAME and EGO_PASSWORD from the environment.
set -euo pipefail
API=https://extensions.gnome.org/api/v1
check=""
if [ "${1:-}" = --check ]; then check=1; shift; fi
: "${EGO_USERNAME:?EGO_USERNAME is not set}" "${EGO_PASSWORD:?EGO_PASSWORD is not set}"

login="$(jq -n --arg u "$EGO_USERNAME" --arg p "$EGO_PASSWORD" '{login: $u, password: $p}' \
  | curl -sS -H 'Content-Type: application/json' -d @- "$API/accounts/login/")"
token="$(jq -r '.token // empty' <<<"$login")"
if [ -z "$token" ]; then
  echo "extensions.gnome.org login failed: $(jq -r '.detail // .' <<<"$login" 2>/dev/null || echo "$login")" >&2
  exit 1
fi
echo "Logged in to extensions.gnome.org as $EGO_USERNAME"
[ -z "$check" ] || exit 0

zip="${1:?usage: scripts/ego-upload.sh [--check] ZIP}"
[ -f "$zip" ] || { echo "no such file: $zip" >&2; exit 2; }
reply="$(mktemp)"
# DIAGNOSTIC (temporary)
echo "token length: ${#token}; token chars outside [A-Za-z0-9]: $(tr -d 'A-Za-z0-9' <<<"$token" | wc -c)"
echo "fake token upload: $(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Token bogus" -F "source=@$zip;type=application/zip;filename=extension.zip" -F shell_license_compliant=true -F tos_compliant=true "$API/extensions")"
echo "real token, no file: $(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Token $token" -F shell_license_compliant=true -F tos_compliant=true "$API/extensions")"
echo "login reply keys: $(jq -c 'keys' <<<"$login")"
status="$(curl -sS -o "$reply" -w '%{http_code}' -H "Authorization: Token $token" \
  -F "source=@$zip;type=application/zip;filename=extension.zip" \
  -F shell_license_compliant=true -F tos_compliant=true "$API/extensions")"
cat "$reply"; echo
command rm -f "$reply"
if [ "$status" -ge 300 ]; then
  echo "extensions.gnome.org refused the upload (HTTP $status)" >&2
  exit 1
fi
echo "Uploaded $(basename "$zip"). It goes live after GNOME's review."
