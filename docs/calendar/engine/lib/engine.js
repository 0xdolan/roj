// SPDX-License-Identifier: GPL-3.0-or-later
// Calendar engine shared by the Shell extension, the preferences window and
// the roj CLI. Pure JavaScript: no GNOME imports, so it also runs on Node.
//
// Every day is addressed by its Julian Day Number (JDN) as returned by tsroj
// (a value ending in .5, i.e. midnight). All four calendars are derived from
// that single number, which keeps conversions consistent everywhere.
//
// Each calendar is written in its own language: the Kurdish date in the main
// language, the other three either in the same language, the interface
// language, or their native one (Gregorian in English, Persian in Persian,
// Islamic in Arabic). Digits are chosen per language.

import {
    CalendarKind,
    KurdishDate,
    KurdishEra,
    formatCalendarDate,
    getAmPm,
    getDigits,
    gregorianToJdn,
    islamicToJdn,
    jdnToGregorian,
    jdnToIslamic,
    jdnToPersian,
    persianToJdn,
} from './tsroj.js';

export const LOCALES = ['ckb', 'kmr', 'en', 'fa', 'ar'];
export const RTL_LOCALES = new Set(['ckb', 'fa', 'ar']);
export const CALENDARS = ['kurdish', 'gregorian', 'persian', 'islamic'];
export const SECONDARY_CALENDARS = ['gregorian', 'persian', 'islamic'];

/** The language each calendar is written in when shown "in its own language". */
export const NATIVE_LOCALE = {kurdish: 'ckb', gregorian: 'en', persian: 'fa', islamic: 'ar'};

export const DIGIT_SETS = {
    latin: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    arabic: ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'],
    persian: ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'],
};

export const ERAS = {
    solar: {era: KurdishEra.SOLAR_PERSIAN_OFFSET, offset: 1321},
    nineveh: {era: KurdishEra.FALL_OF_NINEVEH, offset: 1233},
};

export const DEFAULT_OPTIONS = Object.freeze({
    locale: 'ckb', // language of the Kurdish (main) date
    uiLanguage: 'ckb', // resolved interface language, used by secondaryLanguage 'interface'
    secondaryLanguage: 'same', // 'same' | 'interface' | 'native'
    digits: {}, // per language: 'native' (default) | 'latin' | 'arabic' | 'persian'
    era: 'solar',
    leadingZero: 'auto', // 'auto' | 'on' | 'off'
    // Sorani ezafe (ی) per calendar. tsroj only applies it to Sorani text.
    ezafe: {kurdish: true, gregorian: false, persian: false, islamic: false},
    ezafeAfterDay: true,
    ezafeOnMonth: true,
    monthVariant: 0,
    weekdayVariant: 0,
    islamicOffset: 0, // days, to align the tabular Hijri calendar with local sighting
    weekStart: 6, // JS weekday: 0 = Sunday ... 6 = Saturday
});

// Every token understood by tsroj's strftime, plus the time tokens and %%
// that this engine adds on top. `kind` drives grouping in the UI.
export const TOKENS = [
    {token: '%Y', kind: 'year', desc: 'Year, four digits'},
    {token: '%y', kind: 'year', desc: 'Year, last two digits'},
    {token: '%B', kind: 'month', desc: 'Month name'},
    {token: '%b', kind: 'month', desc: 'Short month name'},
    {token: '%m', kind: 'month', desc: 'Month number, padding follows the leading zero setting'},
    {token: '%-m', kind: 'month', desc: 'Month number, never padded'},
    {token: '%d', kind: 'day', desc: 'Day of month, padding follows the leading zero setting'},
    {token: '%-d', kind: 'day', desc: 'Day of month, never padded'},
    {token: '%A', kind: 'weekday', desc: 'Weekday name'},
    {token: '%a', kind: 'weekday', desc: 'Short weekday name'},
    {token: '%E', kind: 'weekday', desc: 'Minimal weekday name'},
    {token: '%w', kind: 'weekday', desc: 'Weekday number: Saturday is 1, or Monday is 1 for Gregorian'},
    {token: '%-w', kind: 'weekday', desc: 'Weekday number from Saturday (1) to Friday (7)'},
    {token: '%H', kind: 'time', desc: 'Hour, 24-hour clock'},
    {token: '%I', kind: 'time', desc: 'Hour, 12-hour clock'},
    {token: '%M', kind: 'time', desc: 'Minute'},
    {token: '%S', kind: 'time', desc: 'Second'},
    {token: '%p', kind: 'time', desc: 'AM or PM in the date language'},
    {token: '%%', kind: 'literal', desc: 'A literal % sign'},
];

