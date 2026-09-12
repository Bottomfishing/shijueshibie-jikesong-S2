extends Node3D
## Optional themed memory rooms. The parent places this node at (200, 0, 0).

var memory_id := ""
var title := ""
var interaction_position := Vector3.ZERO
var spawn_position := Vector3(0, 0.65, 3.0)
var return_position := Vector3(4.5, 1.2, 3.0)
var _animated: Array[Node3D] = []
var _elapsed := 0.0
var _enabled := true

func setup(id: String) -> void:
	memory_id = id
	position = Vector3(200, 0, 0)
	interaction_position = Vector3(0, 1.0, -2.0)
	return_position = Vector3(4.5, 1.2, 3.0)
	_build_shell()
	match id:
		"seen_2016":
			title = "2016 / 霓虹夜市回声"
			_build_2016()
		"imitated_2020":
			title = "2020 / 深夜街镇信号"
			_build_2020()
		"covered_2024":
			title = "2024 / 数据公园遗迹"
			_build_2024()
		_:
			title = "未命名记忆"
			_build_2026()

func _process(delta: float) -> void:
	tick(delta)

func tick(delta: float) -> void:
	if not _enabled:
		return
	_elapsed += delta
	for i in range(_animated.size()):
		var item := _animated[i]
		if is_instance_valid(item):
			item.rotation.y = sin(_elapsed * 0.8 + i * 0.7) * 0.08
	if _billboard != null:
		_billboard_timer += delta
		if _billboard_timer >= 2.6:
			_billboard_timer = 0.0
			_billboard_index = (_billboard_index + 1) % BILLBOARD_LINES.size()
			_billboard.text = BILLBOARD_LINES[_billboard_index]

func set_completed() -> void:
	for item in _animated:
		if is_instance_valid(item):
			item.scale = Vector3.ONE * 1.12

func set_enabled(value: bool) -> void:
	_enabled = value
	visible = value
	set_process(value)
	_set_collision_state(self, value)

func _set_collision_state(node: Node, value: bool) -> void:
	if node is CollisionShape3D:
		node.disabled = not value
	if node is StaticBody3D or node is Area3D:
		node.set_process(value)
	for child in node.get_children():
		_set_collision_state(child, value)

func _build_shell() -> void:
	var floor_mat := _mat(Color("202b35"), 0.0)
	_box("Floor", Vector3(0, -0.1, 0), Vector3(12, 0.2, 9), floor_mat, true)
	_box("BackWall", Vector3(0, 3.8, -4.5), Vector3(12, 7.6, 0.2), _mat(Color("111b22"), 0.0), true)
	_box("LeftWall", Vector3(-6, 3.8, 0), Vector3(0.2, 7.6, 9), _mat(Color("16232b"), 0.0), true)
	_box("RightWall", Vector3(6, 3.8, 0), Vector3(0.2, 7.6, 9), _mat(Color("16232b"), 0.0), true)
	_box("Ceiling", Vector3(0, 7.6, 0), Vector3(12, 0.15, 9), _mat(Color("0c1318"), 0.0), false)
	_box("Console", interaction_position, Vector3(1.8, 1.0, 0.65), _mat(Color("374a50"), 0.2), true)
	_label(title, Vector3(0, 6.7, -4.3), Color("b8d5d3"))
	var portal := OmniLight3D.new()
	portal.name = "ReturnPortalLight"
	portal.position = return_position
	portal.light_color = Color("e6b37c")
	portal.light_energy = 2.2
	portal.omni_range = 5.0
	add_child(portal)

