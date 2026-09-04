extends Control

## Settings (spec 6.5): fast open, sound, haptics, odds disclosure, privacy
## policy, restore purchases, delete local data.

const ODDS_SCENE := preload("res://ui/rifts/odds_sheet.tscn")

## Replace with the real hosted policy before shipping. A privacy policy URL is
## required by Google Play because the ad SDK collects data (spec 10).
const PRIVACY_POLICY_URL := "https://example.com/aether/privacy"

var _column: VBoxContainer
var _confirm_delete := false


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
	_column.add_theme_constant_override("separation", 14)
	scroll.add_child(_column)
	refresh()


func refresh() -> void:
	for child in _column.get_children():
		child.queue_free()

	_column.add_child(_toggle("Fast open",
			"Cuts the Rift opening animation to %ss." % String.num(
					Balance.OPEN_DURATION_FAST_SECONDS, 1),
			"fast_open"))
	_column.add_child(_toggle("Sound", "Six short tones. Nothing else.", "sound"))
	_column.add_child(_toggle("Haptics", "A short buzz on rare pulls.", "haptics"))

	_column.add_child(UiTheme.hline())
	_column.add_child(_action("Odds", "Every tier's exact chance, the guarantees, and the pity rule.",
			"View", _show_odds))
	_column.add_child(_action("Privacy policy",
			"Required: the ad SDK collects data.", "Open",
			func() -> void: OS.shell_open(PRIVACY_POLICY_URL)))
	_column.add_child(_action("Restore purchases",
			"Re-grants cosmetics you already bought.", "Restore", _restore))

	_column.add_child(UiTheme.hline())
	var delete_label := ("Delete local data" if not _confirm_delete
			else "This erases your collection. Tap again to confirm.")
	_column.add_child(_action(delete_label,
			"Everything is stored on this device only. There is no cloud save.",
			"Delete" if not _confirm_delete else "Confirm", _delete,
			UiTheme.WARNING))

	_column.add_child(UiTheme.hline())
	var version := String(ProjectSettings.get_setting("application/config/version", "1.0.0"))
	_column.add_child(UiTheme.label(
			"Aether %s   -   ads: %s   -   billing: %s   -   clock: %s" % [
				version, Ads.provider_name(), IAP.provider_name(),
				"trusted" if TimeGuard.trusted else "device"],
			UiTheme.SIZE_CAPTION - 6, UiTheme.TEXT_DIM))


func _toggle(title: String, blurb: String, key: String) -> Control:
	var panel := PanelContainer.new()
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 4)
	panel.add_child(box)

	var row := HBoxContainer.new()
	var label := UiTheme.label(title, UiTheme.SIZE_CAPTION)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(label)
	var check := CheckButton.new()
	check.button_pressed = bool(Save.get_setting(key, false))
	check.toggled.connect(func(on: bool) -> void:
		Save.set_setting(key, on)
		Sfx.play(Sfx.TAP, -10.0))
	row.add_child(check)
	box.add_child(row)
	box.add_child(UiTheme.label(blurb, UiTheme.SIZE_CAPTION - 6, UiTheme.TEXT_DIM))
	return panel


func _action(title: String, blurb: String, button_text: String, action: Callable,
		accent: Color = UiTheme.TEXT) -> Control:
	var panel := PanelContainer.new()
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 4)
	panel.add_child(box)

	var row := HBoxContainer.new()
	var label := UiTheme.label(title, UiTheme.SIZE_CAPTION, accent)
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	row.add_child(label)
	var button := Button.new()
	button.text = button_text
	button.add_theme_font_size_override("font_size", UiTheme.SIZE_CAPTION)
	button.pressed.connect(action)
	row.add_child(button)
	box.add_child(row)
	box.add_child(UiTheme.label(blurb, UiTheme.SIZE_CAPTION - 6, UiTheme.TEXT_DIM))
	return panel


func _show_odds() -> void:
	Sfx.play(Sfx.TAP, -10.0)
	var sheet := ODDS_SCENE.instantiate()
	var root := get_tree().current_scene
	if root != null and root.has_method("push_overlay"):
		root.call("push_overlay", sheet)
	else:
		add_child(sheet)


func _restore() -> void:
	var count: int = await IAP.restore_purchases()
	_column.add_child(UiTheme.label(
			"Restored %d cosmetic%s." % [count, "" if count == 1 else "s"],
			UiTheme.SIZE_CAPTION, UiTheme.POSITIVE))


func _delete() -> void:
	if not _confirm_delete:
		_confirm_delete = true
		refresh()
		return
	Save.delete_local_data()
	Economy.recompute()
	_confirm_delete = false
	refresh()
