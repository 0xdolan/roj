// SPDX-License-Identifier: GPL-3.0-or-later
// roj: the Roj Kurdish calendar in a terminal. Same engine as the GNOME
// extension. Runs with `gjs -m roj.js` (preferred: reads your extension
// settings) or `node roj.js`.

import {CALENDARS, LOCALES, PRESETS, RojEngine, SECONDARY_CALENDARS, TOKENS, weekdayOf} from '../lib/engine.js';
import {EventIndex, parseEventsDocument} from '../lib/events.js';
import {buildIcs} from '../lib/icsExport.js';
import {localizedText} from '../lib/i18n.js';
import {SCHEMA_ID, VERSION} from '../lib/constants.js';

const IS_NODE = typeof globalThis.process?.versions?.node === 'string';

const HELP = `roj ${VERSION}: the Kurdish solar calendar in your terminal

Usage: roj [command] [arguments] [options]

Commands:
  today                    Today in all four calendars (default)
  cal [YYYY-MM]            A Kurdish month as a grid (default: this month)
  convert DATE             Convert DATE (YYYY-MM-DD) between calendars
  format PATTERN           Format a date with a strftime pattern
  events [DATE]            Events on a day (default: today)
  ics                      Your events as an .ics file for Google or Apple Calendar
  months                   The twelve Kurdish months of this year
  tokens                   Every pattern token with examples
  help                     Show this help

Options:
  -l, --locale LANG        Date language: ckb (Sorani), kmr (Kurmanji), en, fa or ar
      --secondary MODE     Other calendars: same (as --locale) or native
                           (Gregorian in English, Persian in Persian, Islamic in Arabic)
  -f, --from CALENDAR      Calendar of DATE: kurdish, gregorian, persian, islamic
                           (default: gregorian for convert, kurdish for cal)
  -t, --to CALENDAR        Output calendar (default: all for convert, kurdish for format)
  -d, --date DATE          Date to use with format and events (default: today)
      --with g,p,i         Small numbers in "cal": gregorian, persian, islamic
      --month              With "events": the whole month
      --file PATH          Extra JSON or .ics events file (repeatable)
      --era solar|nineveh  Kurdish year numbering
      --digits SET         native (each language's own), latin, arabic or persian
      --latin-digits       Same as --digits latin
      --leading-zero M     auto, on or off
      --no-ezafe           Turn off the Sorani ezafe (ی) for every calendar
      --month-variant N    Kurdish month name variant
      --weekday-variant N  Weekday name variant
      --islamic-offset N   Days added to the Islamic date (-3..3)
      --json               Machine-readable output
      --color, --no-color  Force or disable colours (default: on in a terminal)
      --no-config          Ignore the GNOME extension's settings
  -v, --version            Print the version

Examples:
  roj
  roj cal --with g
  roj convert 2026-06-26
  roj convert 2726-01-01 --from kurdish --to gregorian
  roj format "%A %d %B %Y" --locale kmr
  roj format "%d %B %Y" --date 1448-09-01 --from islamic
  roj events --month --file ~/holidays.ics
  roj ics --locale en > kurdish-events.ics
`;

// Platform layer (GJS or Node)
async function platform() {
    const here = import.meta.url.replace(/[^/]*$/, '');
    if (IS_NODE) {
        const fs = await import('node:fs');
        const os = await import('node:os');
        const path = await import('node:path');
        const url = await import('node:url');
        const crypto = await import('node:crypto');
        return {
            args: process.argv.slice(2),
            out: s => process.stdout.write(`${s}\n`),
            err: s => process.stderr.write(`${s}\n`),
            exit: code => process.exit(code),
            color: !!process.stdout.isTTY && !process.env.NO_COLOR,
            fromHere: rel => url.fileURLToPath(new URL(rel, here)),
            read: p => fs.readFileSync(p, 'utf8'),
            exists: p => fs.existsSync(p),
            home: os.homedir(),
            cacheDir: process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'),
            sha256: s => crypto.createHash('sha256').update(s).digest('hex'),
            settings: () => null,
            now: () => new Date(),
        };
    }
    const {default: GLib} = await import('gi://GLib');
    const {default: Gio} = await import('gi://Gio');
    const {default: System} = await import('system');
    const fromHere = rel => GLib.filename_from_uri(`${here}${rel}`)[0];
    return {
        args: System.programArgs ?? globalThis.ARGV ?? [],
        out: s => print(s),
        err: s => printerr(s),
        exit: code => System.exit(code),
        color: GLib.log_writer_supports_color(1) && !GLib.getenv('NO_COLOR'),
        fromHere,
        read: p => new TextDecoder().decode(GLib.file_get_contents(p)[1]),
        exists: p => GLib.file_test(p, GLib.FileTest.EXISTS),
        home: GLib.get_home_dir(),
        cacheDir: GLib.get_user_cache_dir(),
        sha256: s => GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, s, -1),
        // The extension's own settings, when its schema can be found.
        settings: () => {
            const dirs = [fromHere('../schemas')];
            for (const dir of dirs) {
                try {
                    const source = Gio.SettingsSchemaSource.new_from_directory(
                        dir, Gio.SettingsSchemaSource.get_default(), false);
                    const schema = source.lookup(SCHEMA_ID, true);
                    if (schema)
                        return new Gio.Settings({settings_schema: schema});
                } catch {
                    // not compiled here; try the system location below
                }
            }
            const schema = Gio.SettingsSchemaSource.get_default()?.lookup(SCHEMA_ID, true);
            return schema ? new Gio.Settings({settings_schema: schema}) : null;
        },
        now: () => new Date(),
    };
}

