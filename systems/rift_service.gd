class_name RiftService
extends RefCounted

## Buying and opening Rifts, and applying what comes out (spec 3, 4).
##
## Kept separate from RiftRoller so the roller stays pure and testable: the
## roller decides what was pulled, this applies it to the save.

static var _roller: RiftRoller


static func roller() -> RiftRoller:
	if _roller == null:
		_roller = RiftRoller.new()
	return _roller


## Test seam: pin the RNG.
static func set_roller(r: RiftRoller) -> void:
	_roller = r


static func cost(rift_id: String) -> BigNumber:
	return Rifts.cost(rift_id, Economy.rate_float(), Save.total_pulls())


static func can_afford(rift_id: String, count: int = 1) -> bool:
	return Save.flux.gte(cost(rift_id).mul_scalar(float(count)))


## Flux still needed to afford this Rift, or zero.
static func shortfall(rift_id: String) -> BigNumber:
	var price := cost(rift_id)
	if Save.flux.gte(price):
		return BigNumber.zero()
	return price.sub(Save.flux)


## Buys and opens one Rift. Returns the pulls, or [] if unaffordable.
static func purchase(rift_id: String) -> Array[Dictionary]:
	var price := cost(rift_id)
	if not Save.spend_flux(price):
		return []
	return _open(rift_id, 0)


## "Open x10" for Faint Rifts (spec 3).
##
## The whole batch is priced at the figure on screen when the button was
## pressed. Re-pricing per Rift would be more literal -- resistance climbs with
## every pull -- but it silently delivers seven Rifts when the button said ten,
## and a button that lies is worse than a rounding error in the economy.
static func purchase_bulk(rift_id: String, count: int) -> Array[Dictionary]:
	var unit := cost(rift_id)
	if unit.is_zero() or count <= 0:
		return []
	var affordable := int(floor(Save.flux.div(unit).to_float()))
	var buying := mini(count, maxi(0, affordable))
	if buying <= 0:
		return []
	if not Save.spend_flux(unit.mul_scalar(float(buying))):
		return []
	var all: Array[Dictionary] = []
	for _i in buying:
		all.append_array(_open(rift_id, 0))
	return all


## Opens a Rift the player did not pay for: the first-launch gift and the
## rewarded-ad free Rift (spec 5.3, 7.3).
static func open_free(rift_id: String, rig_tier: int = 0) -> Array[Dictionary]:
	return _open(rift_id, rig_tier)


static func _open(rift_id: String, rig_tier: int) -> Array[Dictionary]:
	var result := roller().open(rift_id, Save.pity(), Save.fragments(), rig_tier)
	var pulls: Array[Dictionary] = result["pulls"]

	# x2 Shards from the next opening is a per-OPENING reward, not per pull.
	var shard_mult := 1.0
	if Save.consume_charge("shards_x2"):
		shard_mult = Balance.AD_SHARD_MULTIPLIER

	var gained_shards := 0
	for pull in pulls:
		if bool(pull["is_new"]):
			Save.grant_fragment(String(pull["id"]))
		else:
			var shards := int(round(float(pull["shards"]) * shard_mult))
			pull["shards"] = shards
			gained_shards += shards
	if gained_shards > 0:
		Save.add_shards(gained_shards)

	Save.set_pity(int(result["pity"]))
	Save.add_pulls(pulls.size())
	Save.note_rift_opened(rift_id)
	Save.set_flag("first_pull_done", true)
	_award_milestones()
	Economy.recompute()
	Save.save_game()
	return pulls


## Prisms come from milestones, ads and IAP (spec 5.1). They buy cosmetics and
## nothing else, so awarding them can never affect pacing.
static func _award_milestones() -> void:
	var stats: Dictionary = Save.state.get("stats", {})
	var awarded: Dictionary = stats.get("prism_milestones", {})
	var total := 0

	if not awarded.has("first_singular"):
		for id in Save.fragments().keys():
			if int(Fragments.get_by_id(String(id)).get("tier", 0)) == Balance.Tier.SINGULAR:
				awarded["first_singular"] = true
				total += Balance.PRISM_MILESTONE_FIRST_SINGULAR
				break

	for set_id in Fragments.set_ids():
		var key := "set_" + set_id
		if awarded.has(key) or not Economy.is_set_complete(set_id):
			continue
		awarded[key] = true
		total += Balance.PRISM_MILESTONE_PER_SET

	var tens := int(Save.owned_count() / 10)
	for step in range(1, tens + 1):
		var key_c := "collected_%d" % (step * 10)
		if awarded.has(key_c):
			continue
		awarded[key_c] = true
		total += Balance.PRISM_MILESTONE_PER_10_COLLECTED

	stats["prism_milestones"] = awarded
	Save.state["stats"] = stats
	if total > 0:
		Save.add_prisms(total)


## Pity progress, shown once it passes the threshold in spec 3.
static func pity_visible() -> bool:
	return Save.pity() >= Balance.PITY_VISIBLE_FROM


static func pity_text() -> String:
	return "Singular guaranteed in %d pulls" % maxi(0, Balance.PITY_THRESHOLD - Save.pity())
