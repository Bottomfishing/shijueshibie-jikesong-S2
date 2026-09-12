extends Node
## Owns the cinematic camera until the archive landing finishes.
var world: Node3D
var phase := "sleep"
var elapsed := 0.0
var tunnel: Node3D
var signal_node: MeshInstance3D
var fragments: Array[Node3D] = []
var gallery_pieces: Array[Node3D] = []
var original_transforms: Array[Transform3D] = []
var cue: Label
var steer := Vector2.ZERO
var pull_start := Vector3.ZERO
var click_held := false
var camera_start := Vector3.ZERO
var morph_meshes: Array[MeshInstance3D] = []
var ambience: AudioStreamPlayer
var effect: AudioStreamPlayer
var grabbed := false
var landed := false

func pose(blink: float, reach: float) -> void:
	for mesh in morph_meshes:
		for i in range(mesh.mesh.get_blend_shape_count()):
			var key: String = mesh.mesh.get_blend_shape_name(i)
			mesh.set_blend_shape_value(i, blink if key == "Blink" else reach)

func sound(name: String) -> void:
	effect.stream = load("res://assets/audio/%s.wav" % name)
	effect.play()

func setup(owner_world: Node3D) -> void:
	world = owner_world
	for node in world.frog_visual.find_children("*", "MeshInstance3D", true, false):
		if node.mesh.get_blend_shape_count() > 0:
			morph_meshes.append(node)
	ambience = $Ambience
	effect = $StorySound
	ambience.finished.connect(ambience.play)
	ambience.play()
	pose(1, 0)
	var gallery: Node3D = world.get_node("PresentDayGallery")
	for child in gallery.get_children():
		if child is MeshInstance3D and child.name != "UnknownSignal":
			gallery_pieces.append(child)
			original_transforms.append(child.transform)
	signal_node = gallery.get_node("UnknownSignal")
	signal_node.visible = false
	tunnel = world.get_node("TimeTunnel")
	tunnel.visible = false
	for child in tunnel.get_children():
		if child.is_in_group("tunnel_fragments"):
			fragments.append(child)
	cue = world.get_node("Interface/StoryCue")
	world.player.position = Vector3(-3.5, 1.125, -0.2)
	world.frog_visual.rotation.z = -0.16

func enter(next: String) -> void:
	phase = next
	elapsed = 0.0
	match next:
		"wake": sound("signal")
		"pull": sound("pull")
		"tunnel": sound("tunnel")
		"load": effect.stop()
		"land": landed = false
		"done": pose(0, 0)

