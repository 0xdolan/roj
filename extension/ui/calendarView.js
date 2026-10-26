// SPDX-License-Identifier: GPL-3.0-or-later
// The popup: selected-day header, month navigation, the day-card grid, the
// day's events, quick actions and the credits footer.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {RojEngine, SECONDARY_CALENDARS} from '../lib/engine.js';
import {fontsFromSettings, uiLanguage} from '../lib/config.js';
import {N_, localizedText, translator} from '../lib/i18n.js';
import {AUTHOR, AUTHOR_URL, DOCS_URL, REPO_URL, SITE_URL} from '../lib/constants.js';
import {DayCard} from './dayCard.js';
import {setRichText} from './text.js';

// The events area always has room for this many rows, so the popup keeps the
// same height whatever day is selected. Extra events collapse into "+N more".
const EVENT_ROWS = 3;
const TITLE_LENGTH = 46;

const CALENDAR_NAMES = {kurdish: N_('Kurdish'), gregorian: N_('Gregorian'), persian: N_('Persian'), islamic: N_('Islamic')};

function truncate(text, max) {
    const chars = [...text];
    return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : text;
}

function box(vertical, params = {}) {
    const b = new St.BoxLayout(params);
    if (b.orientation !== undefined)
        b.orientation = vertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL;
    else
        b.vertical = vertical;
    return b;
}

function iconButton(iconName, styleClass = 'roj-icon-button') {
    return new St.Button({
        style_class: styleClass,
        can_focus: true,
        child: new St.Icon({icon_name: iconName, style_class: 'roj-icon'}),
    });
}

/** Set a text direction on an actor tree, skipping subtrees pinned to LTR. */
function setDirectionDeep(actor, dir) {
    if (actor._rojFixedDirection)
        dir = actor._rojFixedDirection;
    actor.set_text_direction(dir);
    for (const child of actor.get_children())
        setDirectionDeep(child, dir);
}

