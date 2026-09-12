extends Node3D
## Single-room memory exhibition: three light interactions and three endings.
var player: Node3D
var stages: Array[Area3D] = []
var completed := {}
var prompt: Label
var card: Label
var count: Label
var ending := false
var idle_time := 0.0

func set_active(active: bool) -> void:
	if prompt: prompt.visible = active
	if card: card.visible = active
	if count: count.visible = active
	set_process(active)
var data := [
	["第一次被看见", "篮球动作档案", "那时候，只要有人笑了，就算被看见。"],
	["被模仿", "舞蹈动作档案", "当所有人都开始跳同一个动作，最先跳的人还在画面里吗？"],
	["被覆盖", "热搜记忆档案", "被忘记不等于没有发生，只是后来的人看不到了。"]
]

func setup(owner: Node3D, room: Node3D) -> void:
	player = owner.player
	var interaction_root:=room.get_node_or_null("MemeStages")
	if interaction_root:
		for node in interaction_root.get_children():
			if node is Area3D: stages.append(node)
	if prompt == null:
		prompt = Label.new(); owner.get_node("Interface").add_child(prompt)
	prompt.position = Vector2(38, 570); prompt.add_theme_font_size_override("font_size", 18)
	card = Label.new(); card.position = Vector2(38, 90); card.add_theme_font_size_override("font_size", 22); owner.get_node("Interface").add_child(card)
	count = Label.new(); count.position = Vector2(1000, 40); count.add_theme_font_size_override("font_size", 17); owner.get_node("Interface").add_child(count)
	update_ui()

func _process(delta: float) -> void:
	if player == null or ending: return
	idle_time += delta
	var nearest := -1
	var distance := 999.0
	for i in range(stages.size()):
		var d: float = player.global_position.distance_to(stages[i].global_position)
		if d < distance: distance = d; nearest = i
	if nearest >= 0 and distance < 3.0 and not completed.has(nearest):
		prompt.text = "E / 点击 读取 %s" % data[nearest][1]
		if Input.is_action_just_pressed("interact") or Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
			complete_stage(nearest)
	else:
		prompt.text = "找回三个被遗忘的记忆片段" if completed.size() < 3 else "中央档案台已开启 · 选择记忆的去处"
	if completed.size() == 3 and not ending and player.global_position.distance_to(Vector3(0,0,0)) < 3.0:
		prompt.text = "E 保存记忆  ·  Q 放回网络  ·  留在这里等待"
		if Input.is_key_pressed(KEY_E): finish("记忆已归档", Color("e4b878"))
		elif Input.is_key_pressed(KEY_Q): finish("传播仍在继续", Color("6be0d4"))
		elif idle_time > 12.0: finish("下一次访问，仍未确定", Color("9e9ee8"))

func complete_stage(index: int) -> void:
	completed[index] = true; idle_time = 0.0
	card.text = "%s\n%s" % [data[index][0], data[index][2]]
	update_ui()

func update_ui() -> void:
	if count: count.text = "记忆碎片  %d / 3" % completed.size()

func finish(text: String, color: Color) -> void:
	ending = true; prompt.text = text; prompt.modulate = color
	card.text = "奶蛙看向你。\n即使不再流行，曾经带来的快乐仍然真实存在。"
	await get_tree().create_timer(5.0).timeout
	ending = false; completed.clear(); card.text = ""; prompt.modulate = Color.WHITE; update_ui()
