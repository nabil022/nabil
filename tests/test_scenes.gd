extends RefCounted

## Every scene must instantiate cleanly. A screen that only breaks when a player
## navigates to it is exactly the failure this catches.

const SCENES := [
	"res://ui/main.tscn",
	"res://ui/collection/collection_screen.tscn",
	"res://ui/collection/fragment_detail.tscn",
	"res://ui/rifts/rifts_screen.tscn",
	"res://ui/rifts/odds_sheet.tscn",
	"res://ui/opening/opening_screen.tscn",
	"res://ui/shop/shop_screen.tscn",
	"res://ui/settings/settings_screen.tscn",
	"res://ui/common/offline_collect.tscn",
	"res://tools/sigil_gallery.tscn",
]


func run(t: TestCase) -> void:
	var host := Node.new()
	Engine.get_main_loop().root.add_child(host)

	for path in SCENES:
		t.ok(ResourceLoader.exists(path), "%s exists" % path)
		var packed: PackedScene = load(path)
		t.ok(packed != null, "%s loads" % path)
		if packed == null:
			continue
		var instance := packed.instantiate()
		t.ok(instance != null, "%s instantiates" % path)
		if instance == null:
			continue
		# Adding to the tree runs _ready, which is where these screens build
		# their contents -- so this exercises the real construction path.
		host.add_child(instance)
		t.ok(instance.is_inside_tree(), "%s enters the tree" % path)
		instance.queue_free()

	# The sigil shader must actually compile, not just load.
	var shader: Shader = load("res://shaders/sigil.gdshader")
	t.ok(shader != null, "the sigil shader loads")
	var sigil := SigilRect.new()
	sigil.show_fragment(Fragments.ALL[0], false)
	t.ok(sigil.material != null, "SigilRect builds a shader material")
	var mat := sigil.material as ShaderMaterial
	t.eq(mat.get_shader_parameter("sigil_seed"), float(Fragments.ALL[0]["seed"]),
			"the seed reaches the shader")
	sigil.show_fragment(Fragments.ALL[0], true)
	t.eq(mat.get_shader_parameter("locked"), 1.0, "locked slots render the silhouette")
	sigil.free()

	host.queue_free()
