extends Control

## Odds disclosure (spec 7.2).
##
## Google Play requires apps with randomised virtual items to clearly disclose
## the odds of each outcome before the player commits. This lists every tier
## with its exact percentage, the guarantee rules per Rift, and the pity
## threshold stated plainly. It is reachable in one tap from the Rifts screen.
##
## This is a store requirement, not optional polish. Re-check the current Play
## policy wording at build time -- policy changes, and the spec may be stale.

func _ready() -> void:
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.86)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(dim)

	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 28)
	margin.add_theme_constant_override("margin_right", 28)
	margin.add_theme_constant_override("margin_top", 40)
	margin.add_theme_constant_override("margin_bottom", 40)
	add_child(margin)

	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	margin.add_child(scroll)

	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 12)
	scroll.add_child(column)

	column.add_child(UiTheme.label("Odds", UiTheme.SIZE_BODY + 8))
	column.add_child(UiTheme.label(
			"Every Fragment pulled from a Rift is drawn independently at these rates.",
			UiTheme.SIZE_CAPTION, UiTheme.TEXT_DIM))
	column.add_child(UiTheme.hline())

	for row in Rifts.odds_rows():
		var line := HBoxContainer.new()
		var name := UiTheme.label(String(row["name"]), UiTheme.SIZE_CAPTION,
				UiTheme.tier_color(int(row["tier"])))
		name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		line.add_child(name)
		line.add_child(UiTheme.label("%d in set" % int(row["count"]),
				UiTheme.SIZE_CAPTION, UiTheme.TEXT_DIM))
		line.add_child(UiTheme.spacer(0))
		var pct := UiTheme.label("   %s%%" % String.num(float(row["chance"]), 2),
				UiTheme.SIZE_CAPTION)
		line.add_child(pct)
		column.add_child(line)

	column.add_child(UiTheme.hline())
	column.add_child(UiTheme.label("Guarantees", UiTheme.SIZE_BODY))
	for row in Rifts.guarantee_rows():
		column.add_child(UiTheme.label("%s (%d Fragments): %s" % [
				String(row["name"]), int(row["fragments"]), String(row["guarantee"])],
				UiTheme.SIZE_CAPTION, UiTheme.TEXT_DIM))

	column.add_child(UiTheme.hline())
	column.add_child(UiTheme.label("Pity", UiTheme.SIZE_BODY))
	column.add_child(UiTheme.label(
			("After %d pulls without a Singular, the next pull is guaranteed to be "
			+ "a Singular, and the counter resets. Your current count is %d.")
			% [Balance.PITY_THRESHOLD, Save.pity()],
			UiTheme.SIZE_CAPTION, UiTheme.TEXT_DIM))

	column.add_child(UiTheme.hline())
	column.add_child(UiTheme.label(
			"Rifts are bought only with Flux, which is earned by playing. "
			+ "Rifts can never be bought with real money.",
			UiTheme.SIZE_CAPTION, UiTheme.POSITIVE))

	var close := Button.new()
	close.text = "Close"
	close.pressed.connect(func() -> void:
		Sfx.play(Sfx.TAP, -12.0)
		queue_free())
	column.add_child(UiTheme.spacer(10))
	column.add_child(close)
