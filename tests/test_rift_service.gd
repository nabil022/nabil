extends RefCounted

## End-to-end purchase flow: paying for a Rift, applying what came out, and the
## rewards hanging off it (spec 3, 4, 5.1, 7.3).

func run(t: TestCase) -> void:
	var snapshot := Save.state.duplicate(true)
	var snapshot_flux := Save.flux.duplicate_value()

	Save.state = Save.default_state()
	Save.flux = BigNumber.zero()
	Economy.recompute()
	RiftService.set_roller(RiftRoller.new(4711))

	# With no Flux, nothing can be bought.
	t.ok(not RiftService.can_afford("faint"), "a broke player cannot afford a Faint Rift")
	t.eq(RiftService.purchase("faint"), [] as Array[Dictionary],
			"an unaffordable purchase yields nothing")
	t.eq(Save.total_pulls(), 0, "a failed purchase makes no pulls")

	# A brand new player pays exactly the spec 3 table price.
	t.approx(RiftService.cost("faint").to_float(), Balance.RIFT_COSTS["faint"], 1e-6,
			"a new player pays the published Faint Rift price")
	t.approx(RiftService.shortfall("faint").to_float(), Balance.RIFT_COSTS["faint"], 1e-6,
			"the shortfall is the whole price when Flux is zero")

	Save.flux = BigNumber.from_float(500.0)
	var price := RiftService.cost("faint")
	var pulls := RiftService.purchase("faint")
	t.eq(pulls.size(), 3, "a Faint Rift yields three Fragments")
	t.approx(Save.flux.to_float(), 500.0 - price.to_float(), 1e-4,
			"the purchase spends exactly the listed price")
	t.eq(Save.total_pulls(), 3, "total pulls advances by the Rift's size")
	t.ok(Save.owned_count() > 0, "new Fragments land in the collection")
	t.eq(int(Save.state["stats"]["rifts_opened"].get("faint", 0)), 1, "the Rift is counted")

	# The free Rift costs nothing but is otherwise a normal opening.
	var flux_before := Save.flux.to_float()
	var free_pulls := RiftService.open_free("faint")
	t.eq(free_pulls.size(), 3, "a free Rift still yields three Fragments")
	t.approx(Save.flux.to_float(), flux_before, 1e-4, "a free Rift spends no Flux")

	# Duplicates convert to Shards automatically -- progress, never waste.
	for frag in Fragments.ALL:
		Save.grant_fragment(String(frag["id"]))
	Save.state["shards"] = 0
	Save.flux = BigNumber.from_float(1e12)
	var dup_pulls := RiftService.purchase("faint")
	var expected_shards := 0
	for pull in dup_pulls:
		t.ok(not bool(pull["is_new"]), "a full collection yields only duplicates")
		expected_shards += int(pull["shards"])
	t.eq(Save.get_shards(), expected_shards, "duplicate Shards are credited exactly")

	# The x2 Shards reward applies to the NEXT opening, once.
	Save.state["shards"] = 0
	Save.add_charge("shards_x2", 1)
	var boosted := RiftService.purchase("faint")
	var boosted_total := 0
	for pull in boosted:
		boosted_total += int(pull["shards"])
	t.eq(Save.get_shards(), boosted_total, "the boosted opening credits its Shards")
	t.ok(not Save.has_boost("shards_x2", TimeGuard.now_utc()),
			"the x2 Shards charge is spent by one opening")
	Save.state["shards"] = 0
	var after := RiftService.purchase("faint")
	var after_total := 0
	for pull in after:
		after_total += int(pull["shards"])
	t.ok(boosted_total >= after_total,
			"the boosted opening paid at least as much as an unboosted one")

	# Prisms come from milestones and are cosmetic-only currency.
	t.ok(Save.get_prisms() > 0, "completing the collection awards milestone Prisms")

	# Open x10 charges the price the button showed, and delivers all ten.
	Save.state = Save.default_state()
	Save.flux = BigNumber.from_float(50000.0)
	Economy.recompute()
	var unit := RiftService.cost("faint")
	var bulk := RiftService.purchase_bulk("faint", Balance.RIFT_BULK_COUNT)
	t.eq(bulk.size(), 3 * Balance.RIFT_BULK_COUNT, "Open x10 yields ten Rifts' worth")
	t.approx(Save.flux.to_float(),
			50000.0 - unit.to_float() * float(Balance.RIFT_BULK_COUNT), 1e-3,
			"Open x10 charges exactly ten times the displayed price")
	t.eq(Save.total_pulls(), bulk.size(), "every bulk pull is counted")

	# A bulk buy short of the full price buys as many as the Flux covers, and
	# never overdraws.
	Save.state = Save.default_state()
	Save.flux = BigNumber.from_float(1200.0)
	Economy.recompute()
	var partial := RiftService.purchase_bulk("faint", Balance.RIFT_BULK_COUNT)
	t.eq(partial.size(), 6, "1,200 Flux buys two 500-Flux Rifts, not ten")
	t.ok(not Save.flux.is_negative(), "Flux never goes negative")
	t.approx(Save.flux.to_float(), 200.0, 1e-4, "the remainder is left in the wallet")

	RiftService.set_roller(null)
	Save.state = snapshot
	Save.flux = snapshot_flux
	Economy.recompute()
	Save.save_game()
