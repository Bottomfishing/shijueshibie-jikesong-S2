extends Control
## 街机俄罗斯方块：8×14 盘面，move_left/right 移动，move_back 软降，
## move_forward 旋转，jump 硬降，interact 重开。

const COLS := 8
const ROWS := 14
const CELL := 34.0
const FALL_TIME := 0.55

const SHAPES := {
	"I": [Vector2i(-1, 0), Vector2i(0, 0), Vector2i(1, 0), Vector2i(2, 0)],
	"O": [Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1)],
	"T": [Vector2i(-1, 0), Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1)],
	"S": [Vector2i(0, 0), Vector2i(1, 0), Vector2i(-1, 1), Vector2i(0, 1)],
	"Z": [Vector2i(-1, 0), Vector2i(0, 0), Vector2i(0, 1), Vector2i(1, 1)],
	"J": [Vector2i(-1, 0), Vector2i(0, 0), Vector2i(1, 0), Vector2i(-1, 1)],
	"L": [Vector2i(-1, 0), Vector2i(0, 0), Vector2i(1, 0), Vector2i(1, 1)]
}
const SHAPE_COLORS := {
	"I": Color("3ee6ff"), "O": Color("ffe066"), "T": Color("b26bff"),
	"S": Color("5cff6e"), "Z": Color("ff5c8a"), "J": Color("668cff"), "L": Color("ffa040")
}

var board: Dictionary = {}
var piece: Array[Vector2i] = []
var piece_pos := Vector2i(3, 0)
var piece_kind := "T"
var score := 0
var lines := 0
var dead := false
var fall_timer := 0.0
var move_cooldown := 0.0
var rng := RandomNumberGenerator.new()

func _ready() -> void:
	set_process(true)

func reset() -> void:
	board.clear()
	score = 0
	lines = 0
	dead = false
	fall_timer = 0.0
	_spawn_piece()
	queue_redraw()

func _spawn_piece() -> void:
	piece_kind = SHAPES.keys()[rng.randi_range(0, SHAPES.size() - 1)]
	piece = []
	for cell in SHAPES[piece_kind]:
		piece.append(cell as Vector2i)
	piece_pos = Vector2i(3, 0)
	if _collides(piece, piece_pos):
		dead = true

func _collides(cells: Array[Vector2i], at: Vector2i) -> bool:
	for cell in cells:
		var p := cell + at
		if p.x < 0 or p.x >= COLS or p.y >= ROWS:
			return true
		if board.has(p):
			return true
	return false

func _lock_piece() -> void:
	for cell in piece:
		board[cell + piece_pos] = piece_kind
	var cleared := 0
	var y := ROWS - 1
	while y >= 0:
		var full := true
		for x in range(COLS):
			if not board.has(Vector2i(x, y)):
				full = false
				break
		if full:
			cleared += 1
			for x in range(COLS):
				board.erase(Vector2i(x, y))
			# 上方整体下移一行。
			var moved: Dictionary = {}
			for key in board.keys():
				var cell: Vector2i = key
				moved[cell + Vector2i(0, 1) if cell.y < y else cell] = board[key]
			board = moved
		else:
			y -= 1
	if cleared > 0:
		lines += cleared
		score += [0, 100, 300, 500, 800][cleared]
	_spawn_piece()

func _try_move(offset: Vector2i) -> bool:
	if _collides(piece, piece_pos + offset):
		return false
	piece_pos += offset
	return true

func _try_rotate() -> void:
	if piece_kind == "O":
		return
	var rotated: Array[Vector2i] = []
	for cell in piece:
		rotated.append(Vector2i(-cell.y, cell.x))
	for kick in [Vector2i.ZERO, Vector2i.LEFT, Vector2i.RIGHT]:
		if not _collides(rotated, piece_pos + kick):
			piece = rotated
			piece_pos += kick
			return

func _process(delta: float) -> void:
	if dead:
		if Input.is_action_just_pressed("interact"):
			reset()
		return
	move_cooldown = maxf(0.0, move_cooldown - delta)
	if move_cooldown <= 0.0:
		var x_axis := int(Input.get_axis("move_left", "move_right"))
		if x_axis != 0 and _try_move(Vector2i(x_axis, 0)):
			move_cooldown = 0.12
			queue_redraw()
	if Input.is_action_just_pressed("move_forward"):
		_try_rotate()
		queue_redraw()
	if Input.is_action_just_pressed("jump"):
		while _try_move(Vector2i(0, 1)):
			pass
		_lock_piece()
		queue_redraw()
		return
	var fall_step := FALL_TIME * (0.18 if Input.is_action_pressed("move_back") else 1.0)
	fall_timer += delta
	if fall_timer >= fall_step:
		fall_timer = 0.0
		if not _try_move(Vector2i(0, 1)):
			_lock_piece()
		queue_redraw()

func _draw() -> void:
	var board_size := Vector2(COLS * CELL, ROWS * CELL)
	var origin := (size - board_size) * 0.5
	draw_rect(Rect2(origin - Vector2(6, 6), board_size + Vector2(12, 12)), Color("b26bff"), false, 3.0)
	draw_rect(Rect2(origin, board_size), Color(0.015, 0.01, 0.045))
	for x in range(COLS + 1):
		draw_line(origin + Vector2(x * CELL, 0), origin + Vector2(x * CELL, board_size.y), Color(0.7, 0.42, 1.0, 0.07))
	for y in range(ROWS + 1):
		draw_line(origin + Vector2(0, y * CELL), origin + Vector2(board_size.x, y * CELL), Color(0.7, 0.42, 1.0, 0.07))
	for key in board.keys():
		var cell: Vector2i = key
		_cell(origin, cell, (SHAPE_COLORS[board[key]] as Color).darkened(0.25))
	if not dead:
		for cell in piece:
			_cell(origin, cell + piece_pos, SHAPE_COLORS[piece_kind])
	var font := ThemeDB.fallback_font
	draw_string(font, origin + Vector2(0, -20), "俄罗斯方块  ·  得分 %d  ·  消行 %d" % [score, lines], HORIZONTAL_ALIGNMENT_LEFT, -1, 24, Color("b26bff"))
	draw_string(font, origin + Vector2(0, board_size.y + 30), "A/D 移动 · W 旋转 · S 软降 · 空格 硬降 · ESC 退出", HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color("c9d4f2"))
	if dead:
		draw_string(font, origin + board_size * 0.5 + Vector2(-110, 0), "堆栈溢出  ·  E 重开", HORIZONTAL_ALIGNMENT_LEFT, -1, 28, Color("ff5c8a"))

func _cell(origin: Vector2, cell: Vector2i, color: Color) -> void:
	if cell.y < 0:
		return
	draw_rect(Rect2(origin + Vector2(cell.x, cell.y) * CELL + Vector2(3, 3), Vector2(CELL - 6, CELL - 6)), color)
