#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// "Kurdish" in Persian and Arabic is written the Kurdish way, with و:
// کوردی, کوردستان, الكوردية, كوردستان; never کردی, کردستان, الكردية, كردستان.
// The standalone label "Kurdish" is کوردی in both. This checks the Persian and
// Arabic catalogs and the fa and ar texts of every events file. Sorani text is
// not checked: there کرد is the verb "did".
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// کرد or كرد as a whole word with a Kurdish-word ending, so the Persian verb
// (کرد, کردن, کرده) is not matched.
const WRONG = /(?<!\p{L})(?:ال|بال|و|ل)?[کك]رد(?:ی|ي|ية|یه|يه|ستان|ها)(?!\p{L})/gu;
const problems = [];

function check(file, text, where) {
    for (const m of text.matchAll(WRONG))
        problems.push(`${file}: ${where}: "${m[0]}" (write it with و, as in کوردی)`);
}

for (const lang of ['fa', 'ar']) {
    const file = `extension/locale/${lang}.js`;
    readFileSync(join(ROOT, file), 'utf8').split('\n').forEach((line, i) => {
        const value = /^\s*".*?":\s*(".*")/.exec(line)?.[1];
        if (value)
            check(file, value, `line ${i + 1}`);
    });
    const label = (await import(join(ROOT, file))).default.Kurdish;
    if (label !== 'کوردی')
        problems.push(`${file}: "Kurdish" must be کوردی, not ${label}`);
}

for (const file of ['extension/data/events/kurdish.json']) {
    const {events, name} = JSON.parse(readFileSync(join(ROOT, file), 'utf8'));
    for (const [i, ev] of [{title: name}, ...events].entries()) {
        for (const field of ['title', 'description']) {
            for (const lang of ['fa', 'ar']) {
                const text = ev[field]?.[lang];
                if (text)
                    check(file, text, `${ev.id ?? (i ? `event ${i}` : 'name')} ${field}.${lang}`);
            }
        }
    }
}

if (problems.length) {
    console.error(problems.join('\n'));
    console.error(`\n${problems.length} Persian or Arabic "Kurdish" spelled without و (see CONTRIBUTING.md)`);
    process.exit(1);
}
console.log('Kurdish spelling: ok');
