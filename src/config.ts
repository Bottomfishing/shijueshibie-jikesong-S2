/**
 * 全局可调参数。
 *
 * 比赛现场 30-36 小时是"美术调校"时间，那就是在跟这个文件打交道。
 * 所有魔法数字集中在此，配合调试面板（D 键）可以实时改，不用来回翻代码。
 */
/**
 * 注意这里刻意没有加 `as const`：
 * 现场调参时调试面板要直接改写这些值，readonly 会让所有赋值都报类型错。
 * 需要字面量元组的地方（相机机位、好奇间隔）已在字段上单独标注。
 */
export const CONFIG = {
  camera: {
    /** 正交相机视锥高度（世界单位）。调大＝看得更广 */
    frustumSize: 30,
    /** 等距视角机位。俯角要够大，麦田才读得出"地面"，上方才有天空留白。
     *  目标点刻意偏向远角：把地块压向画面下方，顶部留出天空呼吸空间 */
    position: [21, 30, 21] as [number, number, number],
    target: [-2.2, 0, -2.2] as [number, number, number],
  },

  fog: {
    near: 24,
    far: 70,
    color: '#f5efe0',
  },

  wheat: {
    /** 麦穗总数：一半铺圆形的家草坪，一半成簇撒进北延的大麦田 */
    count: 88000,
    /** 大麦田边长（覆盖北延区+海），边缘羽化在远处自然消失 */
    fieldSize: 64,
    /** 家的草坪半径：摘花的圆形草地 */
    homeRadius: 18,
    /** 北延麦海的长度（家的北缘到海）：约 1.5 个屏幕高度的行走距离 */
    northLen: 66,
    bladeWidth: 0.07,
    bladeHeight: 1.1,
    /** 每根麦穗的高度分段，越多弯得越柔和，但顶点数线性上涨 */
    segments: 4,
    windStrength: 0.17,
    /** 风向（弧度） */
    windDirection: 0.7,
    /** 弯曲幅度总缩放 */
    swayScale: 0.6,
    /** 阵风流场：低频噪声沿风向滚动，风以“斑块”扫过田野而非整片均匀摆动 */
    gustScale: 0.09,
    /** 阵风推进速度（世界单位/秒，沿风向） */
    gustSpeed: 2.2,
    /** 阵风强弱波动幅度：0 = 关（回到均匀风），越大“局部风停/风起”对比越强 */
    gustStrength: 0.45,
    /** 手部影响半径（世界单位） */
    handRadius: 2.8,
    colors: {
      /** 第一幕：冷灰，世界是睡着的。梢头必须压暗，否则雾+bloom 一冲就成了惨白 */
      baseCold: '#86938c',
      tipCold: '#b5bcae',
      /** 第三幕：暖金，世界醒过来 */
      baseWarm: '#a87b2c',
      tipWarm: '#f2c84b',
      /** 手经过处泛起的光 */
      glow: '#ffd97d',
    },
  },

  /** 金色海边：沿北进深度的海面渐变范围 */
  sea: {
    start: 78,
    end: 90,
  },

  girl: {
    /** 整体放大倍数（Q 版萌系靠它定个头）。提进配置，调试面板可实时拧 */
    scale: 1.35,
    /** 弹簧刚度：起步/刹车的柔和程度。要跟手，不能软绵绵 */
    stiffness: 36,
    /** 阻尼比。走路要稳，接近临界阻尼；<1 会有轻微过冲 */
    dampingRatio: 0.95,
    /** 步速上限（世界单位/秒）。走路感来自限速——超了就像滑行 */
    maxSpeed: 6.2,
    /** 第二幕漫步范围（半径） */
    wanderAmp: 3.2,
    /** 好奇行为：每隔多久给自己找个新的兴趣点（下限/上限，秒）。
     *  刻意拆成两个标量而不是数组——lil-gui 只能绑定数字，数组会让调试面板构造直接炸掉 */
    curiosityMin: 2.5,
    curiosityMax: 6.0,
    curiosityAmp: 1.0,
    /** 转身插值速度，越大转身越利落 */
    turnLerp: 9,
  },

  pointer: {
    /** 交互平面高度：手的世界坐标投影到这个水平面上 */
    planeY: 1.1,
    /**
     * 手感预设。鼠标几乎零滞后零滤波，手势要接近它就得牺牲一点稳定换跟手。
     * minCutoff（慢速滞后）与 beta（快速跟手）是核心：
     *  - minCutoff 越高，慢速时指针越贴手（τ=1/(2π·cutoff)，1.2→100ms+，2.5→64ms）
     *  - beta 越高，快速挥舞越跟手，但抖动也会多回来
     * 这里给三档，调试面板一键切换 A/B，现场人测决定，避免我替用户猜一个不动手的值。
     */
    presets: {
      跟手: { minCutoff: 2.6, beta: 0.045, dCutoff: 1.4 },
      平衡: { minCutoff: 1.9, beta: 0.03, dCutoff: 1.3 },
      稳定: { minCutoff: 1.2, beta: 0.02, dCutoff: 1.2 },
    } as Record<string, { minCutoff: number; beta: number; dCutoff: number }>,
    /** 默认用哪档 */
    preset: '跟手' as '跟手' | '平衡' | '稳定',
    /** 手部推理分辨率：越低推理越快、主线程越松。640×480 比 1280×720 快约 4 倍，
     *  反馈滞后从几十 ms 降到个位数——这是"卡"的一大来源。摄像头预览框才 240px 宽，640 足够 */
    inferWidth: 640,
    inferHeight: 480,
    /** 候选帧的运动外推：观测间隔 33ms vs 渲染 60fps，中间帧用干净速度补上。
     *  外推值绝不回馈到速度计算，也不进 One Euro——只做"补步"，不做"预测" */
    extrapolate: true,
    /** 距上次真实观测超过该毫秒就停止外推（手可能真停了，继续推只会一直漂） */
    extrapolateMaxMs: 120,
    /** 判定"丢失"的时长（秒）。超时后麦浪缓缓恢复 */
    lostTimeout: 0.45,
  },

  flowers: {
    count: 3,
    /** 花的分布半径（撒在外围，避开中心空地；外缘仍需与石碑保持一圈距离） */
    radiusMin: 6.5,
    radiusMax: 12,
    /** 花落点还要落在屏幕舒适区内：|x|、|z| 不得超过该值（保证上下沿也够得到） */
    reachLimit: 10.5,
    /** 小满靠近时花开始苏醒/漂向她的距离 */
    attractRadius: 3.0,
    attractForce: 2.4,
    /** 小满走到花上（水平距离）算摘到 */
    collectDist: 1.05,
    /** 花"从无到有"的生长：手/小满靠近到这个距离开始破土生长（世界单位） */
    growRadius: 4.0,
    /** 生长时长（秒）。越慢越仙气，越快越"惊喜" */
    growDuration: 1.15,
    /** 生长完成后，花被摘之前保持"呼吸发光"的生命态 */
  },

  story: {
    /** 第一幕最短停留（秒），避免刚上来就切幕 */
    act1MinTime: 4,
    /** 第一幕累计移动距离阈值（世界单位） */
    act1Travel: 3.2,
    /** 第一幕兜底超时（秒）：玩家一直不动也会推进，防止冷场 */
    act1Timeout: 22,
    /** 北进深度超过这里进入第一章"风与麦海" */
    northZoneEnter: 30,
    /** 北进深度超过这里算抵达金色海边 */
    seaArrive: 82,
    /** 第一章起风充能的时长（秒，持续起风才充得满） */
    chargeTime: 7,
  },

  bloom: {
    /** 总开关：调试面板实时开关。EffectComposer 会跳过 disabled 的 pass，零开销 */
    enabled: true,
    strength: 0.38,
    radius: 0.55,
    /** 天空色 #f5efe0 的亮度约 0.92，阈值必须高于它，否则整片天空泛光、画面发灰 */
    threshold: 0.93,
  },
}

export type Config = typeof CONFIG

