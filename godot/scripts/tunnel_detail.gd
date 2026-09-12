extends Node3D
## Detail layer for the archive time tunnel. Adds authored, lightweight FX without
## changing the existing fragment steering API in opening_director.gd.
var elapsed := 0.0
var rings: Array[MeshInstance3D] = []
var scan_lines: Array[MeshInstance3D] = []
var portal_light: OmniLight3D

func _ready() -> void:
	_build_detail_layer()

func _build_detail_layer() -> void:
	var fx := Node3D.new()
	fx.name = "ArchiveTunnelFX"
	add_child(fx)
	# Three depth markers make the tunnel read as a corridor, rather than a flat ring.
	for i in range(3):
		var ring := MeshInstance3D.new()
		ring.name = "ArchiveGate_%02d" % i
		var torus := TorusMesh.new()
		torus.inner_radius = 3.45 - i * 0.2
		torus.outer_radius = 3.53 - i * 0.2
		torus.rings = 48
		torus.ring_segments = 12
		ring.mesh = torus
		ring.rotation.x = PI * 0.5
		ring.position = Vector3(0, 3.0, -12.0 - i * 16.0)
		ring.material_override = _glow_material(Color(0.18 + i * 0.12, 0.72, 0.86, 0.7), 2.2)
		fx.add_child(ring)
		rings.append(ring)
	# A distant portal is built from two nested rings and a soft light pool.
	var portal := MeshInstance3D.new()
	portal.name = "ArchivePortal"
	var portal_mesh := TorusMesh.new()
	portal_mesh.inner_radius = 2.65
	portal_mesh.outer_radius = 2.78
	portal_mesh.rings = 64
	portal_mesh.ring_segments = 16
	portal.mesh = portal_mesh
	portal.rotation.x = PI * 0.5
	portal.position = Vector3(0, 3.0, -46.0)
	portal.material_override = _glow_material(Color(0.62, 0.3, 0.96, 0.9), 3.5)
	fx.add_child(portal)
	rings.append(portal)
	portal_light = OmniLight3D.new()
	portal_light.name = "PortalSignalLight"
	portal_light.position = Vector3(0, 3.0, -45.0)
	portal_light.light_color = Color(0.36, 0.62, 1.0)
	portal_light.light_energy = 1.8
	portal_light.omni_range = 11.0
	fx.add_child(portal_light)
	# Thin horizontal scan lines echo old CRT refresh and add scale in the depth.
	for i in range(12):
		var line := MeshInstance3D.new()
		line.name = "Scanline_%02d" % i
		var mesh := BoxMesh.new()
		mesh.size = Vector3(9.0 + (i % 3) * 2.0, 0.012, 0.018)
		line.mesh = mesh
		line.position = Vector3(0, 0.7 + i * 0.42, -7.0 - (i % 4) * 9.0)
		line.material_override = _glow_material(Color(0.24, 0.72, 0.78, 0.23), 0.45)
		fx.add_child(line)
		scan_lines.append(line)
	# A stream of tiny archive pixels travels toward the loading portal.
	var particles := GPUParticles3D.new()
	particles.name = "ArchivePixelStream"
	particles.amount = 180
	particles.lifetime = 2.8
	particles.randomness = 0.8
	var particle_mesh := QuadMesh.new()
	particle_mesh.size = Vector2(0.045, 0.045)
	particle_mesh.material = _glow_material(Color(0.42, 0.88, 0.96, 0.7), 1.4)
	particles.draw_pass_1 = particle_mesh
	var process := ParticleProcessMaterial.new()
	process.direction = Vector3(0, 0, -1)
	process.initial_velocity_min = 5.0
	process.initial_velocity_max = 13.0
	process.gravity = Vector3.ZERO
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	process.emission_box_extents = Vector3(3.8, 2.6, 0.2)
	process.scale_min = 0.4
	process.scale_max = 1.8
	particles.process_material = process
	particles.position = Vector3(0, 3.0, 4.0)
	fx.add_child(particles)

func _glow_material(color: Color, energy: float) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = color
	mat.emission_enabled = true
	mat.emission = Color(color.r, color.g, color.b, 1.0)
	mat.emission_energy_multiplier = energy
	mat.no_depth_test = true
	return mat

func _process(delta: float) -> void:
	if not visible:
		return
	elapsed += delta
	for i in range(rings.size()):
		var ring := rings[i]
		ring.rotation.z += delta * (0.22 + i * 0.08)
		var pulse := 1.0 + sin(elapsed * (1.6 + i * 0.2) + i) * 0.055
		ring.scale = Vector3.ONE * pulse
		var mat := ring.material_override as StandardMaterial3D
		if mat:
			mat.emission_energy_multiplier = 2.0 + sin(elapsed * 2.0 + i) * 0.7
	for i in range(scan_lines.size()):
		var line := scan_lines[i]
		line.position.x = sin(elapsed * 0.8 + i * 0.7) * 0.8
		line.position.y += delta * (0.18 + (i % 3) * 0.08)
		if line.position.y > 5.7:
			line.position.y = 0.7
	if portal_light:
		portal_light.light_energy = 1.3 + sin(elapsed * 2.4) * 0.45
