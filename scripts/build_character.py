"""Build an editable reference-inspired character and a game-ready GLB in Blender."""
import bpy
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'godot/assets/character'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = ROOT / 'art/character'
SOURCE.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

def material(name, color, roughness=.6):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = roughness
    return m

yellow = material('Warm butter yellow', (.82, .43, .025))
cream = material('Cream belly', (.88, .62, .25))
brown = material('Brown hands and feet', (.11, .060, .016))
green = material('Olive green iris', (.17, .32, .065), .45)
black = material('Deep black pupil', (.006, .009, .004), .14)
mouthmat = material('Mouth crease', (.085, .037, .008))

def sphere(name, pos, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, location=pos)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    for poly in obj.data.polygons: poly.use_smooth = True
    return obj

def fuse(objects, name, mat, voxel=.027):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    rem = obj.modifiers.new('Continuous sculpted surface', 'REMESH')
    rem.mode = 'VOXEL'
    rem.voxel_size = voxel
    bpy.ops.object.modifier_apply(modifier=rem.name)
    smooth = obj.modifiers.new('Soften joints', 'SMOOTH')
    smooth.factor = 1.2
    smooth.iterations = 14
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    dec = obj.modifiers.new('Game mesh', 'DECIMATE')
    dec.ratio = .38
    bpy.ops.object.modifier_apply(modifier=dec.name)
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for poly in obj.data.polygons: poly.use_smooth = True
    return obj

# Front is -Y. Profile rings form one pear-shaped torso/neck/head surface.
profile = [(.83,.08,.08,0),(1.0,.48,.40,0),(1.3,.69,.51,0),
           (1.65,.75,.55,0),(2.0,.65,.47,0),(2.35,.49,.35,.015),
           (2.63,.34,.28,.015),(2.88,.31,.27,0),(3.10,.25,.23,0),
           (3.24,.13,.13,0),(3.28,.012,.012,0)]
verts, faces = [], []
N = 64
for z, rx, ry, cy in profile:
    for i in range(N):
        a = 2*math.pi*i/N
        verts.append((rx*math.cos(a), cy+ry*math.sin(a), z))
for j in range(len(profile)-1):
    for i in range(N):
        a=j*N+i; b=j*N+(i+1)%N
        faces.append((a,b,b+N,a+N))
faces += [tuple(reversed(range(N))), tuple((len(profile)-1)*N+i for i in range(N))]
mesh=bpy.data.meshes.new('Body profile'); mesh.from_pydata(verts, [], faces); mesh.update()
body=bpy.data.objects.new('Body',mesh); bpy.context.collection.objects.link(body)
bpy.context.view_layer.objects.active=body; body.select_set(True)
sub=body.modifiers.new('Rounded silhouette','SUBSURF'); sub.levels=2
bpy.ops.object.modifier_apply(modifier=sub.name)
parts=[body]
for side in [-1,1]:
    parts.append(sphere('Thigh',(side*.29,0,.91),(.22,.26,.54),yellow))
    parts.append(sphere('Calf',(side*.29,-.015,.43),(.125,.145,.36),yellow))
    # Rounded shoulder descends to elbow, then curls towards belly.
    for pos,scale in [((side*.46,0,2.12),(.20,.22,.38)),
                      ((side*.64,-.075,1.95),(.17,.19,.34)),
                      ((side*.62,-.24,1.77),(.17,.19,.22)),
                      ((side*.49,-.40,1.72),(.23,.15,.15))]:
        parts.append(sphere('Arm',pos,scale,yellow))
body=fuse(parts,'Yellow continuous body',yellow)

# A curved patch follows the actual belly surface rather than a floating sphere.
patch_v=[]; patch_f=[]
for ring in range(13):
    r=ring/12
    for i in range(64):
        a=2*math.pi*i/64
        x=.44*r*math.cos(a); z=1.67+.54*r*math.sin(a)
        hit,loc,normal,index=body.ray_cast(body.matrix_world.inverted() @ Vector((x,-2,z)),Vector((0,1,0)))
        y=(body.matrix_world @ loc).y-.008 if hit else -.4
        patch_v.append((x,y,z))
for j in range(12):
    for i in range(64):
        a=j*64+i;b=j*64+(i+1)%64;patch_f.append((a,a+64,b+64,b))
mesh=bpy.data.meshes.new('Fitted belly');mesh.from_pydata(patch_v,[],patch_f);mesh.update()
patch=bpy.data.objects.new('Cream belly patch',mesh);bpy.context.collection.objects.link(patch);patch.data.materials.append(cream)
for p in mesh.polygons:p.use_smooth=True

for s in [-1,1]:
    handparts=[sphere('Palm',(s*.33,-.515,1.69),(.16,.11,.19),brown)]
    for i in range(3):
        handparts.append(sphere('Finger',(s*(.23+i*.016),-.57,1.57+i*.083),(.15,.069,.052),brown))
    thumb=sphere('Thumb',(s*.27,-.575,1.84),(.10,.072,.058),brown)
    thumb.rotation_euler.y=s*.25;handparts.append(thumb)
    fuse(handparts,('Left' if s<0 else 'Right')+' hand',brown,.012)
    footparts=[sphere('Foot',(s*.29,-.11,.14),(.16,.27,.13),brown)]
    for i in range(3):
        footparts.append(sphere('Toe',(s*.29+(i-1)*.10,-.29,.105),(.072,.17,.084),brown))
    fuse(footparts,('Left' if s<0 else 'Right')+' foot',brown,.012)
    iris=sphere('Green eye',(s*.202,-.225,2.96),(.114,.073,.128),green)
    iris.rotation_euler.z=s*.32
    sphere('Black pupil',(s*.204,-.287,2.96),(.080,.026,.091),black)
    sphere('Eye highlight',(s*.183,-.311,3.001),(.018,.012,.020),cream)
sphere('Upper lip',(0,-.279,2.78),(.137,.057,.022),yellow)
sphere('Mouth line',(0,-.322,2.765),(.119,.009,.009),mouthmat)
sphere('Lower lip',(0,-.287,2.748),(.125,.04,.013),yellow)

character=list(bpy.context.scene.objects)
root=bpy.data.objects.new('Reference character',None);bpy.context.collection.objects.link(root)
for obj in character:obj.parent=root
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
for obj in character:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'yellow_character.glb'),use_selection=True,export_format='GLB')

# Studio scene is retained in the .blend; it is not exported into the game.
floor=sphere('Studio ground',(0,0,-.06),(200,200,.04),material('Backdrop',(.20,.23,.26)))
world=bpy.context.scene.world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.35,.39,.44,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.35
for pos,power,size in [((-4,-5,7),950,5),((4,-2,4),650,4),((1,4,6),1100,3)]:
    bpy.ops.object.light_add(type='AREA',location=pos);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size
    light.rotation_euler=(Vector((0,0,1.6))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(4,-7,3.3));camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,1.65))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=4.15
scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=850;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'yellow_character.blend'))
scene.render.filepath=str(OUT/'preview.png');bpy.ops.render.render(write_still=True)
print('CHARACTER_READY',OUT)
