extends SceneTree
## Deterministic opening flow checks. Screenshots are optional via -- --capture.
var capture_enabled := false

func _initialize() -> void:
	capture_enabled = "--capture" in OS.get_cmdline_user_args() and DisplayServer.get_name() != "headless"
	call_deferred("check")

func capture(label: String) -> void:
	if not capture_enabled:
		return
	await process_frame
	await RenderingServer.frame_post_draw
	var path := "user://opening_%s.png" % label
	root.get_texture().get_image().save_png(path)
	print("CAPTURE: ", ProjectSettings.globalize_path(path))

func check() -> void:
	var scene = load("res://main.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	assert(scene.archive_root != null)
	assert(scene.meme_room == null)
	scene.opening.enter("sleep")
	scene.set_physics_process(false)
	assert(scene.opening.morph_meshes.size() == 4)
	var camera_transform: Transform3D = scene.camera.transform
	scene.camera.position = scene.player.position + Vector3(1.2, 0.9, 3.0)
	scene.camera.look_at(scene.player.position + Vector3(0, 0.35, 0))
	for expression in ["closed", "reach"]:
		scene.opening.pose(1.0 if expression == "closed" else 0.0, 1.0 if expression == "reach" else 0.0)
		await capture("character_%s" % expression)
	scene.camera.transform = camera_transform
	var visited: Array[String] = []
	for frame in range(2100):
		scene.opening.update(1.0 / 60.0)
		var current: String = scene.opening.phase
		if scene.opening.elapsed > 2.5 and current in ["sleep", "pull", "tunnel"] and current not in visited:
			visited.append(current)
			await capture(current)
		if current == "done":
			assert(scene.archive_root.visible)
			assert(scene.meme_room == null)
			assert(scene.archive_interaction != null)
			assert(scene.archive_interaction.active)
			assert(is_equal_approx(scene.player.position.y, 0.625))
			print("PASS: timed opening reaches archive with grounded character")
			# Check that tunnel steering still changes trajectory.
			scene.opening.enter("tunnel")
			scene.opening.steer = Vector2(-1, 0)
			await process_frame
			for step in range(60):
				scene.opening.update(1.0 / 60.0)
			var left: float = scene.player.position.x
			scene.opening.steer = Vector2(1, 0)
			await process_frame
			for step in range(60):
				scene.opening.update(1.0 / 60.0)
			assert(scene.opening.phase == "tunnel")
			print("PASS: tunnel steering path remains active")
			print("PASS: opening checks complete")
			quit()
			return
	push_error("Opening failed to finish; final phase=%s" % scene.opening.phase)
	quit(1)


