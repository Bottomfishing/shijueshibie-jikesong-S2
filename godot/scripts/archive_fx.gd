extends Node
## Runtime atmosphere and progress feedback for ArchiveArchitecture.
var archive_root: Node3D
var interaction: Node
var dust: GPUParticles3D
var drawer_dust: GPUParticles3D
var screen_shaft: SpotLight3D
var exit_pool: OmniLight3D
var route_lights: Array[OmniLight3D] = []
var route_markers: Array[MeshInstance3D] = []
var route_targets: Array[float] = []
var node_lights: Dictionary = {}
var node_materials: Dictionary = {}
var feedback_audio: AudioStreamPlayer
var feedback_streams: Dictionary = {}
var glitch_strength := {"imitated_2020": 0.25, "covered_2024": 0.3}
var target_exit_energy := 0.9
var target_shaft_energy := 3.2
var completion_elapsed := -1.0
var pulse_time := 0.0
var wrong_time := 0.0

func setup(owner: Node3D, archive_interaction: Node) -> void:
	archive_root = owner.get_node("ArchiveArchitecture") as Node3D
	interaction = archive_interaction
	var fx := archive_root.get_node("FX")
	dust = fx.get_node("ArchiveDust") as GPUParticles3D
	screen_shaft = fx.get_node("ArchiveScreenShaft") as SpotLight3D
	exit_pool = fx.get_node("ExitWarmPool") as OmniLight3D
	_create_route_lights(fx)
	_create_drawer_dust(fx)
	_create_node_lights(fx)
	feedback_audio = AudioStreamPlayer.new()
	feedback_audio.name = "ArchiveFeedbackAudio"
	feedback_audio.volume_db = -13.0
	fx.add_child(feedback_audio)
	interaction.memory_solved.connect(_on_memory_solved)
	interaction.archive_completed.connect(_on_archive_completed)
	interaction.interaction_feedback.connect(_on_interaction_feedback)

func _create_route_lights(parent: Node) -> void:
	var group := Node3D.new()
	group.name = "RouteLights"
	parent.add_child(group)
	for x in [-1.0, 11.4, 23.8, 35.0]:
		var lamp := OmniLight3D.new()
		lamp.name = "Route_%s" % str(x).replace(".", "_")
		lamp.position = Vector3(x, 0.7, -1.65)
		lamp.light_color = Color("3ee6ff")
		lamp.light_energy = 0.08
		lamp.omni_range = 2.2
		group.add_child(lamp)
		route_lights.append(lamp)
		route_targets.append(0.08)
		var marker := MeshInstance3D.new()
		marker.name = "Marker_%s" % str(x).replace(".", "_")
		marker.position = Vector3(x, 0.09, -1.65)
		var mesh := BoxMesh.new()
		mesh.size = Vector3(0.7, 0.045, 0.13)
		marker.mesh = mesh
		var material := StandardMaterial3D.new()
		material.albedo_color = Color("143242")
		material.emission_enabled = true
		material.emission = Color("3ee6ff")
		material.emission_energy_multiplier = 0.15
		marker.material_override = material
		group.add_child(marker)
		route_markers.append(marker)

func _create_drawer_dust(parent: Node) -> void:
	drawer_dust = GPUParticles3D.new()
	drawer_dust.name = "DrawerDust"
	drawer_dust.position = Vector3(-1.0, 1.15, -1.9)
	drawer_dust.amount = 64
	drawer_dust.lifetime = 1.7
	drawer_dust.one_shot = true
	drawer_dust.explosiveness = 0.95
	drawer_dust.emitting = false
	drawer_dust.visibility_aabb = AABB(Vector3(-2, -1.5, -2), Vector3(4, 4, 4))
	var mesh := dust.draw_pass_1.duplicate() as QuadMesh
	mesh.size = Vector2(0.075, 0.075)
	drawer_dust.draw_pass_1 = mesh
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	process.emission_box_extents = Vector3(0.45, 0.1, 0.25)
	process.direction = Vector3(0, 0.4, 1)
	process.spread = 60
	process.initial_velocity_min = 0.2
	process.initial_velocity_max = 0.8
	process.gravity = Vector3(0, -0.18, 0)
	drawer_dust.process_material = process
	parent.add_child(drawer_dust)

func _create_node_lights(parent: Node) -> void:
	var group := Node3D.new()
	group.name = "ArchiveNodeLights"
	parent.add_child(group)
	for item in interaction.nodes:
		var id := String(item.id)
		var lamp := OmniLight3D.new()
		lamp.name = id
		lamp.position = item.pos + Vector3(0, 0.7, 0.6)
		# 每段记忆一种霓虹色：2016 青、2020 品红、2024 橙。
		lamp.light_color = Color({"seen_2016": "3ee6ff", "imitated_2020": "ff4fd8", "covered_2024": "ffa040"}.get(id, "3ee6ff"))
		lamp.light_energy = 0.25
		lamp.omni_range = 2.5
		group.add_child(lamp)
		node_lights[id] = lamp
		var memory := archive_root.find_child("*Memory_" + id.right(4), true, false)
		if memory and memory.get_child_count() > 0 and memory.get_child(0) is MeshInstance3D:
			var material := (memory.get_child(0) as MeshInstance3D).material_override as StandardMaterial3D
			if material:
				node_materials[id] = material

