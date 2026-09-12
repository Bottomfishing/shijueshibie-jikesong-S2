extends Node3D

## 分裂桥段：奶蛙从自己身上「啵」地弹出一只成年奶蛙（妈妈），
## 两只用无字乱语交谈几句，妈妈跳下展台跑了，奶蛙捧腹大笑。
##
## 零文字：笑点全靠情境荒诞 + 肢体夸张 + 无字乱语，不用字幕也不用对话框。
##
## 所有权边界：本脚本只拥有「妈妈」这只分身（_twin）与自己的音源。
## 主角姿态归 opening_director（读 stage 自行驱动），镜头归 camera_director。
##
## 驱动方式：由宿主显式调用 advance(delta)，不用 _process。
## 这样 headless 里手动步进 opening.update() 也能推进本演出。

const CHARACTER := preload("res://assets/character/yellow_character.glb")
const SFX_SPLIT := preload("res://assets/audio/split.wav")
const SFX_MOTHER := preload("res://assets/audio/voice_mother.wav")
const SFX_CHILD := preload("res://assets/audio/voice_child.wav")
const SFX_GAGA := preload("res://assets/audio/voice_gaga.wav")
const SFX_HOP := preload("res://assets/audio/hop_away.wav")
const SFX_LAUGH := preload("res://assets/audio/laugh.wav")

## 说话人 -> 音源。gaga 也是妈妈的嗓子，只是换了实录素材那句。
const VOICES := {
	"child": SFX_CHILD,
	"mother": SFX_MOTHER,
	"gaga": SFX_GAGA,
}
const MOTHER_VOICES := ["mother", "gaga"]

## 与 player.tscn 保持同一套视觉约定：GLB 缩放 0.5、下沉 0.625。
const VISUAL_SCALE := 0.5
const VISUAL_DROP := -0.625
const FLOOR_Y := 0.625

const SWELL_TIME := 0.8
const SPLIT_TIME := 0.7
const ABANDON_TIME := 1.5
const BEAT_TIME := 0.45
const LAUGH_TIME := 2.2

## 对话节拍：[说话人, 起始时刻]。child 追问、mother 敷衍，一问一答四轮。
## 最后一句用 gaga（1.33s 实录），比合成的 mother 长，所以 BANTER_TIME 留够尾巴。
const BANTER := [
	["child", 0.15],
	["mother", 1.05],
	["child", 1.85],
	["gaga", 2.65],
]
const BANTER_TIME := 4.15

var stage := "idle"
var stage_time := 0.0

var _twin: Node3D
var _twin_morphs: Array[MeshInstance3D] = []
var _voice: AudioStreamPlayer
var _origin := Vector3.ZERO
var _exit := Vector3.ZERO
var _split_played := false
var _spoken := -1
var _hop_played := false

func _ready() -> void:
	_voice = AudioStreamPlayer.new()
	_voice.name = "ActVoice"
	_voice.volume_db = -6.0
	add_child(_voice)

# ---------------------------------------------------------------- 对外接口

func begin(origin: Vector3) -> void:
	if stage != "idle":
		return
	_origin = origin
	# 往 -x 方向撤，避开 x=4.5 的信号屏，落到地面高度再跑出画面。
	_exit = Vector3(origin.x - 6.3, FLOOR_Y, origin.z + 0.95)
	_build_twin()
	_enter("swell")

func advance(delta: float) -> void:
	if stage == "idle" or stage == "done":
		return
	stage_time += delta
	match stage:
		"swell":
			_drive_swell()
			if stage_time >= SWELL_TIME:
				_enter("split")
		"split":
			_drive_split()
			if stage_time >= SPLIT_TIME:
				_enter("banter")
		"banter":
			_drive_banter()
			if stage_time >= BANTER_TIME:
				_enter("abandon")
		"abandon":
			_drive_abandon()
			if stage_time >= ABANDON_TIME:
				_enter("beat")
		"beat":
			# 喜剧停顿：妈妈没了，奶蛙还愣着。这一拍不能省。
			if _twin != null:
				_twin.visible = false
			if stage_time >= BEAT_TIME:
				_enter("laugh")
		"laugh":
			if stage_time >= LAUGH_TIME:
				_enter("done")

func is_complete() -> bool:
	return stage == "done"

func is_running() -> bool:
	return stage != "idle" and stage != "done"

## 主角笑到什么程度（0..1），供 opening_director 驱动身体抽动。
func laugh_amount() -> float:
	if stage != "laugh":
		return 0.0
	return sin(clampf(stage_time / LAUGH_TIME, 0.0, 1.0) * PI)

## 分裂的张力（0..1），主角在 swell 段被撑大。
func swell_amount() -> float:
	if stage == "swell":
		return clampf(stage_time / SWELL_TIME, 0.0, 1.0)
	if stage == "split":
		return 1.0 - clampf(stage_time / SPLIT_TIME, 0.0, 1.0)
	return 0.0

func twin_world_position() -> Vector3:
	if _twin == null:
		return _origin
	return _twin.global_position

func cleanup() -> void:
	if _twin != null and is_instance_valid(_twin):
		_twin.queue_free()
		_twin = null
	_twin_morphs.clear()

# ---------------------------------------------------------------- 各段演出

