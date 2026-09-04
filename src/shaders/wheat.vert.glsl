// 麦穗顶点着色器
//
// 一根麦穗被当作从根部（y=0）向上生长的细杆，受两个水平力弯曲：
//   1. 全局风 —— 两个不同频率的行波叠加，避免整片麦子像刷子一样同步摆
//   2. 手部倒伏 —— 以手的世界坐标为中心，按距离平方衰减，方向为"远离手"
// 弯曲量沿高度按 pow(t, 1.65) 分布：根部几乎不动，形变集中在梢头，这样才像真麦子。

attribute vec3 aOffset;   // 每株麦穗的根部位置（模型空间 == 世界空间，mesh 不做变换）
attribute float aPhase;   // 随机相位，让每株摆动不同步
attribute float aTint;    // 色差扰动，避免整片颜色太死
attribute float aScale;   // 高矮差异
attribute float aRot;     // 绕 Y 轴的随机朝向
attribute float aZone;    // 0 = 家的麦田（四边羽化），1 = 北延麦海（生长波前控制）

uniform float uTime;
uniform vec3 uHand;           // 手在交互平面上的世界坐标
uniform float uHandRadius;
uniform float uHandStrength;  // 手部影响总强度，由导演 + 指针能量共同决定
uniform vec3 uGirl;           // 主角（小满）的地面位置
uniform float uGirlStrength;  // 她拨开麦子的强度：站着留空地，走动开路
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform float uGustScale;     // 阵风噪声空间频率：越小风斑越大
uniform float uGustSpeed;     // 阵风沿风向推进的速度（世界单位/秒）
uniform float uGustStrength;  // 阵风强弱波动幅度：0=均匀风，越大“局部风停/风起”对比越强
uniform float uBladeHeight;
uniform float uSwayScale;
uniform float uFieldHalf;     // 大麦田外缘羽化半径
uniform float uHomeRadius;    // 家的圆形草坪半径
uniform float uNorthOpen;     // 北延麦海的显形 0~1（摘完花后长出来的那片）
uniform float uSeaStart;      // 北进深度超过这里，麦子开始变矮（海边渐变）
uniform float uSeaEnd;        // 到这里麦子完全让位给海

// 花让位：每朵盛开的花周围清出一圈空地，让茎和花头露出来。
// uFlower[i].xy = 花的水平位置，.z = 该花是否已生长（0=还没长，1=已长好）
uniform vec3 uFlower[4];
uniform float uFlowerRadius;  // 每朵花清出空地的半径（世界单位）

varying float vT;
varying float vTint;
varying float vInfluence;
varying vec3 vNormal;
varying float vViewDepth;