func _process(delta: float) -> void:
	if archive_root == null or not archive_root.is_visible_in_tree():
		return
	pulse_time += delta
	wrong_time = maxf(0.0, wrong_time - delta)
	screen_shaft.light_energy = target_shaft_energy + sin(pulse_time * 2.1) * 0.12 - wrong_time * 2.5
	exit_pool.light_energy = move_toward(exit_pool.light_energy, target_exit_energy, delta * 1.8)
	if completion_elapsed >= 0.0:
		completion_elapsed += delta
		for i in range(route_lights.size()):
			if completion_elapsed >= i * 0.22:
				route_targets[i] = 0.7
	for i in range(route_lights.size()):
		route_lights[i].light_energy = move_toward(route_lights[i].light_energy, route_targets[i], delta)
		var material := route_markers[i].material_override as StandardMaterial3D
		material.emission_energy_multiplier = route_lights[i].light_energy * 4.0
	for id in glitch_strength:
		var lamp := node_lights[id] as OmniLight3D
		lamp.light_energy = 0.4 + sin(pulse_time * 5.0) * float(glitch_strength[id])

func _on_memory_solved(id: String) -> void:
	var lamp := node_lights[id] as OmniLight3D
	lamp.light_color = Color("5cffc2") if id != "covered_2024" else Color("ffc372")
	lamp.light_energy = 0.55
	if node_materials.has(id):
		var material := node_materials[id] as StandardMaterial3D
		material.albedo_color = Color("5cffc2")
		material.emission = material.albedo_color
		material.emission_energy_multiplier = 2.4
	if glitch_strength.has(id):
		glitch_strength[id] = 0.0
	# Each solved memory lights the route up to its cabinet; the last one reaches the exit lamp.
	var index: int = int({"seen_2016": 1, "imitated_2020": 2, "covered_2024": 4}.get(id, 0))
	for i in range(index):
		route_targets[i] = 0.42
	_play_feedback("solved" if index > 0 else "optional")
	if id == "imitated_2020":
		target_shaft_energy = 3.8
	elif id == "covered_2024":
		target_exit_energy = 2.8

func _on_archive_completed() -> void:
	target_exit_energy = 4.0
	target_shaft_energy = 4.6
	completion_elapsed = 0.0
	for i in range(route_lights.size()):
		route_targets[i] = 0.08
		route_lights[i].light_color = Color("ffae66")
		(route_markers[i].material_override as StandardMaterial3D).emission = Color("ffae66")
	_play_feedback("complete")

func _on_interaction_feedback(id: String, event: String) -> void:
	if event == "beat_wrong":
		wrong_time = 0.4
		_play_feedback("wrong")
	elif event == "drawer_open":
		drawer_dust.restart()
		drawer_dust.emitting = true
		_play_feedback(event)
	elif event in ["beat_correct", "pause", "refresh_paused", "saved", "resume", "refresh_resumed", "optional"]:
		if glitch_strength.has(id):
			glitch_strength[id] = 0.3 if event in ["resume", "refresh_resumed"] else 0.0
		_play_feedback(event)
	elif event in ["save", "network", "stay", "ending"]:
		_play_feedback("complete" if event == "save" else "optional")

func _play_feedback(kind: String) -> void:
	if not feedback_streams.has(kind):
		feedback_streams[kind] = _make_sound(kind)
	feedback_audio.stream = feedback_streams[kind]
	feedback_audio.play()

func _make_sound(kind: String) -> AudioStreamWAV:
	# Original synthetic mechanical noise and UI tones; no external audio.
	var frequencies := {"wrong": 145.0, "drawer_open": 220.0, "beat_correct": 440.0,
		"pause": 330.0, "refresh_paused": 330.0, "saved": 520.0, "optional": 290.0,
		"resume": 240.0, "refresh_resumed": 240.0, "solved": 380.0, "complete": 660.0}
	var frequency: float = float(frequencies.get(kind, 260.0))
	var duration := 0.65 if kind in ["drawer_open", "complete"] else 0.22
	var samples := int(22050.0 * duration)
	var bytes := PackedByteArray()
	bytes.resize(samples * 2)
	var noise := RandomNumberGenerator.new()
	noise.seed = 2016
	for i in range(samples):
		var time := float(i) / 22050.0
		var envelope := minf(time * 60.0, 1.0) * pow(1.0 - float(i) / samples, 1.6)
		var sample := sin(TAU * frequency * time) * 0.38
		if kind == "drawer_open":
			sample = noise.randf_range(-0.4, 0.4) + sin(TAU * 90.0 * time) * 0.18
		elif kind == "wrong":
			sample = noise.randf_range(-0.35, 0.35) + sample * 0.5
		elif kind in ["complete", "solved", "saved"]:
			sample += sin(TAU * frequency * 1.5 * time) * 0.18
		bytes.encode_s16(i * 2, int(clampf(sample * envelope, -1.0, 1.0) * 32767.0))
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = 22050
	stream.data = bytes
	return stream
