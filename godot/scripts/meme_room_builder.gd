extends Node

func build(owner: Node3D) -> Node3D:
	var room := Node3D.new(); room.name = "MemeRoom"; owner.add_child(room)
	var room_bounds:=Node3D.new(); room_bounds.name="RoomBounds"; room.add_child(room_bounds)
	var architecture:=Node3D.new(); architecture.name="Architecture"; room.add_child(architecture)
	var upper:=Node3D.new(); upper.name="UpperInfrastructure"; room.add_child(upper)
	var main_prop:=Node3D.new(); main_prop.name="MainProp"; room.add_child(main_prop)
	var stages_root:=Node3D.new(); stages_root.name="MemeStages"; room.add_child(stages_root)
	var background:=Node3D.new(); background.name="BackgroundProps"; room.add_child(background)
	var foreground:=Node3D.new(); foreground.name="ForegroundProps"; room.add_child(foreground)
	var lighting:=Node3D.new(); lighting.name="Lighting"; room.add_child(lighting)
	var fx:=Node3D.new(); fx.name="FX"; room.add_child(fx)
	var interaction:=Node3D.new(); interaction.name="Interaction"; room.add_child(interaction)
	# Authoring dimensions (metres): length X=18, depth Z=10, height Y=9.
	room.set_meta("length_m", 18.0)
	room.set_meta("depth_m", 10.0)
	room.set_meta("height_m", 9.0)
	var wall_mat := StandardMaterial3D.new(); wall_mat.albedo_color=Color("121d26"); wall_mat.roughness=.9
	var floor_body := StaticBody3D.new(); floor_body.name="GameplayBoundary"; room.add_child(floor_body)
	var floor_shape := CollisionShape3D.new(); var floor_box:=BoxShape3D.new(); floor_box.size=Vector3(18,.25,10); floor_shape.shape=floor_box; floor_shape.position=Vector3(0,-.18,0); floor_body.add_child(floor_shape)
	# Open-sided composition: one heavy archive wall and a readable silhouette line,
	# leaving the player-facing sides open like the reference galley scene.
	var wall_data := [["MemeRoom_BackWall", Vector3(0,4.5,-5), Vector3(18,9,.35)]]
	for item in wall_data:
		var wall := MeshInstance3D.new(); wall.name=item[0]; var wall_mesh:=BoxMesh.new(); wall_mesh.size=item[2]; wall.mesh=wall_mesh; wall.position=item[1]; wall.material_override=wall_mat; room.add_child(wall)
		var wall_shape := CollisionShape3D.new(); var wall_box:=BoxShape3D.new(); wall_box.size=item[2]; wall_shape.shape=wall_box; var wall_body:=StaticBody3D.new(); wall_body.name=item[0]+"Collision"; wall_body.position=item[1]; wall_body.add_child(wall_shape); room.add_child(wall_body)
	# Central suspended screen for the combined memory sequence.
	var central_screen:=MeshInstance3D.new(); central_screen.name="CentralScreen"; var screen_mesh:=BoxMesh.new(); screen_mesh.size=Vector3(5.2,2.4,.12); central_screen.mesh=screen_mesh; central_screen.position=Vector3(0,6.1,-4.72); var screen_mat:=StandardMaterial3D.new(); screen_mat.albedo_color=Color("17343b"); screen_mat.emission_enabled=true; screen_mat.emission=Color("4ba9a7"); screen_mat.emission_energy_multiplier=.45; central_screen.material_override=screen_mat; upper.add_child(central_screen)
	# Little Nightmares-inspired depth layers: high transoms, braces, and a warm/cool light split.
	var ceiling := MeshInstance3D.new(); ceiling.name="MemeRoom_Ceiling"; var ceiling_mesh:=BoxMesh.new(); ceiling_mesh.size=Vector3(18,.3,10); ceiling.mesh=ceiling_mesh; ceiling.position=Vector3(0,9,0); ceiling.material_override=wall_mat; room.add_child(ceiling)
	for x in [-6.0, 0.0, 6.0]:
		var beam := MeshInstance3D.new(); beam.name="OverheadBeam"; var beam_mesh:=BoxMesh.new(); beam_mesh.size=Vector3(.18,4,.35); beam.mesh=beam_mesh; beam.position=Vector3(x,7,-4.5); beam.rotation.z=.12 if x != 0 else 0; beam.material_override=wall_mat; room.add_child(beam)
	var cool := OmniLight3D.new(); cool.name="ColdFill"; cool.light_color=Color("6ea7c8"); cool.light_energy=2.0; cool.omni_range=14; cool.position=Vector3(0,7,1); room.add_child(cool)
	var warm := OmniLight3D.new(); warm.name="WarmMemoryLamp"; warm.light_color=Color("f0a15a"); warm.light_energy=1.8; warm.omni_range=6; warm.position=Vector3(0,3,-3); room.add_child(warm)
	# Layered set dressing: worn floor plates, cable runs and a low foreground silhouette.
	var floor_mat := StandardMaterial3D.new(); floor_mat.albedo_color=Color("26343a"); floor_mat.roughness=.95
	for x in range(-4, 5, 2):
		for z in range(-3, 4, 2):
			var plate := MeshInstance3D.new(); plate.name="WornFloorPlate"; var plate_mesh:=BoxMesh.new(); plate_mesh.size=Vector3(1.8,.08,1.8); plate.mesh=plate_mesh; plate.position=Vector3(x,-.08,z); plate.material_override=floor_mat; room.add_child(plate)
	for z in [-3.8]:
		var pipe := MeshInstance3D.new(); pipe.name="ArchivePipe"; var pipe_mesh:=CylinderMesh.new(); pipe_mesh.top_radius=.08; pipe_mesh.bottom_radius=.08; pipe_mesh.height=16; pipe.mesh=pipe_mesh; pipe.rotation_degrees=Vector3(0,0,90); pipe.position=Vector3(0,1.1,z); pipe.material_override=wall_mat; room.add_child(pipe)
	for x in [-6.0, 0.0, 6.0]:
		var pendant := OmniLight3D.new(); pendant.name="Pendant_%s" % str(x); pendant.light_color=Color("f6c27e"); pendant.light_energy=2.4; pendant.omni_range=4.5; pendant.position=Vector3(x,6.8,-1.6); room.add_child(pendant)
		var shade := MeshInstance3D.new(); shade.name="PendantShade"; var shade_mesh:=CylinderMesh.new(); shade_mesh.top_radius=.12; shade_mesh.bottom_radius=.38; shade_mesh.height=.28; shade.mesh=shade_mesh; shade.position=pendant.position+Vector3(0,-.35,0); shade.material_override=wall_mat; room.add_child(shade)
	var dust := GPUParticles3D.new(); dust.name="ArchiveDust"; dust.amount=180; dust.lifetime=7.0; dust.visibility_aabb=AABB(Vector3(-9,0,-5),Vector3(18,9,10)); var dust_mesh:=QuadMesh.new(); dust_mesh.size=Vector2(.018,.018); var dust_mat:=StandardMaterial3D.new(); dust_mat.albedo_color=Color(0.7,0.85,0.9,.22); dust_mat.transparency=BaseMaterial3D.TRANSPARENCY_ALPHA; dust_mesh.material=dust_mat; dust.draw_pass_1=dust_mesh; var process:=ParticleProcessMaterial.new(); process.emission_shape=ParticleProcessMaterial.EMISSION_SHAPE_BOX; process.emission_box_extents=Vector3(8,3,4); process.direction=Vector3(0,.15,0); process.spread=25; process.initial_velocity_min=.03; process.initial_velocity_max=.12; process.gravity=Vector3(0,-.01,0); dust.process_material=process; dust.position=Vector3(0,1,0); room.add_child(dust)
	var info := [ ["篮球梗·第一次被看见", Vector3(-6,0,0), Color("65b8ff")], ["新宝岛式舞蹈·被模仿", Vector3(0,0,-1), Color("ef6fae")], ["热搜梗·被覆盖", Vector3(6,0,0), Color("76e0c4")] ]
	for item in info:
		var area := Area3D.new(); area.name = ["BasketballTrigger","DanceTrigger","SearchTrigger"][info.find(item)]; area.position = Vector3(item[1].x,0,-3.8); stages_root.add_child(area)
		var shape := CollisionShape3D.new(); var sphere := SphereShape3D.new(); sphere.radius = 2.3; shape.shape = sphere; area.add_child(shape)
		var label := Label3D.new(); label.text = item[0]; label.position = Vector3(0,2.5,0); label.modulate = item[2]; label.pixel_size = .006; area.add_child(label)
		var light := OmniLight3D.new(); light.light_color = item[2]; light.light_energy = 1.6; light.omni_range = 4; light.position.y = 1.6; area.add_child(light)
		var stage := MeshInstance3D.new(); stage.name="StagePlatform"; var stage_mesh:=BoxMesh.new(); stage_mesh.size=Vector3(4.2,.22,2.2); stage.mesh=stage_mesh; stage.position=Vector3(item[1].x, .12, -3.7); var stage_mat:=StandardMaterial3D.new(); stage_mat.albedo_color=item[2].darkened(.65); stage_mat.metallic=.35; stage.material_override=stage_mat; stages_root.add_child(stage)
		var backdrop := MeshInstance3D.new(); backdrop.name="StageBackdrop"; var backdrop_mesh:=BoxMesh.new(); backdrop_mesh.size=Vector3(4.4,3.8,.18); backdrop.mesh=backdrop_mesh; backdrop.position=Vector3(item[1].x,2.0,-4.72); var backdrop_mat:=StandardMaterial3D.new(); backdrop_mat.albedo_color=item[2].darkened(.8); backdrop_mat.emission_enabled=true; backdrop_mat.emission=item[2]; backdrop_mat.emission_energy_multiplier=.25; backdrop.material_override=backdrop_mat; stages_root.add_child(backdrop)
	# A large central archive table divides the room into a narrow entry and a rear work zone.
	var divider := MeshInstance3D.new(); divider.name="MemoryArchiveTable"; var divider_mesh:=BoxMesh.new(); divider_mesh.size=Vector3(7.2,1.2,1.7); divider.mesh=divider_mesh; divider.position=Vector3(0,.6,-.6); var divider_mat:=StandardMaterial3D.new(); divider_mat.albedo_color=Color("26333a"); divider_mat.metallic=.45; divider_mat.roughness=.72; divider.material_override=divider_mat; main_prop.add_child(divider)
	var divider_body:=StaticBody3D.new(); divider_body.name="MemoryArchiveTableCollision"; divider_body.position=divider.position; var divider_shape:=CollisionShape3D.new(); var divider_box:=BoxShape3D.new(); divider_box.size=Vector3(7.2,1.2,1.7); divider_shape.shape=divider_box; divider_body.add_child(divider_shape); main_prop.add_child(divider_body)
	for x in [-3.0,3.0]:
		var crate := MeshInstance3D.new(); crate.name="ArchiveCrate"; var crate_mesh:=BoxMesh.new(); crate_mesh.size=Vector3(1.0,1.0,.9); crate.mesh=crate_mesh; crate.position=Vector3(x, .5, 2.8); crate.material_override=wall_mat; foreground.add_child(crate)
	var center := MeshInstance3D.new(); center.name = "MemoryArchiveTable"; center.position = Vector3(0,.2,2); var mesh := CylinderMesh.new(); mesh.top_radius=1.2; mesh.bottom_radius=1.4; mesh.height=.4; center.mesh=mesh; var table_mat := StandardMaterial3D.new(); table_mat.albedo_color=Color("273841"); center.material_override=table_mat; room.add_child(center)
	var script := preload("res://scripts/meme_room.gd").new(); script.name="MemeRoomLogic"; room.add_child(script); script.setup(owner, room); script.set_active(false); room.visible=false
	return room
