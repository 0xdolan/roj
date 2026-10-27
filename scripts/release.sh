#!/usr/bin/env bash
# Cut a release the git flow way, end to end: scripts/release.sh X.Y.Z
# (or make release V=X.Y.Z). Each step waits for the one before and the
# script stops at the first failure, so nothing merges unless the local
# tests and GitHub's required checks pass:
#   1. release/X.Y.Z from an up-to-date develop
#   2. scripts/bump-version.sh: every version string, the changelog section
#      and links, the website's engine copy
#   3. make screenshots marketing (they show the version; SKIP_IMAGES=1 skips)
#   4. make test and make release-assets
#   5. commit, push and a pull request into main, merged by GitHub once CI passes
#   6. the annotated tag vX.Y.Z on the merge commit, then the Release workflow
#   7. a pull request from main back into develop, merged once CI passes
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
V="${1:?usage: scripts/release.sh X.Y.Z}"
[[ "$V" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version must look like 1.2.3" >&2; exit 2; }

step() { printf '\n== %s\n' "$*"; }
die() { echo "release: $*" >&2; exit 1; }

# Wait for a pull request's checks, then for GitHub to merge it.
merge_when_green() {
  local pr="$1"
  gh pr merge "$pr" --merge --auto >/dev/null
  # Checks can take a moment to appear after a push.
  until [ "$(gh pr view "$pr" --json statusCheckRollup --jq '.statusCheckRollup | length')" != 0 ]; do sleep 5; done
  gh pr checks "$pr" --watch --fail-fast >/dev/null || die "checks failed on $pr: $(gh pr view "$pr" --json url --jq .url)"
  until [ "$(gh pr view "$pr" --json state --jq .state)" = MERGED ]; do sleep 5; done
  echo "merged $pr"
}

step "Checks before starting"
command -v gh >/dev/null || die "needs the GitHub CLI (gh)"
git diff --quiet && git diff --cached --quiet || die "commit or stash your changes first"
git rev-parse -q --verify "refs/tags/v$V" >/dev/null && die "v$V already exists"
git fetch -q --tags origin
git ls-remote --exit-code --tags origin "v$V" >/dev/null 2>&1 && die "v$V already exists on GitHub"
git switch -q develop && git pull -q --ff-only
awk '/^## \[Unreleased\]/ {f = 1; next} /^## \[/ {f = 0} f && /^- /' CHANGELOG.md | grep -q . \
  || die "CHANGELOG.md has nothing under Unreleased"

step "release/$V from develop"
git switch -c "release/$V"
scripts/bump-version.sh "$V"

if [ -z "${SKIP_IMAGES:-}" ]; then
  step "Screenshots and marketing images"
  make screenshots >/dev/null
  make marketing >/dev/null
fi

step "Tests and release files"
make test
command rm -rf dist
make release-assets

step "Pull request into main"
git add -A
git commit -q -m "Release $V"
git push -q -u origin "release/$V"
notes="$(awk -v v="## [$V]" 'index($0, v) == 1 {f = 1; next} /^## \[/ {f = 0} /^\[[^]]*\]: / {next} f' CHANGELOG.md)"
pr="$(gh pr create --base main --head "release/$V" --title "Release $V" --body "$notes")"
echo "$pr"
merge_when_green "$pr"

step "Tag v$V"
git fetch -q origin
git switch -q main && git pull -q --ff-only
scripts/check-version.sh "v$V"
git tag -a "v$V" -m "Roj $V"
git push -q origin "v$V"
run=""
until [ -n "$run" ]; do
  sleep 5
  run="$(gh run list --workflow release.yml --branch "v$V" --limit 1 --json databaseId --jq '.[0].databaseId // empty')"
done
gh run watch "$run" --exit-status >/dev/null || die "the Release workflow failed: $(gh run view "$run" --json url --jq .url)"
echo "$(gh release view "v$V" --json url --jq .url)"

step "main back into develop"
back="$(gh pr create --base develop --head main --title "Merge release $V back into develop" \
  --body "Brings the $V release back into develop, as RELEASING.md describes.")"
echo "$back"
merge_when_green "$back"
git switch -q develop && git pull -q --ff-only

step "Released Roj $V"
