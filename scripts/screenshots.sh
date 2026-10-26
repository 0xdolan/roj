#!/usr/bin/env bash
# Capture every screenshot used by the README, the guide and the store page,
# from a real (headless, sandboxed) GNOME Shell. Output: docs/images/screenshots/
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/docs/images/screenshots"
mkdir -p "$OUT" "$ROOT/docs/images/popup" "$ROOT/build"
PLAN="$ROOT/build/screenshots-plan.json"

python3 - "$OUT" "$PLAN" "$ROOT/build" <<'PY'
import datetime, json, sys
out, plan, build = sys.argv[1], sys.argv[2], sys.argv[3]
popups = f"{out}/../popup"
iraq = "https://calendar.google.com/calendar/ical/en.iq%23holiday%40group.v.calendar.google.com/public/basic.ics"
# A personal event on today's date, to show the top-bar marker.
today = datetime.date.today()
mine = f"{build}/screenshot-events.json"
json.dump({"name": "My events", "events": [
    {"calendar": "gregorian", "year": today.year, "month": today.month, "day": today.day, "time": "19:30",
     "title": {"en": "Family dinner", "ckb": "نانی ئێوارەی خێزان", "kmr": "Şîva malbatê"}},
    {"calendar": "gregorian", "year": today.year, "month": today.month, "day": today.day,
     "title": {"en": "Call Hêvî", "ckb": "پەیوەندی بە هێڤییەوە", "kmr": "Li Hêviyê bigere"}},
]}, open(mine, "w"), ensure_ascii=False)
q = lambda v: "'" + v.replace("'", "\\'") + "'"
sources = lambda *extra: q(json.dumps([{"id": "kurdish", "kind": "builtin", "enabled": True, "color": "#F5CD0E"}, *extra]))
s = []
def shots(name):
    return [{"shot": f"{out}/{name}.png", "area": "menu"}, {"shot": f"{popups}/{name}.png", "area": "popup"}]
popup = lambda name, select=None: [{"open": True}, *([{"select": select}] if select else []), *shots(name), {"open": False}]
panel = [480, 0, 640, 34]

# Popups
s += [{"reset": True}, {"colorScheme": "prefer-dark"}, {"wait": 500}]
s += popup("popup-ckb-dark")
s += [{"shot": f"{out}/panel.png", "area": panel}]
s += [{"set": {"card-show-persian": "true", "card-show-islamic": "true"}}]
s += popup("popup-ckb-events", [2027, 3, 10])
s += [{"set": {"card-layout": "'corners'"}}]
s += popup("popup-ckb-corners", [2027, 3, 16])
s += [{"set": {"locale": "'kmr'", "theme": "'light'", "card-layout": "'row'", "card-show-islamic": "false"}},
      {"colorScheme": "default"}, {"wait": 500}]
s += popup("popup-kmr-light")
s += popup("popup-kmr-newroz", [2027, 3, 21])
s += [{"set": {"locale": "'fa'", "secondary-language": "'native'", "theme": "'dark'", "card-show-islamic": "true"}},
      {"colorScheme": "prefer-dark"}, {"wait": 500}]
s += popup("popup-fa-native", [2027, 3, 21])
s += [{"set": {"locale": "'ar'", "secondary-language": "'same'"}}]
s += popup("popup-ar")
s += [{"set": {"locale": "'en'", "theme": "'light'", "card-show-persian": "false", "card-show-islamic": "false"}}]
s += popup("popup-en-light", [2027, 3, 10])

# Top-bar markers for today's events
s += [{"reset": True}, {"colorScheme": "prefer-dark"},
      {"set": {"event-sources": sources({"id": "mine", "kind": "file", "location": mine, "enabled": True, "color": "#3584E4"})}},
      {"wait": 1500}, {"shot": f"{build}/panel-dot.png", "area": panel},
      {"set": {"panel-event-indicator": "'count'"}}, {"shot": f"{build}/panel-count.png", "area": panel},
      {"set": {"panel-event-indicator": "'title'"}}, {"wait": 300}, {"shot": f"{build}/panel-title.png", "area": panel}]

# Preferences, dark, English interface
s += [{"reset": True}, {"set": {"ui-language": "'en'", "event-sources": sources(
          {"id": "url-iraq", "kind": "url", "location": iraq, "name": "Holidays in Iraq", "enabled": True, "color": "#3584E4"})}},
      {"wait": 1500}, {"prefs": "general", "prefsWait": 6000}, {"resize": [60, 40, 900, 940]}]
for page in ["general", "appearance", "formats", "events", "converter", "guide", "about"]:
    s += [{"prefs": page}, {"wait": 500}, {"shot": f"{out}/prefs-{page}.png", "area": "window"}]
# Light theme, and the interface in Sorani, Kurmanji, Persian and Arabic
s += [{"set": {"theme": "'light'"}}, {"wait": 600}]
for page in ["appearance", "converter", "about"]:
    s += [{"prefs": page}, {"wait": 500}, {"shot": f"{out}/prefs-{page}-light.png", "area": "window"}]
s += [{"set": {"theme": "'dark'"}}]
for lang in ["ckb", "kmr", "fa", "ar"]:
    s += [{"set": {"ui-language": q(lang)}}, {"wait": 1800}, {"prefs": "general"}, {"wait": 500},
          {"shot": f"{out}/prefs-general-{lang}.png", "area": "window"}]
json.dump(s, open(plan, "w"), indent=1, ensure_ascii=False)
PY

ROJ_SANDBOX_SIZE=1400x1000 "$ROOT/scripts/sandbox.sh" "$PLAN" "$ROOT/build/sandbox"
# The three top-bar markers, stacked into one image for the guide.
convert "$ROOT/build/panel-dot.png" "$ROOT/build/panel-count.png" "$ROOT/build/panel-title.png" -append "$OUT/panel-markers.png"
ls -1 "$OUT" "$ROOT/docs/images/popup"
