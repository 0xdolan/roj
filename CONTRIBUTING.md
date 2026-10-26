# Contributing to Roj

Thank you for helping. This page has the project's rules and how to work on it.

## Rules

1. **No dashes, ever.** Do not use the em dash (U+2014), the en dash (U+2013) or look-alikes (figure dash, horizontal bar, the minus sign U+2212, box-drawing lines) anywhere: code, comments, documentation, interface text, translations, commit messages. Use a comma, a colon, "·", the word "to", or a plain hyphen-minus (-). `scripts/check-dashes.sh` checks every file in `make test` and in CI.
2. **Every interface string is translatable.** Write it in English inside `_()`, or `N_()` when it is translated later, and add it to all four catalogs in `extension/locale/` (Sorani, Kurmanji, Persian, Arabic). `make i18n` lists anything missing. Use `{name}` placeholders, never string concatenation.
3. **The core stays GNOME-free.** `extension/lib/engine.js`, `events.js`, `ics.js`, `icsExport.js`, `richtext.js`, `i18n.js` and `tsroj.js` must not import GNOME libraries, so the CLI and the tests run on Node.js.
4. **Do not edit `extension/lib/tsroj.js` by hand.** Fix tsroj upstream, then `make vendor`.
5. **Every user-visible change gets a CHANGELOG.md line** under *Unreleased* (see [RELEASING.md](RELEASING.md)).
6. **Test in the sandbox, not your session.** `scripts/sandbox.sh PLAN.json` runs GNOME Shell headless with a throwaway configuration.
7. **Screenshots follow the interface.** When a change alters anything a screenshot shows (the top bar, the popup and its events, a settings page, the guide page, a translation, a font, a colour, or the `roj` output in the marketing images), run `make screenshots`, and `make marketing` for the banner, store and terminal images, then commit the updated images with the change. Look at every changed image before committing: a screenshot that shows an error or a half-loaded page is worse than an old one. Update a guide or README caption when the picture no longer matches it.
8. **The Kurdish events have one source.** Edit `extension/data/events/kurdish.json`, then run `make ics` to rebuild the calendars in `docs/calendar/`. `make test` fails when they are out of date. Give every event an `id`, which calendar apps use to recognise it, and titles in `ckb`, `kmr` and `en`.

## Getting started

```sh
git clone https://github.com/0xdolan/roj.git && cd roj
make dev-link      # your installed extension and roj now point at this checkout
make test
```

You need GNOME Shell 45 or newer, `gjs`, Node.js 18 or newer, and `glib-compile-schemas`. For packaging: `debhelper`, `devscripts` and `lintian`. For screenshots and images: `inkscape`, ImageMagick and Google Chrome or Chromium.

After changing the extension, log out and in (Wayland), or run it in the sandbox: `make screenshots` covers the popup and every settings page.

## Translations

The catalogs in `extension/locale/` map each English message to its translation:

```js
export default {
    "Today": "ئەمڕۆ",
    "{count} events": "{count} بۆنە",
};
```

- Keep `{placeholders}` and `<b>` tags exactly as they are; `make i18n` checks placeholders.
- A message starting with `context|` (for example `language|Persian`) is the same English word in a different meaning; translate only the part after `|`.
- Native speakers' corrections are very welcome. Open a pull request, or an issue with the message and your wording.

## Commits and pull requests

- One topic per pull request, with a CHANGELOG.md line when users will notice it.
- Commit messages: a short imperative summary ("Add Arabic event titles"), then details if needed.
- `make test` must pass. CI also builds the zip, the tarball and both .deb packages and runs lintian.
