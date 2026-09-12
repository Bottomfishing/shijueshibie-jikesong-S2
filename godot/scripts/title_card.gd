extends CanvasLayer

## 开屏标题：「奶娃档案」。
##
## 设计口径：这不是对话框，也不是教程——它不要求玩家做任何事、不解释任何操作，
## 所以与「没有对话框的产品」不冲突。它是片头字卡。
##
## 视觉语言沿用档案馆那套 CRT 底色：磷光冷调、RGB 分离、扫描线、逐字点亮。
## 字体走引擎默认（已确认能渲染中文，Interface 里的「网 络 流 行 梗 编 年 馆」即是）。
##
## 自治：本层自己 _process 推进、自己淡出隐藏，不 gate 剧情、不改任何外部状态。
## 世界在底下照常运行，字卡淡出后正好露出暗房里熟睡的奶蛙。
## 因此 headless 冒烟测试完全不受影响。

const TITLE := "奶娃档案"
const META := "M E M E   A R C H I V E   ·   2 0 1 6 — 2 0 2 6"

## 总时长压在 2.4s 内：opening_director 的 IDLE_TIMEOUT 是 6.0s，
## 字卡必须在待机段自动推进之前退场，否则玩家会错过奶蛙睁眼那一下。
const WARM_TIME := 0.42
const CHAR_INTERVAL := 0.13
const CHAR_GLITCH := 0.16
const HOLD_TIME := 0.62
const FADE_TIME := 0.55

const FONT_SIZE := 72
const CHAR_GAP := 30
const META_SIZE := 15
const RULE_WIDTH := 430.0

const COLOR_BACKDROP := Color(0.018, 0.025, 0.035)
const COLOR_MAIN := Color(0.93, 0.97, 0.95)
const COLOR_GHOST_COOL := Color(0.30, 0.86, 0.92)
const COLOR_GHOST_WARM := Color(0.96, 0.44, 0.38)
const COLOR_META := Color(0.50, 0.76, 0.80)
const COLOR_RULE := Color(0.44, 0.88, 0.84)

var stage := "warm"
var stage_time := 0.0

var _viewport_size := Vector2(1280, 720)
var _backdrop: ColorRect
var _sweep: ColorRect
var _body: Control
var _chars: Array[Dictionary] = []
var _rule: ColorRect
var _meta: Label
var _revealed := 0

func _ready() -> void:
	layer = 100
	_viewport_size = Vector2(get_viewport().get_visible_rect().size)
	_build()
	_apply(0.0)

func _process(delta: float) -> void:
	stage_time += delta
	match stage:
		"warm":
			if stage_time >= WARM_TIME:
				_enter("reveal")
		"reveal":
			var target := int(stage_time / CHAR_INTERVAL) + 1
			_revealed = mini(target, TITLE.length())
			if _revealed >= TITLE.length() and stage_time >= TITLE.length() * CHAR_INTERVAL:
				_enter("hold")
		"hold":
			if stage_time >= HOLD_TIME:
				_enter("fade")
		"fade":
			if stage_time >= FADE_TIME:
				_enter("done")
		"done":
			visible = false
			set_process(false)
			return
	_apply(delta)

## 任何输入都能跳过。剧情不依赖它，所以跳过是纯视觉行为。
func skip() -> void:
	if stage == "done" or stage == "fade":
		return
	_revealed = TITLE.length()
	_enter("fade")

func is_finished() -> bool:
	return stage == "done"

func _input(event: InputEvent) -> void:
	if stage == "done":
		return
	if event is InputEventMouseButton and event.pressed:
		skip()
	elif event is InputEventKey and event.pressed and not event.echo:
		skip()

func _enter(next: String) -> void:
	stage = next
	stage_time = 0.0

# ---------------------------------------------------------------- 绘制

