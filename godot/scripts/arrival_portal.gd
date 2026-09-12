extends Node3D
class_name ArrivalPortal

## Lightweight, self-contained arrival portal used by the opening sequence.
##
## The mesh is built at runtime so the portal can be added to any scene without
## carrying a large collection of sub-resources.  It deliberately has no
## collision: the character is animated by opening_director while the portal is
## visual-only.

@export var ring_radius: float = 1.25
@export var ring_thickness: float = 0.105
@export var open_speed: float = 5.5
@export var close_speed: float = 3.8

const RING_COLORS := [
	Color("63e5db"),
	Color("8aa7ff"),
	Color("e985ff"),
]

var _rings: Array[MeshInstance3D] = []
var _ring_materials: Array[StandardMaterial3D] = []
var _core: MeshInstance3D
var _core_material: StandardMaterial3D
var _light: OmniLight3D
var _open_amount := 0.0
var _target_open := 0.0
var _progress := 0.0
var _time := 0.0
var _built := false

func _ready() -> void:
	_build()
	visible = false

func _process(delta: float) -> void:
	if not _built:
		return
	_time += delta
	var speed := open_speed if _target_open > _open_amount else close_speed
	_open_amount = move_toward(_open_amount, _target_open, delta * speed)
	if _open_amount <= 0.001 and _target_open <= 0.0:
		_open_amount = 0.0
		visible = false
		return
	if not visible:
		visible = true

	# A subtle breathing motion keeps the portal alive while avoiding a noisy
	# full-screen effect during the landing shot.
	var pulse := 1.0 + sin(_time * 3.2) * 0.045
	var progress_scale := lerpf(0.78, 1.0, _progress)
	for i in range(_rings.size()):
		var ring := _rings[i]
		var phase := _time * (0.65 + float(i) * 0.17) + float(i) * 1.8
		ring.rotation.z = phase * (1.0 if i % 2 == 0 else -1.0)
		ring.rotation.y = sin(_time * 1.6 + float(i)) * 0.08
		ring.scale = Vector3.ONE * _open_amount * progress_scale * pulse * (1.0 - float(i) * 0.07)
		_ring_materials[i].emission_energy_multiplier = lerpf(0.15, 2.6, _open_amount) + sin(_time * 4.0 + float(i)) * 0.18

	if is_instance_valid(_core):
		_core.rotation.z = -_time * 0.8
		_core.scale = Vector3(1.0, 1.0, 0.25) * _open_amount * progress_scale
		_core_material.emission_energy_multiplier = lerpf(0.1, 1.2, _open_amount)
	if is_instance_valid(_light):
		_light.light_energy = lerpf(0.0, 2.8, _open_amount) * (0.88 + sin(_time * 3.0) * 0.12)

## Opens the portal around a world-space position.  The default center is just
## above the archive floor so the frog can visibly fall through its aperture.
func open_at(world_position: Vector3, immediate: bool = false) -> void:
	if not _built:
		_build()
	global_position = world_position
	_target_open = 1.0
	_progress = 0.0
	visible = true
	if immediate:
		_open_amount = 1.0

## Controls how much of the portal has resolved during the arrival shot.
## `progress` is intentionally independent from visibility so the director can
## drive it from the frog's fall curve.
func set_progress(progress: float) -> void:
	_progress = clampf(progress, 0.0, 1.0)

## Closes and hides the portal after the landing impact.  The visual eases out;
## callers do not need to await a tween.
func close() -> void:
	_target_open = 0.0

func is_open() -> bool:
	return visible and _open_amount > 0.05

func _build() -> void:
	if _built:
		return
	_built = true
	# TorusMesh is authored in the XZ plane around the Y axis.  Rotate each ring
	# so its aperture faces the side camera (normal along +Z).
	for i in range(RING_COLORS.size()):
		var ring := MeshInstance3D.new()
		ring.name = "Ring_%02d" % i
		var mesh := TorusMesh.new()
		mesh.inner_radius = ring_radius - ring_thickness
		mesh.outer_radius = ring_radius + ring_thickness
		mesh.rings = 48
		mesh.ring_segments = 12
		ring.mesh = mesh
		ring.rotation.x = PI * 0.5
		var material := _make_material(RING_COLORS[i], 1.8 - float(i) * 0.25)
		ring.material_override = material
		add_child(ring)
		_rings.append(ring)
		_ring_materials.append(material)

	# A thin translucent core gives the hole a readable depth without hiding the
	# frog.  It is rendered behind the rings and has no collision.
	_core = MeshInstance3D.new()
	_core.name = "PortalCore"
	var core_mesh := QuadMesh.new()
	core_mesh.size = Vector2(ring_radius * 1.72, ring_radius * 1.72)
	_core.mesh = core_mesh
	_core.rotation = Vector3.ZERO
	_core_material = _make_material(Color("172b49"), 0.35)
	_core_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_core_material.albedo_color.a = 0.32
	_core_material.no_depth_test = false
	_core_material.render_priority = -1
	_core.material_override = _core_material
	_core.position.z = 0.06
	add_child(_core)

	_light = OmniLight3D.new()
	_light.name = "PortalLight"
	_light.light_color = Color("6de8e0")
	_light.light_energy = 0.0
	_light.omni_range = 4.5
	_light.position = Vector3(0, 0, 0.35)
	add_child(_light)

func _make_material(color: Color, energy: float) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.albedo_color = color
	material.emission_enabled = true
	material.emission = color
	material.emission_energy_multiplier = energy
	material.roughness = 0.25
	return material
