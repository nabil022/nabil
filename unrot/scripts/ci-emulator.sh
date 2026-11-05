#!/usr/bin/env bash
# Runs in CI against an Android emulator: install the APK, grant Usage access,
# launch, open the demo, and save evidence (screenshots, UI dumps, logcat).
#
#   bash unrot/scripts/ci-emulator.sh path/to/unrot-android.apk evidence-dir
set -u
APK="$1"
OUT="$2"
mkdir -p "$OUT"

adb install -r "$APK"
adb shell appops set app.unrot GET_USAGE_STATS allow
# Some phone use to read back: open Settings for a moment.
adb shell monkey -p com.android.settings -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
sleep 5
adb logcat -c
adb shell am start -W -n app.unrot/.MainActivity
sleep 20
adb exec-out screencap -p > "$OUT/1-welcome.png"

# Tap the first element on screen whose text contains $1, scrolling down to find it.
tap_text() {
  local text="$1"
  for _ in 1 2 3 4 5 6 7 8; do
    adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
    adb pull /sdcard/ui.xml "$OUT/ui-search.xml" >/dev/null 2>&1
    local point
    point=$(python3 - "$OUT/ui-search.xml" "$text" <<'PY'
import re, sys, xml.etree.ElementTree as ET
try:
    root = ET.parse(sys.argv[1]).getroot()
except Exception:
    sys.exit(0)
for n in root.iter('node'):
    label = (n.get('text') or '') + ' ' + (n.get('content-desc') or '')
    if sys.argv[2] in label:
        b = [int(v) for v in re.findall(r'-?\d+', n.get('bounds', ''))]
        if len(b) == 4 and b[3] > b[1] and b[1] >= 0 and b[3] <= 2400:
            print((b[0] + b[2]) // 2, (b[1] + b[3]) // 2)
            break
PY
)
    if [ -n "$point" ]; then
      echo "Tapping \"$text\" at $point"
      adb shell input tap $point
      return 0
    fi
    adb shell input swipe 540 1800 540 700 300
    sleep 1
  done
  echo "Could not find \"$text\" on screen" >&2
  return 1
}

if tap_text "Try the demo first"; then
  sleep 15
  # The app should open the demo at the top; swipe down anyway so the dump sees it.
  adb shell input swipe 540 700 540 1900 200
  sleep 2
  adb exec-out screencap -p > "$OUT/2-demo-home.png"
  adb shell uiautomator dump /sdcard/home.xml >/dev/null 2>&1
  adb pull /sdcard/home.xml "$OUT/ui-home.xml" >/dev/null 2>&1
fi

adb logcat -d > "$OUT/logcat.txt"
adb shell pidof app.unrot > "$OUT/pid.txt" || true
exit 0