export const PRESETS = [
    {name: 'Full', pattern: '%A %d %B %Y'},
    {name: 'Long', pattern: '%d %B %Y'},
    {name: 'Day and month', pattern: '%d %B'},
    {name: 'Weekday, day and month', pattern: '%A %d %B'},
    {name: 'Short', pattern: '%a %d %b'},
    {name: 'Numeric', pattern: '%Y/%m/%d'},
    {name: 'ISO style', pattern: '%Y-%m-%d'},
    {name: 'Date and time', pattern: '%d %B %Y · %H:%M'},
    {name: '12-hour time', pattern: '%I:%M %p'},
];

const PATTERN_TOKENS = TOKENS.map(t => t.token).sort((a, b) => b.length - a.length);
const WEEKDAY_NAME_TOKENS = new Set(['%A', '%a', '%E']);
const WEEKDAY_TOKENS = new Set([...WEEKDAY_NAME_TOKENS, '%w', '%-w']);
const MONTH_NAME_TOKENS = new Set(['%B', '%b']);
const TIME_TOKENS = new Set(['%H', '%I', '%M', '%S', '%p']);
const PERCENT_PLACEHOLDER = '';

// tsroj has no Kurdish calendar data for these languages and, for Persian and
// Islamic dates, picks the weekday from the wrong position in their week. Roj
// therefore takes Kurdish month names from Sorani and weekday names from the
// (correct) Gregorian path for them.
const NO_KURDISH_DATA = new Set(['fa', 'ar']);

/** Split a pattern into literal text and % tokens. */
export function tokenize(pattern) {
    const parts = [];
    let i = 0;
    let literal = '';
    while (i < pattern.length) {
        const tok = pattern[i] === '%' && PATTERN_TOKENS.find(t => pattern.startsWith(t, i));
        if (tok) {
            if (literal) {
                parts.push({type: 'literal', value: literal});
                literal = '';
            }
            parts.push({type: 'token', value: tok});
            i += tok.length;
        } else {
            literal += pattern[i];
            i++;
        }
    }
    if (literal)
        parts.push({type: 'literal', value: literal});
    return parts;
}

/** Day of week for a JDN, JavaScript convention (0 is Sunday, 6 is Saturday). */
export function weekdayOf(jdn) {
    return ((Math.floor(jdn + 1.5) % 7) + 7) % 7;
}

export function isRtlLocale(locale) {
    return RTL_LOCALES.has(locale);
}

export class RojEngine {
    constructor(options = {}) {
        this.setOptions(options);
    }

    setOptions(options = {}) {
        const merged = {...DEFAULT_OPTIONS};
        for (const [key, value] of Object.entries(options)) {
            if (value !== undefined && value !== null)
                merged[key] = value;
        }
        merged.ezafe = {...DEFAULT_OPTIONS.ezafe, ...(options.ezafe ?? {})};
        merged.digits = {...(options.digits ?? {})};
        if (!LOCALES.includes(merged.locale))
            merged.locale = DEFAULT_OPTIONS.locale;
        if (!LOCALES.includes(merged.uiLanguage))
            merged.uiLanguage = merged.locale;
        if (!ERAS[merged.era])
            merged.era = DEFAULT_OPTIONS.era;
        this.options = Object.freeze(merged);
        return this;
    }

    /** A copy of this engine with some options changed. */
    with(options) {
        return new RojEngine({...this.options, ...options});
    }

    get locale() {
        return this.options.locale;
    }

    get isRtl() {
        return isRtlLocale(this.options.locale);
    }

    /** The language a calendar is written in. */
    localeFor(calendar) {
        if (calendar === 'kurdish')
            return this.options.locale;
        switch (this.options.secondaryLanguage) {
        case 'native':
            return NATIVE_LOCALE[calendar];
        case 'interface':
            return this.options.uiLanguage;
        default:
            return this.options.locale;
        }
    }

    /** The ten digit characters used for a language. */
    digitsFor(locale) {
        const mode = this.options.digits[locale] ?? 'native';
        return DIGIT_SETS[mode] ?? getDigits(locale);
    }

    // Conversions
    /** Kurdish solar date object (tsroj) for a JDN. */
    kurdishDate(jdn) {
        return KurdishDate.fromJdn(jdn, ERAS[this.options.era].era);
    }

