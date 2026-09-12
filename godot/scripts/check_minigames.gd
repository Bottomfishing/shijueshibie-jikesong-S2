extends SceneTree
## 无头验证三个街机小游戏的核心逻辑（不依赖主场景）。

func _initialize() -> void:
	call_deferred("check")

func check() -> void:
	create_timer(30.0).timeout.connect(func():
		push_error("Minigame check exceeded timeout")
		quit(1))
	_check_snake()
	_check_tetris()
	_check_breakout()
	print("PASS: snake, tetris and breakout minigames")
	quit()

func _check_snake() -> void:
	var snake = load("res://scripts/arcade_snake.gd").new()
	root.add_child(snake)
	snake.reset()
	assert(snake.snake.size() == 3)
	assert(not snake.dead)
	# 把食物放到蛇头正前方，步进一格后应当变长加分。
	snake.food = snake.snake[0] + Vector2i.RIGHT
	snake._process(snake.STEP_TIME + 0.01)
	assert(snake.snake.size() == 4, "Snake should grow after eating")
	assert(snake.score == 10)
	# 一直向右撞墙后死亡，reset 后恢复。
	for i in range(32):
		snake._process(snake.STEP_TIME + 0.01)
	assert(snake.dead, "Snake should die at the wall")
	snake.reset()
	assert(not snake.dead and snake.snake.size() == 3)
	snake.queue_free()

func _check_tetris() -> void:
	var tetris = load("res://scripts/arcade_tetris.gd").new()
	root.add_child(tetris)
	tetris.reset()
	assert(not tetris.dead)
	assert(tetris.piece.size() == 4)
	# 手工铺满最底行留一个洞，再确认锁定/消行逻辑。
	for x in range(tetris.COLS):
		tetris.board[Vector2i(x, tetris.ROWS - 1)] = "I"
	tetris.piece = [Vector2i(0, 0)] as Array[Vector2i]
	tetris.piece_kind = "I"
	tetris.piece_pos = Vector2i(0, tetris.ROWS - 2)
	tetris._lock_piece()
	assert(tetris.lines == 1, "Full bottom row should clear")
	assert(tetris.score >= 100)
	# 消行后底行只剩锁进去的那格下落一行。
	assert(tetris.board.has(Vector2i(0, tetris.ROWS - 1)))
	assert(not tetris.board.has(Vector2i(1, tetris.ROWS - 1)))
	# 碰撞判定：越界即碰撞。
	assert(tetris._collides([Vector2i(0, 0)] as Array[Vector2i], Vector2i(-1, 0)))
	assert(tetris._collides([Vector2i(0, 0)] as Array[Vector2i], Vector2i(0, tetris.ROWS)))
	tetris.queue_free()

func _check_breakout() -> void:
	var breakout = load("res://scripts/arcade_breakout.gd").new()
	root.add_child(breakout)
	breakout.reset()
	assert(breakout.bricks.size() == breakout.BRICK_COLS * breakout.BRICK_ROWS)
	assert(breakout.balls_left == 3)
	# 直接把球射向第一块砖，应当命中记分。
	breakout.launched = true
	breakout.ball_pos = breakout.bricks[0].get_center() + Vector2(0, 30)
	breakout.ball_velocity = Vector2(0, -breakout.BALL_SPEED)
	for i in range(30):
		breakout._process(1.0 / 60.0)
		if breakout.score > 0:
			break
	assert(breakout.score >= 25, "Ball should break a brick")
	assert(breakout.brick_alive.count(false) >= 1)
	# 球落底扣一颗球并回到待发射状态。
	breakout.ball_pos = Vector2(breakout.BOARD.x * 0.5, breakout.BOARD.y + 20)
	breakout.ball_velocity = Vector2(0, breakout.BALL_SPEED)
	breakout._process(1.0 / 60.0)
	assert(breakout.balls_left == 2)
	assert(not breakout.launched)
	breakout.queue_free()
