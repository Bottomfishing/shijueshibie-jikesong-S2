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
## 两句实录：gaga 是妈妈那句（1.33s），andy 是留下那只奶蛙的追问（1.21s）。
const SFX_GAGA := preload("res://assets/audio/voice_gaga.wav")
const SFX_ANDY := preload("res://assets/audio/voice_andy.wav")
## 落地声用与 main.gd 同一个素材，保证开场与游玩的撞击反馈是一致的。
## hop_away.wav 不再用：它里面烧了四次固定节奏的弹跳，与现在的离散三跳对不上。
const SFX_LANDING := preload("res://assets/audio/landing.wav")
const SFX_LAUGH := preload("res://assets/audio/laugh.wav")

## 说话人 -> 音源。
## split / voice_mother / voice_child / voice_andy_2 四个素材目前不用，
## 文件仍在 assets/audio 下，要加回来只需重新 preload 并填进 BANTER。
const VOICES := {
	"andy": SFX_ANDY,
	"gaga": SFX_GAGA,
}
const MOTHER_VOICES := ["gaga"]

## 与 player.tscn 保持同一套视觉约定：GLB 缩放 0.5、下沉 0.625。
const VISUAL_SCALE := 0.5
const VISUAL_DROP := -0.625
const FLOOR_Y := 0.625

const SWELL_TIME := 0.8
const SPLIT_TIME := 0.7
## 妈妈跳走：与 main.gd 的游玩手感对齐。
## 不用 abs(sin) 连续弹跳——那是「球在滚」；生物跳走是离散节奏：
## 蓄力下蹲 → 弹道飞行 → 砸地压扁 → 再蓄力。水平位移只发生在空中，
## 所以落地那一瞬是真的「站住」了，而不是边滁边飘。
const HOP_ANTICIPATE := 0.13
const HOP_SETTLE := 0.11
## 三跳。第一跳从展台上跃下（落差约 1.96），飞行最长、砸得最重；
## 后两跳在地面上越跑越急（advance 递增、flight 递减）。
## advance 是这一跳占总位移的比例，三项相加为 1.0。
const HOPS := [
	{"flight": 0.46, "advance": 0.30, "rise": 0.34},
	{"flight": 0.34, "advance": 0.32, "rise": 0.30},
	{"flight": 0.30, "advance": 0.38, "rise": 0.26},
]
const BEAT_TIME := 0.45
const LAUGH_TIME := 2.2
const LAUGH_PROMPT_TIMEOUT := 12.0
const LAUGH_CONFIRM_TIME := 0.65

## 对话节拍：[说话人, 起始时刻]。两句：妈妈先开口，奶蛙追问。
## 尾句给 andy：追问悬在那儿没人答，妈妈才转身跳走，紧接着就是捧腹大笑。
## 只有一个 _voice，后一句会掐掉前一句，所以每句都排在上一句播完之后，
## 中间再留一段沉默，让「妈妈说完 → 奶蛙反应过来才追问」的呼吸感出来：
## gaga 0.15+1.33=1.48 →（静 0.80）→ andy 2.28+1.21=3.49
const BANTER := [
	["gaga", 0.15],
	["andy", 2.28],
]
## 最后一句播完的时刻，与上面的排期手动对齐。
const LAST_LINE_END := 3.49
## 说完再空一拍：妈妈转身、顿一下，然后才跳走。
const POST_BANTER_HOLD := 1.0
const BANTER_TIME := LAST_LINE_END + POST_BANTER_HOLD

var stage := "idle"
var stage_time := 0.0

