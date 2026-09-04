class_name Rifts
extends RefCounted

## Rift configuration, odds and guarantees (spec 3).
##
## All Rifts are bought with Flux, the soft currency earned by playing. No Rift
## is ever purchasable with real money -- that is a hard rule (spec 7.1), and it
## is what keeps the game outside loot-box regulation. Nothing in this file, or
## anywhere else, may add a real-money path to a randomised outcome.

const ALL: Array[Dictionary] = [
	{
		"id": "faint",
		"name": "Faint Rift",
		"fragments": 3,
		"guarantee": 0,
		"blurb": "A thin tear. Three Fragments, no promises.",
	},
	{
		"id": "stable",
		"name": "Stable Rift",
		"fragments": 5,
		"guarantee": 3,
		"blurb": "Five Fragments, at least one Bright.",
	},
	{
		"id": "deep",
		"name": "Deep Rift",
		"fragments": 5,
		"guarantee": 4,
		"blurb": "Five Fragments, at least one Radiant.",
	},
	{
		"id": "singularity",
		"name": "Singularity Rift",
		"fragments": 7,
		"guarantee": 5,
		"blurb": "Seven Fragments, at least one Singular.",
	},
]


static func get_rift(id: String) -> Dictionary:
	for r in ALL:
		if r["id"] == id:
			return r
	return {}


static func ids() -> Array[String]:
	var out: Array[String] = []
	for r in ALL:
		out.append(String(r["id"]))
	return out


static func fragments_in(id: String) -> int:
	return int(get_rift(id).get("fragments", 0))


static func guarantee_of(id: String) -> int:
	return int(get_rift(id).get("guarantee", 0))


## Current price, including Aether Resistance (see Balance.rift_resistance).
static func cost(id: String, flux_per_sec: float, total_pulls: int) -> BigNumber:
	var base := float(Balance.RIFT_COSTS.get(id, 0.0))
	return BigNumber.from_float(base * Balance.rift_resistance(flux_per_sec, total_pulls))


static func base_cost(id: String) -> float:
	return float(Balance.RIFT_COSTS.get(id, 0.0))


## Rows for the odds screen (spec 7.2). Google Play requires the odds of every
## outcome to be disclosed before the player commits, reachable in one tap.
static func odds_rows() -> Array[Dictionary]:
	var rows: Array[Dictionary] = []
	for tier in range(Balance.TIER_MIN, Balance.TIER_MAX + 1):
		rows.append({
			"tier": tier,
			"name": Balance.tier_name(tier),
			"chance": float(Balance.TIER_CHANCE[tier]),
			"count": int(Balance.TIER_COUNTS[tier]),
		})
	return rows


static func guarantee_rows() -> Array[Dictionary]:
	var rows: Array[Dictionary] = []
	for r in ALL:
		var g := int(r["guarantee"])
		rows.append({
			"name": String(r["name"]),
			"fragments": int(r["fragments"]),
			"guarantee": ("None" if g == 0
					else "At least one %s or better" % Balance.tier_name(g)),
		})
	return rows
