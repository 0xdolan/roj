// SPDX-License-Identifier: GPL-3.0-or-later
// Roj settings in the browser: the pages of the GNOME preferences window
// (extension/prefs/), over the same keys. Every change is saved at once and
// the popup and the toolbar button follow.

import {CALENDARS, LOCALES, PRESETS, RojEngine, SECONDARY_CALENDARS, TOKENS, pinClock} from '../lib/engine.js';
import {getLocaleData} from '../lib/tsroj.js';
import {LANGUAGE_NAMES, N_, translator} from '../lib/i18n.js';
import {
    AUTHOR, AUTHOR_URL, BUNDLED_FONTS, CHANGELOG_URL, DOCS_URL, EGO_URL, ISSUES_URL, PYROJ_URL, REPO_URL,
    SITE_URL, STORY_URL, TSROJ_URL, TSROJ_VERSION, VERSION,
} from '../lib/constants.js';
import {
    DEFAULTS, customFonts, engineOptions, eventSources, exportSettings, importSettings, loadSettings,
    resetSettings, saveSettings, uiLanguage,
} from './settings.js';
import {BUILTIN_PATH, forgetSource, loadEvents, storeFile, validFeedUrl} from './sources.js';
import {applyLook, readFontFile} from './look.js';
import {assetUrl, isExtension, onStoreChanged, pingBackground, removeLocal, requestOrigin, writeLocal} from './store.js';
import {esc, icon} from './ui.js';

const pinned = new URLSearchParams(location.search).get('now');
if (pinned)
    pinClock(pinned);

const PAGES = [
    {id: 'general', title: N_('General')},
    {id: 'appearance', title: N_('Appearance')},
    {id: 'formats', title: N_('Formats')},
    {id: 'events', title: N_('Events')},
    {id: 'converter', title: N_('Converter')},
    {id: 'about', title: N_('About')},
];
const LANGUAGE_LABELS = {ckb: N_('Sorani'), kmr: N_('Kurmanji'), en: N_('English'), fa: N_('language|Persian'), ar: N_('language|Arabic')};
const CALENDAR_LABELS = {kurdish: N_('Kurdish'), gregorian: N_('Gregorian'), persian: N_('Persian (Jalali)'), islamic: N_('Islamic (Hijri)')};
const SHORT_DAYS = [N_('Sun'), N_('Mon'), N_('Tue'), N_('Wed'), N_('Thu'), N_('Fri'), N_('Sat')];
const PATTERNS = [
    {key: 'panel-format', title: N_('Toolbar button')},
    {key: 'header-format-kurdish', title: N_('Popup header: Kurdish'), calendar: 'kurdish'},
    {key: 'header-format-gregorian', title: N_('Popup header: Gregorian'), calendar: 'gregorian'},
    {key: 'header-format-persian', title: N_('Popup header: Persian'), calendar: 'persian'},
    {key: 'header-format-islamic', title: N_('Popup header: Islamic'), calendar: 'islamic'},
    {key: 'copy-format', title: N_('The Copy button')},
];
const PALETTE = ['#3584E4', '#2EC27E', '#E66100', '#9141AC', '#E01B24', '#865E3C', '#1C71D8'];
const google = id => `https://calendar.google.com/calendar/ical/${id}%23holiday%40group.v.calendar.google.com/public/basic.ics`;
const SUGGESTED_FEEDS = [
    {name: N_('Holidays in Iraq'), url: google('en.iq')},
    {name: N_('Holidays in Iran'), url: google('en.ir')},
    {name: N_('Holidays in Turkey'), url: google('en.turkish')},
    {name: N_('Holidays in Syria'), url: google('en.sy')},
    {name: N_('Holidays in Germany'), url: google('en.german')},
    {name: N_('Muslim holidays'), url: google('en.islamic')},
];
const EXAMPLE = {
    name: {ckb: 'بۆنەکانی من', kmr: 'Bûyerên min', en: 'My events', fa: 'رویدادهای من', ar: 'مناسباتي'},
    events: [
        {calendar: 'kurdish', month: 1, day: 1, holiday: true,
            title: {ckb: 'نەورۆز', kmr: 'Newroz', en: 'Newroz', fa: 'نوروز', ar: 'نوروز'}},
        {calendar: 'gregorian', month: 5, day: 15, title: {ckb: 'ڕۆژی زمانی کوردی', kmr: 'Roja Zimanê Kurdî', en: 'Kurdish Language Day'}},
        {calendar: 'persian', month: 1, day: 13, title: 'Sizdah Bedar'},
        {calendar: 'islamic', month: 10, day: 1, holiday: true, title: {ckb: 'جەژنی ڕەمەزان', kmr: 'Cejna Remezanê', en: 'Eid al-Fitr', ar: 'عيد الفطر'}},
        {calendar: 'gregorian', year: 2026, month: 12, day: 31, time: '20:00', title: 'A one-off event with a time'},
    ],
};

let settings;
let engine;
let _;
let page = 'general';
let events = null; // {errors, info} of the last load, for the Events page
const converter = {calendar: 'gregorian', jdn: null};

// DOM helpers
function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs ?? {})) {
        if (v === null || v === undefined || v === false)
            continue;
        if (k.startsWith('on'))
            el.addEventListener(k.slice(2), v);
        else if (k === 'html')
            el.innerHTML = v;
        else if (k in el && typeof v !== 'string')
            el[k] = v;
        else
            el.setAttribute(k, v === true ? '' : v);
    }
    for (const child of children.flat()) {
        if (child !== null && child !== undefined && child !== false)
            el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
}

