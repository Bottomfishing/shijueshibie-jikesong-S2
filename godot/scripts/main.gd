extends Node3D

@onready var player: CharacterBody3D = $MilkFrog
@onready var camera: Camera3D = $CinematicSideCamera
@onready var frog_visual: Node3D = $MilkFrog/CharacterVisual
@onready var tunnel_overlay: ColorRect = $Interface/TransitionOverlay
@onready var loading_bar: ColorRect = $Interface/TransitionOverlay/LoadingBar
@onready var archive_root: Node3D = $ArchiveArchitecture
@onready var opening: Node = $StoryDirector
var target_camera_x := 2.0
var story_phase := 0
var phase_time := 0.0
var skeleton: Skeleton3D
var locomotion := "idle"
var anim_time := 0.0

func _ready() -> void:
	archive_root.visible = false
	var login := preload("res://scripts/login_ui.gd").new()
	add_child(login)
	login.accepted.connect(func(): opening.enter("sleep"))
	opening.phase = "login"
	opening.setup(self)
	skeleton = frog_visual.find_child("MilkFrog_Skeleton", true, false) as Skeleton3D
	if skeleton == null:
		skeleton = frog_visual.find_child("Armature", true, false) as Skeleton3D

func _physics_process(delta: float) -> void:
	if opening.update(delta):
		return
	phase_time += delta
	var direction := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
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
	elif Input.is_action_just_pressed("jump"):
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

	# 镜头缓慢追随并略微滞后，避免机械贴身。
	target_camera_x = clamp(player.position.x + 4.0, 0.0 if story_phase < 2 else 2.0, 31.5)
	camera.position.x = lerp(camera.position.x, target_camera_x, delta * 1.8)
	camera.look_at(Vector3(camera.position.x, 3.0, 0), Vector3.UP)

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
