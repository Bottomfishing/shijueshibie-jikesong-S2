extends Node
## Godot 视觉识别输入层。
##
## 识别器通过 UDP 接收标准化手部状态，协议示例：
## {"x":0.5,"y":0.5,"grab":0.0,"spread":0.8,"confidence":0.95}
## 外部 MediaPipe/OpenCV 进程只需要发送 JSON 到 127.0.0.1:6401。
## 未连接时自动进入鼠标/键盘模拟模式，保证流程可测试。

signal observation_changed(observation: Dictionary)

const LISTEN_PORT := 6401
const LOST_TIMEOUT := 0.35
const BRIDGE_SCRIPT := "res://../scripts/mediapipe_camera_bridge.py"

var socket := PacketPeerUDP.new()
var observation: Dictionary = {
	"active": false, "x": 0.5, "y": 0.5, "grab": 0.0,
	"spread": 0.5, "confidence": 0.0, "source": "fallback"
}
var last_packet_at := -100.0
var enabled := true
var bridge_pid := -1

func _ready() -> void:
	# 自动化检查/CI 不应绑定桌面视觉端口，也不应启动摄像头进程。
	if OS.has_feature("headless"):
		set_process(false)
		return
	var err := socket.bind(LISTEN_PORT, "127.0.0.1")
	if err != OK:
		push_warning("视觉识别 UDP 端口 %d 不可用，使用鼠标模拟模式；不会重复启动桥接进程" % LISTEN_PORT)
		return
	_start_bridge()

func _start_bridge() -> void:
	var script_path := ProjectSettings.globalize_path(BRIDGE_SCRIPT)
	var venv_python := ProjectSettings.globalize_path("res://../.vision-venv/Scripts/python.exe")
	if not FileAccess.file_exists(script_path) or not FileAccess.file_exists(venv_python):
		push_warning("未找到 MediaPipe 环境，使用鼠标模式。可运行启动脚本创建环境。")
		return
	bridge_pid = OS.create_process(venv_python, [script_path], false)
	if bridge_pid <= 0:
		push_warning("MediaPipe 桥接启动失败，使用鼠标模式")

func _exit_tree() -> void:
	if bridge_pid > 0 and OS.is_process_running(bridge_pid):
		# Windows 的 py/python 启动链可能包含子进程，递归结束避免摄像头被占用。
		if OS.get_name() == "Windows":
			OS.execute("taskkill", ["/PID", str(bridge_pid), "/T", "/F"], [])
		else:
			OS.kill(bridge_pid)
	bridge_pid = -1
	socket.close()

func _process(_delta: float) -> void:
	var got_packet := false
	while socket.get_available_packet_count() > 0:
		var text := socket.get_packet().get_string_from_utf8()
		var parsed = JSON.parse_string(text)
		if parsed is Dictionary and _accept_packet(parsed):
			got_packet = true
			last_packet_at = Time.get_ticks_msec() / 1000.0
	if got_packet:
		observation["source"] = "vision"
	elif Time.get_ticks_msec() / 1000.0 - last_packet_at > LOST_TIMEOUT:
		_update_fallback()
	observation_changed.emit(observation)

func _accept_packet(data: Dictionary) -> bool:
	var confidence := clampf(float(data.get("confidence", 1.0)), 0.0, 1.0)
	if confidence < 0.2:
		return false
	observation["active"] = bool(data.get("active", true))
	observation["x"] = clampf(float(data.get("x", 0.5)), 0.0, 1.0)
	observation["y"] = clampf(float(data.get("y", 0.5)), 0.0, 1.0)
	observation["grab"] = clampf(float(data.get("grab", 0.0)), 0.0, 1.0)
	observation["spread"] = clampf(float(data.get("spread", 0.5)), 0.0, 1.0)
	observation["confidence"] = confidence
	return true

func _update_fallback() -> void:
	var viewport := get_viewport()
	var size := viewport.get_visible_rect().size
	var mouse := viewport.get_mouse_position()
	observation["active"] = enabled and size.x > 0.0
	observation["x"] = clampf(mouse.x / size.x, 0.0, 1.0)
	observation["y"] = clampf(mouse.y / size.y, 0.0, 1.0)
	observation["grab"] = 1.0 if Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT) else 0.0
	observation["spread"] = 0.5
	observation["confidence"] = 0.0
	observation["source"] = "fallback"

func get_observation() -> Dictionary:
	return observation.duplicate()

## 每帧读取用这个，避免 duplicate() 的分配。调用方不要写入返回值。
func peek_observation() -> Dictionary:
	return observation

func set_enabled(value: bool) -> void:
	enabled = value