function group(title, description, ...rows) {
    return h('section', {class: 'opt-group'},
        title ? h('h2', {}, title) : null,
        description ? h('p', {class: 'opt-desc'}, description) : null,
        h('div', {class: 'opt-rows'}, ...rows));
}

function row(title, subtitle, ...controls) {
    return h('div', {class: 'opt-row'},
        h('div', {class: 'opt-row-text'}, h('div', {class: 'opt-row-title'}, title), subtitle ? h('div', {class: 'opt-row-sub'}, subtitle) : null),
        ...controls);
}

function toast(text) {
    const el = document.getElementById('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}

function button(label, onclick, {cls = '', iconName = null, title = null} = {}) {
    return h('button', {type: 'button', class: `btn ${cls}`, onclick, title: title ?? (iconName && !label ? null : null), 'aria-label': title},
        iconName ? h('span', {html: icon(iconName), style: 'display:contents'}) : null, label);
}

function iconButton(iconName, title, onclick) {
    return h('button', {type: 'button', class: 'btn icon', title, 'aria-label': title, onclick, html: icon(iconName)});
}

/** A small modal with buttons; resolves with the chosen value, or null. */
function choose(heading, body, choices) {
    return new Promise(resolve => {
        const dialog = h('dialog', {class: 'opt-dialog'},
            h('h2', {}, heading), body ? h('p', {}, body) : null,
            h('div', {class: 'opt-dialog-buttons'}, choices.map(c => button(c.label, () => {
                dialog.close();
                resolve(c.value);
            }, {cls: c.cls ?? ''}))));
        dialog.addEventListener('cancel', () => resolve(null));
        dialog.addEventListener('close', () => dialog.remove());
        dialog.dir = document.documentElement.dir;
        document.body.append(dialog);
        dialog.showModal();
    });
}

/** A modal with a text field; resolves with the text, or null. */
function ask(heading, body, placeholder = '', confirmLabel = _('Add')) {
    return new Promise(resolve => {
        const input = h('input', {type: 'text', placeholder, dir: 'ltr', style: 'width:100%;box-sizing:border-box'});
        const dialog = h('dialog', {class: 'opt-dialog'},
            h('h2', {}, heading), body ? h('p', {}, body) : null, input,
            h('div', {class: 'opt-dialog-buttons'},
                button(_('Cancel'), () => {
                    dialog.close();
                    resolve(null);
                }),
                button(confirmLabel, () => {
                    dialog.close();
                    resolve(input.value.trim());
                }, {cls: 'primary'})));
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                dialog.close();
                resolve(input.value.trim());
            }
        });
        dialog.addEventListener('cancel', () => resolve(null));
        dialog.addEventListener('close', () => dialog.remove());
        dialog.dir = document.documentElement.dir;
        document.body.append(dialog);
        dialog.showModal();
        input.focus();
    });
}

function pickFile(accept) {
    return new Promise(resolve => {
        const input = h('input', {type: 'file', accept, style: 'display:none'});
        input.addEventListener('change', () => {
            resolve(input.files[0] ?? null);
            input.remove();
        });
        document.body.append(input);
        input.click();
    });
}

