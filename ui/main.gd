extends Control

## Root router and persistent chrome (spec 6).
##
## Five screens, no more: Collection, Rifts, Opening, Shop, Settings. Opening is
## a full-screen overlay rather than a nav destination, because the player never
## navigates to it -- they arrive from a purchase.
##
## Screens build their own contents in GDScript. The scene files stay small on
## purpose: the layout is then readable and diffable as code, which is the same
## reason the project is in Godot at all (spec 8.1).

const COLLECTION := "collection"
const RIFTS := "rifts"
const SHOP := "shop"
const SETTINGS := "settings"

const SCREENS := {
	COLLECTION: preload("res://ui/collection/collection_screen.tscn"),
	RIFTS: preload("res://ui/rifts/rifts_screen.tscn"),
	SHOP: preload("res://ui/shop/shop_screen.tscn"),
	SETTINGS: preload("res://ui/settings/settings_screen.tscn"),
}
const NAV_ORDER := [COLLECTION, RIFTS, SHOP, SETTINGS]
const NAV_LABELS := {
	COLLECTION: "Collection", RIFTS: "Rifts", SHOP: "Shop", SETTINGS: "Settings",
}

const OPENING_SCENE := preload("res://ui/opening/opening_screen.tscn")
const OFFLINE_SCENE := preload("res://ui/common/offline_collect.tscn")

@onready var _top_bar: PanelContainer = $Layout/TopBar
@onready var _content: Control = $Layout/Content
@onready var _nav: HBoxContainer = $Layout/Nav
@onready var _overlay: Control = $Overlay
@onready var _background: ColorRect = $Background

var _flux_label: Label
var _rate_label: Label
var _shards_label: Label
var _prisms_label: Label
var _boost_label: Label
var _nav_buttons: Dictionary = {}
var _current: Control
var _current_id := ""
var _refresh_accum := 0.0


func _ready() -> void:
	theme = UiTheme.build()
	_background.color = UiTheme.BG

	# Read the stored timestamp before anything can overwrite it.
	var last_seen := int(Save.state.get("last_seen_utc", 0))

	_build_top_bar()
	_build_nav()
	TimeGuard.begin_time_check()
	_apply_background_cosmetic()
	Save.state_changed.connect(_apply_background_cosmetic)

	show_screen(COLLECTION)
	_refresh_currencies()

	if Save.is_first_launch:
		call_deferred("_run_first_launch")
	else:
		call_deferred("_check_offline", last_seen)


func _process(delta: float) -> void:
	_refresh_accum += delta
	if _refresh_accum >= Balance.UI_REFRESH_SECONDS:
		_refresh_accum = 0.0
		_refresh_currencies()


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_RESUMED and is_inside_tree():
		var last_seen := int(Save.state.get("last_seen_utc", 0))
		Save.save_game()
		_check_offline(last_seen)


# --- chrome -----------------------------------------------------------------

func _build_top_bar() -> void:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 2)
	_flux_label = UiTheme.label("0", UiTheme.SIZE_DISPLAY)
	_rate_label = UiTheme.label("0/s", UiTheme.SIZE_CAPTION, UiTheme.TEXT_DIM)
	box.add_child(_flux_label)
	box.add_child(_rate_label)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 24)
	_shards_label = UiTheme.label("Shards 0", UiTheme.SIZE_CAPTION, UiTheme.TEXT_DIM)
	_prisms_label = UiTheme.label("Prisms 0", UiTheme.SIZE_CAPTION, UiTheme.TEXT_DIM)
	_boost_label = UiTheme.label("", UiTheme.SIZE_CAPTION, UiTheme.POSITIVE)
	row.add_child(_shards_label)
	row.add_child(_prisms_label)
	row.add_child(_boost_label)
	box.add_child(UiTheme.spacer(6))
	box.add_child(row)
	_top_bar.add_child(box)


