extends CanvasLayer
## 右下角视觉识别预览。优先显示 Godot CameraServer 的真实摄像头画面，
## 若当前设备不可用，则显示清晰的识别状态与鼠标兜底提示。

var preview: TextureRect
var status_label: Label
var placeholder: Label
var feed = null
var frame_socket := PacketPeerUDP.new()
const FRAME_PORT := 6402
var frame_parts: Dictionary = {}
var last_frame_at := -100.0

func _ready() -> void:
	_preview_ui()
	frame_socket.bind(FRAME_PORT, "127.0.0.1")
	_connect_camera()

func _preview_ui() -> void:
	var panel := PanelContainer.new()
	panel.name = "VisionPreviewPanel"
	panel.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	panel.position = Vector2(-286, -196)
	panel.size = Vector2(260, 170)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_theme_stylebox_override("panel", _panel_style())
	add_child(panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 4)
	panel.add_child(box)
	var title := Label.new()
	title.text = "  VISUAL INPUT  ·  用户视野"
	title.add_theme_font_size_override("font_size", 13)
	box.add_child(title)
	var preview_holder := Control.new()
	preview_holder.custom_minimum_size = Vector2(248, 132)
	box.add_child(preview_holder)
	var preview_background := ColorRect.new()
	preview_background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	preview_background.color = Color("101d25")
	preview_background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	preview_holder.add_child(preview_background)
	preview = TextureRect.new()
	preview.name = "UserCamera"
	preview.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	preview.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	preview.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	preview.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	preview.self_modulate = Color.WHITE
	preview.modulate = Color.WHITE
	preview_holder.add_child(preview)
	placeholder = Label.new()
	placeholder.text = "\n                 ◉\n          等待用户画面"
	placeholder.position = Vector2(0, 42)
	placeholder.size = Vector2(248, 80)
	placeholder.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	placeholder.add_theme_font_size_override("font_size", 14)
	placeholder.modulate = Color("79a7af")
	preview_holder.add_child(placeholder)
	status_label = Label.new()
	status_label.text = "正在连接摄像头…"
	status_label.add_theme_font_size_override("font_size", 11)
	box.add_child(status_label)

func _panel_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.02, 0.05, 0.07, 0.94)
	style.border_color = Color(0.25, 0.75, 0.76, 0.7)
	style.set_border_width_all(1)
	style.corner_radius_top_left = 6
	style.corner_radius_top_right = 6
	style.corner_radius_bottom_left = 6
	style.corner_radius_bottom_right = 6
	style.content_margin_left = 6
	style.content_margin_right = 6
	style.content_margin_top = 5
	style.content_margin_bottom = 5
	return style

func _connect_camera() -> void:
	# Godot 的 CameraServer 在桌面端只暴露 AR/platform feed，
	# 不会像浏览器 getUserMedia 一样枚举普通 USB webcam。
	# 因此这里仅尝试平台 feed，并对 Windows 普通摄像头给出明确提示。
	CameraServer.set_monitoring_feeds(true)
	var count := CameraServer.get_feed_count()
	if count <= 0:
		status_label.text = "桌面版未接入 webcam · 鼠标模式"
		placeholder.text = "\n                 ◉\n          Godot 暂不提供\n       Windows USB 摄像头采集"
		return
	feed = CameraServer.get_feed(0)
	if feed == null:
		status_label.text = "平台摄像头 feed 不可用 · 鼠标模式"
		return
	feed.feed_is_active = true
	preview.texture = feed.get_texture()
	placeholder.visible = preview.texture == null
	status_label.text = "用户画面 · 手部识别已连接"

func _process(_delta: float) -> void:
	while frame_socket.get_available_packet_count() > 0:
		var packet := frame_socket.get_packet()
		if packet.size() > 8:
			var frame_id := (int(packet[0]) << 24) | (int(packet[1]) << 16) | (int(packet[2]) << 8) | int(packet[3])
			var index := (int(packet[4]) << 8) | int(packet[5])
			var total := (int(packet[6]) << 8) | int(packet[7])
			if not frame_parts.has(frame_id): frame_parts[frame_id] = {"total": total, "parts": {}}
			frame_parts[frame_id]["parts"][index] = packet.slice(8)
			if frame_parts[frame_id]["parts"].size() == total:
				var jpeg := PackedByteArray()
				for i in range(total): jpeg.append_array(frame_parts[frame_id]["parts"][i])
				frame_parts.erase(frame_id)
				var image := Image.new()
				if image.load_jpg_from_buffer(jpeg) == OK:
					preview.texture = ImageTexture.create_from_image(image)
					placeholder.visible = false
					status_label.text = "用户画面 · 摄像头桥接已连接"
					last_frame_at = Time.get_ticks_msec() / 1000.0
			# 丢弃过期帧，防止桥接重启后缓存增长。
			if frame_parts.size() > 4:
				frame_parts.erase(frame_parts.keys()[0])
			continue
		if packet.size() > 4 and packet[0] == 255 and packet[1] == 216:
			var image := Image.new()
			if image.load_jpg_from_buffer(packet) == OK:
				preview.texture = ImageTexture.create_from_image(image)
				placeholder.visible = false
				status_label.text = "用户画面 · 摄像头桥接已连接"
	if feed != null and preview != null:
		var texture = feed.get_texture()
		if texture != null and preview.texture != texture:
			preview.texture = texture
			placeholder.visible = false
	if Time.get_ticks_msec() / 1000.0 - last_frame_at > 2.0 and feed == null:
		status_label.text = "未收到画面 · 请运行摄像头桥接脚本"
	var vision := get_parent().get_node_or_null("VisualRecognition")
	if vision != null and last_frame_at > -10.0:
		var state: Dictionary = vision.get_observation()
		if bool(state.get("active", false)) and String(state.get("source", "")) == "vision":
			status_label.text = "用户画面 · 手部识别已检测"
