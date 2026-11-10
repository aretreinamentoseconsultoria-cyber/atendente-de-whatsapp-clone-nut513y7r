/**
 * liquidOrbCanvas2D.ts
 *
 * Pipeline Canvas 2D renderizado por software (CPU) para LiquidOrb,
 * servindo como fallback na escada WebGPU -> WebGL -> Canvas 2D (CPU) -> CSS.
 *
 * Características principais:
 * 1. Visual fiel ao preset blueDrop:
 *    - Blob/esfera líquida deformando com ruído suave de contorno (simplex/fBm leve).
 *    - Gradiente radial azul profundo (#020B1D/#0756B8) até ciano (#1EC8FF) com realce claro (#DDFBFF).
 *    - Casca de vidro translúcida com brilho especular em arco no topo (#FFFFFF / #DDFBFF),
 *      casca interna clara (#F6FDFF) e reflexos de borda ciano-azul (#4FD7FF / #466DFF).
 *    - Glow azul externo (#168DFF idle, mais vivo #1EC8FF no thinking).
 *    - Mármore interno com manchas suaves animadas se movendo com o fluxo.
 * 2. Transições contínuas idle <-> thinking:
 *    - Idle: velocidade ~0.27, deformação ~0.028, warp ~1.325.
 *    - Thinking: velocidade ~0.9, deformação ~0.08, warp ~2.65, maior glow e brilho.
 *    - Transição de subida em ~220ms (cúbica) e descida em ~650ms (smoothstep).
 * 3. Renderização centralizada (Singleton) em baixa resolução (ex: 80x80px) por CPU:
 *    - Throttle de FPS para ~30fps para economia extrema de CPU.
 *    - Se houver múltiplas instâncias no mesmo estado, renderiza o orb apenas UMA VEZ por frame.
 *    - Projeta o resultado nas instâncias visíveis via drawImage rápido.
 *    - Pausa automática quando nenhuma instância estiver visível ou documento oculto.
 */

// Resolução interna do canvas compartilhado:
// Elevado para 240px (supersampling 3x-4x de altíssima fidelidade para retina/hi-DPI,
// garantindo contornos sem qualquer aliasing e gradientes contínuos nos tamanhos 18px-72px).
export const INTERNAL_CANVAS_SIZE = 240

const ACTIVATION_DURATION_MS = 220
const SETTLE_DURATION_MS = 650

// Limite estrito de dt para proteger contra saltos bruscos quando a aba perde foco ou há micro-pausas
const MAX_DELTA_SEC = 0.05 // max 50ms (20fps min step)
const MIN_DELTA_SEC = 0.001

// Estado global do mouse normalizado (-1 a 1) com retorno suave ao centro
export interface SharedMouseState {
  // Posição alvo recebida do evento global de mouse (-1 a +1 relativo ao centro da viewport)
  targetX: number
  targetY: number
  // Posição atual interpolada suavemente (lerp)
  currentX: number
  currentY: number
  // Velocidade/energia do movimento para conferir um ritmo orgânico constante
  velocity: number
  // Se o cursor está ativo na janela
  isActive: boolean
}

// Parâmetros para cada estado baseados nos seeds do blueDrop
interface OrbStateParams {
  speed: number
  contourDeform: number
  warp: number
  glowIntensity: number
  marbleSpeed: number
  specularAlpha: number
  innerGlowAlpha: number
}

const IDLE_PARAMS: OrbStateParams = {
  speed: 0.27,
  contourDeform: 0.028,
  warp: 1.325,
  glowIntensity: 0.45,
  marbleSpeed: 0.22,
  specularAlpha: 0.75,
  innerGlowAlpha: 0.35,
}

const THINKING_PARAMS: OrbStateParams = {
  speed: 0.9,
  contourDeform: 0.08,
  warp: 2.65,
  glowIntensity: 0.9,
  marbleSpeed: 0.75,
  specularAlpha: 0.95,
  innerGlowAlpha: 0.65,
}

// Interpolação linear simples
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// Ruído procedural suave e rápido 1D/2D baseado em senos harmônicos
function smoothNoise2D(x: number, y: number): number {
  const n1 = Math.sin(x * 1.41 + y * 0.92)
  const n2 = Math.cos(x * 0.78 - y * 1.63)
  const n3 = Math.sin((x + y) * 2.11)
  return (n1 + n2 + n3 * 0.5) / 2.5
}

