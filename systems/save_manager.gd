extends Node

## Local save (spec 8.3). Autoload name: Save.
##
## Plain JSON at user://save.json, written on every meaningful state change and
## on NOTIFICATION_APPLICATION_PAUSED. Deliberately NOT encrypted or obfuscated:
## this is a single-player idle game with no leaderboards, so anti-cheat effort
## belongs in the time guard (spec 5.2), and encryption only makes support and
## debugging harder.
##
## `version` is here from day one with a migration path, because this schema
## will change.

signal state_changed          ## Anything at all changed.
signal currency_changed       ## Flux / Shards / Prisms.
signal collection_changed     ## A Fragment was gained or levelled.
signal boosts_changed

const SAVE_PATH := "user://save.json"
const BACKUP_PATH := "user://save.backup.json"
const CURRENT_VERSION := 1

var flux: BigNumber = BigNumber.zero()
var state: Dictionary = {}
var is_first_launch: bool = false
var load_failed: bool = false

var _dirty := false
var _autosave_accum := 0.0
var _suspend_writes := false


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	load_game()


func _process(delta: float) -> void:
	if not _dirty:
		return
	_autosave_accum += delta
	if _autosave_accum >= Balance.AUTOSAVE_SECONDS:
		save_game()


func _notification(what: int) -> void:
	match what:
		NOTIFICATION_APPLICATION_PAUSED, NOTIFICATION_WM_CLOSE_REQUEST, \
		NOTIFICATION_APPLICATION_FOCUS_OUT, NOTIFICATION_EXIT_TREE:
			if _dirty:
				save_game()


# --- defaults & migration ---------------------------------------------------

static func default_state() -> Dictionary:
	return {
		"version": CURRENT_VERSION,
		"flux": 0.0,
		"shards": 0,
		"prisms": 0,
		"fragments": {},
		"pulls_since_singular": 0,
		"total_pulls": 0,
		"last_seen_utc": 0,
		"last_trusted_time_ok": false,
		"boosts": [],
		"cosmetics_owned": [],
		"settings": {
			"fast_open": false,
			"sound": true,
			"haptics": true,
		},
		"ad_caps": {
			"free_rift_last_utc": 0,
			"surge_count_today": 0,
			"shard_count_today": 0,
			"caps_day": 0,
		},
		"stats": {
			"rifts_opened": {},
			"first_launch_utc": 0,
			"pity_grants": 0,
		},
		"flags": {
			"first_pull_done": false,
			"free_rift_granted": false,
		},
	}


## Fills in anything a newer build added, and upgrades old schema versions.
## Called on every load, so a save written by any earlier build stays usable.
func _migrate(data: Dictionary) -> Dictionary:
	var version := int(data.get("version", 0))
	if version < 1:
		# v0 (pre-release) had no explicit version field.
		data["version"] = 1
	# Future migrations chain here:
	#   if int(data["version"]) == 1: ... ; data["version"] = 2
	var defaults := default_state()
	for key in defaults:
		if not data.has(key):
			data[key] = defaults[key]
		elif defaults[key] is Dictionary and data[key] is Dictionary:
			for sub in defaults[key]:
				if not data[key].has(sub):
					data[key][sub] = defaults[key][sub]
	data["version"] = CURRENT_VERSION
	return data


# --- load / save ------------------------------------------------------------

func load_game() -> void:
	is_first_launch = false
	load_failed = false
	if not FileAccess.file_exists(SAVE_PATH):
		state = default_state()
		is_first_launch = true
		flux = BigNumber.zero()
		return
	var parsed := _read_json(SAVE_PATH)
	if parsed.is_empty():
		# Corrupt or truncated primary save: fall back to the last good copy
		# rather than silently wiping a player's collection.
		parsed = _read_json(BACKUP_PATH)
		load_failed = true
	if parsed.is_empty():
		push_error("Save: no readable save found; starting fresh")
		state = default_state()
		is_first_launch = true
		flux = BigNumber.zero()
		return
	state = _migrate(parsed)
	flux = BigNumber.from_save(state.get("flux", 0.0))
	state_changed.emit()


func _read_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		push_error("Save: cannot open %s (%d)" % [path, FileAccess.get_open_error()])
		return {}
	var text := file.get_as_text()
	file.close()
	var result: Variant = JSON.parse_string(text)
	if result is Dictionary:
		return result
	push_error("Save: %s is not valid JSON" % path)
	return {}


