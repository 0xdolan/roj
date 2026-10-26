// Settings backup round-trip against the real schema. Run with:
//   GSETTINGS_BACKEND=memory gjs -m tests/config.gjs.js
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

import {exportSettings, importSettings, resetSettings, eventSources} from '../extension/lib/config.js';

const dir = GLib.filename_from_uri(import.meta.url.replace(/tests\/[^/]*$/, 'extension/schemas'))[0];
const source = Gio.SettingsSchemaSource.new_from_directory(dir, null, false);
const settings = new Gio.Settings({settings_schema: source.lookup('org.gnome.shell.extensions.roj', false)});

let failures = 0;
const check = (name, ok) => {
    print(`${ok ? 'ok' : 'FAIL'} - ${name}`);
    if (!ok)
        failures++;
};

settings.set_string('locale', 'kmr');
settings.set_boolean('card-show-islamic', true);
settings.set_value('weekend-days', new GLib.Variant('ai', [5, 6]));
settings.set_double('font-scale', 1.2);
settings.set_string('prefs-page', 'about');
const backup = exportSettings(settings);
const parsed = JSON.parse(backup);

check('backup is tagged', parsed.application === 'roj' && parsed.settings.locale === 'kmr');
check('private keys are not exported', !('prefs-page' in parsed.settings));

resetSettings(settings);
check('reset restores defaults', settings.get_string('locale') === 'ckb');

parsed.settings['font-scale'] = 9; // out of range
parsed.settings['not-a-key'] = true;
const {applied, skipped} = importSettings(settings, JSON.stringify(parsed));
check('import applies values', settings.get_string('locale') === 'kmr' && settings.get_boolean('card-show-islamic'));
check('import restores arrays', settings.get_value('weekend-days').deepUnpack().join() === '5,6');
check('out-of-range and unknown keys are skipped', skipped.includes('font-scale') && skipped.includes('not-a-key'));
check('applied count is reported', applied.length > 30);

let threw = false;
try {
    importSettings(settings, '{"hello": 1}');
} catch {
    threw = true;
}
check('foreign files are rejected', threw);

settings.set_string('event-sources', 'not json');
check('broken event-sources falls back to built-in', eventSources(settings)[0].kind === 'builtin');

System.exit(failures ? 1 : 0);
