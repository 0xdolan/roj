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

```sh
git switch main && git pull
make test                             # everything must pass
scripts/bump-version.sh 0.2.0         # sets the version everywhere, opens the changelog section
$EDITOR CHANGELOG.md                  # move the Unreleased lines under [0.2.0], add the compare link
make screenshots marketing            # only if the interface changed
git commit -am "Release 0.2.0"
git tag -a v0.2.0 -m "Roj 0.2.0"
git push origin main v0.2.0
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

## Engine updates

`.github/workflows/tsroj-update.yml` checks npm every Monday. When `@0xdolan/tsroj` has a new version, it vendors it, runs the tests and opens a pull request. Merge it, add a changelog line under **Changed** ("Engine: tsroj X.Y.Z"), and release as usual.

## Ubuntu series

`PPA_SERIES` (a repository variable) lists the Ubuntu releases to build for. Add a new series when Ubuntu releases one, and drop series when they reach end of life. The default is `noble questing resolute` (24.04, 25.10 and 26.04).
