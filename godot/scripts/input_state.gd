extends Node

signal confirm_triggered
signal source_changed(new_source: String)

const GRAB_ON := 0.62
const GRAB_OFF := 0.32
const CONFIRM_COOLDOWN := 0.32
const AXIS_DEADZONE := 0.08
const KEYBOARD_OVERRIDE := 0.05
const POINTER_RESPONSE := 14.0
const RESYNC_RESPONSE := 3.5
const RESYNC_DURATION := 0.45

@export var visual_recognition_path: NodePath = ^"../VisualRecognition"

var active := false
var source := "fallback"
var axis := Vector2.ZERO
var steer := Vector2.ZERO
var pointer := Vector2(0.5, 0.5)
var grab := 0.0
var spread := 0.5
var confidence := 0.0
var vision_online := false
var face_detected := false
var smile := 0.0
var laugh_detected := false
var confirm_pressed := false
var confirm_just_pressed := false
var confirm_just_released := false

var _vision: Node
var _latched := false
var _cooldown := 0.0
var _resync := 0.0
var _seeded := false

func _ready() -> void:
	_vision = get_node_or_null(visual_recognition_path)
	if _vision == null:
		push_warning("InputState 未找到 VisualRecognition，仅使用键鼠输入")

func poll(delta: float) -> void:
	var observation := _read_observation()
	var next_source := String(observation.get("source", "fallback"))
	if next_source != source:
		source = next_source
		_resync = RESYNC_DURATION
		source_changed.emit(source)

	active = bool(observation.get("active", false))
	grab = clampf(float(observation.get("grab", 0.0)), 0.0, 1.0)
	spread = clampf(float(observation.get("spread", 0.5)), 0.0, 1.0)
	confidence = clampf(float(observation.get("confidence", 0.0)), 0.0, 1.0)
	vision_online = bool(observation.get("bridge_online", false))
	face_detected = bool(observation.get("face_detected", false))
	smile = clampf(float(observation.get("smile", 0.0)), 0.0, 1.0)
	laugh_detected = bool(observation.get("laugh", false))

	var raw_pointer := Vector2(
		clampf(float(observation.get("x", 0.5)), 0.0, 1.0),
		clampf(float(observation.get("y", 0.5)), 0.0, 1.0)
	)
	if not _seeded:
		pointer = raw_pointer
		_seeded = true
	else:
		if _resync > 0.0:
			_resync = maxf(_resync - delta, 0.0)
		var response := RESYNC_RESPONSE if _resync > 0.0 else POINTER_RESPONSE
		pointer = pointer.lerp(raw_pointer, 1.0 - exp(-delta * response))

	steer = (pointer - Vector2(0.5, 0.5)) * 2.0
	axis = _resolve_axis()
	_resolve_confirm(delta)

func consume_confirm() -> bool:
	if confirm_just_pressed:
		confirm_just_pressed = false
		return true
	return false

func is_vision_driven() -> bool:
	return source == "vision" and active

func reset() -> void:
	_latched = false
	_cooldown = 0.0
	_resync = 0.0
	_seeded = false
	axis = Vector2.ZERO
	steer = Vector2.ZERO
	pointer = Vector2(0.5, 0.5)
	vision_online = false
	face_detected = false
	smile = 0.0
	laugh_detected = false
	confirm_pressed = false
	confirm_just_pressed = false
	confirm_just_released = false

func _read_observation() -> Dictionary:
	if _vision != null and _vision.has_method("peek_observation"):
		return _vision.peek_observation()
	if _vision != null and _vision.has_method("get_observation"):
		return _vision.get_observation()
	return {
		"active": true, "source": "fallback", "x": 0.5, "y": 0.5,
		"grab": 1.0 if Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT) else 0.0,
		"spread": 0.5, "confidence": 0.0
	}

func _resolve_axis() -> Vector2:
	var keyboard := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	if keyboard.length() > KEYBOARD_OVERRIDE:
		return keyboard.limit_length(1.0)
	if source == "vision" and active:
		if steer.length() > AXIS_DEADZONE:
			return steer.limit_length(1.0)
	return Vector2.ZERO

func _resolve_confirm(delta: float) -> void:
	_cooldown = maxf(_cooldown - delta, 0.0)
	confirm_just_pressed = false
	confirm_just_released = false
	var was_latched := _latched
	if _latched:
		if grab < GRAB_OFF:
			_latched = false
	elif grab > GRAB_ON:
		_latched = true
	confirm_pressed = _latched
	if _latched and not was_latched:
		if _cooldown <= 0.0:
			_cooldown = CONFIRM_COOLDOWN
			confirm_just_pressed = true
			confirm_triggered.emit()
	elif was_latched and not _latched:
		confirm_just_released = true
