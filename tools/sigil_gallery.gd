extends Control

## DEV-ONLY screen: every sigil in a grid, so seeds that produce ugly or
## near-duplicate shapes can be spotted and swapped (spec 2.3).
##
## Run it directly:  godot --path . res://tools/sigil_gallery.tscn
## Keys: L toggles the locked silhouette, T cycles the tier filter.

const CELL := 168.0

var _locked := false
var _tier_filter := 0  # 0 == all

@onready var _grid: GridContainer = $Margin/VBox/Scroll/Grid
@onready var _title: Label = $Margin/VBox/Title


func _ready() -> void:
	_rebuild()


func _unhandled_key_input(event: InputEvent) -> void:
	if not (event is InputEventKey) or not event.pressed:
		return
	match (event as InputEventKey).keycode:
		KEY_L:
			_locked = not _locked
			_rebuild()
		KEY_T:
			_tier_filter = (_tier_filter + 1) % 6
			_rebuild()
		KEY_ESCAPE:
			get_tree().quit()


func _rebuild() -> void:
	for child in _grid.get_children():
		child.queue_free()
	var shown := 0
	for frag in Fragments.ALL:
		if _tier_filter != 0 and int(frag["tier"]) != _tier_filter:
			continue
		shown += 1
		_grid.add_child(_make_cell(frag))
	_title.text = "SIGIL GALLERY  -  %d shown  -  [L] locked: %s  -  [T] tier: %s" % [
		shown,
		"on" if _locked else "off",
		"all" if _tier_filter == 0 else Balance.tier_name(_tier_filter),
	]


func _make_cell(frag: Dictionary) -> Control:
	var box := VBoxContainer.new()
	box.custom_minimum_size = Vector2(CELL, CELL + 44.0)
	box.add_theme_constant_override("separation", 2)

	var sigil := SigilRect.new()
	sigil.custom_minimum_size = Vector2(CELL, CELL)
	sigil.show_fragment(frag, _locked)
	box.add_child(sigil)

	var name_label := Label.new()
	name_label.text = String(frag["name"])
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_label.add_theme_font_size_override("font_size", 13)
	box.add_child(name_label)

	var meta := Label.new()
	meta.text = "T%d  %s  seed %d" % [int(frag["tier"]), String(frag["set_id"]), int(frag["seed"])]
	meta.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	meta.add_theme_font_size_override("font_size", 10)
	meta.modulate = Color(1, 1, 1, 0.5)
	box.add_child(meta)
	return box
