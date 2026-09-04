varying vec3 vNormalView;
varying vec3 vViewDir;

void main() {
  vNormalView = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // 正交相机下视线方向恒为 +Z，但这里仍按实际位置算，换回透视相机也不会错
  vViewDir = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
