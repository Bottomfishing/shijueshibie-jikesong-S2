extends Node3D

## 奶蛙的游玩阶段动作控制器。
## CharacterBody3D 只负责真实碰撞；CharacterVisual 负责所有 squash/stretch、
## 骨骼摆动和落地反馈，避免动画把物理胶囊一起缩放后产生穿透。

const GRAVITY := 18.0
const WALK_SPEED := 4.0
const RUN_SPEED := 7.0
const CRAWL_SPEED := 1.8
const GROUND_ACCEL := 22.0
const AIR_ACCEL := 10.0
const JUMP_SPEED := 6.4
const COYOTE_TIME := 0.14
const JUMP_BUFFER_TIME := 0.16
const LANDING_FEEL_TIME := 0.24
const VISUAL_RESPONSE := 16.0
const IDLE_BOB_SPEED := 2.4
const WALK_CYCLE_SPEED := 8.0
const RUN_CYCLE_SPEED := 12.0
const CRAWL_CYCLE_SPEED := 5.5

const LANDING_SFX := preload("res://assets/audio/landing.wav")
const JUMP_SFX := preload("res://assets/audio/hop_away.wav")

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
var motion_state := "idle"
var anim_time := 0.0
var _coyote_timer := 0.0
var _jump_buffer_timer := 0.0
var _landing_timer := 0.0
var _sfx: AudioStreamPlayer

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
	var skeletons := frog_visual.find_children("*", "Skeleton3D", true, false)
	if not skeletons.is_empty():
		skeleton = skeletons[0] as Skeleton3D
	else:
		push_warning("奶蛙模型未找到 Skeleton3D，仅启用软体缩放动作")
	_sfx = AudioStreamPlayer.new()
	_sfx.name = "LocomotionSfx"
	_sfx.volume_db = -7.0
	add_child(_sfx)

func _physics_process(delta: float) -> void:
	# InputState 先于剧情推进，保证两侧读到同一帧输入。
	input_state.poll(delta)
	camera_director.process_shake(delta)
	if opening.update(delta):
		return
	phase_time += delta
	var direction: Vector2 = input_state.axis
	var sprinting := Input.is_key_pressed(KEY_SHIFT)
	var crawling := Input.is_key_pressed(KEY_CTRL) and not sprinting
	var was_on_floor := player.is_on_floor()

	# 土狼时间 + 跳跃缓冲让键盘和视觉识别都不会因为一帧误差而感觉“没跳起来”。
	if was_on_floor:
		_coyote_timer = COYOTE_TIME
	else:
		_coyote_timer = maxf(_coyote_timer - delta, 0.0)
	if Input.is_action_just_pressed("jump") or input_state.confirm_just_pressed:
		_jump_buffer_timer = JUMP_BUFFER_TIME
	else:
		_jump_buffer_timer = maxf(_jump_buffer_timer - delta, 0.0)

	var move_speed := CRAWL_SPEED if crawling else (RUN_SPEED if sprinting else WALK_SPEED)
	var target_horizontal := direction * move_speed
	var horizontal_velocity := Vector2(player.velocity.x, player.velocity.z)
	var accel := GROUND_ACCEL if was_on_floor else AIR_ACCEL
	horizontal_velocity = horizontal_velocity.move_toward(target_horizontal, accel * delta)
	player.velocity.x = horizontal_velocity.x
	player.velocity.z = horizontal_velocity.y

	if _jump_buffer_timer > 0.0 and _coyote_timer > 0.0:
		player.velocity.y = JUMP_SPEED
		_jump_buffer_timer = 0.0
		_coyote_timer = 0.0
		motion_state = "jump"
		if _sfx != null:
			_sfx.stream = JUMP_SFX
			_sfx.pitch_scale = randf_range(0.96, 1.06)
			_sfx.play()
	else:
		if not was_on_floor:
			player.velocity.y -= GRAVITY * delta
	var landing_speed := maxf(-player.velocity.y, 0.0)
	player.move_and_slide()
	player.position.x = clamp(player.position.x, -5.0, 37.0)
	# 留出角色半径，保持在柜前通道及地面碰撞范围内。
	player.position.z = clampf(player.position.z, -1.9, 1.9)
	if (player.position.z <= -1.9 and player.velocity.z < 0.0) or (player.position.z >= 1.9 and player.velocity.z > 0.0):
		player.velocity.z = 0.0

	var on_floor := player.is_on_floor()
	if not was_on_floor and on_floor:
		_landing_timer = LANDING_FEEL_TIME
		camera_director.add_shake(clampf(landing_speed * 0.035, 0.12, 0.28))
		if _sfx != null:
			_sfx.stream = LANDING_SFX
			_sfx.pitch_scale = randf_range(0.92, 1.04)
			_sfx.play()
	if _landing_timer > 0.0:
		_landing_timer = maxf(_landing_timer - delta, 0.0)

	var horizontal_speed := Vector2(player.velocity.x, player.velocity.z).length()
	if _landing_timer > 0.0:
		motion_state = "land"
	elif not on_floor:
		motion_state = "jump" if player.velocity.y > 0.05 else "fall"
	elif crawling and horizontal_speed > 0.08:
		motion_state = "crawl"
	elif horizontal_speed > 0.08:
		motion_state = "run" if sprinting else "walk"
	else:
		motion_state = "idle"
	locomotion = motion_state

	var cycle_speed := CRAWL_CYCLE_SPEED if motion_state == "crawl" else (RUN_CYCLE_SPEED if motion_state == "run" else WALK_CYCLE_SPEED)
	anim_time += delta * (cycle_speed if horizontal_speed > 0.08 else IDLE_BOB_SPEED)

	# 角色会朝向实际行进方向，而不是永远面向镜头。
	if direction.length_squared() > 0.01:
		var target_yaw := atan2(direction.x, direction.y)
		frog_visual.rotation.y = lerp_angle(frog_visual.rotation.y, target_yaw, delta * 9.0)
	apply_locomotion_pose(delta, horizontal_velocity)

	# 镜头交给 CameraDirector：滞后跟随 + 统一震屏叠加。
	camera_director.set_follow_bounds(0.0 if story_phase < 2 else 2.0, 31.5)
	camera_director.follow(delta, player.position)

