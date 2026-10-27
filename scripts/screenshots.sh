#!/usr/bin/env bash
# Capture every screenshot used by the README, the guide and the store page,
# from a real (headless, sandboxed) GNOME Shell. Output: docs/images/screenshots/
# and docs/images/popup/.
#
# The images never depend on the day they are taken: each sandbox run pins
# "today" with ROJ_FAKE_NOW to a day that has Kurdish events.
#   17 December 2026  Kurdistan Flag Day: the top bar, the main popups, settings
#   22 January 2027   the Republic of Kurdistan: day cards and the converter
#   21 March 2027     Newroz, a holiday: the Kurmanji and Persian popups
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/docs/images/screenshots"
BUILD="$ROOT/build"
mkdir -p "$OUT" "$ROOT/docs/images/popup" "$BUILD"

FLAG_DAY="2026-12-17 10:30"
REPUBLIC_DAY="2027-01-22 10:30"
NEWROZ="2027-03-21 09:00"

python3 - "$OUT" "$BUILD" "$FLAG_DAY" "$REPUBLIC_DAY" "$NEWROZ" <<'PY'
import json, sys
out, build, flag_day, republic_day, newroz = sys.argv[1:]
popups = f"{out}/../popup"
iraq = "https://calendar.google.com/calendar/ical/en.iq%23holiday%40group.v.calendar.google.com/public/basic.ics"
q = lambda v: "'" + v.replace("'", "\\'") + "'"
sources = lambda *extra: q(json.dumps([{"id": "kurdish", "kind": "builtin", "enabled": True, "color": "#F5CD0E"}, *extra]))

def my_events(stamp):
    """Two personal events on the pinned day, to show the top-bar marker."""
    y, m, d = map(int, stamp.split()[0].split("-"))
    path = f"{build}/screenshot-events-{y}{m:02}{d:02}.json"
    json.dump({"name": "My events", "events": [
        {"calendar": "gregorian", "year": y, "month": m, "day": d, "time": "19:30",
         "title": {"en": "Family dinner", "ckb": "نانی ئێوارەی خێزان", "kmr": "Şîva malbatê"}},
        {"calendar": "gregorian", "year": y, "month": m, "day": d,
         "title": {"en": "Call Hêvî", "ckb": "پەیوەندی بە هێڤییەوە", "kmr": "Li Hêviyê bigere"}},
    ]}, open(path, "w"), ensure_ascii=False)
    return sources({"id": "mine", "kind": "file", "location": path, "enabled": True, "color": "#3584E4"})

def shots(name):
    return [{"shot": f"{out}/{name}.png", "area": "menu"}, {"shot": f"{popups}/{name}.png", "area": "popup"}]
popup = lambda name, select=None: [{"open": True}, *([{"select": select}] if select else []), *shots(name), {"open": False}]
panel = [480, 0, 640, 34]
dark = [{"reset": True}, {"colorScheme": "prefer-dark"}, {"wait": 500}]

def prefs_start(extra=None):
    return [{"reset": True}, {"colorScheme": "prefer-dark"},
            {"set": {"ui-language": "'en'", **(extra or {})}},
            {"wait": 1500}, {"prefs": "general", "prefsWait": 6000}, {"resize": [60, 40, 900, 940]}]

def prefs_shot(page, name):
    return [{"prefs": page}, {"wait": 500}, {"shot": f"{out}/{name}.png", "area": "window"}]

# 17 December: Kurdistan Flag Day
a = list(dark)
a += popup("popup-ckb-dark")
a += [{"shot": f"{out}/panel.png", "area": panel}]
a += [{"set": {"locale": "'kmr'", "theme": "'light'"}}, {"colorScheme": "default"}, {"wait": 500}]
a += popup("popup-kmr-light")
a += [{"set": {"locale": "'ar'", "theme": "'dark'", "card-show-persian": "true", "card-show-islamic": "true"}},
      {"colorScheme": "prefer-dark"}, {"wait": 500}]
a += popup("popup-ar")
a += [{"set": {"locale": "'en'", "theme": "'light'", "card-show-persian": "false", "card-show-islamic": "false"}}]
a += popup("popup-en-light")
# The top-bar markers for today's events
a += dark + [{"set": {"event-sources": my_events(flag_day)}},
      {"wait": 1500}, {"shot": f"{build}/panel-dot.png", "area": panel},
      {"set": {"panel-event-indicator": "'count'"}}, {"shot": f"{build}/panel-count.png", "area": panel},
      {"set": {"panel-event-indicator": "'title'"}}, {"wait": 300}, {"shot": f"{build}/panel-title.png", "area": panel}]
# Settings, dark, English interface
a += prefs_start({"event-sources": sources(
    {"id": "url-iraq", "kind": "url", "location": iraq, "name": "Holidays in Iraq", "enabled": True, "color": "#3584E4"})})
for page in ["general", "appearance", "formats", "events", "guide", "about"]:
    a += prefs_shot(page, f"prefs-{page}")
# Light theme, and the interface in Sorani, Kurmanji, Persian and Arabic
a += [{"set": {"theme": "'light'"}}, {"wait": 600}]
for page in ["appearance", "about"]:
    a += prefs_shot(page, f"prefs-{page}-light")
a += [{"set": {"theme": "'dark'"}}]
for lang in ["ckb", "kmr", "fa", "ar"]:
    a += [{"set": {"ui-language": q(lang)}}, {"wait": 1800}] + prefs_shot("general", f"prefs-general-{lang}")

# 22 January: the Republic of Kurdistan
b = dark + [{"set": {"card-show-persian": "true", "card-show-islamic": "true"}}]
b += popup("popup-ckb-events")
b += [{"set": {"card-layout": "'corners'"}}]
b += popup("popup-ckb-corners")
b += prefs_start() + prefs_shot("converter", "prefs-converter")
b += [{"set": {"theme": "'light'"}}, {"wait": 600}] + prefs_shot("converter", "prefs-converter-light")

# 21 March: Newroz, a holiday
c = [{"reset": True}, {"set": {"locale": "'kmr'", "theme": "'light'"}}, {"colorScheme": "default"}, {"wait": 500}]
c += popup("popup-kmr-newroz")
c += [{"set": {"locale": "'fa'", "secondary-language": "'native'", "theme": "'dark'",
               "card-show-persian": "true", "card-show-islamic": "true"}},
      {"colorScheme": "prefer-dark"}, {"wait": 500}]
c += popup("popup-fa-native")
# The marker turns red on a holiday
c += dark + [{"set": {"event-sources": my_events(newroz), "panel-event-indicator": "'title'"}},
      {"wait": 1500}, {"shot": f"{build}/panel-holiday.png", "area": panel}]

for name, steps in [("flag-day", a), ("republic-day", b), ("newroz", c)]:
    json.dump(steps, open(f"{build}/screenshots-{name}.json", "w"), indent=1, ensure_ascii=False)
PY

run() {
  ROJ_FAKE_NOW="$2" ROJ_SANDBOX_SIZE=1400x1000 "$ROOT/scripts/sandbox.sh" "$BUILD/screenshots-$1.json" "$BUILD/sandbox-$1"
}
run flag-day "$FLAG_DAY"
run republic-day "$REPUBLIC_DAY"
run newroz "$NEWROZ"

# The top-bar markers, stacked into one image for the guide: a dot, a count,
# the title, and the title in red on a holiday.
convert "$BUILD/panel-dot.png" "$BUILD/panel-count.png" "$BUILD/panel-title.png" "$BUILD/panel-holiday.png" \
  -append "$OUT/panel-markers.png"
ls -1 "$OUT" "$ROOT/docs/images/popup"
