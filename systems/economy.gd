extends Node

## Income calculation and the Flux tick (spec 4, 5.1). Autoload name: Economy.
##
##   Fragment income = base_rate * tier_multiplier * (1 + 0.15 * (level - 1))
##                     * set_bonus * global_bonus
##   Total Flux/sec  = sum over all owned Fragments
##
## The level term is additive rather than compounding, which is what keeps
## late-game numbers controllable (spec 4).

signal rate_changed(rate: BigNumber)
signal sets_completed_changed(count: int)

var flux_per_sec: BigNumber = BigNumber.zero()

var _dirty := true
var _tick_accum := 0.0
var _completed_sets: Dictionary = {}
var _all_sets_done := false


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_PAUSABLE
	Save.collection_changed.connect(_invalidate)
	Save.boosts_changed.connect(_invalidate)
	_invalidate()


func _invalidate() -> void:
	_dirty = true


func _process(delta: float) -> void:
	if _dirty:
		recompute()
	_tick_accum += delta
	if _tick_accum < Balance.ECONOMY_TICK_SECONDS:
		return
	if not flux_per_sec.is_zero():
		Save.add_flux(flux_per_sec.mul_scalar(_tick_accum))
	_tick_accum = 0.0


# --- set bonuses ------------------------------------------------------------

func _recompute_sets() -> void:
	var before := _completed_sets.size()
	_completed_sets.clear()
	for set_id in Fragments.set_ids():
		var complete := true
		for frag in Fragments.of_set(set_id):
			if not Save.has_fragment(String(frag["id"])):
				complete = false
				break
		if complete:
			_completed_sets[set_id] = true
	_all_sets_done = _completed_sets.size() == Balance.SET_COUNT
	if _completed_sets.size() != before:
		sets_completed_changed.emit(_completed_sets.size())


func is_set_complete(set_id: String) -> bool:
	if _dirty:
		recompute()
	return _completed_sets.has(set_id)


func completed_set_count() -> int:
	if _dirty:
		recompute()
	return _completed_sets.size()


## Multiplier applied to every Fragment: the all-sets bonus and any active
## rewarded-ad Flux surge. Cosmetics never appear here (spec 5.1, 7.1).
func global_multiplier() -> float:
	var mult := 1.0
	if _all_sets_done:
		mult *= 1.0 + Balance.ALL_SETS_BONUS
	if Save.has_boost("flux_x2", TimeGuard.now_utc()):
		mult *= Balance.AD_SURGE_MULTIPLIER
	return mult


func set_multiplier(set_id: String) -> float:
	return 1.0 + Balance.SET_COMPLETE_BONUS if _completed_sets.has(set_id) else 1.0


# --- income -----------------------------------------------------------------

## Flux/sec produced by one owned Fragment, all bonuses applied.
func fragment_income(id: String) -> BigNumber:
	var frag := Fragments.get_by_id(id)
	if frag.is_empty() or not Save.has_fragment(id):
		return BigNumber.zero()
	if _dirty:
		recompute()
	return _fragment_income_unchecked(frag, Save.fragment_level(id))


func _fragment_income_unchecked(frag: Dictionary, level: int) -> BigNumber:
	var rate := float(frag["base_rate"])
	rate *= Balance.tier_multiplier(int(frag["tier"]))
	rate *= Balance.level_multiplier(level)
	rate *= set_multiplier(String(frag["set_id"]))
	rate *= global_multiplier()
	return BigNumber.from_float(rate)


## Flux/sec this Fragment would produce one level higher (for the detail sheet).
func fragment_income_at_level(id: String, level: int) -> BigNumber:
	var frag := Fragments.get_by_id(id)
	if frag.is_empty():
		return BigNumber.zero()
	if _dirty:
		recompute()
	return _fragment_income_unchecked(frag, level)


func recompute() -> void:
	_dirty = false
	_recompute_sets()
	var total := BigNumber.zero()
	for id in Save.fragments().keys():
		var frag := Fragments.get_by_id(String(id))
		if frag.is_empty():
			continue
		total.add_in_place(_fragment_income_unchecked(frag, Save.fragment_level(String(id))))
	flux_per_sec = total
	rate_changed.emit(flux_per_sec)


func rate_float() -> float:
	if _dirty:
		recompute()
	return flux_per_sec.to_float()


# --- levelling (spec 4) -----------------------------------------------------

func level_cost(id: String) -> int:
	return Balance.level_cost(Save.fragment_level(id))


func can_level_up(id: String) -> bool:
	var cost := level_cost(id)
	return cost > 0 and Save.get_shards() >= cost


func level_up(id: String) -> bool:
	var cost := level_cost(id)
	if cost <= 0 or not Save.spend_shards(cost):
		return false
	Save.set_fragment_level(id, Save.fragment_level(id) + 1)
	_invalidate()
	recompute()
	Save.save_game()
	return true


## Levels a Fragment as many times as the player's Shards allow.
func level_up_max(id: String) -> int:
	var levels := 0
	while can_level_up(id):
		if not level_up(id):
			break
		levels += 1
	return levels
