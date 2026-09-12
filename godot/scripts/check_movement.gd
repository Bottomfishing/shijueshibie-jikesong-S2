extends SceneTree

const STEP := 1.0 / 60.0

func _initialize() -> void:
	call_deferred("check")

func check() -> void:
	var scene = load("res://main.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	assert(DisplayServer.get_name() == "headless" or OS.has_feature("headless"))
	scene.set_physics_process(false)
	scene.opening.phase = "done"
	scene.archive_root.visible = true
	for child in scene.get_children():
		if child is StaticBody3D and child.has_meta("archive_collision"):
			child.process_mode = Node.PROCESS_MODE_INHERIT
	scene.player.position = Vector3(4.0, 0.625, 0.0)
	scene.player.velocity = Vector3.ZERO
	assert(scene.skeleton != null)
	assert(scene.skeleton.find_bone("L_thigh") >= 0)
	assert(scene.skeleton.find_bone("R_arm") >= 0)

	# 先建立地面接触，再验证待机动画不会逐帧漂走。
	for frame in range(90):
		scene._physics_process(STEP)
		await process_frame
	var idle_y: float = scene.frog_visual.position.y
	assert(absf(idle_y) < 0.03)
	assert(scene.motion_state == "idle")

	Input.action_press("move_right")
	for frame in range(45):
		scene._physics_process(STEP)
		await process_frame
	assert(scene.player.velocity.x > 3.5)
	assert(scene.motion_state == "walk")
	assert(absf(scene.frog_visual.position.y) < 0.12)

	Input.action_press("jump")
	scene._physics_process(STEP)
	await process_frame
	Input.action_release("jump")
	assert(scene.player.velocity.y > 0.0)
	assert(scene.motion_state == "jump")

	var visited_fall := false
	var visited_land := false
	for frame in range(180):
		scene._physics_process(STEP)
		await process_frame
		visited_fall = visited_fall or scene.motion_state == "fall"
		visited_land = visited_land or scene.motion_state == "land"
		if visited_land and scene.motion_state == "walk":
			break
	assert(visited_fall)
	assert(visited_land)
	assert(absf(scene.player.position.y - 0.625) < 0.08)

	Input.action_release("move_right")
	print("MOVEMENT_PROBE_OK x=%.3f visual_y=%.3f state=%s" % [
		scene.player.position.x,
		scene.frog_visual.position.y,
		scene.motion_state,
	])
	quit()
