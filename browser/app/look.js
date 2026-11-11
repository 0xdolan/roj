// SPDX-License-Identifier: GPL-3.0-or-later
// Theme, fonts and text size for the popup and the options page.
//
// Fonts follow the GNOME extension: Arabic-script text (Sorani, Persian,
// Arabic) uses the right-to-left font, everything else the left-to-right one.
// In CSS this is one family, "Roj Text", made of two faces split by
// unicode-range, with the same Arabic blocks as extension/lib/richtext.js.

import {BUNDLED_FONTS} from '../lib/constants.js';
import {customFonts} from './settings.js';
import {assetUrl, readLocal} from './store.js';

const ARABIC_RANGE = 'U+0600-06FF, U+0750-077F, U+0870-089F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF';
const LATIN_RANGE = 'U+0000-05FF, U+0700-074F, U+0780-086F, U+0900-FB4F, U+FE00-FE6F, U+FF00-10FFFF';
const fontUrls = new Map();

export function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark')
        root.dataset.theme = theme;
    else
        delete root.dataset.theme;
}

const cssString = s => `"${String(s).replace(/["\\]/g, '\\$&')}"`;

async function sourcesFor(family, settings) {
    const bundled = BUNDLED_FONTS.filter(f => f.family === family);
    if (bundled.length) {
        return bundled.map(f => ({
            src: `url(${cssString(assetUrl(`fonts/${f.file}`))})`,
            weight: /Bold/.test(f.file) ? '700' : bundled.length > 1 ? '400' : '100 900',
        }));
    }
    const loaded = customFonts(settings).find(f => f.family === family);
    if (loaded) {
        let url = fontUrls.get(loaded.id);
        if (!url) {
            const data = await readLocal(`font:${loaded.id}`);
            if (data) {
                url = URL.createObjectURL(new Blob([Uint8Array.from(atob(data), c => c.charCodeAt(0))]));
                fontUrls.set(loaded.id, url);
            }
        }
        if (url)
            return [{src: `url(${cssString(url)})`, weight: '100 900'}];
    }
    // Any font installed on this computer, by name.
    return [{src: `local(${cssString(family)})`, weight: '100 900'}];
}

export async function applyFonts(settings) {
    const faces = [];
    for (const [key, range] of [['latin-font', LATIN_RANGE], ['arabic-font', ARABIC_RANGE]]) {
        for (const {src, weight} of await sourcesFor(settings[key], settings))
            faces.push(`@font-face { font-family: "Roj Text"; src: ${src}; font-weight: ${weight}; unicode-range: ${range}; font-display: swap; }`);
    }
    let style = document.getElementById('roj-fonts');
    if (!style) {
        style = document.createElement('style');
        style.id = 'roj-fonts';
        document.head.append(style);
    }
    style.textContent = faces.join('\n');
    document.documentElement.style.setProperty('--roj-scale', String(settings['font-scale']));
}

export async function applyLook(settings) {
    applyTheme(settings.theme);
    await applyFonts(settings);
}

/** Read a font file into base64 for local storage, and its family name from the name table. */
export async function readFontFile(file) {
    const buffer = await file.arrayBuffer();
    const family = fontFamilyName(new DataView(buffer));
    if (!family)
        throw new Error('name');
    const face = new FontFace('Roj Probe', buffer);
    await face.load();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return {family, data: btoa(binary)};
}

/** The family name (name ID 16, else 1) from a TrueType/OpenType file. */
export function fontFamilyName(view) {
    try {
        const tables = view.getUint16(4);
        for (let i = 0; i < tables; i++) {
            const rec = 12 + i * 16;
            const tag = String.fromCharCode(...[0, 1, 2, 3].map(j => view.getUint8(rec + j)));
            if (tag !== 'name')
                continue;
            const offset = view.getUint32(rec + 8);
            const count = view.getUint16(offset + 2);
            const strings = offset + view.getUint16(offset + 4);
            const found = {};
            for (let n = 0; n < count; n++) {
                const r = offset + 6 + n * 12;
                const platform = view.getUint16(r);
                const id = view.getUint16(r + 6);
                const length = view.getUint16(r + 8);
                const start = strings + view.getUint16(r + 10);
                if (id !== 1 && id !== 16)
                    continue;
                let text = '';
                if (platform === 0 || platform === 3) {
                    for (let k = 0; k < length; k += 2)
                        text += String.fromCharCode(view.getUint16(start + k));
                } else {
                    for (let k = 0; k < length; k++)
                        text += String.fromCharCode(view.getUint8(start + k));
                }
                found[id] ??= text.trim();
            }
            return found[16] || found[1] || null;
        }
    } catch {
        // not a font
    }
    return null;
}
