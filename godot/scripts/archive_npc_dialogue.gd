extends Node
## Runtime NPCs and dialogue gates for the archive corridor: one keeper stands
## in front of each of the three cabinets, and finishing their dialogue opens
## the memory portal (tunnel) for that cabinet.
## The component is intentionally independent from archive_interaction.gd so both
## systems can be enabled together without changing the existing memory puzzles.
signal dialogue_started(id: String)
signal dialogue_line(id: String, line_index: int)
signal dialogue_finished(id: String)
signal portal_ready(id: String, portal: Node3D)
signal portal_entered(id: String)

var world: Node3D
var player: CharacterBody3D
var layer: CanvasLayer
var prompt: Label
var dialogue_card: Label
var active := false
var active_id := ""
var active_line := -1
var portals: Dictionary = {}
var npc_groups: Dictionary = {}
var portal_consumed: Dictionary = {}
var line_delay := 0.0
var dialogue_button: Button

var groups := [
    {"id":"seen_2016", "pos":Vector3(-1.0, 0.0, 0.55), "names":["档案员"], "lines":["这里保存着第一次被看见的那一秒。", "没有热搜，也没有推荐，只有一个人把它转给了另一个人。", "如果你准备好了，就让这段记忆重新亮起来。"]},
    {"id":"imitated_2020", "pos":Vector3(11.4, 0.0, 0.55), "names":["节拍记录员"], "lines":["原来的动作只有三拍，后来每个人都留下了自己的版本。", "别急着找谁最像，先听见最初的节拍。", "对话结束后，门会在屏幕后面出现。"]},
    {"id":"covered_2024", "pos":Vector3(23.8, 0.0, 0.55), "names":["刷新管理员"], "lines":["新内容会把旧内容推到屏幕边缘。", "但只要有人按下暂停，它仍然能回到中央。", "听完这段话，去看看出口前的旧版本。"]}
]

func setup(owner: Node3D) -> void:
    world = owner
    player = owner.player
    layer = owner.get_node_or_null("Interface") as CanvasLayer
    if layer == null:
        layer = CanvasLayer.new()
        layer.name = "NPCDialogueUI"
        owner.add_child(layer)
    prompt = Label.new()
    prompt.position = Vector2(38, 530)
    prompt.add_theme_font_size_override("font_size", 18)
    layer.add_child(prompt)
    dialogue_card = Label.new()
    dialogue_card.position = Vector2(38, 104)
    dialogue_card.size = Vector2(850, 130)
    dialogue_card.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
    dialogue_card.add_theme_font_size_override("font_size", 21)
    layer.add_child(dialogue_card)
    dialogue_button = Button.new()
    dialogue_button.position = Vector2(38, 576)
    dialogue_button.custom_minimum_size = Vector2(225, 42)
    dialogue_button.focus_mode = Control.FOCUS_NONE
    dialogue_button.pressed.connect(_interact)
    layer.add_child(dialogue_button)
    _build_groups()
    set_active(false)

func _build_groups() -> void:
    var root := world.archive_root.get_node_or_null("NPCGroups") as Node3D
    if root == null:
        root = Node3D.new()
        root.name = "NPCGroups"
        world.archive_root.add_child(root)
    for group in groups:
        var group_root := Node3D.new()
        group_root.name = "NPCGroup_%s" % String(group.id)
        group_root.position = group.pos
        group_root.position.z = -0.65
        root.add_child(group_root)
        var members: Array[Node3D] = []
        var names: Array = group.names
        for i in range(names.size()):
            var npc := _make_npc(String(names[i]), i, names.size())
            group_root.add_child(npc)
            members.append(npc)
        npc_groups[String(group.id)] = {"root":group_root, "members":members, "data":group}

