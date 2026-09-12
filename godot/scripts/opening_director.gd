extends Node
## 开场演出。经由 CameraDirector 借用电影镜头，直到落地档案馆为止。
##
## 开机不是 UI：玩家在世界里按下一台 CRT 的物理电源键。
## 引导全靠非语言线索——掌光、奶蛙的视线、电源键呼吸。

## 奶蛙蜷在机箱顶上睡觉。终端立在展台上，机箱顶 y = 0.5 + 0.14 + 1.32。
const FROG_PERCH := Vector3(-3.5, 2.585, -0.35)
const PALM_SPAN := Vector2(3.4, 2.6)
const PALM_CENTER := Vector3(-3.5, 1.7, 1.3)
const WAKE_TRAVEL := 0.12
const IDLE_TIMEOUT := 6.0
const INVITE_TIMEOUT := 14.0
const THUMP_HIT := 0.26
const THUMP_TIME := 0.62
const ARCHIVE_SPAWN := Vector3(-4.5, 4.0, 0.0)
const ARCHIVE_FLOOR_Y := 0.625
const ARRIVAL_PORTAL_POSITION := Vector3(-4.5, 2.25, -0.15)
const ARRIVAL_HOLD := 0.14
const ARRIVAL_FALL_TIME := 1.05
## 分裂桥段自带固定时长（约 9s），这里再加一道硬上限防卡。
const MITOSIS_TIMEOUT := 24.0
const MITOSIS_ACT := preload("res://scripts/mitosis_act.gd")

var world: Node3D
var phase := "idle"
var elapsed := 0.0
var tunnel: Node3D
var signal_node: MeshInstance3D
var fragments: Array[Node3D] = []
var gallery_pieces: Array[Node3D] = []
var original_transforms: Array[Transform3D] = []
var cue: Label
var steer := Vector2.ZERO
var pull_start := Vector3.ZERO
var camera_start := Vector3.ZERO
var input_state: Node
var camera_director: Node
var terminal: Node3D
var arrival_portal: ArrivalPortal
var mitosis: Node3D
var palm_point := PALM_CENTER
var palm_strength := 0.0
var pointer_travel := 0.0
var last_pointer := Vector2(0.5, 0.5)
var thump_time := -1.0
var thumped := false
var morph_meshes: Array[MeshInstance3D] = []
var ambience: AudioStreamPlayer
var effect: AudioStreamPlayer
var grabbed := false
var landed := false
var laugh_feedback_sent := false

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
	input_state = world.input_state
	camera_director = world.camera_director
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
	cue.text = ""
	cue.position = Vector2(0, 566)
	cue.size = Vector2(1280, 82)
	cue.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	cue.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	cue.add_theme_font_size_override("font_size", 22)
	terminal = gallery.get_node("BootTerminal")
	# 分裂桥段挂在展厅下，随展厅一起隐去。
	mitosis = MITOSIS_ACT.new()
	mitosis.name = "MitosisAct"
	gallery.add_child(mitosis)
	arrival_portal = world.arrival_portal
	if arrival_portal != null:
		arrival_portal.visible = false
	world.player.position = FROG_PERCH
	world.frog_visual.rotation.z = -0.16
	last_pointer = input_state.pointer

func enter(next: String) -> void:
	# 兼容旧的阶段名：抵达不再显示加载界面，而是直接打开传送门。
	if next == "load":
		next = "arrival"
	phase = next
	elapsed = 0.0
	match next:
		"seen": sound("signal")
		"boot":
			terminal.power_on()
			camera_director.add_shake(0.42)
			sound("signal")
		"mitosis":
			# 奶蛙就在机箱顶上分裂，分身从同一点弹出。
			laugh_feedback_sent = false
			mitosis.begin(world.player.position)
		"pull": sound("pull")
		"tunnel": sound("tunnel")
		"arrival":
			effect.stop()
			_begin_arrival()
		"land": landed = false
		"done": pose(0, 0)

