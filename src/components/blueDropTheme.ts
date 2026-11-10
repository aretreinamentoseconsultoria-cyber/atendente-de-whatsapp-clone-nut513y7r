/**
 * blueDropTheme.ts
 *
 * Constantes visuais compartilhadas entre o pipeline WebGL (VoicePoweredOrb / Shaders GLSL)
 * e o pipeline Canvas 2D CPU (LiquidOrb / liquidOrbCanvas2D.ts).
 *
 * O Canvas 2D blueDrop é a referência "padrão ouro" elogiada pelo usuário:
 * - Gota líquida de vidro azul lisa, límpida, sem textura granulada ou espumosa.
 * - Gradiente radial volumétrico suave:
 *     #DDFBFF (núcleo superior iluminado) -> #1EC8FF (ciano elétrico) ->
 *     #0756B8 (azul profundo) -> #020B1D (fundo escuro da gota) -> #01040A (borda/limiar).
 * - Mármore interno com manchas suaves e difusas (lente de fluido), sem ruído de alta frequência.
 * - Casca translúcida com anel de refração ciano/azul (#F6FDFF, #4FD7FF, #466DFF).
 * - 4 partículas bioluminescentes discretas orbitando internamente com esferas suaves.
 * - Brilho especular primário no topo inclinado a -25° (-0.436 rad) e especular secundário na base oposta.
 * - Contorno orgânico harmônico suave (modos 3.0, 5.0, 2.0).
 */

export interface ColorRGB {
  r: number
  g: number
  b: number
}

// ── 1. PALETA HEXADECIMAL & RGB NORMALIZADO (0.0 a 1.0) ──────────────────────
export const BLUEDROP_COLORS = {
  // Cores do corpo da gota
  coreHighlight: { hex: '#DDFBFF', r: 0.8667, g: 0.9843, b: 1.0 }, // Luz central / ápice
  cyanElectric: { hex: '#1EC8FF', r: 0.1176, g: 0.7843, b: 1.0 }, // Ciano vívido intermediário
  deepBlue: { hex: '#0756B8', r: 0.0275, g: 0.3373, b: 0.7216 }, // Azul profundo corporal
  dropDark: { hex: '#020B1D', r: 0.0078, g: 0.0314, b: 0.0706 }, // Sombra de fundo da gota
  dropBottom: { hex: '#01040A', r: 0.0039, g: 0.0157, b: 0.0392 }, // Base escura

  // Casca de vidro e refração
  shellInner: { hex: '#F6FDFF', r: 0.9647, g: 0.9922, b: 1.0 }, // Casca interna translúcida
  shellCyan: { hex: '#4FD7FF', r: 0.3098, g: 0.8431, b: 1.0 }, // Refração de borda ciano
  shellBlue: { hex: '#466DFF', r: 0.2745, g: 0.4275, b: 1.0 }, // Refração de borda azul
  specularWhite: { hex: '#FFFFFF', r: 1.0, g: 1.0, b: 1.0 }, // Centro do especular puro
  specularSoft: { hex: '#EAFBFF', r: 0.9176, g: 0.9843, b: 1.0 }, // Realce suave de especular

  // Halo e brilho externo
  glowIdle: { hex: '#168DFF', r: 0.0863, g: 0.5529, b: 1.0 }, // Glow suave no idle
  glowThinking: { hex: '#1EC8FF', r: 0.1176, g: 0.7843, b: 1.0 }, // Glow elétrico no thinking
} as const

// ── 2. GEOMETRIA DO CONTORNO ORGÂNICO ────────────────────────────────────────
// Fórmula harmônica idêntica:
// wave(ang, t) = sin(ang * 3.0 + t * 0.62) * 0.52
//              + sin(ang * 5.0 - t * 0.41 + 1.7) * 0.31
//              + sin(ang * 2.0 + t * 0.23 + 3.1) * 0.17
export const CONTOUR_HARMONICS = {
  h1: { freq: 3.0, speed: 0.62, phase: 0.0, amp: 0.52 },
  h2: { freq: 5.0, speed: -0.41, phase: 1.7, amp: 0.31 },
  h3: { freq: 2.0, speed: 0.23, phase: 3.1, amp: 0.17 },
  baseRadiusFactor: 0.8, // Raio base normalizado da gota dentro do canvas (-1 a 1)
  deformScaleIdle: 0.038,
  deformScaleThinking: 0.075,
} as const

