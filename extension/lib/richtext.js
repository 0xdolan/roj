// SPDX-License-Identifier: GPL-3.0-or-later
// Script-aware font selection. Text is split into runs: anything in the Arabic
// Unicode blocks (used by Sorani, Persian and Arabic) gets the RTL font, every
// other letter gets the LTR font. Neutral characters (spaces, digits,
// punctuation, ZWNJ) stay with the run they follow so shaping is never broken.

const ARABIC = /[؀-ۿݐ-ݿࡰ-࢟ࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const LETTER = /\p{L}/u;

export function isArabicScript(ch) {
    return ARABIC.test(ch);
}

/** Whether a string contains any Arabic-script character. */
export function hasArabicScript(text) {
    return ARABIC.test(text);
}

/** Split `text` into `[{text, rtl}]` runs by script. */
export function scriptRuns(text) {
    const runs = [];
    let current = null;
    for (const ch of String(text)) {
        let rtl;
        if (isArabicScript(ch))
            rtl = true;
        else if (LETTER.test(ch))
            rtl = false;
        else
            rtl = current ? current.rtl : null; // neutral

        if (current && (current.rtl === rtl || rtl === null)) {
            current.text += ch;
        } else if (current && current.rtl === null) {
            // Leading neutrals adopt the script of the first strong character.
            current.rtl = rtl;
            current.text += ch;
        } else {
            current = {text: ch, rtl};
            runs.push(current);
        }
    }
    for (const run of runs) {
        if (run.rtl === null)
            run.rtl = false;
    }
    return runs;
}

/**
 * Wrap text in a Unicode first-strong isolate (FSI … PDI) so that, inside a
 * line mixing scripts, it is laid out on its own and never reorders with its
 * neighbours (e.g. a Sorani date next to a Kurmanji one).
 */
export function isolate(text) {
    return `\u2068${text}\u2069`;
}

/** Force a left-to-right paragraph (for English UI lines that embed dates). */
export function ltrLine(text) {
    return `\u200E${text}`;
}

export function escapeMarkup(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Pango markup applying `fonts.latin` / `fonts.arabic` per script run.
 * Extra span attributes (e.g. `{weight: 'bold'}`) apply to every run.
 */
export function fontMarkup(text, fonts, attrs = {}) {
    const extra = Object.entries(attrs)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => ` ${k}="${escapeMarkup(v)}"`)
        .join('');
    return scriptRuns(text).map(run => {
        const family = run.rtl ? fonts.arabic : fonts.latin;
        const face = family ? ` font_family="${escapeMarkup(family)}"` : '';
        return `<span${face}${extra}>${escapeMarkup(run.text)}</span>`;
    }).join('');
}
