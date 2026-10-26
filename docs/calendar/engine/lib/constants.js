// SPDX-License-Identifier: GPL-3.0-or-later
// Project-wide constants shared by the Shell extension, preferences and CLI.

export const UUID = 'roj@0xdolan.github.io';
export const SCHEMA_ID = 'org.gnome.shell.extensions.roj';
export const VERSION = '0.1.0';
export const TSROJ_VERSION = '1.0.6';

export const AUTHOR = '0xdolan';
export const REPO_URL = 'https://github.com/0xdolan/roj';
export const SITE_URL = 'https://0xdolan.github.io/roj/';
export const DOCS_URL = `${SITE_URL}guide.html`;
export const ISSUES_URL = `${REPO_URL}/issues`;
export const STORY_URL = `${SITE_URL}story.html`;
export const CHANGELOG_URL = `${REPO_URL}/blob/main/CHANGELOG.md`;
export const AUTHOR_URL = 'https://github.com/0xdolan';
export const TSROJ_URL = 'https://www.npmjs.com/package/@0xdolan/tsroj';
export const PYROJ_URL = 'https://pypi.org/project/pyroj/';

// Fonts shipped in extension/fonts. Families are registered in-process with
// Pango (>= 1.56), so nothing is written to the user's font directory.
export const BUNDLED_FONTS = [
    {family: 'Manrope', file: 'Manrope.ttf', script: 'latin'},
    {family: 'Vazirmatn', file: 'Vazirmatn.ttf', script: 'arabic'},
    {family: 'Estedad', file: 'Estedad.ttf', script: 'arabic'},
    {family: 'Sahel', file: 'Sahel.ttf', script: 'arabic'},
    {family: 'Sahel', file: 'Sahel-Bold.ttf', script: 'arabic'},
];

// Accent colour per calendar, used for day-card numbers, legends and chips.
export const CALENDAR_COLORS = {
    kurdish: '#F5CD0E',
    gregorian: '#3584E4',
    persian: '#2EC27E',
    islamic: '#9141AC',
};
