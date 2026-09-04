class_name Cosmetics
extends RefCounted

## Cosmetics and IAP products (spec 6.4, 7.4).
##
## Everything here is decoration. Nothing in this file may affect income, odds
## or progression speed -- that is what makes real-money purchases safe to ship
## and keeps the game outside loot-box rules (spec 5.1, 7.1).

const KIND_THEME := "theme"        ## Opening-animation theme.
const KIND_BACKGROUND := "background"  ## Collection screen background.
const KIND_FRAME := "frame"        ## Sigil frame style.

const ALL: Array[Dictionary] = [
	# --- opening-animation themes ---
	{"id": "theme_void", "kind": KIND_THEME, "name": "Void",
		"blurb": "The default tear. Quiet and black.", "prisms": 0,
		"color": Color(0.42, 0.55, 0.95)},
	{"id": "theme_ember", "kind": KIND_THEME, "name": "Ember",
		"blurb": "Rifts open in slow embers.", "prisms": 120,
		"color": Color(0.98, 0.52, 0.24)},
	{"id": "theme_tide", "kind": KIND_THEME, "name": "Tide",
		"blurb": "Fragments surface as if from water.", "prisms": 120,
		"color": Color(0.28, 0.86, 0.78)},

	# --- collection backgrounds ---
	{"id": "bg_null", "kind": KIND_BACKGROUND, "name": "Null Field",
		"blurb": "Flat dark. Lets the sigils carry it.", "prisms": 0,
		"color": Color(0.031, 0.035, 0.055)},
	{"id": "bg_lattice", "kind": KIND_BACKGROUND, "name": "Lattice",
		"blurb": "A faint grid beneath the collection.", "prisms": 90,
		"color": Color(0.05, 0.06, 0.10)},
	{"id": "bg_deep", "kind": KIND_BACKGROUND, "name": "Deep",
		"blurb": "Cold blue, far down.", "prisms": 90,
		"color": Color(0.03, 0.05, 0.11)},

	# --- sigil frames ---
	{"id": "frame_none", "kind": KIND_FRAME, "name": "None",
		"blurb": "No frame.", "prisms": 0, "style": 0,
		"color": Color(1, 1, 1)},
	{"id": "frame_ring", "kind": KIND_FRAME, "name": "Ring",
		"blurb": "A thin ring around every sigil.", "prisms": 75, "style": 1,
		"color": Color(0.75, 0.80, 0.95)},
	{"id": "frame_dashed", "kind": KIND_FRAME, "name": "Severed Ring",
		"blurb": "A broken ring that turns slowly.", "prisms": 75, "style": 2,
		"color": Color(0.95, 0.82, 0.45)},
]

## Cosmetics every player owns from the start.
const DEFAULTS := ["theme_void", "bg_null", "frame_none"]

## Real-money products (spec 7.4). Prism bundles at three price points, two
## cosmetic themes purchasable directly, and one cosmetic-only Founder's Set.
## `price` is display text only; the store is the source of truth at runtime.
const IAP_PRODUCTS: Array[Dictionary] = [
	{"id": "prisms_small", "name": "Handful of Prisms", "price": "$1.99",
		"prisms": 120, "grants": []},
	{"id": "prisms_medium", "name": "Cluster of Prisms", "price": "$4.99",
		"prisms": 340, "grants": []},
	{"id": "prisms_large", "name": "Cascade of Prisms", "price": "$9.99",
		"prisms": 750, "grants": []},
	{"id": "theme_ember_direct", "name": "Ember Theme", "price": "$1.99",
		"prisms": 0, "grants": ["theme_ember"]},
	{"id": "theme_tide_direct", "name": "Tide Theme", "price": "$1.99",
		"prisms": 0, "grants": ["theme_tide"]},
	{"id": "founders_set", "name": "Founder's Set", "price": "$7.99", "prisms": 0,
		"grants": ["theme_ember", "theme_tide", "bg_lattice", "bg_deep",
			"frame_ring", "frame_dashed"]},
]


static func get_cosmetic(id: String) -> Dictionary:
	for c in ALL:
		if c["id"] == id:
			return c
	return {}


static func of_kind(kind: String) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for c in ALL:
		if c["kind"] == kind:
			out.append(c)
	return out


static func get_product(id: String) -> Dictionary:
	for p in IAP_PRODUCTS:
		if p["id"] == id:
			return p
	return {}


static func is_default(id: String) -> bool:
	return DEFAULTS.has(id)
