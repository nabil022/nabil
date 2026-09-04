extends Control

## Shop (spec 6.4, 7.4).
##
## Prism bundles and cosmetics, clearly separated from anything
## gameplay-affecting -- because nothing here is. Prisms buy opening-animation
## themes, collection backgrounds and sigil frame styles, and nothing else. No
## Rift, no Flux and no Shard is ever purchasable with real money (spec 7.1).

var _column: VBoxContainer
var _busy := false


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

	_column = VBoxContainer.new()
	_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_column.add_theme_constant_override("separation", 12)
	scroll.add_child(_column)

	Save.currency_changed.connect(refresh)
	Save.state_changed.connect(refresh)
	refresh()


func refresh() -> void:
	if _column == null:
		return
	for child in _column.get_children():
		child.queue_free()

	var banner := PanelContainer.new()
	var banner_box := VBoxContainer.new()
	banner_box.add_theme_constant_override("separation", 4)
	banner_box.add_child(UiTheme.label("Cosmetics only", UiTheme.SIZE_CAPTION, UiTheme.POSITIVE))
	banner_box.add_child(UiTheme.label(
			"Nothing in this shop affects income, odds or progression speed. "
			+ "Rifts are bought with Flux you earn, never with money.",
			UiTheme.SIZE_CAPTION - 4, UiTheme.TEXT_DIM))
	banner_box.get_child(1).autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	banner.add_child(banner_box)
	_column.add_child(banner)

	_column.add_child(UiTheme.label("Prisms", UiTheme.SIZE_BODY))
	for product in Cosmetics.IAP_PRODUCTS:
		if int(product.get("prisms", 0)) <= 0:
			continue
		_column.add_child(_product_card(product))

	_column.add_child(UiTheme.spacer(8))
	_column.add_child(UiTheme.label("Bundles", UiTheme.SIZE_BODY))
	for product in Cosmetics.IAP_PRODUCTS:
		if int(product.get("prisms", 0)) > 0:
			continue
		_column.add_child(_product_card(product))

	for kind_pair in [[Cosmetics.KIND_THEME, "Opening themes"],
			[Cosmetics.KIND_BACKGROUND, "Collection backgrounds"],
			[Cosmetics.KIND_FRAME, "Sigil frames"]]:
		_column.add_child(UiTheme.spacer(8))
		_column.add_child(UiTheme.label(String(kind_pair[1]), UiTheme.SIZE_BODY))
		for cosmetic in Cosmetics.of_kind(String(kind_pair[0])):
			_column.add_child(_cosmetic_card(cosmetic))


func _product_card(product: Dictionary) -> Control:
	var panel := PanelContainer.new()
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	panel.add_child(box)

	var header := HBoxContainer.new()
	var title := UiTheme.label(String(product["name"]), UiTheme.SIZE_CAPTION)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	header.add_child(UiTheme.label(String(product["price"]), UiTheme.SIZE_CAPTION,
			UiTheme.TEXT_DIM))
	box.add_child(header)

	var prisms := int(product.get("prisms", 0))
	var detail := ("%d Prisms" % prisms if prisms > 0
			else "Unlocks %d cosmetics" % product.get("grants", []).size())
	box.add_child(UiTheme.label(detail, UiTheme.SIZE_CAPTION - 4, UiTheme.TEXT_DIM))

	var owned := prisms == 0 and _owns_all(product.get("grants", []))
	var button := Button.new()
	button.text = "Owned" if owned else "Buy"
	button.disabled = owned or _busy or not IAP.is_available()
	button.add_theme_font_size_override("font_size", UiTheme.SIZE_CAPTION)
	button.pressed.connect(func() -> void: _purchase(String(product["id"])))
	box.add_child(button)
	return panel


static func _owns_all(ids: Array) -> bool:
	for id in ids:
		if not Save.owns_cosmetic(String(id)):
			return false
	return not ids.is_empty()


func _cosmetic_card(cosmetic: Dictionary) -> Control:
	var id := String(cosmetic["id"])
	var kind := String(cosmetic["kind"])
	var owned := Cosmetics.is_default(id) or Save.owns_cosmetic(id)
	var equipped := String(Save.get_setting(_setting_key(kind), Cosmetics.DEFAULTS[0])) == id

	var panel := PanelContainer.new()
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	panel.add_child(box)

	var header := HBoxContainer.new()
	var swatch := ColorRect.new()
	swatch.color = cosmetic.get("color", Color.WHITE)
	swatch.custom_minimum_size = Vector2(28, 28)
	header.add_child(swatch)
	header.add_child(UiTheme.spacer(0))
	var title := UiTheme.label("  " + String(cosmetic["name"]), UiTheme.SIZE_CAPTION)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	if not owned:
		header.add_child(UiTheme.label("%d Prisms" % int(cosmetic["prisms"]),
				UiTheme.SIZE_CAPTION, UiTheme.TEXT_DIM))
	box.add_child(header)
	box.add_child(UiTheme.label(String(cosmetic["blurb"]), UiTheme.SIZE_CAPTION - 4,
			UiTheme.TEXT_DIM))

	var button := Button.new()
	button.add_theme_font_size_override("font_size", UiTheme.SIZE_CAPTION)
	if equipped:
		button.text = "Equipped"
		button.disabled = true
	elif owned:
		button.text = "Equip"
		button.pressed.connect(func() -> void:
			Sfx.play(Sfx.TAP, -8.0)
			Save.set_setting(_setting_key(kind), id)
			refresh())
	else:
		var price := int(cosmetic["prisms"])
		button.text = "Buy for %d Prisms" % price
		button.disabled = Save.get_prisms() < price
		button.pressed.connect(func() -> void:
			if Save.spend_prisms(price):
				Save.grant_cosmetic(id)
				Save.save_game()
				Sfx.play(Sfx.LEVEL_UP, -6.0)
				refresh())
	box.add_child(button)
	return panel


static func _setting_key(kind: String) -> String:
	match kind:
		Cosmetics.KIND_THEME:
			return "theme"
		Cosmetics.KIND_BACKGROUND:
			return "background"
		_:
			return "frame"


func _purchase(product_id: String) -> void:
	if _busy:
		return
	_busy = true
	refresh()
	var ok: bool = await IAP.purchase(product_id)
	if ok:
		Sfx.play(Sfx.LEVEL_UP, -4.0)
	_busy = false
	refresh()
