import * as THREE from 'three'
import { CONFIG } from '../config'

/**
 * 金色的海：一块随波起伏的海面网格。
 *
 * 波形沿"北进深度"向岸推进：波峰泛白、波谷深金；
 * 靠岸的地方波幅收零，海面从水线自然升起，不突兀。
 * 与地面 shader 的沙滩/泡沫/湿沙共同构成海岸带。
 */
const SEA_VERT = /* glsl */ `
uniform float uTime;
uniform float uSeaStart;
varying float vWave;
varying float vD;
varying float vW;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float d = -(wp.x + wp.z) * 0.7071;
  float w = (wp.x - wp.z) * 0.7071;
  vD = d;
  vW = w;
  // 上下起伏：主浪向岸推进 + 次浪斜向交错；波长加密，浪才读得出"一排排"
  float amp = smoothstep(uSeaStart - 4.0, uSeaStart + 10.0, d);
  // 栈桥附近浪自平静（桥桩消波）——桥面不再被浪峰洗白
  float pierDamp = (1.0 - smoothstep(3.0, 9.0, abs(w)))
                 * smoothstep(70.0, 78.0, d)
                 * (1.0 - smoothstep(92.0, 102.0, d));
  amp *= 1.0 - pierDamp * 0.9;
  float wave = sin(d * 0.55 - uTime * 1.35) * 0.40
             + sin(d * 1.05 - uTime * 0.85 + w * 0.18) * 0.24;
  vWave = wave * amp;
  vec3 transformed = position;
  transformed.y += vWave;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(transformed, 1.0);
}
`

const SEA_FRAG = /* glsl */ `
uniform float uTime;
uniform float uSeaStart;
varying float vWave;
varying float vD;
varying float vW;
void main() {
  // 金色海面：深处浓郁的琥珀金、波峰白浪翻滚
  vec3 deep = vec3(0.55, 0.36, 0.13);
  vec3 gold = vec3(0.92, 0.68, 0.28);
  vec3 white = vec3(1.0, 0.98, 0.88);
  vec3 col = mix(deep, gold, smoothstep(uSeaStart, uSeaStart + 40.0, vD));
  // 一排排向岸推进的白色浪带：平直、密集、锐利——金白相间的"排浪"
  float band = 0.5 + 0.5 * sin(vD * 1.6 - uTime * 1.8 + sin(vW * 0.08) * 0.3);
  float bandSharp = pow(band, 5.0);
  col = mix(col, white, bandSharp * 0.9);
  // 波峰白浪：3D 起伏的浪尖再叠一层白
  float crest = smoothstep(0.16, 0.4, vWave);
  col = mix(col, white, crest * 0.5);
  // 靠岸渐隐：水线以下让沙滩和泡沫露出来
  float shore = smoothstep(uSeaStart - 2.0, uSeaStart + 3.0, vD);
  gl_FragColor = vec4(col, shore);
  #include <colorspace_fragment>
}
`

export class SeaSurface {
  readonly mesh: THREE.Mesh
  private readonly mat: THREE.ShaderMaterial

  constructor() {
    // 平面几何：宽（横向 w）160，长（北进 d）110，段数足够波形细腻
    const geo = new THREE.PlaneGeometry(160, 110, 100, 46)
    geo.rotateX(-Math.PI / 2)
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SEA_VERT,
      fragmentShader: SEA_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uSeaStart: { value: CONFIG.sea.start },
      },
    })
    this.mesh = new THREE.Mesh(geo, this.mat)
    // 旋转 45° 对齐北进坐标系，中心放在海面中段（d ≈ CONFIG.sea.start + 42）
    this.mesh.rotation.y = -Math.PI / 4
    const c = CONFIG.sea.start + 42
    this.mesh.position.set(-c * 0.7071, 0.06, -c * 0.7071)
    this.mesh.renderOrder = 1
    this.mesh.frustumCulled = false
  }

  update(time: number): void {
    this.mat.uniforms.uTime.value = time
  }
}
