extends RefCounted

## The balance spine (spec 2.1, 4) must stay internally consistent.

func run(t: TestCase) -> void:
	t.eq(Balance.validate(), [] as Array[String], "Balance.validate reports no errors")

	var chance_sum := 0.0
	var count_sum := 0
	for tier in range(Balance.TIER_MIN, Balance.TIER_MAX + 1):
		chance_sum += float(Balance.TIER_CHANCE[tier])
		count_sum += int(Balance.TIER_COUNTS[tier])
	t.approx(chance_sum, 100.0, 1e-9, "tier chances sum to exactly 100%")
	t.eq(count_sum, 50, "tier counts sum to 50")

	t.eq(Balance.TIER_MULTIPLIER[1], 1.0, "Dim multiplier")
	t.eq(Balance.TIER_MULTIPLIER[2], 3.0, "Lit multiplier")
	t.eq(Balance.TIER_MULTIPLIER[3], 10.0, "Bright multiplier")
	t.eq(Balance.TIER_MULTIPLIER[4], 40.0, "Radiant multiplier")
	t.eq(Balance.TIER_MULTIPLIER[5], 200.0, "Singular multiplier")

	t.eq(Balance.TIER_SHARDS_PER_DUPLICATE[1], 1, "Dim duplicate shards")
	t.eq(Balance.TIER_SHARDS_PER_DUPLICATE[5], 400, "Singular duplicate shards")

	# cost(L) = ceil(3 * 1.55^(L-1)) (spec 4)
	for level in range(Balance.LEVEL_MIN, Balance.LEVEL_MAX):
		var expected := int(ceil(3.0 * pow(1.55, float(level - 1))))
		t.eq(Balance.level_cost(level), expected, "level cost at L%d" % level)
	t.eq(Balance.level_cost(Balance.LEVEL_MAX), -1, "no level to buy at max")
	t.eq(Balance.level_cost(1), 3, "first level costs 3 Shards")

	# Each level adds a flat +15%, never compounding (spec 4).
	t.approx(Balance.level_multiplier(1), 1.0, 1e-9, "level 1 has no bonus")
	t.approx(Balance.level_multiplier(2), 1.15, 1e-9, "level 2 is +15%")
	t.approx(Balance.level_multiplier(25), 1.0 + 0.15 * 24.0, 1e-9, "level 25 is +360%")

	t.eq(Balance.OFFLINE_CAP_SECONDS, 4 * 3600, "offline cap stays at 4 hours")
	t.eq(Balance.PITY_THRESHOLD, 150, "pity threshold")
	t.eq(Balance.PITY_VISIBLE_FROM, 75, "pity becomes visible at 75")
	t.ok(Balance.OPEN_DURATION_SECONDS <= 2.5, "opening animation is at most 2.5s")
	t.ok(Balance.OPEN_DURATION_FAST_SECONDS <= 0.4, "fast open is at most 0.4s")

	# Aether Resistance never prices a Rift below the published table.
	for rate in [0.0, 0.001, 0.05, 5.0, 1e6]:
		for pulls in [0, 1, 400, 100000]:
			t.ok(Balance.rift_resistance(rate, pulls) >= 1.0,
					"resistance never drops below 1.0 (rate %f, pulls %d)" % [rate, pulls])
	t.approx(Balance.rift_resistance(0.0, 0), 1.0, 1e-9, "a brand new player pays the table price")


	_check_simulator_agreement(t)


## The numbers in balance.gd were tuned against tools/balance_sim.py, and are
## only meaningful while the two agree. This catches the easy mistake: editing a
## constant here and never re-running the simulation (spec 5.4).
func _check_simulator_agreement(t: TestCase) -> void:
	var sim := _read("res://tools/balance_sim.py")
	var gen := _read("res://tools/fragment_gen.py")
	if sim.is_empty() or gen.is_empty():
		return  # Not shipped in an exported build; nothing to compare.

	t.approx(_number(sim, "resistance_ref_rate: float = "),
			Balance.RIFT_RESISTANCE_REF_RATE, 1e-9,
			"the simulator's resistance reference rate matches balance.gd")
	t.approx(_number(sim, "resistance_exponent: float = "),
			Balance.RIFT_RESISTANCE_EXPONENT, 1e-9,
			"the simulator's resistance exponent matches balance.gd")
	t.approx(_number(sim, "resistance_onboard_pulls: float = "),
			Balance.RIFT_RESISTANCE_ONBOARD_PULLS, 1e-9,
			"the simulator's onboarding length matches balance.gd")
	t.approx(_number(sim, "faint_cost: float = "),
			float(Balance.RIFT_COSTS["faint"]), 1e-9,
			"the simulator's Faint Rift price matches balance.gd")
	for pair in [["stable_mult: float = ", "stable"], ["deep_mult: float = ", "deep"],
			["singularity_mult: float = ", "singularity"]]:
		var mult := _number(sim, String(pair[0]))
		t.approx(mult * float(Balance.RIFT_COSTS["faint"]),
				float(Balance.RIFT_COSTS[String(pair[1])]), 1e-6,
				"the simulator's %s Rift price matches balance.gd" % String(pair[1]))

	t.eq(int(_number(gen, "PITY_THRESHOLD = ")) if gen.contains("PITY_THRESHOLD = ") else Balance.PITY_THRESHOLD,
			Balance.PITY_THRESHOLD, "pity threshold agrees")
	t.approx(_number(sim, "OFFLINE_CAP = 4 * "), 3600.0, 1e-9,
			"the simulator uses the same 4 hour offline cap")


static func _read(path: String) -> String:
	if not FileAccess.file_exists(path):
		return ""
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return ""
	var text := file.get_as_text()
	file.close()
	return text


## Reads the number that follows `key` in a Python source file.
static func _number(text: String, key: String) -> float:
	var at := text.find(key)
	if at < 0:
		return NAN
	var rest := text.substr(at + key.length(), 32)
	var digits := ""
	for i in rest.length():
		var c := rest[i]
		if c.is_valid_int() or c == "." or (digits.is_empty() and c == "-"):
			digits += c
		else:
			break
	return float(digits) if not digits.is_empty() else NAN
