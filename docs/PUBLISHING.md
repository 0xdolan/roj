# Publishing Roj

The one-time setup that connects the GitHub repository to every place Roj is
published. Once it is done, a single tag updates all of them (see
[RELEASING.md](../RELEASING.md)).

| Channel | What users install | Updated by |
| --- | --- | --- |
| GitHub releases | Extension zip, `roj` and `gnome-shell-extension-roj` .deb, source tarball, `SHA256SUMS` | The Release workflow |
| extensions.gnome.org | The extension, from Extension Manager or the website | The Release workflow, then GNOME's review |
| Ubuntu PPA `ppa:0xdolan/roj` | `gnome-shell-extension-roj` and `roj` through apt | The Release workflow, then Launchpad's build |
| GitHub Pages | The website and the guide | Every push to `main` |

Secrets and variables are added under **GitHub, repository Settings, Secrets and variables, Actions**.

## 1. GitHub

1. Push the code: `git remote add origin https://github.com/0xdolan/roj.git && git push -u origin main`.
2. Make the repository **public** when you are ready. Pages, the links inside the extension, extensions.gnome.org and Launchpad all expect public URLs.
3. **Settings, Pages**: Source *Deploy from a branch*, branch `main`, folder `/docs`. The site appears at <https://0xdolan.github.io/roj/>.
4. **Settings, Actions, General, Workflow permissions**: choose *Read and write permissions* and tick *Allow GitHub Actions to create and approve pull requests* (for the weekly tsroj update).
5. **Settings, General, Social preview**: upload `docs/images/marketing/banner.png`.
6. Optional: **Settings, Rules**: protect `main` and require the CI check.

## 2. extensions.gnome.org (EGO)

1. Create an account: <https://extensions.gnome.org/accounts/register/>.
2. Upload the first version by hand, so the listing gets its icon and screenshot:
   - `make pack` creates `dist/roj@0xdolan.github.io.shell-extension.zip`.
   - Upload it at <https://extensions.gnome.org/upload/> and accept the terms.
   - Wait for the review. The reviewers may ask questions; the notes at the end of this file answer the usual ones.
3. After approval, edit the listing on your extension's page:
   - **Icon**: `assets/logo-256.png`
   - **Screenshot**: `docs/images/marketing/store.png`
   - The description comes from `extension/metadata.json`; a longer text is at the end of this file.
4. Add two repository **secrets**:

   | Secret | Value |
   | --- | --- |
   | `EGO_USERNAME` | your extensions.gnome.org user name |
   | `EGO_PASSWORD` | your extensions.gnome.org password |

From then on, every tag uploads the new version through EGO's API (`/api/v1/accounts/login/`, then `/api/v1/extensions`), the same calls `gnome-extensions upload` makes. Each version still goes through review before users receive it.

## 3. Ubuntu PPA on Launchpad

A PPA (Personal Package Archive) lets Ubuntu users install Roj with apt and receive updates with their system updates. You upload signed *source* packages; Launchpad builds the .deb files for each Ubuntu release.

### 3.1 Account and key

1. Create a Launchpad account: <https://login.launchpad.net/>. Note your Launchpad user name (shown in your profile URL, `launchpad.net/~NAME`).
2. Create a signing key, unless you already have one. Use the email address of your Launchpad account:

   ```sh
   gpg --full-generate-key            # RSA and RSA, 4096 bits, your name, your Launchpad email
   gpg --list-secret-keys --keyid-format=long
   ```

   The key ID is the part after `rsa4096/` on the `sec` line, for example `3AA5C34371567BD2`.
3. Publish the public key and register it with Launchpad:

   ```sh
   gpg --keyserver keyserver.ubuntu.com --send-keys KEY_ID
   gpg --fingerprint KEY_ID
   ```

   On Launchpad open your profile, **OpenPGP keys**, paste the fingerprint and import it. Launchpad emails you an encrypted message; decrypt it (`gpg --decrypt`, paste the message) and open the link inside to confirm.