function download(name, text, type = 'application/json') {
    const url = URL.createObjectURL(new Blob([text], {type}));
    h('a', {href: url, download: name}).click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Saving
let saving = Promise.resolve();
async function update(key, value, {rerender = true} = {}) {
    settings = {...settings, [key]: value};
    saving = saving.then(() => saveSettings(settings)).catch(e => toast(e.message));
    await saving;
    setup();
    await applyLook(settings);
    pingBackground({type: 'refresh'});
    if (rerender)
        render();
}

// Controls bound to a key
function switchFor(key, onchange = null) {
    const input = h('input', {type: 'checkbox', role: 'switch', checked: settings[key],
        onchange: e => (onchange ? onchange(e.target.checked) : update(key, e.target.checked))});
    return h('label', {class: 'opt-switch'}, input, h('span'));
}

function selectFor(key, options, {numeric = false} = {}) {
    return h('select', {onchange: e => update(key, numeric ? Number(e.target.value) : e.target.value)},
        options.map(o => h('option', {value: String(o.value), selected: String(settings[key]) === String(o.value)}, o.label)));
}

function numberFor(key, min, max, step = 1) {
    return h('input', {type: 'number', min, max, step, value: settings[key], onchange: e => {
        const n = Math.min(max, Math.max(min, Number(e.target.value)));
        if (Number.isFinite(n))
            update(key, n);
    }});
}

function languageLabel(code) {
    const own = LANGUAGE_NAMES[code];
    const translated = _(LANGUAGE_LABELS[code]);
    return translated === own ? own : `${translated} · ${own}`;
}

function variantOptions(locale, field) {
    // Persian and Arabic dates use the Sorani month names.
    const source = locale === 'fa' || locale === 'ar' ? 'ckb' : locale;
    const entries = getLocaleData(source, 'kurdish')[field];
    const count = Math.max(...entries.map(e => e.names.length));
    const options = [];
    for (let i = 0; i < count; i++) {
        const names = i === 0 ? entries.map(e => e.names[0]) : entries.filter(e => e.names[i]).map(e => e.names[i]);
        const sample = names.slice(0, 4).join(source === 'ckb' ? '، ' : ', ');
        const label = i === 0 ? _('Default') : _('Variant {n}', {n: i});
        options.push({value: i, label: `${label}: ${sample}${names.length > 4 ? ' …' : ''}`});
    }
    return options;
}

// Pages
function generalPage() {
    const today = engine.todayJdn();
    const persianYear = engine.dateIn('persian', today)[0];
    const languages = LOCALES.map(l => ({value: l, label: languageLabel(l)}));
    const digitOptions = [
        {value: 'native', label: _('Own digits')}, {value: 'latin', label: _('Western')},
        {value: 'arabic', label: _('digits|Arabic')}, {value: 'persian', label: _('digits|Persian')},
    ];
    const weekend = new Set(settings['weekend-days']);
    const order = [6, 0, 1, 2, 3, 4, 5];
    const variantsShown = settings.locale !== 'fa' && settings.locale !== 'ar';
    return [
        group(_('Languages'), _('Choose the language of the Kurdish date, of the other calendars and of the interface.'),
            row(_('Main date language'), _('The language of the Kurdish date in the top bar and the popup'), selectFor('locale', languages)),
            row(_('Other calendars'), _('Own language: Gregorian in English, Persian in Persian, Islamic in Arabic'), selectFor('secondary-language', [
                {value: 'same', label: _('Same as the main date')},
                {value: 'interface', label: _('Same as the interface')},
                {value: 'native', label: _('Each in its own language')},
            ])),
            row(_('Interface language'), _('Menus, labels and this window'),
                selectFor('ui-language', [{value: 'auto', label: _('Same as the main date')}, ...['en', 'ckb', 'kmr', 'fa', 'ar'].map(l => ({value: l, label: languageLabel(l)}))])),
            row(_('Year numbering'), _('Months and days stay the same; only the year number changes'), selectFor('era', [
                {value: 'solar', label: _('Kurdish solar: Persian year + 1321 ({year})', {year: engine.number(persianYear + 1321)})},
                {value: 'nineveh', label: _('Fall of Nineveh: Persian year + 1233 ({year})', {year: engine.number(persianYear + 1233)})},
            ]))),
        group(_('Digits'), _('Each calendar\'s numbers use the digits of its own language: Gregorian English 012, Persian Persian ۰۱۲, Islamic Arabic ٠١٢, and the Kurdish date the main language. Choose other digits for a language here.'),
            ...LOCALES.map(l => row(languageLabel(l), null, selectFor(`digits-${l}`, digitOptions))),
            row(_('Leading zero'), _('For %d, %m and the hour'), selectFor('leading-zero', [
                {value: 'auto', label: _('Automatic: off for Sorani, Persian and Arabic')},
                {value: 'on', label: _('Always (05)')},
                {value: 'off', label: _('Never (5)')},
            ]))),
        group(_('Sorani ezafe (ی)'), _('The linking ی as Sorani writes it: ٥ی پووشپەڕی ٢٧٢٦. It applies only to dates written in Sorani, and is on for the Kurdish date only by default.'),
            ...CALENDARS.map(c => row(_(CALENDAR_LABELS[c]), null, switchFor(`ezafe-${c}`))),
            row(_('After the day number'), _('When a month name follows: ٥ی پووشپەڕ'), switchFor('ezafe-after-day')),
            row(_('After the month name'), _('When a year follows: پووشپەڕی ٢٧٢٦'), switchFor('ezafe-on-month'))),
        group(_('Names'), null,
            row(_('Kurdish month names'), _('Some months have more than one traditional name'), selectFor('month-variant', variantOptions(settings.locale, 'months'), {numeric: true})),
            variantsShown ? row(_('Weekday names'), null, selectFor('weekday-variant', variantOptions(settings.locale, 'weekdays'), {numeric: true})) : null),
        group(_('Week'), null,
            row(_('First day of the week'), null, selectFor('week-start', [
                {value: 6, label: _('Saturday')}, {value: 0, label: _('Sunday')}, {value: 1, label: _('Monday')},
            ], {numeric: true})),
            row(_('Weekend'), _('Shown in red in the calendar'), h('div', {class: 'opt-days'}, order.map(d => h('label', {},
                h('input', {type: 'checkbox', checked: weekend.has(d), onchange: e => {
                    const next = new Set(settings['weekend-days']);
                    if (e.target.checked)
                        next.add(d);
                    else
                        next.delete(d);
                    update('weekend-days', [...next].sort());
                }}), _(SHORT_DAYS[d])))))),
        group(_('Islamic calendar'), _('Roj uses the arithmetic (tabular) Hijri calendar. Where months begin with the sighting of the moon, dates can differ by a day or two; adjust them here.'),
            row(_('Day adjustment'), _('Today: {date}', {date: engine.format(today, 'islamic', '%d %B %Y')}), numberFor('islamic-offset', -3, 3))),
        group(_('Backup and restore'), _('Save every Roj setting to a file, and load it on another computer or after a fresh install.'),
            row(_('Export settings'), _('Saves a .json file'), button(_('Export…'), () => {
                download('roj-settings.json', exportSettings(settings));
            })),
            row(_('Import settings'), _('Loads a file made with Export'), button(_('Import…'), async () => {
                const file = await pickFile('.json,application/json');
                if (!file)
                    return;
                try {
                    const {values, applied, skipped} = importSettings(settings, await file.text());
                    await saveSettings(values);
                    await reload();
                    toast(skipped.length
                        ? _('Imported {applied} settings, skipped {skipped}', {applied: applied.length, skipped: skipped.length})
                        : _('Imported {applied} settings', {applied: applied.length}));
                } catch (e) {
                    toast(_('Could not import: {error}', {error: e.message}));
                }
            })),
            row(_('Reset to defaults'), _('Every setting returns to how it was after installing'), button(_('Reset…'), async () => {
                const ok = await choose(_('Reset all settings?'), _('Languages, fonts, patterns, event sources and every other option return to their defaults. Export first if you may want them back.'),
                    [{label: _('Cancel'), value: false}, {label: _('Reset'), value: true, cls: 'danger'}]);
                if (!ok)
                    return;
                await resetSettings();
                await reload();
                toast(_('Settings reset'));
            }, {cls: 'danger'}))),
    ];
}

function fontOptions(script) {
    const bundled = [...new Set(BUNDLED_FONTS.filter(f => f.script === script).map(f => f.family))]
        .map(f => ({value: f, label: _('{font} (included)', {font: f})}));
    const loaded = customFonts(settings).map(f => ({value: f.family, label: f.family}));
    const current = settings[script === 'latin' ? 'latin-font' : 'arabic-font'];
    const known = [...bundled, ...loaded];
    if (!known.some(o => o.value === current))
        known.push({value: current, label: current});
    return [...known, {value: '\u0000choose', label: _('Choose any installed font…')}];
}

function fontSelect(key, script) {
    const select = selectFor(key, fontOptions(script));
    select.onchange = async e => {
        let value = e.target.value;
        if (value === '\u0000choose') {
            value = await ask(_('Choose any installed font…'), _('Installed or loaded font'), '', _('Add'));
            if (!value) {
                render();
                return;
            }
        }
        update(key, value);
    };
    return select;
}

async function loadFont() {
    const file = await pickFile('.ttf,.otf,font/ttf,font/otf');
    if (!file)
        return;
    try {
        const {family, data} = await readFontFile(file);
        const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        await writeLocal(`font:${id}`, data);
        const fonts = customFonts(settings).filter(f => f.family !== family);
        fonts.push({family, id});
        const use = await choose(_('Use “{font}”?', {font: family}), _('Choose which text should use this font. You can change it later.'), [
            {label: _('Left-to-right text'), value: 'latin-font'},
            {label: _('Right-to-left text'), value: 'arabic-font'},
            {label: _('Just add it'), value: null},
        ]);
        settings = {...settings, 'custom-fonts': JSON.stringify(fonts)};
        if (use)
            settings[use] = family;
        await update('custom-fonts', settings['custom-fonts']);
        toast(_('Loaded {font}', {font: family}));
    } catch (e) {
        const reason = e.message === 'name' ? _('could not read the font name') : _('the file is not a usable font');
        toast(_('Could not load the font: {error}', {error: reason}));
    }
}

function appearancePage() {
    const fonts = customFonts(settings);
    const indicator = settings['panel-event-indicator'] === 'title' ? 'dot' : settings['panel-event-indicator'];
    const sample = engine.format(engine.todayJdn(), 'kurdish', '%d %B %Y');
    return [
        group(_('Theme'), null,
            row(_('Colour scheme'), _('Used by the popup and this window'), selectFor('theme', [
                {value: 'system', label: _('Follow the system')}, {value: 'light', label: _('Light')}, {value: 'dark', label: _('Dark')},
            ])),
            row(_('Popup text size'), null,
                h('input', {type: 'range', min: 0.8, max: 1.5, step: 0.05, value: settings['font-scale'],
                    onchange: e => update('font-scale', Number(e.target.value))}),
                h('span', {class: 'opt-row-value'}, `${Math.round(settings['font-scale'] * 100)}%`)),
            row(_('Credits line'), _('“Made with ♥ by 0xdolan” at the bottom of the popup'), switchFor('show-footer'))),
        group(_('Toolbar button'), _('The text pattern is set on the Formats page.'),
            row(_('Show the date'), _('Today’s Kurdish day on the icon; the Roj logo when off'), switchFor('panel-show-text')),
            row(_('Today’s events'), _('Shown when today has an event; red when today is a holiday'), h('select', {
                onchange: e => update('panel-event-indicator', e.target.value),
            }, [{value: 'dot', label: _('A dot on the icon')}, {value: 'count', label: _('The number of events')}, {value: 'off', label: _('Nothing')}]
                .map(o => h('option', {value: o.value, selected: indicator === o.value}, o.label))))),
        group(_('Day cards'), _('The large number is always the Kurdish day. Add the Gregorian, Persian or Islamic day as small numbers of the same size: any one, two or all three.'),
            ...SECONDARY_CALENDARS.map(c => row(_('{calendar} day', {calendar: _(CALENDAR_LABELS[c])}), c === 'gregorian' ? _('On by default') : _('Off by default'), switchFor(`card-show-${c}`))),
            row(_('Placement of the small numbers'), null, selectFor('card-layout', [
                {value: 'row', label: _('In a row under the day')}, {value: 'corners', label: _('In the corners')},
            ]))),
        group(_('Popup header'), _('The selected day is shown at the top of the popup in Kurdish, followed by these calendars.'),
            ...SECONDARY_CALENDARS.map(c => row(_('{calendar} date', {calendar: _(CALENDAR_LABELS[c])}), null, switchFor(`header-show-${c}`)))),
        group(_('Fonts'), _('Text is split by script. Letters in the Arabic Unicode range (Sorani, Persian, Arabic) use the right-to-left font; everything else, such as Kurmanji and English, uses the left-to-right font.'),
            row(_('Left-to-right text'), null, fontSelect('latin-font', 'latin')),
            row(_('Right-to-left text'), null, fontSelect('arabic-font', 'arabic')),
            row(_('Preview: {latin} and {arabic}', {latin: settings['latin-font'], arabic: settings['arabic-font']}), null,
                h('span', {class: 'opt-row-value', style: 'font-size:1.15em'}, `Roj 2726 · ${sample}`)),
            row(_('Load a font file'), _('A .ttf or .otf file, copied into Roj’s own folder and used without installing it'), button(_('Choose a file…'), loadFont))),
        fonts.length ? group(_('Loaded font files'), null, ...fonts.map(f => row(f.family, null, iconButton('remove', _('Remove'), async () => {
            await removeLocal(`font:${f.id}`);
            const next = customFonts(settings).filter(x => x.id !== f.id);
            settings = {...settings, 'custom-fonts': JSON.stringify(next)};
            for (const key of ['latin-font', 'arabic-font']) {
                if (settings[key] === f.family)
                    settings[key] = DEFAULTS[key];
            }
            await update('custom-fonts', settings['custom-fonts']);
            toast(_('Removed {font}', {font: f.family}));
        })))) : null,
    ];
}

function insertMenu(input, anchor) {
    document.querySelector('.opt-menu')?.remove();
    const menu = h('div', {class: 'opt-menu', role: 'menu'});
    const close = () => {
        menu.remove();
        document.removeEventListener('click', outside, true);
    };
    const outside = e => {
        if (!menu.contains(e.target) && e.target !== anchor)
            close();
    };
    menu.append(h('h3', {}, _('Presets')));
    for (const p of PRESETS) {
        menu.append(h('button', {type: 'button', onclick: () => {
            input.value = p.pattern;
            input.dispatchEvent(new Event('input'));
            close();
        }}, h('code', {}, p.pattern), _(p.name)));
    }
    menu.append(h('h3', {}, _('Tokens')));
    for (const tk of TOKENS) {
        menu.append(h('button', {type: 'button', onclick: () => {
            const at = input.selectionStart ?? input.value.length;
            input.setRangeText(tk.token, at, input.selectionEnd ?? at, 'end');
            input.dispatchEvent(new Event('input'));
            input.focus();
            close();
        }}, h('code', {}, tk.token), _(tk.desc)));
    }
    const box = anchor.getBoundingClientRect();
    menu.style.top = `${box.bottom + scrollY + 4}px`;
    menu.style.insetInlineEnd = `${Math.max(8, document.documentElement.clientWidth - box.right)}px`;
    menu.style.right = document.documentElement.dir === 'rtl' ? 'auto' : `${Math.max(8, document.documentElement.clientWidth - box.right)}px`;
    if (document.documentElement.dir === 'rtl')
        menu.style.left = `${box.left}px`;
    document.body.append(menu);
    setTimeout(() => document.addEventListener('click', outside, true));
}

function formatsPage() {
    const today = engine.todayJdn();
    const now = RojEngine.clock();
    const time = {hour: now.getHours(), minute: now.getMinutes(), second: now.getSeconds()};
    const patternRows = PATTERNS.map(spec => {
        const preview = h('span', {class: 'opt-preview'});
        const show = value => {
            const r = engine.tryFormat(today, spec.calendar ?? 'kurdish', value, time);
            preview.innerHTML = `<bdi>${esc(r.ok ? r.text : r.error ?? '⚠')}</bdi>`;
        };
        let timer = 0;
        const input = h('input', {type: 'text', value: settings[spec.key], spellcheck: false, dir: 'ltr', 'aria-label': _(spec.title),
            oninput: e => {
                show(e.target.value);
                clearTimeout(timer);
                timer = setTimeout(() => update(spec.key, e.target.value, {rerender: false}), 400);
            }});
        show(settings[spec.key]);
        const menuButton = iconButton('list', _('Insert a token or a preset'), e => insertMenu(input, e.currentTarget));
        return [
            h('div', {class: 'opt-row', style: 'flex-direction:column;align-items:stretch;gap:6px'},
                h('div', {class: 'opt-row-title'}, _(spec.title)),
                h('div', {class: 'opt-pattern'}, input, menuButton, iconButton('undo', _('Restore the default'), () => update(spec.key, DEFAULTS[spec.key])))),
            row(_('Preview'), null, preview),
        ];
    }).flat();

    const table = h('table', {class: 'opt-tokens'},
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, ''), CALENDARS.map(c => h('th', {}, _(CALENDAR_LABELS[c]))))),
        h('tbody', {}, TOKENS.map(tk => h('tr', {},
            h('td', {}, h('button', {type: 'button', class: 'btn', title: _('Copy {token}', {token: tk.token}), onclick: async () => {
                try {
                    await navigator.clipboard.writeText(tk.token);
                    toast(_('Copied {token}', {token: tk.token}));
                } catch {}
            }}, h('code', {}, tk.token))),
            h('td', {}, _(tk.desc)),
            CALENDARS.map(c => {
                const r = engine.tryFormat(today, c, tk.token, time);
                return h('td', {html: `<bdi>${esc(r.ok ? r.text : '')}</bdi>`});
            })))));
    return [
        group(_('Patterns'), _('Patterns use the same strftime tokens as tsroj and pyroj. Use the list button to insert a token or choose a preset; the preview updates as you type.'), ...patternRows),
        h('section', {class: 'opt-group'},
            h('h2', {}, _('Token reference')),
            h('p', {class: 'opt-desc'}, _('Every token, shown for today in all four calendars with your current languages and options.')),
            h('div', {class: 'opt-rows', style: 'overflow-x:auto'}, table),
            h('p', {class: 'opt-desc', style: 'margin-top:8px'}, _('Sorani ezafe (ی) is added only when the pattern has a day and a month name, and only for the calendars where it is switched on.'))),
    ];
}

