#!/usr/bin/env bash
# Runs in CI against an Android emulator: install the APK, grant Usage access,
# launch, set up a profile the way a person would (name, birth year, routine,
# apps, normal week, goals), then save a backup through Android's save screen,
# erase everything and restore it through Android's file picker. Saves
# evidence (screenshots, UI dumps, logcat).
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
adb shell dumpsys webviewupdate 2>/dev/null | grep -iE "current webview package|version" | head -3 || true
adb logcat -c
adb shell am start -W -n app.unrot/.MainActivity
sleep 20
adb exec-out screencap -p > "$OUT/1-setup.png"
adb shell uiautomator dump /sdcard/setup.xml >/dev/null 2>&1
adb pull /sdcard/setup.xml "$OUT/ui-setup.xml" >/dev/null 2>&1

# Tap the first element on screen whose text contains $1, scrolling down to find it.
# "=Text" matches the whole text (or description) instead, ignoring case.
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
want = sys.argv[2]
exact = want.startswith('=')
for n in root.iter('node'):
    text, desc = (n.get('text') or '').strip(), (n.get('content-desc') or '').strip()
    if exact:
        hit = want[1:].lower() in (text.lower(), desc.lower())
    else:
        hit = want in text + ' ' + desc
    if hit:
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

# True if text $1 is anywhere on screen (any case: some headings render in capitals).
see_text() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb pull /sdcard/ui.xml "$OUT/ui-search.xml" >/dev/null 2>&1
  grep -qiF "$1" "$OUT/ui-search.xml"
}

# Close the on-screen keyboard if it is open (Back would leave the app otherwise).
hide_keyboard() {
  if adb shell dumpsys input_method | grep -qE "mInputShown=true|isInputViewShown=true"; then
    adb shell input keyevent 4
    sleep 1
  fi
}

set_up() {
  # 1 of 5: about you. Enter in the year field submits the form.
  tap_text "First name" || return 1
  sleep 1
  adb shell input text "Sam"
  tap_text "Year you were born" || return 1
  sleep 1
  adb shell input text "2010"
  adb shell input keyevent 66
  sleep 3
  hide_keyboard
  if ! see_text "Usual bedtime"; then
    tap_text "Next" || return 1
    sleep 3
  fi
  see_text "Usual bedtime" || { echo "Setup did not reach the routine step" >&2; return 1; }
  # 2 of 5: the routine (the defaults are fine). Next makes the profile.
  tap_text "Next" || return 1
  sleep 4
  see_text "Which apps eat your time" || { echo "Setup did not reach the apps step" >&2; return 1; }
  # 3 of 5: apps.
  tap_text "Next" || return 1
  sleep 3
  # 4 of 5: your normal. Read the phone, then make sure the day is not empty.
  tap_text "Measure my last week" || return 1
  sleep 5
  tap_text "TikTok on a normal day: 5 minutes more" || return 1
  sleep 1
  tap_text "Next" || return 1
  sleep 3
  # 5 of 5: goals.
  tap_text "Start" || return 1
  sleep 12
}

# Android's save screen (DocumentsUI): save where it opens, or in Downloads.
save_in_picker() {
  sleep 4
  adb exec-out screencap -p > "$OUT/3-save-screen.png"
  tap_text "=save" && sleep 4
  if ! see_text "Last backup:"; then
    tap_text "=Show roots" && sleep 2 && tap_text "=Downloads" && sleep 3 && tap_text "=save" && sleep 4
  fi
  see_text "Last backup:"
}

# Android's file picker: choose the backup, from Recent or from Downloads.
open_in_picker() {
  sleep 4
  adb exec-out screencap -p > "$OUT/4-open-screen.png"
  if ! tap_text "unrot-backup"; then
    tap_text "=Show roots" && sleep 2 && tap_text "=Downloads" && sleep 3 && tap_text "unrot-backup" || return 1
  fi
  sleep 4
}

backup_round_trip() {
  tap_text "=You" || return 1
  sleep 2
  tap_text "=Settings" || return 1
  sleep 2
  tap_text "Backup and restore" || return 1
  sleep 2
  tap_text "Save a backup" || return 1
  save_in_picker || { echo "The backup was not saved" >&2; return 1; }
  tap_text "=Back" || return 1
  sleep 2
  tap_text "Erase everything on this phone" || return 1
  sleep 2
  tap_text "Erase for good" || return 1
  sleep 4
  see_text "Welcome to" || { echo "Erasing did not go back to the setup" >&2; return 1; }
  tap_text "Restore from a backup" || return 1
  open_in_picker || { echo "Could not pick the backup file" >&2; return 1; }
  tap_text "Restore it" || return 1
  sleep 12
}

if set_up; then
  # Home should open at the top; swipe down anyway so the dump sees it.
  adb shell input swipe 540 700 540 1900 200
  sleep 2
  adb exec-out screencap -p > "$OUT/2-home.png"
  adb shell uiautomator dump /sdcard/home.xml >/dev/null 2>&1
  adb pull /sdcard/home.xml "$OUT/ui-home.xml" >/dev/null 2>&1
  if backup_round_trip; then
    adb exec-out screencap -p > "$OUT/5-restored.png"
    adb shell uiautomator dump /sdcard/restored.xml >/dev/null 2>&1
    adb pull /sdcard/restored.xml "$OUT/ui-restored.xml" >/dev/null 2>&1
  else
    adb exec-out screencap -p > "$OUT/5-stuck.png"
  fi
else
  adb exec-out screencap -p > "$OUT/2-stuck.png"
fi

adb logcat -d > "$OUT/logcat.txt"
adb shell pidof app.unrot > "$OUT/pid.txt" || true
exit 0
