extends Node3D
## 背墙霓虹海报与涂鸦：填充柜位之间的空白墙面，纯程序化几何。
## 部分海报带故障闪烁（复用 archive_fx.gd 的 sin 波动手法）。

var _flicker: Array[Dictionary] = []
var _time := 0.0

const POSTERS := [
	{"x": 2.2, "y": 3.4, "w": 1.5, "h": 2.1, "accent": "ff4fd8", "title": "记忆回收 CORP", "line": "旧信号 · 高价上门"},
	{"x": 8.3, "y": 4.4, "w": 1.3, "h": 1.8, "accent": "3ee6ff", "title": "别眨眼", "line": "你正在被缓存", "flicker": true},
	{"x": 14.6, "y": 3.1, "w": 1.6, "h": 2.2, "accent": "b26bff", "title": "深夜频道", "line": "24H 循环播放"},
	{"x": 20.6, "y": 4.6, "w": 1.4, "h": 1.9, "accent": "5cffc2", "title": "像素诊所", "line": "修复丢帧的记忆", "flicker": true},
	{"x": 27.0, "y": 3.5, "w": 1.5, "h": 2.0, "accent": "ffa040", "title": "热搜当铺", "line": "过气梗 · 以旧换新"},
	{"x": 31.6, "y": 4.3, "w": 1.3, "h": 1.8, "accent": "ff5c8a", "title": "你曾经的直播", "line": "仍在缓存中", "flicker": true},
	{"x": 33.9, "y": 2.6, "w": 1.2, "h": 1.6, "accent": "3ee6ff", "title": "出口酒馆", "line": "最后一杯电子雨"}
]

func setup(archive_root: Node3D) -> void:
	name = "ArchivePosters"
	archive_root.add_child(self)
	for spec in POSTERS:
		_build_poster(spec)
	set_process(true)

func _build_poster(spec: Dictionary) -> void:
	var accent := Color(String(spec.accent))
	var w: float = spec.w
	var h: float = spec.h
	var poster := Node3D.new()
	poster.name = "Poster_%s" % String(spec.title).replace(" ", "_")
	poster.position = Vector3(spec.x, spec.y, -2.42)
	add_child(poster)
	# 底板：深色海报纸。
	_panel(poster, "Backing", Vector3.ZERO, Vector3(w, h, 0.03), Color("0b0618"), 0.0)
	# 霓虹灯管外框：四条发光边。
	for edge in [
		[Vector3(0, h * 0.5, 0.025), Vector3(w + 0.06, 0.045, 0.02)],
		[Vector3(0, -h * 0.5, 0.025), Vector3(w + 0.06, 0.045, 0.02)],
		[Vector3(-w * 0.5, 0, 0.025), Vector3(0.045, h + 0.06, 0.02)],
		[Vector3(w * 0.5, 0, 0.025), Vector3(0.045, h + 0.06, 0.02)]]:
		var tube := _panel(poster, "NeonEdge", edge[0], edge[1], accent, 2.6)
		if spec.get("flicker", false):
			_flicker.append({"mesh": tube, "seed": randf() * TAU})
	# 内层抽象色块拼贴：错落的两三块半亮色面模拟广告图案。
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(String(spec.title))
	for i in range(3):
		var bw := rng.randf_range(w * 0.25, w * 0.55)
		var bh := rng.randf_range(h * 0.12, h * 0.3)
		var bx := rng.randf_range(-(w - bw) * 0.4, (w - bw) * 0.4)
		var by := rng.randf_range(-(h - bh) * 0.32, (h - bh) * 0.12)
		var tint := accent.lerp(Color("1a1240"), rng.randf_range(0.35, 0.7))
		_panel(poster, "ArtBlock_%d" % i, Vector3(bx, by, 0.02), Vector3(bw, bh, 0.012), tint, 0.8)
	# 标语。
	var title := Label3D.new()
	title.text = String(spec.title)
	title.position = Vector3(0, h * 0.32, 0.04)
	title.font_size = 30
	title.pixel_size = 0.005
	title.modulate = accent
	poster.add_child(title)
	var line := Label3D.new()
	line.text = String(spec.line)
	line.position = Vector3(0, -h * 0.34, 0.04)
	line.font_size = 18
	line.pixel_size = 0.004
	line.modulate = Color("c9d4f2")
	poster.add_child(line)
	# 一盏很弱的补光，让海报在墙上有光晕。
	var glow := OmniLight3D.new()
	glow.name = "PosterGlow"
	glow.position = Vector3(0, 0, 0.5)
	glow.light_color = accent
	glow.light_energy = 0.35
	glow.omni_range = 1.9
	poster.add_child(glow)

func _panel(parent: Node3D, title: String, at: Vector3, size: Vector3, color: Color, emission: float) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	node.name = title
	node.position = at
	var mesh := BoxMesh.new()
	mesh.size = size
	node.mesh = mesh
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = 0.6
	if emission > 0.0:
		mat.emission_enabled = true
		mat.emission = color
		mat.emission_energy_multiplier = emission
	node.material_override = mat
	parent.add_child(node)
	return node

func _process(delta: float) -> void:
	if not is_visible_in_tree():
		return
	_time += delta
	# 坏灯管闪烁：低频正弦叠加高频抖动，偶尔完全熄灭一瞬。
	for entry in _flicker:
		var mesh := entry.mesh as MeshInstance3D
		var mat := mesh.material_override as StandardMaterial3D
		var phase: float = _time * 7.0 + float(entry.seed)
		var pulse := 2.2 + sin(phase) * 0.5 + sin(phase * 3.7) * 0.35
		if sin(phase * 0.43) > 0.985:
			pulse = 0.1
		mat.emission_energy_multiplier = maxf(pulse, 0.1)