var _twin: Node3D
var _twin_morphs: Array[MeshInstance3D] = []
var _voice: AudioStreamPlayer
var _origin := Vector3.ZERO
var _exit := Vector3.ZERO
var _spoken := -1
var _twin_skeleton: Skeleton3D
var _sfx: AudioStreamPlayer
## abandon 段的起点与时长表，在 _ready / _enter 里算好，避开手工对齐常量。
var _abandon_start := Vector3.ZERO
var _abandon_time := 0.0
var _hop_starts: Array[float] = []
var _hop_advanced: Array[float] = []
var _hops_landed := 0
var _pending_impact := 0.0
var laugh_confirmed := false
var laugh_hold := 0.0
var laugh_triggered_by_user := false

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
			if stage_time >= _abandon_time:
				_enter("beat")
		"beat":
			# 喜剧停顿：妈妈没了，奶蛙还愣着。这一拍不能省。
			if _twin != null:
				_twin.visible = false
			if stage_time >= BEAT_TIME:
				_enter("laugh_prompt")
		"laugh_prompt":
			# 用户的笑声需要连续保持一小段，防止单帧误检直接触发。
			if laugh_confirmed:
				laugh_hold += delta
			else:
				laugh_hold = maxf(laugh_hold - delta * 0.75, 0.0)
			if laugh_hold >= LAUGH_CONFIRM_TIME:
				laugh_triggered_by_user = true
				_enter("laugh")
			elif stage_time >= LAUGH_PROMPT_TIMEOUT:
				laugh_triggered_by_user = false
				_enter("laugh")
		"laugh":
			if stage_time >= LAUGH_TIME:
				_enter("done")

func is_complete() -> bool:
	return stage == "done"

func is_running() -> bool:
	return stage != "idle" and stage != "done"

func set_laugh_input(smile: float, face_detected: bool, fallback_trigger: bool = false) -> void:
	if stage != "laugh_prompt":
		return
	laugh_confirmed = (face_detected and smile >= 0.58) or fallback_trigger

func laugh_prompt_active() -> bool:
	return stage == "laugh_prompt"

func laugh_progress() -> float:
	return clampf(laugh_hold / LAUGH_CONFIRM_TIME, 0.0, 1.0)

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
	# 妈妈始终侧对主角；对话全部说完才转身，转完在空拍里顿住。
	var turning := stage_time > LAST_LINE_END
	_face(_twin, _exit if turning else _origin, 0.1)
	_twin_pose(0.0, 0.0)

func _drive_abandon() -> void:
	if _twin == null:
		return
	var hop_index := HOPS.size() - 1
	for i in range(HOPS.size()):
		var hop_end: float = _hop_starts[i] + HOP_ANTICIPATE + float(HOPS[i]["flight"]) + HOP_SETTLE
		if stage_time < hop_end:
			hop_index = i
			break
	var hop: Dictionary = HOPS[hop_index]
	var local_time: float = stage_time - _hop_starts[hop_index]
	var start_ratio: float = _hop_advanced[hop_index]
	var end_ratio: float = start_ratio + float(hop["advance"])
	var start_position := _abandon_start.lerp(_exit, start_ratio)
	var end_position := _abandon_start.lerp(_exit, end_ratio)
	var flight_time: float = float(hop["flight"])

	if local_time < HOP_ANTICIPATE:
		var p := clampf(local_time / HOP_ANTICIPATE, 0.0, 1.0)
		_twin.global_position = start_position
		_twin.scale = Vector3(1.0 + p * 0.13, 1.0 - p * 0.2, 1.0 + p * 0.13)
		_twin_pose(0.0, p * 0.35)
		_twin_bones("crouch", p)
	elif local_time < HOP_ANTICIPATE + flight_time:
		var p := clampf((local_time - HOP_ANTICIPATE) / flight_time, 0.0, 1.0)
		var eased := smoothstep(0.0, 1.0, p)
		var base := start_position.lerp(end_position, eased)
		var arc := sin(p * PI) * float(hop["rise"])
		_twin.global_position = base + Vector3(0.0, arc, 0.0)
		_twin.scale = Vector3(0.94, 1.09, 0.94)
		_twin_pose(0.0, 0.75)
		# 上升时收腿、下落时前伸准备着地，与 main.gd 的 jump/fall 同一套词汇。
		_twin_bones("jump" if p < 0.5 else "fall", 0.0)
	else:
		var p := clampf((local_time - HOP_ANTICIPATE - flight_time) / HOP_SETTLE, 0.0, 1.0)
		_twin.global_position = end_position
		var impact := 1.0 - p
		_twin.scale = Vector3(1.0 + impact * 0.16, 1.0 - impact * 0.22, 1.0 + impact * 0.16)
		_twin_pose(0.0, impact * 0.3)
		_twin_bones("land", impact)
		if _hops_landed <= hop_index:
			_hops_landed = hop_index + 1
			_sfx.pitch_scale = 0.9 + float(hop_index) * 0.08
			_sfx.play()
			# 第一跳是从展台上跃下，落差最大，震得最重。
			_pending_impact = maxf(_pending_impact, 0.34 if hop_index == 0 else 0.16)
	_face(_twin, _exit, 0.2)

