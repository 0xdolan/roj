#!/usr/bin/env bash
# Import the signing key on a CI runner and print its key id:
#   GPG_KEY_ID="$(scripts/gpg-setup.sh)"
# Reads GPG_PRIVATE_KEY and GPG_PASSPHRASE from the environment.
set -euo pipefail
: "${GPG_PRIVATE_KEY:?GPG_PRIVATE_KEY is not set}"
mkdir -p ~/.gnupg && chmod 700 ~/.gnupg
echo "allow-loopback-pinentry" > ~/.gnupg/gpg-agent.conf
printf '%s' "${GPG_PASSPHRASE:-}" > ~/.gnupg/passphrase
printf 'pinentry-mode loopback\npassphrase-file %s\n' ~/.gnupg/passphrase > ~/.gnupg/gpg.conf
echo "$GPG_PRIVATE_KEY" | gpg --batch --import 2>/dev/null
# Trust our own key, so dput's signature check passes.
gpg --list-secret-keys --with-colons | awk -F: '/^fpr/ {print $10 ":6:"; exit}' | gpg --import-ownertrust 2>/dev/null
gpg --list-secret-keys --with-colons | awk -F: '/^sec/ {print $5; exit}'
