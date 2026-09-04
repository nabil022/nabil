extends RefCounted

## Save schema, migration and durability (spec 8.3).

func run(t: TestCase) -> void:
	var snapshot := Save.state.duplicate(true)
	var snapshot_flux := Save.flux.duplicate_value()

	var defaults := Save.default_state()
	for key in ["version", "flux", "shards", "prisms", "fragments",
			"pulls_since_singular", "total_pulls", "last_seen_utc",
			"last_trusted_time_ok", "boosts", "cosmetics_owned", "settings", "ad_caps"]:
		t.ok(defaults.has(key), "the default save carries '%s' (spec 8.3)" % key)
	t.eq(int(defaults["version"]), Save.CURRENT_VERSION, "version is present from day one")

	# Migration fills in anything a newer build added, at both levels.
	var old := {"version": 0, "flux": 500.0, "shards": 12}
	var migrated := Save._migrate(old)
	t.eq(int(migrated["version"]), Save.CURRENT_VERSION, "an old save upgrades to the current version")
	t.eq(float(migrated["flux"]), 500.0, "migration preserves existing values")
	t.eq(int(migrated["shards"]), 12, "migration preserves existing values")
	t.ok(migrated.has("cosmetics_owned"), "migration adds new top-level keys")
	t.ok(migrated["settings"].has("fast_open"), "migration adds new nested keys")

	var partial := Save._migrate({"version": 1, "settings": {"sound": false}})
	t.eq(bool(partial["settings"]["sound"]), false, "migration keeps a set nested value")
	t.ok(partial["settings"].has("haptics"), "migration fills the rest of the nested block")

	# Round-trip through the real file.
	Save.state = Save.default_state()
	Save.flux = BigNumber.from_float(128400.5)
	Save.state["shards"] = 3820
	Save.state["prisms"] = 45
	Save.state["fragments"] = {"frag_003": {"level": 4}, "frag_017": {"level": 1}}
	Save.state["pulls_since_singular"] = 62
	Save.state["total_pulls"] = 431
	Save.save_game()
	Save.load_game()
	t.approx(Save.flux.to_float(), 128400.5, 1e-4, "Flux survives a save/load round trip")
	t.eq(Save.get_shards(), 3820, "Shards survive")
	t.eq(Save.get_prisms(), 45, "Prisms survive")
	t.eq(Save.fragment_level("frag_003"), 4, "Fragment levels survive")
	t.eq(Save.pity(), 62, "the pity counter survives")
	t.eq(Save.total_pulls(), 431, "total pulls survive")
	t.ok(int(Save.state["last_seen_utc"]) > 0, "saving stamps last_seen_utc")

	# Late-game Flux, far past a double's integer precision.
	Save.flux = BigNumber.from_parts(4.2, 320)
	Save.save_game()
	Save.load_game()
	t.eq(Save.flux.exponent, 320, "astronomically large Flux survives a round trip")

	# Currency guards.
	Save.flux = BigNumber.from_float(100.0)
	t.ok(not Save.spend_flux(BigNumber.from_float(101.0)), "cannot overspend Flux")
	t.ok(Save.spend_flux(BigNumber.from_float(40.0)), "can spend what you have")
	t.approx(Save.flux.to_float(), 60.0, 1e-6, "spending subtracts exactly")
	Save.state["shards"] = 10
	t.ok(not Save.spend_shards(11), "cannot overspend Shards")
	t.ok(Save.spend_shards(10), "can spend all Shards")
	Save.state["prisms"] = 5
	t.ok(not Save.spend_prisms(6), "cannot overspend Prisms")

	# Boosts: timed ones expire, charge-based ones are consumed.
	var now := 1000000
	Save.state["boosts"] = []
	Save.add_boost("flux_x2", 600, now)
	t.ok(Save.has_boost("flux_x2", now + 599), "a timed boost is live before it expires")
	t.ok(not Save.has_boost("flux_x2", now + 601), "a timed boost expires")
	Save.prune_boosts(now + 601)
	t.eq(Save.boosts().size(), 0, "expired boosts are pruned")
	Save.add_charge("shards_x2", 1)
	t.ok(Save.has_boost("shards_x2", now), "a charge boost is live")
	t.ok(Save.consume_charge("shards_x2"), "a charge can be consumed")
	t.ok(not Save.consume_charge("shards_x2"), "a spent charge cannot be reused")

	# Daily ad counters roll over on the UTC day boundary.
	Save.state["ad_caps"]["surge_count_today"] = 3
	Save.state["ad_caps"]["caps_day"] = 100
	Save.roll_ad_day(101 * 86400)
	t.eq(int(Save.ad_caps()["surge_count_today"]), 0, "daily ad counters reset on a new day")

	# Deleting local data really deletes it (spec 6.5).
	Save.delete_local_data()
	t.eq(Save.owned_count(), 0, "delete clears the collection")
	t.ok(Save.flux.is_zero(), "delete clears Flux")

	Save.state = snapshot
	Save.flux = snapshot_flux
	Save.save_game()
