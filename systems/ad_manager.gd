extends Node

## Rewarded video (spec 7.3). Autoload name: Ads.
##
## Rewarded video ONLY. Zero interstitials, zero banners -- interstitials in an
## idle game destroy session frequency, which is the metric this genre lives on.
##
## The game-side logic here is complete: placements, caps, cooldowns, boost
## application and graceful failure when no ad is available or the device is
## offline. The SDK itself sits behind `AdProvider`; swap in the AdMob provider
## at the marked seam for an Android build. Nothing above this file knows or
## cares which provider is running.

signal availability_changed
signal reward_result(placement: String, granted: bool)

const OFFLINE_DOUBLE := "offline_double"
const FREE_RIFT := "free_rift"
const FLUX_SURGE := "flux_surge"
const SHARD_BOOST := "shard_boost"

const PLACEMENTS := [OFFLINE_DOUBLE, FREE_RIFT, FLUX_SURGE, SHARD_BOOST]

var _provider: AdProvider
var _showing := false


class AdProvider extends RefCounted:
	## An ad SDK, reduced to what the game needs. Implement these three.
	signal closed(granted: bool)

	func is_ready() -> bool:
		return false

	func show() -> void:
		closed.emit(false)

	func provider_name() -> String:
		return "none"


class SimulatedAdProvider extends AdProvider:
	## Desktop / editor stand-in. Always ready, always rewards, returns on the
	## next frame so callers exercise the same async path as the real SDK.
	var _tree: SceneTree

	func _init(tree: SceneTree) -> void:
		_tree = tree

	func is_ready() -> bool:
		return true

	func show() -> void:
		await _tree.create_timer(0.35).timeout
		closed.emit(true)

	func provider_name() -> String:
		return "simulated"


class AdMobProvider extends AdProvider:
	## Android build seam. The AdMob Godot plugin exposes an engine singleton;
	## wire load/show/callbacks here and register the ad unit ids in the export
	## preset. Kept dormant unless the singleton is actually present, so a
	## desktop or test run never touches it.
	var _singleton: Object

	func _init(singleton: Object) -> void:
		_singleton = singleton

	func is_ready() -> bool:
		if _singleton == null or not _singleton.has_method("is_rewarded_loaded"):
			return false
		return bool(_singleton.call("is_rewarded_loaded"))

	func show() -> void:
		if not is_ready():
			closed.emit(false)
			return
		_singleton.call("show_rewarded")
		# The plugin's own reward callback should be routed to `closed`.

	func provider_name() -> String:
		return "admob"


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	if Engine.has_singleton("AdMob"):
		_provider = AdMobProvider.new(Engine.get_singleton("AdMob"))
	else:
		_provider = SimulatedAdProvider.new(get_tree())


func provider_name() -> String:
	return _provider.provider_name() if _provider != null else "none"


## Test seam.
func set_provider(provider: AdProvider) -> void:
	_provider = provider
	availability_changed.emit()


# --- caps (spec 7.3) --------------------------------------------------------

func is_available(placement: String) -> bool:
	if _showing or _provider == null or not _provider.is_ready():
		return false
	var now := TimeGuard.now_utc()
	Save.roll_ad_day(now)
	match placement:
		FREE_RIFT:
			return free_rift_seconds_left() <= 0
		FLUX_SURGE:
			var used := int(Save.ad_caps().get("surge_count_today", 0))
			return used < Balance.AD_SURGE_DAILY_CAP
		SHARD_BOOST:
			var used_s := int(Save.ad_caps().get("shard_count_today", 0))
			return used_s < Balance.AD_SHARD_DAILY_CAP
		OFFLINE_DOUBLE:
			return true  # capped naturally: once per collection
	return false


func free_rift_seconds_left() -> int:
	var last := int(Save.ad_caps().get("free_rift_last_utc", 0))
	if last <= 0:
		return 0
	var ready_at := last + Balance.AD_FREE_RIFT_COOLDOWN_SECONDS
	return maxi(0, ready_at - TimeGuard.now_utc())


func surge_uses_left() -> int:
	Save.roll_ad_day(TimeGuard.now_utc())
	return maxi(0, Balance.AD_SURGE_DAILY_CAP - int(Save.ad_caps().get("surge_count_today", 0)))


func shard_uses_left() -> int:
	Save.roll_ad_day(TimeGuard.now_utc())
	return maxi(0, Balance.AD_SHARD_DAILY_CAP - int(Save.ad_caps().get("shard_count_today", 0)))


# --- showing ----------------------------------------------------------------

## Shows a rewarded ad and applies the reward for the boost placements.
## Returns true if the reward was granted. Failing gracefully is the point:
## no ad fill, no network, or a dismissed ad all return false and leave the
## player exactly where they were.
func show_rewarded(placement: String) -> bool:
	if not is_available(placement):
		reward_result.emit(placement, false)
		return false
	_showing = true
	availability_changed.emit()
	var granted := false
	if _provider.is_ready():
		_provider.show()
		granted = await _provider.closed
	_showing = false
	if granted:
		_apply_reward(placement)
	availability_changed.emit()
	reward_result.emit(placement, granted)
	return granted


## Rewards that are purely state changes are applied here. OFFLINE_DOUBLE and
## FREE_RIFT are applied by their screens, which own the amounts involved.
func _apply_reward(placement: String) -> void:
	var now := TimeGuard.now_utc()
	Save.roll_ad_day(now)
	var caps := Save.ad_caps()
	match placement:
		FLUX_SURGE:
			caps["surge_count_today"] = int(caps.get("surge_count_today", 0)) + 1
			Save.add_boost("flux_x2", Balance.AD_SURGE_DURATION_SECONDS, now)
		SHARD_BOOST:
			caps["shard_count_today"] = int(caps.get("shard_count_today", 0)) + 1
			Save.add_charge("shards_x2", 1)
		FREE_RIFT:
			caps["free_rift_last_utc"] = now
	Save.state["ad_caps"] = caps
	Save.mark_dirty()
	Save.save_game()