function errorText(message) {
    if (message === 'cors')
        return _('This server does not let web pages read it. Use the browser extension, or download the file and add it with File….');
    if (message === 'missing')
        return _('The file is not kept in this browser. Add it again with File….');
    return message;
}

async function setSources(sources) {
    await update('event-sources', JSON.stringify(sources), {rerender: false});
    await refreshEvents();
}

async function refreshEvents(force = false) {
    const result = await loadEvents(engine, settings, {force});
    events = {errors: result.errors, info: result.info};
    if (page === 'events')
        render();
}

async function addSource(source, text = null) {
    const sources = eventSources(settings);
    if (source.kind === 'url' && sources.some(s => s.kind === 'url' && s.location === source.location)) {
        toast(_('That calendar is already added'));
        return;
    }
    if (text !== null)
        await storeFile(source.id, text);
    sources.push(source);
    await setSources(sources);
    toast(_('Added {name}', {name: source.name || source.location}));
}

const newId = () => `src-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const nextColor = () => PALETTE[(eventSources(settings).length - 1 + PALETTE.length) % PALETTE.length];

async function addFeed(url, name = '') {
    url = url.trim();
    if (!validFeedUrl(url)) {
        toast(_('The link must start with https://, http:// or webcal://'));
        return;
    }
    if (!await requestOrigin(url.replace(/^webcal:/i, 'https:'))) {
        toast(_('Roj was not allowed to read that address'));
        return;
    }
    await addSource({id: newId(), kind: 'url', location: url, name, enabled: true, color: nextColor()});
}

async function addFile() {
    const file = await pickFile('.json,.ics,application/json,text/calendar');
    if (!file)
        return;
    try {
        const text = await file.text();
        const {parseEventsDocument} = await import('../lib/events.js');
        parseEventsDocument(text, file.name);
        await addSource({id: newId(), kind: 'file', location: file.name, enabled: true, color: nextColor()}, text);
    } catch (e) {
        toast(_('Could not add {name}: {error}', {name: file.name, error: e.message}));
    }
}

function sourceRow(source, index) {
    const info = events?.info.get(source.id);
    const error = events?.errors.get(source.id);
    const all = eventSources(settings);
    const change = patch => {
        const next = eventSources(settings);
        next[index] = {...next[index], ...patch};
        setSources(next);
    };
    let title;
    if (source.kind === 'builtin')
        title = _('Kurdish events (included)');
    else
        title = info?.name || source.name || source.location;
    let subtitle;
    if (source.enabled === false)
        subtitle = _('Off');
    else if (error)
        subtitle = null;
    else if (info)
        subtitle = _('{count} events', {count: engine.number(info.count)});
    else
        subtitle = _('Loading…');
    const holidayToggle = h('label', {class: 'opt-days', title: _('Treat every event in this calendar as a holiday')},
        h('label', {}, h('input', {type: 'checkbox', checked: Boolean(source.allHolidays), onchange: e => change({allHolidays: e.target.checked})}), _('Holiday')));
    return h('div', {class: 'opt-row'},
        h('input', {type: 'color', value: source.color ?? '#F5CD0E', title: _('Colour of the event marker'), 'aria-label': _('Colour of the event marker'),
            onchange: e => change({color: e.target.value.toUpperCase()})}),
        h('div', {class: 'opt-row-text'},
            h('div', {class: 'opt-row-title'}, title),
            source.kind === 'url' ? h('div', {class: 'opt-row-sub', dir: 'ltr', style: 'overflow-wrap:anywhere'}, source.location) : null,
            subtitle ? h('div', {class: 'opt-row-sub'}, subtitle) : null,
            error ? h('div', {class: 'opt-row-error'}, errorText(error)) : null),
        source.kind !== 'builtin' ? holidayToggle : null,
        source.kind === 'builtin'
            ? h('a', {class: 'btn icon', href: assetUrl(BUILTIN_PATH), target: '_blank', rel: 'noopener', title: _('Open the included file'), 'aria-label': _('Open the included file'), html: icon('open')})
            : iconButton('remove', _('Remove'), async () => {
                const name = title;
                const ok = await choose(_('Remove this calendar?'), _('{name} will no longer be shown. The file itself is not deleted.', {name}),
                    [{label: _('Cancel'), value: false}, {label: _('Remove'), value: true, cls: 'danger'}]);
                if (!ok)
                    return;
                await forgetSource(source.id);
                await setSources(all.filter(s => s.id !== source.id));
            }),
        switchFor('__none', on => change({enabled: on})));
}

function eventsPage() {
    const sources = eventSources(settings);
    const rows = sources.map((s, i) => {
        const r = sourceRow(s, i);
        r.querySelector('.opt-switch input').checked = s.enabled !== false;
        return r;
    });
    return [
        group(_('Display'), _('The toolbar button can also show today’s events: see Appearance, Toolbar button.'),
            row(_('Show events'), _('Lists the selected day’s events in the popup'), switchFor('events-enabled', async on => {
                await update('events-enabled', on, {rerender: false});
                await refreshEvents();
            })),
            row(_('Mark days that have events'), _('A small dot in the corner of the day card'), switchFor('show-event-dots')),
            row(_('Colour holidays'), _('Days off are tinted like weekends'), switchFor('highlight-holidays')),
            row(_('Refresh online calendars every'), _('Hours. Downloaded calendars are kept for offline use.'), numberFor('ics-refresh-hours', 1, 168),
                button(_('Refresh now'), async () => {
                    toast(_('Refreshing calendars…'));
                    await refreshEvents(true);
                    pingBackground({type: 'refresh'});
                }, {iconName: 'refresh'}))),
        group(_('Sources'), _('Kurdish events are included. Add your own events as a JSON file, or any calendar as an .ics file or link, such as the public holidays of a country.'),
            ...rows,
            row(_('Add a calendar'), _('A JSON or .ics file, or an online calendar'),
                button(_('File…'), addFile, {iconName: 'add'}),
                button(_('Online…'), async () => {
                    const url = await ask(_('Add an online calendar'), _('Paste the address of an .ics calendar.'), 'https://…/calendar.ics');
                    if (url)
                        await addFeed(url);
                }, {iconName: 'add'}))),
        group(_('Add an online calendar'), null, ...SUGGESTED_FEEDS.map(f => row(_(f.name), null,
            button(_('Add'), () => addFeed(f.url, _(f.name)), {iconName: 'add'})))),
        h('section', {class: 'opt-group'},
            h('h2', {}, _('Writing your own events')),
            h('p', {class: 'opt-desc'}, _('A JSON file lists events by calendar, month and day. A title can be one text, or one per language.')),
            h('pre', {class: 'opt-code'}, JSON.stringify(EXAMPLE, null, 2)),
            h('p', {class: 'opt-desc', style: 'margin-top:8px'}, _('calendar: kurdish, gregorian, persian or islamic. year: leave it out for every year. holiday: true colours the day like a weekend. Titles can be ckb, kmr, en, fa and ar. time and description are optional.')),
            h('div', {class: 'opt-rows'},
                row(_('Example file'), _('A starting point with one event in each calendar'),
                    button(_('Save…'), () => download('my-events.json', `${JSON.stringify(EXAMPLE, null, 2)}\n`))),
                h('a', {class: 'opt-row', href: `${DOCS_URL}#events`, target: '_blank', rel: 'noopener'},
                    h('div', {class: 'opt-row-text'}, h('div', {class: 'opt-row-title'}, _('Full reference')), h('div', {class: 'opt-row-sub'}, _('Event format, .ics support and examples'))),
                    h('span', {html: icon('open')})))),
    ];
}