func apply_locomotion_pose(delta: float, horizontal_velocity: Vector2) -> void:
	## 所有视觉动作都回到明确的目标值，绝不使用 position.y +=，避免逐帧漂移。
	var phase := sin(anim_time)
	var speed_ratio := clampf(horizontal_velocity.length() / RUN_SPEED, 0.0, 1.0)
	var target_scale := Vector3.ONE
	var target_rot_x := 0.0
	var target_rot_z := clampf(-horizontal_velocity.x * 0.035, -0.16, 0.16)
	var target_y := 0.0

	match motion_state:
		"idle":
			target_scale = Vector3(1.0 + sin(anim_time * 0.5) * 0.008, 0.985 + sin(anim_time) * 0.018, 1.0 + sin(anim_time * 0.5) * 0.008)
			target_y = sin(anim_time) * 0.012
		"walk":
			target_scale = Vector3(1.015, 0.97 + abs(phase) * 0.035, 1.015)
			target_y = abs(phase) * 0.055
			target_rot_x = -horizontal_velocity.y * 0.018
		"run":
			target_scale = Vector3(1.04, 0.93 + abs(phase) * 0.095, 1.04)
			target_y = abs(phase) * 0.105
			target_rot_x = -horizontal_velocity.y * 0.028
		"crawl":
			target_scale = Vector3(1.08, 0.62, 1.08)
			target_rot_x = -0.52
			target_y = abs(phase) * 0.025
		"jump":
			var launch := clampf(player.velocity.y / JUMP_SPEED, 0.0, 1.0)
			target_scale = Vector3(1.08 - launch * 0.08, 0.78 + launch * 0.18, 1.08 - launch * 0.08)
			target_rot_x = -0.12
			target_y = 0.035
		"fall":
			target_scale = Vector3(0.92, 1.1, 0.92)
			target_rot_x = 0.14
			target_y = 0.02
		"land":
			var impact := clampf(_landing_timer / LANDING_FEEL_TIME, 0.0, 1.0)
			target_scale = Vector3(1.0 + impact * 0.17, 1.0 - impact * 0.28, 1.0 + impact * 0.17)
			target_rot_x = -0.04 * impact
			target_y = 0.0

	var response := 1.0 - exp(-delta * VISUAL_RESPONSE)
	frog_visual.scale = frog_visual.scale.lerp(target_scale, response)
	frog_visual.rotation.x = lerpf(frog_visual.rotation.x, target_rot_x, response)
	frog_visual.rotation.z = lerpf(frog_visual.rotation.z, target_rot_z, response)
	frog_visual.position.y = lerpf(frog_visual.position.y, target_y, response)
	_apply_bone_pose(phase, speed_ratio)

func _apply_bone_pose(phase: float, speed_ratio: float) -> void:
	if skeleton == null:
		return
	var thigh := 0.0
	var arm := 0.0
	var shin := 0.0
	var spine := 0.0
	match motion_state:
		"idle":
			thigh = 0.035 * phase
			arm = -0.025 * phase
			spine = 0.018 * sin(anim_time * 0.5)
		"walk":
			var gait := maxf(speed_ratio, 0.3)
			thigh = 0.34 * phase * gait
			arm = 0.24 * phase * gait
			shin = 0.16 * maxf(-phase, 0.0) * gait
		"run":
			thigh = 0.62 * phase
			arm = 0.46 * phase
			shin = 0.34 * maxf(-phase, 0.0)
		"crawl":
			thigh = 0.18 * phase
			arm = 0.26 * phase
			shin = 0.22 * maxf(-phase, 0.0)
			spine = -0.48
		"jump":
			thigh = 0.2
			arm = -0.42
			spine = -0.08
		"fall":
			thigh = -0.16
			arm = 0.56
			spine = 0.12
		"land":
			var impact := clampf(_landing_timer / LANDING_FEEL_TIME, 0.0, 1.0)
			thigh = -0.12 * impact
			arm = -0.2 * impact
			spine = -0.16 * impact
	_set_bone("L_thigh", thigh)
	_set_bone("R_thigh", -thigh)
	_set_bone("L_arm", -arm)
	_set_bone("R_arm", arm)
	_set_bone("L_shin", shin)
	_set_bone("R_shin", shin)
	_set_bone("L_foot", -shin * 0.45)
	_set_bone("R_foot", -shin * 0.45)
	_set_bone("spine", spine)

func _set_bone(name: String, angle: float) -> void:
	var index := skeleton.find_bone(name)
	if index >= 0:
		skeleton.set_bone_pose_rotation(index, Quaternion(Vector3.RIGHT, angle))
