// SPDX-License-Identifier: GPL-3.0-or-later
// Storage for the browser extension and the web app. In Chrome, Firefox and
// Safari the extension keeps settings in storage.sync (they follow the user's
// browser account where the browser offers it) and larger data, such as event
// files, feed copies and fonts, in storage.local. The web app has neither, so
// it uses localStorage for settings and IndexedDB for the rest.

const api = globalThis.browser?.storage ? globalThis.browser : globalThis.chrome?.storage ? globalThis.chrome : null;

/** True inside the browser extension, false in the web app. */
export const isExtension = Boolean(api?.runtime?.id);
export const runtime = isExtension ? api : null;

const SETTINGS_KEY = 'settings';
const LOCAL_SETTINGS_KEY = 'roj-app-settings';
const CHANNEL = 'roj-app';

// Settings
export async function readSettings() {
    if (isExtension) {
        const got = await api.storage.sync.get(SETTINGS_KEY);
        return got[SETTINGS_KEY] ?? {};
    }
    try {
        return JSON.parse(localStorage.getItem(LOCAL_SETTINGS_KEY) ?? '{}') ?? {};
    } catch {
        return {};
    }
}

export async function writeSettings(values) {
    if (isExtension) {
        await api.storage.sync.set({[SETTINGS_KEY]: values});
        return;
    }
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(values));
    notify(SETTINGS_KEY);
}

// Local data: event files, feed copies, font files
const DB_NAME = 'roj';
const DB_STORE = 'data';
let dbPromise = null;

function db() {
    dbPromise ??= new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    return dbPromise;
}

async function idb(mode, fn) {
    const database = await db();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(DB_STORE, mode);
        const request = fn(tx.objectStore(DB_STORE));
        tx.oncomplete = () => resolve(request?.result);
        tx.onerror = () => reject(tx.error);
    });
}

export async function readLocal(key) {
    if (isExtension)
        return (await api.storage.local.get(key))[key] ?? null;
    try {
        return (await idb('readonly', s => s.get(key))) ?? null;
    } catch {
        return null;
    }
}

export async function writeLocal(key, value) {
    if (isExtension) {
        await api.storage.local.set({[key]: value});
        return;
    }
    await idb('readwrite', s => s.put(value, key));
    notify(key);
}

export async function removeLocal(key) {
    if (isExtension) {
        await api.storage.local.remove(key);
        return;
    }
    await idb('readwrite', s => s.delete(key));
    notify(key);
}

// Change notifications, so the popup, the options page and the toolbar icon
// follow each other.
let channel = null;
function notify(key) {
    try {
        channel ??= new BroadcastChannel(CHANNEL);
        channel.postMessage(key);
    } catch {
        // no BroadcastChannel: other open pages update when reopened
    }
}

/** Call `fn(keys)` when settings or local data change in another page. */
export function onStoreChanged(fn) {
    if (isExtension) {
        api.storage.onChanged.addListener((changes, area) => fn(Object.keys(changes), area));
        return;
    }
    try {
        const listener = new BroadcastChannel(CHANNEL);
        listener.onmessage = e => fn([e.data], e.data === SETTINGS_KEY ? 'sync' : 'local');
    } catch {
        // see notify()
    }
    addEventListener('storage', e => {
        if (e.key === LOCAL_SETTINGS_KEY)
            fn([SETTINGS_KEY], 'sync');
    });
}

/** An address inside the extension or the web app. */
export function assetUrl(path) {
    return isExtension ? api.runtime.getURL(path) : new URL(path, document.baseURI).href;
}

/** Open a page of the app (options.html#events) in a tab, or in this window in the web app. */
export async function openPage(path) {
    if (isExtension) {
        await api.tabs.create({url: api.runtime.getURL(path)});
        globalThis.close?.();
    } else {
        location.href = path;
    }
}

/** Ask for access to a site (online calendars). Always true in the web app. */
export async function requestOrigin(url) {
    if (!isExtension || !api.permissions)
        return true;
    const origin = `${new URL(url).origin}/*`;
    try {
        if (await api.permissions.contains({origins: [origin]}))
            return true;
        return await api.permissions.request({origins: [origin]});
    } catch {
        return false;
    }
}

/** Tell the background script to redraw the toolbar button. */
export function pingBackground(message) {
    if (!isExtension)
        return;
    try {
        api.runtime.sendMessage(message).catch(() => {});
    } catch {
        // no background listener yet
    }
}
