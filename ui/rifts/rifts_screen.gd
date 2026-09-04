extends Control

## Rifts (spec 6.2).
##
## Four Rift cards with cost and guarantee, greyed out with the shortfall shown
## when unaffordable. The pity counter appears once it passes the threshold,
## because visible progress toward a guaranteed reward is a strong return hook.
## The Odds button is always here, one tap away (spec 7.2).

const ODDS_SCENE := preload("res://ui/rifts/odds_sheet.tscn")

var _cards: VBoxContainer
var _pity_box: VBoxContainer
var _pity_bar: ProgressBar
var _pity_label: Label
var _ads_box: VBoxContainer
var _resistance_label: Label
var _busy := false
## Card sub-nodes kept by Rift id, so the per-second price refresh updates text
## in place instead of rebuilding four panels twice a second.
var _price_labels: Dictionary = {}
var _buy_buttons: Dictionary = {}
var _bulk_buttons: Dictionary = {}


func _ready() -> void:
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 24)
	margin.add_theme_constant_override("margin_right", 24)
	margin.add_theme_constant_override("margin_top", 16)
	margin.add_theme_constant_override("margin_bottom", 8)
	add_child(margin)

	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	margin.add_child(scroll)

	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 14)
	scroll.add_child(column)

	_pity_box = VBoxContainer.new()
	_pity_box.add_theme_constant_override("separation", 6)
	_pity_label = UiTheme.label("", UiTheme.SIZE_CAPTION, UiTheme.WARNING)
	_pity_bar = ProgressBar.new()
	_pity_bar.max_value = Balance.PITY_THRESHOLD
	_pity_bar.show_percentage = false
	_pity_bar.custom_minimum_size = Vector2(0, 14)
	_pity_box.add_child(_pity_label)
	_pity_box.add_child(_pity_bar)
	column.add_child(_pity_box)

	_resistance_label = UiTheme.label("", UiTheme.SIZE_CAPTION - 4, UiTheme.TEXT_DIM)
	_resistance_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(_resistance_label)

	_cards = VBoxContainer.new()
	_cards.add_theme_constant_override("separation", 14)
	column.add_child(_cards)

	var odds := Button.new()
	odds.text = "Odds"
	odds.pressed.connect(_show_odds)
	column.add_child(odds)

	column.add_child(UiTheme.spacer(8))
	column.add_child(UiTheme.label("Free rewards", UiTheme.SIZE_CAPTION, UiTheme.TEXT_DIM))
	_ads_box = VBoxContainer.new()
	_ads_box.add_theme_constant_override("separation", 10)
	column.add_child(_ads_box)

	Save.currency_changed.connect(_update)
	Save.collection_changed.connect(_update)
	Ads.availability_changed.connect(refresh)
	refresh()


func _process(_delta: float) -> void:
	# Prices track Flux/sec, so they need re-reading continuously -- but only
	# the text changes, never the node tree.
	if Engine.get_process_frames() % 15 == 0:
		_update()


## Rebuilds the node tree. Only on entry and after an ad, never per frame.
func refresh() -> void:
	if _cards == null:
		return
	for child in _cards.get_children():
		child.queue_free()
	_price_labels.clear()
	_buy_buttons.clear()
	_bulk_buttons.clear()
	for rift in Rifts.ALL:
		_cards.add_child(_make_card(rift))

	for child in _ads_box.get_children():
		child.queue_free()
	_build_ad_buttons()
	_update()


## Refreshes only the values that move: prices, affordability and pity.
func _update() -> void:
	if _cards == null:
		return
	var pity := Save.pity()
	_pity_box.visible = pity >= Balance.PITY_VISIBLE_FROM
	if _pity_box.visible:
		_pity_bar.value = pity
		_pity_label.text = RiftService.pity_text()

	# Prices rise with the Aether, so say so plainly rather than leaving the
	# player to wonder why a Faint Rift no longer costs 500.
	var resistance := Balance.rift_resistance(Economy.rate_float(), Save.total_pulls())
	if resistance <= 1.001:
		_resistance_label.text = ""
	else:
		_resistance_label.text = ("Aether Resistance x%s   -   the Aether resists as you draw "
				+ "from it, so Rift prices rise with your income. Base prices: %s.") % [
			BigNumber.from_float(resistance).format(),
			", ".join(_base_price_strings())]

	for id in _price_labels:
		var rift_id := String(id)
		var price := RiftService.cost(rift_id)
		var affordable := Save.flux.gte(price)
		var price_label: Label = _price_labels[rift_id]
		price_label.text = price.format()
		price_label.add_theme_color_override("font_color",
				UiTheme.TEXT if affordable else UiTheme.DISABLED)
		var buy: Button = _buy_buttons[rift_id]
		buy.text = ("Open" if affordable
				else "Need %s more" % RiftService.shortfall(rift_id).format())
		buy.disabled = not affordable or _busy
		if _bulk_buttons.has(rift_id):
			var bulk: Button = _bulk_buttons[rift_id]
			bulk.disabled = _busy or not Save.flux.gte(
					price.mul_scalar(float(Balance.RIFT_BULK_COUNT)))


