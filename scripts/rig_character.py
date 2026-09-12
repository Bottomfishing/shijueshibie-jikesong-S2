import bpy
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT / "art/character/yellow_character.blend"))
root = bpy.data.objects["Reference character"]
for obj in list(bpy.data.objects):
    if obj.type == "ARMATURE": bpy.data.objects.remove(obj, do_unlink=True)
bpy.ops.object.armature_add(location=(0,0,0))
arm = bpy.context.object
arm.name = "MilkFrog_Rig"
arm.data.name = "MilkFrog_Skeleton"
bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones
for old in list(eb): eb.remove(old)
def add(name, head, tail, parent=None):
    bone = eb.new(name); bone.head=head; bone.tail=tail
    if parent: bone.parent=eb.get(parent)
    return bone
add("root", (0,0,.1), (0,0,1))
add("spine", (0,0,1), (0,0,2.3), "root")
add("head", (0,0,2.3), (0,0,3.2), "spine")
for side, prefix in [(-1,"L"),(1,"R")]:
    add(prefix+"_arm", (side*.25,0,2.1), (side*.6,0,1.8), "spine")
    add(prefix+"_hand", (side*.6,0,1.8), (side*.5,-.3,1.6), prefix+"_arm")
    add(prefix+"_thigh", (side*.25,0,1), (side*.3,0,.5), "root")
    add(prefix+"_shin", (side*.3,0,.5), (side*.29,0,.15), prefix+"_thigh")
    add(prefix+"_foot", (side*.29,0,.15), (side*.29,-.3,.1), prefix+"_shin")
bpy.ops.object.mode_set(mode="OBJECT")
arm.parent=root
# Bind every mesh to the spine as a safe base skin; limb parts remain visible and
# can later receive refined vertex weights without changing the exported shape.
for obj in root.children:
    if obj.type != "MESH":
        continue
    obj.parent = root
    group = obj.vertex_groups.get("spine") or obj.vertex_groups.new(name="spine")
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    mod = obj.modifiers.get("MilkFrog_Rig") or obj.modifiers.new("MilkFrog_Rig", "ARMATURE")
    mod.object = arm
bpy.ops.object.select_all(action="DESELECT"); root.select_set(True); arm.select_set(True)
for obj in root.children: obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/"godot/assets/character/yellow_character.glb"), use_selection=True, export_format="GLB", export_animations=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/"art/character/yellow_character.blend"))
print("RIG_READY")
