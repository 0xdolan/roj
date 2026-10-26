#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Write the bundled Kurdish events as .ics files for Google Calendar, Apple
// Calendar and Outlook: docs/calendar/kurdish-events-LANG.ics, served by
// GitHub Pages. `--check` fails when the files are out of date with
// extension/data/events/kurdish.json, so CI catches a forgotten rebuild.
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
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

const check = process.argv.includes('--check');
const {name, events} = parseEventsJson(readFileSync(join(ROOT, 'extension/data/events/kurdish.json'), 'utf8'));
const engine = new RojEngine();
let stale = 0;
mkdirSync(OUT, {recursive: true});
for (const lang of LANGS) {
    const title = localizedText(name, lang);
    const text = `${buildIcs(events, {
        engine, lang, name: title, description: `${title} from Roj, https://0xdolan.github.io/roj/. ${EID_NOTE}`,
        fromYear: FROM_YEAR, toYear: TO_YEAR, stamp: STAMP,
    })}\r\n`;
    const path = join(OUT, `kurdish-events-${lang}.ics`);
    let current = null;
    try {
        current = readFileSync(path, 'utf8');
    } catch {}
    if (current === text)
        continue;
    if (check) {
        console.error(`${path} is out of date: run "make ics"`);
        stale++;
    } else {
        writeFileSync(path, text);
        console.log(`wrote ${path}`);
    }
}
process.exit(stale ? 1 : 0);
