extends RefCounted

## Rift rolling (spec 3). The distribution test is the one spec 9 M4 asks for:
## a million rolls, asserted against the table in spec 2.1.

const SAMPLES := 1000000

func run(t: TestCase) -> void:
	_test_distribution(t)
	_test_guarantees(t)
	_test_pity(t)
	_test_rigged_first_pull(t)
	_test_duplicates(t)


func _test_distribution(t: TestCase) -> void:
	var roller := RiftRoller.new(20260904)
	var counts := {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
	for _i in SAMPLES:
		counts[roller.roll_tier()] += 1

	var total := 0
	for tier in counts:
		total += int(counts[tier])
	t.eq(total, SAMPLES, "every roll produced a tier")

	for tier in range(Balance.TIER_MIN, Balance.TIER_MAX + 1):
		var p := float(Balance.TIER_CHANCE[tier]) / 100.0
		var expected := p * float(SAMPLES)
		# 5 standard deviations of a binomial: a true failure, not a flake.
		var sigma := sqrt(float(SAMPLES) * p * (1.0 - p))
		t.between(float(counts[tier]), expected - 5.0 * sigma, expected + 5.0 * sigma,
				"tier %d rate matches spec 2.1 (%.1f%%)" % [tier, p * 100.0])


func _test_guarantees(t: TestCase) -> void:
	var roller := RiftRoller.new(1234)
	for rift in Rifts.ALL:
		var id := String(rift["id"])
		var guarantee := int(rift["guarantee"])
		var slots := int(rift["fragments"])
		for _i in 400:
			var result := roller.open(id, 0, {})
			var pulls: Array = result["pulls"]
			t.eq(pulls.size(), slots, "%s yields %d Fragments" % [id, slots])
			if guarantee <= 0:
				continue
			var best := 0
			for pull in pulls:
				best = maxi(best, int(pull["tier"]))
			t.ok(best >= guarantee, "%s always contains a %s or better"
					% [id, Balance.tier_name(guarantee)])


func _test_pity(t: TestCase) -> void:
	var roller := RiftRoller.new(99)

	# One pull short of the threshold, a Faint Rift's first slot must be forced.
	var result := roller.open("faint", Balance.PITY_THRESHOLD, {})
	var pulls: Array = result["pulls"]
	t.eq(int(pulls[0]["tier"]), Balance.Tier.SINGULAR, "pity forces a Singular on the next pull")
	t.ok(int(result["pity"]) < Balance.PITY_THRESHOLD, "pity counter resets after a Singular")

	# The counter advances per PULL, not per Rift: a 7-slot Rift opened at the
	# threshold must force exactly ONE Singular, not seven.
	var big := roller.open("singularity", Balance.PITY_THRESHOLD, {})
	var singulars := 0
	for pull in big["pulls"]:
		if int(pull["tier"]) == Balance.Tier.SINGULAR:
			singulars += 1
	t.ok(singulars >= 1, "the pitied slot is a Singular")
	t.ok(singulars <= 3, "pity does not fire on every slot at once (got %d)" % singulars)

	# Without a Singular, the counter grows by exactly the number of pulls.
	var fresh := RiftRoller.new(7)
	var counter := 0
	var opens := 0
	while opens < 40:
		var res := fresh.open("faint", counter, {})
		var had_singular := false
		for pull in res["pulls"]:
			if int(pull["tier"]) == Balance.Tier.SINGULAR:
				had_singular = true
		if not had_singular:
			t.eq(int(res["pity"]), counter + 3, "pity advances once per pull")
		counter = int(res["pity"])
		opens += 1

	# Pity must be reachable: a player who never rolls one naturally still gets
	# a Singular inside the threshold.
	var streak := RiftRoller.new(4242)
	var pity := 0
	var pulls_done := 0
	var got := false
	while pulls_done < Balance.PITY_THRESHOLD + 3 and not got:
		var res2 := streak.open("faint", pity, {})
		for pull in res2["pulls"]:
			pulls_done += 1
			if int(pull["tier"]) == Balance.Tier.SINGULAR:
				got = true
		pity = int(res2["pity"])
	t.ok(got, "a Singular arrives within the pity threshold")


func _test_rigged_first_pull(t: TestCase) -> void:
	# A first pull of three greys is a bad first impression (spec 5.3).
	var roller := RiftRoller.new(555)
	for _i in 300:
		var result := roller.open("faint", 0, {}, Balance.FIRST_PULL_GUARANTEED_TIER)
		var best := 0
		for pull in result["pulls"]:
			best = maxi(best, int(pull["tier"]))
		t.ok(best >= Balance.Tier.LIT, "the rigged first pull always holds a Lit or better")


func _test_duplicates(t: TestCase) -> void:
	var roller := RiftRoller.new(31337)
	var owned := {}
	for frag in Fragments.ALL:
		owned[String(frag["id"])] = true
	var result := roller.open("singularity", 0, owned)
	for pull in result["pulls"]:
		t.ok(not bool(pull["is_new"]), "a full collection yields only duplicates")
		t.eq(int(pull["shards"]), Balance.shards_for_duplicate(int(pull["tier"])),
				"duplicate Shards match the tier table")

	# Two copies inside one Rift: the second is a duplicate, not a second "new".
	var empty_roller := RiftRoller.new(2)
	var seen_new := {}
	var res := empty_roller.open("singularity", 0, {})
	for pull in res["pulls"]:
		var id := String(pull["id"])
		if bool(pull["is_new"]):
			t.ok(not seen_new.has(id), "the same Fragment is never 'new' twice in one Rift")
			seen_new[id] = true
