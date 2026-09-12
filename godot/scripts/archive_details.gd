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
	var steel := metal(Color("292142"))
	var rust := metal(Color("5c1752"))
	var black := surface(Color("090513"))
	var paper := surface(Color("d1dcf5"))
	var cyan := surface(Color("26ebff"), 2.4)
	var amber := surface(Color("ff852e"), 1.8)
	var fx_root := Node3D.new(); fx_root.name = "ArchiveAtmosphere"; root.add_child(fx_root)
	# Fine dust catches the existing pendant beams without obscuring the play route.
	var dust := GPUParticles3D.new(); dust.name = "ArchiveDust"; dust.amount = 260; dust.lifetime = 9.0; dust.visibility_aabb = AABB(Vector3(-5, 1, -3.8), Vector3(42, 9, 7.6))
	var dust_mesh := QuadMesh.new(); dust_mesh.size = Vector2(.022, .022); var dust_mat := StandardMaterial3D.new(); dust_mat.albedo_color = Color(0.7, .62, .98, .18); dust_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; dust_mesh.material = dust_mat; dust.draw_pass_1 = dust_mesh
	var dust_process := ParticleProcessMaterial.new(); dust_process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX; dust_process.emission_box_extents = Vector3(20, 4, 3.2); dust_process.direction = Vector3(0, .18, 0); dust_process.spread = 28; dust_process.initial_velocity_min = .03; dust_process.initial_velocity_max = .16; dust_process.gravity = Vector3(0, -.012, 0); dust.process_material = dust_process; dust.position = Vector3(16, 1.5, -1.2); fx_root.add_child(dust)
	var rng := RandomNumberGenerator.new()
	rng.seed = 20162026

	# 地板接缝、排水格栅和褪色的通行标线勾出可行走区域。
	for i in range(23):
		var x := -5.0 + i * 1.9
		block(root, "FloorPlate", Vector3(x, 0.009, 0), Vector3(1.85, 0.015, 4.25), steel)
		block(root, "FadedRouteMark", Vector3(x, 0.021, 1.75), Vector3(0.48, 0.012, 0.08), paper)
		for j in range(4):
			block(root, "DrainSlot", Vector3(x + j * 0.18, 0.02, -2.0), Vector3(0.08, 0.016, 0.4), black)

	var dates := ["2016", "2020", "2024"]
	var categories := ["论坛回帖", "直播回声", "复制与再创作"]
	var cabinet_names := ["ServerCabinet_00", "ServerCabinet_02", "ServerCabinet_04"]
	for i in range(3):
		var x := -1.0 + i * 12.4
		var cabinet := root.get_node(cabinet_names[i])
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

	# 四盏实体吊灯，霓虹品红与电子青在走廊上交替接力。最多四盏投影灯。
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
		light.light_color = Color("ff52d1") if warm else Color("66ebff")
		light.light_energy = 3.5
		light.spot_range = 12
		light.spot_angle = 52
		light.spot_attenuation = 0.65
		light.shadow_enabled = true
		root.add_child(light)

	var screen_light := OmniLight3D.new()
	screen_light.name = "ScreenSpill"
	screen_light.position = Vector3(14, 4.2, -1.6)
	screen_light.light_color = Color("59d9ff")
	screen_light.light_energy = 2.0
	screen_light.omni_range = 8.0
	root.add_child(screen_light)
	label(root, "缓存不可用\n最后访问：很久以前", Vector3(14, 6.3, -2.08), 48, Color("8cf2ff"))
	label(root, "记忆回收出口  →", Vector3(35.7, 5.95, -2.7), 42, Color("ffae66"))

	# 顶部横梁只框住画面，不在玩家行走高度遮挡。
	for i in range(5):
		var x := -5.0 + i * 10
		block(root, "OverheadGirder", Vector3(x, 9.3, 0), Vector3(0.24, 0.65, 7.6), rust)
	# Broken foreground frames create a three-layer composition while leaving the floor route clear.
	for x in [-3.2, 8.5, 22.0, 31.0]:
		var frame := block(root, "ForegroundFrame", Vector3(x, 5.0, 3.2), Vector3(.22, 7.2, .5), black)
		frame.rotation.z = sin(x) * .035
	# A cold shaft at the archive screen and a warmer pool at the exit separate depth zones.
	var shaft := SpotLight3D.new(); shaft.name = "ArchiveScreenShaft"; shaft.position = Vector3(14, 10.5, 2.0); shaft.rotation_degrees = Vector3(-55, 0, 0); shaft.light_color = Color("64d8ff"); shaft.light_energy = 4.0; shaft.spot_range = 14; shaft.spot_angle = 32; shaft.shadow_enabled = true; root.add_child(shaft)
	var exit_fill := OmniLight3D.new(); exit_fill.name = "ExitWarmPool"; exit_fill.position = Vector3(35.0, 2.5, 0.0); exit_fill.light_color = Color("ff8033"); exit_fill.light_energy = 1.5; exit_fill.omni_range = 7.0; root.add_child(exit_fill)

