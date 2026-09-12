extends SceneTree
var scene: Node3D
var capture_enabled := false

func _initialize() -> void:
	capture_enabled = "--capture" in OS.get_cmdline_user_args() and DisplayServer.get_name() != "headless"
	call_deferred("check")

func capture(label: String) -> void:
	if not capture_enabled:
		return
	await RenderingServer.frame_post_draw
	var filename := "user://archive_%s.png" % label
	root.get_texture().get_image().save_png(filename)
	print("CAPTURE: ", ProjectSettings.globalize_path(filename))

func check() -> void:
	create_timer(45.0).timeout.connect(func():
		push_error("Archive check exceeded timeout")
		quit(1))
	scene = load("res://main.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	scene.set_physics_process(false)
	for child in scene.get_children():
		if child.get_script() == load("res://scripts/login_ui.gd"):
			child.queue_free()
	var gallery := scene.get_node("PresentDayGallery") as Node3D
	gallery.visible = false
	scene.archive_root.visible = true
	assert(scene.meme_room == null)
	var fx := scene.archive_root.get_node_or_null("FX") as Node3D
	assert(fx != null)
	assert(fx.get_node_or_null("ArchiveDust") != null)
	assert(fx.get_node_or_null("ArchiveScreenShaft") != null)
	assert(fx.get_node_or_null("ExitWarmPool") != null)
	assert(scene.archive_interaction != null)
	var drawers := scene.archive_root.get_node_or_null("ArchiveDrawers") as Node3D
	assert(drawers != null, "Three cabinet drawers missing")
	for id in ["seen_2016", "imitated_2020", "covered_2024"]:
		assert(drawers.get_node_or_null("Drawer_" + id) != null, "Drawer missing: " + id)
	var interaction = scene.archive_interaction
	assert(interaction != null)
	interaction.set_active(true)
	assert(interaction.active)
	assert(scene.archive_arcade != null)
	var arcade_root := scene.archive_root.get_node_or_null("ArcadeMachines") as Node3D
	assert(arcade_root != null, "Arcade machines missing")
	for arcade_id in ["snake", "tetris", "breakout"]:
		assert(arcade_root.get_node_or_null("Arcade_" + arcade_id) != null, "Arcade missing: " + arcade_id)
	assert(scene.archive_root.get_node_or_null("ArchivePosters") != null, "Neon posters missing")
	assert(scene.archive_npc != null)
	scene.archive_npc.set_active(true)
	scene.player.position = Vector3(-1.0, 0.65, 0.55)
	scene.archive_npc._interact()
	for i in range(3):
		scene.archive_npc._advance_dialogue()
	assert(scene.archive_npc.get_portal("seen_2016") != null)
	scene._on_memory_portal_entered("seen_2016")
	for frame in range(240):
		scene._update_memory_tunnel(1.0 / 60.0)
	assert(scene.destination_root != null)
	assert(scene.destination_root.memory_id == "seen_2016")
	scene._return_from_destination()
	assert(scene.destination_root == null and scene.archive_root.visible)
	scene.archive_npc.set_active(false)
	interaction.set_active(true)
	scene.archive_npc.set_active(false)
	scene.tunnel_overlay.visible = false
	for point in [{"id":"entry", "x":-4.5}, {"id":"arcade_snake", "x":5.2}, {"id":"mid", "x":11.4}, {"id":"arcade_tetris", "x":17.6}, {"id":"arcade_breakout", "x":30.0}, {"id":"exit", "x":34.0}]:
		var x: float = point.x
		scene.player.position = Vector3(x, 0.65, 0)
		scene.camera.position = Vector3(clampf(x + 2.5, 0, 32), 4.5, 12.5)
		scene.camera.look_at(Vector3(scene.camera.position.x, 3.0, 0))
		for frame in range(15):
			await process_frame
		await capture(String(point.id))
	# 三个记忆房间（夜市 / 街镇 / 公园）逐一搭建，兼作无头冒烟测试。
	for dest_id in ["seen_2016", "imitated_2020", "covered_2024"]:
		var room := preload("res://scripts/memory_destination.gd").new()
		room.position = Vector3(200, 0, 0)
		scene.add_child(room)
		room.setup(String(dest_id))
		room.tick(3.0)
		scene.camera.position = Vector3(200, 4.2, 9.5)
		scene.camera.look_at(Vector3(200, 2.0, -2.0))
		for frame in range(15):
			await process_frame
		await capture("dest_" + String(dest_id))
		room.queue_free()
		await process_frame
	# Required memories: drawer, beat retry + delayed sync, pause then save.
	scene.player.position = Vector3(-1.0, 0.65, -1.7)
	interaction.interact()
	for frame in range(80):
		interaction.tick(1.0 / 60.0)
	assert(interaction.get_node_state("seen_2016") == "solved")
	scene.player.position = Vector3(11.4, 0.65, -1.7)
	interaction.interact()
	interaction.choose_beat(1)
	assert(interaction.get_node_state("imitated_2020") == "active")
	interaction.choose_beat(2)
	assert(interaction.get_node_state("imitated_2020") == "active")
	for frame in range(120):
		interaction.tick(1.0 / 60.0)
	assert(interaction.get_node_state("imitated_2020") == "solved")
	scene.player.position = Vector3(23.8, 0.65, -1.7)
	interaction.interact()
	interaction.tick(interaction.pause_window + 0.1)
	assert(interaction.get_node_state("covered_2024") == "nearby")
	interaction.interact()
	interaction.interact()
	assert(interaction.get_node_state("covered_2024") == "solved")
	assert(interaction.main_count() == 3)
	var endings: Array[String] = []
	interaction.ending_chosen.connect(func(kind: String): endings.append(kind))
	scene.player.position = Vector3(36, 0.65, 0)
	interaction.interact()
	assert(interaction.ending_done and endings.back() == "save")
	interaction.ending_done = false
	interaction.set_active(true)
	var release := InputEventKey.new()
	release.keycode = KEY_Q
	release.pressed = true
	interaction._unhandled_input(release)
	assert(interaction.ending_done and endings.back() == "network")
	interaction.ending_done = false
	interaction.ending_elapsed = 0.0
	interaction.set_active(true)
	interaction.tick(11.9)
	assert(not interaction.ending_done)
	interaction.tick(0.2)
	assert(interaction.ending_done and endings.back() == "stay")
	print("PASS: three cabinet memories with one NPC and portal each")
	print("PASS: E save, Q network and 12-second stay endings")
	print("Archive checkpoints loaded successfully")
	scene.queue_free()
	await process_frame
	quit()
