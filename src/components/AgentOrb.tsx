import React, { useEffect, useState, useRef, useCallback } from 'react'
import { VoicePoweredOrb } from '@/components/ui/voice-powered-orb'
import { LiquidOrb, type LiquidOrbProps } from '@/components/LiquidOrb'
import { cn } from '@/lib/utils'

const PIPELINE_STORAGE_KEY = 'liquidOrb.pipeline'

let cachedSupportsWebGL: boolean | null = null

/**
 * Lê a preferência persistida de pipeline gravada anteriormente no localStorage.
 * Retorna 'webgl' | 'canvas2d' | null
 */
export function getPersistedPipeline(): 'webgl' | 'canvas2d' | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = localStorage.getItem(PIPELINE_STORAGE_KEY)
    if (stored === 'webgl' || stored === 'canvas2d') {
      return stored
    }
  } catch {
    // localStorage desabilitado ou erro de acesso
  }
  return null
}

/**
 * Grava o pipeline detectado/confirmado no localStorage para evitar alternância
 * aleatória entre reloads em máquinas com GPU instável ou processos que crasham.
 */
export function setPersistedPipeline(pipeline: 'webgl' | 'canvas2d'): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(PIPELINE_STORAGE_KEY, pipeline)
  } catch {
    // Silencia erros de storage cheio ou modo anônimo estrito
  }
}

export function checkWebGLSupported(): boolean {
  if (typeof window === 'undefined') return false
  if (cachedSupportsWebGL !== null) return cachedSupportsWebGL

  // 1. Verifica se já existe decisão persistida de pipeline no localStorage
  const persisted = getPersistedPipeline()
  if (persisted === 'canvas2d') {
    // Só considera se houver falha persistida real de WebGL
    cachedSupportsWebGL = false
    return false
  }

  // 2. Testa capacidade real do navegador de instanciar contexto WebGL
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
    const supported = Boolean(gl && typeof gl.getParameter === 'function')
    cachedSupportsWebGL = supported
    if (gl) {
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
    // Se o teste passou, grava 'webgl'. Só grava 'canvas2d' se o contexto falhou comprovadamente.
    if (!supported) {
      setPersistedPipeline('canvas2d')
    }
  } catch (err) {
    console.warn('[AgentOrb] Falha ao testar suporte a WebGL:', err)
    cachedSupportsWebGL = false
    setPersistedPipeline('canvas2d')
  }

  return cachedSupportsWebGL ?? false
}

export interface AgentOrbProps extends LiquidOrbProps {
  /**
   * Se falso ou se for um avatar em lista repetida, pode forçar Canvas 2D
   * para não esgotar limites de contexto WebGL do navegador (~16 contextos).
   * Padrão: true para header e indicador thinking.
   */
  preferWebGL?: boolean
}

/**
 * Escada de fallbacks para o Orb da página Agente:
 * 1. prefers-reduced-motion ou staticOnly -> CSS puro (sem carga de animação).
 * 2. WebGL disponível e preferWebGL -> VoicePoweredOrb (shader WebGL via ogl).
 *    - Controle por voz desligado por padrão (enableVoiceControl={false}).
 *    - Idle vs Thinking visualmente diferenciado (ex: pulso/glow vibrante e hue dinâmico no thinking).
 *    - Pausa automática fora da viewport / aba inativa para economia de performance.
 * 3. Fallback GPU indisponível (ou WebGL falhou/desabilitado) -> LiquidOrb Canvas 2D (CPU) existente.
 * 4. Fallback final -> CSS.
 */
export const AgentOrb: React.FC<AgentOrbProps> = ({
  state = 'idle',
  size = 32,
  className = '',
  staticOnly = false,
  preferWebGL = true,
}) => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [useWebGL, setUseWebGL] = useState(false)
  const [webGLFailed, setWebGLFailed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(true)
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    typeof document !== 'undefined' ? !document.hidden : true,
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mq.matches)
    const listener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
    mq.addEventListener?.('change', listener)
    return () => mq.removeEventListener?.('change', listener)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleVis = () => setIsDocumentVisible(!document.hidden)
    document.addEventListener('visibilitychange', handleVis)
    return () => document.removeEventListener('visibilitychange', handleVis)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry ? entry.isIntersecting : true)
      },
      { threshold: 0.05 },
    )
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (staticOnly || prefersReducedMotion || !preferWebGL) {
      setUseWebGL(false)
      return
    }

    const hasWebGL = checkWebGLSupported()
    if (hasWebGL && !webGLFailed) {
      setUseWebGL(true)
    } else {
      setUseWebGL(false)
    }
  }, [staticOnly, prefersReducedMotion, preferWebGL, webGLFailed])

  const isThinking = state === 'thinking'
  const shouldAnimateWebGL = useWebGL && isVisible && isDocumentVisible

  const handleWebGLError = useCallback((err: Error) => {
    console.warn('[AgentOrb] Erro no pipeline VoicePoweredOrb ogl, caindo para Canvas 2D CPU:', err)
    cachedSupportsWebGL = false
    setPersistedPipeline('canvas2d')
    setWebGLFailed(true)
    setUseWebGL(false)
  }, [])

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative inline-flex items-center justify-center shrink-0 select-none',
        className,
      )}
      style={{
        width: size,
        height: size,
      }}
      role="img"
      aria-label={
        isThinking
          ? shouldAnimateWebGL
            ? 'Agente pensando (VoicePoweredOrb)'
            : 'Agente pensando'
          : shouldAnimateWebGL
            ? 'Agente ativo (VoicePoweredOrb)'
            : 'Agente ativo'
      }
      data-pipeline={shouldAnimateWebGL ? 'ogl-webgl' : 'canvas2d-or-css'}
    >
      {shouldAnimateWebGL ? (
        <div
          className="relative w-full h-full overflow-hidden rounded-full"
          style={{
            // Calibrado exatamente com o drop-shadow do LiquidOrb Canvas 2D
            filter: isThinking
              ? 'drop-shadow(0 0 9px rgba(30, 200, 255, 0.75)) drop-shadow(0 0 16px rgba(139, 92, 246, 0.35))'
              : 'drop-shadow(0 0 4px rgba(22, 141, 255, 0.4))',
            transition:
              'filter 0.5s cubic-bezier(0.4, 0, 0.2, 1), transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: isThinking ? 'scale(1.04)' : 'scale(1.0)',
          }}
        >
          <VoicePoweredOrb
            className="w-full h-full block"
            hue={isThinking ? 10 : 0}
            enableVoiceControl={false}
            maxRotationSpeed={isThinking ? 1.4 : 0.6}
            maxHoverIntensity={isThinking ? 0.5 : 0.2}
            onError={handleWebGLError}
          />
        </div>
      ) : (
        /* Fallback 1: LiquidOrb (Canvas 2D unificado com shader blueDrop ou CSS) */
        <LiquidOrb
          state={state}
          size={size}
          className="w-full h-full"
          staticOnly={staticOnly}
          forceCanvas2D={true}
        />
      )}
    </div>
  )
}
