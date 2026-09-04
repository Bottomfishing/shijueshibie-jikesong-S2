// 菲涅尔外发光：正对视线的部分透明，边缘部分亮。
// 这是让一个球看起来"像一团光而不是一个球"的最省事办法。
uniform vec3 uColor;
uniform float uOpacity;
uniform float uPower;

varying vec3 vNormalView;
varying vec3 vViewDir;

void main() {
  float f = pow(1.0 - abs(dot(normalize(vNormalView), normalize(vViewDir))), uPower);
  gl_FragColor = vec4(uColor, f * uOpacity);
  #include <colorspace_fragment>
}