func save_game() -> void:
	if _suspend_writes:
		return
	state["flux"] = flux.to_save()
	state["last_seen_utc"] = _now_utc()
	# Keep the previous good save as a backup before overwriting.
	if FileAccess.file_exists(SAVE_PATH):
		var prev := FileAccess.open(SAVE_PATH, FileAccess.READ)
		if prev != null:
			var text := prev.get_as_text()
			prev.close()
			var backup := FileAccess.open(BACKUP_PATH, FileAccess.WRITE)
			if backup != null:
				backup.store_string(text)
				backup.close()
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file == null:
		push_error("Save: cannot write %s (%d)" % [SAVE_PATH, FileAccess.get_open_error()])
		return
	file.store_string(JSON.stringify(state, "\t"))
	file.close()
	_dirty = false
	_autosave_accum = 0.0


## Reads the clock through TimeGuard when it exists, so a forged device clock is
## corrected, but without depending on autoload order at startup.
func _now_utc() -> int:
	var guard := get_node_or_null("/root/TimeGuard")
	if guard != null and guard.has_method("now_utc"):
		return int(guard.call("now_utc"))
	return int(Time.get_unix_time_from_system())


func mark_dirty() -> void:
	_dirty = true
	state_changed.emit()


## Settings > Delete local data (spec 6.5).
func delete_local_data() -> void:
	_suspend_writes = true
	for path in [SAVE_PATH, BACKUP_PATH]:
		if FileAccess.file_exists(path):
			DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	state = default_state()
	flux = BigNumber.zero()
	is_first_launch = true
	_suspend_writes = false
	_dirty = true
	save_game()
	state_changed.emit()
	collection_changed.emit()
	currency_changed.emit()


# --- currencies -------------------------------------------------------------

func add_flux(amount: BigNumber) -> void:
	if amount.is_zero():
		return
	flux.add_in_place(amount)
	_dirty = true
	currency_changed.emit()


func spend_flux(amount: BigNumber) -> bool:
	if flux.lt(amount):
		return false
	flux.sub_in_place(amount)
	_dirty = true
	currency_changed.emit()
	return true


func get_shards() -> int:
	return int(state.get("shards", 0))


func add_shards(amount: int) -> void:
	if amount == 0:
		return
	state["shards"] = maxi(0, get_shards() + amount)
	_dirty = true
	currency_changed.emit()


func spend_shards(amount: int) -> bool:
	if get_shards() < amount:
		return false
	state["shards"] = get_shards() - amount
	_dirty = true
	currency_changed.emit()
	return true


func get_prisms() -> int:
	return int(state.get("prisms", 0))


func add_prisms(amount: int) -> void:
	if amount == 0:
		return
	state["prisms"] = maxi(0, get_prisms() + amount)
	_dirty = true
	currency_changed.emit()


func spend_prisms(amount: int) -> bool:
	if get_prisms() < amount:
		return false
	state["prisms"] = get_prisms() - amount
	_dirty = true
	currency_changed.emit()
	return true


# --- collection -------------------------------------------------------------

func fragments() -> Dictionary:
	return state.get("fragments", {})


func has_fragment(id: String) -> bool:
	return fragments().has(id)


func owned_count() -> int:
	return fragments().size()


func fragment_level(id: String) -> int:
	var entry: Variant = fragments().get(id, null)
	if entry is Dictionary:
		return int(entry.get("level", Balance.LEVEL_MIN))
	return 0


func grant_fragment(id: String) -> void:
	if has_fragment(id):
		return
	fragments()[id] = {"level": Balance.LEVEL_MIN}
	_dirty = true
	collection_changed.emit()


func set_fragment_level(id: String, level: int) -> void:
	if not has_fragment(id):
		return
	fragments()[id]["level"] = clampi(level, Balance.LEVEL_MIN, Balance.LEVEL_MAX)
	_dirty = true
	collection_changed.emit()


# --- pulls ------------------------------------------------------------------

func pity() -> int:
	return int(state.get("pulls_since_singular", 0))


func set_pity(value: int) -> void:
	state["pulls_since_singular"] = maxi(0, value)
	_dirty = true


