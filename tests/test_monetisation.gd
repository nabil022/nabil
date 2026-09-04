extends RefCounted

## The structural rule (spec 7.1): real money never buys a randomised outcome.
##
## This is the test that has to keep passing forever. It is what keeps the game
## outside loot-box regulation in Belgium, the Netherlands and elsewhere, and it
## is the single biggest source of store-review risk if it ever breaks.

func run(t: TestCase) -> void:
	var rift_ids := Rifts.ids()

	for product in Cosmetics.IAP_PRODUCTS:
		var id := String(product["id"])
		# A real-money product may grant Prisms and cosmetics. Nothing else.
		for key in product.keys():
			t.ok(key in ["id", "name", "price", "prisms", "grants"],
					"IAP product '%s' has no unexpected field '%s'" % [id, key])
		for granted in product.get("grants", []):
			var cosmetic := Cosmetics.get_cosmetic(String(granted))
			t.ok(not cosmetic.is_empty(),
					"IAP product '%s' grants only known cosmetics" % id)
			t.ok(not rift_ids.has(String(granted)),
					"IAP product '%s' never grants a Rift" % id)
		t.ok(not product.has("flux"), "IAP product '%s' never grants Flux" % id)
		t.ok(not product.has("shards"), "IAP product '%s' never grants Shards" % id)
		t.ok(not product.has("rifts"), "IAP product '%s' never grants Rifts" % id)

	# Cosmetics are decoration: no cosmetic may carry an income, odds or speed
	# field, now or after anyone edits this table.
	for cosmetic in Cosmetics.ALL:
		for key in cosmetic.keys():
			t.ok(key in ["id", "kind", "name", "blurb", "prisms", "color", "style"],
					"cosmetic '%s' has no unexpected field '%s'" % [cosmetic["id"], key])
		t.ok(cosmetic["kind"] in [Cosmetics.KIND_THEME, Cosmetics.KIND_BACKGROUND,
				Cosmetics.KIND_FRAME], "cosmetic '%s' is a known kind" % cosmetic["id"])

	# Every Rift is priced in Flux, and Flux is never sold.
	for rift_id in rift_ids:
		t.ok(Rifts.base_cost(rift_id) > 0.0, "%s costs Flux" % rift_id)
	for product in Cosmetics.IAP_PRODUCTS:
		t.eq(int(product.get("prisms", 0)) >= 0, true, "Prism grants are non-negative")

	# Prisms buy cosmetics only.
	for cosmetic in Cosmetics.ALL:
		t.ok(int(cosmetic["prisms"]) >= 0, "cosmetic prices are non-negative")

	# Ads are rewarded video only: no interstitial or banner placement exists.
	for placement in Ads.PLACEMENTS:
		t.ok(not placement.contains("interstitial"), "no interstitial placement")
		t.ok(not placement.contains("banner"), "no banner placement")
	t.eq(Ads.PLACEMENTS.size(), 4, "exactly the four rewarded placements in spec 7.3")

	# Odds disclosure is complete and reachable (spec 7.2).
	var rows := Rifts.odds_rows()
	t.eq(rows.size(), 5, "the odds table lists every tier")
	var total := 0.0
	for row in rows:
		total += float(row["chance"])
	t.approx(total, 100.0, 1e-9, "disclosed odds sum to 100%")
	t.eq(Rifts.guarantee_rows().size(), Rifts.ALL.size(),
			"every Rift's guarantee is disclosed")