func update(delta: float) -> bool:
	if phase == "done":
		return false
	elapsed += delta
	# 确认动作由 InputState 归一化：视觉识别的抓握与鼠标左键等价。
	var clicked: bool = input_state.consume_confirm()
	steer = steer.lerp(input_state.steer, 1.0 - exp(-delta * 4.0))
	var body: Node3D = world.frog_visual
	_track_palm(delta)
	match phase:
		"idle":
			# 暗房待机。零文字零按钮，只有呼吸和极慢的镜头漂移说明「没卡住」。
			pose(1, 0)
			body.scale = Vector3(1, 0.94 + sin(elapsed * 1.8) * 0.012, 1)
			_boot_camera(sin(elapsed * 0.22) * 0.55)
			# 鼠标兑底下 active 永远为真，所以“被看见”要区分两种输入：
			# 视觉模式看手是否真的进画，鼠标模式看指针是否真的在动。
			var noticed: bool = input_state.is_vision_driven() and palm_strength > 0.35
			if noticed or pointer_travel > WAKE_TRAVEL or clicked or elapsed > IDLE_TIMEOUT:
				enter("seen")
		"seen":
			# 「我看见你了」：睁眼、看向掌光。零教程能不能成立全看这一下。
			pose(1.0 - smoothstep(0.1, 0.9, elapsed), 0)
			body.scale = body.scale.lerp(Vector3.ONE, delta * 3.0)
			body.rotation.z = lerpf(body.rotation.z, 0.0, delta * 3.0)
			_look_at_point(body, palm_point, delta * 4.0)
			_boot_camera(sin(elapsed * 0.22) * 0.4)
			if elapsed > 1.15:
				enter("invite")
		"invite":
			# 非语言的「指那儿」：电源键呼吸，奶蛙视线在键与你的手之间来回。
			pose(0, 0)
			terminal.set_invite(true)
			var to_button := fmod(elapsed, 2.4) > 1.2
			var gaze: Vector3 = terminal.button_world_position() if to_button else palm_point
			_look_at_point(body, gaze, delta * 3.2)
			body.scale = body.scale.lerp(Vector3(1, 1, 1), delta * 3.0)
			_boot_camera(sin(elapsed * 0.22) * 0.3)
			if clicked or elapsed > INVITE_TIMEOUT:
				terminal.set_invite(false)
				enter("boot")
		"boot":
			# 开机自检跑在终端自己身上；这里只管奶蛙被吓醒和拍机箱。
			var startle := maxf(1.0 - elapsed * 1.6, 0.0)
			body.scale = Vector3(1.0 - startle * 0.16, 1.0 + startle * 0.26, 1.0 - startle * 0.16)
			if elapsed < 1.0:
				_look_at_point(body, terminal.screen_world_position(), delta * 6.0)
			else:
				_look_at_point(body, palm_point, delta * 2.0)
			world.player.position.y = FROG_PERCH.y + startle * 0.22
			_boot_camera(0.0)
			_drive_thump(delta, body)
			if terminal.is_complete():
				enter("mitosis")
		"mitosis":
				# 分裂桥段：本体只驱动主角，分身的表演在 mitosis_act 里。
			mitosis.advance(delta)
			if mitosis.has_method("laugh_prompt_active") and mitosis.laugh_prompt_active():
				# 视觉识别笑脸达到阈值并保持 0.65 秒才会放行；
				# 摄像头不可用时仍允许点击/空格作为明确的兜底动作。
				var fallback_laugh: bool = not input_state.vision_online and (clicked or Input.is_action_just_pressed("jump"))
				mitosis.set_laugh_input(input_state.smile, input_state.face_detected, fallback_laugh)
				_update_laugh_prompt()
			elif mitosis.stage == "laugh":
				_update_laugh_success()
			_drive_mitosis_body(delta, body)
			_mitosis_camera()
			if mitosis.is_complete() or elapsed > MITOSIS_TIMEOUT:
				mitosis.cleanup()
				signal_node.visible = true
				pull_start = world.player.position
				camera_start = world.camera.position
				enter("pull")
		"pull":
			var p := clampf(elapsed / 4.5, 0, 1)
			var force := p * p * p
			pose(0, smoothstep(0.15, 0.48, p))
			ambience.volume_db = lerpf(-12, -40, p)
			terminal.collapse(force)
			# 非语言的「握住」邀请：信号急促脉动，握住后转为稳定亮起。
			if p > 0.3 and p < 0.78 and not grabbed:
				signal_node.scale *= 1.0 + sin(elapsed * 22.0) * 0.16
				if clicked:
					grabbed = true
					camera_director.add_shake(0.3)
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
			camera_director.apply_cinematic(
				camera_start.lerp(Vector3(4.5, 4.1, 2.8), force),
				Vector3(4.5 * p, 3.0 + p, -3),
				44 + force * 34
			)
			flash(smoothstep(0.87, 1.0, p))
			if p >= 1:
				world.get_node("PresentDayGallery").visible = false
				tunnel.visible = true
				enter("tunnel")
		"tunnel":
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
			camera_director.apply_cinematic(
				Vector3(100 + steer.x * 0.7, 3 - steer.y * 0.4, 10),
				Vector3(100 + bend.x * 0.8, 3 + bend.y * 0.5, -18),
				76 + sin(p * PI) * 7,
				-steer.x * 0.1
			)
			flash(maxf(1.0 - elapsed * 1.8, smoothstep(0.91, 1, p)))
			if p >= 1:
				enter("arrival")
		"arrival":
			# 给传送门一个短暂的开合读秒，之后奶蛙从门口掉出。
			if elapsed >= ARRIVAL_HOLD:
				enter("land")
		"land":
			pose(0, 0)
			ambience.volume_db = lerpf(-40, -18, clampf(elapsed / 1.8, 0, 1))
			# 传送门在落地镜头里逐渐解析，完全不显示旧的加载 UI。
			if arrival_portal != null:
				arrival_portal.set_progress(clampf(elapsed / 0.62, 0.0, 1.0))
			var fall_p := clampf(elapsed / ARRIVAL_FALL_TIME, 0.0, 1.0)
			var fall_ease := 1.0 - pow(1.0 - fall_p, 2.15)
			world.player.position.y = lerpf(ARCHIVE_SPAWN.y, ARCHIVE_FLOOR_Y, fall_ease)
			if elapsed > 0.92:
				if not landed:
					landed = true
					sound("landing")
					camera_director.add_shake(0.55)
				var impact := sin(clampf((elapsed - 0.92) / 0.45, 0, 1) * PI)
				body.scale = Vector3(1 + impact * 0.12, 1 - impact * 0.2, 1)
			if elapsed > 1.8:
				if arrival_portal != null:
					arrival_portal.close()
				world.tunnel_overlay.visible = false
				world.story_phase = 2
				world.phase_time = 2
				world.player.velocity = Vector3.ZERO
				enter("done")
	return true