func _build_nav() -> void:
	for id in NAV_ORDER:
		var button := Button.new()
		button.text = NAV_LABELS[id]
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.custom_minimum_size = Vector2(0, 108)
		button.add_theme_font_size_override("font_size", UiTheme.SIZE_CAPTION)
		button.pressed.connect(func() -> void:
			Sfx.play(Sfx.TAP, -8.0)
			show_screen(id))
		_nav.add_child(button)
		_nav_buttons[id] = button


func _refresh_currencies() -> void:
	_flux_label.text = Save.flux.format()
	_rate_label.text = Economy.flux_per_sec.format_rate()
	_shards_label.text = "Shards %s" % _short_int(Save.get_shards())
	_prisms_label.text = "Prisms %s" % _short_int(Save.get_prisms())

	var now := TimeGuard.now_utc()
	Save.prune_boosts(now)
	if Save.has_boost("flux_x2", now):
		var left := Save.boost_seconds_left("flux_x2", now)
		_boost_label.text = "x2 Flux  %d:%02d" % [left / 60, left % 60]
	elif Save.has_boost("shards_x2", now):
		_boost_label.text = "x2 Shards next opening"
	else:
		_boost_label.text = ""


static func _short_int(value: int) -> String:
	return BigNumber.from_float(float(value)).format()


func _apply_background_cosmetic() -> void:
	var id := String(Save.get_setting("background", "bg_null"))
	var cosmetic := Cosmetics.get_cosmetic(id)
	_background.color = cosmetic.get("color", UiTheme.BG) if not cosmetic.is_empty() else UiTheme.BG


# --- navigation -------------------------------------------------------------

func show_screen(id: String) -> void:
	if _current_id == id and _current != null:
		return
	if _current != null:
		_current.queue_free()
	_current_id = id
	_current = SCREENS[id].instantiate()
	_content.add_child(_current)
	_current.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for nav_id in _nav_buttons:
		var button: Button = _nav_buttons[nav_id]
		button.add_theme_color_override("font_color",
				UiTheme.ACCENT if nav_id == id else UiTheme.TEXT_DIM)


## Pushes a full-screen overlay (opening, sheets, collect screen).
func push_overlay(node: Control) -> void:
	_overlay.add_child(node)
	node.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_overlay.mouse_filter = Control.MOUSE_FILTER_STOP


func _overlay_closed() -> void:
	if _overlay.get_child_count() == 0:
		_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE


## Runs the reveal sequence for a set of pulls (spec 6.3).
func present_opening(pulls: Array, rift_id: String) -> void:
	if pulls.is_empty():
		return
	var screen := OPENING_SCENE.instantiate()
	push_overlay(screen)
	screen.call("begin", pulls, rift_id)
	await screen.tree_exited
	_overlay_closed()
	_refresh_currencies()
	if _current != null and _current.has_method("refresh"):
		_current.call("refresh")


# --- first launch & offline -------------------------------------------------

func _run_first_launch() -> void:
	# A free Faint Rift immediately, rigged to contain a Lit: a first pull of
	# three greys is a bad first impression (spec 5.3).
	if Save.get_flag("free_rift_granted"):
		return
	Save.set_flag("free_rift_granted", true)
	Save.state["stats"]["first_launch_utc"] = TimeGuard.now_utc()
	var pulls := RiftService.open_free(Balance.FIRST_LAUNCH_FREE_RIFT,
			Balance.FIRST_PULL_GUARANTEED_TIER)
	await present_opening(pulls, Balance.FIRST_LAUNCH_FREE_RIFT)
	show_screen(COLLECTION)


func _check_offline(last_seen: int) -> void:
	var result := TimeGuard.offline_seconds(last_seen, TimeGuard.now_utc(),
			Balance.OFFLINE_CAP_SECONDS)
	if int(result["granted"]) <= 0:
		return
	if Economy.flux_per_sec.is_zero():
		return
	var screen := OFFLINE_SCENE.instantiate()
	push_overlay(screen)
	screen.call("begin", result, last_seen)
	await screen.tree_exited
	_overlay_closed()
	_refresh_currencies()
