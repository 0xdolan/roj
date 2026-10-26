// Computes every date, name and event shown in the marketing images from the
// real engine, so the pictures never drift from what the extension shows.
// Usage: node scripts/marketing/data.mjs > build/marketing/data.js
import {readFileSync} from 'node:fs';
import {RojEngine} from '../../extension/lib/engine.js';
import {EventIndex, parseEventsJson} from '../../extension/lib/events.js';
import {localizedText} from '../../extension/lib/i18n.js';

const ckb = new RojEngine({locale: 'ckb'});
const kmr = new RojEngine({locale: 'kmr'});
const today = ckb.toJdn('gregorian', 2026, 10, 25);
const iso = ([y, m, d]) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

const week = [];
for (let i = -1; i < 6; i++) {
    const jdn = today + i;
    week.push({
        main: ckb.number(ckb.dateIn('kurdish', jdn)[2]),
        mainKmr: String(kmr.dateIn('kurdish', jdn)[2]),
        g: ckb.number(ckb.dateIn('gregorian', jdn)[2]),
        p: ckb.number(ckb.dateIn('persian', jdn)[2]),
        i: ckb.number(ckb.dateIn('islamic', jdn)[2]),
        gK: String(kmr.dateIn('gregorian', jdn)[2]),
        pK: String(kmr.dateIn('persian', jdn)[2]),
        iK: String(kmr.dateIn('islamic', jdn)[2]),
        today: jdn === today,
        weekday: ckb.format(jdn, 'kurdish', '%a'),
    });
}

const doc = parseEventsJson(readFileSync(new URL('../../extension/data/events/kurdish.json', import.meta.url), 'utf8'));
const index = new EventIndex(ckb);
index.setSources([{id: 'kurdish', name: 'Kurdish', events: doc.events}]);
const events = [];
for (let jdn = ckb.toJdn('gregorian', 2027, 3, 1); jdn <= ckb.toJdn('gregorian', 2027, 3, 21); jdn++) {
    for (const ev of index.eventsOn(jdn)) {
        events.push({
            ckbDay: ckb.format(jdn, 'kurdish', '%d %B'),
            kmrDay: kmr.format(jdn, 'kurdish', '%d %B'),
            ckb: localizedText(ev.title, 'ckb'),
            kmr: localizedText(ev.title, 'kmr'),
            holiday: ev.holiday,
        });
    }
}

const languages = ['ckb', 'kmr', 'en', 'fa', 'ar'].map(locale =>
    ({locale, text: new RojEngine({locale}).format(today, 'kurdish', '%A %d %B %Y'), rtl: ['ckb', 'fa', 'ar'].includes(locale)}));

const data = {
    languages,
    today: {
        ckb: ckb.format(today, 'kurdish', '%A %d %B %Y'),
        ckbShort: ckb.format(today, 'kurdish', '%d %B %Y'),
        kmr: kmr.format(today, 'kurdish', '%A %d %B %Y'),
        kmrShort: kmr.format(today, 'kurdish', '%d %B %Y'),
        noEzafe: new RojEngine({locale: 'ckb', ezafe: false}).format(today, 'kurdish', '%d %B %Y'),
        gregorian: ckb.format(today, 'gregorian', '%A %d %B %Y'),
        persian: ckb.format(today, 'persian', '%d %B %Y'),
        islamic: ckb.format(today, 'islamic', '%d %B %Y'),
        iso: Object.fromEntries(['kurdish', 'gregorian', 'persian', 'islamic'].map(c => [c, iso(ckb.dateIn(c, today))])),
    },
    week,
    events,
    patterns: ['%A %d %B %Y', '%d %B', '%Y/%m/%d', '%a %d %b · %H:%M'].map(p => ({
        pattern: p,
        ckb: ckb.format(today, 'kurdish', p, {hour: 9, minute: 41}),
        kmr: kmr.format(today, 'kurdish', p, {hour: 9, minute: 41}),
    })),
};
process.stdout.write(`window.ROJ = ${JSON.stringify(data, null, 1)};\n`);