## 抵达档案馆：切换场景、定位镜头，并在出生点打开视觉传送门。
## 传送门是纯视觉 Node3D，没有碰撞，不会干扰奶蛙的落地物理。
func _begin_arrival() -> void:
	if arrival_portal == null:
		# 旧场景没有传送门时仍能安全抵达；只跳过视觉门。
		push_warning("ArrivalPortal 节点缺失，抵达段将以无门模式继续")
	tunnel.visible = false
	world.get_node("PresentDayGallery").visible = false
	world.archive_root.visible = true
	for child in world.get_children():
		if child is StaticBody3D and child.has_meta("archive_collision"):
			child.process_mode = Node.PROCESS_MODE_INHERIT
	world.player.velocity = Vector3.ZERO
	world.player.position = ARCHIVE_SPAWN
	camera_director.snap_to(Vector3(-1.8, 4.6, 12.5), Vector3(-1.8, 2.35, 0), 44)
	world.frog_visual.rotation = Vector3.ZERO
	world.frog_visual.scale = Vector3.ONE
	# tunnel 结束时可能留下最后一帧闪白；在传送门镜头开始前清掉它。
	world.tunnel_overlay.visible = false
	world.tunnel_overlay.color = Color(0.02, 0.04, 0.08, 0)
	world.tunnel_overlay.get_node("LoadingLabel").visible = false
	world.tunnel_overlay.get_node("LoadingTrack").visible = false
	world.tunnel_overlay.get_node("LoadingBar").visible = false
	if arrival_portal != null:
		arrival_portal.open_at(ARRIVAL_PORTAL_POSITION)
		arrival_portal.set_progress(0.0)

