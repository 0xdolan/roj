// SPDX-License-Identifier: GPL-3.0-or-later
// Development helper, never shipped. Runs inside a headless GNOME Shell started
// by scripts/sandbox.sh and executes a JSON "plan": change settings, open the
// Roj popup or preferences, take screenshots, then quit the shell.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

Gio._promisify(Shell.Screenshot.prototype, 'screenshot_area', 'screenshot_area_finish');
Gio._promisify(Shell.Screenshot.prototype, 'screenshot_stage_to_content', 'screenshot_stage_to_content_finish');

const ROJ = 'roj@0xdolan.github.io';
const sleep = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => r() ?? GLib.SOURCE_REMOVE));

function log(msg) {
    const path = GLib.getenv('ROJ_DEVTOOLS_LOG');
    console.log(`[roj-devtools] ${msg}`);
    if (path) {
        const stream = Gio.File.new_for_path(path).append_to(Gio.FileCreateFlags.NONE, null);
        stream.write_all(new TextEncoder().encode(`${msg}\n`), null);
        stream.close(null);
    }
}

export default class DevTools extends Extension {
    enable() {
        const plan = GLib.getenv('ROJ_DEVTOOLS_PLAN');
        if (!plan)
            return;
        // Give the session a moment to settle before driving it.
        this._startId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2500, () => {
            this._startId = 0;
            this._run(plan).catch(e => log(`ERROR ${e.message}\n${e.stack}`)).finally(() => {
                if (GLib.getenv('ROJ_DEVTOOLS_QUIT') !== '0')
                    global.context.terminate();
            });
            return GLib.SOURCE_REMOVE;
        });
    }

    disable() {
        if (this._startId)
            GLib.source_remove(this._startId);
        this._startId = 0;
    }

    get _roj() {
        return Main.panel.statusArea[ROJ];
    }

    _settings() {
        const ext = Main.extensionManager.lookup(ROJ);
        const source = Gio.SettingsSchemaSource.new_from_directory(
            GLib.build_filenamev([ext.path, 'schemas']), Gio.SettingsSchemaSource.get_default(), false);
        return new Gio.Settings({settings_schema: source.lookup('org.gnome.shell.extensions.roj', false)});
    }

    async _run(planPath) {
        const [, bytes] = GLib.file_get_contents(planPath);
        const steps = JSON.parse(new TextDecoder().decode(bytes));
        const settings = this._settings();
        const iface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        log(`plan with ${steps.length} steps; roj indicator: ${!!this._roj}`);

        for (const step of steps) {
            if (step.wait)
                await sleep(step.wait);
            if (step.set) {
                for (const [key, text] of Object.entries(step.set)) {
                    const type = settings.settings_schema.get_key(key).get_value_type();
                    settings.set_value(key, GLib.Variant.parse(type, text, null, null));
                }
                await sleep(300);
            }
            if (step.colorScheme)
                iface.set_string('color-scheme', step.colorScheme);
            if (step.reset)
                settings.settings_schema.list_keys().forEach(k => settings.reset(k));
            if (step.open !== undefined) {
                if (step.open)
                    this._roj.menu.open(0);
                else
                    this._roj.menu.close(0);
                await sleep(600);
            }
            if (step.click) {
                // e.g. {"click": "next"} → presses a popup button by its field name
                this._roj._view[`_${step.click}`]?.emit('clicked', 1);
                await sleep(300);
            }
            if (step.select) {
                const view = this._roj._view;
                view.select(view._engine.toJdn('gregorian', ...step.select));
                await sleep(300);
            }
            if (step.prefs) {
                settings.set_string('prefs-page', step.prefs);
                if (!this._prefsOpen) {
                    GLib.spawn_command_line_sync(
                        `dbus-update-activation-environment WAYLAND_DISPLAY=${GLib.getenv('WAYLAND_DISPLAY')} GDK_BACKEND=wayland`);
                    Main.extensionManager.openExtensionPrefs(ROJ, '', {});
                    this._prefsOpen = true;
                    await sleep(step.prefsWait ?? 4000);
                }
                await sleep(800);
            }
            if (step.resize) {
                const win = this._prefsWindow();
                win.unmaximize?.();
                win.move_resize_frame(false, ...step.resize);
                await sleep(700);
            }
            if (step.eval) {
                const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
                const result = await new AsyncFunction('Main', 'roj', 'settings', step.eval)(Main, this._roj, settings);
                log(`eval: ${JSON.stringify(result)}`);
            }
            if (step.shot)
                await this._shoot(step);
        }
    }

    _prefsWindow() {
        const win = global.display.list_all_windows().find(w => /roj|kurdish/i.test(w.get_title() ?? ''));
        if (!win)
            throw new Error('preferences window not found');
        return win;
    }

    async _shoot(step) {
        let [x, y, w, h] = [0, 0, global.stage.width, global.stage.height];
        if (step.area === 'menu') {
            const menu = this._roj.menu.actor;
            const panel = Main.panel;
            const [mx, my] = menu.get_transformed_position();
            const [mw, mh] = menu.get_transformed_size();
            const m = step.margin ?? 24;
            x = Math.max(0, Math.floor(mx - m));
            y = 0;
            w = Math.min(global.stage.width - x, Math.ceil(mw + 2 * m));
            h = Math.min(global.stage.height, Math.ceil(my + mh + m));
            void panel;
        } else if (step.area === 'popup') {
            // Exactly the popup surface, without panel or wallpaper.
            const content = this._roj.menu.box;
            const [px, py] = content.get_transformed_position();
            const [pw, ph] = content.get_transformed_size();
            [x, y, w, h] = [Math.round(px), Math.round(py), Math.round(pw), Math.round(ph)];
        } else if (step.area === 'window') {
            const r = this._prefsWindow().get_frame_rect();
            [x, y, w, h] = [r.x, r.y, r.width, r.height];
        } else if (Array.isArray(step.area)) {
            [x, y, w, h] = step.area;
        }
        const shooter = new Shell.Screenshot();
        const file = Gio.File.new_for_path(step.shot);
        const stream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
        await shooter.screenshot_area(x, y, w, h, stream);
        stream.close(null);
        log(`shot ${step.shot} ${w}x${h}`);
    }
}
