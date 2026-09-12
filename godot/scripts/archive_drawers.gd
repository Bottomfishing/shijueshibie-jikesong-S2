extends Node3D
## Runtime drawer fronts for the three archive cabinets.
## Kept separate from the baked corridor scene so the cabinet meshes stay reusable.

const CABINET_X := [-1.0, 11.4, 23.8]
const CABINET_IDS := ["seen_2016", "imitated_2020", "covered_2024"]
const ROW_Y := [0.8, 3.84, 1.56]
const CLOSED_Z := -2.50
const OPEN_Z := -1.92

const HANDLE_NEON := {"seen_2016": "3ee6ff", "imitated_2020": "ff4fd8", "covered_2024": "ffa040"}

var _drawers: Dictionary = {}
var _tweens: Dictionary = {}

func setup(archive_root: Node3D) -> void:
	position = Vector3.ZERO
	name = "ArchiveDrawers"
	for i in range(CABINET_IDS.size()):
		var id: String = CABINET_IDS[i]
		var drawer := Node3D.new()
		drawer.name = "Drawer_%s" % id
		drawer.position = Vector3(CABINET_X[i], ROW_Y[i], CLOSED_Z)
		var panel := MeshInstance3D.new()
		panel.name = "Front"
		var panel_mesh := BoxMesh.new()
		panel_mesh.size = Vector3(2.45, 0.54, 0.16)
		panel.mesh = panel_mesh
		var panel_mat := StandardMaterial3D.new()
		panel_mat.albedo_color = Color("1b1533")
		panel_mat.metallic = 0.25
		panel_mat.roughness = 0.68
		panel.material_override = panel_mat
		drawer.add_child(panel)
		var handle := MeshInstance3D.new()
		handle.name = "Handle"
		handle.position = Vector3(0, 0, 0.11)
		var handle_mesh := BoxMesh.new()
		handle_mesh.size = Vector3(0.72, 0.07, 0.08)
		handle.mesh = handle_mesh
		var handle_mat := StandardMaterial3D.new()
		handle_mat.albedo_color = Color(String(HANDLE_NEON[id]))
		handle_mat.metallic = 0.65
		handle_mat.emission_enabled = true
		handle_mat.emission = handle_mat.albedo_color
		handle_mat.emission_energy_multiplier = 1.6
		handle.material_override = handle_mat
		drawer.add_child(handle)
		add_child(drawer)
		_drawers[id] = drawer
	archive_root.add_child(self)

func open_for_id(id: String) -> void:
	var drawer := _drawers.get(id) as Node3D
	if drawer == null:
		return
	if _tweens.has(id):
		(_tweens[id] as Tween).kill()
	var tween := create_tween()
	tween.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(drawer, "position:z", OPEN_Z, 0.72)
	_tweens[id] = tween

func close_for_id(id: String) -> void:
	var drawer := _drawers.get(id) as Node3D
	if drawer == null:
		return
	if _tweens.has(id):
		(_tweens[id] as Tween).kill()
	var tween := create_tween()
	tween.set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.tween_property(drawer, "position:z", CLOSED_Z, 0.5)
	_tweens[id] = tween