    /** [year, month, day] for `jdn` in the given calendar. */
    dateIn(calendar, jdn) {
        switch (calendar) {
        case 'kurdish': {
            const kd = this.kurdishDate(jdn);
            return [kd.year, kd.month, kd.day];
        }
        case 'gregorian':
            return jdnToGregorian(jdn);
        case 'persian':
            return jdnToPersian(jdn);
        case 'islamic':
            return jdnToIslamic(jdn + this.options.islamicOffset);
        default:
            throw new Error(`Unknown calendar: ${calendar}`);
        }
    }

    /** All four calendars at once: {kurdish: [y, m, d], gregorian: ...}. */
    allDates(jdn) {
        const out = {};
        for (const cal of CALENDARS)
            out[cal] = this.dateIn(cal, jdn);
        return out;
    }

    /** JDN for a date given in any calendar. Throws on invalid dates. */
    toJdn(calendar, year, month, day) {
        switch (calendar) {
        case 'kurdish':
            return persianToJdn(year - ERAS[this.options.era].offset, month, day);
        case 'gregorian':
            return gregorianToJdn(year, month, day);
        case 'persian':
            return persianToJdn(year, month, day);
        case 'islamic':
            return islamicToJdn(year, month, day) - this.options.islamicOffset;
        default:
            throw new Error(`Unknown calendar: ${calendar}`);
        }
    }

    /** Number of days in a month of the given calendar. */
    monthLength(calendar, year, month) {
        const first = this.toJdn(calendar, year, month, 1);
        const [ny, nm] = month === 12 ? [year + 1, 1] : [year, month + 1];
        return this.toJdn(calendar, ny, nm, 1) - first;
    }

    /** JDN of today, from a JS Date or {year, month, day} (defaults to now). */
    todayJdn(now = new Date()) {
        if (now instanceof Date)
            return gregorianToJdn(now.getFullYear(), now.getMonth() + 1, now.getDate());
        return gregorianToJdn(now.year, now.month, now.day);
    }

    /** Move a [year, month] pair by `delta` months. */
    static shiftMonth(year, month, delta) {
        const index = year * 12 + (month - 1) + delta;
        return [Math.floor(index / 12), (index % 12) + 1];
    }

    // Formatting
    /** Options passed to tsroj for a calendar written in `locale`. */
    tsrojOptions(calendar, locale = this.localeFor(calendar)) {
        const o = this.options;
        const opts = {
            calendar: CalendarKind[calendar.toUpperCase()],
            locale,
            useLocaleDigits: true,
            digits: this.digitsFor(locale),
            monthVariant: o.monthVariant,
            weekdayVariant: o.weekdayVariant,
            ezafeAfterDay: !!(o.ezafe[calendar] && o.ezafeAfterDay),
            ezafeOnMonth: !!(o.ezafe[calendar] && o.ezafeOnMonth),
        };
        if (o.leadingZero === 'on')
            opts.leadingZero = true;
        else if (o.leadingZero === 'off')
            opts.leadingZero = false;
        return opts;
    }

    /** Whether numeric tokens are zero-padded for a language. */
    padsNumbers(locale) {
        if (this.options.leadingZero === 'on')
            return true;
        if (this.options.leadingZero === 'off')
            return false;
        return !RTL_LOCALES.has(locale);
    }

