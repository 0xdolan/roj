#!/usr/bin/env node
// Lists every interface message used in the code and checks each catalog in
// extension/locale/. Exits with status 1 when a catalog misses a message.
//
//   node scripts/i18n-check.mjs            report
//   node scripts/i18n-check.mjs --list     print all messages as JSON

import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dirs = ['extension/ui', 'extension/prefs', 'extension/lib'];
const CALL = /(?:\b_|\bN_|\._t|\b_t)\(\s*'((?:[^'\\]|\\.)*)'/g;

function files(dir) {
    return readdirSync(join(root, dir)).flatMap(name => {
        const path = join(dir, name);
        return statSync(join(root, path)).isDirectory() ? files(path) : path.endsWith('.js') ? [path] : [];
    });
}

const messages = new Map();
for (const file of dirs.flatMap(files)) {
    const text = readFileSync(join(root, file), 'utf8');
    for (const match of text.matchAll(CALL)) {
        const message = match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
        if (!messages.has(message))
            messages.set(message, file);
    }
}

if (process.argv.includes('--list')) {
    console.log(JSON.stringify([...messages.keys()], null, 2));
    process.exit(0);
}

let missingTotal = 0;
for (const lang of ['ckb', 'kmr', 'fa', 'ar']) {
    const {default: catalog} = await import(join(root, 'extension/locale', `${lang}.js`));
    const missing = [...messages.keys()].filter(m => !catalog[m]);
    const unused = Object.keys(catalog).filter(m => !messages.has(m));
    const placeholders = Object.entries(catalog).filter(([m, t]) => {
        const want = (m.match(/\{\w+\}/g) ?? []).sort().join();
        return (t.match(/\{\w+\}/g) ?? []).sort().join() !== want;
    });
    missingTotal += missing.length + placeholders.length;
    console.log(`${lang}: ${messages.size - missing.length}/${messages.size} translated` +
        `${unused.length ? `, ${unused.length} unused` : ''}${placeholders.length ? `, ${placeholders.length} with wrong placeholders` : ''}`);
    for (const m of missing)
        console.log(`  missing: ${JSON.stringify(m)}`);
    for (const [m] of placeholders)
        console.log(`  placeholders differ: ${JSON.stringify(m)}`);
    for (const m of unused)
        console.log(`  unused: ${JSON.stringify(m)}`);
}
process.exit(missingTotal ? 1 : 0);