// 2D value noise：不需要纹理采样，顶点级精度足够，比一张 DataTexture 还省
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  float t = clamp(position.y / uBladeHeight, 0.0, 1.0);
  vT = t;
  vTint = aTint;

  // 先把这株麦穗绕自身 Y 轴随机转一下，十字片的朝向才不会整齐划一
  float cr = cos(aRot);
  float sr = sin(aRot);
  mat2 rot = mat2(cr, sr, -sr, cr);
  vec3 p = position;
  p.xz = rot * p.xz;
  vec3 nrm = normal;
  nrm.xz = rot * nrm.xz;

  // 边缘软过渡：只作用于"家的圆盘"麦子（aZone=0）——
  // 北延麦海的外缘由生长波前和海边渐变负责，这条老羽化会把 r>32 的北延麦子全压矮。
  // 用径向距离（圆形边界），混入每株噪声让边缘犬牙交错。
  float rEdge = length(aOffset.xz) / uFieldHalf;
  float edgeJitter = 0.06 * (aTint - 0.5);            // 每株随机偏移，让边缘犬牙交错
  float edgeFade = 1.0 - smoothstep(0.80 - edgeJitter, 1.0, rEdge);
  p *= mix(1.0, 0.10 + 0.90 * edgeFade, 1.0 - aZone);

  // 全局风：行波沿北进方向推进；北方草原上还有缓慢滚过的"风纹大浪"
  float dNorth0 = -(aOffset.x + aOffset.z) * 0.7071;
  float inNorth = smoothstep(14.0, 26.0, dNorth0) * uNorthOpen;
  float roll = max(0.0, sin(uTime * 0.55 - dNorth0 * 0.09)) * inNorth;
  float wave = sin(uTime * 1.15 + aPhase + aOffset.x * 0.21 + aOffset.z * 0.16)
             + 0.45 * sin(uTime * 2.40 + aPhase * 1.7 + aOffset.z * 0.33);

  // 阵风流场：低频噪声沿风向滚动，风以“斑块”扫过田野——
  // 有的地方掀起大浪、有的地方几乎静止，代替整片均匀摆动（借鉴 zephyr 的统一风场思路）
  vec2 gustP = aOffset.xz - uWindDir * (uTime * uGustSpeed);
  float gust = vnoise(gustP * uGustScale) * 0.65
             + vnoise(gustP * uGustScale * 2.7 + 19.19) * 0.35;
  float gustAmp = 1.0 + (gust * 2.0 - 1.0) * uGustStrength;

  float windAmp = (wave * 0.5 + 0.62) * uWindStrength * (1.0 + roll * 1.1) * gustAmp;

  // 手部倒伏
  vec2 toBlade = aOffset.xz - uHand.xz;
  float d = length(toBlade);
  float dn = d / max(uHandRadius, 1e-4);
  float infl = uHandStrength / (1.0 + dn * dn * 2.6);
  vec2 handDir = d > 1e-4 ? toBlade / d : vec2(0.0, 1.0);

  // 主角走过时拨开麦子：以她为中心的固定小半径，走动时范围更大
  vec2 toGirl = aOffset.xz - uGirl.xz;
  float dg = length(toGirl);
  float dgn = dg / 1.6;
  float inflG = uGirlStrength / (1.0 + dgn * dgn * 2.2);
  vec2 girlDir = dg > 1e-4 ? toGirl / dg : vec2(0.0);

  // 花让位：已长出的花周围清一块空地。麦子朝远离花的方向倒伏，并在这片区域整体变矮——
  // 这样花和茎才不会被 1.1 高的麦子埋住，从远处也能一眼看到。
  // uFlower[i].xy = 花的水平世界位置(x,z)，uFlower[i].z = 生长进度 0~1（花越长麦子让得越开）
  float flowerClear = 0.0;
  vec2 bend = uWindDir * windAmp + handDir * infl * 1.7 + girlDir * inflG * 1.1;
  for (int i = 0; i < 4; i++) {
    if (uFlower[i].z < 0.01) continue; // 花还没长出来，不清
    vec2 toFlower = aOffset.xz - uFlower[i].xy;
    float df = length(toFlower);
    float dfn = df / max(uFlowerRadius, 1e-4);
    // 让位强度 × 生长进度(z)：花越长麦子让得越开，是平滑渐进的动画，不是瞬间清空
    float inflF = 0.9 / (1.0 + dfn * dfn * 3.0) * uFlower[i].z;
    vec2 flowerDir = df > 1e-4 ? toFlower / df : vec2(0.0);
    flowerClear = max(flowerClear, inflF);
    bend += flowerDir * inflF * 1.6;
  }
  float bendMag = min(length(bend), 1.2);
  vec2 bendDir = length(bend) > 1e-5 ? normalize(bend) : vec2(0.0, 1.0);

  float curve = pow(t, 1.65) * aScale;
  p.xz += bendDir * (bendMag * curve * uSwayScale);
  // 弯下去的同时高度收一点，视觉上像杆子被压弯而不是被平移
  p.y -= bendMag * bendMag * curve * uBladeHeight * 0.30;

  // 北进深度：d 越大越靠屏幕上方（远离相机）
  float dNorth = -(aOffset.x + aOffset.z) * 0.7071;
  float rHome = length(aOffset.xz);

  // 北延麦海：生长波前从家门口一路向北扫过；靠家的一侧与圆形草坪衔接
  float front = mix(2.0, uSeaStart + 14.0, uNorthOpen);
  float northGrow = (1.0 - smoothstep(front - 8.0, front + 1.0, dNorth))
                  * smoothstep(uHomeRadius - 2.5, uHomeRadius + 1.5, rHome);

  // 家的圆形草坪：径向羽化，边缘参差自然（复用前面的边缘噪声犬牙交错）
  float homeFeather = 1.0 - smoothstep(uHomeRadius - 3.5 + edgeJitter * 6.0, uHomeRadius, rHome);

  // 海边：麦子在水线前让位给沙滩——不伸进海里
  float seaFade = 1.0 - smoothstep(uSeaStart - 9.0, uSeaStart - 4.0, dNorth);

  // 花圃让位：花周围 2/3 半径内麦子整体变矮，中心几乎清零——花和茎彻底露出来。
  // 用 smoothstep 做软过渡，边缘保留几根矮麦，像人踩出的一块花圃，不生硬。
  p *= max(northGrow * aZone, homeFeather * (1.0 - aZone)) * seaFade * mix(1.0, 0.08, flowerClear);

  vec3 worldPos = aOffset + p;

  vInfluence = infl;
  vNormal = normalize(normalMatrix * nrm);

  vec4 mv = modelViewMatrix * vec4(worldPos, 1.0);
  vViewDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
