extends RefCounted
## 档案馆的材质、陈设和局部照明；所有节点随馆体一起显隐。

static func metal(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.metallic = 0.25
	material.roughness = 0.78
	var noise := FastNoiseLite.new()
	noise.seed = 2016
	noise.frequency = 0.055
	var texture := NoiseTexture2D.new()
	texture.width = 256
	texture.height = 256
	texture.noise = noise
	var ramp := Gradient.new()
	ramp.set_color(0, Color("989d9e"))
	ramp.set_color(1, Color("b9bcba"))
	texture.color_ramp = ramp
	material.albedo_texture = texture
	material.uv1_triplanar = true
	material.uv1_scale = Vector3.ONE * 0.6
	return material

static func surface(color: Color, emission: float = 0.0) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.85
	if emission > 0.0:
		material.emission_enabled = true
		material.emission = color
		material.emission_energy_multiplier = emission
	return material

static func block(root: Node3D, title: String, position: Vector3, size: Vector3, material: Material) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	node.name = title
	var mesh := BoxMesh.new()
	mesh.size = size
	node.mesh = mesh
	node.material_override = material
	node.position = position
	root.add_child(node)
	return node

static func cable(root: Node3D, points: PackedVector3Array, material: Material, radius: float = 0.045) -> void:
	for i in range(points.size() - 1):
		var start := points[i]
		var end := points[i + 1]
		var direction := (end - start).normalized()
		var segment := MeshInstance3D.new()
		segment.name = "CableSegment"
		var mesh := CylinderMesh.new()
		mesh.top_radius = radius
		mesh.bottom_radius = radius
		mesh.height = start.distance_to(end)
		mesh.radial_segments = 6
		segment.mesh = mesh
		segment.material_override = material
		segment.position = (start + end) * 0.5
		var reference := Vector3.RIGHT if absf(direction.dot(Vector3.UP)) > 0.98 else Vector3.UP
		var x_axis := reference.cross(direction).normalized()
		segment.basis = Basis(x_axis, direction, x_axis.cross(direction))
		root.add_child(segment)

static func label(root: Node3D, text: String, position: Vector3, size: int, color: Color) -> void:
	var node := Label3D.new()
	node.text = text
	node.position = position
	node.font_size = size
	node.pixel_size = 0.008
	node.modulate = color
	node.outline_size = 0
	node.no_depth_test = false
	root.add_child(node)

static func build(root: Node3D) -> void:
	var steel := metal(Color("5b6b70"))
	var rust := metal(Color("785e49"))
	var black := surface(Color("161e25"))
	var paper := surface(Color("a69c7c"))
	var cyan := surface(Color("89c7cb"), 1.8)
	var amber := surface(Color("dca55e"), 1.5)
	var rng := RandomNumberGenerator.new()
	rng.seed = 20162026

	# 地板接缝、排水格栅和褪色的通行标线勾出可行走区域。
	for i in range(23):
		var x := -5.0 + i * 1.9
		block(root, "FloorPlate", Vector3(x, 0.009, 0), Vector3(1.85, 0.015, 4.25), steel)
		block(root, "FadedRouteMark", Vector3(x, 0.021, 1.75), Vector3(0.48, 0.012, 0.08), paper)
		for j in range(4):
			block(root, "DrainSlot", Vector3(x + j * 0.18, 0.02, -2.0), Vector3(0.08, 0.016, 0.4), black)

	var dates := ["2016", "2018", "2020", "2022", "2024", "2026"]
	var categories := ["论坛回帖", "循环影像", "直播回声", "热搜残片", "复制与再创作", "未命名记忆"]
	for i in range(6):
		var x := -1.0 + i * 6.2
		var cabinet := root.get_node("ServerCabinet_%02d" % i)
		(cabinet.get_node("Body") as MeshInstance3D).material_override = steel
		block(root, "ArchivePlaque", Vector3(x, 6.05, -2.53), Vector3(3.3, 0.74, 0.12), black)
		label(root, dates[i] + "  /  " + categories[i], Vector3(x, 6.05, -2.44), 38, Color("c5c7ab"))
		for row in range(7):
			var y := 0.8 + row * 0.76
			block(root, "DrawerHandle", Vector3(x - 0.3, y, -2.44), Vector3(0.55, 0.06, 0.09), rust)
			block(root, "IndexSlip", Vector3(x - 1.35, y, -2.49), Vector3(0.26, 0.13, 0.02), paper)
		# 线缆弯曲下垂并停在通道后沿，不穿过玩家。
		cable(root, PackedVector3Array([
			Vector3(x + 2.5, 10, -2.8), Vector3(x + 2.2, 7, -2.65),
			Vector3(x + 2.6, 3, -2.6), Vector3(x + 2.1, 0.14, -2.65),
			Vector3(x + 1.1, 0.08, -2.7)
		]), black, 0.07)
		# 少量敞开的档案盒和旧存储带堆在柜边。
		for j in range(3):
			var crate := block(root, "LostArchiveBox", Vector3(x + 2.4, 0.2 + j * 0.38, -2.85), Vector3(0.85, 0.36, 0.7), rust)
			crate.rotation.y = rng.randf_range(-0.18, 0.18)
		for j in range(4):
			var scrap := block(root, "DiscardedIndex", Vector3(x + rng.randf_range(-2, 2), 0.027, rng.randf_range(-1.4, 1.1)), Vector3(0.22, 0.007, 0.32), paper)
			scrap.rotation.y = rng.randf_range(-PI, PI)

	# 四盏实体吊灯，冷光照路、暖光在中后段接力。最多四盏投影灯。
	for i in range(4):
		var x := -2.5 + i * 12.0
		var warm := i == 2 or i == 3
		cable(root, PackedVector3Array([Vector3(x, 12.9, 0.1), Vector3(x, 6.4, 0.1)]), black)
		block(root, "PendantHousing", Vector3(x, 6.3, 0.1), Vector3(2.5, 0.24, 0.55), steel)
		block(root, "PendantDiffuser", Vector3(x, 6.16, 0.1), Vector3(2.1, 0.035, 0.35), amber if warm else cyan)
		var light := SpotLight3D.new()
		light.name = "RouteLight_%d" % i
		light.position = Vector3(x, 6.05, 0.1)
		light.rotation_degrees.x = -90
		light.light_color = Color("ffca8b") if warm else Color("b0dce3")
		light.light_energy = 3.5
		light.spot_range = 12
		light.spot_angle = 52
		light.spot_attenuation = 0.65
		light.shadow_enabled = true
		root.add_child(light)

	var screen_light := OmniLight3D.new()
	screen_light.name = "ScreenSpill"
	screen_light.position = Vector3(14, 4.2, -1.6)
	screen_light.light_color = Color("7ebac6")
	screen_light.light_energy = 2.0
	screen_light.omni_range = 8.0
	root.add_child(screen_light)
	label(root, "缓存不可用\n最后访问：很久以前", Vector3(14, 6.3, -2.08), 48, Color("accfce"))
	label(root, "记忆回收出口  →", Vector3(35.7, 5.95, -2.7), 42, Color("f3d4a4"))

	# 顶部横梁只框住画面，不在玩家行走高度遮挡。
	for i in range(5):
		var x := -5.0 + i * 10
		block(root, "OverheadGirder", Vector3(x, 9.3, 0), Vector3(0.24, 0.65, 7.6), rust)
