extends Control

## Fragment detail sheet (spec 6.1): name, tier, income, level, upgrade button,
## set membership.

var _fragment_id := ""
var _body: VBoxContainer


func _ready() -> void:
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.72)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(dim)

	var close_catcher := Button.new()
	close_catcher.flat = true
	close_catcher.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	close_catcher.pressed.connect(_close)
	add_child(close_catcher)

	var panel := PanelContainer.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	panel.custom_minimum_size = Vector2(880, 0)
	panel.anchor_left = 0.5
	panel.anchor_right = 0.5
	panel.anchor_top = 0.5
	panel.anchor_bottom = 0.5
	panel.grow_horizontal = Control.GROW_DIRECTION_BOTH
	panel.grow_vertical = Control.GROW_DIRECTION_BOTH
	add_child(panel)

	_body = VBoxContainer.new()
	_body.add_theme_constant_override("separation", 14)
	panel.add_child(_body)


func show_fragment(id: String) -> void:
	_fragment_id = id
	_rebuild()


func _rebuild() -> void:
	for child in _body.get_children():
		child.queue_free()
	var frag := Fragments.get_by_id(_fragment_id)
	if frag.is_empty():
		return
	var tier := int(frag["tier"])
	var owned := Save.has_fragment(_fragment_id)
	var level := Save.fragment_level(_fragment_id)

	var sigil := SigilRect.new()
	sigil.custom_minimum_size = Vector2(0, 300)
	sigil.show_fragment(frag, not owned)
	_body.add_child(sigil)

	var title := UiTheme.label(String(frag["name"]) if owned else "Unknown Fragment",
			UiTheme.SIZE_BODY + 8)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_body.add_child(title)

	var subtitle := UiTheme.label("%s   -   x%s income" % [
			Balance.tier_name(tier),
			String.num(Balance.tier_multiplier(tier), 0)],
			UiTheme.SIZE_CAPTION, UiTheme.tier_color(tier))
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_body.add_child(subtitle)
	_body.add_child(UiTheme.hline())

	var set_id := String(frag["set_id"])
	var members := Fragments.of_set(set_id)
	var have := 0
	for m in members:
		if Save.has_fragment(String(m["id"])):
			have += 1
	var set_line := "%s   %d / %d collected" % [_set_title(set_id), have, members.size()]
	if Economy.is_set_complete(set_id):
		set_line += "   (+%d%% to this set)" % int(Balance.SET_COMPLETE_BONUS * 100.0)
	_body.add_child(UiTheme.label(set_line, UiTheme.SIZE_CAPTION, UiTheme.TEXT_DIM))

	if not owned:
		_body.add_child(UiTheme.label("Not yet pulled from the Aether.",
				UiTheme.SIZE_CAPTION, UiTheme.TEXT_DIM))
		_add_close_button()
		return

	_body.add_child(_stat_row("Income", Economy.fragment_income(_fragment_id).format_rate()))
	_body.add_child(_stat_row("Level", "%d / %d" % [level, Balance.LEVEL_MAX]))

	var cost := Balance.level_cost(level)
	if cost <= 0:
		_body.add_child(UiTheme.label("Fully levelled.", UiTheme.SIZE_CAPTION, UiTheme.POSITIVE))
	else:
		var next_income := Economy.fragment_income_at_level(_fragment_id, level + 1)
		_body.add_child(_stat_row("Next level", next_income.format_rate()))
		var upgrade := Button.new()
		upgrade.text = "Upgrade  -  %d Shards" % cost
		upgrade.disabled = Save.get_shards() < cost
		upgrade.pressed.connect(func() -> void:
			if Economy.level_up(_fragment_id):
				Sfx.play(Sfx.LEVEL_UP)
				Sfx.haptic()
				_rebuild())
		_body.add_child(upgrade)

		var max_button := Button.new()
		max_button.text = "Upgrade to max affordable"
		max_button.disabled = Save.get_shards() < cost
		max_button.add_theme_font_size_override("font_size", UiTheme.SIZE_CAPTION)
		max_button.pressed.connect(func() -> void:
			if Economy.level_up_max(_fragment_id) > 0:
				Sfx.play(Sfx.LEVEL_UP)
				Sfx.haptic()
				_rebuild())
		_body.add_child(max_button)
	_add_close_button()


static func _set_title(set_id: String) -> String:
	return "Set %s" % set_id.replace("set_", "").lstrip("0")


func _stat_row(name: String, value: String) -> Control:
	var row := HBoxContainer.new()
	var left := UiTheme.label(name, UiTheme.SIZE_CAPTION, UiTheme.TEXT_DIM)
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(left)
	row.add_child(UiTheme.label(value, UiTheme.SIZE_CAPTION))
	return row


func _add_close_button() -> void:
	var close := Button.new()
	close.text = "Close"
	close.add_theme_font_size_override("font_size", UiTheme.SIZE_CAPTION)
	close.pressed.connect(_close)
	_body.add_child(close)


func _close() -> void:
	Sfx.play(Sfx.TAP, -12.0)
	queue_free()