func _make_npc(label_text: String, index: int, total: int) -> Node3D:
    var npc := Node3D.new()
    npc.name = "NPC_%s" % label_text.replace(" ", "_")
    npc.position = Vector3((index - float(total - 1) * 0.5) * 0.62, 0.0, 0.0)
    var body := MeshInstance3D.new()
    var capsule := CapsuleMesh.new()
    capsule.radius = 0.22
    capsule.height = 1.05
    body.mesh = capsule
    var mat := StandardMaterial3D.new()
    mat.albedo_color = Color("262054") if index % 2 == 0 else Color("4a1a48")
    mat.roughness = 0.82
    body.material_override = mat
    body.position.y = 0.65
    npc.add_child(body)
    var head := MeshInstance3D.new()
    var head_mesh := SphereMesh.new()
    head_mesh.radius = 0.25
    head_mesh.height = 0.5
    head.mesh = head_mesh
    head.position = Vector3(0, 1.35, 0)
    var head_mat := StandardMaterial3D.new()
    head_mat.albedo_color = Color("c4d0f2")
    head_mat.roughness = 0.7
    head.material_override = head_mat
    npc.add_child(head)
    for side in [-1.0, 1.0]:
        var arm := _part(npc, "LeftArm" if side < 0 else "RightArm", Vector3(side * 0.26, 0.85, 0.02), Vector3(0.12, 0.54, 0.15), mat)
        arm.rotation.z = side * 0.13
        _part(npc, "Leg", Vector3(side * 0.11, 0.2, 0), Vector3(0.15, 0.4, 0.2), mat)
    var face_mat := StandardMaterial3D.new()
    face_mat.albedo_color = Color("3ee6ff")
    face_mat.emission_enabled = true
    face_mat.emission = face_mat.albedo_color
    face_mat.emission_energy_multiplier = 1.4
    for side in [-1.0, 1.0]:
        _part(npc, "PixelEye", Vector3(side * 0.08, 1.39, 0.227), Vector3(0.04, 0.055, 0.032), face_mat)
    _part(npc, "ArchiveBadge", Vector3(0.1, 0.83, 0.22), Vector3(0.09, 0.12, 0.018), face_mat)
    var tag := Label3D.new()
    tag.text = label_text
    tag.position = Vector3(0, 1.8, 0)
    tag.font_size = 20
    tag.pixel_size = 0.004
    tag.modulate = Color("8cf2ff")
    npc.add_child(tag)
    return npc

func _part(parent: Node3D, title: String, position: Vector3, size: Vector3, material: StandardMaterial3D) -> MeshInstance3D:
    var mesh_node := MeshInstance3D.new()
    mesh_node.name = title
    mesh_node.position = position
    var mesh := BoxMesh.new()
    mesh.size = size
    mesh_node.mesh = mesh
    mesh_node.material_override = material
    parent.add_child(mesh_node)
    return mesh_node

func set_active(value: bool) -> void:
    active = value
    set_process(value)
    if prompt:
        prompt.visible = value
    if dialogue_card:
        dialogue_card.visible = value and active_id != ""
    if dialogue_button:
        dialogue_button.visible = false
    for entry in npc_groups.values():
        var root: Node3D = entry.root
        root.visible = value

func _input(event: InputEvent) -> void:
    if not active or player == null:
        return
    if event is InputEventKey and event.pressed and not event.echo:
        if event.is_action_pressed("interact"):
            if active_id != "" or _nearest_group() != "":
                get_viewport().set_input_as_handled()
                _interact()

func _process(delta: float) -> void:
    if not active or player == null:
        return
    line_delay = maxf(0.0, line_delay - delta)
    for entry in npc_groups.values():
        var members: Array = entry.members
        for i in range(members.size()):
            var npc: Node3D = members[i]
            var phase := Time.get_ticks_msec() * 0.0014 + i * 1.7
            npc.rotation.z = sin(phase) * 0.015
            npc.get_node("RightArm").rotation.x = sin(phase) * 0.1
    dialogue_button.visible = active_id != ""
    if active_id != "":
        _update_dialogue_prompt()
        return
    var nearest := _nearest_group()
    if nearest != "":
        if portals.has(nearest) and _distance_to_group(nearest) <= 2.5:
            prompt.text = "E 进入记忆传送门"
        else:
            prompt.text = "E 与档案员交谈"
        dialogue_button.visible = true
        dialogue_button.text = prompt.text
    else:
        prompt.text = ""
    for id in portals.keys():
        var portal: Node3D = portals[id]
        var ring := portal.get_node("SignalRing") as Node3D
        ring.rotate_y(delta * 0.35)
        var pulse := 1.0 + sin(Time.get_ticks_msec() * 0.004) * 0.06
        portal.scale = Vector3.ONE * pulse

func _interact() -> void:
    if line_delay > 0.0:
        return
    if active_id != "":
        _advance_dialogue()
        return
    var nearest := _nearest_group()
    if nearest == "":
        return
    if portals.has(nearest) and _distance_to_group(nearest) <= 2.5:
        _enter_portal(nearest)
        return
    _start_dialogue(nearest)

func _start_dialogue(id: String) -> void:
    active_id = id
    active_line = 0
    dialogue_started.emit(id)
    _show_line()

func _advance_dialogue() -> void:
    var data: Dictionary = npc_groups[active_id].data
    active_line += 1
    if active_line >= data.lines.size():
        _finish_dialogue()
    else:
        _show_line()