// Representação de uma instância de LiquidOrb registrada no motor 2D
export interface Canvas2DOrbInstance {
  id: string
  targetCanvas: HTMLCanvasElement
  getState: () => 'idle' | 'thinking'
  isVisible: () => boolean
}

// Estado interpolado de uma variante (ou instância)
class AnimatedOrbState {
  currentState: 'idle' | 'thinking' = 'idle'
  targetState: 'idle' | 'thinking' = 'idle'
  transitionStartedAt = 0
  activeDuration = SETTLE_DURATION_MS

  currentParams: OrbStateParams = { ...IDLE_PARAMS }
  fromParams: OrbStateParams = { ...IDLE_PARAMS }
  targetParams: OrbStateParams = { ...IDLE_PARAMS }

  motionPhase = 0
  marblePhase = 0

  setTarget(nextState: 'idle' | 'thinking', now: number) {
    if (this.targetState === nextState) return

    this.fromParams = { ...this.currentParams }
    this.targetParams = nextState === 'thinking' ? THINKING_PARAMS : IDLE_PARAMS
    this.targetState = nextState
    this.transitionStartedAt = now
    this.activeDuration = nextState === 'thinking' ? ACTIVATION_DURATION_MS : SETTLE_DURATION_MS
  }

  update(now: number, deltaSec: number) {
    // Easing de transição
    if (this.activeDuration > 0) {
      const raw = Math.min(1, Math.max(0, (now - this.transitionStartedAt) / this.activeDuration))
      const progress =
        this.targetState === 'thinking'
          ? 1 - (1 - raw) ** 3 // Easing cúbico rápido
          : raw * raw * (3 - 2 * raw) // Smoothstep para retorno suave

      this.currentParams.speed = lerp(this.fromParams.speed, this.targetParams.speed, progress)
      this.currentParams.contourDeform = lerp(
        this.fromParams.contourDeform,
        this.targetParams.contourDeform,
        progress,
      )
      this.currentParams.warp = lerp(this.fromParams.warp, this.targetParams.warp, progress)
      this.currentParams.glowIntensity = lerp(
        this.fromParams.glowIntensity,
        this.targetParams.glowIntensity,
        progress,
      )
      this.currentParams.marbleSpeed = lerp(
        this.fromParams.marbleSpeed,
        this.targetParams.marbleSpeed,
        progress,
      )
      this.currentParams.specularAlpha = lerp(
        this.fromParams.specularAlpha,
        this.targetParams.specularAlpha,
        progress,
      )
      this.currentParams.innerGlowAlpha = lerp(
        this.fromParams.innerGlowAlpha,
        this.targetParams.innerGlowAlpha,
        progress,
      )
    }

    // Avanço contínuo das fases de movimento
    this.motionPhase += deltaSec * this.currentParams.speed * 2.2
    this.marblePhase += deltaSec * this.currentParams.marbleSpeed * 1.5
  }
}

/**
 * Desenha o preset blueDrop com alta fidelidade em um contexto 2D de tamanho fixo.
 */
function drawBlueDropToCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: AnimatedOrbState,
  mouse: SharedMouseState,
) {
  ctx.clearRect(0, 0, width, height)

  const cx = width / 2
  const cy = height / 2
  // Raio base da gota líquida interna
  const baseRadius = width * 0.4
  const params = state.currentParams
  const phase = state.motionPhase

  const isThinking = state.targetState === 'thinking'

  // Interatividade com o mouse:
  // mx, my entre -1 e 1 representam deslocamento normalizado da viewport
  const mx = mouse.currentX
  const my = mouse.currentY

  // Deslocamento de paralaxe dinâmico suave
  const parallaxX = mx * baseRadius * 0.14
  const parallaxY = my * baseRadius * 0.14

  // Direção e magnitude do mouse para deformação e rastro da gota
  const mouseDist = Math.hypot(mx, my)
  const mouseAngle = Math.atan2(my, mx)

  // ── 0. CAUDA DE RASTRO SUTIL DO MOVIMENTO DO MOUSE ─────────────────
  // Quando o cursor se move, projeta uma esteira translúcida ciano/azul oposta ao movimento
  if (mouse.velocity > 0.04) {
    const trailEnergy = Math.min(1, mouse.velocity * 0.8)
    const trailDist = mouseDist * baseRadius * 0.22 * trailEnergy
    const trailX = cx - Math.cos(mouseAngle) * trailDist
    const trailY = cy - Math.sin(mouseAngle) * trailDist
    const trailR = baseRadius * (0.85 + trailEnergy * 0.15)

    ctx.save()
    const trailGrad = ctx.createRadialGradient(
      trailX,
      trailY,
      trailR * 0.2,
      trailX,
      trailY,
      trailR * 1.25,
    )
    trailGrad.addColorStop(0, `rgba(30, 200, 255, ${0.16 * trailEnergy})`)
    trailGrad.addColorStop(0.5, `rgba(7, 86, 184, ${0.08 * trailEnergy})`)
    trailGrad.addColorStop(1, 'rgba(2, 11, 29, 0)')
    ctx.fillStyle = trailGrad
    ctx.beginPath()
    ctx.arc(trailX, trailY, trailR * 1.25, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // ── 1. GLOW EXTERNO & HALO COM RESPIRAÇÃO ─────────────────────────
  // Respiração sutil contínua no idle e mais enérgica no thinking
  const breatheFreq = isThinking ? 4.5 : 1.8
  const breatheAmp = isThinking ? 0.08 : 0.035
  const breathe = 1 + Math.sin(phase * breatheFreq) * breatheAmp

  const glowRadius = width * 0.48 * breathe
  const glowCenterX = cx + parallaxX * 0.6
  const glowCenterY = cy + parallaxY * 0.6

  ctx.save()
  const glowGrad = ctx.createRadialGradient(
    glowCenterX,
    glowCenterY,
    baseRadius * 0.4,
    glowCenterX,
    glowCenterY,
    glowRadius,
  )
  if (isThinking) {
    glowGrad.addColorStop(0, `rgba(30, 200, 255, ${0.55 * params.glowIntensity})`)
    glowGrad.addColorStop(0.45, `rgba(99, 102, 241, ${0.32 * params.glowIntensity})`)
    glowGrad.addColorStop(0.75, `rgba(7, 86, 184, ${0.18 * params.glowIntensity})`)
    glowGrad.addColorStop(1, 'rgba(2, 11, 29, 0)')
  } else {
    glowGrad.addColorStop(0, `rgba(22, 141, 255, ${0.34 * params.glowIntensity})`)
    glowGrad.addColorStop(0.55, `rgba(30, 200, 255, ${0.18 * params.glowIntensity})`)
    glowGrad.addColorStop(0.8, `rgba(31, 80, 118, ${0.08 * params.glowIntensity})`)
    glowGrad.addColorStop(1, 'rgba(2, 11, 29, 0)')
  }
  ctx.fillStyle = glowGrad
  ctx.beginPath()
  ctx.arc(glowCenterX, glowCenterY, glowRadius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // ── 2. BLOB LÍQUIDO COM SUPERFÍCIE DEFORMADA ──────────────────────
  // 36 pontos proporcionam curva impecavelmente orgânica via catmull/quadratic com 25% menos CPU que 48
  const points = 36
  const step = (Math.PI * 2) / points
  const deformScale = params.contourDeform * baseRadius * 2.8

  const polyPoints: Array<{ x: number; y: number }> = []

  for (let i = 0; i < points; i++) {
    const angle = i * step
    const nx = Math.cos(angle)
    const ny = Math.sin(angle)

    // Harmônicos proceduralmente enriquecidos idênticos ao VoicePoweredOrb contourDeform:
    // sin(angle * 3.0 + t * 0.62) * 0.52 + sin(angle * 5.0 - t * 0.41 + 1.7) * 0.31 + sin(angle * 2.0 + t * 0.23 + 3.1) * 0.17
    const n =
      Math.sin(angle * 3.0 + phase * 0.62) * 0.52 +
      Math.sin(angle * 5.0 - phase * 0.41 + 1.7) * 0.31 +
      Math.sin(angle * 2.0 + phase * 0.23 + 3.1) * 0.17

    // Estiramento elástico suave na direção do cursor
    const cosDiff = Math.cos(angle - mouseAngle)
    const mouseStretch = Math.max(0, cosDiff) * mouseDist * (baseRadius * 0.085)

    const r = baseRadius + n * deformScale + mouseStretch
    const px = cx + parallaxX * 0.35 + nx * r
    const py = cy + parallaxY * 0.35 + ny * r
    polyPoints.push({ x: px, y: py })
  }

  ctx.save()
  ctx.beginPath()
  const total = polyPoints.length
  const startMidX = (polyPoints[0].x + polyPoints[total - 1].x) / 2
  const startMidY = (polyPoints[0].y + polyPoints[total - 1].y) / 2
  ctx.moveTo(startMidX, startMidY)

  for (let i = 0; i < total; i++) {
    const pCurrent = polyPoints[i]
    const pNext = polyPoints[(i + 1) % total]
    const midX = (pCurrent.x + pNext.x) / 2
    const midY = (pCurrent.y + pNext.y) / 2
    ctx.quadraticCurveTo(pCurrent.x, pCurrent.y, midX, midY)
  }
  ctx.closePath()

  // Preenchimento gradiente radial blueDrop fiel
  const gradCx = cx - baseRadius * 0.18 + parallaxX * 0.5
  const gradCy = cy - baseRadius * 0.22 + parallaxY * 0.5
  const bodyGrad = ctx.createRadialGradient(
    gradCx,
    gradCy,
    baseRadius * 0.08,
    cx + parallaxX * 0.2,
    cy + parallaxY * 0.2,
    baseRadius * 1.08,
  )
  bodyGrad.addColorStop(0, '#DDFBFF')
  bodyGrad.addColorStop(0.24, '#1EC8FF')
  bodyGrad.addColorStop(0.6, '#0756B8')
  bodyGrad.addColorStop(0.86, '#020B1D')
  bodyGrad.addColorStop(1, '#01040A')

  ctx.fillStyle = bodyGrad
  ctx.fill()

  // ── 3. INTERIOR DA GOTA (Mármore de fluxo + Partículas/Raios de Luz Internos) ──
  ctx.clip() // Confinado dentro da gota líquida

  const mPhase = state.marblePhase
  // Mármore fluido 1
  const m1X = cx + Math.sin(mPhase * 0.8) * baseRadius * 0.35 + parallaxX * 0.9
  const m1Y = cy + Math.cos(mPhase * 0.6) * baseRadius * 0.3 + parallaxY * 0.9
  const m1Grad = ctx.createRadialGradient(m1X, m1Y, 0, m1X, m1Y, baseRadius * 0.75)
  m1Grad.addColorStop(0, isThinking ? 'rgba(30, 200, 255, 0.6)' : 'rgba(30, 200, 255, 0.45)')
  m1Grad.addColorStop(0.5, 'rgba(7, 86, 184, 0.22)')
  m1Grad.addColorStop(1, 'rgba(7, 86, 184, 0)')
  ctx.fillStyle = m1Grad
  ctx.fillRect(0, 0, width, height)

  // Mármore fluido 2 (clarão interno)
  const m2X = cx + Math.cos(mPhase * 1.1) * baseRadius * 0.4 - parallaxX * 0.7
  const m2Y = cy + Math.sin(mPhase * 0.9) * baseRadius * 0.45 - parallaxY * 0.7
  const m2Grad = ctx.createRadialGradient(m2X, m2Y, 0, m2X, m2Y, baseRadius * 0.65)
  m2Grad.addColorStop(0, isThinking ? 'rgba(221, 251, 255, 0.55)' : 'rgba(221, 251, 255, 0.42)')
  m2Grad.addColorStop(0.6, 'rgba(30, 200, 255, 0.18)')
  m2Grad.addColorStop(1, 'rgba(2, 11, 29, 0)')
  ctx.fillStyle = m2Grad
  ctx.fillRect(0, 0, width, height)

  // ── 3.1. PARTÍCULAS BIOLUMINESCENTES ORBITANDO INTERNAMENTE (Alinhadas ao VoicePoweredOrb) ─
  // 4 partículas bioluminescentes ciano e azul claro que orbitam a gota com a mesma velocidade e fase do shader
  const particleSpeed = isThinking ? 2.2 : 1.2
  const pSpeed = phase * particleSpeed

  const particleDefs = [
    {
      a: 0.0,
      speedMul: 1.0,
      rX: 0.55,
      rY: 0.25,
      tilt: -0.15,
      size: 2.6,
      alpha: 0.85,
      ciano: false,
    }, // #DDFBFF
    { a: 2.1, speedMul: 1.0, rX: 0.25, rY: 0.6, tilt: 0.25, size: 2.0, alpha: 0.75, ciano: true }, // #1EC8FF
    { a: 4.2, speedMul: 0.8, rX: 0.65, rY: 0.2, tilt: 0.35, size: 2.4, alpha: 0.8, ciano: false }, // #DDFBFF
    { a: 1.2, speedMul: 1.2, rX: 0.2, rY: 0.2, tilt: -0.45, size: 1.8, alpha: 0.7, ciano: true }, // #1EC8FF
  ]

  for (let i = 0; i < particleDefs.length; i++) {
    const p = particleDefs[i]
    const currentAngle = pSpeed * p.speedMul + p.a
    const rawX = Math.cos(currentAngle) * baseRadius * p.rX
    const rawY = Math.sin(currentAngle) * baseRadius * p.rY
    // Rotação de inclinação orbital
    const cosT = Math.cos(p.tilt)
    const sinT = Math.sin(p.tilt)
    const px = cx + (rawX * cosT - rawY * sinT) + parallaxX * 0.75
    const py = cy + (rawX * sinT + rawY * cosT) + parallaxY * 0.75

    // Variação de profundidade (frente/fundo da esfera)
    const depth = (Math.sin(currentAngle) + 1) * 0.5 // 0 a 1
    const pRadius = p.size * (0.75 + depth * 0.5)
    const pAlpha = p.alpha * (0.35 + depth * 0.65) * (isThinking ? 1.3 : 0.95)

    const pGrad = ctx.createRadialGradient(px, py, 0, px, py, pRadius * 2.8)
    if (!p.ciano) {
      // #DDFBFF / #1EC8FF / #0756B8
      pGrad.addColorStop(0, `rgba(221, 251, 255, ${Math.min(1, pAlpha * 1.15)})`)
      pGrad.addColorStop(0.35, `rgba(30, 200, 255, ${pAlpha * 0.85})`)
      pGrad.addColorStop(1, 'rgba(7, 86, 184, 0)')
    } else {
      // #1EC8FF / #4FD7FF / #020B1D
      pGrad.addColorStop(0, `rgba(30, 200, 255, ${Math.min(1, pAlpha * 1.1)})`)
      pGrad.addColorStop(0.45, `rgba(79, 215, 255, ${pAlpha * 0.75})`)
      pGrad.addColorStop(1, 'rgba(2, 11, 29, 0)')
    }

    ctx.fillStyle = pGrad
    ctx.beginPath()
    ctx.arc(px, py, pRadius * 2.8, 0, Math.PI * 2)
    ctx.fill()
  }

  // Reflexo de anel interno / ciano-azul profundo
  const innerRingGrad = ctx.createRadialGradient(
    cx + parallaxX * 0.3,
    cy + parallaxY * 0.3,
    baseRadius * 0.65,
    cx + parallaxX * 0.3,
    cy + parallaxY * 0.3,
    baseRadius,
  )
  innerRingGrad.addColorStop(0, 'rgba(30, 200, 255, 0)')
  innerRingGrad.addColorStop(0.78, 'rgba(79, 215, 255, 0.42)')
  innerRingGrad.addColorStop(1, 'rgba(70, 109, 255, 0.62)')
  ctx.fillStyle = innerRingGrad
  ctx.fillRect(0, 0, width, height)

  ctx.restore()

  // ── 4. CASCA DE VIDRO (SHELL) COM REFLEXO ESPECULAR E BRILHO ─────
  ctx.save()

  // Casca externa translúcida clara (#F6FDFF) com anel de refração
  const shellX = cx + parallaxX * 0.15
  const shellY = cy + parallaxY * 0.15
  ctx.beginPath()
  ctx.arc(shellX, shellY, baseRadius + 0.6, 0, Math.PI * 2)
  const shellBorderGrad = ctx.createLinearGradient(
    shellX - baseRadius,
    shellY - baseRadius,
    shellX + baseRadius,
    shellY + baseRadius,
  )
  shellBorderGrad.addColorStop(0, 'rgba(246, 253, 255, 0.85)') // Topo claro
  shellBorderGrad.addColorStop(0.35, 'rgba(79, 215, 255, 0.58)') // Borda ciano #4FD7FF
  shellBorderGrad.addColorStop(0.75, 'rgba(70, 109, 255, 0.42)') // Base azul #466DFF
  shellBorderGrad.addColorStop(1, 'rgba(2, 11, 29, 0.4)')
  ctx.strokeStyle = shellBorderGrad
  ctx.lineWidth = 1.45
  ctx.stroke()

  // ── 5. BRILHO ESPECULAR NO TOPO (Arco / Elipse clara primária a -25°) ─────
  const specX = cx - baseRadius * 0.16 + parallaxX * 0.25
  const specY = cy - baseRadius * 0.42 + parallaxY * 0.25
  const specRadiusX = baseRadius * 0.42
  const specRadiusY = baseRadius * 0.2
  // Rotação exata a -25° (-0.436 rad) no topo superior esquerdo com paralaxe sutil
  const specAngle = (-25 * Math.PI) / 180 + mx * 0.12

  ctx.beginPath()
  ctx.ellipse(specX, specY, specRadiusX, specRadiusY, specAngle, 0, Math.PI * 2)
  const specGrad = ctx.createRadialGradient(
    specX - specRadiusX * 0.1,
    specY - specRadiusY * 0.2,
    0,
    specX,
    specY,
    specRadiusX,
  )
  specGrad.addColorStop(0, `rgba(255, 255, 255, ${0.98 * params.specularAlpha})`)
  specGrad.addColorStop(0.38, `rgba(234, 251, 255, ${0.85 * params.specularAlpha})`) // #EAFBFF
  specGrad.addColorStop(0.68, `rgba(221, 251, 255, ${0.65 * params.specularAlpha})`) // #DDFBFF
  specGrad.addColorStop(0.88, `rgba(30, 200, 255, ${0.2 * params.specularAlpha})`) // #1EC8FF
  specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = specGrad
  ctx.fill()

  // ── 6. REALCE ESPECULAR SECUNDÁRIO NA BORDA OPONENTE ─────────────
  // Simula refração de borda oposta (vidro translúcido da gota: specPos2 = vec2(0.32, -0.38))
  const subSpecX = cx + baseRadius * 0.32 + parallaxX * 0.2
  const subSpecY = cy + baseRadius * 0.38 + parallaxY * 0.2
  ctx.beginPath()
  ctx.ellipse(
    subSpecX,
    subSpecY,
    baseRadius * 0.22,
    baseRadius * 0.11,
    Math.PI / 4 - my * 0.1,
    0,
    Math.PI * 2,
  )
  const subSpecGrad = ctx.createRadialGradient(
    subSpecX,
    subSpecY,
    0,
    subSpecX,
    subSpecY,
    baseRadius * 0.22,
  )
  subSpecGrad.addColorStop(0, `rgba(221, 251, 255, ${0.65 * params.specularAlpha})`) // #DDFBFF
  subSpecGrad.addColorStop(0.5, `rgba(79, 215, 255, ${0.38 * params.specularAlpha})`) // #4FD7FF
  subSpecGrad.addColorStop(1, 'rgba(79, 215, 255, 0)')
  ctx.fillStyle = subSpecGrad
  ctx.fill()

  // Realce sutil pontual terciário de reflexo especular na borda esquerda inferior
  const rimSpecX = cx - baseRadius * 0.36 + parallaxX * 0.15
  const rimSpecY = cy + baseRadius * 0.32 + parallaxY * 0.15
  ctx.beginPath()
  ctx.arc(rimSpecX, rimSpecY, baseRadius * 0.08, 0, Math.PI * 2)
  const rimGrad = ctx.createRadialGradient(
    rimSpecX,
    rimSpecY,
    0,
    rimSpecX,
    rimSpecY,
    baseRadius * 0.08,
  )
  rimGrad.addColorStop(0, `rgba(221, 251, 255, ${0.45 * params.specularAlpha})`)
  rimGrad.addColorStop(1, 'rgba(221, 251, 255, 0)')
  ctx.fillStyle = rimGrad
  ctx.fill()

  ctx.restore()
}

/**
 * Singleton Gerenciador Compartilhado do Canvas 2D
 */
class LiquidOrbCanvas2DManager {
  private instances = new Map<string, Canvas2DOrbInstance>()
  private internalCanvases = {
    idle: document.createElement('canvas'),
    thinking: document.createElement('canvas'),
  }
  private internalContexts = {
    idle: null as CanvasRenderingContext2D | null,
    thinking: null as CanvasRenderingContext2D | null,
  }

  private states = {
    idle: new AnimatedOrbState(),
    thinking: new AnimatedOrbState(),
  }

  // Estado global suave do mouse compartilhado por todas as instâncias
  private mouseState: SharedMouseState = {
    targetX: 0,
    targetY: 0,
    currentX: 0,
    currentY: 0,
    velocity: 0,
    isActive: false,
  }

  private animationFrameId: number | null = null
  private lastFrameTimestamp = 0
  private lastUpdateTimestamp = 0
  private lastMouseMoveTime = 0
  private isDocumentVisible = true
  private initialized = false

  constructor() {
    this.initInternalCanvases()
    this.states.idle.setTarget('idle', 0)
    this.states.thinking.setTarget('thinking', 0)
  }

  private initInternalCanvases() {
    const size = INTERNAL_CANVAS_SIZE
    for (const key of ['idle', 'thinking'] as const) {
      const c = this.internalCanvases[key]
      c.width = size
      c.height = size
      const ctx = c.getContext('2d', { alpha: true })
      this.internalContexts[key] = ctx
    }
  }

  public register(instance: Canvas2DOrbInstance) {
    this.instances.set(instance.id, instance)

    if (!this.initialized) {
      this.setupVisibilityListeners()
      this.setupMouseListeners()
      this.initialized = true
    }

    this.startLoopIfNeeded()
  }

  public unregister(id: string) {
    this.instances.delete(id)
    if (this.instances.size === 0) {
      this.stopLoop()
    }
  }

  private setupVisibilityListeners() {
    if (typeof document === 'undefined') return
    const handleVisChange = () => {
      this.isDocumentVisible = !document.hidden
      if (this.isDocumentVisible) {
        this.startLoopIfNeeded()
      }
    }
    document.addEventListener('visibilitychange', handleVisChange)
  }

  public getMouseState(): SharedMouseState {
    return this.mouseState
  }

  private setupMouseListeners() {
    if (typeof window === 'undefined') return

    let ticking = false
    const handleMouseMove = (e: MouseEvent) => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        // Normaliza coordenadas relativas ao centro da janela (-1.0 a +1.0)
        const halfW = window.innerWidth / 2
        const halfH = window.innerHeight / 2
        if (halfW > 0 && halfH > 0) {
          // Clamp de -1 a 1
          const rawX = (e.clientX - halfW) / halfW
          const rawY = (e.clientY - halfH) / halfH
          this.mouseState.targetX = Math.max(-1, Math.min(1, rawX))
          this.mouseState.targetY = Math.max(-1, Math.min(1, rawY))
          this.mouseState.isActive = true
          this.lastMouseMoveTime = performance.now()
        }
      })
    }

    const handleMouseLeave = () => {
      // Quando o cursor sai da janela, retorna calmamente ao centro (0, 0)
      this.mouseState.targetX = 0
      this.mouseState.targetY = 0
      this.mouseState.isActive = false
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    document.documentElement.addEventListener('mouseleave', handleMouseLeave, { passive: true })
  }

  private startLoopIfNeeded() {
    if (this.animationFrameId !== null) return
    this.lastFrameTimestamp = performance.now()
    this.lastUpdateTimestamp = performance.now()
    this.animationFrameId = requestAnimationFrame(this.renderLoop)
  }

  private stopLoop() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }

  private renderLoop = (timestamp: number) => {
    this.animationFrameId = requestAnimationFrame(this.renderLoop)

    if (!this.isDocumentVisible || this.instances.size === 0) {
      this.lastUpdateTimestamp = timestamp
      this.lastFrameTimestamp = timestamp
      return
    }

    // Clamp de deltaSec estrito (0.001s a 0.05s) para eliminar saltos bruscos
    // quando a aba ganha foco ou sofre atraso momentâneo de frame.
    const rawDelta = (timestamp - this.lastUpdateTimestamp) / 1000
    const deltaSec = Math.min(MAX_DELTA_SEC, Math.max(MIN_DELTA_SEC, rawDelta))
    this.lastFrameTimestamp = timestamp
    this.lastUpdateTimestamp = timestamp

    // Se o mouse estiver inativo por mais de 3.5 segundos, desacelera suavemente de volta ao centro
    if (this.mouseState.isActive && timestamp - this.lastMouseMoveTime > 3500) {
      this.mouseState.targetX = 0
      this.mouseState.targetY = 0
    }

    // Interpolação amortecida exponencial com damping independente do framerate:
    // lerpFactor = 1 - Math.exp(-damping * deltaSec)
    // Mantém a inércia líquida idêntica em 30fps, 60fps ou 120fps sem trancos
    const damping = 5.2
    const expLerpFactor = 1 - Math.exp(-damping * deltaSec)
    const prevX = this.mouseState.currentX
    const prevY = this.mouseState.currentY
    this.mouseState.currentX = lerp(
      this.mouseState.currentX,
      this.mouseState.targetX,
      expLerpFactor,
    )
    this.mouseState.currentY = lerp(
      this.mouseState.currentY,
      this.mouseState.targetY,
      expLerpFactor,
    )

    const moveDist = Math.hypot(this.mouseState.currentX - prevX, this.mouseState.currentY - prevY)
    const velDamping = 1 - Math.exp(-8.0 * deltaSec)
    this.mouseState.velocity = lerp(this.mouseState.velocity, moveDist * 16, velDamping)

    // 1. Identificar quais estados estão visíveis atualmente na tela
    let hasVisibleIdle = false
    let hasVisibleThinking = false

    const visibleInstances: Canvas2DOrbInstance[] = []

    for (const inst of this.instances.values()) {
      if (inst.isVisible()) {
        visibleInstances.push(inst)
        const st = inst.getState()
        if (st === 'thinking') {
          hasVisibleThinking = true
        } else {
          hasVisibleIdle = true
        }
      }
    }

    if (visibleInstances.length === 0) {
      return
    }

    // 2. Renderizar internamente no máximo UMA VEZ por estado ativo
    if (hasVisibleIdle && this.internalContexts.idle) {
      this.states.idle.setTarget('idle', timestamp)
      // Ritmo adicional do mouse: quando o cursor se move, a gota tem um pulsar ligeiramente mais vivo
      const effectiveDelta = deltaSec * (1.0 + Math.min(0.4, this.mouseState.velocity * 0.5))
      this.states.idle.update(timestamp, effectiveDelta)
      drawBlueDropToCanvas(
        this.internalContexts.idle,
        INTERNAL_CANVAS_SIZE,
        INTERNAL_CANVAS_SIZE,
        this.states.idle,
        this.mouseState,
      )
    }

    if (hasVisibleThinking && this.internalContexts.thinking) {
      this.states.thinking.setTarget('thinking', timestamp)
      const effectiveDelta = deltaSec * (1.0 + Math.min(0.3, this.mouseState.velocity * 0.4))
      this.states.thinking.update(timestamp, effectiveDelta)
      drawBlueDropToCanvas(
        this.internalContexts.thinking,
        INTERNAL_CANVAS_SIZE,
        INTERNAL_CANVAS_SIZE,
        this.states.thinking,
        this.mouseState,
      )
    }

    // 3. Projetar (blitting rápido via drawImage com suavização ativa) para cada canvas de instância visível
    for (const inst of visibleInstances) {
      const targetCanvas = inst.targetCanvas
      const st = inst.getState()
      const sourceCanvas =
        st === 'thinking' ? this.internalCanvases.thinking : this.internalCanvases.idle

      const rawDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
      const dpr = Math.min(3, Math.max(2, rawDpr))
      const clientW = targetCanvas.clientWidth || parseFloat(targetCanvas.style.width) || 36
      const clientH = targetCanvas.clientHeight || parseFloat(targetCanvas.style.height) || 36
      const targetW = Math.max(1, Math.floor(clientW * dpr))
      const targetH = Math.max(1, Math.floor(clientH * dpr))

      if (targetCanvas.width !== targetW || targetCanvas.height !== targetH) {
        targetCanvas.width = targetW
        targetCanvas.height = targetH
      }

      const targetCtx = targetCanvas.getContext('2d')
      if (targetCtx) {
        // Garantir interpolação bicúbica/suave de alta qualidade para downscale nítido
        targetCtx.imageSmoothingEnabled = true
        targetCtx.imageSmoothingQuality = 'high'
        targetCtx.clearRect(0, 0, targetW, targetH)
        targetCtx.drawImage(sourceCanvas, 0, 0, targetW, targetH)
      }
    }
  }
}

// Instância singleton global do gerenciador
let globalCanvas2DManager: LiquidOrbCanvas2DManager | null = null

export function getSharedCanvas2DManager(): LiquidOrbCanvas2DManager {
  if (!globalCanvas2DManager) {
    globalCanvas2DManager = new LiquidOrbCanvas2DManager()
  }
  return globalCanvas2DManager
}
