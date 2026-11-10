'use client'

import React, { useEffect, useRef, FC } from 'react'
import { Renderer, Program, Mesh, Triangle, Vec3 } from 'ogl'
import { cn } from '@/lib/utils'
import { BLUEDROP_COLORS, SPECULAR_PRIMARY, SPECULAR_SECONDARY } from '@/components/blueDropTheme'

interface VoicePoweredOrbProps {
  className?: string
  hue?: number
  enableVoiceControl?: boolean
  voiceSensitivity?: number
  maxRotationSpeed?: number
  maxHoverIntensity?: number
  onVoiceDetected?: (detected: boolean) => void
  onError?: (error: Error) => void
}

export const VoicePoweredOrb: FC<VoicePoweredOrbProps> = ({
  className,
  hue = 0,
  enableVoiceControl = false,
  voiceSensitivity = 1.5,
  maxRotationSpeed = 1.2,
  maxHoverIntensity = 0.8,
  onVoiceDetected,
  onError,
}) => {
  const ctnDom = useRef<HTMLDivElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const animationFrameRef = useRef<number | undefined>(undefined)
  const mediaStreamRef = useRef<MediaStream | null>(null)

  // Latest refs para props e callbacks que mudam dinamicamente sem teardown do WebGL
  const propsRef = useRef({
    hue,
    voiceSensitivity,
    maxRotationSpeed,
    maxHoverIntensity,
    onVoiceDetected,
    onError,
  })
  useEffect(() => {
    propsRef.current = {
      hue,
      voiceSensitivity,
      maxRotationSpeed,
      maxHoverIntensity,
      onVoiceDetected,
      onError,
    }
  })

  const vert = /* glsl */ `
    precision highp float;
    attribute vec2 position;
    attribute vec2 uv;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `

  const frag = /* glsl */ `
    precision highp float;

    uniform float iTime;
    uniform vec3 iResolution;
    uniform float hue;
    uniform float hover;
    uniform float rot;
    uniform float hoverIntensity;
    varying vec2 vUv;

    vec3 rgb2yiq(vec3 c) {
      float y = dot(c, vec3(0.299, 0.587, 0.114));
      float i = dot(c, vec3(0.596, -0.274, -0.322));
      float q = dot(c, vec3(0.211, -0.523, 0.312));
      return vec3(y, i, q);
    }

    vec3 yiq2rgb(vec3 c) {
      float r = c.x + 0.956 * c.y + 0.621 * c.z;
      float g = c.x - 0.272 * c.y - 0.647 * c.z;
      float b = c.x - 1.106 * c.y + 1.703 * c.z;
      return vec3(r, g, b);
    }

    vec3 adjustHue(vec3 color, float hueDeg) {
      float hueRad = hueDeg * 3.14159265 / 180.0;
      vec3 yiq = rgb2yiq(color);
      float cosA = cos(hueRad);
      float sinA = sin(hueRad);
      float i = yiq.y * cosA - yiq.z * sinA;
      float q = yiq.y * sinA + yiq.z * cosA;
      yiq.y = i;
      yiq.z = q;
      return yiq2rgb(yiq);
    }



    // ── Paleta oficial blueDrop (Canvas 2D / Style 20) ────────────────────────
    const vec3 colorA = vec3(0.00392, 0.01569, 0.03922); // #01040A borda escura extrema
    const vec3 colorB = vec3(0.00784, 0.03137, 0.07058); // #020B1D fundo escuro da gota
    const vec3 colorC = vec3(0.02745, 0.33725, 0.72156); // #0756B8 azul profundo
    const vec3 colorD = vec3(0.11764, 0.78431, 1.00000); // #1EC8FF ciano elétrico
    const vec3 colorE = vec3(0.86667, 0.98431, 1.00000); // #DDFBFF núcleo claro
    const vec3 highlightCol = vec3(0.91764, 0.98431, 1.00000); // #EAFBFF
    const vec3 shellInnerCol = vec3(0.9647, 0.9922, 1.0000); // #F6FDFF casca interna
    const vec3 shellMidCol = vec3(0.3098, 0.8431, 1.0000);   // #4FD7FF refração ciano
    const vec3 shellEdgeCol = vec3(0.2745, 0.4275, 1.0000);  // #466DFF refração azul
    const vec3 glowColor = vec3(0.0863, 0.5529, 1.0000);     // #168DFF glow

    // Gradiente radial da gota lisa blueDrop (exatamente idêntico ao corpo radial do Canvas 2D)
    // Canvas 2D:
    // bodyGrad.addColorStop(0, '#DDFBFF');
    // bodyGrad.addColorStop(0.24, '#1EC8FF');
    // bodyGrad.addColorStop(0.6, '#0756B8');
    // bodyGrad.addColorStop(0.86, '#020B1D');
    // bodyGrad.addColorStop(1, '#01040A');
    vec3 blueDropRadialBody(float r) {
      vec3 col = colorE; // #DDFBFF
      col = mix(col, colorD, smoothstep(0.00, 0.24, r)); // -> #1EC8FF
      col = mix(col, colorC, smoothstep(0.24, 0.60, r)); // -> #0756B8
      col = mix(col, colorB, smoothstep(0.60, 0.86, r)); // -> #020B1D
      col = mix(col, colorA, smoothstep(0.86, 1.08, r)); // -> #01040A
      return col;
    }

    // Deformação harmônica de contorno orgânico (exatamente os modos 3.0, 5.0, 2.0 do Canvas 2D)
    float contourDeform(float angle, float t) {
      return sin(angle * 3.0 + t * 0.62) * 0.52
           + sin(angle * 5.0 - t * 0.41 + 1.7) * 0.31
           + sin(angle * 2.0 + t * 0.23 + 3.1) * 0.17;
    }

    vec4 drawBlueDrop(vec2 uv) {
      float t = iTime * 0.8;
      // uv normalizado no espaço [-1, 1], centro em (0, 0)
      // No Canvas 2D: baseRadius = width * 0.4 (num canvas normalizado, equivale a raio ~0.80)
      float baseRad = 0.80;
      float ang = atan(uv.y, uv.x);
      float d = length(uv);

      // Respiração orgânica sutil do contorno
      float wave = contourDeform(ang, t);
      // deformScale calibrada com Canvas 2D: contourDeform (~0.035) * baseRadius
      float deformRad = baseRad * (1.0 + 0.038 * wave);

      // Se estiver muito fora da gota, calcula o halo difuso azul (#168DFF)
      if (d > deformRad * 1.30) {
        float haloDist = d - deformRad;
        float haloAlpha = exp(-max(haloDist, 0.0) * 9.0) * 0.22;
        vec3 haloRgb = adjustHue(glowColor, hue);
        return vec4(haloRgb * haloAlpha, haloAlpha);
      }

      // Normalização da gota para esfera 3D interna
      vec2 p = uv / deformRad;
      float pd = length(p);
      float depth = sqrt(max(1.0 - clamp(pd * pd, 0.0, 1.0), 0.0));

      // ── CORPO LÍQUIDO LISO BLUE DROP (Gradiente radial da gota) ────────
      // No Canvas 2D: centro do gradiente é deslocado para cima e para a esquerda
      // gradCx = cx - baseRadius * 0.18; gradCy = cy - baseRadius * 0.22 (em coordenadas 2D)
      // No espaço normalizado com y para cima: gradCenter = vec2(-0.18, 0.22)
      vec2 gradCenter = vec2(-0.18, 0.22);
      float bodyDist = length(p - gradCenter);
      vec3 fluidCol = blueDropRadialBody(bodyDist);

      // ── MÁRMORE INTERNO SUAVE (SEM GRANULAÇÃO) ──────────────────────────
      // Simula as 2 manchas fluidas do Canvas 2D m1Grad e m2Grad de grande raio (0.75 e 0.65)
      // Mármore 1 (mancha ciano suave circulando lentamente)
      float mPhase = t * 0.35;
      vec2 m1Pos = vec2(sin(mPhase * 0.8) * 0.35, cos(mPhase * 0.6) * 0.30);
      float m1Dist = length(p - m1Pos);
      float m1Intensity = exp(-m1Dist * m1Dist * 2.2) * 0.40;
      fluidCol = mix(fluidCol, colorD, m1Intensity * 0.55);

      // Mármore 2 (clarão difuso interno claro circulando em contra-fase)
      vec2 m2Pos = vec2(cos(mPhase * 1.1) * 0.38, sin(mPhase * 0.9) * 0.40);
      float m2Dist = length(p - m2Pos);
      float m2Intensity = exp(-m2Dist * m2Dist * 2.6) * 0.32;
      fluidCol = mix(fluidCol, colorE, m2Intensity * 0.45);

      // Leve fluxo contínuo orgânico de baixíssima frequência (mármore macro sem ruído fino)
      float macroS = sin(p.x * 1.8 + p.y * 1.4 + mPhase * 0.7) * 0.5 + 0.5;
      fluidCol = mix(fluidCol, colorD, macroS * 0.08);

      // ── ANEL INTERNO DE PROFUNDIDADE (Inner Ring do Canvas 2D) ──────────
      // Transição ciano/azul para dar volume de vidro esférico
      float innerRing = smoothstep(0.45, 0.95, pd);
      fluidCol = mix(fluidCol, shellEdgeCol, innerRing * 0.35);

      // ── PARTÍCULAS BIOLUMINESCENTES ORBITANDO INTERNAMENTE ──────────────
      // 4 esferas suaves idênticas às posições e órbitas do Canvas 2D
      float pSpeed = t * 1.2;

      // Partícula 1: #DDFBFF (tilt -0.15, rx 0.55, ry 0.25)
      float a1 = pSpeed + 0.0;
      vec2 rawP1 = vec2(cos(a1) * 0.55, sin(a1) * 0.25) * baseRad;
      vec2 orbP1 = vec2(rawP1.x * 0.988 - rawP1.y * (-0.149), rawP1.x * (-0.149) + rawP1.y * 0.988);

      // Partícula 2: #1EC8FF (tilt 0.25, rx 0.25, ry 0.60)
      float a2 = pSpeed + 2.1;
      vec2 rawP2 = vec2(cos(a2) * 0.25, sin(a2) * 0.60) * baseRad;
      vec2 orbP2 = vec2(rawP2.x * 0.968 - rawP2.y * 0.247, rawP2.x * 0.247 + rawP2.y * 0.968);

      // Partícula 3: #DDFBFF (tilt 0.35, rx 0.65, ry 0.20, speed 0.8)
      float a3 = pSpeed * 0.8 + 4.2;
      vec2 rawP3 = vec2(cos(a3) * 0.65, sin(a3) * 0.20) * baseRad;
      vec2 orbP3 = vec2(rawP3.x * 0.939 - rawP3.y * 0.342, rawP3.x * 0.342 + rawP3.y * 0.939);

      // Partícula 4: #1EC8FF (tilt -0.45, rx 0.20, ry 0.20, speed 1.2)
      float a4 = pSpeed * 1.2 + 1.2;
      vec2 rawP4 = vec2(cos(a4) * 0.20, sin(a4) * 0.20) * baseRad;
      vec2 orbP4 = vec2(rawP4.x * 0.900 - rawP4.y * (-0.435), rawP4.x * (-0.435) + rawP4.y * 0.900);

      float pD1 = length(uv - orbP1);
      float pD2 = length(uv - orbP2);
      float pD3 = length(uv - orbP3);
      float pD4 = length(uv - orbP4);

      // Variação de profundidade orbital (0.75 a 1.25)
      float depth1 = sin(a1) * 0.5 + 0.5;
      float depth2 = sin(a2) * 0.5 + 0.5;
      float depth3 = sin(a3) * 0.5 + 0.5;
      float depth4 = sin(a4) * 0.5 + 0.5;

      // Glow gaussiano suave e contido das partículas (sem explodir em espuma)
      float g1 = exp(-pD1 * pD1 * 140.0) * (0.50 + 0.40 * depth1);
      float g2 = exp(-pD2 * pD2 * 170.0) * (0.45 + 0.35 * depth2);
      float g3 = exp(-pD3 * pD3 * 130.0) * (0.48 + 0.38 * depth3);
      float g4 = exp(-pD4 * pD4 * 190.0) * (0.40 + 0.35 * depth4);

      fluidCol = mix(fluidCol, colorE, clamp(g1, 0.0, 1.0));
      fluidCol = mix(fluidCol, colorD, clamp(g2, 0.0, 1.0));
      fluidCol = mix(fluidCol, colorE, clamp(g3, 0.0, 1.0));
      fluidCol = mix(fluidCol, colorD, clamp(g4, 0.0, 1.0));

      // ── CASCA DE VIDRO (SHELL) COM REFRAÇÃO E ANEL ÓPTICO ───────────────
      float edgeDepth = max(1.0 - pd, 0.0);
      float opticalRim = pow(1.0 - smoothstep(0.0, 0.08, edgeDepth), 2.0);
      fluidCol = mix(fluidCol, shellInnerCol, opticalRim * 0.35);

      // Dispersão suave cromática nas bordas (ciano / azul)
      vec2 normP = pd > 0.001 ? p / pd : vec2(0.0);
      float coolSplit = pow(max(dot(normP, normalize(vec2(0.84, 0.54))), 0.0), 1.8);
      float warmSplit = pow(max(dot(normP, normalize(vec2(-0.62, -0.78))), 0.0), 2.0);
      fluidCol = mix(fluidCol, shellMidCol, opticalRim * 0.45 * coolSplit);
      fluidCol = mix(fluidCol, shellEdgeCol, opticalRim * 0.38 * warmSplit);

      // ── 5. BRILHO ESPECULAR PRIMÁRIO NO TOPO (-25°) ──────────────────────
      // Exatamente igual ao Canvas 2D:
      // specX = cx - baseRadius * 0.16; specY = cy - baseRadius * 0.42
      // Em coordenadas uv com y para cima: specPos = vec2(-0.16, 0.42) * deformRad
      vec2 specPos1 = vec2(-0.16, 0.42) * deformRad;
      vec2 specUv1 = uv - specPos1;
      // Rotação de -25°: cos(-25°) ~ 0.9063, sin(-25°) ~ -0.4226
      // x_rot = x * cos - y * sin = x * 0.9063 + y * 0.4226
      // y_rot = x * sin + y * cos = -x * 0.4226 + y * 0.9063
      float rotX1 = specUv1.x * 0.9063 + specUv1.y * 0.4226;
      float rotY1 = -specUv1.x * 0.4226 + specUv1.y * 0.9063;
      // Semieixos: radiusX = baseRad * 0.42 (~0.336), radiusY = baseRad * 0.20 (~0.16)
      float specD1 = (rotX1 * rotX1) / (0.336 * 0.336) + (rotY1 * rotY1) / (0.16 * 0.16);
      // Gradiente especular puro de vidro
      float spec1 = exp(-specD1 * 3.5);
      fluidCol = mix(fluidCol, colorE, spec1 * 0.90);
      fluidCol = mix(fluidCol, vec3(1.0), pow(spec1, 2.0) * 0.85);

      // ── 6. REALCE ESPECULAR SECUNDÁRIO NA BASE OPONENTE ──────────────────
      // Canvas 2D: subSpecX = cx + baseRadius * 0.32; subSpecY = cy + baseRadius * 0.38
      // Em coordenadas uv com y para cima: specPos2 = vec2(0.32, -0.38) * deformRad
      vec2 specPos2 = vec2(0.32, -0.38) * deformRad;
      vec2 specUv2 = uv - specPos2;
      // Rotação a 45°
      float rotX2 = (specUv2.x + specUv2.y) * 0.7071;
      float rotY2 = (-specUv2.x + specUv2.y) * 0.7071;
      float specD2 = (rotX2 * rotX2) / (0.176 * 0.176) + (rotY2 * rotY2) / (0.088 * 0.088);
      float spec2 = exp(-specD2 * 3.5);
      fluidCol = mix(fluidCol, colorE, spec2 * 0.50);
      fluidCol = mix(fluidCol, shellMidCol, spec2 * 0.30);

      // ── 7. CORTE SUAVE DA GOTA E HALO EXTERNO ───────────────────────────
      // Antialiasing impecável de borda
      float ballAlpha = 1.0 - smoothstep(deformRad * 0.990, deformRad * 1.008, d);

      // Halo e glow azul exterior idêntico ao Canvas 2D
      float haloAlpha = exp(-max(d - deformRad, 0.0) * 8.5) * (1.0 - ballAlpha) * 0.35;
      vec3 haloRgb = adjustHue(glowColor, hue);

      vec3 finalCol = fluidCol * ballAlpha + haloRgb * haloAlpha;
      float totalAlpha = clamp(ballAlpha + haloAlpha, 0.0, 1.0);

      finalCol = adjustHue(finalCol, hue);
      return vec4(finalCol, totalAlpha);
    }

    vec4 sampleOrb(vec2 uv) {
      float angle = rot * 0.25;
      float s = sin(angle);
      float c = cos(angle);
      vec2 rotated = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);

      // Movimento de deformação sutil baseado em hover
      rotated.x += hover * hoverIntensity * 0.05 * sin(rotated.y * 6.0 + iTime);
      rotated.y += hover * hoverIntensity * 0.05 * sin(rotated.x * 6.0 + iTime);

      return drawBlueDrop(rotated);
    }

    void main() {
      vec2 center = iResolution.xy * 0.5;
      float size = min(iResolution.x, iResolution.y);
      if (size <= 0.0) {
        gl_FragColor = vec4(0.0);
        return;
      }

      vec2 fragCoord = vUv * iResolution.xy;

      // Supersampling 4x MSAA analítico por sub-pixels para eliminar completamente o serrilhado
      vec2 pStep = vec2(1.0) / size;
      vec2 uv0 = (fragCoord - center) / size * 2.0;

      vec4 s1 = sampleOrb(uv0 + vec2(-0.35, -0.35) * pStep);
      vec4 s2 = sampleOrb(uv0 + vec2(0.35, -0.35) * pStep);
      vec4 s3 = sampleOrb(uv0 + vec2(-0.35, 0.35) * pStep);
      vec4 s4 = sampleOrb(uv0 + vec2(0.35, 0.35) * pStep);

      vec4 col = (s1 + s2 + s3 + s4) * 0.25;

      // Premultiplied alpha renderizado sobre fundo transparente
      gl_FragColor = vec4(col.rgb * col.a, col.a);
    }
  `

  // Voice analysis function
  const analyzeAudio = () => {
    if (!analyserRef.current || !dataArrayRef.current) return 0

    analyserRef.current.getByteFrequencyData(dataArrayRef.current as any)

    // Calculate RMS (Root Mean Square) for better voice detection
    let sum = 0
    for (let i = 0; i < dataArrayRef.current.length; i++) {
      const value = dataArrayRef.current[i] / 255
      sum += value * value
    }
    const rms = Math.sqrt(sum / dataArrayRef.current.length)

    // Apply sensitivity and boost the signal
    const level = Math.min(rms * propsRef.current.voiceSensitivity * 3.0, 1)

    return level
  }

  // Stop microphone and cleanup
  const stopMicrophone = () => {
    try {
      // Stop all tracks in the media stream
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => {
          track.stop()
        })
        mediaStreamRef.current = null
      }

      // Disconnect and cleanup audio nodes
      if (microphoneRef.current) {
        microphoneRef.current.disconnect()
        microphoneRef.current = null
      }

      if (analyserRef.current) {
        analyserRef.current.disconnect()
        analyserRef.current = null
      }

      // Close audio context
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close()
        audioContextRef.current = null
      }

      dataArrayRef.current = null
      console.log('Microphone stopped and cleaned up')
    } catch (error) {
      console.warn('Error stopping microphone:', error)
    }
  }

  // Initialize microphone access
  const initMicrophone = async () => {
    try {
      // Clean up any existing microphone first
      stopMicrophone()

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false, // Better for voice analysis
          noiseSuppression: false, // Better for voice analysis
          autoGainControl: false, // Better for voice analysis
          sampleRate: 44100,
        },
      })

      // Store the stream reference for cleanup
      mediaStreamRef.current = stream

      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()

      // Resume audio context if needed
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }

      analyserRef.current = audioContextRef.current.createAnalyser()
      microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream)

      // Optimize for voice detection
      analyserRef.current.fftSize = 512 // Higher resolution
      analyserRef.current.smoothingTimeConstant = 0.3 // Less smoothing for responsiveness
      analyserRef.current.minDecibels = -90
      analyserRef.current.maxDecibels = -10

      microphoneRef.current.connect(analyserRef.current as any)
      dataArrayRef.current = new Uint8Array(analyserRef.current.frequencyBinCount)

      console.log('Microphone initialized successfully')
      return true
    } catch (error) {
      console.warn('Microphone access denied or not available:', error)
      return false
    }
  }

  useEffect(() => {
    const container = ctnDom.current
    if (!container) return

    let rendererInstance: Renderer | null = null
    let glContext: any = null
    let rafId: number
    let program: Program | null = null

    try {
      // DPR supersampling (mínimo 2x para telas normais ficarem nítidas como retina,
      // até 3x em telas hi-dpi, garantindo bordas ultrafinas sem pixelamento)
      const rawDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
      const effectiveDpr = Math.min(3, Math.max(2, rawDpr))

      rendererInstance = new Renderer({
        alpha: true,
        premultipliedAlpha: true,
        antialias: true,
        dpr: effectiveDpr,
      })
      glContext = rendererInstance.gl
      const canvasEl = glContext.canvas as HTMLCanvasElement
      // Set clear color to transparent to avoid white flash
      glContext.clearColor(0, 0, 0, 0)
      // Enable alpha blending com premultiplied alpha para transparência nítida e suave
      glContext.enable(glContext.BLEND)
      glContext.blendFunc(glContext.ONE, glContext.ONE_MINUS_SRC_ALPHA)

      // Clear any existing canvas
      while (container.firstChild) {
        container.removeChild(container.firstChild)
      }
      container.appendChild(canvasEl)

      const geometry = new Triangle(glContext)
      program = new Program(glContext, {
        vertex: vert,
        fragment: frag,
        uniforms: {
          iTime: { value: 0 },
          iResolution: {
            value: new Vec3(
              glContext.canvas.width,
              glContext.canvas.height,
              glContext.canvas.width / glContext.canvas.height,
            ),
          },
          hue: { value: hue },
          hover: { value: 0 },
          rot: { value: 0 },
          hoverIntensity: { value: 0 },
        },
      })

      const mesh = new Mesh(glContext, { geometry, program })

      const resize = () => {
        if (!container || !rendererInstance || !glContext) return
        const screenDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
        const activeDpr = Math.min(3, Math.max(2, screenDpr))
        const width = container.clientWidth
        const height = container.clientHeight

        if (width === 0 || height === 0) return

        rendererInstance.setSize(width * activeDpr, height * activeDpr)
        const c = glContext.canvas as HTMLCanvasElement
        c.style.width = width + 'px'
        c.style.height = height + 'px'

        if (program) {
          program.uniforms.iResolution.value.set(
            glContext.canvas.width,
            glContext.canvas.height,
            glContext.canvas.width / glContext.canvas.height,
          )
        }
      }
      window.addEventListener('resize', resize)
      resize()

      let lastTime = 0
      let currentRot = 0
      let animatedHue = hue
      let animatedRotSpeed = maxRotationSpeed
      let animatedHoverIntensity = maxHoverIntensity
      let voiceLevel = 0
      const baseRotationSpeed = 0.4
      let isMicrophoneInitialized = false

      // Initialize or stop microphone based on voice control setting
      if (enableVoiceControl) {
        initMicrophone().then((success) => {
          isMicrophoneInitialized = success
        })
      } else {
        // Stop microphone when voice control is disabled
        stopMicrophone()
        isMicrophoneInitialized = false
      }

      const update = (t: number) => {
        rafId = requestAnimationFrame(update)
        if (!program) return

        // Clamp de dt para evitar saltos visuais bruscos na rotação/tempo quando a aba volta de background
        const rawDt = lastTime === 0 ? 0.016 : (t - lastTime) * 0.001
        const dt = Math.min(0.05, Math.max(0.001, rawDt))
        lastTime = t

        const {
          hue: targetHue,
          maxRotationSpeed: targetMaxRotSpeed,
          maxHoverIntensity: targetMaxHover,
          onVoiceDetected: currentOnVoiceDetected,
        } = propsRef.current

        // Interpolação exponencial suave contínua (sem degraus nem saltos bruscos)
        const lerpFactor = 1 - Math.exp(-6.0 * dt)
        animatedHue += (targetHue - animatedHue) * lerpFactor
        animatedRotSpeed += (targetMaxRotSpeed - animatedRotSpeed) * lerpFactor
        animatedHoverIntensity += (targetMaxHover - animatedHoverIntensity) * lerpFactor

        program.uniforms.iTime.value = t * 0.001
        program.uniforms.hue.value = animatedHue

        // Rotação suave contínua mesmo sem voz (ritmo hipnótico e aceleração orgânica no thinking)
        const rotationFactor = animatedRotSpeed / 1.2
        currentRot += dt * (baseRotationSpeed * rotationFactor)

        // Handle voice input
        if (enableVoiceControl && isMicrophoneInitialized) {
          voiceLevel = analyzeAudio()

          // Notify parent component about voice detection
          if (currentOnVoiceDetected) {
            currentOnVoiceDetected(voiceLevel > 0.1)
          }

          // Map voice level to rotation speed with more visible effect
          const voiceRotationSpeed = voiceLevel * animatedRotSpeed * 2.0

          // Always rotate more when there's voice input
          if (voiceLevel > 0.05) {
            currentRot += dt * voiceRotationSpeed
          }

          // Use voice level to drive hover effects for visual feedback
          program.uniforms.hover.value = Math.min(voiceLevel * 2.0, 1.0)
          program.uniforms.hoverIntensity.value = Math.min(
            voiceLevel * animatedHoverIntensity * 0.8,
            animatedHoverIntensity,
          )
        } else {
          // Movimento sutil hover constante para conferir organicidade hipnótica
          program.uniforms.hover.value = 0.25
          program.uniforms.hoverIntensity.value = Math.min(0.35, animatedHoverIntensity)
          if (currentOnVoiceDetected) {
            currentOnVoiceDetected(false)
          }
        }

        program.uniforms.rot.value = currentRot

        if (rendererInstance && glContext) {
          // Clear the canvas with transparent background before rendering
          glContext.clear(glContext.COLOR_BUFFER_BIT | glContext.DEPTH_BUFFER_BIT)
          rendererInstance.render({ scene: mesh })
        }
      }

      rafId = requestAnimationFrame(update)

      return () => {
        cancelAnimationFrame(rafId)
        window.removeEventListener('resize', resize)

        // Clean up canvas safely
        if (container && glContext && glContext.canvas) {
          try {
            const c = glContext.canvas as HTMLCanvasElement
            if (container.contains(c)) {
              container.removeChild(c)
            }
          } catch (error) {
            console.warn('Canvas cleanup error:', error)
          }
        }

        // Stop microphone and clean up audio resources
        stopMicrophone()

        if (glContext) {
          glContext.getExtension('WEBGL_lose_context')?.loseContext()
        }
      }
    } catch (error) {
      console.warn('[VoicePoweredOrb] Falha ao inicializar WebGL via ogl:', error)
      const currentOnError = propsRef.current.onError
      if (currentOnError && error instanceof Error) {
        currentOnError(error)
      } else if (currentOnError) {
        currentOnError(new Error(String(error)))
      }
      if (container && container.firstChild) {
        try {
          container.removeChild(container.firstChild)
        } catch {
          // ignore
        }
      }
      return () => {
        window.removeEventListener('resize', () => {})
      }
    }
  }, [enableVoiceControl, vert, frag])

  // Handle microphone state changes separately
  useEffect(() => {
    let isMounted = true

    const handleMicrophoneState = async () => {
      if (enableVoiceControl) {
        const success = await initMicrophone()
        if (!isMounted) return
        // Update the microphone state in the WebGL context if needed
      } else {
        stopMicrophone()
      }
    }

    handleMicrophoneState()

    return () => {
      isMounted = false
      // Don't stop microphone here as it will be handled by the main cleanup
    }
  }, [enableVoiceControl])

  return <div ref={ctnDom} className={cn('w-full h-full relative', className)}></div>
}
