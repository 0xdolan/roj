// Run with: node --test tests/
// The browser extension and web app: settings, backups, sources and fonts.
// browser/app imports ../lib/, which only exists in a build, so these run on
// the web app copy in docs/app (make test checks it matches browser/).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {SCHEMA} from '../docs/app/app/defaults.js';
import {
    DEFAULTS, customFonts, engineOptions, eventSources, exportSettings, importSettings, validValue, withDefaults,
} from '../docs/app/app/settings.js';
import {feedUrl, validFeedUrl} from '../docs/app/app/sources.js';
import {fontFamilyName} from '../docs/app/app/look.js';
import {RojEngine} from '../extension/lib/engine.js';

const schemaXml = readFileSync(new URL('../extension/schemas/org.gnome.shell.extensions.roj.gschema.xml', import.meta.url), 'utf8');

test('the browser schema has every GSettings key', () => {
    const keys = [...schemaXml.matchAll(/<key name="([^"]+)"/g)].map(m => m[1]).sort();
    assert.deepEqual(Object.keys(SCHEMA).sort(), keys);
    assert.equal(DEFAULTS.locale, 'ckb');
    assert.deepEqual(DEFAULTS['weekend-days'], [5]);
    assert.equal(DEFAULTS['ics-refresh-hours'] >= 1, true);
});

test('values are checked against types, choices and ranges', () => {
    assert.equal(validValue('locale', 'kmr'), true);
    assert.equal(validValue('locale', 'de'), false);
    assert.equal(validValue('islamic-offset', 3), true);
    assert.equal(validValue('islamic-offset', 4), false);
    assert.equal(validValue('islamic-offset', 1.5), false);
    assert.equal(validValue('font-scale', 1.25), true);
    assert.equal(validValue('font-scale', 2), false);
    assert.equal(validValue('weekend-days', [4, 5]), true);
    assert.equal(validValue('weekend-days', ['5']), false);
    assert.equal(validValue('show-footer', 'yes'), false);
    assert.equal(validValue('no-such-key', true), false);
});

test('saved values fall back to defaults when invalid', () => {
    const s = withDefaults({locale: 'kmr', 'week-start': 99, unknown: 1});
    assert.equal(s.locale, 'kmr');
    assert.equal(s['week-start'], DEFAULTS['week-start']);
    assert.equal('unknown' in s, false);
});

test('engine options follow the settings, as on GNOME', () => {
    const s = withDefaults({locale: 'kmr', 'digits-kmr': 'arabic', era: 'nineveh'});
    const engine = new RojEngine(engineOptions(s));
    const jdn = engine.toJdn('gregorian', 2026, 6, 26);
    assert.equal(engine.dateIn('kurdish', jdn)[0], 1405 + 1233);
    assert.match(engine.format(jdn, 'kurdish', '%Y'), /^[٠-٩]+$/);
});

test('a backup round-trips and reads a GNOME backup', () => {
    const s = withDefaults({locale: 'en', 'weekend-days': [4, 5], 'font-scale': 1.2});
    const text = exportSettings(s);
    const data = JSON.parse(text);
    assert.equal(data.application, 'roj');
    assert.equal(data.uuid, 'roj@0xdolan.github.io');
    assert.equal('prefs-page' in data.settings, false);
    const {values, skipped} = importSettings(DEFAULTS, text);
    assert.deepEqual(skipped, []);
    assert.equal(values.locale, 'en');
    assert.deepEqual(values['weekend-days'], [4, 5]);

    const gnome = JSON.stringify({application: 'roj', version: '0.2.2', settings: {
        'locale': 'kmr', 'prefs-page': 'events', 'panel-position': 'left', 'islamic-offset': 9,
    }});
    const r = importSettings(DEFAULTS, gnome);
    assert.equal(r.values.locale, 'kmr');
    assert.equal(r.values['panel-position'], 'left');
    assert.deepEqual(r.skipped.sort(), ['islamic-offset', 'prefs-page']);
    assert.throws(() => importSettings(DEFAULTS, '{"settings": {}}'), /not a Roj settings backup/);
});

test('event sources always include the Kurdish events', () => {
    assert.deepEqual(eventSources(withDefaults({})).map(s => s.kind), ['builtin']);
    const s = withDefaults({'event-sources': JSON.stringify([{id: 'a', kind: 'url', location: 'https://x.org/a.ics'}, {id: 'b', kind: 'bad'}])});
    assert.deepEqual(eventSources(s).map(x => x.id), ['kurdish', 'a']);
    assert.deepEqual(eventSources(withDefaults({'event-sources': 'not json'})).map(x => x.kind), ['builtin']);
});

test('fonts loaded on GNOME (with a path) are not offered in the browser', () => {
    const s = withDefaults({'custom-fonts': JSON.stringify([{family: 'A', id: 'x1'}, {family: 'B', path: '/home/u/b.ttf'}])});
    assert.deepEqual(customFonts(s), [{family: 'A', id: 'x1'}]);
});

test('online calendar addresses', () => {
    assert.equal(validFeedUrl('https://calendar.google.com/calendar/ical/x/basic.ics'), true);
    assert.equal(validFeedUrl('webcal://example.org/cal.ics'), true);
    assert.equal(validFeedUrl('ftp://example.org/cal.ics'), false);
    assert.equal(validFeedUrl('https://localhost'), false);
    assert.equal(feedUrl('webcal://example.org/cal.ics'), 'https://example.org/cal.ics');
});

test('reads the family name of the included fonts', () => {
    for (const [file, family] of [['Manrope.ttf', 'Manrope'], ['Vazirmatn.ttf', 'Vazirmatn'], ['Sahel-Bold.ttf', 'Sahel']]) {
        const bytes = readFileSync(new URL(`../extension/fonts/${file}`, import.meta.url));
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        assert.equal(fontFamilyName(view), family);
    }
    assert.equal(fontFamilyName(new DataView(new ArrayBuffer(16))), null);
});
