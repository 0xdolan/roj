#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Build the files the website's calendar needs, from the extension:
//   docs/calendar/kurdish-events-LANG.ics  the Kurdish events for Google
//                                          Calendar, Apple Calendar and Outlook
//   docs/calendar/engine/                  a copy of the GNOME-free engine,
//                                          translations and events, which the
//                                          live calendar page runs in the browser
// GitHub Pages serves docs/ only, so these are copies, not links. `--check`
// fails when any of them is out of date, so CI catches a forgotten rebuild.
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

import {RojEngine} from '../extension/lib/engine.js';
import {parseEventsJson} from '../extension/lib/events.js';
import {buildIcs} from '../extension/lib/icsExport.js';
import {localizedText} from '../extension/lib/i18n.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'calendar');
const LANGS = ['ckb', 'kmr', 'en'];
// Fixed, so the output only changes when the events do.
const FROM_YEAR = 2020;
const TO_YEAR = 2060;
const STAMP = '20260101T000000Z';
const EID_NOTE = 'Eid dates follow the arithmetic Hijri calendar and can differ by a day or two from the sighting of the moon.';
// Everything the page imports, at the same paths as in extension/.
const ENGINE_FILES = [
    'lib/engine.js', 'lib/tsroj.js', 'lib/events.js', 'lib/ics.js', 'lib/i18n.js', 'lib/constants.js',
    'locale/ckb.js', 'locale/kmr.js', 'locale/fa.js', 'locale/ar.js',
    'data/events/kurdish.json',
];

const check = process.argv.includes('--check');
let stale = 0;

function write(path, text) {
    let current = null;
    try {
        current = readFileSync(path, 'utf8');
    } catch {}
    if (current === text)
        return;
    if (check) {
        console.error(`${relative(ROOT, path)} is out of date: run "make web"`);
        stale++;
        return;
    }
    mkdirSync(dirname(path), {recursive: true});
    writeFileSync(path, text);
    console.log(`wrote ${relative(ROOT, path)}`);
}

const {name, events} = parseEventsJson(readFileSync(join(ROOT, 'extension/data/events/kurdish.json'), 'utf8'));
const engine = new RojEngine();
for (const lang of LANGS) {
    const title = localizedText(name, lang);
    write(join(OUT, `kurdish-events-${lang}.ics`), `${buildIcs(events, {
        engine, lang, name: title, description: `${title} from Roj, https://0xdolan.github.io/roj/. ${EID_NOTE}`,
        fromYear: FROM_YEAR, toYear: TO_YEAR, stamp: STAMP,
    })}\r\n`);
}
for (const file of ENGINE_FILES)
    write(join(OUT, 'engine', file), readFileSync(join(ROOT, 'extension', file), 'utf8'));
process.exit(stale ? 1 : 0);
