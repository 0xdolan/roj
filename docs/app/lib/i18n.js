// SPDX-License-Identifier: GPL-3.0-or-later
// Interface translations. Every message is written in English in the code and
// looked up in extension/locale/<lang>.js; anything missing falls back to
// English. Run `make i18n` to list untranslated messages.
//
// Dates themselves are localised by the engine (tsroj); this covers the UI.

import ar from '../locale/ar.js';
import ckb from '../locale/ckb.js';
import fa from '../locale/fa.js';
import kmr from '../locale/kmr.js';

export const UI_LANGUAGES = ['en', 'ckb', 'kmr', 'fa', 'ar'];

/** Each language written in itself, for language pickers. */
export const LANGUAGE_NAMES = {
    en: 'English',
    ckb: 'کوردی (سۆرانی)',
    kmr: 'Kurdî (Kurmancî)',
    fa: 'فارسی',
    ar: 'العربية',
};

export const CATALOGS = {ckb, kmr, fa, ar};

/** Marks a message for translation where it is translated later with _(). */
export const N_ = message => message;

/** The interface language: the setting, or the date language when "auto". */
export function resolveUiLanguage(setting, dateLocale) {
    if (UI_LANGUAGES.includes(setting))
        return setting;
    return UI_LANGUAGES.includes(dateLocale) ? dateLocale : 'en';
}

/**
 * A gettext-like function for one language. Placeholders are written as
 * {name} and filled from `vars`: _('{count} events', {count: 3}).
 *
 * A message may start with a context, "context|Text", when the same English
 * word needs different translations (Persian the calendar or the language).
 * Without a translation the text after the "|" is shown.
 */
export function translator(lang) {
    const table = CATALOGS[lang] ?? {};
    return (message, vars = null) => {
        let text = table[message] || message.slice(message.indexOf('|') + 1);
        if (vars) {
            for (const [key, value] of Object.entries(vars))
                text = text.split(`{${key}}`).join(String(value));
        }
        return text;
    };
}

// Which translation of an event title to fall back to, per language.
const TITLE_FALLBACK = {
    ckb: ['ckb', 'kmr', 'en'],
    kmr: ['kmr', 'en', 'ckb'],
    en: ['en', 'kmr', 'ckb'],
    fa: ['fa', 'ckb', 'ar', 'en', 'kmr'],
    ar: ['ar', 'ckb', 'fa', 'en', 'kmr'],
};

/** Pick the best title from a {ckb, kmr, en, fa, ar} object or plain string. */
export function localizedText(value, lang) {
    if (value === null || value === undefined)
        return '';
    if (typeof value === 'string')
        return value;
    for (const key of TITLE_FALLBACK[lang] ?? [lang, 'en']) {
        if (value[key])
            return value[key];
    }
    return Object.values(value).find(v => typeof v === 'string' && v) ?? '';
}
