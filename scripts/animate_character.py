"""Add opening performance morphs to the editable character; export only its hierarchy."""
import bpy
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'art/character/yellow_character.blend'))
root = bpy.data.objects['Reference character']
yellow = bpy.data.materials['Warm butter yellow']

for obj in list(root.children):
    if obj.type != 'MESH':
        continue
    if obj.data.shape_keys:
        obj.shape_key_clear()
    if obj.name.startswith('Yellow continuous body') or obj.name == 'Right hand':
        obj.shape_key_add(name='Basis')
        reach = obj.shape_key_add(name='Reach')
        for v in reach.data:
            p = obj.matrix_world @ v.co
            if obj.name == 'Right hand':
                weight = 1.0
            else:
                def smooth(a, b, x):
                    t = max(0, min(1, (x-a)/(b-a)))
                    return t*t*(3-2*t)
                weight = smooth(.15, .48, p.x) * smooth(1.3, 1.65, p.z)
                weight *= 1-smooth(1.85, 2.45, p.z)
                weight *= 1-smooth(-.35, .12, p.y)
            delta = Vector((.10, -.35, .22)) * weight
            v.co += obj.matrix_world.inverted().to_3x3() @ delta

# Skin lids cover each eye as a single continuous soft surface when closed.
for side in [-1, 1]:
    name = 'Eyelid_' + str(side)
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, location=(side*.202, -.309, 2.96))
    lid = bpy.context.object
    lid.name = name
    lid.scale = (.121, .042, .139)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    lid.data.materials.append(yellow)
    lid.parent = root
    for face in lid.data.polygons:
        face.use_smooth = True
    # Open lids retract inside the head; Blink expands to cover the eye.
    closed = [v.co.copy() for v in lid.data.vertices]
    for v in lid.data.vertices:
        v.co.z = v.co.z * .08 + .11
        v.co.y += .11
    lid.shape_key_add(name='Basis')
    blink = lid.shape_key_add(name='Blink')
    for v, position in zip(blink.data, closed):
        v.co = position

bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
for obj in root.children:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'godot/assets/character/yellow_character.glb'), use_selection=True, export_format='GLB', export_morph=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'art/character/yellow_character.blend'))
print('Opening morphs exported: Blink, Reach')
