extends Node3D

## 世界内的开机终端。整机程序化生成，屏幕内容走 SubViewport 贴到 3D 面片上，
## 所以它是「世界里的一台显示器」，而不是覆盖在世界之上的 UI 图层。
##
## 所有权边界：本脚本只管终端自身（外壳 / 屏幕 / 电源键 / 掌光）。
## 角色姿态归 opening_director，镜头归 camera_director，本脚本一律不碰。
##
## 阶段查询用 is_complete() / needs_thump() 轮询，不用信号，
## 避免 _process 与 _physics_process 的跨帧时序问题。

const SCREEN_PIXELS := Vector2i(480, 360)
const SCREEN_WORLD := Vector2(1.3, 0.975)
const CASE_SIZE := Vector3(1.74, 1.32, 1.46)
const FLASH_TIME := 0.72
const LINE_INTERVAL := 0.16
const LOAD_TIME := 1.6
const STALL_RESCUE := 2.8
const FINISH_TIME := 0.4
const READY_HOLD := 0.95
const BUTTON_REACH := 1.9

const COLOR_DIM := Color(0.05, 0.09, 0.10)
const COLOR_TEXT := Color(0.62, 0.94, 0.86)
const COLOR_OK := Color(0.45, 0.93, 0.55)
const COLOR_BAD := Color(1.0, 0.36, 0.34)
const COLOR_NOTE := Color(0.44, 0.78, 0.92)

## [文本, 状态, 状态色]。全 ASCII：BIOS 自检本来就是 ASCII，
## 既贴合年代感，也绕开默认字体的 CJK 覆盖问题。
const BIOS_ROWS := [
	["MEME BIOS  v2.0.26", "", 0],
	["Forgotten Archive Systems", "", 0],
	["", "", 0],
	["Detecting archive modules ...", "", 0],
	["   2016   2017   2018   2019", "OK", 1],
	["   2020   2021   2022   2023", "OK", 1],
	["   2024   2025", "OK", 1],
	["   2026", "CORRUPTED", 2],
	["", "", 0],
	["Total memes detected", "1048576", 3],
	["Nostalgia check", "PASS", 1],
	["Cringe filter", "DISABLED", 3],
	["Dial-up modem", "NOT FOUND", 2],
	["", "", 0],
	["Loading archive index ...", "", 0],
]

var stage := "off"
var stage_time := 0.0
var invite := false
var invite_time := 0.0
var palm_near := 0.0

var screen: MeshInstance3D
var screen_glow: OmniLight3D
var power_button: MeshInstance3D
var power_led: MeshInstance3D
var palm: Node3D

var _button_material: StandardMaterial3D
var _led_material: StandardMaterial3D
var _viewport: SubViewport
var _flash: ColorRect
var _content: Control
var _rows: Array[Control] = []
var _corrupt_row: Control
var _bar: ColorRect
var _bar_track: ColorRect
var _verdict: Label
var _revealed := 0
var _progress := 0.0
var _thumped := false

func _ready() -> void:
	_build_body()
	_build_screen()
	set_palm_visible(false)
	_apply_stage_visuals()

# ---------------------------------------------------------------- 对外接口

## 玩家按下电源键，开始真正的开机。
func power_on() -> void:
	if stage != "off":
		return
	invite = false
	_enter("flash")

## 进度条卡在 99%，等一次拍击。
func needs_thump() -> bool:
	return stage == "stall"

## 角色拍完机箱，放行到 100%。
func register_thump() -> void:
	if stage == "stall":
		_thumped = true

func is_complete() -> bool:
	return stage == "ready"

func is_running() -> bool:
	return stage != "off"

## 电源键开始呼吸，作为非语言的「指那儿」。
func set_invite(value: bool) -> void:
	if invite == value:
		return
	invite = value
	invite_time = 0.0

