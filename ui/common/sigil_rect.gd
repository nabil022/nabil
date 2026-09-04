class_name SigilRect
extends ColorRect

## Renders one Fragment's procedural sigil (spec 2.3).
##
## Every instance owns its own ShaderMaterial because the seed and the tier
## palette are per-Fragment uniforms. Tier presentation comes from Balance so
## data/balance.gd stays the single source of truth.

const SIGIL_SHADER := preload("res://shaders/sigil.gdshader")

var fragment_id: String = ""
var is_locked: bool = false

var _mat: ShaderMaterial


func _init() -> void:
	color = Color(0, 0, 0, 0)  # the shader paints everything
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _ensure_material() -> void:
	if _mat != null:
		return
	_mat = ShaderMaterial.new()
	_mat.shader = SIGIL_SHADER
	material = _mat


## `frag` is one entry from Fragments.ALL.
func show_fragment(frag: Dictionary, locked: bool = false) -> void:
	_ensure_material()
	fragment_id = String(frag.get("id", ""))
	is_locked = locked
	var tier := int(frag.get("tier", 1))
	var hue_range: Array = Balance.TIER_HUE_RANGE.get(tier, [0.55, 0.62])

	_mat.set_shader_parameter("sigil_seed", float(frag.get("seed", 1)))
	_mat.set_shader_parameter("tier_hue_lo", float(hue_range[0]))
	_mat.set_shader_parameter("tier_hue_hi", float(hue_range[1]))
	_mat.set_shader_parameter("tier_saturation", float(Balance.TIER_SATURATION.get(tier, 0.5)))
	_mat.set_shader_parameter("tier_value", float(Balance.TIER_VALUE.get(tier, 0.9)))
	_mat.set_shader_parameter("tier_glow", float(Balance.TIER_GLOW.get(tier, 0.0)))
	_mat.set_shader_parameter("orbit_count", float(Balance.TIER_ORBIT_PARTICLES.get(tier, 0)))
	_mat.set_shader_parameter("locked", 1.0 if locked else 0.0)
	_mat.set_shader_parameter("alpha", 1.0)


func set_alpha(a: float) -> void:
	_ensure_material()
	_mat.set_shader_parameter("alpha", clampf(a, 0.0, 1.0))


func set_scale_uniform(s: float) -> void:
	_ensure_material()
	_mat.set_shader_parameter("scale", clampf(s, 0.2, 1.0))


## Cosmetic only (spec 5.1): frames never touch income, odds or progression.
func set_frame(style: int, frame_color: Color) -> void:
	_ensure_material()
	_mat.set_shader_parameter("frame_style", float(style))
	_mat.set_shader_parameter("frame_color", Vector3(frame_color.r, frame_color.g, frame_color.b))