4. If Launchpad asks you to, sign the Ubuntu Code of Conduct from your profile page.

### 3.2 The PPA

1. On your profile choose **Create a new PPA**: name `roj`, display name `Roj`, description "Kurdish solar calendar for GNOME and the command line."
2. Your PPA is `ppa:NAME/roj`. If NAME is not `0xdolan`, add a repository **variable** `PPA` with your value, and update the install commands in `README.md` and `docs/index.html`.

### 3.3 Connect GitHub

Add these repository **secrets**:

| Secret | Value |
| --- | --- |
| `LAUNCHPAD_GPG_PRIVATE_KEY` | the output of `gpg --armor --export-secret-keys KEY_ID` |
| `LAUNCHPAD_GPG_PASSPHRASE` | the key's passphrase |
| `DEBFULLNAME` | your name, as in the key |
| `DEBEMAIL` | your Launchpad email, as in the key |

Optional repository **variables**:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PPA` | `ppa:0xdolan/roj` | where to upload |
| `PPA_SERIES` | `noble questing resolute` | Ubuntu releases to build for (24.04, 25.10, 26.04) |

A dedicated key used only for Roj uploads keeps your main key off GitHub. You can revoke it on Launchpad at any time.

### 3.4 Test it by hand (optional)

Build the source packages without uploading, then upload one by hand:

```sh
DRY_RUN=1 scripts/ppa-upload.sh                  # builds build/ppa/<series>/roj_*_source.changes
DEBFULLNAME="Your Name" DEBEMAIL=you@example.com GPG_KEY_ID=KEY_ID SERIES=resolute scripts/ppa-upload.sh
```

Launchpad emails you when it accepts or rejects an upload, and shows the build at `launchpad.net/~NAME/+archive/ubuntu/roj`.

Users then install with:

```sh
sudo add-apt-repository ppa:0xdolan/roj
sudo apt install gnome-shell-extension-roj roj
```

## 4. Later, if you want more channels

- **Debian itself**: upload to <https://mentors.debian.net/> and find a Debian Developer to sponsor it. The `debian/` folder is already in the format they expect.
- **Fedora**: a COPR repository can build from the source tarball.
- **Arch Linux**: an AUR package can install from the tarball with `make install-system PREFIX=/usr DESTDIR="$pkgdir"`.

## Notes for the extensions.gnome.org review

- No `gschemas.compiled` in the zip: GNOME Shell 45 and later compile schemas on install. `scripts/pack.sh` leaves it out.
- Everything created in `enable()` is destroyed in `disable()`: the top-bar button, timers, settings and signal connections, the event store and its refresh timer. The repository's sandbox test enables and disables Roj repeatedly without errors.
- Network: only for .ics links the user adds, cached in `~/.cache/roj`.
- Files written only when the user asks: settings exports, loaded fonts (`~/.local/share/roj/fonts`), the optional `~/.local/bin/roj` launcher, and, on Pango older than 1.56, the optional font install.
- `extension/lib/tsroj.js` is the unminified tsroj build (GPL-3.0), copied verbatim.
- `cli/roj.js` is the optional command-line tool; the extension never runs it.

## Longer listing description

> **Roj** shows the Kurdish solar date in your top bar. Roj means both sun and day in Kurdish.
>
> Every day in its calendar shows the Kurdish day, with the Gregorian, Persian and Islamic days beside it. The popup lists the selected day in all four calendars and its events.
>
> • Sorani, Kurmanji, English, Persian and Arabic
> • Sorani ezafe (ی), each language's own digits and traditional month names
> • Kurdish events included; add JSON events or any .ics calendar, including national holidays
> • A marker in the top bar when today has an event
> • Separate fonts for Latin and Arabic-script text: Manrope, Vazirmatn, Estedad, Sahel, any installed font or a font file
> • Any strftime pattern for the top bar and popup, with live previews
> • Date converter, a built-in guide, light, dark and system themes, and settings backup
> • The `roj` command for the terminal
>
> Source, guide and issues: https://github.com/0xdolan/roj