# ---------------------------------------------------------------- 工具

func _enter(next: String) -> void:
	stage = next
	stage_time = 0.0
	match next:
		"banter":
			_spoken = -1
		"laugh_prompt":
			laugh_confirmed = false
			laugh_hold = 0.0
			laugh_triggered_by_user = false
		"abandon":
			_prepare_hops()
		"laugh":
			_play(SFX_LAUGH)
		"done":
			cleanup()

func _play(stream: AudioStream) -> void:
	# 预加载常量，避免演示时同步读盘掉帧。
	_voice.stream = stream
	_voice.play()

func _prepare_hops() -> void:
	_abandon_start = _origin + Vector3(-1.05, 0.0, 0.18)
	_hop_starts.clear()
	_hop_advanced.clear()
	_hops_landed = 0
	var cursor := 0.0
	var advanced := 0.0
	for hop in HOPS:
		_hop_starts.append(cursor)
		_hop_advanced.append(advanced)
		cursor += HOP_ANTICIPATE + float(hop["flight"]) + HOP_SETTLE
		advanced += float(hop["advance"])
	_abandon_time = cursor

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

## 骨骼摆动。数值直接沿用 main.gd 的 crouch/jump/fall/land，
## 保证两只奶蛙的跳跃是同一套动作语言，而不是各跳各的。
func _twin_bones(state: String, amount: float) -> void:
	if _twin_skeleton == null:
		return
	var thigh := 0.0
	var arm := 0.0
	var shin := 0.0
	var spine := 0.0
	match state:
		"crouch":
			thigh = -0.34 * amount
			arm = -0.3 * amount
			shin = 0.4 * amount
			spine = -0.22 * amount
		"jump":
			thigh = 0.2
			arm = -0.42
			spine = -0.08
		"fall":
			thigh = -0.16
			arm = 0.56
			spine = 0.12
		"land":
			thigh = -0.12 * amount
			arm = -0.2 * amount
			spine = -0.16 * amount
	_set_twin_bone("L_thigh", thigh)
	_set_twin_bone("R_thigh", -thigh)
	_set_twin_bone("L_arm", -arm)
	_set_twin_bone("R_arm", arm)
	_set_twin_bone("L_shin", shin)
	_set_twin_bone("R_shin", shin)
	_set_twin_bone("L_foot", -shin * 0.45)
	_set_twin_bone("R_foot", -shin * 0.45)
	_set_twin_bone("spine", spine)

func _set_twin_bone(bone_name: String, angle: float) -> void:
	var index := _twin_skeleton.find_bone(bone_name)
	if index >= 0:
		_twin_skeleton.set_bone_pose_rotation(index, Quaternion(Vector3.RIGHT, angle))

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
	var skeletons := _twin.find_children("*", "Skeleton3D", true, false)
	if not skeletons.is_empty():
		_twin_skeleton = skeletons[0] as Skeleton3D
	_sfx = AudioStreamPlayer.new()
	_sfx.name = "HopLandingSfx"
	_sfx.stream = SFX_LANDING
	_sfx.volume_db = -9.0
	_twin.add_child(_sfx)
	_twin.global_position = _origin
	_twin.visible = false
