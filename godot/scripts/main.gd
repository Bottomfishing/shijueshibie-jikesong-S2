extends Node3D

@onready var player: CharacterBody3D = $MilkFrog
@onready var camera: Camera3D = $CinematicSideCamera
@onready var frog_visual: Node3D = $MilkFrog/CharacterVisual
@onready var tunnel_overlay: ColorRect = $Interface/TransitionOverlay
@onready var loading_bar: ColorRect = $Interface/TransitionOverlay/LoadingBar
@onready var archive_root: Node3D = $ArchiveArchitecture
@onready var opening: Node = $StoryDirector
@onready var visual_recognition: Node = $VisualRecognition
@onready var input_state: Node = $InputState
@onready var camera_director: Node = $CameraDirector
@onready var arrival_portal: Node3D = $ArrivalPortal
var story_phase := 0
var phase_time := 0.0
var skeleton: Skeleton3D
var locomotion := "idle"
var anim_time := 0.0
var meme_room: Node3D
var archive_interaction: Node
var archive_fx: Node
var archive_npc: Node
var archive_arcade: Node
var arcade_active := false
var destination_root: Node3D
var destination_id := ""
var destination_active := false
var destination_elapsed := 0.0
var in_destination := false

func _ready() -> void:
	archive_root.visible = false
	# 传送门只在开场抵达段出现；旧加载界面的节点保留用于兼容旧场景，
	# 但从启动开始就明确隐藏，避免任何转场闪白时误显示进度条。
	arrival_portal.visible = false
	$Interface/TransitionOverlay/LoadingLabel.visible = false
	$Interface/TransitionOverlay/LoadingTrack.visible = false
	$Interface/TransitionOverlay/LoadingBar.visible = false
	camera_director.set_follow_bounds(0.0, 31.5)
	# 没有登录界面：开机是世界里的一个物理动作，由 BootTerminal 承担。
	opening.phase = "idle"
	opening.setup(self)
	skeleton = frog_visual.find_child("MilkFrog_Skeleton", true, false) as Skeleton3D
	if skeleton == null:
		skeleton = frog_visual.find_child("Armature", true, false) as Skeleton3D
	# 档案走廊玩法栈：三段记忆交互、氛围 FX、柜前 NPC、霓虹海报与三台街机。
	meme_room = null
	archive_interaction = preload("res://scripts/archive_interaction.gd").new()
	archive_interaction.name = "ArchiveInteraction"
	add_child(archive_interaction)
	archive_interaction.setup(self)
	archive_interaction.set_active(false)
	preload("res://scripts/archive_details.gd").build_fx(archive_root)
	archive_fx = preload("res://scripts/archive_fx.gd").new()
	archive_fx.name = "ArchiveFX"
	add_child(archive_fx)
	archive_fx.setup(self, archive_interaction)
	archive_npc = preload("res://scripts/archive_npc_dialogue.gd").new()
	archive_npc.name = "ArchiveNPCDialogue"
	add_child(archive_npc)
	archive_npc.setup(self)
	archive_npc.set_active(false)
	archive_npc.dialogue_started.connect(_on_npc_dialogue_started)
	archive_npc.portal_entered.connect(_on_memory_portal_entered)
	preload("res://scripts/archive_posters.gd").new().setup(archive_root)
	archive_arcade = preload("res://scripts/archive_arcade.gd").new()
	archive_arcade.name = "ArchiveArcade"
	add_child(archive_arcade)
	archive_arcade.setup(self)
	archive_arcade.set_active(false)
	archive_arcade.game_started.connect(_on_arcade_started)
	archive_arcade.game_closed.connect(_on_arcade_closed)

