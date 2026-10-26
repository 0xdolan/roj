// SPDX-License-Identifier: GPL-3.0-or-later
// St helpers for script-aware text.

import Pango from 'gi://Pango';

import {fontMarkup} from '../lib/richtext.js';

/**
 * Set `text` on an St.Label, choosing the LTR/RTL font per script run.
 *
 * Ellipsizing is turned off: the popup has a fixed width and long text wraps,
 * while ClutterText can otherwise reuse a layout measured for the previous,
 * shorter text and draw a stray "…".
 */
export function setRichText(label, text, fonts, attrs = {}) {
    label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
    label.clutter_text.set_markup(fontMarkup(text ?? '', fonts, attrs));
}
