extends Node
## 三台霓虹街机：贪吃蛇 / 俄罗斯方块 / 打砖块，填充柜位之间的空白走廊段。
## 靠近按 E 进入全屏 2D 小游戏，ESC 退出；游玩期间 main.gd 冻结角色移动。
signal game_started(id: String)
signal game_closed(id: String)

const MACHINES := [
	{"id": "snake", "x": 5.2, "title": "贪吃蛇", "accent": "5cff6e", "script": "res://scripts/arcade_snake.gd"},
	{"id": "tetris", "x": 17.6, "title": "俄罗斯方块", "accent": "b26bff", "script": "res://scripts/arcade_tetris.gd"},
	{"id": "breakout", "x": 30.0, "title": "打砖块", "accent": "ffa040", "script": "res://scripts/arcade_breakout.gd"}
]
const NEAR_DISTANCE := 2.4

var world: Node3D
var player: CharacterBody3D
var active := false
var playing_id := ""
var machines_root: Node3D
var screens: Dictionary = {}
var prompt: Label
var overlay: CanvasLayer
var game_holder: Control
var current_game: Control

func setup(owner: Node3D) -> void:
	world = owner
	player = owner.player
	machines_root = Node3D.new()
	machines_root.name = "ArcadeMachines"
	owner.archive_root.add_child(machines_root)
	for spec in MACHINES:
		_build_machine(spec)
	var layer := owner.get_node_or_null("Interface") as CanvasLayer
	prompt = Label.new()
	prompt.position = Vector2(38, 500)
	prompt.add_theme_font_size_override("font_size", 18)
	layer.add_child(prompt)
	overlay = CanvasLayer.new()
	overlay.name = "ArcadeOverlay"
	overlay.layer = 20
	overlay.visible = false
	owner.add_child(overlay)
	var dim := ColorRect.new()
	dim.color = Color(0.01, 0.005, 0.03, 0.94)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(dim)
	game_holder = Control.new()
	game_holder.set_anchors_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(game_holder)
	set_active(false)

func _build_machine(spec: Dictionary) -> void:
	var accent := Color(String(spec.accent))
	var cab := Node3D.new()
	cab.name = "Arcade_%s" % String(spec.id)
	cab.position = Vector3(spec.x, 0.0, -2.05)
	machines_root.add_child(cab)
	# 机身：底座 + 倾斜控制台 + 竖直屏幕舱，全部深紫黑金属。
	var body_color := Color("171034")
	_box(cab, "Base", Vector3(0, 0.5, 0), Vector3(1.15, 1.0, 0.8), body_color, 0.0)
	_box(cab, "Tower", Vector3(0, 1.65, -0.12), Vector3(1.15, 1.3, 0.56), body_color, 0.0)
	_box(cab, "ControlDeck", Vector3(0, 1.06, 0.28), Vector3(1.05, 0.1, 0.42), Color("241a4d"), 0.0)
	# 摇杆和两颗按钮。
	_box(cab, "Stick", Vector3(-0.24, 1.2, 0.3), Vector3(0.05, 0.18, 0.05), Color("d1dcf5"), 0.0)
	_box(cab, "ButtonA", Vector3(0.14, 1.13, 0.3), Vector3(0.11, 0.05, 0.11), accent, 1.8)
	_box(cab, "ButtonB", Vector3(0.32, 1.13, 0.3), Vector3(0.11, 0.05, 0.11), Color("ff4fd8"), 1.8)
	# 屏幕：待机时的发光面，_process 里做霓虹波纹。
	var screen := _box(cab, "Screen", Vector3(0, 1.78, 0.17), Vector3(0.92, 0.86, 0.03), accent.darkened(0.72), 0.9)
	screens[String(spec.id)] = screen
	# 顶部霓虹招牌。
	_box(cab, "MarqueeFrame", Vector3(0, 2.44, -0.1), Vector3(1.25, 0.36, 0.5), Color("0b0618"), 0.0)
	var sign := Label3D.new()
	sign.text = String(spec.title)
	sign.position = Vector3(0, 2.44, 0.16)
	sign.font_size = 34
	sign.pixel_size = 0.005
	sign.modulate = accent
	cab.add_child(sign)
	var sign_light := OmniLight3D.new()
	sign_light.name = "MarqueeGlow"
	sign_light.position = Vector3(0, 2.4, 0.6)
	sign_light.light_color = accent
	sign_light.light_energy = 0.8
	sign_light.omni_range = 2.6
	cab.add_child(sign_light)

func _box(parent: Node3D, title: String, at: Vector3, size: Vector3, color: Color, emission: float) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	node.name = title
	node.position = at
	var mesh := BoxMesh.new()
	mesh.size = size
	node.mesh = mesh
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.55
	mat.metallic = 0.3
	if emission > 0.0:
		mat.emission_enabled = true
		mat.emission = Color(color.r, color.g, color.b)
		mat.emission_energy_multiplier = emission
	node.material_override = mat
	parent.add_child(node)
	return node

func set_active(value: bool) -> void:
	active = value
	set_process(value)
	if prompt:
		prompt.visible = value
		prompt.text = ""
	if not value and playing_id != "":
		_close_game()

func _process(_delta: float) -> void:
	if not active or player == null:
		return
	# 待机屏幕的霓虹波纹。
	var t := Time.get_ticks_msec() * 0.001
	for i in range(MACHINES.size()):
		var id := String(MACHINES[i].id)
		var mat := (screens[id] as MeshInstance3D).material_override as StandardMaterial3D
		mat.emission_energy_multiplier = 0.7 + sin(t * 2.2 + i * 2.1) * 0.35
	if playing_id != "":
		prompt.text = ""
		return
	var nearest := _nearest_machine()
	prompt.text = "E 开始游戏：" + String(nearest.title) if not nearest.is_empty() else ""

func _nearest_machine() -> Dictionary:
	var best: Dictionary = {}
	var best_distance := NEAR_DISTANCE
	for spec in MACHINES:
		var distance: float = player.position.distance_to(Vector3(spec.x, player.position.y, -2.05))
		if distance < best_distance:
			best_distance = distance
			best = spec
	return best

func _unhandled_input(event: InputEvent) -> void:
	if not active or player == null:
		return
	if event is InputEventKey and event.pressed and not event.echo:
		if playing_id != "":
			if event.keycode == KEY_ESCAPE:
				get_viewport().set_input_as_handled()
				_close_game()
			return
		if event.is_action_pressed("interact"):
			var nearest := _nearest_machine()
			if not nearest.is_empty():
				get_viewport().set_input_as_handled()
				_open_game(nearest)

func _open_game(spec: Dictionary) -> void:
	playing_id = String(spec.id)
	current_game = (load(String(spec.script)) as GDScript).new()
	current_game.set_anchors_preset(Control.PRESET_FULL_RECT)
	game_holder.add_child(current_game)
	current_game.reset()
	overlay.visible = true
	prompt.text = ""
	game_started.emit(playing_id)

func _close_game() -> void:
	var id := playing_id
	playing_id = ""
	overlay.visible = false
	if current_game:
		current_game.queue_free()
		current_game = null
	game_closed.emit(id)