## 掌光位置由 opening_director 从 InputState + 相机换算后传入。
func set_palm(world_position: Vector3, strength: float) -> void:
	if palm == null:
		return
	palm.visible = strength > 0.01
	palm.global_position = world_position
	var scale_amount := 0.6 + strength * 0.5
	palm.scale = Vector3.ONE * scale_amount
	var light := palm.get_node_or_null("Light") as OmniLight3D
	if light != null:
		light.light_energy = 1.5 * strength
	var distance := world_position.distance_to(power_button.global_position)
	palm_near = clampf(1.0 - distance / BUTTON_REACH, 0.0, 1.0)

func set_palm_visible(value: bool) -> void:
	if palm != null:
		palm.visible = value

func button_world_position() -> Vector3:
	return power_button.global_position if power_button != null else global_position

func screen_world_position() -> Vector3:
	return screen.global_position if screen != null else global_position

## pull 阶段把画面抽走，屏幕跟着塌掉。
func collapse(amount: float) -> void:
	if _content != null:
		_content.modulate.a = 1.0 - clampf(amount, 0.0, 1.0)
	if screen_glow != null:
		screen_glow.light_energy = 2.2 * (1.0 - clampf(amount, 0.0, 1.0))

# ---------------------------------------------------------------- 驱动

func _process(delta: float) -> void:
	stage_time += delta
	if invite:
		invite_time += delta
	_advance(delta)
	_apply_stage_visuals()

func _advance(delta: float) -> void:
	match stage:
		"flash":
			if stage_time >= FLASH_TIME:
				_enter("bios")
		"bios":
			var target := int(stage_time / LINE_INTERVAL)
			while _revealed < BIOS_ROWS.size() and _revealed <= target:
				_rows[_revealed].visible = true
				_revealed += 1
			if _revealed >= BIOS_ROWS.size() and stage_time > BIOS_ROWS.size() * LINE_INTERVAL + 0.25:
				_enter("load")
		"load":
			_bar_track.visible = true
			_bar.visible = true
			_progress = minf(stage_time / LOAD_TIME, 0.99)
			if _progress >= 0.99:
				_enter("stall")
		"stall":
			_progress = 0.99
			if _thumped or stage_time > STALL_RESCUE:
				_enter("finish")
		"finish":
			_progress = lerpf(0.99, 1.0, clampf(stage_time / FINISH_TIME, 0.0, 1.0))
			if stage_time >= FINISH_TIME:
				_verdict.visible = true
				_enter("hold")
		"hold":
			_progress = 1.0
			if stage_time >= READY_HOLD:
				_enter("ready")
	if _bar != null and _bar.visible:
		_bar.size.x = (SCREEN_PIXELS.x - 64) * _progress

func _enter(next: String) -> void:
	stage = next
	stage_time = 0.0

func _apply_stage_visuals() -> void:
	var powered := stage != "off" and stage != "flash"
	if _content != null:
		_content.visible = powered
	if _flash != null:
		_flash.visible = stage == "flash"
		if stage == "flash":
			_paint_flash(stage_time / FLASH_TIME)
	if screen_glow != null and stage != "off":
		var energy := 2.2
		if stage == "flash":
			energy = 6.5 * (1.0 - absf(stage_time / FLASH_TIME - 0.35))
		screen_glow.light_energy = maxf(energy, 0.0)
	elif screen_glow != null:
		screen_glow.light_energy = 0.12
	_paint_button()

## CRT 通电：一道亮线先横向拉开，再纵向撑满，最后泛白退去。
func _paint_flash(p: float) -> void:
	var center := Vector2(SCREEN_PIXELS) * 0.5
	var width := SCREEN_PIXELS.x * smoothstep(0.0, 0.22, p)
	var height := 2.0 + (SCREEN_PIXELS.y - 2.0) * smoothstep(0.2, 0.55, p)
	_flash.size = Vector2(width, height)
	_flash.position = center - _flash.size * 0.5
	var fade := 1.0 - smoothstep(0.55, 1.0, p)
	_flash.color = Color(0.86, 0.98, 0.96, maxf(fade, 0.0))

