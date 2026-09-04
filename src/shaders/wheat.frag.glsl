// 麦穗片元着色器
//
// 纪念碑谷的调子靠的是"几乎没有光照"：纯色 + 沿高度的渐层 + 远景雾化。
// 这里只做三件事：根部深梢头亮的渐层、一点方向性明暗让十字片有体积、手经过处泛暖光。

uniform vec3 uColorBase;  // 根部色
uniform vec3 uColorTip;   // 梢头色
uniform vec3 uColorGlow;  // 手部影响处的泛光色
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uLightDir;

varying float vT;
varying float vTint;
varying float vInfluence;
varying vec3 vNormal;
varying float vViewDepth;

void main() {
  vec3 col = mix(uColorBase, uColorTip, pow(vT, 0.75));
  col *= 0.92 + vTint * 0.16;

  // 根部环境光遮蔽：贴地处压暗，麦子和地面的接触感更扎实
  col *= mix(0.55, 1.0, smoothstep(0.0, 0.45, vT));

  // 十字交叉的两个片面法线不同，这一点明暗差异就是体积感的来源
  float lambert = dot(normalize(vNormal), normalize(uLightDir)) * 0.5 + 0.5;
  col *= 0.80 + lambert * 0.30;

  col = mix(col, uColorGlow, clamp(vInfluence * 0.85, 0.0, 0.60));

  float fog = smoothstep(uFogNear, uFogFar, vViewDepth);
  col = mix(col, uFogColor, fog);

  gl_FragColor = vec4(col, 1.0);
  // 自定义 ShaderMaterial 不会自动做色彩空间转换，漏了这行整个画面会发灰
  #include <colorspace_fragment>
}