func update(delta: float) -> bool:
	if phase == "done":
		return false
	elapsed += delta
	var pressed := Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)
	var clicked := pressed and not click_held
	click_held = pressed
	var mouse := world.get_viewport().get_mouse_position() / world.get_viewport().get_visible_rect().size
	steer = steer.lerp((mouse - Vector2(0.5, 0.5)) * 2.0, 1.0 - exp(-delta * 4.0))
	var body: Node3D = world.frog_visual
	match phase:
		"login":
			return true
		"sleep":
			pose(1, 0)
			cue.text = "点击唤醒馆藏"
			body.scale = Vector3(1, 0.94 + sin(elapsed * 1.8) * 0.012, 1)
			if clicked or elapsed > 7.0:
				enter("wake")
		"wake":
			pose(1 - smoothstep(0.15, 1.4, elapsed), 0)
			cue.text = "再次点击，回应屏幕中的信号"
			body.rotation.z = lerpf(body.rotation.z, 0, delta * 2.0)
			body.scale = body.scale.lerp(Vector3.ONE, delta * 2.0)
			signal_node.visible = true
			signal_node.scale = Vector3.ONE * (1.0 + sin(elapsed * 5.0) * 0.3)
			if (clicked and elapsed > 0.6) or elapsed > 6.0:
				pull_start = world.player.position
				camera_start = world.camera.position
				enter("pull")
		"pull":
			cue.text = "信号正在牵引你……"
			var p := clampf(elapsed / 4.5, 0, 1)
			var force := p * p * p
			pose(0, smoothstep(0.15, 0.48, p))
			ambience.volume_db = lerpf(-12, -40, p)
			if p > 0.3 and p < 0.78:
				cue.text = "点击握住它的手" if not grabbed else "抓住了，别松手"
				if clicked:
					grabbed = true
			var destination := Vector3(4.5, 4.0, -3.0)
			world.player.position = pull_start.lerp(destination, force)
			body.rotation.z = -sin(p * PI) * 0.6
			body.scale = Vector3(1 - force * 0.6, 1 + sin(p * PI) * 0.3, 1)
			signal_node.position = destination.lerp(pull_start + Vector3(0, 1, 0), sin(p * PI) * 0.65)
			signal_node.scale = Vector3.ONE * (1 + force * 22)
			for i in range(gallery_pieces.size()):
				var piece := gallery_pieces[i]
				var original := original_transforms[i]
				piece.position = original.origin.lerp(destination, force * 0.5)
				piece.scale = Vector3(1 - force * 0.65, 1 - force * 0.3, 1 + force * 9)
				piece.rotation.z = sin(float(i)) * force * 0.35
			world.camera.position = camera_start.lerp(Vector3(4.5, 4.1, 2.8), force)
			world.camera.look_at(Vector3(4.5 * p, 3.0 + p, -3))
			world.camera.fov = 44 + force * 34
			flash(smoothstep(0.87, 1.0, p))
			if p >= 1:
				world.get_node("PresentDayGallery").visible = false
				tunnel.visible = true
				enter("tunnel")
		"tunnel":
			cue.text = "移动鼠标改变穿行方向"
			var p := clampf(elapsed / 9.0, 0, 1)
			pose(0, (0.8 if grabbed else 0.45) * (1 - smoothstep(0.75, 1, p)))
			var bend := Vector2(sin(elapsed * 0.7) * 0.7, cos(elapsed * 0.6) * 0.4) + steer * 2.5
			for i in range(fragments.size()):
				var z := fposmod(float(i / 12) * 4.5 + elapsed * (12 + p * 12), 58.5) - 49.0
				var angle := float(i % 12) * TAU / 12 + z * 0.022 + elapsed * 0.15
				var depth := (8 - z) / 58.0
				fragments[i].position = Vector3(cos(angle) * 4.5 + bend.x * depth * depth * 5, sin(angle) * 3.3 + 3 + bend.y * depth * depth * 4, z)
				fragments[i].rotation.z = angle * 0.2
			world.player.position = Vector3(100 + steer.x * 1.8, 2.1 - steer.y * 1.2 + sin(elapsed * 2) * 0.1, 2)
			body.scale = body.scale.lerp(Vector3.ONE * 0.85, delta * 4)
			body.rotation = Vector3(-0.12, sin(elapsed) * 0.15, -steer.x * 0.35)
			world.camera.position = Vector3(100 + steer.x * 0.7, 3 - steer.y * 0.4, 10)
			world.camera.look_at(Vector3(100 + bend.x * 0.8, 3 + bend.y * 0.5, -18))
			world.camera.rotate_object_local(Vector3.FORWARD, -steer.x * 0.1)
			world.camera.fov = 76 + sin(p * PI) * 7
			flash(maxf(1.0 - elapsed * 1.8, smoothstep(0.91, 1, p)))
			if p >= 1:
				enter("load")
		"load":
			cue.text = ""
			tunnel.visible = false
			world.tunnel_overlay.visible = true
			world.tunnel_overlay.color = Color(0.02, 0.04, 0.08, 1)
			world.tunnel_overlay.get_node("LoadingLabel").modulate.a = 1
			world.loading_bar.get_parent().get_node("LoadingTrack").visible = true
			world.loading_bar.visible = true
			world.loading_bar.size.x = 400 * clampf(elapsed / 1.8, 0, 1)
			if elapsed >= 1.8:
				world.archive_root.visible = true
				if world.meme_room != null:
					world.meme_room.visible = false
				if world.archive_interaction != null:
					world.archive_interaction.set_active(true)
				if world.archive_npc != null:
					world.archive_npc.set_active(true)
				if world.archive_arcade != null:
					world.archive_arcade.set_active(true)
				for child in world.get_children():
					if child is StaticBody3D and child.has_meta("archive_collision"):
						child.process_mode = Node.PROCESS_MODE_INHERIT
				world.player.position = Vector3(-4.5, 4, 0)
				world.camera.position = Vector3(2, 4.5, 12.5)
				world.camera.look_at(Vector3(2, 3, 0))
				world.camera.fov = 44
				body.rotation = Vector3.ZERO
				body.scale = Vector3.ONE
				enter("land")
		"land":
			pose(0, 0)
			ambience.volume_db = lerpf(-40, -18, clampf(elapsed / 1.8, 0, 1))
			world.tunnel_overlay.color.a = maxf(0, 1 - elapsed * 1.5)
			world.tunnel_overlay.get_node("LoadingLabel").modulate.a = 0
			world.loading_bar.visible = false
			world.loading_bar.get_parent().get_node("LoadingTrack").visible = false
			world.player.position.y = maxf(0.625, 4 - elapsed * elapsed * 4)
			if elapsed > 0.92:
				if not landed:
					landed = true
					sound("landing")
				var impact := sin(clampf((elapsed - 0.92) / 0.45, 0, 1) * PI)
				body.scale = Vector3(1 + impact * 0.12, 1 - impact * 0.2, 1)
			if elapsed > 1.8:
				world.tunnel_overlay.visible = false
				world.story_phase = 2
				world.phase_time = 2
				world.player.velocity = Vector3.ZERO
				world.tunnel_overlay.get_parent().get_node("MovementHint").visible = true
				cue.text = ""
				enter("done")
	return true

func flash(amount: float) -> void:
	world.tunnel_overlay.visible = amount > 0
	world.tunnel_overlay.color = Color(0.7, 0.9, 0.94, amount)
	world.tunnel_overlay.get_node("LoadingLabel").modulate.a = 0
	world.loading_bar.visible = false
	world.loading_bar.get_parent().get_node("LoadingTrack").visible = false