## 掌光：把 InputState 的归一化指针投到展台前的一层世界平面上。
## 不用相机 unproject，因为开场镜头本身在动，固定平面更稳。
func _track_palm(delta: float) -> void:
	var pointer: Vector2 = input_state.pointer
	pointer_travel += pointer.distance_to(last_pointer)
	last_pointer = pointer
	var active: bool = input_state.active
	var target := 1.0 if active else 0.0
	palm_strength = lerpf(palm_strength, target, 1.0 - exp(-delta * 5.0))
	palm_point = PALM_CENTER + Vector3(
		(pointer.x - 0.5) * PALM_SPAN.x,
		(0.5 - pointer.y) * PALM_SPAN.y,
		0.0
	)
	if terminal != null:
		terminal.set_palm(palm_point, palm_strength if phase != "pull" else 0.0)

## 开机段的镜头：靠近终端的侧住机位，极慢漂移说明程序活着。
func _boot_camera(drift: float) -> void:
	camera_director.apply_cinematic(
		Vector3(-2.4 + drift, 2.9, 4.5),
		Vector3(-3.4, 1.95, -0.3),
		40.0
	)

## 转向目标。只动 yaw，保持侧视构图不被破坏。
func _look_at_point(body: Node3D, target: Vector3, weight: float) -> void:
	var to_target := target - body.global_position
	if to_target.length_squared() < 0.0004:
		return
	var yaw := atan2(to_target.x, to_target.z)
	body.rotation.y = lerp_angle(body.rotation.y, yaw, clampf(weight, 0.0, 1.0))

## 进度条卡 99%，奶蛙拍一下机箱。
## 既是笑点，也顺带教会玩家「这个世界可以被拍打」。
func _drive_thump(delta: float, body: Node3D) -> void:
	if thump_time < 0.0:
		if terminal.needs_thump():
			thump_time = 0.0
		return
	if thumped:
		return
	thump_time += delta
	var p := clampf(thump_time / THUMP_TIME, 0.0, 1.0)
	# 抬起→落下的单次动作，命中帧给声音与震屏。
	var swing := sin(p * PI)
	body.rotation.z = -swing * 0.5
	world.player.position.y = FROG_PERCH.y + swing * 0.16
	if thump_time >= THUMP_HIT:
		thumped = true
		body.rotation.z = 0.0
		terminal.register_thump()
		camera_director.add_shake(0.5)
		sound("landing")

