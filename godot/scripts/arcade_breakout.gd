extends Control
## 街机打砖块：8×4 砖阵，move_left/right 控制挡板，interact 发球/重开。

const BOARD := Vector2(560.0, 480.0)
const BRICK_COLS := 8
const BRICK_ROWS := 4
const PADDLE_SIZE := Vector2(96.0, 14.0)
const BALL_RADIUS := 8.0
const BALL_SPEED := 340.0

var bricks: Array[Rect2] = []
var brick_alive: Array[bool] = []
var paddle_x := 0.0
var ball_pos := Vector2.ZERO
var ball_velocity := Vector2.ZERO
var launched := false
var score := 0
var balls_left := 3
var finished := false
var win := false

func _ready() -> void:
	set_process(true)

func reset() -> void:
	bricks.clear()
	brick_alive.clear()
	var brick_w := BOARD.x / BRICK_COLS
	for row in range(BRICK_ROWS):
		for col in range(BRICK_COLS):
			bricks.append(Rect2(Vector2(col * brick_w + 3, 40 + row * 26), Vector2(brick_w - 6, 20)))
			brick_alive.append(true)
	paddle_x = BOARD.x * 0.5
	score = 0
	balls_left = 3
	finished = false
	win = false
	_rest_ball()
	queue_redraw()

func _rest_ball() -> void:
	launched = false
	ball_pos = Vector2(paddle_x, BOARD.y - 46)
	ball_velocity = Vector2.ZERO

func _process(delta: float) -> void:
	if finished:
		if Input.is_action_just_pressed("interact"):
			reset()
		return
	var x_axis := Input.get_axis("move_left", "move_right")
	paddle_x = clampf(paddle_x + x_axis * 420.0 * delta, PADDLE_SIZE.x * 0.5, BOARD.x - PADDLE_SIZE.x * 0.5)
	if not launched:
		ball_pos.x = paddle_x
		if Input.is_action_just_pressed("interact"):
			launched = true
			ball_velocity = Vector2(0.35 if randf() > 0.5 else -0.35, -1.0).normalized() * BALL_SPEED
		queue_redraw()
		return
	ball_pos += ball_velocity * delta
	if ball_pos.x <= BALL_RADIUS or ball_pos.x >= BOARD.x - BALL_RADIUS:
		ball_velocity.x = -ball_velocity.x
		ball_pos.x = clampf(ball_pos.x, BALL_RADIUS, BOARD.x - BALL_RADIUS)
	if ball_pos.y <= BALL_RADIUS:
		ball_velocity.y = absf(ball_velocity.y)
	# 挡板反弹：碰点偏移决定折射角。
	var paddle := Rect2(Vector2(paddle_x - PADDLE_SIZE.x * 0.5, BOARD.y - 32), PADDLE_SIZE)
	if ball_velocity.y > 0 and paddle.grow(BALL_RADIUS).has_point(ball_pos):
		var offset := (ball_pos.x - paddle_x) / (PADDLE_SIZE.x * 0.5)
		ball_velocity = Vector2(clampf(offset, -0.85, 0.85), -1.0).normalized() * BALL_SPEED
		ball_pos.y = paddle.position.y - BALL_RADIUS
	for i in range(bricks.size()):
		if not brick_alive[i]:
			continue
		if bricks[i].grow(BALL_RADIUS).has_point(ball_pos):
			brick_alive[i] = false
			score += 25
			var brick := bricks[i]
			# 以进入方向粗判反弹轴。
			if ball_pos.x < brick.position.x or ball_pos.x > brick.end.x:
				ball_velocity.x = -ball_velocity.x
			else:
				ball_velocity.y = -ball_velocity.y
			break
	if not brick_alive.has(true):
		finished = true
		win = true
	if ball_pos.y > BOARD.y + BALL_RADIUS:
		balls_left -= 1
		if balls_left <= 0:
			finished = true
			win = false
		else:
			_rest_ball()
	queue_redraw()

func _draw() -> void:
	var origin := (size - BOARD) * 0.5
	draw_rect(Rect2(origin - Vector2(6, 6), BOARD + Vector2(12, 12)), Color("ffa040"), false, 3.0)
	draw_rect(Rect2(origin, BOARD), Color(0.015, 0.01, 0.045))
	var row_colors := [Color("ff5c8a"), Color("ffa040"), Color("ffe066"), Color("3ee6ff")]
	for i in range(bricks.size()):
		if brick_alive[i]:
			draw_rect(Rect2(origin + bricks[i].position, bricks[i].size), row_colors[i / BRICK_COLS])
	draw_rect(Rect2(origin + Vector2(paddle_x - PADDLE_SIZE.x * 0.5, BOARD.y - 32), PADDLE_SIZE), Color("3ee6ff"))
	draw_circle(origin + ball_pos, BALL_RADIUS, Color("d1dcf5"))
	var font := ThemeDB.fallback_font
	draw_string(font, origin + Vector2(0, -20), "打砖块  ·  得分 %d  ·  球 %d" % [score, balls_left], HORIZONTAL_ALIGNMENT_LEFT, -1, 24, Color("ffa040"))
	draw_string(font, origin + Vector2(0, BOARD.y + 30), "A/D 移动挡板 · E 发球 · ESC 退出", HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color("c9d4f2"))
	if finished:
		var text := "缓存清空完毕  ·  E 再来一局" if win else "信号丢失  ·  E 重开"
		draw_string(font, origin + BOARD * 0.5 + Vector2(-140, 0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, 28, Color("5cff6e") if win else Color("ff5c8a"))
	elif not launched:
		draw_string(font, origin + BOARD * 0.5 + Vector2(-70, 60), "E 发球", HORIZONTAL_ALIGNMENT_LEFT, -1, 24, Color("ffe066"))