## 集市：霓虹夜市，摊位 + 灯串 + 货箱。
func _build_2016() -> void:
	var stall_specs := [
		[Vector3(-4.2, 0, -2.6), Color("ff4fd8"), "炸串 · 像素味"],
		[Vector3(-0.6, 0, -3.0), Color("3ee6ff"), "旧梗打捞铺"],
		[Vector3(3.2, 0, -2.4), Color("ffe066"), "回忆糖水"],
		[Vector3(-2.4, 0, 0.9), Color("5cff6e"), "换脸面具屋"]
	]
	for spec in stall_specs:
		var at: Vector3 = spec[0]
		var accent: Color = spec[1]
		_box("StallCounter", at + Vector3(0, 0.5, 0), Vector3(2.2, 1.0, 1.0), _mat(Color("1d1440"), 0.0), true)
		for side in [-1.0, 1.0]:
			_box("StallPole", at + Vector3(side * 1.0, 1.6, -0.4), Vector3(0.1, 2.2, 0.1), _mat(Color("110b28"), 0.0), false)
		var awning := _box("StallAwning", at + Vector3(0, 2.75, -0.4), Vector3(2.5, 0.14, 1.3), _mat(accent.darkened(0.4), 0.9), false)
		_animated.append(awning)
		var sign := _box("StallSign", at + Vector3(0, 2.2, 0.12), Vector3(1.9, 0.5, 0.06), _mat(accent, 1.6), false)
		_animated.append(sign)
		_label(String(spec[2]), at + Vector3(0, 2.2, 0.2), accent.lightened(0.35))
		var lamp := OmniLight3D.new()
		lamp.name = "StallLamp"
		lamp.position = at + Vector3(0, 2.0, 0.7)
		lamp.light_color = accent
		lamp.light_energy = 1.3
		lamp.omni_range = 3.6
		add_child(lamp)
	# 头顶灯串：一排彩色小灯笼横跨市场。
	for row in range(2):
		for i in range(7):
			var x := -5.0 + i * 1.7
			var hue: Color = [Color("ff4fd8"), Color("3ee6ff"), Color("ffe066"), Color("5cff6e")][i % 4]
			var lantern := _box("Lantern", Vector3(x, 5.6 - row * 0.9 + sin(i * 1.3) * 0.25, -2.0 + row * 2.4), Vector3(0.2, 0.28, 0.2), _mat(hue, 2.0), false)
			_animated.append(lantern)
	var string_light := OmniLight3D.new()
	string_light.name = "LanternGlow"
	string_light.position = Vector3(0, 5.0, -0.6)
	string_light.light_color = Color("ffb3e6")
	string_light.light_energy = 1.4
	string_light.omni_range = 9.0
	add_child(string_light)
	for i in range(4):
		_box("MarketCrate", Vector3(4.2 - i * 0.4, 0.4 + (i % 2) * 0.8, 1.8 - i * 0.7), Vector3(0.9, 0.8, 0.8), _mat(Color("241a4d"), 0.0), false)

## 城镇：赛博街道，建筑立面发光窗格 + 全息广告牌 + 路灯。
var _billboard: Label3D
var _billboard_timer := 0.0
var _billboard_index := 0
const BILLBOARD_LINES := ["今夜全城直播", "你也在看吗？", "新版本 · 即将覆盖", "记忆折扣 · 限时回放"]

func _build_2020() -> void:
	# 两侧建筑立面：大块深色体 + 网格发光窗。
	for spec in [[Vector3(-4.6, 3.4, -3.6), 4], [Vector3(0.4, 4.2, -3.9), 5], [Vector3(4.6, 2.9, -3.5), 3]]:
		var at: Vector3 = spec[0]
		var floors: int = spec[1]
		var height := floors * 1.5
		_box("TownBlock", Vector3(at.x, height * 0.5, at.z), Vector3(2.6, height, 1.0), _mat(Color("0e0a24"), 0.0), false)
		for f in range(floors):
			for w in range(3):
				if (f * 3 + w + int(at.x)) % 3 == 0:
					continue
				var window_color := Color("3ee6ff") if (f + w) % 2 == 0 else Color("ffe066")
				_box("Window", Vector3(at.x - 0.75 + w * 0.75, 0.9 + f * 1.5, at.z + 0.53), Vector3(0.4, 0.55, 0.04), _mat(window_color, 1.3), false)
	# 悬浮全息广告牌：文本在 tick 里轮换。
	var board := _box("HoloBillboard", Vector3(0, 5.4, -3.2), Vector3(4.4, 1.4, 0.08), _mat(Color(0.18, 0.06, 0.4, 0.55), 1.1), false)
	_animated.append(board)
	_billboard = Label3D.new()
	_billboard.text = BILLBOARD_LINES[0]
	_billboard.position = Vector3(0, 5.4, -3.1)
	_billboard.font_size = 34
	_billboard.pixel_size = 0.006
	_billboard.modulate = Color("ff4fd8")
	add_child(_billboard)
	# 路灯柱。
	for x in [-3.4, 0.2, 3.6]:
		_box("LampPost", Vector3(x, 1.6, -0.8), Vector3(0.09, 3.2, 0.09), _mat(Color("110b28"), 0.0), false)
		_box("LampHead", Vector3(x, 3.25, -0.8), Vector3(0.4, 0.1, 0.24), _mat(Color("8cf2ff"), 2.0), false)
		var street := OmniLight3D.new()
		street.name = "StreetLamp"
		street.position = Vector3(x, 3.1, -0.6)
		street.light_color = Color("6fe8ff")
		street.light_energy = 1.1
		street.omni_range = 3.4
		add_child(street)
	_box("RoadStrip", Vector3(0, 0.02, 0.6), Vector3(11, 0.02, 1.6), _mat(Color("140e30"), 0.15), false)

