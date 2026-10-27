# Releasing Roj

How versions are numbered, how changes are recorded, and what happens when a
release is tagged. The one-time account setup (GitHub, extensions.gnome.org,
Launchpad) is in [docs/PUBLISHING.md](docs/PUBLISHING.md).

## Versions

Roj follows [Semantic Versioning](https://semver.org/): **MAJOR.MINOR.PATCH**.

| Change | Bump | Example |
| --- | --- | --- |
| A fix that changes nothing else | PATCH | 0.1.0 to 0.1.1 |
| A new feature, setting, language or event set | MINOR | 0.1.1 to 0.2.0 |
| A removed setting, a changed setting meaning or file format | MAJOR | 0.2.0 to 1.0.0 |

The version lives in five places, and `scripts/check-version.sh` fails when they disagree:
`extension/metadata.json` (`version-name`), `package.json`, `extension/lib/constants.js`,
`debian/changelog` and `man/roj.1`. `scripts/bump-version.sh` updates them all.

extensions.gnome.org numbers uploads itself (1, 2, 3 ...); users see `version-name`.

## Tags

- Every release has an annotated tag `vMAJOR.MINOR.PATCH` on `main`, for example `v0.2.0`.
- A tag is never moved or reused. If a release is broken, fix it and release the next PATCH version.
- Packaging-only fixes for the PPA raise the Debian revision instead (`DEB_REVISION=2`, giving `0.2.0-2`).

## The changelog

Every user-visible change gets a line in [CHANGELOG.md](CHANGELOG.md) under **Unreleased**, in the same pull request as the change. Use the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) sections:

- **Added** for new features,
- **Changed** for changes in existing behaviour,
- **Deprecated** for features that will be removed,
- **Removed** for removed features,
- **Fixed** for bug fixes,
- **Security** for vulnerabilities.

Write for users, in plain words, one change per line. No dashes (see [CONTRIBUTING.md](CONTRIBUTING.md)). The release notes on GitHub are this section, copied automatically.

## Cutting a release

`main` and `develop` are protected (see [Branch protection](#branch-protection)), so a release travels as pull requests. One command runs the whole flow, from a clean checkout with the changes already under **Unreleased** in CHANGELOG.md:

```sh
make release V=0.2.1
```

`scripts/release.sh` stops at the first failure, so nothing merges unless the tests and CI pass:

1. Creates `release/0.2.1` from an up-to-date `develop`.
2. Runs `scripts/bump-version.sh 0.2.1`: every version string, the Unreleased lines moved under `[0.2.1]`, the changelog compare links, and the website's engine copy.
3. Runs `make screenshots marketing`, because the images show the version (`SKIP_IMAGES=1` skips them).
4. Runs `make test` and `make release-assets`.
5. Commits "Release 0.2.1", pushes, and opens a pull request into `main` with the changelog section as its description. GitHub merges it by itself once the **test** and **gitflow** checks pass (auto-merge).
6. Tags the merge commit `v0.2.1`, pushes the tag and waits for the Release workflow.
7. Opens a pull request from `main` back into `develop` and waits for GitHub to merge it.

Choose the version by the table above. A hotfix works the same way by hand: `hotfix/0.2.2` from `main`, a pull request into `main`, the tag, then `main` back into `develop`.

### Feature branches

Every change starts on `feature/NAME` from `develop`. When `make test` passes, push it and let GitHub merge the pull request once CI is green:

```sh
gh pr create --base develop --fill
gh pr merge --merge --auto
```

## What the tag does

The **Release** workflow (`.github/workflows/release.yml`) runs on the tag:

1. **build**: checks that the tag matches every version string, runs `make release-assets` (tests, then the extension zip, the source tarball, both .deb packages and `SHA256SUMS`) and writes the release notes from the changelog.
2. **github-release**: publishes the GitHub release with all those files.
3. **extensions-gnome-org**: uploads the zip to extensions.gnome.org. GNOME reviews every version; users get it after approval, usually within a few days.
4. **launchpad-ppa**: builds signed source packages for each Ubuntu series in `PPA_SERIES` and uploads them to the PPA, where Launchpad builds the packages for apt.

Steps 3 and 4 skip themselves until their secrets exist, so a release always works.

| Channel | Users get it |
| --- | --- |
| GitHub release | As soon as the workflow finishes |
| extensions.gnome.org | After GNOME's review |
| Ubuntu PPA | After Launchpad builds it, usually within an hour |

## After the release

- Check the GitHub release page, the review queue on extensions.gnome.org and the PPA's build page.
- Add an empty `## [Unreleased]` heading back to the top of CHANGELOG.md if the bump moved it.

## Branch protection

Both long-lived branches have a repository ruleset (Settings, Rules, Rulesets):

| Branch | Rules |
| --- | --- |
| `main` | No deletion, no force push, changes only by pull request merged with a merge commit, the **test** and **gitflow** checks must pass, the branch must be up to date first |
| `develop` | No deletion, no force push, changes only by pull request, the **test** check must pass |
| tags `v*` | No deletion, no moving: a released tag is final |

**gitflow** is a job in `.github/workflows/ci.yml`: it lets only `develop`, `release/*` and `hotfix/*` merge into `main`. No review is required, because a maintainer can never approve their own pull request; green checks are the gate. To change a rule, edit the ruleset on GitHub and update this table in the same change.

## Engine updates

`.github/workflows/tsroj-update.yml` checks npm every Monday. When `@0xdolan/tsroj` has a new version, it vendors it on `feature/tsroj-X.Y.Z` from `develop`, runs the tests and opens a pull request into `develop`. Merge it, add a changelog line under **Changed** ("Engine: tsroj X.Y.Z"), and release as usual.

## Ubuntu series

`PPA_SERIES` (a repository variable) lists the Ubuntu releases to build for. Add a new series when Ubuntu releases one, and drop series when they reach end of life. The default is `noble questing resolute` (24.04, 25.10 and 26.04).