const iso = (y, m, d) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function converterPage() {
    converter.jdn ??= engine.todayJdn();
    const today = engine.todayJdn();
    const [y, m, d] = engine.dateIn(converter.calendar, converter.jdn);
    const error = h('div', {class: 'opt-row-error', hidden: true});
    const set = jdn => {
        converter.jdn = jdn;
        render();
    };
    const fromParts = (yy, mm, dd) => {
        try {
            const length = engine.monthLength(converter.calendar, yy, mm);
            set(engine.toJdn(converter.calendar, yy, mm, Math.min(Math.max(dd, 1), length)));
        } catch {
            error.hidden = false;
            error.textContent = _('Use the form YYYY-MM-DD, for example 2726-01-01');
        }
    };
    const quick = h('input', {type: 'text', dir: 'ltr', value: iso(y, m, d), placeholder: 'YYYY-MM-DD', 'aria-label': _('Type a date (YYYY-MM-DD)'),
        onchange: e => {
            const match = /^\s*(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,2})\s*$/.exec(e.target.value);
            if (!match) {
                error.hidden = false;
                error.textContent = _('Use the form YYYY-MM-DD, for example 2726-01-01');
                return;
            }
            fromParts(+match[1], +match[2], +match[3]);
        }});
    const part = (label, value, min, max, which) => row(label, null, h('input', {type: 'number', min, max, value, onchange: e => {
        const v = [y, m, d];
        v[which] = Number(e.target.value);
        fromParts(...v);
    }}));
    const days = converter.jdn - today;
    let relative = _('Today');
    if (days > 0)
        relative = _('In {n} days', {n: engine.number(days)});
    else if (days < 0)
        relative = _('{n} days ago', {n: engine.number(-days)});
    const [ky, km] = engine.dateIn('kurdish', converter.jdn);
    const results = CALENDARS.map(c => {
        const text = engine.format(converter.jdn, c, settings[`header-format-${c}`]);
        const [cy, cm, cd] = engine.dateIn(c, converter.jdn);
        return row(_(CALENDAR_LABELS[c]), null,
            h('span', {class: 'opt-row-value', html: `<bdi>${esc(text)}</bdi>`}),
            h('code', {class: 'opt-row-value', dir: 'ltr'}, iso(cy, cm, cd)),
            iconButton('copy', _('Copy'), async () => {
                try {
                    await navigator.clipboard.writeText(text);
                    toast(_('Copied to the clipboard'));
                } catch {}
            }));
    });
    return [
        group(_('Date'), _('Choose the calendar your date is in, then set the year, month and day, or type it as YYYY-MM-DD.'),
            row(_('Calendar'), null, h('select', {onchange: e => {
                converter.calendar = e.target.value;
                render();
            }}, CALENDARS.map(c => h('option', {value: c, selected: c === converter.calendar}, _(CALENDAR_LABELS[c])))),
            button(_('Today'), () => set(engine.todayJdn()), {iconName: 'today'})),
            row(_('Type a date (YYYY-MM-DD)'), null, quick),
            part(_('Year'), y, 1, 9999, 0),
            part(_('Month'), m, 1, 12, 1),
            part(_('Day'), d, 1, engine.monthLength(converter.calendar, y, m), 2),
            error),
        group(_('In every calendar'), null, ...results),
        group(_('Details'), null,
            row(_('Weekday'), null, h('span', {class: 'opt-row-value'}, engine.format(converter.jdn, 'kurdish', '%A'))),
            row(_('From today'), null, h('span', {class: 'opt-row-value'}, relative)),
            row(_('Kurdish month'), null, h('span', {class: 'opt-row-value'},
                _('Month {month}, {days} days', {month: engine.number(km), days: engine.number(engine.monthLength('kurdish', ky, km))}))),
            row(_('Julian Day Number'), null, h('code', {class: 'opt-row-value'}, String(Math.floor(converter.jdn + 0.5))))),
    ];
}

