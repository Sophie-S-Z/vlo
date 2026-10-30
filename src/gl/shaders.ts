/** Glyph particle shaders (spec 18.2). Seven target shapes; uProgress runs from 0 to 6. */
export const particleVertex = /* glsl */ `
attribute vec3 aShape0;
attribute vec3 aShape1;
attribute vec3 aShape2;
attribute vec3 aShape3;
attribute vec3 aShape4;
attribute vec3 aShape5;
attribute vec3 aShape6;
attribute float aGlyph;
attribute float aDelay;
attribute float aSeed;

uniform float uProgress;
uniform float uTime;
uniform float uSize;
uniform float uWorld;
uniform vec3 uOffset;
uniform float uColumns;
uniform float uRows;

varying vec2 vUv;
varying float vAccent;
varying float vFade;

vec3 shapeAt(float i) {
  if (i < 0.5) return aShape0;
  if (i < 1.5) return aShape1;
  if (i < 2.5) return aShape2;
  if (i < 3.5) return aShape3;
  if (i < 4.5) return aShape4;
  if (i < 5.5) return aShape5;
  return aShape6;
}

// Cheap divergence-free-looking drift: the curl of a few sine fields.
vec3 curl(vec3 p) {
  return vec3(
    sin(p.y * 3.1 + uTime * 0.7) - cos(p.z * 2.3 + uTime * 0.5),
    sin(p.z * 2.7 + uTime * 0.6) - cos(p.x * 3.3 + uTime * 0.4),
    sin(p.x * 2.9 + uTime * 0.5) - cos(p.y * 2.1 + uTime * 0.8)
  );
}

void main() {
  float segment = clamp(floor(uProgress), 0.0, 5.0);
  float t = clamp(uProgress - segment, 0.0, 1.0);
  float local = smoothstep(aDelay * 0.45, aDelay * 0.45 + 0.55, t);
  vec3 target = mix(shapeAt(segment), shapeAt(segment + 1.0), local);
  float transit = sin(3.14159 * local);
  target += curl(target * 2.0 + aSeed * 10.0) * 0.12 * transit;
  target += vec3(sin(uTime * 0.6 + aSeed * 40.0), cos(uTime * 0.5 + aSeed * 30.0), 0.0) * 0.004;

  vec4 mv = modelViewMatrix * vec4(target * uWorld + uOffset, 1.0);
  mv.xy += position.xy * uSize * (0.7 + aSeed * 0.6);
  gl_Position = projectionMatrix * mv;

  vec2 cell = vec2(mod(aGlyph, uColumns), floor(aGlyph / uColumns));
  vUv = (cell + vec2(uv.x, 1.0 - uv.y)) / vec2(uColumns, uRows);
  vUv.y = 1.0 - vUv.y;
  vAccent = step(0.95, aSeed);
  vFade = 0.55 + 0.45 * transit;
}
`;

export const particleFragment = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uColor;
uniform vec3 uAccent;
uniform float uOpacity;

varying vec2 vUv;
varying float vAccent;
varying float vFade;

void main() {
  float alpha = texture2D(uAtlas, vUv).a * uOpacity * vFade;
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(mix(uColor, uAccent, vAccent), alpha);
}
`;
