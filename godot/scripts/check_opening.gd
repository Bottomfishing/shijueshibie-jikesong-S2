extends SceneTree

func _initialize() -> void:
	call_deferred("check")

func check() -> void:
	var scene = load("res://main.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	scene.set_physics_process(false)
	assert(scene.opening.morph_meshes.size() == 4)
	var camera_transform: Transform3D = scene.camera.transform
	scene.camera.position = scene.player.position + Vector3(1.2, 0.9, 3.0)
	scene.camera.look_at(scene.player.position + Vector3(0, 0.35, 0))
	for expression in ["closed", "reach"]:
		scene.opening.pose(1.0 if expression == "closed" else 0.0, 1.0 if expression == "reach" else 0.0)
		await process_frame
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png("user://character_%s.png" % expression)
	scene.camera.transform = camera_transform
	var visited: Array[String] = []
	for frame in range(2100):
		scene.opening.update(1.0 / 60.0)
		var phase: String = scene.opening.phase
		if scene.opening.elapsed > 2.5 and phase in ["sleep", "pull", "tunnel"] and phase not in visited:
			visited.append(phase)
			await process_frame
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png("user://opening_%s.png" % phase)
		if phase == "done":
			assert(scene.archive_root.visible)
			assert(is_equal_approx(scene.player.position.y, 0.625))
			print("PASS: timed opening reaches archive with grounded character")
			scene.opening.enter("tunnel")
			Input.warp_mouse(Vector2(100, 360))
			await process_frame
			for step in range(60):
				scene.opening.update(1.0 / 60.0)
			var left: float = scene.player.position.x
			Input.warp_mouse(Vector2(1180, 360))
			await process_frame
			for step in range(60):
				scene.opening.update(1.0 / 60.0)
			assert(scene.player.position.x > left + 1.0)
			print("PASS: mouse changes tunnel trajectory")
			scene.opening.enter("sleep")
			var click := InputEventMouseButton.new()
			click.button_index = MOUSE_BUTTON_LEFT
			click.pressed = true
			Input.parse_input_event(click.duplicate())
			Input.flush_buffered_events()
			scene.opening.update(0.1)
			assert(scene.opening.phase == "wake")
			click.pressed = false
			Input.parse_input_event(click.duplicate())
			Input.flush_buffered_events()
			scene.opening.update(0.7)
			click.pressed = true
			Input.parse_input_event(click.duplicate())
			Input.flush_buffered_events()
			scene.opening.update(0.1)
			assert(scene.opening.phase == "pull")
			click.pressed = false
			Input.parse_input_event(click.duplicate())
			Input.flush_buffered_events()
			print("PASS: two clicks wake character and trigger pull")
			scene.opening.update(1.6)
			click.pressed = true
			Input.parse_input_event(click.duplicate())
			Input.flush_buffered_events()
			scene.opening.update(0.1)
			assert(scene.opening.grabbed)
			print("PASS: four morph meshes imported and reach interaction accepted")
			quit()
			return
	push_error("Opening failed to finish")
	quit(1)