static func _base_price_strings() -> Array[String]:
	var out: Array[String] = []
	for rift in Rifts.ALL:
		out.append("%s %s" % [String(rift["name"]).replace(" Rift", ""),
				BigNumber.from_float(Rifts.base_cost(String(rift["id"]))).format()])
	return out


func _make_card(rift: Dictionary) -> Control:
	var id := String(rift["id"])
	var panel := PanelContainer.new()
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	panel.add_child(box)

	var header := HBoxContainer.new()
	var title := UiTheme.label(String(rift["name"]), UiTheme.SIZE_BODY)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	var price_label := UiTheme.label("", UiTheme.SIZE_BODY)
	_price_labels[id] = price_label
	header.add_child(price_label)
	box.add_child(header)

	box.add_child(UiTheme.label(String(rift["blurb"]), UiTheme.SIZE_CAPTION, UiTheme.TEXT_DIM))

	var guarantee := int(rift["guarantee"])
	if guarantee > 0:
		box.add_child(UiTheme.label(
				"Guaranteed: %s or better" % Balance.tier_name(guarantee),
				UiTheme.SIZE_CAPTION, UiTheme.tier_color(guarantee)))

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	var buy := Button.new()
	buy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	buy.pressed.connect(func() -> void: _buy(id, 1))
	_buy_buttons[id] = buy
	row.add_child(buy)

	if id == Balance.RIFT_BULK_ID:
		var bulk := Button.new()
		bulk.text = "Open x%d" % Balance.RIFT_BULK_COUNT
		bulk.add_theme_font_size_override("font_size", UiTheme.SIZE_CAPTION)
		bulk.pressed.connect(func() -> void: _buy(id, Balance.RIFT_BULK_COUNT))
		_bulk_buttons[id] = bulk
		row.add_child(bulk)
	box.add_child(row)
	return panel


func _buy(rift_id: String, count: int) -> void:
	if _busy:
		return
	_busy = true
	Sfx.play(Sfx.RIFT_OPEN, -3.0)
	Sfx.haptic(24)
	var pulls: Array[Dictionary] = (RiftService.purchase(rift_id) if count <= 1
			else RiftService.purchase_bulk(rift_id, count))
	if pulls.is_empty():
		_busy = false
		refresh()
		return
	await _present(pulls, rift_id)
	_busy = false
	refresh()


func _present(pulls: Array, rift_id: String) -> void:
	var root := get_tree().current_scene
	if root != null and root.has_method("present_opening"):
		await root.call("present_opening", pulls, rift_id)


func _show_odds() -> void:
	Sfx.play(Sfx.TAP, -10.0)
	var sheet := ODDS_SCENE.instantiate()
	var root := get_tree().current_scene
	if root != null and root.has_method("push_overlay"):
		root.call("push_overlay", sheet)
	else:
		add_child(sheet)


# --- rewarded ads (spec 7.3) ------------------------------------------------

func _build_ad_buttons() -> void:
	_ads_box.add_child(_ad_button(
			"Free Faint Rift",
			Ads.FREE_RIFT,
			func() -> String:
				var left := Ads.free_rift_seconds_left()
				return "Ready" if left <= 0 else "Ready in %dh %02dm" % [left / 3600, (left % 3600) / 60]))
	_ads_box.add_child(_ad_button(
			"x2 Flux for 15 min",
			Ads.FLUX_SURGE,
			func() -> String: return "%d left today" % Ads.surge_uses_left()))
	_ads_box.add_child(_ad_button(
			"x2 Shards from next opening",
			Ads.SHARD_BOOST,
			func() -> String: return "%d left today" % Ads.shard_uses_left()))


func _ad_button(label: String, placement: String, status: Callable) -> Control:
	var panel := PanelContainer.new()
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	panel.add_child(box)
	box.add_child(UiTheme.label(label, UiTheme.SIZE_CAPTION))
	box.add_child(UiTheme.label("Watch a video   -   %s" % status.call(),
			UiTheme.SIZE_CAPTION - 4, UiTheme.TEXT_DIM))
	var button := Button.new()
	button.text = "Watch"
	button.add_theme_font_size_override("font_size", UiTheme.SIZE_CAPTION)
	button.disabled = not Ads.is_available(placement) or _busy
	button.pressed.connect(func() -> void: _watch(placement))
	box.add_child(button)
	return panel


func _watch(placement: String) -> void:
	if _busy:
		return
	_busy = true
	var granted: bool = await Ads.show_rewarded(placement)
	if granted and placement == Ads.FREE_RIFT:
		var pulls := RiftService.open_free(Balance.AD_FREE_RIFT_ID)
		await _present(pulls, Balance.AD_FREE_RIFT_ID)
	_busy = false
	refresh()
