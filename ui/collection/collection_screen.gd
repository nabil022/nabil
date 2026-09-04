extends Control

## Collection -- the home screen (spec 6.1).
##
## A grid of 50 slots. Owned Fragments render their sigil; unowned show a locked
## silhouette that hints at the shape without revealing it, which is what drives
## completion desire. Tapping a slot opens the detail sheet.

const DETAIL_SCENE := preload("res://ui/collection/fragment_detail.tscn")
const COLUMNS := 4
const CELL := 236.0

enum Filter { ALL, OWNED, MISSING }
enum Sort { TIER, SET }

var _filter: int = Filter.ALL
var _sort: int = Sort.TIER
var _grid: GridContainer
var _summary: Label
var _filter_row: HBoxContainer
var _sort_row: HBoxContainer


func _ready() -> void:
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 24)
	margin.add_theme_constant_override("margin_right", 24)
	margin.add_theme_constant_override("margin_top", 16)
	margin.add_theme_constant_override("margin_bottom", 8)
	add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	margin.add_child(column)

	_summary = UiTheme.label("", UiTheme.SIZE_CAPTION, UiTheme.TEXT_DIM)
	column.add_child(_summary)

	_filter_row = _make_toggle_row(["All", "Owned", "Missing"],
			func(i: int) -> void:
				_filter = i
				refresh())
	column.add_child(_filter_row)

	_sort_row = _make_toggle_row(["By tier", "By set"],
			func(i: int) -> void:
				_sort = i
				refresh())
	column.add_child(_sort_row)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(scroll)

	_grid = GridContainer.new()
	_grid.columns = COLUMNS
	_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_grid.add_theme_constant_override("h_separation", 12)
	_grid.add_theme_constant_override("v_separation", 12)
	scroll.add_child(_grid)

	Save.collection_changed.connect(refresh)
	refresh()


func _make_toggle_row(labels: Array, on_pick: Callable) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	for i in labels.size():
		var button := Button.new()
		button.text = String(labels[i])
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.add_theme_font_size_override("font_size", UiTheme.SIZE_CAPTION)
		var index := i
		button.pressed.connect(func() -> void:
			Sfx.play(Sfx.TAP, -10.0)
			on_pick.call(index))
		row.add_child(button)
	return row


func _highlight(row: HBoxContainer, active: int) -> void:
	for i in row.get_child_count():
		var button := row.get_child(i) as Button
		button.add_theme_color_override("font_color",
				UiTheme.ACCENT if i == active else UiTheme.TEXT_DIM)


func refresh() -> void:
	if _grid == null:
		return
	for child in _grid.get_children():
		child.queue_free()

	var owned := Save.owned_count()
	var sets_done := Economy.completed_set_count()
	_summary.text = "%d / 50 collected   -   %d / %d sets   -   %s" % [
		owned, sets_done, Balance.SET_COUNT, Economy.flux_per_sec.format_rate()]
	_highlight(_filter_row, _filter)
	_highlight(_sort_row, _sort)

	for frag in _visible_fragments():
		_grid.add_child(_make_slot(frag))


func _visible_fragments() -> Array:
	var list: Array = []
	for frag in Fragments.ALL:
		var has: bool = Save.has_fragment(String(frag["id"]))
		if _filter == Filter.OWNED and not has:
			continue
		if _filter == Filter.MISSING and has:
			continue
		list.append(frag)
	if _sort == Sort.TIER:
		list.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
			if int(a["tier"]) != int(b["tier"]):
				return int(a["tier"]) > int(b["tier"])
			return String(a["id"]) < String(b["id"]))
	else:
		list.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
			if String(a["set_id"]) != String(b["set_id"]):
				return String(a["set_id"]) < String(b["set_id"])
			return int(a["tier"]) > int(b["tier"]))
	return list


func _make_slot(frag: Dictionary) -> Control:
	var id := String(frag["id"])
	var owned := Save.has_fragment(id)
	var tier := int(frag["tier"])

	var button := Button.new()
	button.custom_minimum_size = Vector2(CELL, CELL + 34.0)
	button.flat = true
	button.pressed.connect(func() -> void:
		Sfx.play(Sfx.TAP, -10.0)
		_open_detail(frag))

	var box := VBoxContainer.new()
	box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_theme_constant_override("separation", 0)
	button.add_child(box)

	var sigil := SigilRect.new()
	sigil.custom_minimum_size = Vector2(CELL, CELL)
	sigil.size_flags_vertical = Control.SIZE_EXPAND_FILL
	sigil.show_fragment(frag, not owned)
	if owned:
		sigil.set_frame(_frame_style(), _frame_color())
	box.add_child(sigil)

	var caption := UiTheme.label(
			String(frag["name"]) if owned else "- - -",
			UiTheme.SIZE_CAPTION - 4,
			UiTheme.tier_color(tier) if owned else UiTheme.DISABLED)
	caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	caption.autowrap_mode = TextServer.AUTOWRAP_OFF
	caption.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	caption.custom_minimum_size = Vector2(CELL, 30)
	box.add_child(caption)

	if owned and Save.fragment_level(id) > Balance.LEVEL_MIN:
		var level := UiTheme.label("L%d" % Save.fragment_level(id),
				UiTheme.SIZE_CAPTION - 6, UiTheme.TEXT_DIM)
		level.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
		level.position = Vector2(CELL - 46, 6)
		level.mouse_filter = Control.MOUSE_FILTER_IGNORE
		button.add_child(level)
	return button


static func _frame_style() -> int:
	var cosmetic := Cosmetics.get_cosmetic(String(Save.get_setting("frame", "frame_none")))
	return int(cosmetic.get("style", 0))


static func _frame_color() -> Color:
	var cosmetic := Cosmetics.get_cosmetic(String(Save.get_setting("frame", "frame_none")))
	return cosmetic.get("color", Color.WHITE)


func _open_detail(frag: Dictionary) -> void:
	var sheet := DETAIL_SCENE.instantiate()
	var root := get_tree().current_scene
	if root != null and root.has_method("push_overlay"):
		root.call("push_overlay", sheet)
	else:
		add_child(sheet)
	sheet.call("show_fragment", String(frag["id"]))
	sheet.tree_exited.connect(refresh)
