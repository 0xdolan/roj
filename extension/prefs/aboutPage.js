// SPDX-License-Identifier: GPL-3.0-or-later
// About: identity, the story of the name and logo, links, credits, licence
// and the command-line installer.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {
    AUTHOR, AUTHOR_URL, CHANGELOG_URL, DOCS_URL, ISSUES_URL, PYROJ_URL, REPO_URL, SITE_URL,
    STORY_URL, TSROJ_URL, TSROJ_VERSION,
} from '../lib/constants.js';
import {textButton} from './common.js';

function cliTarget() {
    return GLib.build_filenamev([GLib.get_home_dir(), '.local', 'bin', 'roj']);
}

export const AboutPage = GObject.registerClass(
class RojAboutPage extends Adw.PreferencesPage {
    _init(ctx) {
        super._init({name: 'about', title: ctx._('About'), icon_name: 'help-about-symbolic'});
        this._ctx = ctx;
        this._buildHero();
        this._buildLinks();
        this._buildCli();
        this._buildCredits();
    }

    _buildHero() {
        const ctx = this._ctx;
        const _ = ctx._;
        const group = new Adw.PreferencesGroup();
        const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 8, halign: Gtk.Align.CENTER, margin_top: 12});
        box.append(new Gtk.Image({file: GLib.build_filenamev([ctx.path, 'icons', 'roj-logo.svg']), pixel_size: 128}));
        box.append(new Gtk.Label({label: 'Roj', css_classes: ['title-1']}));
        box.append(new Gtk.Label({
            label: ctx.markup('ڕۆژ · Roj · ☉'),
            use_markup: true,
            css_classes: ['dim-label'],
        }));
        box.append(new Gtk.Label({label: _('Version {version}', {version: ctx.version}), css_classes: ['roj-version-pill'], halign: Gtk.Align.CENTER}));
        box.append(new Gtk.Label({
            label: _('Roj means both sun and day in Kurdish. It shows the Kurdish solar calendar in your top bar, with the Gregorian, Persian and Islamic dates beside it.'),
            wrap: true,
            justify: Gtk.Justification.CENTER,
            max_width_chars: 60,
            margin_top: 4,
        }));
        group.add(box);
        this.add(group);
    }

    _link(group, title, subtitle, uri, icon) {
        const row = new Adw.ActionRow({title, subtitle, activatable: true});
        if (icon)
            row.add_prefix(new Gtk.Image({icon_name: icon}));
        row.add_suffix(new Gtk.Image({icon_name: 'adw-external-link-symbolic'}));
        row.connect('activated', () => this._ctx.openUri(uri));
        group.add(row);
    }

    _buildLinks() {
        const _ = this._ctx._;
        const bare = url => url.replace('https://', '');
        const group = new Adw.PreferencesGroup({title: _('Project')});
        this.add(group);
        this._link(group, _('The name and the logo'), _('Why Roj, the deq tattoo and the sun of the Kurdistan flag'), STORY_URL, 'emblem-favorite-symbolic');
        this._link(group, _('Made by {author}', {author: AUTHOR}), bare(AUTHOR_URL), AUTHOR_URL, 'avatar-default-symbolic');
        this._link(group, _('Source code'), bare(REPO_URL), REPO_URL, 'text-x-generic-symbolic');
        this._link(group, _('Website'), bare(SITE_URL), SITE_URL, 'web-browser-symbolic');
        this._link(group, _('Documentation'), _('Guide, event format and command line'), DOCS_URL, 'help-browser-symbolic');
        this._link(group, _('What’s new'), _('The changelog of every version'), CHANGELOG_URL, 'document-open-recent-symbolic');
        this._link(group, _('Report a problem or suggest an idea'), bare(ISSUES_URL), ISSUES_URL, 'dialog-warning-symbolic');
    }

    _buildCli() {
        const _ = this._ctx._;
        const group = new Adw.PreferencesGroup({
            title: _('Command-line tool'),
            description: _('roj prints the same dates in a terminal, with the same engine and your settings.'),
        });
        this.add(group);
        const row = new Adw.ActionRow({title: 'roj'});
        const button = textButton(_('Install'), () => this._installCli(row, button), ['suggested-action']);
        row.add_suffix(button);
        group.add(row);
        this._syncCli(row, button);
    }

    _syncCli(row, button) {
        const _ = this._ctx._;
        const installed = GLib.file_test(cliTarget(), GLib.FileTest.EXISTS);
        row.subtitle = installed
            ? _('Installed in {path}. Try: roj cal', {path: cliTarget().replace(GLib.get_home_dir(), '~')})
            : _('Adds a small launcher to ~/.local/bin');
        button.label = installed ? _('Reinstall') : _('Install');
    }

    _installCli(row, button) {
        const ctx = this._ctx;
        const _ = ctx._;
        const script = GLib.build_filenamev([ctx.path, 'cli', 'roj.js']);
        const launcher = [
            '#!/bin/sh',
            '# Launcher for roj, the Kurdish calendar CLI (installed from the Roj preferences).',
            `ROJ_CLI=${GLib.shell_quote(script)}`,
            'if command -v gjs >/dev/null 2>&1; then exec gjs -m "$ROJ_CLI" "$@"; fi',
            'exec node "$ROJ_CLI" "$@"',
            '',
        ].join('\n');
        try {
            const target = cliTarget();
            GLib.mkdir_with_parents(GLib.path_get_dirname(target), 0o755);
            GLib.file_set_contents(target, launcher);
            Gio.File.new_for_path(target).set_attribute_uint32('unix::mode', 0o755, Gio.FileQueryInfoFlags.NONE, null);
            ctx.toast(_('Installed. Open a new terminal and run roj.'));
        } catch (e) {
            ctx.toast(_('Could not install: {error}', {error: e.message}));
        }
        this._syncCli(row, button);
    }

    _buildCredits() {
        const _ = this._ctx._;
        const group = new Adw.PreferencesGroup({title: _('Credits')});
        this.add(group);
        this._link(group, `tsroj ${TSROJ_VERSION}`, _('The calendar engine (TypeScript), with the same logic as pyroj'), TSROJ_URL);
        this._link(group, 'pyroj', _('The Python edition of the engine'), PYROJ_URL);
        this._link(group, 'Manrope, Vazirmatn, Estedad, Sahel', _('Fonts under the SIL Open Font License 1.1'), 'https://openfontlicense.org');
        group.add(new Adw.ActionRow({
            title: _('Licence'),
            subtitle: `GNU GPL v3.0+ · © ${GLib.DateTime.new_now_local().get_year()} ${AUTHOR}`,
        }));
    }
});