func _show_line() -> void:
    var data: Dictionary = npc_groups[active_id].data
    var speaker := String(data.names[min(active_line, data.names.size() - 1)])
    var line := String(data.lines[active_line])
    dialogue_card.text = "%s\n%s\n\nE  继续" % [speaker, line]
    dialogue_card.visible = true
    dialogue_button.visible = true
    dialogue_button.text = "E  下一句" if active_line < data.lines.size() - 1 else "E  打开记忆通道"
    dialogue_line.emit(active_id, active_line)
    line_delay = 0.18

func _update_dialogue_prompt() -> void:
    var data: Dictionary = npc_groups[active_id].data
    prompt.text = "%s · %d / %d" % [String(data.id), active_line + 1, data.lines.size()]

func _finish_dialogue() -> void:
    var id := active_id
    active_id = ""
    active_line = -1
    dialogue_card.text = ""
    dialogue_card.visible = false
    dialogue_button.visible = false
    dialogue_finished.emit(id)
    _spawn_portal(id)

func _spawn_portal(id: String) -> void:
    if portals.has(id):
        return
    var entry: Dictionary = npc_groups[id]
    var portal := Node3D.new()
    portal.name = "MemoryPortal_%s" % id
    portal.position = entry.root.position + Vector3(0, 1.25, 0.0)
    world.archive_root.add_child(portal)
    var ring := MeshInstance3D.new()
    ring.name = "SignalRing"
    var torus := TorusMesh.new()
    torus.inner_radius = 0.68
    torus.outer_radius = 0.76
    ring.mesh = torus
    ring.rotation.x = PI * 0.5
    ring.scale = Vector3(1, 1, 1.5)
    var ring_mat := StandardMaterial3D.new()
    ring_mat.albedo_color = Color("55e8ff")
    ring_mat.emission_enabled = true
    ring_mat.emission = Color("38b8e8")
    ring_mat.emission_energy_multiplier = 3.6
    ring.material_override = ring_mat
    portal.add_child(ring)
    var core := MeshInstance3D.new()
    var plane := QuadMesh.new()
    plane.size = Vector2(1.22, 2.15)
    core.mesh = plane
    core.rotation.x = PI * 0.5
    var core_mat := StandardMaterial3D.new()
    core_mat.albedo_color = Color(0.1, 0.06, 0.32, 0.68)
    core_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    core_mat.emission_enabled = true
    core_mat.emission = Color("5a2bd8")
    core_mat.emission_energy_multiplier = 1.6
    core.material_override = core_mat
    core_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
    portal.add_child(core)
    var label := Label3D.new()
    label.text = "记忆通道  //  E 进入"
    label.position = Vector3(0, 1.35, 0)
    label.font_size = 22
    label.pixel_size = 0.005
    label.modulate = Color("9ff0ff")
    portal.add_child(label)
    var light := OmniLight3D.new()
    light.light_color = Color("55d8ff")
    light.light_energy = 0.9
    light.omni_range = 2.8
    portal.add_child(light)
    var trigger := Area3D.new()
    trigger.name = "PortalTrigger"
    trigger.monitoring = true
    var trigger_shape := CollisionShape3D.new()
    var capsule := CapsuleShape3D.new()
    capsule.radius = 0.82
    capsule.height = 2.05
    trigger_shape.shape = capsule
    trigger_shape.position.y = 1.0
    trigger.add_child(trigger_shape)
    trigger.body_entered.connect(func(body: Node3D):
        if body == player:
            _enter_portal(id)
    )
    portal.add_child(trigger)
    var members: Array = entry.members
    for i in range(members.size()):
        var npc: Node3D = members[i]
        var tween := create_tween()
        var side := -1.0 if i % 2 == 0 else 1.0
        tween.tween_property(npc, "position", Vector3(side * (1.05 + floori(i / 2.0) * 0.55), 0, -0.3), 0.7).set_trans(Tween.TRANS_SINE)
    portals[id] = portal
    portal_ready.emit(id, portal)

func _enter_portal(id: String) -> void:
    if portal_consumed.has(id):
        return
    portal_consumed[id] = true
    portal_entered.emit(id)

func _nearest_group() -> String:
    var best_id := ""
    var best := 2.5
    for group in groups:
        var id := String(group.id)
        var distance := _distance_to_group(id)
        if distance < best:
            best = distance
            best_id = id
    return best_id

func _distance_to_group(id: String) -> float:
    if not npc_groups.has(id) or player == null:
        return INF
    var root: Node3D = npc_groups[id].root
    return player.global_position.distance_to(root.global_position)

func get_portal(id: String) -> Node3D:
    return portals.get(id) as Node3D
