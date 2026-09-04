extends Control

## Offline collection (spec 5.2).
##
## Accrues at 100% of current Flux/sec while closed, capped at 4 hours. The cap
## is what brings players back several times a day -- do not raise it. A
## rewarded ad either doubles the amount or extends the cap to 8 hours for this
## collection; the player picks one.

var _amount: BigNumber = BigNumber.zero()
var _result: Dictionary = {}
var _last_seen: int = 0
var _body: VBoxContainer
var _busy := false
var _ad_used := false


func _ready() -> void:
	var dim := ColorRect.new()
	dim.color = Color(0.016, 0.018, 0.031, 0.95)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(dim)

	var panel := PanelContainer.new()
	panel.anchor_left = 0.5
	panel.anchor_right = 0.5
	panel.anchor_top = 0.5
	panel.anchor_bottom = 0.5
	panel.grow_horizontal = Control.GROW_DIRECTION_BOTH
	panel.grow_vertical = Control.GROW_DIRECTION_BOTH
	panel.custom_minimum_size = Vector2(900, 0)
	add_child(panel)

	_body = VBoxContainer.new()
	_body.add_theme_constant_override("separation", 16)
	panel.add_child(_body)


func begin(result: Dictionary, last_seen: int) -> void:
	_result = result
	_last_seen = last_seen
	_amount = Economy.flux_per_sec.mul_scalar(float(result["granted"]) * Balance.OFFLINE_RATE)
	_rebuild()


func _rebuild() -> void:
	for child in _body.get_children():
		child.queue_free()

	_body.add_child(UiTheme.label("While you were away", UiTheme.SIZE_BODY + 6))
	_body.add_child(UiTheme.label(_elapsed_text(), UiTheme.SIZE_CAPTION, UiTheme.TEXT_DIM))

	var amount := UiTheme.label(_amount.format(), UiTheme.SIZE_DISPLAY, UiTheme.ACCENT)
	amount.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_body.add_child(amount)
	_body.add_child(UiTheme.hline())

	var collect := Button.new()
	collect.text = "Collect"
	collect.disabled = _busy
	collect.pressed.connect(_collect)
	_body.add_child(collect)

	if not _ad_used and Ads.is_available(Ads.OFFLINE_DOUBLE):
		var double := Button.new()
		double.text = "Watch a video for x%d" % int(Balance.AD_OFFLINE_MULTIPLIER)
		double.disabled = _busy
		double.add_theme_font_size_override("font_size", UiTheme.SIZE_CAPTION)
		double.pressed.connect(func() -> void: _watch(false))
		_body.add_child(double)

		if int(_result["elapsed"]) > Balance.OFFLINE_CAP_SECONDS:
			var extend := Button.new()
			extend.text = "Watch a video to extend the cap to %d hours" % int(
					Balance.OFFLINE_CAP_SECONDS_AD_EXTENDED / 3600)
			extend.disabled = _busy
			extend.add_theme_font_size_override("font_size", UiTheme.SIZE_CAPTION)
			extend.pressed.connect(func() -> void: _watch(true))
			_body.add_child(extend)


func _elapsed_text() -> String:
	var granted := int(_result["granted"])
	var elapsed := int(_result["elapsed"])
	var text := "%dh %02dm collected" % [granted / 3600, (granted % 3600) / 60]
	if String(_result["reason"]) == "capped":
		text += "   (capped from %dh %02dm)" % [elapsed / 3600, (elapsed % 3600) / 60]
	return text


func _watch(extend_cap: bool) -> void:
	if _busy:
		return
	_busy = true
	_rebuild()
	var granted: bool = await Ads.show_rewarded(Ads.OFFLINE_DOUBLE)
	if granted:
		_ad_used = true
		if extend_cap:
			var extended := TimeGuard.offline_seconds(_last_seen, TimeGuard.now_utc(),
					Balance.OFFLINE_CAP_SECONDS_AD_EXTENDED)
			_result = extended
			_amount = Economy.flux_per_sec.mul_scalar(
					float(extended["granted"]) * Balance.OFFLINE_RATE)
		else:
			_amount = _amount.mul_scalar(Balance.AD_OFFLINE_MULTIPLIER)
	_busy = false
	_rebuild()


func _collect() -> void:
	Save.add_flux(_amount)
	Save.save_game()
	Sfx.play(Sfx.LEVEL_UP, -4.0)
	queue_free()
