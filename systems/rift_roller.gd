class_name RiftRoller
extends RefCounted

## Rift rolling: odds, guarantees and pity (spec 3).
##
## Deliberately pure -- it reads a pity counter and a set of owned ids, and
## returns what was pulled without touching global state. That is what makes the
## distribution testable over a million rolls (tests/test_rift_roller.gd).

var rng := RandomNumberGenerator.new()

## Cumulative tier thresholds, built once from Balance.TIER_CHANCE.
var _cumulative: Array[float] = []
var _by_tier: Dictionary = {}


func _init(seed_value: int = -1) -> void:
	if seed_value >= 0:
		rng.seed = seed_value
	else:
		rng.randomize()
	var acc := 0.0
	for tier in range(Balance.TIER_MIN, Balance.TIER_MAX + 1):
		acc += float(Balance.TIER_CHANCE[tier])
		_cumulative.append(acc)
		var ids: Array[int] = []
		for i in Fragments.ALL.size():
			if int(Fragments.ALL[i]["tier"]) == tier:
				ids.append(i)
		_by_tier[tier] = ids


## One weighted tier draw. No pity, no guarantee -- this is the raw table in
## spec 2.1, and the distribution test asserts against exactly this.
func roll_tier() -> int:
	var r := rng.randf() * 100.0
	for i in _cumulative.size():
		if r < _cumulative[i]:
			return Balance.TIER_MIN + i
	return Balance.TIER_MAX


func random_fragment_index(tier: int) -> int:
	var ids: Array = _by_tier.get(tier, [])
	if ids.is_empty():
		return -1
	return int(ids[rng.randi_range(0, ids.size() - 1)])


## Opens one Rift.
##
## `owned` maps fragment id -> anything (only key presence is read), so the
## caller's save state is never mutated here. `rig_tier` forces a minimum best
## tier and is used exactly once, for the rigged first pull (spec 5.3).
##
## Returns { "pulls": Array[Dictionary], "pity": int }, where each pull is
## { id, index, tier, is_new, shards }.
func open(rift_id: String, pity: int, owned: Dictionary, rig_tier: int = 0) -> Dictionary:
	var slots := Rifts.fragments_in(rift_id)
	if slots <= 0:
		push_error("RiftRoller.open: unknown Rift '%s'" % rift_id)
		return {"pulls": [], "pity": pity}

	var tiers: Array[int] = []
	var pity_counter := pity
	for _i in slots:
		# The pity counter advances per PULL, not per Rift. Rolling every slot
		# first and only then checking pity would fire it on all of them at once.
		var tier: int
		if pity_counter >= Balance.PITY_THRESHOLD:
			tier = Balance.Tier.SINGULAR
		else:
			tier = roll_tier()
		pity_counter = 0 if tier == Balance.Tier.SINGULAR else pity_counter + 1
		tiers.append(tier)

	# Guarantees: roll every slot normally, then if the guarantee is unmet,
	# re-roll the last slot restricted to the guaranteed tier or above (spec 3).
	var guarantee := maxi(Rifts.guarantee_of(rift_id), rig_tier)
	if guarantee > 0:
		var best := 0
		for t in tiers:
			best = maxi(best, t)
		if best < guarantee:
			tiers[tiers.size() - 1] = _roll_at_least(guarantee)
			if tiers[tiers.size() - 1] == Balance.Tier.SINGULAR:
				pity_counter = 0

	var seen: Dictionary = {}
	var pulls: Array[Dictionary] = []
	for tier in tiers:
		var index := random_fragment_index(tier)
		var frag: Dictionary = Fragments.ALL[index]
		var id := String(frag["id"])
		var is_new: bool = not owned.has(id) and not seen.has(id)
		seen[id] = true
		pulls.append({
			"id": id,
			"index": index,
			"tier": tier,
			"is_new": is_new,
			"shards": 0 if is_new else Balance.shards_for_duplicate(tier),
		})
	return {"pulls": pulls, "pity": pity_counter}


## Draws a tier restricted to `min_tier` or above, keeping the relative weights
## of the tiers that remain. Used only to satisfy a Rift guarantee.
func _roll_at_least(min_tier: int) -> int:
	var total := 0.0
	for tier in range(min_tier, Balance.TIER_MAX + 1):
		total += float(Balance.TIER_CHANCE[tier])
	if total <= 0.0:
		return min_tier
	var r := rng.randf() * total
	var acc := 0.0
	for tier in range(min_tier, Balance.TIER_MAX + 1):
		acc += float(Balance.TIER_CHANCE[tier])
		if r < acc:
			return tier
	return Balance.TIER_MAX