func _paint_button() -> void:
	if _button_material == null:
		return
	var glow := 0.25
	if stage == "off":
		if invite:
			var breathe := (sin(invite_time * 3.1) + 1.0) * 0.5
			glow = 0.9 + breathe * 1.9 + palm_near * 2.6
		else:
			glow = 0.25 + palm_near * 0.7
	else:
		glow = 2.4
	_button_material.emission_energy_multiplier = glow
	if _led_material != null:
		_led_material.emission_energy_multiplier = 0.5 if stage == "off" else 3.0
		_led_material.emission = Color(0.95, 0.52, 0.22) if stage == "off" else Color(0.42, 0.95, 0.7)

# ---------------------------------------------------------------- 建模

func _build_body() -> void:
	_add_box("Stand", Vector3(1.36, 0.14, 1.18), Vector3(0, 0.07, 0), _plastic(Color(0.16, 0.17, 0.19)))
	_add_box("Case", CASE_SIZE, Vector3(0, 0.14 + CASE_SIZE.y * 0.5, 0), _plastic(Color(0.74, 0.71, 0.62)))
	var bezel_z := CASE_SIZE.z * 0.5 + 0.02
	var screen_y := 0.14 + CASE_SIZE.y * 0.56
	_add_box("Bezel", Vector3(1.46, 1.1, 0.05), Vector3(0, screen_y, bezel_z), _plastic(Color(0.1, 0.11, 0.12)))

	for i in 3:
		_add_box("Vent%d" % i, Vector3(1.1, 0.03, 0.06),
			Vector3(0, 0.14 + CASE_SIZE.y - 0.02, -0.2 - i * 0.16),
			_plastic(Color(0.4, 0.39, 0.36)))

	_button_material = _emissive(Color(0.95, 0.72, 0.4), Color(0.98, 0.66, 0.3), 0.25)
	power_button = _add_box("PowerButton", Vector3(0.2, 0.09, 0.06),
		Vector3(0.5, screen_y - 0.66, bezel_z + 0.02), _button_material)

	_led_material = _emissive(Color(0.95, 0.6, 0.35), Color(0.95, 0.52, 0.22), 0.5)
	power_led = _add_box("PowerLed", Vector3(0.05, 0.05, 0.04),
		Vector3(-0.5, screen_y - 0.66, bezel_z + 0.02), _led_material)

	screen_glow = OmniLight3D.new()
	screen_glow.name = "ScreenGlow"
	screen_glow.position = Vector3(0, screen_y, bezel_z + 0.9)
	screen_glow.light_color = Color(0.55, 0.9, 0.92)
	screen_glow.light_energy = 0.12
	screen_glow.omni_range = 6.5
	add_child(screen_glow)

	palm = Node3D.new()
	palm.name = "Palm"
	var dot := MeshInstance3D.new()
	dot.name = "Dot"
	var sphere := SphereMesh.new()
	sphere.radius = 0.07
	sphere.height = 0.14
	dot.mesh = sphere
	dot.material_override = _emissive(Color(0.86, 1.0, 0.94), Color(0.6, 0.98, 0.88), 3.4)
	palm.add_child(dot)
	var palm_light := OmniLight3D.new()
	palm_light.name = "Light"
	palm_light.light_color = Color(0.6, 0.96, 0.9)
	palm_light.light_energy = 1.5
	palm_light.omni_range = 2.8
	palm.add_child(palm_light)
	add_child(palm)