function link(title, subtitle, href) {
    return h('a', {class: 'opt-row', href, target: '_blank', rel: 'noopener'},
        h('div', {class: 'opt-row-text'}, h('div', {class: 'opt-row-title'}, title), subtitle ? h('div', {class: 'opt-row-sub', dir: 'auto'}, subtitle) : null),
        h('span', {html: icon('open')}));
}

function aboutPage() {
    const bare = url => url.replace(/^https:\/\//, '').replace(/\/$/, '');
    return [
        h('div', {class: 'opt-hero'},
            h('img', {src: 'icons/roj-128.png', alt: ''}),
            h('h1', {}, 'Roj'),
            h('span', {class: 'opt-pill'}, _('Version {version}', {version: VERSION})),
            h('p', {}, _('Roj means both sun and day in Kurdish. It shows the Kurdish solar calendar in your browser, with the Gregorian, Persian and Islamic dates beside it.'))),
        group(_('Project'), null,
            link(_('The name and the logo'), _('Why Roj, the deq tattoo and the sun of the Kurdistan flag'), STORY_URL),
            link(_('Made by {author}', {author: AUTHOR}), bare(AUTHOR_URL), AUTHOR_URL),
            link(_('Source code'), bare(REPO_URL), REPO_URL),
            link(_('Website'), bare(SITE_URL), SITE_URL),
            link(_('Roj on GNOME Extensions'), bare(EGO_URL), EGO_URL),
            link(_('Documentation'), _('Guide, event format and command line'), DOCS_URL),
            link(_('What’s new'), _('The changelog of every version'), CHANGELOG_URL),
            link(_('Report a problem or suggest an idea'), bare(ISSUES_URL), ISSUES_URL)),
        group(_('Command-line tool'), _('roj prints the same dates in a terminal, with the same engine and your settings.'),
            link(_('How to install'), `${bare(DOCS_URL)}#cli`, `${DOCS_URL}#cli`)),
        group(_('Credits'), null,
            link(`tsroj ${TSROJ_VERSION}`, _('The calendar engine (TypeScript), with the same logic as pyroj'), TSROJ_URL),
            link('pyroj', _('The Python edition of the engine'), PYROJ_URL),
            row('Manrope · Vazirmatn · Estedad · Sahel', _('Fonts under the SIL Open Font License 1.1')),
            link(_('Licence'), 'GPL-3.0-or-later', `${REPO_URL}/blob/main/LICENSE`)),
    ];
}

const RENDER = {general: generalPage, appearance: appearancePage, formats: formatsPage, events: eventsPage, converter: converterPage, about: aboutPage};

function setup() {
    engine = new RojEngine(engineOptions(settings));
    _ = translator(uiLanguage(settings));
    const lang = uiLanguage(settings);
    document.documentElement.lang = lang;
    document.documentElement.dir = ['ckb', 'fa', 'ar'].includes(lang) ? 'rtl' : 'ltr';
}

function render() {
    const nav = document.getElementById('nav');
    nav.replaceChildren(...PAGES.map(p => h('a', {href: `#${p.id}`, 'aria-current': p.id === page ? 'page' : null, html: `${icon(p.id)}<span>${esc(_(p.title))}</span>`})));
    const main = document.getElementById('main');
    const scroll = scrollY;
    const title = PAGES.find(p => p.id === page).title;
    main.replaceChildren(page === 'about' ? '' : h('h1', {}, _(title)), ...RENDER[page]().filter(Boolean));
    document.title = `Roj · ${_(title)}`;
    scrollTo(0, scroll);
}

async function reload() {
    settings = await loadSettings();
    setup();
    await applyLook(settings);
    render();
    pingBackground({type: 'refresh'});
    refreshEvents().catch(() => {});
}

function route() {
    const id = location.hash.slice(1);
    page = PAGES.some(p => p.id === id) ? id : 'general';
    render();
    scrollTo(0, 0);
}

if (!isExtension) {
    const brand = document.getElementById('brand');
    brand.href = './';
}
addEventListener('hashchange', route);
await reload();
route();
onStoreChanged(async () => {
    const fresh = await loadSettings();
    if (JSON.stringify(fresh) === JSON.stringify(settings))
        return;
    // Another page changed something: follow it, unless a pattern is being typed.
    if (document.activeElement?.matches('input[type="text"]'))
        return;
    await reload();
});
