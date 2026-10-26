// SPDX-License-Identifier: GPL-3.0-or-later
// Registers font files with a Pango font map so bundled and user-loaded fonts
// work without being installed. Needs Pango >= 1.56 (pango_font_map_add_font_file);
// on older systems the preferences window offers to copy them to
// ~/.local/share/fonts instead.

import GLib from 'gi://GLib';

import {BUNDLED_FONTS} from './constants.js';

// Pango cannot unregister a file, so remember what was added to each map and
// never add it twice across enable/disable cycles.
const registered = new WeakMap();

export function canRegisterFonts(fontMap) {
    return typeof fontMap?.add_font_file === 'function';
}

export function bundledFontPaths(extensionPath) {
    return BUNDLED_FONTS.map(f => GLib.build_filenamev([extensionPath, 'fonts', f.file]));
}

/** Add font files to `fontMap`. Returns the paths that failed. */
export function registerFonts(fontMap, paths) {
    if (!canRegisterFonts(fontMap))
        return [...paths];
    let done = registered.get(fontMap);
    if (!done) {
        done = new Set();
        registered.set(fontMap, done);
    }
    const failed = [];
    for (const path of paths) {
        if (done.has(path))
            continue;
        try {
            if (GLib.file_test(path, GLib.FileTest.EXISTS) && fontMap.add_font_file(path))
                done.add(path);
            else
                failed.push(path);
        } catch (e) {
            console.warn(`Roj: could not load font ${path}: ${e.message}`);
            failed.push(path);
        }
    }
    if (done.size)
        fontMap.changed?.();
    return failed;
}

/** Families known to a font map, sorted, without duplicates. */
export function listFamilies(fontMap) {
    const names = new Set(fontMap.list_families().map(f => f.get_name()));
    return [...names].sort((a, b) => a.localeCompare(b));
}
