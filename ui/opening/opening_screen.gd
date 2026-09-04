extends Control

## Opening (spec 6.3).
##
## Sigils resolve one at a time. New Fragments get a flourish; duplicates show
## the Shards gained. Tap to skip -- ALWAYS. Players will open thousands of
## these, and a beautiful unskippable animation is a retention killer, so the
## whole sequence is capped at 2.5s (0.4s with Fast Open) however many
## Fragments are in the Rift.

var _pulls: Array = []
var _cells: Array[Control] = []
var _grid: GridContainer
var _header: Label
var _continue: Button
var _finished := false
var _skipped := false


func _ready() -> void:
	var dim := ColorRect.new()
	dim.color = Color(0.016, 0.018, 0.031, 0.97)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(dim)

	var skip := Button.new()
	skip.flat = true
	skip.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	skip.pressed.connect(_skip)
	add_child(skip)

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 24)
	margin.add_theme_constant_override("margin_right", 24)
	margin.add_theme_constant_override("margin_top", 40)
	margin.add_theme_constant_override("margin_bottom", 40)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 18)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_child(column)

	_header = UiTheme.label("", UiTheme.SIZE_BODY)
	_header.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(_header)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var centre := CenterContainer.new()
	centre.size_flags_vertical = Control.SIZE_EXPAND_FILL
	centre.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	centre.mouse_filter = Control.MOUSE_FILTER_IGNORE
	scroll.add_child(centre)
	column.add_child(scroll)

	_grid = GridContainer.new()
	_grid.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_grid.add_theme_constant_override("h_separation", 14)
	_grid.add_theme_constant_override("v_separation", 14)
	_grid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	centre.add_child(_grid)

	_continue = Button.new()
	_continue.text = "Continue"
	_continue.visible = false
	_continue.pressed.connect(_close)
	column.add_child(_continue)


func begin(pulls: Array, rift_id: String) -> void:
	_pulls = pulls
	var rift := Rifts.get_rift(rift_id)
	_header.text = String(rift.get("name", "Rift"))
	_grid.columns = 3 if pulls.size() <= 6 else 5
	var cell := 280.0 if pulls.size() <= 6 else 170.0

	for pull in pulls:
		_cells.append(_make_cell(pull, cell))
		_grid.add_child(_cells[_cells.size() - 1])
	_run()


func _make_cell(pull: Dictionary, size: float) -> Control:
	var frag := Fragments.get_by_id(String(pull["id"]))
	var box := VBoxContainer.new()
	box.custom_minimum_size = Vector2(size, size + 60.0)
	box.modulate = Color(1, 1, 1, 0)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_theme_constant_override("separation", 2)

	var sigil := SigilRect.new()
	sigil.custom_minimum_size = Vector2(size, size)
	sigil.show_fragment(frag, false)
	box.add_child(sigil)

	var name := UiTheme.label(String(frag["name"]), UiTheme.SIZE_CAPTION - 4,
			UiTheme.tier_color(int(pull["tier"])))
	name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	name.custom_minimum_size = Vector2(size, 0)
	box.add_child(name)

	var note_text := "NEW" if bool(pull["is_new"]) else "+%d Shards" % int(pull["shards"])
	var note := UiTheme.label(note_text, UiTheme.SIZE_CAPTION - 6,
			UiTheme.POSITIVE if bool(pull["is_new"]) else UiTheme.TEXT_DIM)
	note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(note)
	return box


func _run() -> void:
	var total: float = (Balance.OPEN_DURATION_FAST_SECONDS
			if bool(Save.get_setting("fast_open", false))
			else Balance.OPEN_DURATION_SECONDS)
	var gap := maxf(Balance.OPEN_REVEAL_MIN_GAP, total / maxf(1.0, float(_cells.size())))
	for i in _cells.size():
		if _skipped:
			break
		_reveal(i, gap)
		await get_tree().create_timer(gap).timeout
	_finish()


func _reveal(index: int, gap: float) -> void:
	var cell := _cells[index]
	var pull: Dictionary = _pulls[index]
	var tier := int(pull["tier"])
	Sfx.play_reveal(tier)
	if tier >= Balance.Tier.RADIANT:
		Sfx.haptic(30)
	var tween := create_tween()
	tween.set_parallel(true)
	tween.tween_property(cell, "modulate:a", 1.0, minf(0.22, gap))
	# New Fragments get a distinct flourish; duplicates simply appear.
	if bool(pull["is_new"]):
		cell.pivot_offset = cell.custom_minimum_size * 0.5
		cell.scale = Vector2(0.7, 0.7)
		tween.tween_property(cell, "scale", Vector2.ONE, minf(0.34, gap * 1.4)) \
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _skip() -> void:
	if _finished:
		_close()
		return
	_skipped = true
	for cell in _cells:
		cell.modulate.a = 1.0
		cell.scale = Vector2.ONE
	_finish()


func _finish() -> void:
	if _finished:
		return
	_finished = true
	for cell in _cells:
		cell.modulate.a = 1.0
	_continue.visible = true


func _close() -> void:
	queue_free()
