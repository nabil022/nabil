class_name UiTheme
extends RefCounted

## The whole visual system (spec 6): dark background, high-contrast glowing
## sigils, minimal chrome, ONE sans-serif at THREE sizes. No gradients, no drop
## shadows, no skeuomorphic panels -- they fight the shaders. The sigils are the
## only decoration; everything here stays out of their way.

const BG := Color(0.031, 0.035, 0.055)
const PANEL := Color(0.063, 0.071, 0.102)
const PANEL_EDGE := Color(0.145, 0.161, 0.216)
const TEXT := Color(0.910, 0.925, 0.965)
const TEXT_DIM := Color(0.494, 0.529, 0.608)
const ACCENT := Color(0.451, 0.616, 1.0)
const POSITIVE := Color(0.353, 0.855, 0.639)
const WARNING := Color(0.976, 0.702, 0.310)
const DISABLED := Color(0.267, 0.290, 0.353)

## Three sizes. That is the whole type scale.
const SIZE_DISPLAY := 68
const SIZE_BODY := 34
const SIZE_CAPTION := 24

const RADIUS := 10
const PAD := 28


static func tier_color(tier: int) -> Color:
	var range_: Array = Balance.TIER_HUE_RANGE.get(tier, [0.55, 0.62])
	var hue := (float(range_[0]) + float(range_[1])) * 0.5
	return Color.from_hsv(hue, float(Balance.TIER_SATURATION.get(tier, 0.5)),
			minf(1.0, float(Balance.TIER_VALUE.get(tier, 0.9)) + 0.15))


static func flat_box(fill: Color, edge: Color = PANEL_EDGE, radius: int = RADIUS,
		border: int = 1) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = fill
	box.border_color = edge
	box.set_border_width_all(border)
	box.set_corner_radius_all(radius)
	box.content_margin_left = PAD
	box.content_margin_right = PAD
	box.content_margin_top = PAD * 0.6
	box.content_margin_bottom = PAD * 0.6
	return box


static func build() -> Theme:
	var theme := Theme.new()
	theme.default_font_size = SIZE_BODY

	# Labels
	theme.set_color("font_color", "Label", TEXT)
	theme.set_font_size("font_size", "Label", SIZE_BODY)

	# Buttons: flat panels with a hairline border, nothing else.
	var normal := flat_box(PANEL)
	var hover := flat_box(Color(0.086, 0.098, 0.137))
	var pressed := flat_box(Color(0.114, 0.129, 0.180), ACCENT)
	var disabled := flat_box(Color(0.047, 0.051, 0.071), Color(0.098, 0.106, 0.137))
	theme.set_stylebox("normal", "Button", normal)
	theme.set_stylebox("hover", "Button", hover)
	theme.set_stylebox("pressed", "Button", pressed)
	theme.set_stylebox("disabled", "Button", disabled)
	theme.set_stylebox("focus", "Button", StyleBoxEmpty.new())
	theme.set_color("font_color", "Button", TEXT)
	theme.set_color("font_hover_color", "Button", TEXT)
	theme.set_color("font_pressed_color", "Button", ACCENT)
	theme.set_color("font_disabled_color", "Button", DISABLED)
	theme.set_font_size("font_size", "Button", SIZE_BODY)

	# Panels
	theme.set_stylebox("panel", "PanelContainer", flat_box(PANEL))
	var plain := flat_box(BG, BG, 0, 0)
	theme.set_stylebox("panel", "Panel", plain)

	# Progress bars (pity counter, level progress)
	var bg_bar := flat_box(Color(0.086, 0.094, 0.129), PANEL_EDGE, 6)
	bg_bar.content_margin_left = 0
	bg_bar.content_margin_right = 0
	bg_bar.content_margin_top = 0
	bg_bar.content_margin_bottom = 0
	var fg_bar := flat_box(ACCENT, ACCENT, 6)
	fg_bar.content_margin_left = 0
	fg_bar.content_margin_right = 0
	fg_bar.content_margin_top = 0
	fg_bar.content_margin_bottom = 0
	theme.set_stylebox("background", "ProgressBar", bg_bar)
	theme.set_stylebox("fill", "ProgressBar", fg_bar)
	theme.set_color("font_color", "ProgressBar", TEXT_DIM)
	theme.set_font_size("font_size", "ProgressBar", SIZE_CAPTION)

	# Scrolling: no visible chrome.
	theme.set_stylebox("panel", "ScrollContainer", StyleBoxEmpty.new())

	theme.set_color("font_color", "CheckButton", TEXT)
	theme.set_font_size("font_size", "CheckButton", SIZE_BODY)
	theme.set_stylebox("focus", "CheckButton", StyleBoxEmpty.new())
	return theme


## A label at one of the three sizes.
static func label(text: String, size: int = SIZE_BODY, color: Color = TEXT) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	return l


static func spacer(height: float) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(0, height)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c


static func hline() -> Control:
	var line := ColorRect.new()
	line.color = PANEL_EDGE
	line.custom_minimum_size = Vector2(0, 1)
	line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return line
