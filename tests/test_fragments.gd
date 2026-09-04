extends RefCounted

## The 50 definitions (spec 2.2, 2.4) are frozen constants; guard their shape.

func run(t: TestCase) -> void:
	t.eq(Fragments.ALL.size(), 50, "there are exactly 50 Fragments")

	var ids := {}
	var names := {}
	var seeds := {}
	var tier_counts := {}
	for frag in Fragments.ALL:
		var id := String(frag["id"])
		ids[id] = true
		names[String(frag["name"])] = true
		seeds[int(frag["seed"])] = true
		var tier := int(frag["tier"])
		tier_counts[tier] = int(tier_counts.get(tier, 0)) + 1
		t.ok(tier >= Balance.TIER_MIN and tier <= Balance.TIER_MAX, "%s has a valid tier" % id)
		t.ok(float(frag["base_rate"]) > 0.0, "%s has a positive base_rate" % id)
		# Seeds must survive a 32-bit shader float exactly.
		t.ok(int(frag["seed"]) > 0 and int(frag["seed"]) < 16777216,
				"%s seed is below 2^24" % id)
		t.ok(String(frag["name"]).split(" ").size() == 2, "%s name is two words" % id)

	t.eq(ids.size(), 50, "all ids unique")
	t.eq(names.size(), 50, "all names unique")
	t.eq(seeds.size(), 50, "all seeds unique")
	for tier in range(Balance.TIER_MIN, Balance.TIER_MAX + 1):
		t.eq(int(tier_counts.get(tier, 0)), int(Balance.TIER_COUNTS[tier]),
				"tier %d has the right number of Fragments" % tier)

	# Sets: 8 of them, 5-8 members each, mixed across tiers so none is trivial.
	var set_ids := Fragments.set_ids()
	t.eq(set_ids.size(), Balance.SET_COUNT, "there are 8 sets")
	var total := 0
	for set_id in set_ids:
		var members := Fragments.of_set(set_id)
		total += members.size()
		t.between(float(members.size()), 5.0, 8.0, "%s has 5-8 members" % set_id)
		var best := 0
		for m in members:
			best = maxi(best, int(m["tier"]))
		t.ok(best >= Balance.Tier.RADIANT,
				"%s is not trivially completable (holds a Radiant or better)" % set_id)
	t.eq(total, 50, "every Fragment belongs to exactly one set")

	t.eq(Fragments.get_by_id("frag_001")["id"], "frag_001", "lookup by id")
	t.eq(Fragments.get_by_id("nope"), {}, "unknown id returns empty")
	t.eq(Fragments.index_of("frag_050"), 49, "index lookup")