// Arguments
const ALIASES = {l: 'locale', f: 'from', t: 'to', d: 'date', v: 'version', h: 'help'};
const FLAGS = new Set(['json', 'month', 'no-ezafe', 'latin-digits', 'color', 'no-color', 'no-config', 'version', 'help']);
const CAL_ALIASES = {
    k: 'kurdish', ku: 'kurdish', kurdish: 'kurdish',
    g: 'gregorian', greg: 'gregorian', gregorian: 'gregorian',
    p: 'persian', fa: 'persian', jalali: 'persian', persian: 'persian',
    i: 'islamic', h: 'islamic', hijri: 'islamic', islamic: 'islamic',
};

class UsageError extends Error {}

function parseArgs(argv) {
    const opts = {_: [], file: []};
    for (let i = 0; i < argv.length; i++) {
        let arg = argv[i];
        if (!arg.startsWith('-') || arg === '-') {
            opts._.push(arg);
            continue;
        }
        let value = null;
        if (arg.includes('=')) {
            [arg, value] = [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)];
        }
        let name = arg.replace(/^--?/, '');
        name = ALIASES[name] ?? name;
        if (FLAGS.has(name)) {
            opts[name] = true;
            continue;
        }
        if (value === null) {
            value = argv[++i];
            if (value === undefined)
                throw new UsageError(`--${name} needs a value`);
        }
        if (name === 'file')
            opts.file.push(value);
        else
            opts[name] = value;
    }
    return opts;
}

function calendarArg(value, fallback) {
    if (value === undefined)
        return fallback;
    const cal = CAL_ALIASES[String(value).toLowerCase()];
    if (!cal)
        throw new UsageError(`Unknown calendar "${value}". Use kurdish, gregorian, persian or islamic.`);
    return cal;
}

