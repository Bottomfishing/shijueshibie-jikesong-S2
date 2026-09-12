extends CanvasLayer

signal accepted
var panel: ColorRect
var title: Label
var button: Button
var glitch: Label
var elapsed := 0.0

func _ready() -> void:
	panel = ColorRect.new(); panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); panel.color = Color("050812"); add_child(panel)
	var glow := ColorRect.new(); glow.position = Vector2(0, 275); glow.size = Vector2(1280, 190); glow.color = Color(0.03, 0.34, 0.38, 0.28); panel.add_child(glow)
	for i in range(18):
		var line := ColorRect.new(); line.position = Vector2(0, 20 + i * 39); line.size = Vector2(1280, 1); line.color = Color(0.1, 0.8, 0.78, 0.10); panel.add_child(line)
	var eyebrow := Label.new(); eyebrow.text = "MILKFROG  //  MEMORY ARCHIVE"; eyebrow.position = Vector2(470, 150); eyebrow.modulate = Color("67d8d0"); eyebrow.add_theme_font_size_override("font_size", 15); panel.add_child(eyebrow)
	title = Label.new(); title.text = "奶蛙的一生"; title.position = Vector2(0, 218); title.size = Vector2(1280, 100); title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; title.add_theme_font_size_override("font_size", 78); title.add_theme_color_override("font_color", Color("d8ffef")); title.add_theme_color_override("font_shadow_color", Color("32eee0")); title.add_theme_constant_override("shadow_offset_x", 0); title.add_theme_constant_override("shadow_offset_y", 0); panel.add_child(title)
	glitch = Label.new(); glitch.text = "奶蛙的一生"; glitch.position = Vector2(3, 221); glitch.size = Vector2(1280, 100); glitch.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; glitch.add_theme_font_size_override("font_size", 78); glitch.modulate = Color(1, 0.18, 0.55, 0.0); panel.add_child(glitch)
	var caption := Label.new(); caption.text = "A RECORD OF BEING REMEMBERED"; caption.position = Vector2(470, 330); caption.modulate = Color("6d929c"); caption.add_theme_font_size_override("font_size", 13); panel.add_child(caption)
	button = Button.new(); button.text = "S T A R T"; button.position = Vector2(440, 430); button.size = Vector2(400, 64); button.add_theme_font_size_override("font_size", 22); button.add_theme_color_override("font_color", Color("d5fff4")); button.add_theme_color_override("font_hover_color", Color("7affef")); button.pressed.connect(accept); panel.add_child(button)
	var hint := Label.new(); hint.text = "点击横向黑框开始访问"; hint.position = Vector2(0, 515); hint.size = Vector2(1280, 24); hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; hint.modulate = Color("55747c"); panel.add_child(hint)
	var footer := Label.new(); footer.text = "废弃网络档案馆  /  SIGNAL ONLINE"; footer.position = Vector2(40, 665); footer.modulate = Color("477078"); footer.add_theme_font_size_override("font_size", 13); panel.add_child(footer)

func _process(delta: float) -> void:
	elapsed += delta
	var pulse := (sin(elapsed * 2.3) + 1.0) * 0.5
	title.modulate = Color(0.78 + pulse * 0.22, 1.0, 0.92 + pulse * 0.08, 1)
	glitch.position.x = sin(elapsed * 17.0) * 3.0
	glitch.modulate.a = 0.10 if fmod(elapsed, 3.7) > 3.45 else 0.0
	button.modulate = Color(1, 1, 1, 0.86 + pulse * 0.14)

func accept() -> void:
	button.disabled = true; button.text = "CONNECTING..."
	await get_tree().create_timer(0.65).timeout
	accepted.emit()
	var tween := create_tween(); tween.tween_property(panel, "modulate:a", 0.0, 0.75); tween.tween_callback(queue_free)