export const CalendarView = GObject.registerClass(
class CalendarView extends St.BoxLayout {
    /**
     * @param {object} p
     * @param {Gio.Settings} p.settings
     * @param {RojEngine} p.engine
     * @param {import('../lib/eventStore.js').EventStore} p.events
     * @param {string} p.version
     * @param {string} p.extensionPath
     * @param {object} p.actions {openPrefs(page), openUri(uri), close()}
     */
    _init({settings, engine, events, version, extensionPath, actions}) {
        super._init({style_class: 'roj-popup'});
        if (this.orientation !== undefined)
            this.orientation = Clutter.Orientation.VERTICAL;
        else
            this.vertical = true;

        this._settings = settings;
        this._engine = engine;
        this._events = events;
        this._actions = actions;
        this._version = version;
        this._extensionPath = extensionPath;
        this._copiedId = 0;

        this._todayJdn = engine.todayJdn();
        this._selectedJdn = this._todayJdn;
        [this._viewYear, this._viewMonth] = engine.dateIn('kurdish', this._todayJdn);

        this._buildHeader();
        this._buildNavigation();
        this._buildGrid();
        this._buildLegend();
        this._buildEvents();
        this._buildActions();
        this._buildFooter();

        this.connect('destroy', () => {
            if (this._copiedId)
                GLib.source_remove(this._copiedId);
            this._copiedId = 0;
        });
        this.refresh();
    }

    // Construction
    _buildHeader() {
        this._header = box(true, {style_class: 'roj-header'});
        this.add_child(this._header);

        this._headerTitle = new St.Label({style_class: 'roj-header-title', x_expand: true});
        this._header.add_child(this._headerTitle);

        this._headerLines = {};
        const lines = box(true, {style_class: 'roj-header-lines'});
        this._header.add_child(lines);
        for (const cal of SECONDARY_CALENDARS) {
            const row = box(false, {style_class: 'roj-header-line'});
            const chip = new St.Label({
                style_class: `roj-chip roj-chip-${cal}`,
                y_align: Clutter.ActorAlign.CENTER,
            });
            const text = new St.Label({
                style_class: 'roj-header-line-text',
                y_align: Clutter.ActorAlign.CENTER,
            });
            row.add_child(chip);
            row.add_child(text);
            lines.add_child(row);
            this._headerLines[cal] = {row, chip, text};
        }
    }

    _buildNavigation() {
        const nav = box(false, {style_class: 'roj-nav'});
        this.add_child(nav);

        this._prevYear = iconButton('go-first-symbolic', 'roj-icon-button roj-nav-year');
        this._prev = iconButton('go-previous-symbolic');
        this._next = iconButton('go-next-symbolic');
        this._nextYear = iconButton('go-last-symbolic', 'roj-icon-button roj-nav-year');
        this._prevYear.connect('clicked', () => this._shift(-12));
        this._prev.connect('clicked', () => this._shift(-1));
        this._next.connect('clicked', () => this._shift(1));
        this._nextYear.connect('clicked', () => this._shift(12));

        const title = box(true, {style_class: 'roj-nav-title', x_expand: true});
        this._monthTitle = new St.Button({
            style_class: 'roj-month-title',
            x_align: Clutter.ActorAlign.CENTER,
            can_focus: true,
            child: new St.Label(),
        });
        this._monthTitle.connect('clicked', () => this.showToday());
        this._spans = box(true, {style_class: 'roj-month-spans', x_align: Clutter.ActorAlign.CENTER});
        this._spanLabels = {};
        for (const cal of SECONDARY_CALENDARS) {
            this._spanLabels[cal] = new St.Label({style_class: `roj-span roj-span-${cal}`, x_align: Clutter.ActorAlign.CENTER});
            this._spans.add_child(this._spanLabels[cal]);
        }
        title.add_child(this._monthTitle);
        title.add_child(this._spans);

        for (const child of [this._prevYear, this._prev, title, this._next, this._nextYear])
            nav.add_child(child);
    }

    _buildGrid() {
        this._weekdays = box(false, {style_class: 'roj-weekdays'});
        this._weekdayLabels = [];
        for (let i = 0; i < 7; i++) {
            const label = new St.Label({style_class: 'roj-weekday', x_expand: true});
            this._weekdayLabels.push(label);
            this._weekdays.add_child(label);
        }
        this.add_child(this._weekdays);

        this._grid = box(true, {style_class: 'roj-grid', reactive: true});
        this._cards = [];
        for (let w = 0; w < 6; w++) {
            const row = box(false, {style_class: 'roj-week'});
            for (let d = 0; d < 7; d++) {
                const card = new DayCard();
                card.connect('day-activated', (_c, jdn) => this.select(jdn));
                this._cards.push(card);
                row.add_child(card);
            }
            this._grid.add_child(row);
        }
        this._grid.connect('scroll-event', (_a, event) => this._onScroll(event));
        this.add_child(this._grid);
    }

    _buildLegend() {
        this._legend = box(false, {style_class: 'roj-legend', x_align: Clutter.ActorAlign.CENTER});
        this._legendItems = {};
        for (const cal of ['kurdish', ...SECONDARY_CALENDARS]) {
            const item = box(false, {style_class: 'roj-legend-item'});
            item.add_child(new St.Widget({
                style_class: `roj-legend-dot roj-legend-${cal}`,
                y_align: Clutter.ActorAlign.CENTER,
            }));
            const label = new St.Label({style_class: 'roj-legend-label', y_align: Clutter.ActorAlign.CENTER});
            item.add_child(label);
            this._legend.add_child(item);
            this._legendItems[cal] = {item, label};
        }
        this.add_child(this._legend);
    }

    _buildEvents() {
        this._eventsBox = box(true, {style_class: 'roj-events'});
        this._eventsTitle = new St.Label({style_class: 'roj-events-title'});
        this._eventsList = box(true, {style_class: 'roj-events-list'});
        this._eventsBox.add_child(this._eventsTitle);
        this._eventsBox.add_child(this._eventsList);
        this.add_child(this._eventsBox);
    }

    _buildActions() {
        const actions = box(false, {style_class: 'roj-actions'});
        const make = (icon, onClick) => {
            const content = box(false, {style_class: 'roj-action-content'});
            content.add_child(new St.Icon({icon_name: icon, style_class: 'roj-action-icon'}));
            const label = new St.Label({y_align: Clutter.ActorAlign.CENTER});
            content.add_child(label);
            const button = new St.Button({style_class: 'roj-action', can_focus: true, x_expand: true, child: content});
            button.connect('clicked', onClick);
            actions.add_child(button);
            return label;
        };
        this._actionLabels = {
            [N_('Today')]: make('x-office-calendar-symbolic', () => this.showToday()),
            [N_('Convert')]: make('media-playlist-repeat-symbolic', () => this._actions.openPrefs('converter')),
            [N_('Copy')]: make('edit-copy-symbolic', () => this._copySelected()),
            [N_('Settings')]: make('emblem-system-symbolic', () => this._actions.openPrefs('general')),
        };
        this.add_child(actions);
    }

    _buildFooter() {
        this._footer = box(false, {style_class: 'roj-footer', x_align: Clutter.ActorAlign.CENTER});
        // The credits line is English and reads left to right in every language.
        this._footer._rojFixedDirection = Clutter.TextDirection.LTR;

        const text = s => new St.Label({text: s, style_class: 'roj-footer-text', y_align: Clutter.ActorAlign.CENTER});
        const link = (s, uri) => {
            const b = new St.Button({style_class: 'roj-footer-link', can_focus: true, label: s});
            b.connect('clicked', () => this._actions.openUri(uri));
            return b;
        };
        const dot = () => text('·');
        const heart = new St.Icon({
            gicon: Gio.icon_new_for_string(GLib.build_filenamev([this._extensionPath, 'icons', 'heart.svg'])),
            style_class: 'roj-heart',
            y_align: Clutter.ActorAlign.CENTER,
        });

        for (const child of [
            text('Made with'), heart, text('by'), link(AUTHOR, AUTHOR_URL), dot(),
            link('Source', REPO_URL), dot(), link('Docs', DOCS_URL), dot(), link('Site', SITE_URL), dot(),
            link(`v${this._version}`, `${REPO_URL}/releases`),
        ])
            this._footer.add_child(child);
        this.add_child(this._footer);
    }

    // State
    get _fonts() {
        return fontsFromSettings(this._settings);
    }

    get _secondaries() {
        return SECONDARY_CALENDARS.filter(cal => this._settings.get_boolean(`card-show-${cal}`));
    }

    /** Re-render everything (settings, fonts or the day changed). */
    refresh() {
        this._t = translator(uiLanguage(this._settings));

        const scale = this._settings.get_double('font-scale');
        this.style = `font-size: ${(10.5 * scale).toFixed(2)}pt;`;
        this._footer.visible = this._settings.get_boolean('show-footer');

        const fonts = this._fonts;
        for (const [key, label] of Object.entries(this._actionLabels))
            setRichText(label, this._t(key), fonts);
        this._prev.accessible_name = this._t('Previous month');
        this._next.accessible_name = this._t('Next month');
        this._prevYear.accessible_name = this._t('Previous year');
        this._nextYear.accessible_name = this._t('Next year');

        this._renderWeekdays();
        this._renderMonth();
        this._renderSelection();
        setDirectionDeep(this, this._engine.isRtl ? Clutter.TextDirection.RTL : Clutter.TextDirection.LTR);
        this._updateNavIcons();
    }

    /** Called when the popup opens: jump back to today. */
    showToday() {
        this._todayJdn = this._engine.todayJdn();
        this._selectedJdn = this._todayJdn;
        [this._viewYear, this._viewMonth] = this._engine.dateIn('kurdish', this._todayJdn);
        this._renderMonth();
        this._renderSelection();
    }

    /** The date changed at midnight. */
    setToday(jdn) {
        const followToday = this._selectedJdn === this._todayJdn;
        this._todayJdn = jdn;
        if (followToday)
            this.showToday();
        else
            this._renderMonth();
    }

    select(jdn) {
        this._selectedJdn = jdn;
        const [y, m] = this._engine.dateIn('kurdish', jdn);
        if (y !== this._viewYear || m !== this._viewMonth) {
            this._viewYear = y;
            this._viewMonth = m;
        }
        this._renderMonth();
        this._renderSelection();
    }

    _shift(months) {
        [this._viewYear, this._viewMonth] = RojEngine.shiftMonth(this._viewYear, this._viewMonth, months);
        this._renderMonth();
    }

    _onScroll(event) {
        const dir = event.get_scroll_direction();
        if (dir === Clutter.ScrollDirection.UP)
            this._shift(-1);
        else if (dir === Clutter.ScrollDirection.DOWN)
            this._shift(1);
        else if (dir === Clutter.ScrollDirection.SMOOTH) {
            const [, dy] = event.get_scroll_delta();
            if (Math.abs(dy) >= 1)
                this._shift(dy > 0 ? 1 : -1);
        }
        return Clutter.EVENT_STOP;
    }

    // Rendering
    _updateNavIcons() {
        // St does not mirror icons, so swap the arrows for right-to-left layouts.
        const rtl = this._engine.isRtl;
        this._prev.child.icon_name = rtl ? 'go-next-symbolic' : 'go-previous-symbolic';
        this._next.child.icon_name = rtl ? 'go-previous-symbolic' : 'go-next-symbolic';
        this._prevYear.child.icon_name = rtl ? 'go-last-symbolic' : 'go-first-symbolic';
        this._nextYear.child.icon_name = rtl ? 'go-first-symbolic' : 'go-last-symbolic';
    }

    _renderWeekdays() {
        const fonts = this._fonts;
        const weekend = new Set(this._settings.get_value('weekend-days').deepUnpack());
        this._engine.weekdayNames('%a').forEach(({jsDay, name}, i) => {
            const label = this._weekdayLabels[i];
            setRichText(label, name, fonts);
            if (weekend.has(jsDay))
                label.add_style_class_name('roj-weekday-weekend');
            else
                label.remove_style_class_name('roj-weekday-weekend');
        });
    }

    _renderMonth() {
        const engine = this._engine;
        const fonts = this._fonts;
        const grid = engine.monthGrid(this._viewYear, this._viewMonth);
        const secondaries = this._secondaries;
        const layout = this._settings.get_string('card-layout');
        const weekend = new Set(this._settings.get_value('weekend-days').deepUnpack());
        const showDots = this._settings.get_boolean('show-event-dots');
        const highlightHolidays = this._settings.get_boolean('highlight-holidays');

        setRichText(this._monthTitle.child, engine.format(grid.first, 'kurdish', '%B %Y'), fonts);

        const last = grid.first + grid.length - 1;
        for (const cal of SECONDARY_CALENDARS) {
            const label = this._spanLabels[cal];
            label.visible = secondaries.includes(cal);
            if (label.visible)
                setRichText(label, this._monthSpan(cal, grid.first, last), fonts);
        }

        grid.weeks.flat().forEach((cell, i) => {
            const events = this._events.index.eventsOn(cell.jdn);
            this._cards[i].update({
                cell,
                engine,
                secondaries,
                layout,
                fonts,
                state: {
                    today: cell.jdn === this._todayJdn,
                    selected: cell.jdn === this._selectedJdn && cell.jdn !== this._todayJdn,
                    weekend: weekend.has(cell.weekday),
                    holiday: highlightHolidays && events.some(e => e.holiday),
                    events: showDots && events.length > 0,
                },
            });
        });

        // Legend: only meaningful when small numbers are shown.
        this._legend.visible = secondaries.length > 0;
        for (const [cal, {item, label}] of Object.entries(this._legendItems)) {
            item.visible = cal === 'kurdish' || secondaries.includes(cal);
            setRichText(label, this._t(CALENDAR_NAMES[cal]), fonts);
        }
        // Direction must be re-applied to labels that were re-parented.
        setDirectionDeep(this._grid, this._engine.isRtl ? Clutter.TextDirection.RTL : Clutter.TextDirection.LTR);
    }

    _monthSpan(cal, first, last) {
        const e = this._engine;
        const [y1, m1] = e.dateIn(cal, first);
        const [y2, m2] = e.dateIn(cal, last);
        if (y1 === y2 && m1 === m2)
            return e.format(first, cal, '%B %Y');
        if (y1 === y2)
            return `${e.format(first, cal, '%B')} · ${e.format(last, cal, '%B %Y')}`;
        return `${e.format(first, cal, '%B %Y')} · ${e.format(last, cal, '%B %Y')}`;
    }

    _renderSelection() {
        const engine = this._engine;
        const fonts = this._fonts;
        const jdn = this._selectedJdn;

        const title = engine.tryFormat(jdn, 'kurdish', this._settings.get_string('header-format-kurdish'));
        setRichText(this._headerTitle, title.ok ? title.text : title.error, fonts);

        for (const cal of SECONDARY_CALENDARS) {
            const {row, chip, text} = this._headerLines[cal];
            row.visible = this._settings.get_boolean(`header-show-${cal}`);
            if (!row.visible)
                continue;
            setRichText(chip, this._t(CALENDAR_NAMES[cal]), fonts);
            const r = engine.tryFormat(jdn, cal, this._settings.get_string(`header-format-${cal}`));
            setRichText(text, r.ok ? r.text : r.error, fonts);
        }
        this._renderEvents();
    }

    _renderEvents() {
        const fonts = this._fonts;
        this._eventsList.destroy_all_children();
        const enabled = this._settings.get_boolean('events-enabled');
        this._eventsBox.visible = enabled;
        if (!enabled)
            return;

        const events = this._events.index.eventsOn(this._selectedJdn);
        setRichText(this._eventsTitle, this._t('Events'), fonts);

        if (events.length === 0) {
            const empty = new St.Label({style_class: 'roj-event-empty'});
            setRichText(empty, this._t('No events on this day'), fonts);
            this._eventsList.add_child(empty);
        }

        const shown = events.length > EVENT_ROWS ? EVENT_ROWS - 1 : events.length;
        for (const ev of events.slice(0, shown)) {
            const row = box(false, {style_class: 'roj-event'});
            const dot = new St.Widget({style_class: 'roj-event-dot', y_align: Clutter.ActorAlign.CENTER});
            if (ev.color)
                dot.style = `background-color: ${ev.color};`;
            row.add_child(dot);

            const label = new St.Label({style_class: 'roj-event-title', x_expand: true, y_align: Clutter.ActorAlign.CENTER});
            const title = truncate(localizedText(ev.title, this._engine.locale), TITLE_LENGTH);
            setRichText(label, ev.time ? `${ev.time} · ${title}` : title, fonts);
            row.add_child(label);

            if (ev.holiday) {
                const badge = new St.Label({style_class: 'roj-event-badge', y_align: Clutter.ActorAlign.CENTER});
                setRichText(badge, this._t('Holiday'), fonts);
                row.add_child(badge);
            }
            this._eventsList.add_child(row);
        }
        if (events.length > shown) {
            const more = new St.Label({style_class: 'roj-event-more'});
            setRichText(more, this._t('+{count} more', {count: this._engine.number(events.length - shown)}), fonts);
            this._eventsList.add_child(more);
        }
        setDirectionDeep(this._eventsBox, this._engine.isRtl ? Clutter.TextDirection.RTL : Clutter.TextDirection.LTR);
    }

    _copySelected() {
        const r = this._engine.tryFormat(this._selectedJdn, 'kurdish', this._settings.get_string('copy-format'));
        if (!r.ok)
            return;
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, r.text);

        const label = this._actionLabels['Copy'];
        setRichText(label, this._t('Copied'), this._fonts);
        if (this._copiedId)
            GLib.source_remove(this._copiedId);
        this._copiedId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
            this._copiedId = 0;
            setRichText(label, this._t('Copy'), this._fonts);
            return GLib.SOURCE_REMOVE;
        });
    }
});