## 公园：全息树 + 长椅 + 纪念屏，安静的收束场景。
func _build_2024() -> void:
	for spec in [[Vector3(-4.0, 0, -2.6), 1.0], [Vector3(-1.2, 0, -3.2), 1.25], [Vector3(2.4, 0, -2.8), 0.9], [Vector3(4.4, 0, -1.0), 1.1]]:
		var at: Vector3 = spec[0]
		var s: float = spec[1]
		_box("TreeTrunk", at + Vector3(0, 0.9 * s, 0), Vector3(0.22 * s, 1.8 * s, 0.22 * s), _mat(Color("1a1240"), 0.2), false)
		var canopy := MeshInstance3D.new()
		canopy.name = "HoloCanopy"
		canopy.position = at + Vector3(0, 2.4 * s, 0)
		var sphere := SphereMesh.new()
		sphere.radius = 1.05 * s
		sphere.height = 1.9 * s
		canopy.mesh = sphere
		canopy.material_override = _mat(Color(0.3, 1.0, 0.75, 0.4), 1.1)
		add_child(canopy)
		_animated.append(canopy)
		var tree_light := OmniLight3D.new()
		tree_light.name = "TreeGlow"
		tree_light.position = at + Vector3(0, 2.2 * s, 0)
		tree_light.light_color = Color("54ffc2")
		tree_light.light_energy = 0.9
		tree_light.omni_range = 3.4 * s
		add_child(tree_light)
	# 长椅两张。
	for x in [-2.6, 1.6]:
		_box("BenchSeat", Vector3(x, 0.45, 0.6), Vector3(1.6, 0.09, 0.5), _mat(Color("241a4d"), 0.0), true)
		_box("BenchBack", Vector3(x, 0.85, 0.82), Vector3(1.6, 0.5, 0.07), _mat(Color("241a4d"), 0.0), false)
		for side in [-0.65, 0.65]:
			_box("BenchLeg", Vector3(x + side, 0.22, 0.6), Vector3(0.08, 0.44, 0.4), _mat(Color("110b28"), 0.0), false)
	# 小径与草点。
	_box("ParkPath", Vector3(0, 0.02, 1.6), Vector3(10, 0.02, 1.2), _mat(Color("18103a"), 0.2), false)
	for i in range(10):
		_box("GrassTuft", Vector3(-4.6 + i * 1.02, 0.07, -0.6 + sin(i * 2.1) * 1.1), Vector3(0.14, 0.14, 0.14), _mat(Color("2fe08a"), 0.7), false)
	# 中央纪念屏：安静发光。
	_box("MemorialFrame", Vector3(0, 2.1, -4.25), Vector3(3.2, 2.0, 0.1), _mat(Color("0b0618"), 0.0), false)
	_box("MemorialScreen", Vector3(0, 2.1, -4.19), Vector3(2.8, 1.6, 0.03), _mat(Color("2a86b8"), 0.9), false)
	_label("这里埋着一段被覆盖的记忆", Vector3(0, 2.1, -4.1), Color("9ff0ff"))

func _build_2026() -> void:
	var white := _mat(Color("dfe8e8"), 0.4)
	for i in range(8):
		var mirror := _box("MirrorArchive", Vector3(-4.8 + (i % 4) * 3.2, 1.2 + (i / 4) * 2.4, -1.5), Vector3(2.3, 2.0, 0.08), white, false)
		_animated.append(mirror)
	for x in [-4.5, 4.5]:
		_box("LightColumn", Vector3(x, 3.5, 0), Vector3(0.25, 7, 0.25), _mat(Color("b9e5e5"), 1.2), false)

func _mat(color: Color, emission: float) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.75
	if color.a < 1.0:
		material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	if emission > 0.0:
		material.emission_enabled = true
		material.emission = Color(color.r, color.g, color.b)
		material.emission_energy_multiplier = emission
	return material

func _box(name: String, at: Vector3, size: Vector3, material: Material, collision: bool) -> MeshInstance3D:
	return _box_on(self, name, at, size, material, collision)

func _box_on(parent: Node3D, name: String, at: Vector3, size: Vector3, material: Material, collision: bool = false) -> MeshInstance3D:
	var visual := MeshInstance3D.new()
	visual.name = name
	visual.position = at
	var mesh := BoxMesh.new()
	mesh.size = size
	visual.mesh = mesh
	visual.material_override = material
	parent.add_child(visual)
	if collision:
		var body := StaticBody3D.new()
		body.name = name + "Collision"
		var shape := CollisionShape3D.new()
		var box_shape := BoxShape3D.new()
		box_shape.size = size
		shape.shape = box_shape
		body.position = at
		body.add_child(shape)
		add_child(body)
	return visual

func _label(text: String, at: Vector3, color: Color) -> void:
	var label := Label3D.new()
	label.text = text
	label.position = at
	label.font_size = 26
	label.pixel_size = 0.006
	label.modulate = color
	add_child(label)
