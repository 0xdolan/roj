# Notes for AI assistants working on Roj

- Never write an em dash (U+2014), en dash (U+2013) or any look-alike (figure dash, horizontal bar, minus sign U+2212, box-drawing lines) anywhere: code, comments, docs, UI strings, translations, commit messages. Use a comma, colon, "·", "to", or a plain hyphen-minus. `scripts/check-dashes.sh` enforces this in `make lint` and CI.
- Every interface string goes through `_()` (or `N_()` when translated later) with English as the key, and needs an entry in all four catalogs in `extension/locale/`. Check with `make i18n`.
- The engine (`extension/lib/engine.js`) and `extension/lib/tsroj.js` must stay free of GNOME imports so the CLI and tests run on Node.
- Verify UI changes in the sandboxed headless shell (`scripts/sandbox.sh`, `make screenshots`), never in the user's own session.
- When a change alters anything a screenshot shows (top bar, popup, events, settings pages, translations, fonts, colours, `roj` output in the marketing images), rerun `make screenshots` (and `make marketing` for the marketing images), look at every changed image, and commit them with the change. Fix captions that no longer match. See rule 7 in `CONTRIBUTING.md`.
- The Kurdish events live only in `extension/data/events/kurdish.json`. After editing it, run `make ics` to rebuild `docs/calendar/*.ics`; `make test` checks they match.
- Versioning and releases follow `RELEASING.md`.
