// SPDX-License-Identifier: GPL-3.0-or-later
// Small helpers shared by the popup and the options page.

export const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);

const ICONS = {
    first: '<path d="M11 4 7 8l4 4M7 4 3 8l4 4"/>',
    prev: '<path d="M10 3 5 8l5 5"/>',
    next: '<path d="m6 3 5 5-5 5"/>',
    last: '<path d="m5 4 4 4-4 4M9 4l4 4-4 4"/>',
    today: '<rect x="2.5" y="3.5" width="11" height="10" rx="2"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>',
    convert: '<path d="M3 6h9l-2.5-2.5M13 10H4l2.5 2.5"/>',
    copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>',
    settings: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>',
    general: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>',
    appearance: '<circle cx="8" cy="8" r="5.5"/><path d="M8 2.5v11A5.5 5.5 0 0 0 8 2.5z" fill="currentColor"/>',
    formats: '<path d="M3 4h10M3 8h10M3 12h6"/>',
    events: '<rect x="2.5" y="3.5" width="11" height="10" rx="2"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/><circle cx="10.5" cy="10.5" r="1" fill="currentColor"/>',
    converter: '<path d="M3 6h9l-2.5-2.5M13 10H4l2.5 2.5"/>',
    about: '<circle cx="8" cy="8" r="5.5"/><path d="M8 7.5v3.5M8 5v.01"/>',
    undo: '<path d="M4 6h6a3 3 0 0 1 0 6H6M4 6l2.5-2.5M4 6l2.5 2.5"/>',
    remove: '<path d="M3.5 4.5h9M6.5 4.5v-2h3v2M5 4.5l.5 9h5l.5-9"/>',
    open: '<path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5"/>',
    add: '<path d="M8 3v10M3 8h10"/>',
    refresh: '<path d="M13 8a5 5 0 1 1-1.5-3.5M13 3v2.5h-2.5"/>',
    list: '<path d="M6 4h7M6 8h7M6 12h7M3 4v.01M3 8v.01M3 12v.01"/>',
    install: '<path d="M8 2.5v8M5 7.5l3 3 3-3M3 13.5h10"/>',
};

export const icon = name => `<svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[name]}</svg>`;

/** Web app only: register the offline worker and offer an install button where the browser allows. */
export function setupInstall(_) {
    if ('serviceWorker' in navigator && location.protocol === 'https:')
        navigator.serviceWorker.register('sw.js').catch(() => {});
    const button = document.getElementById('install');
    if (!button)
        return;
    let deferred = null;
    addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        deferred = event;
        button.hidden = false;
    });
    addEventListener('appinstalled', () => {
        button.hidden = true;
    });
    button.innerHTML = `${icon('install')}<span>${esc(_('Install the app'))}</span>`;
    button.addEventListener('click', async () => {
        if (!deferred)
            return;
        deferred.prompt();
        await deferred.userChoice;
        deferred = null;
        button.hidden = true;
    });
}