func _drive_swell() -> void:
	# 妈妈还在体内：分身贴在原点、压扁到几乎看不见。
	if _twin == null:
		return
	var p := clampf(stage_time / SWELL_TIME, 0.0, 1.0)
	_twin.visible = p > 0.55
	_twin.global_position = _origin
	var bulge := smoothstep(0.55, 1.0, p)
	_twin.scale = Vector3(0.24 + bulge * 0.3, 0.16 + bulge * 0.22, 0.24 + bulge * 0.3)
	_twin_pose(1.0, 0.0)
	if not _split_played:
		_split_played = true
		_play(SFX_SPLIT)

func _drive_split() -> void:
	if _twin == null:
		return
	var p := clampf(stage_time / SPLIT_TIME, 0.0, 1.0)
	# 弹性过冲：冲过目标再回弹，果冻感就来自这个 overshoot。
	var eased := 1.0 - pow(1.0 - p, 3.0)
	var overshoot := sin(p * PI) * 0.34
	var side := Vector3(-1.05 - overshoot, 0.0, 0.18)
	_twin.visible = true
	_twin.global_position = _origin + side * eased
	# 落定瞬间横向拉伸再收回
	var wobble := _jelly(p, 9.0, 4.2)
	_twin.scale = Vector3(
		1.0 + wobble * 0.22,
		1.0 - wobble * 0.18,
		1.0 + wobble * 0.22
	) * lerpf(0.62, 1.0, eased)
	_twin.rotation.z = -wobble * 0.3
	_twin_pose(1.0 - smoothstep(0.3, 0.9, p), 0.0)
	_face(_twin, _origin, 0.35)

func _drive_banter() -> void:
	if _twin == null:
		return
	# 到点就发声；_spoken 只记录「最后播过的句子」。
	var index := -1
	for i in range(BANTER.size()):
		if stage_time >= float(BANTER[i][1]):
			index = i
	if index > _spoken:
		_spoken = index
		_play(VOICES[String(BANTER[index][0])])

	var speaking_mother := index >= 0 and String(BANTER[index][0]) in MOTHER_VOICES
	var bob := 0.0
	if speaking_mother and _voice.playing:
		bob = sin(stage_time * 26.0) * 0.06
	_twin.scale = Vector3(1.0 - bob * 0.5, 1.0 + bob, 1.0 - bob * 0.5)
	_twin.rotation.z = lerpf(_twin.rotation.z, 0.0, 0.12)
	# 妈妈始终侧对主角，最后一句开始转身准备走。
	var turning := stage_time > float(BANTER[BANTER.size() - 1][1]) + 0.45
	_face(_twin, _exit if turning else _origin, 0.1)
	_twin_pose(0.0, 0.0)

func _drive_abandon() -> void:
	if _twin == null:
		return
	var p := clampf(stage_time / ABANDON_TIME, 0.0, 1.0)
	if not _hop_played:
		_hop_played = true
		_play(SFX_HOP)
	var start := _origin + Vector3(-1.05, 0.0, 0.18)
	var base := start.lerp(_exit, p * p * 0.6 + p * 0.4)
	# 四次弹跳，边跳边降到地面高度。
	var arc := absf(sin(p * PI * 4.0)) * 0.46 * (1.0 - p * 0.45)
	_twin.global_position = base + Vector3(0, arc, 0)
	# 触地瞬间压扁
	var squash := 1.0 - absf(sin(p * PI * 4.0))
	_twin.scale = Vector3(1.0 + squash * 0.16, 1.0 - squash * 0.2, 1.0 + squash * 0.16) * lerpf(1.0, 0.82, p)
	_face(_twin, _exit, 0.2)
	_twin_pose(0.0, smoothstep(0.2, 0.8, p))

# ---------------------------------------------------------------- 工具

func _enter(next: String) -> void:
	stage = next
	stage_time = 0.0
	match next:
		"banter":
			_spoken = -1
		"laugh":
			_play(SFX_LAUGH)
		"done":
			cleanup()

func _play(stream: AudioStream) -> void:
	# 预加载常量，避免演示时同步读盘掉帧。
	_voice.stream = stream
	_voice.play()

## 阻尼正弦：果冻余振。
func _jelly(p: float, freq: float, damp: float) -> float:
	return sin(p * freq) * exp(-p * damp)

func _face(node: Node3D, target: Vector3, weight: float) -> void:
	var delta := target - node.global_position
	if delta.length_squared() < 0.0004:
		return
	var yaw := atan2(delta.x, delta.z)
	node.rotation.y = lerp_angle(node.rotation.y, yaw, clampf(weight, 0.0, 1.0))

func _twin_pose(blink: float, reach: float) -> void:
	for mesh in _twin_morphs:
		for i in range(mesh.mesh.get_blend_shape_count()):
			var key: String = mesh.mesh.get_blend_shape_name(i)
			mesh.set_blend_shape_value(i, blink if key == "Blink" else reach)

func _build_twin() -> void:
	if _twin != null:
		return
	_twin = Node3D.new()
	_twin.name = "MotherTwin"
	add_child(_twin)
	var visual := CHARACTER.instantiate()
	visual.name = "TwinVisual"
	visual.scale = Vector3.ONE * VISUAL_SCALE
	visual.position = Vector3(0, VISUAL_DROP, 0)
	_twin.add_child(visual)
	for node in _twin.find_children("*", "MeshInstance3D", true, false):
		var mesh_node := node as MeshInstance3D
		if mesh_node.mesh != null and mesh_node.mesh.get_blend_shape_count() > 0:
			_twin_morphs.append(mesh_node)
	_twin.global_position = _origin
	_twin.visible = false
