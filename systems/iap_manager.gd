extends Node

## In-app purchases (spec 7.4). Autoload name: IAP.
##
## Real money buys COSMETICS ONLY. There is no real-money path to a Rift, to
## Flux, to Shards, or to anything that touches income, odds or progression
## speed (spec 5.1, 7.1). That is a structural rule, not a preference: it is
## what keeps the game outside loot-box regulation and out of store-review risk.
## If a future feature proposal involves paying money for a chance at something,
## the answer is no.
##
## Google Play Billing sits behind `BillingProvider`; the desktop stand-in
## grants immediately so the shop is playable and testable without a store.

signal purchase_completed(product_id: String, ok: bool)
signal products_changed
signal restore_completed(count: int)

var _provider: BillingProvider
var _busy := false


class BillingProvider extends RefCounted:
	signal finished(product_id: String, ok: bool)

	func is_available() -> bool:
		return false

	func purchase(product_id: String) -> void:
		finished.emit(product_id, false)

	func restore() -> Array[String]:
		return []

	func provider_name() -> String:
		return "none"


class SimulatedBillingProvider extends BillingProvider:
	var _tree: SceneTree

	func _init(tree: SceneTree) -> void:
		_tree = tree

	func is_available() -> bool:
		return true

	func purchase(product_id: String) -> void:
		await _tree.create_timer(0.3).timeout
		finished.emit(product_id, true)

	func restore() -> Array[String]:
		return []

	func provider_name() -> String:
		return "simulated"


class PlayBillingProvider extends BillingProvider:
	## Android build seam: Google Play Billing Library via its Godot plugin.
	## Query the product details, run the purchase flow, acknowledge the
	## purchase, then emit `finished`. Kept dormant unless the singleton exists.
	var _singleton: Object

	func _init(singleton: Object) -> void:
		_singleton = singleton

	func is_available() -> bool:
		return _singleton != null

	func purchase(product_id: String) -> void:
		if _singleton == null or not _singleton.has_method("purchase"):
			finished.emit(product_id, false)
			return
		_singleton.call("purchase", product_id)

	func restore() -> Array[String]:
		if _singleton == null or not _singleton.has_method("query_purchases"):
			return []
		var owned: Array[String] = []
		for entry in _singleton.call("query_purchases"):
			owned.append(String(entry))
		return owned

	func provider_name() -> String:
		return "play_billing"


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	if Engine.has_singleton("GodotGooglePlayBilling"):
		_provider = PlayBillingProvider.new(Engine.get_singleton("GodotGooglePlayBilling"))
	else:
		_provider = SimulatedBillingProvider.new(get_tree())


func provider_name() -> String:
	return _provider.provider_name() if _provider != null else "none"


func set_provider(provider: BillingProvider) -> void:
	_provider = provider
	products_changed.emit()


func is_available() -> bool:
	return _provider != null and _provider.is_available() and not _busy


func products() -> Array[Dictionary]:
	return Cosmetics.IAP_PRODUCTS


## Runs the store flow, then grants the product. Prism bundles add Prisms;
## cosmetic products unlock cosmetics. Neither can affect income or odds.
func purchase(product_id: String) -> bool:
	var product := Cosmetics.get_product(product_id)
	if product.is_empty() or not is_available():
		purchase_completed.emit(product_id, false)
		return false
	_busy = true
	_provider.purchase(product_id)
	var result: Array = await _provider.finished
	_busy = false
	var ok: bool = result.size() >= 2 and String(result[0]) == product_id and bool(result[1])
	if ok:
		_grant(product)
	purchase_completed.emit(product_id, ok)
	return ok


func _grant(product: Dictionary) -> void:
	var prisms := int(product.get("prisms", 0))
	if prisms > 0:
		Save.add_prisms(prisms)
	for cosmetic_id in product.get("grants", []):
		Save.grant_cosmetic(String(cosmetic_id))
	Save.save_game()


## Settings > Restore purchases (spec 6.5). Re-grants every non-consumable the
## store still reports as owned.
func restore_purchases() -> int:
	if _provider == null:
		restore_completed.emit(0)
		return 0
	var owned := _provider.restore()
	var restored := 0
	for product_id in owned:
		var product := Cosmetics.get_product(product_id)
		if product.is_empty() or int(product.get("prisms", 0)) > 0:
			continue  # consumable Prism bundles are not restorable
		for cosmetic_id in product.get("grants", []):
			if not Save.owns_cosmetic(String(cosmetic_id)):
				Save.grant_cosmetic(String(cosmetic_id))
				restored += 1
	if restored > 0:
		Save.save_game()
	restore_completed.emit(restored)
	return restored
