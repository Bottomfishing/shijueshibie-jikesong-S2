extends SceneTree
## 在真实渲染器中检查入口、中段和出口；通过 -- --capture 保存预览。
var scene: Node3D

func _initialize() -> void:
	call_deferred("check")

func check() -> void:
	scene = load("res://main.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	scene.set_physics_process(false)
	scene.get_node("PresentDayGallery").visible = false
	scene.archive_root.visible = true
	scene.tunnel_overlay.visible = false
	for x in [-4.5, 14.0, 34.0]:
		scene.player.position = Vector3(x, 0.65, 0)
		scene.camera.position = Vector3(clampf(x + 2.5, 0, 32), 4.5, 12.5)
		scene.camera.look_at(Vector3(scene.camera.position.x, 3.0, 0))
		for frame in range(15):
			await process_frame
		if "--capture" in OS.get_cmdline_user_args():
			await RenderingServer.frame_post_draw
			var filename := "user://archive_%d.png" % int(x)
			root.get_texture().get_image().save_png(filename)
			print("CAPTURE: ", ProjectSettings.globalize_path(filename))
	print("Archive checkpoints loaded successfully")
	quit()
