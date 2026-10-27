// Run with: node --test tests/
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {RojEngine, pinClock, tokenize, weekdayOf} from '../extension/lib/engine.js';
import {EventIndex, parseEventsDocument, parseEventsJson} from '../extension/lib/events.js';
import {parseIcs} from '../extension/lib/ics.js';
import {buildIcs} from '../extension/lib/icsExport.js';
import {fontMarkup, scriptRuns} from '../extension/lib/richtext.js';

const ckb = new RojEngine({locale: 'ckb'});
const kmr = new RojEngine({locale: 'kmr'});
const jdn = ckb.toJdn('gregorian', 2026, 6, 26); // tsroj README example

test('converts between all four calendars', () => {
    assert.deepEqual(ckb.allDates(jdn), {
        kurdish: [2726, 4, 5],
        gregorian: [2026, 6, 26],
        persian: [1405, 4, 5],
        islamic: [1448, 1, 10],
    });
    for (const cal of ['kurdish', 'persian', 'islamic'])
        assert.equal(ckb.toJdn(cal, ...ckb.dateIn(cal, jdn)), jdn);
});

test('Newroz is 1 Xakelêwe (21 March 2026)', () => {
    assert.deepEqual(ckb.dateIn('kurdish', ckb.toJdn('gregorian', 2026, 3, 21)), [2726, 1, 1]);
});

test('Fall of Nineveh era shifts only the year', () => {
    const e = new RojEngine({era: 'nineveh'});
    assert.deepEqual(e.dateIn('kurdish', jdn), [2638, 4, 5]);
});

test('Sorani ezafe follows the pattern and the toggles', () => {
    assert.equal(ckb.format(jdn, 'kurdish', '%d %B %Y'), '٥ی پووشپەڕی ٢٧٢٦');
    assert.equal(ckb.format(jdn, 'kurdish', '%d %B'), '٥ی پووشپەڕ');
    const off = new RojEngine({locale: 'ckb', ezafe: {kurdish: false}});
    assert.equal(off.format(jdn, 'kurdish', '%d %B %Y'), '٥ پووشپەڕ ٢٧٢٦');
    const latin = new RojEngine({locale: 'ckb', digits: {ckb: 'latin'}, ezafeOnMonth: false});
    assert.equal(latin.format(jdn, 'kurdish', '%d %B %Y'), '5ی پووشپەڕ 2726');
});

test('Kurmanji formatting and leading zeros', () => {
    assert.equal(kmr.format(jdn, 'kurdish', '%A %d %B %Y'), 'În 05 Tîrmeh 2726');
    assert.equal(new RojEngine({locale: 'kmr', monthVariant: 1}).format(jdn, 'kurdish', '%B'), 'Pûşper');
    assert.equal(kmr.format(jdn, 'kurdish', '%-d/%-m'), '5/4');
    assert.equal(new RojEngine({locale: 'kmr', leadingZero: 'off'}).format(jdn, 'kurdish', '%d'), '5');
});

test('time tokens use the locale AM/PM labels and always pad minutes', () => {
    const t = {hour: 21, minute: 5, second: 9};
    assert.equal(kmr.format(jdn, 'kurdish', '%I:%M:%S %p', t), '09:05:09 piştî niweroj');
    assert.equal(ckb.format(jdn, 'kurdish', '%H:%M %p', t), '٢١:٠٥ د.ن');
    assert.equal(kmr.format(jdn, 'kurdish', '100%% %d', t), '100% 05');
});

test('Islamic offset shifts the Hijri date but not the weekday', () => {
    const e = new RojEngine({locale: 'kmr', islamicOffset: 1});
    assert.deepEqual(e.dateIn('islamic', jdn), [1448, 1, 11]);
    assert.equal(e.format(jdn, 'islamic', '%A %-d'), `${kmr.format(jdn, 'islamic', '%A')} ١١`);
    assert.equal(e.toJdn('islamic', 1448, 1, 11), jdn);
});

test('month grid has six weeks starting on Saturday', () => {
    const grid = ckb.monthGrid(2726, 8);
    assert.equal(grid.weeks.length, 6);
    assert.equal(grid.length, 30);
    assert.ok(grid.weeks.every(w => w[0].weekday === 6));
    assert.equal(grid.weeks.flat().filter(c => c.inMonth).length, 30);
    assert.equal(weekdayOf(ckb.toJdn('gregorian', 2026, 10, 25)), 0); // a Sunday
    assert.equal(ckb.monthLength('kurdish', 2726, 1), 31);
    assert.equal(ckb.monthLength('kurdish', 2726, 7), 30);
});