func _physics_process(delta: float) -> void:
	if arcade_active:
		return
	if destination_active or in_destination:
		if destination_active:
			_update_memory_tunnel(delta)
		else:
			_update_destination_room(delta)
		return
	# InputState 先于剧情推进，保证两侧读到同一帧输入。
	input_state.poll(delta)
	camera_director.process_shake(delta)
	if opening.update(delta):
		return
	phase_time += delta
	# 移动方向已由 InputState 归一化：键鼠优先，视觉识别兜底。
	var direction: Vector2 = input_state.axis
	var sprinting := Input.is_key_pressed(KEY_SHIFT)
	var crawling := Input.is_key_pressed(KEY_CTRL)
	var speed := direction.length()
	locomotion = "crawl" if crawling else ("run" if sprinting and speed > 0.05 else ("walk" if speed > 0.05 else "idle"))
	anim_time += delta * (10.0 if locomotion == "run" else (6.0 if locomotion == "walk" else 3.0))
	var horizontal_velocity := Vector2(player.velocity.x, player.velocity.z)
	var move_speed := 1.8 if crawling else (7.0 if sprinting else 4.0)
	horizontal_velocity = horizontal_velocity.move_toward(direction * move_speed, 18.0 * delta)
	player.velocity.x = horizontal_velocity.x
	player.velocity.z = horizontal_velocity.y
	if not player.is_on_floor():
		player.velocity.y -= 18.0 * delta
	elif Input.is_action_just_pressed("jump") or input_state.confirm_just_pressed:
		player.velocity.y = 6.4
	player.move_and_slide()
	player.position.x = clamp(player.position.x, -5.0, 37.0)
	# 留出角色半径，保持在柜前通道及地面碰撞范围内。
	player.position.z = clampf(player.position.z, -1.9, 1.9)
	if (player.position.z <= -1.9 and player.velocity.z < 0.0) or (player.position.z >= 1.9 and player.velocity.z > 0.0):
		player.velocity.z = 0.0
	frog_visual.rotation.z = lerp(frog_visual.rotation.z, -direction.x * 0.08, delta * 8.0)
	# 角色会朝向实际行进方向，而不是永远面向镜头。
	if direction.length_squared() > 0.01:
		var target_yaw := atan2(direction.x, direction.y)
		frog_visual.rotation.y = lerp_angle(frog_visual.rotation.y, target_yaw, delta * 9.0)
	frog_visual.position.y = sin(Time.get_ticks_msec() * 0.012) * min(horizontal_velocity.length() / 4.0, 1.0) * 0.05
	apply_locomotion_pose()

	# 镜头交给 CameraDirector：滞后跟随 + 统一震屏叠加。
	camera_director.set_follow_bounds(0.0 if story_phase < 2 else 2.0, 31.5)
	camera_director.follow(delta, player.position)

func _on_npc_dialogue_started(_id: String) -> void:
	if archive_interaction:
		archive_interaction.set_active(false)

func _on_arcade_started(_id: String) -> void:
	arcade_active = true
	if archive_interaction:
		archive_interaction.set_active(false)
	if archive_npc:
		archive_npc.set_active(false)

func _on_arcade_closed(_id: String) -> void:
	arcade_active = false
	if archive_interaction:
		archive_interaction.set_active(true)
	if archive_npc:
		archive_npc.set_active(true)

func _on_memory_portal_entered(id: String) -> void:
	destination_id = id
	destination_active = true
	destination_elapsed = 0.0
	in_destination = false
	archive_root.visible = false
	if archive_interaction:
		archive_interaction.set_active(false)
	if archive_npc:
		archive_npc.set_active(false)
	if archive_arcade:
		archive_arcade.set_active(false)
	var tunnel := get_node("TimeTunnel") as Node3D
	tunnel.visible = true
	player.position = Vector3(100, 2.1, 2)
	camera.position = Vector3(100, 3.0, 10.0)
	camera.look_at(Vector3(100, 3.0, -18.0))
	tunnel_overlay.visible = true
	tunnel_overlay.color = Color(0.08, 0.04, 0.15, 0.0)
	loading_bar.visible = false
	tunnel_overlay.get_node("LoadingLabel").text = "记忆通道：" + id
	tunnel_overlay.get_node("LoadingLabel").visible = true
	tunnel_overlay.get_node("LoadingLabel").modulate.a = 1.0

func _update_memory_tunnel(delta: float) -> void:
	if not destination_active:
		return
	destination_elapsed += delta
	var tunnel := get_node("TimeTunnel") as Node3D
	var p := clampf(destination_elapsed / 3.8, 0.0, 1.0)
	var steer := Vector2.ZERO
	if get_viewport():
		steer = (get_viewport().get_mouse_position() / get_viewport().get_visible_rect().size - Vector2(0.5, 0.5)) * 2.0
	player.position = Vector3(100.0 + steer.x * 1.8, 2.1 - steer.y * 1.1 + sin(destination_elapsed * 4.0) * 0.08, 2.0 - p * 38.0)
	camera.position = camera.position.lerp(Vector3(100.0 + steer.x * 0.8, 3.0 - steer.y * 0.4, 10.0 - p * 18.0), delta * 5.0)
	camera.look_at(Vector3(100.0 + steer.x * 0.5, 3.0, -18.0 - p * 20.0))
	tunnel_overlay.color.a = smoothstep(0.0, 0.25, p) * 0.32
	if p >= 1.0:
		destination_active = false
		in_destination = true
		tunnel.visible = false
		tunnel_overlay.visible = false
		tunnel_overlay.get_node("LoadingLabel").visible = false
		destination_root = preload("res://scripts/memory_destination.gd").new()
		destination_root.name = "MemoryDestination_" + destination_id
		destination_root.position = Vector3(200, 0, 0)
		add_child(destination_root)
		destination_root.setup(destination_id)
		player.position = destination_root.position + destination_root.spawn_position
		camera.position = player.position + Vector3(3.5, 3.0, 8.5)
		camera.look_at(player.position + Vector3(0, 1.0, -1.0))
		frog_visual.rotation = Vector3.ZERO

