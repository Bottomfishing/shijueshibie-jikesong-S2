extends Node

## 拥有 CinematicSideCamera。剧情用 apply_cinematic 做编排镜头，
## 游玩用 follow 做滞后跟随，两者都经过同一层震屏与 roll 叠加。
## _base 始终是权威位姿，不从 camera.position 回读，避免震屏自我累积。

const FOLLOW_RESPONSE := 1.8
const FOLLOW_AHEAD := 4.0
const FOLLOW_HEIGHT := 3.0
const DEFAULT_FOV := 44.0
const SHAKE_DECAY := 6.0

@export var camera_path: NodePath = ^"../CinematicSideCamera"

var camera: Camera3D
var mode := ""
var _base_position := Vector3.ZERO
var _base_look := Vector3.ZERO
var _base_roll := 0.0
var _shake := 0.0
var _shake_seed := 0.0
var _follow_min_x := 0.0
var _follow_max_x := 31.5

func _ready() -> void:
	camera = get_node_or_null(camera_path) as Camera3D
	if camera == null:
		push_error("CameraDirector 未找到 Camera3D: %s" % camera_path)
		return
	_base_position = camera.position
	_base_look = Vector3(camera.position.x, FOLLOW_HEIGHT, 0.0)

func set_follow_bounds(min_x: float, max_x: float) -> void:
	_follow_min_x = min_x
	_follow_max_x = max_x

## 剧情编排：给目标位姿，CameraDirector 叠加震屏与 roll。
func apply_cinematic(position: Vector3, look_target: Vector3, fov: float = DEFAULT_FOV, roll: float = 0.0) -> void:
	if camera == null:
		return
	mode = "cinematic"
	_base_position = position
	_base_look = look_target
	_base_roll = roll
	camera.fov = fov
	_commit()

## 游玩跟随：镜头滞后于角色，只推进 x，保持侧视构图。
func follow(delta: float, focus: Vector3) -> void:
	if camera == null:
		return
	if mode != "follow":
		mode = "follow"
		_base_position = camera.position
		_base_roll = 0.0
	var target_x := clampf(focus.x + FOLLOW_AHEAD, _follow_min_x, _follow_max_x)
	_base_position.x = lerpf(_base_position.x, target_x, delta * FOLLOW_RESPONSE)
	_base_look = Vector3(_base_position.x, FOLLOW_HEIGHT, 0.0)
	_commit()

func add_shake(strength: float) -> void:
	_shake = maxf(_shake, strength)

func snap_to(position: Vector3, look_target: Vector3, fov: float = DEFAULT_FOV) -> void:
	if camera == null:
		return
	_shake = 0.0
	mode = "cinematic"
	apply_cinematic(position, look_target, fov)

func process_shake(delta: float) -> void:
	if _shake <= 0.0:
		return
	_shake_seed += delta * 37.0
	_shake = maxf(_shake - delta * SHAKE_DECAY * maxf(_shake, 0.25), 0.0)

func reset() -> void:
	_shake = 0.0
	_shake_seed = 0.0
	_base_roll = 0.0
	mode = ""

func _commit() -> void:
	var position := _base_position
	if _shake > 0.0:
		position += Vector3(
			sin(_shake_seed * 1.7) * _shake,
			cos(_shake_seed * 2.3) * _shake,
			0.0
		) * 0.35
	camera.position = position
	if position.is_equal_approx(_base_look):
		return
	camera.look_at(_base_look, Vector3.UP)
	var roll := _base_roll
	if _shake > 0.0:
		roll += sin(_shake_seed * 3.1) * _shake * 0.04
	if not is_zero_approx(roll):
		camera.rotate_object_local(Vector3.FORWARD, roll)