// ── 3. ESPECULARES DE VIDRO (Posições relativas e rotações) ──────────────────
// Especular primário superior esquerdo a -25° (-0.4363 radianos)
export const SPECULAR_PRIMARY = {
  angleDeg: -25,
  angleRad: (-25 * Math.PI) / 180, // -0.436332
  cosA: Math.cos((-25 * Math.PI) / 180), // ~0.9063
  sinA: Math.sin((-25 * Math.PI) / 180), // ~-0.4226
  relX: -0.16, // relativo ao raio da gota (deslocado para a esquerda)
  relY: 0.42, // relativo ao raio da gota (no topo)
  radiusX: 0.42, // semieixo maior
  radiusY: 0.2, // semieixo menor
  alphaIdle: 0.95,
  alphaThinking: 0.98,
} as const

// Especular secundário inferior direito (reflexo do vidro oposto)
export const SPECULAR_SECONDARY = {
  relX: 0.32,
  relY: -0.38,
  radiusX: 0.22,
  radiusY: 0.11,
  angleRad: Math.PI / 4,
  alpha: 0.6,
} as const

// Especular terciário de borda inferior esquerda
export const SPECULAR_TERTIARY = {
  relX: -0.36,
  relY: -0.32,
  radius: 0.08,
  alpha: 0.4,
} as const

// ── 4. PARTÍCULAS BIOLUMINESCENTES ORBITAIS (4 partículas) ───────────────────
export interface ParticleOrbitalDef {
  initialPhase: number
  speedMultiplier: number
  radiusX: number
  radiusY: number
  tiltRad: number
  sizeNorm: number // Tamanho normalizado relativo ao raio da gota
  alphaBase: number
  isCyan: boolean // true = #1EC8FF, false = #DDFBFF
}

export const PARTICLE_DEFINITIONS: readonly ParticleOrbitalDef[] = [
  {
    initialPhase: 0.0,
    speedMultiplier: 1.0,
    radiusX: 0.55,
    radiusY: 0.25,
    tiltRad: -0.15,
    sizeNorm: 0.038,
    alphaBase: 0.85,
    isCyan: false, // #DDFBFF
  },
  {
    initialPhase: 2.1,
    speedMultiplier: 1.0,
    radiusX: 0.25,
    radiusY: 0.6,
    tiltRad: 0.25,
    sizeNorm: 0.032,
    alphaBase: 0.75,
    isCyan: true, // #1EC8FF
  },
  {
    initialPhase: 4.2,
    speedMultiplier: 0.8,
    radiusX: 0.65,
    radiusY: 0.2,
    tiltRad: 0.35,
    sizeNorm: 0.036,
    alphaBase: 0.8,
    isCyan: false, // #DDFBFF
  },
  {
    initialPhase: 1.2,
    speedMultiplier: 1.2,
    radiusX: 0.2,
    radiusY: 0.2,
    tiltRad: -0.45,
    sizeNorm: 0.028,
    alphaBase: 0.7,
    isCyan: true, // #1EC8FF
  },
] as const

// ── 5. GRADIENTE RADIAL BLUE DROP EM PARÂMETROS UNIFORMIZADOS ────────────────
// Stops radiais: [stop, hex, rgb]
export const BLUE_DROP_RADIAL_STOPS = [
  { stop: 0.0, hex: BLUEDROP_COLORS.coreHighlight.hex, ...BLUEDROP_COLORS.coreHighlight },
  { stop: 0.24, hex: BLUEDROP_COLORS.cyanElectric.hex, ...BLUEDROP_COLORS.cyanElectric },
  { stop: 0.6, hex: BLUEDROP_COLORS.deepBlue.hex, ...BLUEDROP_COLORS.deepBlue },
  { stop: 0.86, hex: BLUEDROP_COLORS.dropDark.hex, ...BLUEDROP_COLORS.dropDark },
  { stop: 1.0, hex: BLUEDROP_COLORS.dropBottom.hex, ...BLUEDROP_COLORS.dropBottom },
] as const