static func build_fx(root: Node3D) -> void:
	if root.has_node("FX"):
		return
	var fx := Node3D.new()
	fx.name = "FX"
	root.add_child(fx)
	var dust := GPUParticles3D.new()
	dust.name = "ArchiveDust"
	dust.amount = 360
	dust.lifetime = 10.0
	dust.preprocess = 10.0
	dust.position = Vector3(16, 3.8, -0.8)
	# The AABB is relative to the emitter, not archive coordinates.
	dust.visibility_aabb = AABB(Vector3(-22, -4.5, -4), Vector3(44, 10, 8))
	var quad := QuadMesh.new()
	quad.size = Vector2(0.045, 0.045)
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(0.68, 0.62, 1.0, 0.48)
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.no_depth_test = false
	var gradient := Gradient.new()
	gradient.set_color(0, Color.WHITE)
	gradient.set_color(1, Color(1, 1, 1, 0))
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.fill = GradientTexture2D.FILL_RADIAL
	texture.fill_from = Vector2(0.5, 0.5)
	texture.fill_to = Vector2(1, 0.5)
	texture.width = 32
	texture.height = 32
	material.albedo_texture = texture
	quad.material = material
	dust.draw_pass_1 = quad
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	process.emission_box_extents = Vector3(20.5, 3.8, 2.5)
	process.direction = Vector3(0.15, 0.2, 0)
	process.spread = 32
	process.initial_velocity_min = 0.025
	process.initial_velocity_max = 0.11
	process.gravity = Vector3(0, -0.006, 0)
	process.scale_min = 0.4
	process.scale_max = 1.3
	dust.process_material = process
	fx.add_child(dust)
	var shaft := SpotLight3D.new()
	shaft.name = "ArchiveScreenShaft"
	shaft.position = Vector3(14, 9.2, 2)
	shaft.rotation_degrees = Vector3(-65, 0, 0)
	shaft.light_color = Color("64d8ff")
	shaft.light_energy = 3.2
	shaft.spot_range = 14
	shaft.spot_angle = 26
	shaft.shadow_enabled = true
	fx.add_child(shaft)
	# Compatibility renderer has no volumetric fog. A faint soft cone gives
	# the lit airborne dust a visible volume without a full-screen fog effect.
	var cone := MeshInstance3D.new()
	cone.name = "VisibleShaft"
	cone.position.z = -4.5
	cone.rotation.x = PI / 2.0
	cone.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var cone_mesh := CylinderMesh.new()
	cone_mesh.top_radius = 0.07
	cone_mesh.bottom_radius = 2.7
	cone_mesh.height = 9.0
	cone_mesh.radial_segments = 32
	cone_mesh.cap_top = false
	cone_mesh.cap_bottom = false
	cone.mesh = cone_mesh
	var shader := Shader.new()
	shader.code = "shader_type spatial; render_mode unshaded, blend_add, depth_draw_never, cull_disabled; uniform float strength = 0.034; void fragment() { float edge = pow(abs(dot(normalize(NORMAL), normalize(VIEW))), 2.0); float fade = smoothstep(0.0, 0.12, UV.y) * (1.0 - smoothstep(0.55, 1.0, UV.y)); ALBEDO = vec3(0.44, 0.62, 0.98); ALPHA = edge * fade * strength; }"
	var cone_material := ShaderMaterial.new()
	cone_material.shader = shader
	cone.material_override = cone_material
	shaft.add_child(cone)
	var pool := OmniLight3D.new()
	pool.name = "ExitWarmPool"
	pool.position = Vector3(35, 2.5, 0)
	pool.light_color = Color("ff8033")
	pool.light_energy = 0.9
	pool.omni_range = 7
	fx.add_child(pool)
