# Changelog

Every change that users can notice is recorded here, newest first. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions
follow [Semantic Versioning](https://semver.org/). How to write entries and cut
a release is described in [RELEASING.md](RELEASING.md).

## [Unreleased]

### Fixed

- The Ubuntu PPA gets packages for every supported release (24.04, 25.10 and 26.04): uploads now retry when Launchpad's server is busy, instead of stopping after the first failure.

## [0.2.1] - 2026-10-26

### Added

- Roj on extensions.gnome.org (<https://extensions.gnome.org/extension/11501/roj-kurdish-calendar/>), linked from the About page, the website, the guide and the README.

### Changed

- The extensions.gnome.org download no longer contains the `roj` command, as that site asks for no files the extension does not use. The packages, the tarball and `make install` still install it, and the About page shows how.

## [0.2.0] - 2026-10-26

The first published release. It also contains everything listed under [0.1.0](https://github.com/0xdolan/roj/blob/main/CHANGELOG.md#010---2026-10-26) in the changelog.

### Added

- 43 Kurdish events, up from 12: the historical, cultural and remembrance days of the pyroj calendar (Halabja, the Anfal, the liberation of the cities in 1991, Shingal, Roboski, the Republic of Kurdistan and more), with Sorani descriptions and sources and titles in Sorani, Kurmanji and English.
- The Kurdish events as calendars for Google Calendar, iPhone and Mac, in Sorani, Kurmanji and English, to subscribe to or import. They are on the website and attached to every release.
- `roj ics` prints your events as an .ics file.
- How-to guides with screenshots: showing the dates in your language, the Persian and Islamic days on the cards, your country's holidays, the top bar and converting a date.
- A live calendar on the website, <https://0xdolan.github.io/roj/calendar/>: the popup running the same engine in any browser, in all five languages, with every Kurdish day and its history, one-click calendar subscriptions and a converter.

### Changed

- Persian and Arabic write "Kurdish" the Kurdish way, with و: کوردی and کوردستان, الكوردية and كوردستان.
- Each calendar's numbers use the digits of its own language, whatever language its words are in: Gregorian in English digits (2026), Persian in Persian digits (۱۴۰۵), Islamic in Arabic digits (١٤٤٨) and the Kurdish date in the digits of the main language. The Digits settings for each language apply to its calendar.
- The description in Extension Manager and on extensions.gnome.org covers all five languages, each calendar's digits and the Kurdish days, and links to the guide and the live calendar.

### Fixed

- The weekday names in the popup sit exactly over their columns of day cards.
- With Leading zero on automatic, Persian and Arabic digits never get a leading zero (۵, not ۰۵), even in Kurmanji or English.

## [0.1.0] - 2026-10-26

The first version. It was never tagged or published on its own; it ships as part of 0.2.0.

### Added

- The Kurdish solar date in the GNOME top bar, with any strftime pattern, and a marker (dot, count or title, red on holidays) when today has events.
- A popup with the selected day in four calendars, a month of day cards, the day's events, quick actions and a credits line. It keeps the same size on every day.
- Day cards: the Kurdish day large, with the Gregorian (on by default), Persian and Islamic days as small numbers, in a row or in the corners.
- Five languages for the dates and the interface: Sorani, Kurmanji, English, Persian and Arabic, with right-to-left layouts. The other calendars can follow the main date, the interface, or their own language.
- Digits per language (Persian ۰۱۲, Sorani and Arabic ٠١٢, English and Kurmanji 012 by default), with overrides.
- Sorani ezafe (ی) per calendar, on for the Kurdish date by default; leading zero control; month and weekday name variants; Kurdish solar or Fall of Nineveh year numbering; Islamic day adjustment.
- Events: built-in Kurdish events, your own JSON files, and local or online .ics calendars with an offline cache and one-click national holiday calendars.
- Fonts per script: Manrope for left-to-right text; Vazirmatn, Estedad or Sahel for right-to-left text; any installed font or a font file.
- Preferences: General, Appearance, Formats (every token with live examples), Events, Converter, Guide and About pages; light, dark and system themes; settings export, import and reset.
- The `roj` command-line tool, with a man page, for GJS or Node.js.
- Packages: extensions.gnome.org bundle, `roj` and `gnome-shell-extension-roj` .deb packages, a source tarball and checksums.
- Engine: tsroj 1.0.6.

[Unreleased]: https://github.com/0xdolan/roj/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/0xdolan/roj/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/0xdolan/roj/releases/tag/v0.2.0
[0.1.0]: https://github.com/0xdolan/roj/tree/4fe8b47