    /**
     * Format `jdn` with a strftime-style pattern in one calendar.
     *
     * `time` is an optional {hour, minute, second} (or Date) for the time
     * tokens. Throws on invalid patterns; see tryFormat.
     */
    format(jdn, calendar, pattern, time = null) {
        const locale = this.localeFor(calendar);
        const real = this.kurdishDate(jdn);
        const shifted = calendar === 'islamic' && this.options.islamicOffset !== 0;
        const borrowWeekday = shifted || (NO_KURDISH_DATA.has(locale) && calendar !== 'gregorian');
        const borrowMonth = calendar === 'kurdish' && NO_KURDISH_DATA.has(locale);

        let out = '';
        for (const part of tokenize(String(pattern))) {
            const tok = part.value;
            if (part.type === 'literal') {
                out += tok;
            } else if (tok === '%%') {
                out += PERCENT_PLACEHOLDER;
            } else if (TIME_TOKENS.has(tok)) {
                out += this._timeToken(tok, time ?? new Date(), locale);
            } else if (borrowWeekday && WEEKDAY_NAME_TOKENS.has(tok)) {
                // The weekday always belongs to the real day, never the shifted one.
                const source = NO_KURDISH_DATA.has(locale) ? 'gregorian' : 'kurdish';
                out += formatCalendarDate(real, tok, this.tsrojOptions(source, locale));
            } else if (shifted && WEEKDAY_TOKENS.has(tok)) {
                out += formatCalendarDate(real, tok, this.tsrojOptions('kurdish', locale));
            } else if (borrowMonth && MONTH_NAME_TOKENS.has(tok)) {
                out += formatCalendarDate(real, tok, {...this.tsrojOptions('kurdish', 'ckb'), ezafeOnMonth: false});
            } else {
                out += tok;
            }
        }
        const kd = shifted ? this.kurdishDate(jdn + this.options.islamicOffset) : real;
        const formatted = formatCalendarDate(kd, out, this.tsrojOptions(calendar, locale));
        return formatted.split(PERCENT_PLACEHOLDER).join('%');
    }

    /** Like format, but never throws: {ok, text, error}. */
    tryFormat(jdn, calendar, pattern, time = null) {
        try {
            return {ok: true, text: this.format(jdn, calendar, pattern, time), error: null};
        } catch (e) {
            return {ok: false, text: '', error: e.message};
        }
    }

    _timeToken(token, time, locale) {
        const t = time instanceof Date
            ? {hour: time.getHours(), minute: time.getMinutes(), second: time.getSeconds()}
            : time;
        const pad2 = n => String(n).padStart(2, '0');
        // Hours follow the leading zero rule; minutes and seconds are always two
        // digits so that 9:05 never becomes 9:5.
        const hour = n => (this.padsNumbers(locale) ? pad2(n) : String(n));
        switch (token) {
        case '%H':
            return hour(t.hour);
        case '%I':
            return hour(t.hour % 12 || 12);
        case '%M':
            return pad2(t.minute);
        case '%S':
            return pad2(t.second ?? 0);
        case '%p':
            return getAmPm(locale)[t.hour < 12 ? 0 : 1];
        default:
            return token;
        }
    }

    /** Whether a pattern needs per-second updates. */
    static needsSeconds(pattern) {
        return tokenize(String(pattern)).some(p => p.type === 'token' && p.value === '%S');
    }

    /** A number in the digits of the language a calendar is written in. */
    number(n, calendar = 'kurdish', pad = 0) {
        const digits = this.digitsFor(this.localeFor(calendar));
        return String(n).padStart(pad, '0').replace(/[0-9]/g, d => digits[d.charCodeAt(0) - 48]);
    }

    /** The twelve month names of a calendar. */
    monthNames(calendar, field = '%B') {
        const year = {kurdish: 2726, gregorian: 2026, persian: 1405, islamic: 1448}[calendar];
        const names = [];
        for (let m = 1; m <= 12; m++)
            names.push(this.format(this.toJdn(calendar, year, m, 1), calendar, field));
        return names;
    }

    /** Weekday names in the main language, starting at the configured week start. */
    weekdayNames(field = '%E') {
        // 2026-10-24 is a Saturday; walk seven days from there.
        const saturday = gregorianToJdn(2026, 10, 24);
        const names = [];
        for (let i = 0; i < 7; i++) {
            const jsDay = (this.options.weekStart + i) % 7;
            names.push({jsDay, name: this.format(saturday + ((jsDay + 1) % 7), 'kurdish', field)});
        }
        return names;
    }

    // Month grid
    /**
     * A Kurdish month laid out as weeks. Always six rows so the popup keeps a
     * stable height. Each cell: {jdn, inMonth, weekday, dates}.
     */
    monthGrid(year, month) {
        const first = this.toJdn('kurdish', year, month, 1);
        const length = this.monthLength('kurdish', year, month);
        const lead = (weekdayOf(first) - this.options.weekStart + 7) % 7;
        const start = first - lead;
        const weeks = [];
        for (let w = 0; w < 6; w++) {
            const row = [];
            for (let d = 0; d < 7; d++) {
                const jdn = start + w * 7 + d;
                row.push({
                    jdn,
                    inMonth: jdn >= first && jdn < first + length,
                    weekday: weekdayOf(jdn),
                    dates: this.allDates(jdn),
                });
            }
            weeks.push(row);
        }
        return {year, month, first, length, weeks};
    }
}
