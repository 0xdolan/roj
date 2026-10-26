// SPDX-License-Identifier: GPL-3.0-or-later
// Roj: the Kurdish solar calendar for the GNOME Shell top bar.

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {RojIndicator} from './ui/indicator.js';

export default class RojExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._addIndicator();
        this._settings.connectObject(
            'changed::panel-position', () => this._addIndicator(),
            'changed::panel-index', () => this._addIndicator(),
            this);
    }

    disable() {
        this._settings?.disconnectObject(this);
        this._settings = null;
        this._indicator?.destroy();
        this._indicator = null;
    }

    _addIndicator() {
        this._indicator?.destroy();
        this._indicator = new RojIndicator(this);
        Main.panel.addToStatusArea(
            this.uuid,
            this._indicator,
            this._settings.get_int('panel-index'),
            this._settings.get_string('panel-position'));
    }
}
