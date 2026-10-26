// SPDX-License-Identifier: GPL-3.0-or-later
// One cell of the month grid: the Kurdish day number, plus up to three small
// numbers for the Gregorian, Persian and Islamic days in the same size.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {SECONDARY_CALENDARS} from '../lib/engine.js';
import {setRichText} from './text.js';

// In "corners" layout each calendar has a fixed corner (mirrored in RTL).
const CORNERS = {
    gregorian: [Clutter.ActorAlign.END, Clutter.ActorAlign.START],
    persian: [Clutter.ActorAlign.START, Clutter.ActorAlign.END],
    islamic: [Clutter.ActorAlign.END, Clutter.ActorAlign.END],
};

export const DayCard = GObject.registerClass({
    Signals: {'day-activated': {param_types: [GObject.TYPE_DOUBLE]}},
}, class DayCard extends St.Button {
    _init() {
        super._init({
            style_class: 'roj-day',
            can_focus: true,
            x_expand: true,
            y_expand: true,
        });
        this.jdn = 0;

        this._content = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
        });
        this.set_child(this._content);

        this._main = new St.Label({
            style_class: 'roj-day-number',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
        });
        this._content.add_child(this._main);

        this._dot = new St.Widget({
            style_class: 'roj-day-dot',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.START,
            x_expand: true,
            y_expand: true,
            visible: false,
        });
        this._content.add_child(this._dot);

        this._row = new St.BoxLayout({
            style_class: 'roj-day-secondary',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.END,
            x_expand: true,
            y_expand: true,
        });
        this._content.add_child(this._row);

        this._subs = {};
        for (const cal of SECONDARY_CALENDARS) {
            this._subs[cal] = new St.Label({
                style_class: `roj-sub roj-sub-${cal}`,
                x_expand: true,
                y_expand: true,
            });
        }

        this.connect('clicked', () => this.emit('day-activated', this.jdn));
    }

    /**
     * @param {object} p
     * @param {object} p.cell month-grid cell from RojEngine.monthGrid
     * @param {RojEngine} p.engine
     * @param {string[]} p.secondaries enabled secondary calendars, in order
     * @param {'row'|'corners'} p.layout
     * @param {object} p.fonts
     * @param {object} p.state {today, selected, weekend, holiday, events}
     */
    update({cell, engine, secondaries, layout, fonts, state}) {
        this.jdn = cell.jdn;
        setRichText(this._main, engine.number(cell.dates.kurdish[2], 'kurdish'), fonts);

        this._placeSecondaries(secondaries, layout);
        for (const cal of secondaries)
            setRichText(this._subs[cal], engine.number(cell.dates[cal][2], cal), fonts);

        this._dot.visible = state.events;
        const classes = {
            'roj-day-outside': !cell.inMonth,
            'roj-day-today': state.today,
            'roj-day-selected': state.selected,
            'roj-day-weekend': state.weekend,
            'roj-day-holiday': state.holiday,
            'roj-day-has-sub': secondaries.length > 0,
            'roj-day-corners': layout === 'corners',
        };
        for (const [name, on] of Object.entries(classes)) {
            if (on)
                this.add_style_class_name(name);
            else
                this.remove_style_class_name(name);
        }
    }

    _placeSecondaries(secondaries, layout) {
        const key = `${layout}:${secondaries.join(',')}`;
        if (key === this._placement)
            return;
        this._placement = key;

        for (const label of Object.values(this._subs))
            label.get_parent()?.remove_child(label);

        for (const cal of secondaries) {
            const label = this._subs[cal];
            if (layout === 'corners') {
                const [x, y] = CORNERS[cal];
                label.x_align = x;
                label.y_align = y;
                this._content.add_child(label);
            } else {
                label.x_align = Clutter.ActorAlign.CENTER;
                label.y_align = Clutter.ActorAlign.END;
                this._row.add_child(label);
            }
        }
        this._row.visible = layout !== 'corners' && secondaries.length > 0;
    }
});