func total_pulls() -> int:
	return int(state.get("total_pulls", 0))


func add_pulls(count: int) -> void:
	state["total_pulls"] = total_pulls() + count
	_dirty = true


func note_rift_opened(rift_id: String) -> void:
	var stats: Dictionary = state.get("stats", {})
	var opened: Dictionary = stats.get("rifts_opened", {})
	opened[rift_id] = int(opened.get(rift_id, 0)) + 1
	stats["rifts_opened"] = opened
	state["stats"] = stats
	_dirty = true


# --- boosts (ad rewards, spec 7.3) -----------------------------------------

func boosts() -> Array:
	return state.get("boosts", [])


func add_boost(type: String, duration_seconds: int, now_utc: int) -> void:
	prune_boosts(now_utc)
	var list := boosts()
	for b in list:
		if String(b.get("type", "")) == type:
			b["expires_utc"] = maxi(int(b.get("expires_utc", 0)), now_utc) + duration_seconds
			_dirty = true
			boosts_changed.emit()
			return
	list.append({"type": type, "expires_utc": now_utc + duration_seconds})
	state["boosts"] = list
	_dirty = true
	boosts_changed.emit()


## Charge-based boost with no clock (the x2 Shards reward applies to the NEXT
## opening, however long the player takes to use it).
func add_charge(type: String, charges: int = 1) -> void:
	var list := boosts()
	for b in list:
		if String(b.get("type", "")) == type:
			b["charges"] = int(b.get("charges", 0)) + charges
			_dirty = true
			boosts_changed.emit()
			return
	list.append({"type": type, "charges": charges})
	state["boosts"] = list
	_dirty = true
	boosts_changed.emit()


func has_boost(type: String, now_utc: int) -> bool:
	for b in boosts():
		if String(b.get("type", "")) != type:
			continue
		if b.has("charges"):
			return int(b["charges"]) > 0
		return int(b.get("expires_utc", 0)) > now_utc
	return false


func boost_seconds_left(type: String, now_utc: int) -> int:
	for b in boosts():
		if String(b.get("type", "")) == type and b.has("expires_utc"):
			return maxi(0, int(b["expires_utc"]) - now_utc)
	return 0


func consume_charge(type: String) -> bool:
	for b in boosts():
		if String(b.get("type", "")) == type and int(b.get("charges", 0)) > 0:
			b["charges"] = int(b["charges"]) - 1
			_dirty = true
			boosts_changed.emit()
			return true
	return false


func prune_boosts(now_utc: int) -> void:
	var kept: Array = []
	var removed := false
	for b in boosts():
		if b.has("charges"):
			if int(b["charges"]) > 0:
				kept.append(b)
			else:
				removed = true
		elif int(b.get("expires_utc", 0)) > now_utc:
			kept.append(b)
		else:
			removed = true
	if removed:
		state["boosts"] = kept
		_dirty = true
		boosts_changed.emit()


# --- ad caps ----------------------------------------------------------------

func ad_caps() -> Dictionary:
	return state.get("ad_caps", {})


## Daily counters roll over on the UTC day boundary.
func roll_ad_day(now_utc: int) -> void:
	var caps := ad_caps()
	var day := int(now_utc / 86400)
	if int(caps.get("caps_day", 0)) != day:
		caps["caps_day"] = day
		caps["surge_count_today"] = 0
		caps["shard_count_today"] = 0
		state["ad_caps"] = caps
		_dirty = true


func settings() -> Dictionary:
	return state.get("settings", {})


func get_setting(key: String, fallback: Variant = null) -> Variant:
	return settings().get(key, fallback)


func set_setting(key: String, value: Variant) -> void:
	settings()[key] = value
	_dirty = true
	save_game()
	state_changed.emit()


func cosmetics_owned() -> Array:
	return state.get("cosmetics_owned", [])


func owns_cosmetic(id: String) -> bool:
	return cosmetics_owned().has(id)


func grant_cosmetic(id: String) -> void:
	if owns_cosmetic(id):
		return
	cosmetics_owned().append(id)
	_dirty = true
	state_changed.emit()


func flags() -> Dictionary:
	return state.get("flags", {})


func get_flag(key: String) -> bool:
	return bool(flags().get(key, false))


func set_flag(key: String, value: bool) -> void:
	flags()[key] = value
	_dirty = true
