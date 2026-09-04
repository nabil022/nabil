extends Node

## DEV-ONLY: renders a scene offscreen and writes a PNG, so the sigils and the
## screens can be eyeballed without a device (spec 2.3 asks for exactly that
## review). Godot's headless mode has no renderer, so run it under a virtual
## display:
##
##   xvfb-run -a godot --path . --rendering-driver opengl3 \
##       --resolution 1200x1700 res://tools/screenshot.tscn -- \
##       --target=res://tools/sigil_gallery.tscn --out=/tmp/gallery.png

const WARMUP_FRAMES := 24


func _ready() -> void:
	var target := ""
	var out := "screenshot.png"
	var frames := WARMUP_FRAMES
	var screen := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--target="):
			target = arg.trim_prefix("--target=")
		elif arg.begins_with("--out="):
			out = arg.trim_prefix("--out=")
		elif arg.begins_with("--frames="):
			frames = int(arg.trim_prefix("--frames="))
		elif arg.begins_with("--screen="):
			screen = arg.trim_prefix("--screen=")

	if target.is_empty() or not ResourceLoader.exists(target):
		push_error("screenshot: --target=<res://scene.tscn> is required")
		get_tree().quit(1)
		return

	var scene: Node = load(target).instantiate()
	add_child(scene)
	# Screens must be shot through Main, or they render without the app theme.
	if not screen.is_empty() and scene.has_method("show_screen"):
		await get_tree().process_frame
		scene.call("show_screen", screen)
	# The Opening screen is driven by a purchase, so give it one to show.
	if scene.has_method("begin") and target.ends_with("opening_screen.tscn"):
		scene.call("begin", RiftRoller.new(11).open("deep", 149, Save.fragments())["pulls"], "deep")
	if scene is Control:
		(scene as Control).set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	# Let shaders compile, tweens settle and deferred UI construction finish.
	for _i in frames:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw

	var image := get_viewport().get_texture().get_image()
	var err := image.save_png(out)
	if err != OK:
		push_error("screenshot: could not write %s (error %d)" % [out, err])
		get_tree().quit(1)
		return
	print("screenshot: wrote %s (%dx%d)" % [out, image.get_width(), image.get_height()])
	get_tree().quit(0)