## 分裂桥段里的主角：被撑大、对话、目送妈妈离开、然后笑场。
## 分身自己的表演在 mitosis_act 里，这里不碰它。
func _drive_mitosis_body(delta: float, body: Node3D) -> void:
	var stage: String = mitosis.stage
	# 分裂全程主角站在机箱顶不动，抖动靠 scale 与 rotation 表达。
	world.player.position.y = FROG_PERCH.y
	match stage:
		"swell":
			# 被体内的妈妈撑得鼓起来，越接近弹开越发抖。
			var s: float = mitosis.swell_amount()
			var tremor := sin(elapsed * 34.0) * s * 0.035
			body.scale = Vector3(1.0 + s * 0.3 + tremor, 1.0 + s * 0.12, 1.0 + s * 0.3)
			body.rotation.z = tremor * 1.6
			pose(0.0, s * 0.7)
		"split":
			# 同一帧弹回去，果冻余震。
			var back: float = mitosis.swell_amount()
			body.scale = Vector3(1.0 + back * 0.22, 1.0 - back * 0.1, 1.0 + back * 0.22)
			body.rotation.z = lerpf(body.rotation.z, 0.0, delta * 8.0)
			pose(0.0, back * 0.4)
			_look_at_point(body, mitosis.twin_world_position(), delta * 7.0)
		"banter":
			body.scale = body.scale.lerp(Vector3.ONE, delta * 6.0)
			body.rotation.z = lerpf(body.rotation.z, 0.0, delta * 6.0)
			pose(0.0, 0.0)
			_look_at_point(body, mitosis.twin_world_position(), delta * 5.0)
		"abandon":
			# 目送：跟着妈妈转头，身体微前倾。
			body.scale = body.scale.lerp(Vector3(0.98, 1.02, 0.98), delta * 4.0)
			pose(0.0, 0.0)
			_look_at_point(body, mitosis.twin_world_position(), delta * 6.0)
		"beat":
			# 喜剧停顿：一动不动地盯着妈妈消失的方向。
			body.scale = body.scale.lerp(Vector3.ONE, delta * 3.0)
			pose(0.0, 0.0)
		"laugh_prompt":
			# 先憋笑：嘴角微抬、身体轻轻前倾，等待用户给出笑脸。
			var progress: float = mitosis.laugh_progress()
			body.scale = body.scale.lerp(Vector3(1.0 + progress * 0.06, 1.0 - progress * 0.04, 1.0 + progress * 0.06), delta * 6.0)
			body.rotation.x = lerpf(body.rotation.x, -0.08 - progress * 0.08, delta * 5.0)
			pose(0.0, progress * 0.35)
		"laugh":
			# 捧腹大笑：闭眼、后仰、按笑声节奏抽动。
			var amount: float = mitosis.laugh_amount()
			var shake := sin(mitosis.stage_time * TAU * 6.5)
			body.scale = Vector3(
				1.0 + amount * 0.16 + shake * amount * 0.05,
				1.0 - amount * 0.1 - shake * amount * 0.06,
				1.0 + amount * 0.16
			)
			body.rotation.z = shake * amount * 0.14
			# 往后仰，笑得直不起腰
			body.rotation.x = -amount * 0.34
			pose(1.0, 0.0)

## 分裂桥段的镜头：swell/split 推近看果冻感，
## abandon 拉宽保住跑走的妈妈，laugh 再收紧到主角身上。
func _mitosis_camera() -> void:
	var stage: String = mitosis.stage
	var twin: Vector3 = mitosis.twin_world_position()
	var focus: Vector3 = (world.player.position + twin) * 0.5
	match stage:
		"abandon":
			camera_director.apply_cinematic(
				Vector3(focus.x + 1.6, 3.0, 7.4),
				Vector3(focus.x, 1.7, -0.3),
				54.0
			)
		"beat", "laugh_prompt", "laugh":
			camera_director.apply_cinematic(
				Vector3(-2.6, 2.95, 3.7),
				Vector3(-3.5, 2.35, -0.3),
				35.0
			)
		_:
			camera_director.apply_cinematic(
				Vector3(-2.9, 2.95, 3.9),
				Vector3(focus.x, 2.3, -0.3),
				37.0
			)

func flash(amount: float) -> void:
	world.tunnel_overlay.visible = amount > 0
	world.tunnel_overlay.color = Color(0.7, 0.9, 0.94, amount)
	world.tunnel_overlay.get_node("LoadingLabel").modulate.a = 0
	world.loading_bar.visible = false
	world.loading_bar.get_parent().get_node("LoadingTrack").visible = false

func _update_laugh_prompt() -> void:
	if cue == null:
		return
	var progress: float = mitosis.laugh_progress()
	if not input_state.vision_online:
		cue.text = "请对着摄像头大笑\n摄像头未连接时：点击鼠标或按空格继续"
	elif not input_state.face_detected:
		cue.text = "请看向右下角摄像头\n让奶蛙看见你的笑脸"
	elif input_state.smile < 0.58:
		cue.text = "请对着摄像头大笑\n笑容强度  %d%%" % int(input_state.smile * 100.0)
	else:
		cue.text = "检测到笑脸！保持一下……  %d%%" % int(progress * 100.0)
	cue.visible = true
	cue.modulate.a = 1.0

func _update_laugh_success() -> void:
	if not laugh_feedback_sent:
		laugh_feedback_sent = true
		camera_director.add_shake(0.34 if mitosis.laugh_triggered_by_user else 0.16)
	if cue == null:
		return
	if mitosis.stage_time < 0.85:
		cue.text = "笑容同步成功！" if mitosis.laugh_triggered_by_user else "奶娃没忍住，先笑了出来"
		cue.visible = true
	else:
		cue.text = ""