func _update_destination_room(delta: float) -> void:
	if destination_root == null:
		return
	destination_root.tick(delta)
	var direction := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var move := Vector3(direction.x, 0, direction.y)
	player.velocity.x = move.x * 3.2
	player.velocity.z = move.z * 3.2
	player.velocity.y = 0.0
	player.move_and_slide()
	player.position.x = clampf(player.position.x, 194.2, 205.8)
	player.position.z = clampf(player.position.z, -4.25, 4.25)
	var focus := player.global_position + Vector3(0, 1.0, 0)
	camera.global_position = camera.global_position.lerp(focus + Vector3(3.5, 3.0, 8.5), delta * 4.0)
	camera.look_at(focus + Vector3(0, 0, -1.0), Vector3.UP)
	var cue := get_node("Interface/StoryCue") as Label
	var local_pos := player.position - destination_root.position
	if local_pos.distance_to(destination_root.interaction_position) < 2.4:
		cue.text = "E 读取记忆：" + destination_root.title
		if Input.is_action_just_pressed("interact"):
			destination_root.set_completed()
	elif local_pos.distance_to(destination_root.return_position) < 2.4:
		cue.text = "E 返回档案长廊"
		if Input.is_action_just_pressed("interact"):
			_return_from_destination()
	else:
		cue.text = destination_root.title + "  ·  探索记忆空间"

func _return_from_destination() -> void:
	if destination_root:
		destination_root.queue_free()
		destination_root = null
	in_destination = false
	destination_id = ""
	archive_root.visible = true
	archive_npc.set_active(true)
	archive_interaction.set_active(true)
	if archive_arcade:
		archive_arcade.set_active(true)
	player.position = Vector3(23.8, 0.65, 0.0)
	camera.position = Vector3(26.5, 4.5, 12.5)
	camera.look_at(Vector3(26.5, 3, 0))
	get_node("Interface/StoryCue").text = ""

func apply_locomotion_pose() -> void:
	var moving := locomotion != "idle"
	var phase := sin(anim_time)
	if locomotion == "crawl":
		frog_visual.rotation.x = lerp(frog_visual.rotation.x, -0.52, 0.16)
		frog_visual.scale = frog_visual.scale.lerp(Vector3(1.08, 0.62, 1.08), 0.16)
	else:
		frog_visual.rotation.x = lerp(frog_visual.rotation.x, 0.0, 0.16)
		frog_visual.scale = frog_visual.scale.lerp(Vector3.ONE, 0.16)
	frog_visual.position.y += (abs(phase) * 0.045 if moving else sin(anim_time) * 0.008)
	if skeleton == null: return
	var names := {"L_thigh": "L_thigh", "R_thigh": "R_thigh", "L_arm": "L_arm", "R_arm": "R_arm", "spine": "spine"}
	var stride := 0.0 if locomotion == "idle" else (0.28 if locomotion == "walk" else (0.55 if locomotion == "run" else 0.18))
	if locomotion == "crawl":
		skeleton.set_bone_pose_rotation(skeleton.find_bone("spine"), Quaternion(Vector3.RIGHT, -0.48))
	else:
		skeleton.set_bone_pose_rotation(skeleton.find_bone("spine"), Quaternion.IDENTITY)
	for pair in [["L_thigh", 1.0], ["R_thigh", -1.0], ["L_arm", -0.8], ["R_arm", 0.8]]:
		var index := skeleton.find_bone(pair[0])
		if index >= 0:
			var amount: float = float(pair[1]) * stride * phase
			skeleton.set_bone_pose_rotation(index, Quaternion(Vector3.RIGHT, amount))