func _apply(delta: float) -> void:
	var fade := 1.0
	if stage == "fade":
		fade = 1.0 - clampf(stage_time / FADE_TIME, 0.0, 1.0)

	# 底幕整体压暗，露出底下的暗房。
	_backdrop.color = Color(COLOR_BACKDROP.r, COLOR_BACKDROP.g, COLOR_BACKDROP.b, fade)

	# CRT 预热：一道亮线横向撑开后上移消失。
	var warming := stage == "warm"
	_sweep.visible = warming
	if warming:
		var p := clampf(stage_time / WARM_TIME, 0.0, 1.0)
		var width := _viewport_size.x * smoothstep(0.0, 0.55, p)
		_sweep.size = Vector2(width, 2.0)
		_sweep.position = Vector2((_viewport_size.x - width) * 0.5, _viewport_size.y * 0.5)
		_sweep.color = Color(COLOR_MAIN.r, COLOR_MAIN.g, COLOR_MAIN.b,
			(1.0 - smoothstep(0.6, 1.0, p)) * 0.9)

	for i in _chars.size():
		var entry := _chars[i]
		var root: Control = entry["root"]
		if i >= _revealed:
			root.visible = false
			continue
		root.visible = true
		# 刚点亮的那一下横向抖一次，然后归位；RGB 分离随之收窄。
		var age := stage_time - float(i) * CHAR_INTERVAL if stage == "reveal" else 99.0
		var glitch := 0.0
		if age >= 0.0 and age < CHAR_GLITCH:
			glitch = 1.0 - age / CHAR_GLITCH
		var jitter := sin(age * 90.0) * glitch * 7.0
		var split := 2.0 + glitch * 9.0
		root.position.x = float(entry["home_x"]) + jitter
		var cool: Label = entry["cool"]
		var warm: Label = entry["warm"]
		var main: Label = entry["main"]
		cool.position.x = -split
		warm.position.x = split
		var ghost_alpha := (0.45 + glitch * 0.4) * fade
		cool.modulate.a = ghost_alpha
		warm.modulate.a = ghost_alpha
		main.modulate.a = fade

	# 分隔线自中心向两侧拉开，全部字点亮后才开始。
	var rule_progress := 0.0
	if stage == "hold" or stage == "fade":
		rule_progress = 1.0 if stage != "hold" else smoothstep(0.0, 0.34, stage_time)
	var rule_w := RULE_WIDTH * rule_progress
	_rule.size = Vector2(rule_w, 1.0)
	_rule.position.x = (_viewport_size.x - rule_w) * 0.5
	_rule.modulate.a = fade * 0.8

	# 副标题跟在分隔线之后淡入。
	var meta_alpha := 0.0
	if stage == "hold":
		meta_alpha = smoothstep(0.12, 0.5, stage_time)
	elif stage == "fade":
		meta_alpha = 1.0
	_meta.modulate.a = meta_alpha * fade

func _build() -> void:
	_backdrop = ColorRect.new()
	_backdrop.name = "Backdrop"
	_backdrop.size = _viewport_size
	_backdrop.color = COLOR_BACKDROP
	_backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_backdrop)

	_body = Control.new()
	_body.name = "Body"
	_body.size = _viewport_size
	_body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_body)

	# 逐字建组，每个字三层做 RGB 分离。
	var count := TITLE.length()
	var total := count * FONT_SIZE + (count - 1) * CHAR_GAP
	var start_x := (_viewport_size.x - float(total)) * 0.5
	var title_y := _viewport_size.y * 0.40
	for i in count:
		var glyph := TITLE[i]
		var root := Control.new()
		root.name = "Char%d" % i
		root.position = Vector2(start_x + float(i) * float(FONT_SIZE + CHAR_GAP), title_y)
		root.size = Vector2(FONT_SIZE, FONT_SIZE * 1.4)
		root.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_body.add_child(root)
		var cool := _make_glyph(glyph, COLOR_GHOST_COOL)
		var warm := _make_glyph(glyph, COLOR_GHOST_WARM)
		var main := _make_glyph(glyph, COLOR_MAIN)
		root.add_child(cool)
		root.add_child(warm)
		root.add_child(main)
		_chars.append({
			"root": root, "cool": cool, "warm": warm, "main": main,
			"home_x": root.position.x,
		})

	_rule = ColorRect.new()
	_rule.name = "Rule"
	_rule.color = COLOR_RULE
	_rule.size = Vector2(0.0, 1.0)
	_rule.position = Vector2(_viewport_size.x * 0.5, title_y + float(FONT_SIZE) * 1.55)
	_rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_body.add_child(_rule)

	_meta = Label.new()
	_meta.name = "Meta"
	_meta.text = META
	_meta.size = Vector2(_viewport_size.x, 24.0)
	_meta.position = Vector2(0.0, _rule.position.y + 18.0)
	_meta.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_meta.add_theme_font_size_override("font_size", META_SIZE)
	_meta.add_theme_color_override("font_color", COLOR_META)
	_meta.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_body.add_child(_meta)

	# 扫描线压在最上层，把整块字卡统一成 CRT 质感。
	var scanlines := Control.new()
	scanlines.name = "Scanlines"
	scanlines.size = _viewport_size
	scanlines.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(scanlines)
	var y := 0.0
	while y < _viewport_size.y:
		var line := ColorRect.new()
		line.size = Vector2(_viewport_size.x, 1.0)
		line.position = Vector2(0.0, y)
		line.color = Color(0.0, 0.0, 0.0, 0.13)
		line.mouse_filter = Control.MOUSE_FILTER_IGNORE
		scanlines.add_child(line)
		y += 3.0

	_sweep = ColorRect.new()
	_sweep.name = "Sweep"
	_sweep.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_sweep)

func _make_glyph(glyph: String, color: Color) -> Label:
	var label := Label.new()
	label.text = glyph
	label.size = Vector2(FONT_SIZE, FONT_SIZE * 1.4)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", FONT_SIZE)
	label.add_theme_color_override("font_color", color)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label
