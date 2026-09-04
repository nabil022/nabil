extends RefCounted

## Income calculation (spec 4). Mutates the live save, so it snapshots and
## restores the player's state around itself.

func run(t: TestCase) -> void:
	var snapshot := Save.state.duplicate(true)
	var snapshot_flux := Save.flux.duplicate_value()

	Save.state = Save.default_state()
	Save.flux = BigNumber.zero()
	Economy.recompute()
	t.ok(Economy.flux_per_sec.is_zero(), "no Fragments means no income")

	# One Fragment at level 1: base_rate x tier_multiplier.
	var frag: Dictionary = Fragments.of_tier(3)[0]
	var id := String(frag["id"])
	Save.grant_fragment(id)
	Economy.recompute()
	var expected := float(frag["base_rate"]) * Balance.tier_multiplier(3)
	t.approx(Economy.flux_per_sec.to_float(), expected, 1e-6,
			"income = base_rate x tier_multiplier at level 1")

	# Levels add a flat +15% each, never compounding.
	Save.set_fragment_level(id, 5)
	Economy.recompute()
	t.approx(Economy.flux_per_sec.to_float(), expected * (1.0 + 0.15 * 4.0), 1e-6,
			"level 5 is +60%, additive")
	Save.set_fragment_level(id, Balance.LEVEL_MIN)

	# Completing a set grants +15% to that set's Fragments.
	var set_id := String(frag["set_id"])
	var members := Fragments.of_set(set_id)
	for m in members:
		Save.grant_fragment(String(m["id"]))
	Economy.recompute()
	t.ok(Economy.is_set_complete(set_id), "the set reads as complete")
	var set_total := 0.0
	for m in members:
		set_total += float(m["base_rate"]) * Balance.tier_multiplier(int(m["tier"]))
	t.approx(Economy.flux_per_sec.to_float(), set_total * (1.0 + Balance.SET_COMPLETE_BONUS),
			1e-5, "a completed set pays +15% to its members")

	# Completing all 8 grants +50% globally, on top of every set bonus.
	for f in Fragments.ALL:
		Save.grant_fragment(String(f["id"]))
	Economy.recompute()
	t.eq(Economy.completed_set_count(), Balance.SET_COUNT, "all 8 sets complete")
	var all_total := 0.0
	for f in Fragments.ALL:
		all_total += float(f["base_rate"]) * Balance.tier_multiplier(int(f["tier"]))
	var expected_all := all_total * (1.0 + Balance.SET_COMPLETE_BONUS) \
			* (1.0 + Balance.ALL_SETS_BONUS)
	t.approx(Economy.flux_per_sec.to_float(), expected_all, expected_all * 1e-6,
			"the full collection pays every bonus")

	# Levelling spends Shards and raises income.
	Save.state["shards"] = 1000
	var before := Economy.flux_per_sec.to_float()
	var cost := Balance.level_cost(Balance.LEVEL_MIN)
	t.ok(Economy.level_up(id), "level up succeeds when Shards allow")
	t.eq(Save.get_shards(), 1000 - cost, "levelling spends exactly the listed Shards")
	t.eq(Save.fragment_level(id), Balance.LEVEL_MIN + 1, "level increases by one")
	t.ok(Economy.flux_per_sec.to_float() > before, "levelling raises total income")

	Save.state["shards"] = 0
	t.ok(not Economy.can_level_up(id), "cannot level with no Shards")
	t.ok(not Economy.level_up(id), "level up refuses when unaffordable")

	# A maxed Fragment cannot be levelled further.
	Save.set_fragment_level(id, Balance.LEVEL_MAX)
	Save.state["shards"] = 100000000
	t.ok(not Economy.can_level_up(id), "cannot level past the maximum")

	# The x2 Flux surge multiplies income while it is live, and only then.
	var now := TimeGuard.now_utc()
	Economy.recompute()
	var plain := Economy.flux_per_sec.to_float()
	Save.add_boost("flux_x2", 600, now)
	Economy.recompute()
	t.approx(Economy.flux_per_sec.to_float(), plain * Balance.AD_SURGE_MULTIPLIER,
			plain * 1e-6, "an active surge doubles income")
	Save.state["boosts"] = []
	Economy.recompute()
	t.approx(Economy.flux_per_sec.to_float(), plain, plain * 1e-6,
			"income returns to normal when the surge ends")

	Save.state = snapshot
	Save.flux = snapshot_flux
	Economy.recompute()
