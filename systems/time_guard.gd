extends Node

## Offline accrual and time-cheat protection (spec 5.2). Autoload name: TimeGuard.
##
## On launch we ask a trusted HTTPS endpoint for UTC. If none answers we fall
## back to device time but record that the reading was untrusted. If the device
## clock ever runs backward relative to the last stored timestamp, elapsed time
## is clamped to zero for that session, and absurd deltas earn nothing.

signal trusted_time_resolved(ok: bool)

var trusted: bool = false          ## A trusted source answered this session.
var _offset: int = 0               ## trusted_utc - device_utc, in seconds.
var _resolved: bool = false
var _http: HTTPRequest
var _url_index: int = 0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_http = HTTPRequest.new()
	_http.timeout = Balance.TRUSTED_TIME_TIMEOUT_SECONDS
	add_child(_http)
	_http.request_completed.connect(_on_request_completed)


## Best available UTC seconds. Device time plus the trusted offset when we have
## one; plain device time otherwise.
func now_utc() -> int:
	return int(Time.get_unix_time_from_system()) + _offset


func device_utc() -> int:
	return int(Time.get_unix_time_from_system())


## Starts the trusted-time fetch. Safe to call when offline: it simply fails and
## the game carries on with device time (spec 7.3's "graceful failure" applies
## here too -- nothing blocks on the network).
func begin_time_check() -> void:
	_url_index = 0
	_resolved = false
	_request_next()


func _request_next() -> void:
	if _url_index >= Balance.TRUSTED_TIME_URLS.size():
		_finish(false)
		return
	var url: String = Balance.TRUSTED_TIME_URLS[_url_index]
	var err := _http.request(url, PackedStringArray(), HTTPClient.METHOD_GET)
	if err != OK:
		_url_index += 1
		_request_next()


func _on_request_completed(result: int, code: int, _headers: PackedStringArray,
		body: PackedByteArray) -> void:
	if _resolved:
		return
	if result == HTTPRequest.RESULT_SUCCESS and code == 200:
		var stamp := _parse_time(body.get_string_from_utf8())
		if stamp > 0:
			_offset = stamp - device_utc()
			# A tiny offset is just clock drift; don't shift time for it.
			if absi(_offset) <= Balance.TRUSTED_TIME_TOLERANCE_SECONDS:
				_offset = 0
			_finish(true)
			return
	_url_index += 1
	_request_next()


func _finish(ok: bool) -> void:
	_resolved = true
	trusted = ok
	Save.state["last_trusted_time_ok"] = ok
	Save.mark_dirty()
	trusted_time_resolved.emit(ok)


## Handles both supported endpoints: Cloudflare's trace (a "ts=" line) and
## worldtimeapi's JSON ("unixtime").
static func _parse_time(text: String) -> int:
	for line in text.split("\n"):
		if line.begins_with("ts="):
			return int(float(line.substr(3)))
	var trimmed := text.strip_edges()
	if trimmed.begins_with("{"):
		var parsed: Variant = JSON.parse_string(trimmed)
		if parsed is Dictionary and parsed.has("unixtime"):
			return int(parsed["unixtime"])
	return 0


## Seconds of offline time to pay out, after every clamp in spec 5.2.
##
## Returns { "elapsed", "granted", "reason" }, where `granted` is already capped
## and `reason` explains any clamp so the UI and the tests can show it.
static func offline_seconds(last_seen_utc: int, now: int, cap_seconds: int) -> Dictionary:
	if last_seen_utc <= 0:
		return {"elapsed": 0, "granted": 0, "reason": "first_launch"}
	var elapsed := now - last_seen_utc
	if elapsed < 0:
		# The clock moved backward: clamp to zero for this session.
		return {"elapsed": elapsed, "granted": 0, "reason": "clock_moved_backward"}
	if elapsed > Balance.OFFLINE_ABSURD_DELTA_SECONDS:
		# Never grant for an absurd delta (spec 5.2). This also refuses a genuine
		# multi-day absence -- the spec is explicit, and the alternative is
		# paying out a forged clock. Loosen it here, not at the call sites.
		return {"elapsed": elapsed, "granted": 0, "reason": "absurd_delta"}
	if elapsed < Balance.OFFLINE_MIN_SECONDS:
		return {"elapsed": elapsed, "granted": 0, "reason": "too_short"}
	return {
		"elapsed": elapsed,
		"granted": mini(elapsed, cap_seconds),
		"reason": "capped" if elapsed > cap_seconds else "ok",
	}
