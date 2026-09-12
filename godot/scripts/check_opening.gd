extends SceneTree

## 有界的开场冒烟检查。
## 不手动快进 opening.update()，因为终端自身的 _process 需要真实帧推进；
## 该检查只验证依赖加载，避免测试进程占用摄像头和 UDP 端口。
func _initialize() -> void:
	call_deferred("check")

func check() -> void:
	var scene: Node = load("res://main.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	assert(OS.has_feature("headless") or DisplayServer.get_name() == "headless")
	assert(scene.opening != null)
	assert(scene.visual_recognition != null)
	assert(scene.arrival_portal != null)
	assert(scene.tunnel_overlay != null)
	var packet_accepted: bool = scene.visual_recognition._accept_packet({
		"confidence": 1.0,
		"bridge_online": true,
		"face_detected": true,
		"smile": 0.82,
		"laugh": true,
		"bridge_status": "test",
	})
	assert(packet_accepted)
	assert(scene.visual_recognition.observation["face_detected"])
	assert(scene.visual_recognition.observation["smile"] > 0.8)
	var act: Node = scene.opening.mitosis
	act._enter("laugh_prompt")
	for frame in range(45):
		act.set_laugh_input(0.82, true)
		act.advance(1.0 / 60.0)
	assert(act.stage == "laugh")
	assert(act.laugh_triggered_by_user)
	print("OPENING_SMOKE_OK visual=%s portal=%s" % [scene.visual_recognition.name, scene.arrival_portal.name])
	scene.queue_free()
	await process_frame
	quit()