test('invalid patterns are reported, not thrown, by tryFormat', () => {
    const r = ckb.tryFormat(jdn, 'kurdish', '{%Y}');
    assert.equal(r.ok, false);
    assert.match(r.error, /\{/);
});

test('tokenize prefers the longest token', () => {
    assert.deepEqual(tokenize('%-d.%d').map(p => p.value), ['%-d', '.', '%d']);
});

test('ICS: all-day, multi-day, timed and yearly events', () => {
    const ics = [
        'BEGIN:VCALENDAR', 'X-WR-CALNAME:Test\\, cal',
        'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20260101', 'DTEND;VALUE=DATE:20260103',
        'SUMMARY:Two days', 'END:VEVENT',
        'BEGIN:VEVENT', 'DTSTART:20260315T093000', 'SUMMARY:Meet', 'END:VEVENT',
        'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20200516', 'RRULE:FREQ=YEARLY',
        'SUMMARY:Long sum', ' mary', 'END:VEVENT',
        'END:VCALENDAR',
    ].join('\r\n');
    const {name, events} = parseIcs(ics);
    assert.equal(name, 'Test, cal');
    assert.equal(events.length, 4);
    assert.deepEqual(events.slice(0, 2).map(e => [e.month, e.day, e.year]), [[1, 1, 2026], [1, 2, 2026]]);
    assert.equal(events[2].time, '09:30');
    assert.equal(events[3].title, 'Long summary');
    assert.equal(events[3].year, undefined);
});

test('bundled events file is valid and indexes across calendars', () => {
    const text = readFileSync(new URL('../extension/data/events/kurdish.json', import.meta.url), 'utf8');
    const doc = parseEventsJson(text);
    assert.deepEqual(doc.rejected, []);
    const index = new EventIndex(ckb);
    index.setSources([{id: 'kurdish', name: 'Kurdish', events: doc.events}]);
    const newroz = index.eventsOn(ckb.toJdn('kurdish', 2726, 1, 1));
    assert.equal(newroz[0].title.kmr, 'Newroz, Sersala Kurdî');
    assert.ok(newroz[0].holiday);
    assert.equal(index.eventsOn(ckb.toJdn('gregorian', 2031, 5, 15)).length, 1);
    const ids = doc.events.map(ev => ev.id);
    assert.ok(ids.every(Boolean));
    assert.equal(new Set(ids).size, ids.length);
    for (const ev of doc.events)
        assert.ok(ev.title.ckb && ev.title.kmr && ev.title.en, ev.id);
});

test('ICS export round-trips through the ICS reader', () => {
    const {events} = parseEventsJson(JSON.stringify([
        {id: 'halabja', calendar: 'gregorian', month: 3, day: 16, since: 1988,
            title: {en: 'Halabja; remembrance, day'}, description: {en: 'Line one\nLine two', ckb: 'هەڵەبجە'}},
        {id: 'newroz', calendar: 'kurdish', month: 1, day: 1, holiday: true, title: {en: 'Newroz'}},
        {id: 'eid', calendar: 'islamic', month: 10, day: 1, title: {en: 'Eid'}},
        {calendar: 'gregorian', year: 2027, month: 2, day: 3, time: '19:30', title: 'Dinner'},
        {id: 'long', calendar: 'gregorian', month: 7, day: 1, title: {en: 'x'}, description: {en: 'کوردستان '.repeat(40)}},
    ]));
    const text = buildIcs(events, {engine: ckb, lang: 'en', name: 'Test', fromYear: 2026, toYear: 2027, stamp: '20260101T000000Z'});
    assert.ok(text.split('\r\n').every(line => new TextEncoder().encode(line).length <= 75));
    assert.match(text, /DTSTART;VALUE=DATE:19880316\r\nDTEND;VALUE=DATE:19880317\r\nRRULE:FREQ=YEARLY/);
    const {name, events: back} = parseIcs(text);
    assert.equal(name, 'Test');
    const halabja = back.find(e => e.month === 3 && e.day === 16);
    assert.equal(halabja.title, 'Halabja; remembrance, day');
    assert.equal(halabja.description, 'Line one\nLine two');
    assert.equal(halabja.year, undefined);
    // Kurdish and Islamic events are written out per year, on the right day.
    const newroz = back.filter(e => e.title === 'Newroz');
    assert.deepEqual(newroz.map(e => [e.year, e.month, e.day]), [[2026, 3, 21], [2027, 3, 21]]);
    assert.ok(newroz.every(e => e.holiday));
    for (const e of back.filter(e => e.title === 'Eid'))
        assert.deepEqual(ckb.dateIn('islamic', ckb.toJdn('gregorian', e.year, e.month, e.day)).slice(1), [10, 1]);
    const dinner = back.find(e => e.title === 'Dinner');
    assert.deepEqual([dinner.year, dinner.month, dinner.day, dinner.time], [2027, 2, 3, '19:30']);
    assert.equal(back.find(e => e.month === 7).description, 'کوردستان '.repeat(40));
});

test('one-off events and format sniffing', () => {
    const doc = parseEventsDocument('[{"calendar":"kurdish","year":2726,"month":8,"day":3,"title":"x"}]', 'a.json');
    const index = new EventIndex(ckb);
    index.setSources([{id: 'u', name: 'U', events: doc.events}]);
    assert.equal(index.eventsOn(ckb.toJdn('gregorian', 2026, 10, 25)).length, 1);
    assert.equal(index.eventsOn(ckb.toJdn('gregorian', 2027, 10, 25)).length, 0);
});

test('script runs split Latin and Arabic text and keep ZWNJ in place', () => {
    const runs = scriptRuns('٣ی خاکه‌لێوه 2726 Newroz');
    assert.deepEqual(runs.map(r => r.rtl), [true, false]);
    assert.ok(runs[0].text.includes('‌'));
    assert.equal(
        fontMarkup('a<b', {latin: 'Manrope', arabic: 'Vazirmatn'}),
        '<span font_family="Manrope">a&lt;b</span>');
});

test('each calendar uses the digits of its own language', () => {
    assert.equal(ckb.format(jdn, 'kurdish', '%Y'), '٢٧٢٦');
    assert.equal(kmr.format(jdn, 'kurdish', '%Y'), '2726');
    for (const e of [ckb, kmr]) {
        assert.equal(e.format(jdn, 'gregorian', '%Y'), '2026');
        assert.equal(e.format(jdn, 'persian', '%Y'), '۱۴۰۵');
        assert.equal(e.format(jdn, 'islamic', '%Y'), '١٤٤٨');
        assert.equal(e.number(26, 'persian'), '۲۶');
    }
    // Automatic leading zeros are for Western digits only.
    assert.equal(kmr.format(jdn, 'kurdish', '%d'), '05');
    assert.equal(kmr.format(jdn, 'persian', '%d'), '۵');
    assert.equal(kmr.format(jdn, 'gregorian', '%d %m'), '26 06');
    const custom = new RojEngine({locale: 'ckb', digits: {fa: 'latin', en: 'arabic'}});
    assert.equal(custom.format(jdn, 'persian', '%Y'), '1405');
    assert.equal(custom.format(jdn, 'gregorian', '%Y'), '٢٠٢٦');
});

test('ezafe is on for the Kurdish date only, by default', () => {
    assert.equal(ckb.format(jdn, 'gregorian', '%d %B %Y'), '26 یونیۆ 2026');
    assert.equal(ckb.format(jdn, 'islamic', '%d %B %Y'), '١٠ محرم ١٤٤٨');
    const all = new RojEngine({locale: 'ckb', ezafe: {gregorian: true}});
    assert.equal(all.format(jdn, 'gregorian', '%d %B %Y'), '26ی یونیۆی 2026');
});

test('Persian and Arabic dates use their own digits and the right weekday', () => {
    const saturday = ckb.toJdn('gregorian', 2026, 10, 24);
    const fa = new RojEngine({locale: 'fa'});
    const ar = new RojEngine({locale: 'ar'});
    assert.equal(fa.format(saturday, 'persian', '%A %d %B %Y'), 'شنبه ۲ آبان ۱۴۰۵');
    assert.equal(ar.format(saturday, 'islamic', '%A %d %B %Y'), 'السبت ١٢ جمادى الأولى ١٤٤٨');
    assert.equal(fa.format(saturday, 'kurdish', '%A %d %B'), 'شنبه ۲ گەڵاڕێزان');
});

test('secondary calendars can each use their own language', () => {
    const native = new RojEngine({locale: 'ckb', secondaryLanguage: 'native'});
    assert.equal(native.format(jdn, 'gregorian', '%A %d %B %Y'), 'Friday 26 June 2026');
    assert.equal(native.format(jdn, 'persian', '%d %B %Y'), '۵ تیر ۱۴۰۵');
    assert.equal(native.number(26, 'gregorian'), '26');
    assert.equal(native.number(26, 'kurdish'), '٢٦');
    const iface = new RojEngine({locale: 'ckb', uiLanguage: 'en', secondaryLanguage: 'interface'});
    assert.equal(iface.localeFor('islamic'), 'en');
});

test('digits can be chosen per language', () => {
    const e = new RojEngine({locale: 'fa', digits: {fa: 'arabic'}});
    assert.equal(e.number(2026), '٢٠٢٦');
    assert.equal(new RojEngine({locale: 'en', digits: {en: 'persian'}}).number(15), '۱۵');
});

test('pinClock moves today and the time, and ignores anything else', () => {
    const real = RojEngine.clock;
    try {
        assert.equal(pinClock(''), false);
        assert.equal(pinClock('17 December'), false);
        assert.equal(RojEngine.clock, real);
        assert.equal(pinClock('2026-12-17 10:30'), true);
        assert.deepEqual(ckb.dateIn('gregorian', ckb.todayJdn()), [2026, 12, 17]);
        assert.equal(kmr.format(ckb.todayJdn(), 'kurdish', '%H:%M'), '10:30');
    } finally {
        RojEngine.clock = real;
    }
});