func _build_screen() -> void:
	_viewport = SubViewport.new()
	_viewport.name = "ScreenViewport"
	_viewport.size = SCREEN_PIXELS
	_viewport.transparent_bg = false
	_viewport.disable_3d = true
	_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(_viewport)

	var root := Control.new()
	root.name = "Root"
	root.size = Vector2(SCREEN_PIXELS)
	_viewport.add_child(root)

	var background := ColorRect.new()
	background.name = "Bg"
	background.size = Vector2(SCREEN_PIXELS)
	background.color = COLOR_DIM
	root.add_child(background)

	_content = Control.new()
	_content.name = "Content"
	_content.size = Vector2(SCREEN_PIXELS)
	root.add_child(_content)

	var y := 22.0
	for i in BIOS_ROWS.size():
		var entry: Array = BIOS_ROWS[i]
		var row := Control.new()
		row.position = Vector2(0, y)
		row.size = Vector2(SCREEN_PIXELS.x, 19)
		row.visible = false
		_content.add_child(row)
		_rows.append(row)

		var text := Label.new()
		text.text = String(entry[0])
		text.position = Vector2(22, 0)
		text.add_theme_font_size_override("font_size", 14)
		text.add_theme_color_override("font_color", COLOR_TEXT)
		row.add_child(text)

		var status := String(entry[1])
		if not status.is_empty():
			var badge := Label.new()
			badge.text = status
			badge.position = Vector2(SCREEN_PIXELS.x - 190, 0)
			badge.size = Vector2(168, 19)
			badge.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
			badge.add_theme_font_size_override("font_size", 14)
			badge.add_theme_color_override("font_color", _status_color(int(entry[2])))
			row.add_child(badge)
		if int(entry[2]) == 2 and _corrupt_row == null:
			_corrupt_row = row
		y += 19.0

	_bar_track = ColorRect.new()
	_bar_track.name = "BarTrack"
	_bar_track.position = Vector2(32, SCREEN_PIXELS.y - 46)
	_bar_track.size = Vector2(SCREEN_PIXELS.x - 64, 10)
	_bar_track.color = Color(0.16, 0.28, 0.3, 0.85)
	_bar_track.visible = false
	_content.add_child(_bar_track)

	_bar = ColorRect.new()
	_bar.name = "Bar"
	_bar.position = _bar_track.position
	_bar.size = Vector2(0, 10)
	_bar.color = Color(0.44, 0.92, 0.84)
	_bar.visible = false
	_content.add_child(_bar)

	_verdict = Label.new()
	_verdict.name = "Verdict"
	_verdict.text = "SIGNAL FOUND"
	_verdict.position = Vector2(32, SCREEN_PIXELS.y - 26)
	_verdict.add_theme_font_size_override("font_size", 15)
	_verdict.add_theme_color_override("font_color", Color(0.75, 1.0, 0.9))
	_verdict.visible = false
	_content.add_child(_verdict)

	var scanlines := Control.new()
	scanlines.name = "Scanlines"
	scanlines.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(scanlines)
	var line_y := 0
	while line_y < SCREEN_PIXELS.y:
		var line := ColorRect.new()
		line.position = Vector2(0, line_y)
		line.size = Vector2(SCREEN_PIXELS.x, 1)
		line.color = Color(0, 0, 0, 0.16)
		scanlines.add_child(line)
		line_y += 4

	_flash = ColorRect.new()
	_flash.name = "Flash"
	_flash.color = Color(0.86, 0.98, 0.96, 0.0)
	_flash.visible = false
	root.add_child(_flash)

	screen = MeshInstance3D.new()
	screen.name = "Screen"
	var quad := QuadMesh.new()
	quad.size = SCREEN_WORLD
	screen.mesh = quad
	screen.position = Vector3(0, 0.14 + CASE_SIZE.y * 0.56, CASE_SIZE.z * 0.5 + 0.05)
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.albedo_texture = _viewport.get_texture()
	screen.material_override = material
	add_child(screen)

func _status_color(kind: int) -> Color:
	match kind:
		1: return COLOR_OK
		2: return COLOR_BAD
		3: return COLOR_NOTE
	return COLOR_TEXT

func _add_box(node_name: String, size: Vector3, offset: Vector3, material: StandardMaterial3D) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	node.name = node_name
	var box := BoxMesh.new()
	box.size = size
	node.mesh = box
	node.position = offset
	node.material_override = material
	add_child(node)
	return node

func _plastic(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.78
	return material

func _emissive(albedo: Color, glow: Color, energy: float) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = albedo
	material.roughness = 0.35
	material.emission_enabled = true
	material.emission = glow
	material.emission_energy_multiplier = energy
	return material