function parseDate(text) {
    const m = /^\s*(\d{1,4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?\s*$/.exec(text ?? '');
    if (!m)
        throw new UsageError(`Invalid date "${text}". Use YYYY-MM-DD.`);
    return [+m[1], +m[2], m[3] === undefined ? null : +m[3]];
}

// Options from settings + flags
function engineOptions(settings, opts) {
    const o = {};
    if (settings) {
        const locale = settings.get_string('locale');
        const ui = settings.get_string('ui-language');
        Object.assign(o, {
            locale,
            uiLanguage: ui === 'auto' ? locale : ui,
            secondaryLanguage: settings.get_string('secondary-language'),
            digits: Object.fromEntries(LOCALES.map(l => [l, settings.get_string(`digits-${l}`)])),
            era: settings.get_string('era'),
            leadingZero: settings.get_string('leading-zero'),
            ezafe: Object.fromEntries(CALENDARS.map(c => [c, settings.get_boolean(`ezafe-${c}`)])),
            ezafeAfterDay: settings.get_boolean('ezafe-after-day'),
            ezafeOnMonth: settings.get_boolean('ezafe-on-month'),
            monthVariant: settings.get_int('month-variant'),
            weekdayVariant: settings.get_int('weekday-variant'),
            islamicOffset: settings.get_int('islamic-offset'),
            weekStart: settings.get_int('week-start'),
        });
    }
    if (opts.locale) {
        if (!LOCALES.includes(opts.locale))
            throw new UsageError(`--locale must be one of ${LOCALES.join(', ')}`);
        o.locale = opts.locale;
        o.uiLanguage = opts.locale;
    }
    if (opts.secondary) {
        if (!['same', 'native'].includes(opts.secondary))
            throw new UsageError('--secondary must be same or native');
        o.secondaryLanguage = opts.secondary;
    }
    if (opts.era)
        o.era = opts.era;
    const digits = opts['latin-digits'] ? 'latin' : opts.digits;
    if (digits) {
        if (!['native', 'latin', 'arabic', 'persian'].includes(digits))
            throw new UsageError('--digits must be native, latin, arabic or persian');
        o.digits = Object.fromEntries(LOCALES.map(l => [l, digits]));
    }
    if (opts['leading-zero'])
        o.leadingZero = opts['leading-zero'];
    if (opts['no-ezafe'])
        o.ezafe = Object.fromEntries(CALENDARS.map(c => [c, false]));
    for (const [flag, key] of [['month-variant', 'monthVariant'], ['weekday-variant', 'weekdayVariant'], ['islamic-offset', 'islamicOffset']]) {
        if (opts[flag] !== undefined) {
            const n = Number(opts[flag]);
            if (!Number.isInteger(n))
                throw new UsageError(`--${flag} must be a whole number`);
            o[key] = n;
        }
    }
    return o;
}

// Output helpers
const ANSI = {
    bold: '1', dim: '2', inverse: '7', red: '31', yellow: '33',
    kurdish: '33', gregorian: '34', persian: '32', islamic: '35',
};

function painter(enabled) {
    return (style, text) => (enabled ? `\x1b[${ANSI[style]}m${text}\x1b[0m` : text);
}

const LABELS = {kurdish: 'Kurdish', gregorian: 'Gregorian', persian: 'Persian', islamic: 'Islamic'};
const pad2 = n => String(n).padStart(2, '0');
const iso = ([y, m, d]) => `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
const FULL = '%A %d %B %Y';

// Commands
function cmdToday(ctx) {
    const {engine, opts, io, paint} = ctx;
    const jdn = ctx.dateJdn ?? engine.todayJdn(io.now());
    const result = {};
    for (const cal of CALENDARS)
        result[cal] = {date: iso(engine.dateIn(cal, jdn)), text: engine.format(jdn, cal, FULL)};
    if (opts.json)
        return io.out(JSON.stringify({jdn: Math.floor(jdn + 0.5), ...result}, null, 2));
    for (const cal of CALENDARS)
        io.out(`${paint(cal, LABELS[cal].padEnd(10))} ${result[cal].date}  ${result[cal].text}`);
}

function cmdConvert(ctx) {
    const {engine, opts, io, paint} = ctx;
    const from = calendarArg(opts.from, 'gregorian');
    const [y, m, d] = parseDate(opts._[1] ?? opts.date);
    if (d === null)
        throw new UsageError('convert needs a full date: YYYY-MM-DD');
    const jdn = engine.toJdn(from, y, m, d);
    const targets = opts.to && opts.to !== 'all' ? [calendarArg(opts.to)] : CALENDARS;
    if (opts.json) {
        const out = {from, input: iso([y, m, d]), jdn: Math.floor(jdn + 0.5)};
        for (const cal of targets)
            out[cal] = {date: iso(engine.dateIn(cal, jdn)), text: engine.format(jdn, cal, FULL)};
        return io.out(JSON.stringify(out, null, 2));
    }
    if (targets.length === 1)
        return io.out(iso(engine.dateIn(targets[0], jdn)));
    for (const cal of targets) {
        const mark = cal === from ? '•' : ' ';
        io.out(`${mark} ${paint(cal, LABELS[cal].padEnd(10))} ${iso(engine.dateIn(cal, jdn))}  ${engine.format(jdn, cal, FULL)}`);
    }
}

function cmdFormat(ctx) {
    const {engine, opts, io} = ctx;
    const pattern = opts._[1];
    if (!pattern)
        throw new UsageError('format needs a pattern, e.g. roj format "%d %B %Y"');
    const jdn = dateFromOpts(ctx);
    const cal = calendarArg(opts.to, 'kurdish');
    const text = engine.format(jdn, cal, pattern, io.now());
    io.out(opts.json ? JSON.stringify({calendar: cal, pattern, text}) : text);
}

function dateFromOpts(ctx) {
    const {engine, opts, io} = ctx;
    if (!opts.date)
        return engine.todayJdn(io.now());
    const [y, m, d] = parseDate(opts.date);
    if (d === null)
        throw new UsageError('--date needs a full date: YYYY-MM-DD');
    return engine.toJdn(calendarArg(opts.from, 'gregorian'), y, m, d);
}

function cmdCal(ctx) {
    const {engine, opts, io, paint} = ctx;
    const today = engine.todayJdn(io.now());
    let [year, month] = engine.dateIn('kurdish', today);
    if (opts._[1]) {
        const from = calendarArg(opts.from, 'kurdish');
        const [y, m, d] = parseDate(opts._[1]);
        [year, month] = engine.dateIn('kurdish', engine.toJdn(from, y, m, d ?? 1));
    }
    const subs = (opts.with ?? '').split(',').filter(Boolean).map(s => calendarArg(s))
        .filter(c => SECONDARY_CALENDARS.includes(c));
    const grid = engine.monthGrid(year, month);
    const weekend = new Set(ctx.settings ? ctx.settings.get_value('weekend-days').deepUnpack() : [5]);

    if (opts.json) {
        return io.out(JSON.stringify({
            year, month, name: engine.format(grid.first, 'kurdish', '%B'),
            weeks: grid.weeks.map(w => w.map(c => ({in_month: c.inMonth, ...Object.fromEntries(
                CALENDARS.map(cal => [cal, iso(c.dates[cal])]))}))),
        }, null, 2));
    }

    const cellWidth = 3 + subs.length * 3;
    const title = engine.format(grid.first, 'kurdish', '%B %Y');
    const spans = subs.map(cal => paint(cal, monthSpan(engine, cal, grid)));
    io.out(paint('bold', title) + (spans.length ? `   ${spans.join('  ')}` : ''));
    io.out(engine.weekdayNames('%a').map(({name, jsDay}) => {
        const cell = name.slice(0, cellWidth - 1).padStart(cellWidth);
        return weekend.has(jsDay) ? paint('red', cell) : paint('dim', cell);
    }).join(''));
    for (const week of grid.weeks) {
        if (!week.some(c => c.inMonth))
            continue;
        io.out(week.map(cell => {
            if (!cell.inMonth)
                return ' '.repeat(cellWidth);
            let main = engine.number(cell.dates.kurdish[2]).padStart(3);
            if (cell.jdn === today)
                main = paint('inverse', main);
            else if (weekend.has(weekdayOf(cell.jdn)))
                main = paint('red', main);
            const small = subs.map(cal => paint(cal, engine.number(cell.dates[cal][2]).padStart(3))).join('');
            return main + small;
        }).join(''));
    }
}

function monthSpan(engine, cal, grid) {
    const last = grid.first + grid.length - 1;
    const [y1, m1] = engine.dateIn(cal, grid.first);
    const [y2, m2] = engine.dateIn(cal, last);
    if (y1 === y2 && m1 === m2)
        return engine.format(grid.first, cal, '%b %Y');
    return `${engine.format(grid.first, cal, y1 === y2 ? '%b' : '%b %Y')} · ${engine.format(last, cal, '%b %Y')}`;
}

/** The enabled event sources, as `{id, name, events}`. */
function loadSources(ctx) {
    const {io, settings, opts} = ctx;
    const sources = [];
    const add = (id, name, path) => {
        try {
            const doc = parseEventsDocument(io.read(path), path);
            sources.push({id, name: name ?? localizedText(doc.name, ctx.engine.locale) ?? id, events: doc.events});
        } catch (e) {
            io.err(`roj: skipping ${path}: ${e.message}`);
        }
    };
    let configured = [{id: 'kurdish', kind: 'builtin', enabled: true}];
    if (settings) {
        try {
            configured = JSON.parse(settings.get_string('event-sources'));
        } catch {
            // keep the default
        }
    }
    for (const s of configured) {
        if (s.enabled === false)
            continue;
        if (s.kind === 'builtin')
            add('kurdish', null, io.fromHere('../data/events/kurdish.json'));
        else if (s.kind === 'file' && io.exists(s.location))
            add(s.id, s.name ?? null, s.location);
        else if (s.kind === 'url') {
            // Online calendars are read from the extension's offline cache.
            const cached = `${io.cacheDir}/roj/feeds/${io.sha256(s.location)}.ics`;
            if (io.exists(cached))
                add(s.id, s.name ?? null, cached);
        }
    }
    opts.file.forEach((path, i) => add(`file${i}`, null, path.replace(/^~(?=\/)/, io.home)));
    return sources;
}

function loadEvents(ctx) {
    const index = new EventIndex(ctx.engine);
    index.setSources(loadSources(ctx));
    return index;
}

function cmdEvents(ctx) {
    const {engine, opts, io, paint} = ctx;
    if (opts._[1] && !opts.date)
        opts.date = opts._[1];
    const jdn = dateFromOpts(ctx);
    const index = loadEvents(ctx);
    let days = [jdn];
    if (opts.month) {
        const [y, m] = engine.dateIn('kurdish', jdn);
        const first = engine.toJdn('kurdish', y, m, 1);
        days = Array.from({length: engine.monthLength('kurdish', y, m)}, (_, i) => first + i);
    }
    const rows = [];
    for (const day of days) {
        for (const ev of index.eventsOn(day)) {
            rows.push({
                date: iso(engine.dateIn('kurdish', day)),
                gregorian: iso(engine.dateIn('gregorian', day)),
                day: engine.format(day, 'kurdish', '%d %B'),
                title: localizedText(ev.title, engine.locale),
                holiday: ev.holiday,
                time: ev.time,
                source: ev.sourceName,
            });
        }
    }
    if (opts.json)
        return io.out(JSON.stringify(rows, null, 2));
    if (!rows.length)
        return io.out(paint('dim', opts.month ? 'No events this month.' : 'No events on this day.'));
    for (const r of rows) {
        const flag = r.holiday ? paint('red', ' ●') : '  ';
        io.out(`${paint('kurdish', r.day.padEnd(14))} ${paint('dim', r.gregorian)}${flag} ${r.time ? `${r.time} ` : ''}${r.title}`);
    }
}

function cmdIcs(ctx) {
    const {engine, io} = ctx;
    const events = loadSources(ctx).flatMap(s => s.events);
    const year = engine.dateIn('gregorian', engine.todayJdn())[0];
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    io.out(buildIcs(events, {
        engine, lang: engine.locale, name: 'Roj',
        fromYear: year - 1, toYear: year + 30, stamp,
    }));
}

function cmdMonths(ctx) {
    const {engine, io, paint, opts} = ctx;
    const [year] = engine.dateIn('kurdish', engine.todayJdn(io.now()));
    const ckb = new RojEngine({...engine.options, locale: 'ckb'});
    const kmr = new RojEngine({...engine.options, locale: 'kmr'});
    const months = [];
    for (let m = 1; m <= 12; m++) {
        const first = engine.toJdn('kurdish', year, m, 1);
        months.push({
            month: m,
            ckb: ckb.format(first, 'kurdish', '%B'),
            kmr: kmr.format(first, 'kurdish', '%B'),
            days: engine.monthLength('kurdish', year, m),
            starts: iso(engine.dateIn('gregorian', first)),
        });
    }
    if (opts.json)
        return io.out(JSON.stringify({year, months}, null, 2));
    io.out(paint('bold', `Kurdish year ${year}`));
    for (const m of months)
        io.out(`${String(m.month).padStart(2)}  ${m.kmr.padEnd(12)} ${m.ckb.padEnd(12)} ${m.days} days  ${paint('dim', `from ${m.starts}`)}`);
}

function cmdTokens(ctx) {
    const {engine, io, paint, opts} = ctx;
    const jdn = engine.todayJdn(io.now());
    const now = io.now();
    if (opts.json) {
        return io.out(JSON.stringify(TOKENS.map(t => ({
            ...t, examples: Object.fromEntries(CALENDARS.map(c => [c, engine.format(jdn, c, t.token, now)])),
        })), null, 2));
    }
    for (const t of TOKENS) {
        const example = engine.format(jdn, 'kurdish', t.token, now);
        io.out(`${paint('bold', t.token.padEnd(4))} ${t.desc.padEnd(58)} ${paint('kurdish', example)}`);
    }
    io.out('');
    io.out(paint('bold', 'Presets'));
    for (const p of PRESETS)
        io.out(`  ${p.pattern.padEnd(20)} ${engine.format(jdn, 'kurdish', p.pattern, now)}`);
}

const COMMANDS = {
    today: cmdToday, convert: cmdConvert, format: cmdFormat, cal: cmdCal,
    events: cmdEvents, ics: cmdIcs, months: cmdMonths, tokens: cmdTokens,
};

async function main() {
    const io = await platform();
    let opts;
    try {
        opts = parseArgs(io.args);
        if (opts.version)
            return io.out(`roj ${VERSION}`);
        const command = opts._[0] ?? 'today';
        if (opts.help || command === 'help')
            return io.out(HELP);
        if (!COMMANDS[command])
            throw new UsageError(`Unknown command "${command}". Run "roj help".`);

        const settings = opts['no-config'] ? null : io.settings();
        const engine = new RojEngine(engineOptions(settings, opts));
        const ctx = {io, opts, settings, engine, paint: painter(opts.color || (io.color && !opts['no-color']))};
        COMMANDS[command](ctx);
    } catch (e) {
        io.err(e instanceof UsageError ? `roj: ${e.message}` : `roj: ${e.message ?? e}`);
        io.exit(e instanceof UsageError ? 2 : 1);
    }
}

main();
