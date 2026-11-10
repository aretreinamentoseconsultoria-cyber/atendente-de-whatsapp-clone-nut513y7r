// Shaders GLSL para WebGL 1/2 fiéis à fórmula WGSL de Glass Liquid / blueDrop (style 20)
// do repositório https://github.com/LerSent001/orb (LerSent001/orb)

export const WEBGL_VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = (a_position + 1.0) * 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

export const WEBGL_FRAGMENT_SHADER = `
precision highp float;

varying vec2 v_uv;

uniform vec2 u_size;
uniform float u_time;
uniform float u_speed;
uniform float u_radius;
uniform float u_zoom;
uniform float u_warp;
uniform float u_ridgeAmt;
uniform float u_sharp;
uniform float u_shade;
uniform float u_sheen;
uniform float u_gloss;
uniform float u_shellMidAlpha;
uniform float u_shellEdgeAlpha;
uniform float u_exposure;
uniform float u_edgeSoftness;
uniform float u_edgeGlow;
uniform float u_glassEnabled;
uniform float u_glassOpacity;
uniform float u_contourDeform;

uniform vec4 u_colorA;
uniform vec4 u_colorB;
uniform vec4 u_colorC;
uniform vec4 u_colorD;
uniform vec4 u_highlightColor;
uniform vec4 u_shellInner;
uniform vec4 u_shellMid;
uniform vec4 u_shellEdge;
uniform vec4 u_sheenColor;
uniform vec4 u_specColor;
uniform vec4 u_canvasColor;
uniform vec4 u_glowColor;

const float GL_KA = 6.0;
const float GL_KG = 4.1209;
const float GL_KR = 0.32;
const float GL_GH = 1.73205081; // sqrt(3)
const float GL_CLEAR_EA = 0.995;
const float GL_CLEAR_EB = 1.04;

float lqHash(vec2 pIn) {
  vec2 p = fract(pIn * vec2(123.34, 456.21));
  p = p + vec2(dot(p, p + vec2(45.32)));
  return fract(p.x * p.y);
}

float lqNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(lqHash(i), lqHash(i + vec2(1.0, 0.0)), f.x),
    mix(lqHash(i + vec2(0.0, 1.0)), lqHash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

// Retorna x = média atenuada, y = desvio padrão da atenuação
vec2 lqFbm(vec2 pIn, float bs) {
  vec2 p = pIn;
  float s = 0.0;
  float a = 0.5;
  float m = 0.0;
  float vr = 0.0;
  float e = -GL_KA * bs * bs;
  float g = 1.0;
  for (int i = 0; i < 5; i++) {
    float b = exp(e * g);
    s += a * (0.5 + b * (lqNoise(p) - 0.5));
    vr += a * a * (1.0 - b * b);
    m += a;
    a *= 0.5;
    g *= GL_KG;
    // Rotação mat2(0.8, -0.6, 0.6, 0.8) * 2.03
    p = vec2(0.8 * p.x - 0.6 * p.y, 0.6 * p.x + 0.8 * p.y) * 2.03;
  }
  return vec2(s / m, GL_KR * sqrt(vr) / m);
}

float lqRidge(float v, float k) {
  return pow(clamp(1.0 - abs(v * 2.0 - 1.0), 0.0, 1.0), k);
}

float lqRidgeS(vec2 vs, float k) {
  float d = GL_GH * vs.y;
  return (lqRidge(vs.x - d, k) + 4.0 * lqRidge(vs.x, k) + lqRidge(vs.x + d, k)) / 6.0;
}

vec3 lqRamp(float v, vec3 cA, vec3 cB, vec3 cC, vec3 cD) {
  vec3 c = mix(cA, cB, smoothstep(0.0, 0.45, v));
  c = mix(c, cC, smoothstep(0.38, 0.72, v));
  c = mix(c, cD, smoothstep(0.68, 1.0, v));
  return c;
}

vec2 glsRotate(vec2 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

vec3 glsFinishPresetFluid(vec3 colorIn, vec2 p) {
  vec3 color = colorIn;
  color = mix(color, u_highlightColor.rgb,
              u_shade * 0.22 * smoothstep(0.15, 1.15, dot(p, vec2(-0.32, 0.78))));
  color = color * (1.0 - u_shade * 0.34 * smoothstep(-0.1, 1.2, dot(p, vec2(0.45, -0.62))));
  color = color * (1.0 - u_shade * 0.22 * smoothstep(0.72, 1.08, length(p)));
  return clamp(color, vec3(0.0), vec3(1.0));
}

// Preset BlueDrop Fluid (Style 20)
vec3 glsBlueDropFluid(vec2 p, float t) {
  float depth = sqrt(max(1.0 - clamp(dot(p, p), 0.0, 1.0), 0.0));
  vec2 q = p * mix(0.72, 1.0, depth * 0.62 + 0.38);
  q = glsRotate(q, -0.24 + 0.06 * sin(t * 0.17));
  float scale = 1.0 + u_zoom * 1.12;
  float blur = 0.012 + 0.006 * u_zoom;
  vec2 driftA = lqFbm(q * 1.28 + vec2(t * 0.095, -t * 0.034), blur * 1.28);
  vec2 driftB = lqFbm(glsRotate(q, 1.08) * 1.62 + vec2(-t * 0.042, t * 0.078), blur * 1.62);
  vec2 flowed = q + vec2(driftA.x - 0.5, driftB.x - 0.5) * (0.24 + u_warp * 0.1);
  flowed.x = flowed.x + sin(flowed.y * 2.15 + t * 0.24) * (0.035 + u_warp * 0.012);
  flowed.y = flowed.y + sin(flowed.x * 1.38 - t * 0.18) * (0.045 + u_warp * 0.01);
  vec2 body = lqFbm(flowed * scale + vec2(t * 0.025, -t * 0.018), blur * scale);
  float marble = lqRidgeS(
    lqFbm(flowed * (1.72 + u_zoom * 0.9) + vec2(2.7, -t * 0.035), blur * (1.72 + u_zoom * 0.9)),
    0.8 + u_sharp * 0.46
  );
  float value = clamp(mix(body.x, body.x * 0.62 + marble * 0.58, u_ridgeAmt), 0.0, 1.0);
  vec3 color = lqRamp(value, u_colorA.rgb, u_colorB.rgb, u_colorC.rgb, u_colorD.rgb);
  float light = pow(max(dot(normalize(vec3(p, depth)), normalize(vec3(-0.48, 0.62, 0.92))), 0.0), 3.2);
  color = mix(color, u_highlightColor.rgb, light * (0.035 + 0.05 * u_shade));
  color = color * (0.74 + 0.26 * depth);
  return glsFinishPresetFluid(color, p);
}

vec3 glsOver(vec3 dst, vec3 src, float a) {
  float k = clamp(a, 0.0, 1.0);
  return src * k + dst * (1.0 - k);
}

float glsRefractionProfile(float t) {
  float depth = clamp(t, 0.0, 1.0);
  float circular = sqrt(max(1.0 - (1.0 - depth) * (1.0 - depth), 0.0));
  return 1.0 - circular;
}

float glsHighlightLobe(vec2 normal, vec2 direction, float cut, float power) {
  float angular = clamp((dot(normal, direction) - cut) / max(1.0 - cut, 0.001), 0.0, 1.0);
  return pow(angular, power);
}

vec2 glsContourWave(float angle, float t) {
  float wave = sin(angle * 3.0 + t * 0.62) * 0.52
             + sin(angle * 5.0 - t * 0.41 + 1.7) * 0.31
             + sin(angle * 2.0 + t * 0.23 + 3.1) * 0.17;
  float slope = cos(angle * 3.0 + t * 0.62) * 1.56
              + cos(angle * 5.0 - t * 0.41 + 1.7) * 1.55
              + cos(angle * 2.0 + t * 0.23 + 3.1) * 0.34;
  return vec2(wave, slope);
}

float glsContourStrength() {
  return 0.11;
}

float glsContourScale(vec2 uv, float t, float amount) {
  if (amount <= 0.0) return 1.0;
  vec2 contour = glsContourWave(atan(uv.y, uv.x), t);
  return 1.0 + clamp(amount, 0.0, 1.0) * glsContourStrength() * contour.x;
}

vec2 glsContourNormal(vec2 uv, float rad, float t, float amount) {
  float distance = length(uv);
  if (distance <= 0.0001) return vec2(0.0);
  vec2 radial = uv / distance;
  vec2 contour = glsContourWave(atan(uv.y, uv.x), t);
  float slope = clamp(amount, 0.0, 1.0) * glsContourStrength() * contour.y;
  vec2 tangent = vec2(-radial.y, radial.x);
  return normalize(radial - tangent * (rad * slope / distance));
}

float mfEdgeD(float soft) {
  return soft - 0.005;
}

vec3 mfEdgeGlow(vec3 col, vec2 uv, vec2 ctr, float rad, float soft, float glow, vec3 glowRGB) {
  if (glow <= 0.0) return col;
  float r = length(uv - ctr);
  float outside = smoothstep(rad - max(soft, 0.0005), rad + max(soft, 0.0005), r);
  return col + glowRGB * (glow * exp(-max(r - rad, 0.0) * 11.0) * outside);
}

void main() {
  // uv01: y invertido para coordenadas do shader
  vec2 fc = vec2(v_uv.x, 1.0 - v_uv.y) * u_size;
  float minDim = max(min(u_size.x, u_size.y), 1.0);
  vec2 uv = (2.0 * fc - u_size) / minDim;

  float rad = max(u_radius, 0.05);
  float t = u_time * u_speed;
  float contourRad = rad * glsContourScale(uv, t, u_contourDeform);

  float maxLimit = contourRad * (1.01 + mfEdgeD(u_edgeSoftness));
  if (length(uv) > maxLimit) {
    vec3 halo = clamp(
      mfEdgeGlow(vec3(0.0), uv, vec2(0.0), contourRad, u_edgeSoftness, u_edgeGlow, u_glowColor.rgb),
      vec3(0.0), vec3(1.0)
    );
    float haloAlpha = max(halo.r, max(halo.g, halo.b));
    gl_FragColor = vec4(halo * haloAlpha, haloAlpha);
    return;
  }

  vec2 p = uv / contourRad;
  float pd = length(p);

  float clearFa = 1.0 - smoothstep(GL_CLEAR_EA, GL_CLEAR_EB, pd);
  vec2 contourNormal = glsContourNormal(uv, rad, t, u_contourDeform);
  vec2 normal = contourNormal;
  float edgeDepth = max(1.0 - pd, 0.0);
  float refractionWidth = 0.015 + 0.95 * clamp(u_shellMidAlpha, 0.0, 1.0);
  float refractionT = edgeDepth / max(refractionWidth, 0.001);
  float refractionProfile = pow(glsRefractionProfile(refractionT), 0.68);
  float refractionAmount = 1.6 * clamp(u_glassOpacity, 0.0, 1.0) * refractionProfile;
  vec2 refractedP = p - normal * refractionAmount;

  vec3 fcol = vec3(0.0);
  if (clearFa > 0.0) {
    if (u_glassEnabled > 0.5) {
      float channelSplit = 0.14 * clamp(u_gloss, 0.0, 2.0) * clamp(u_glassOpacity, 0.0, 1.0) * refractionProfile;
      vec3 redSample = glsBlueDropFluid(refractedP - normal * channelSplit, t);
      vec3 greenSample = glsBlueDropFluid(refractedP, t);
      vec3 blueSample = glsBlueDropFluid(refractedP + normal * channelSplit, t);
      fcol = vec3(redSample.r, greenSample.g, blueSample.b);
    } else {
      fcol = glsBlueDropFluid(p, t);
    }
  }

  float lum = dot(fcol, vec3(0.213, 0.715, 0.072));
  vec3 clearSat = clamp(vec3(lum) + (fcol - vec3(lum)) * 1.22, vec3(0.0), vec3(1.0));
  vec3 col = glsOver(u_canvasColor.rgb, clearSat, 0.99 * clearFa);

  if (u_glassEnabled > 0.5) {
    float surfaceWidth = 0.026 + 0.055 * clamp(u_shellEdgeAlpha, 0.0, 1.0);
    float surfaceBand = (1.0 - smoothstep(0.0, surfaceWidth, edgeDepth)) * clearFa;
    float opticalRim = pow(surfaceBand, 1.8);
    float innerRimAlpha = opticalRim * u_glassOpacity * 0.45;
    col = glsOver(col, u_shellInner.rgb, innerRimAlpha);

    vec2 coolDirection = normalize(vec2(0.84, 0.54));
    vec2 warmDirection = normalize(vec2(-0.62, -0.78));
    float coolSplit = glsHighlightLobe(normal, coolDirection, -0.32, 1.8);
    float warmSplit = glsHighlightLobe(normal, warmDirection, -0.28, 2.0);
    float dispersion = opticalRim * clamp(u_gloss, 0.0, 2.0) * (0.8 + 0.8 * u_shellEdgeAlpha);
    col = glsOver(col, u_shellMid.rgb, dispersion * coolSplit);
    col = glsOver(col, u_shellEdge.rgb, dispersion * warmSplit);

    float edgeShadow = opticalRim * (0.015 + 0.15 * u_shellEdgeAlpha)
                     * (0.15 + 0.85 * max(dot(normal, vec2(0.45, -0.89)), 0.0));
    col = col * (1.0 - edgeShadow);

    vec2 keyDirection = normalize(vec2(-0.68, 0.73));
    vec2 fillDirection = normalize(vec2(0.74, -0.67));
    float key = opticalRim * glsHighlightLobe(normal, keyDirection, 0.2, 2.8)
              * clamp(u_sheen, 0.0, 2.0) * 1.4;
    float fill = opticalRim * glsHighlightLobe(normal, fillDirection, 0.4, 3.6)
               * clamp(u_sheen, 0.0, 2.0) * 1.0;
    col = glsOver(col, u_sheenColor.rgb, key);
    col = glsOver(col, u_specColor.rgb, fill);
  }

  float ballA = 1.0 - smoothstep(0.99 - mfEdgeD(u_edgeSoftness), 1.01 + mfEdgeD(u_edgeSoftness), pd);
  col = clamp(col * max(u_exposure, 0.0), vec3(0.0), vec3(1.0)) * ballA;
  vec3 edged = mfEdgeGlow(col, uv, vec2(0.0), contourRad, u_edgeSoftness, u_edgeGlow, u_glowColor.rgb);
  vec3 finalColor = clamp(edged, vec3(0.0), vec3(1.0));
  float sphereAlpha = clamp(ballA, 0.0, 1.0);

  // Premultiplied alpha compatível com renderização WebGL sobre fundo transparente
  gl_FragColor = vec4(finalColor * sphereAlpha, sphereAlpha);
}
`
