import React, { useEffect, useRef, useState } from 'react'

interface LandingVideoBackgroundProps {
  className?: string
  overlayClassName?: string
  fallbackGradient?: string
}

/**
 * URL do vídeo de fundo hospedado no Cloudinary (MP4 público com entrega em CDN).
 * Usado verbatim conforme fornecido pelo usuário.
 */
export const CLOUDINARY_VIDEO_URL =
  'https://res.cloudinary.com/dfrzlhyvi/video/upload/v1789768747/bg-exemplo-4-verde-mint-whatsapp-kling-i2v_qhjxm8.mp4'

export const LandingVideoBackground: React.FC<LandingVideoBackgroundProps> = ({
  className = '',
  overlayClassName = '',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  // Respeita prefers-reduced-motion do usuário do sistema
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)

    const handler = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler)
    } else {
      mediaQuery.addListener(handler)
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handler)
      } else {
        mediaQuery.removeListener(handler)
      }
    }
  }, [])

  // Garante muted tanto como atributo quanto como propriedade DOM direta (exigido pelos navegadores para autoplay)
  // e dispara play() com fallback gracioso
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Autoplay policy: propriedade muted = true obrigatória no elemento DOM
    video.muted = true
    video.defaultMuted = true

    if (prefersReducedMotion) {
      video.pause()
      return
    }

    if (hasError) return

    const attemptPlay = () => {
      if (!video) return
      video.muted = true
      const playPromise = video.play()
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch(() => {
            // Em caso de restrição estrita de autoplay, aguardar primeira interação na janela
            const handleFirstInteraction = () => {
              if (videoRef.current) {
                videoRef.current.muted = true
                videoRef.current
                  .play()
                  .then(() => setIsPlaying(true))
                  .catch(() => {})
              }
              window.removeEventListener('pointerdown', handleFirstInteraction)
              window.removeEventListener('scroll', handleFirstInteraction)
              window.removeEventListener('keydown', handleFirstInteraction)
            }
            window.addEventListener('pointerdown', handleFirstInteraction, {
              once: true,
              passive: true,
            })
            window.addEventListener('scroll', handleFirstInteraction, { once: true, passive: true })
            window.addEventListener('keydown', handleFirstInteraction, {
              once: true,
              passive: true,
            })
          })
      }
    }

    attemptPlay()
  }, [prefersReducedMotion, hasError])

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {/* 1. Base gradiente sutil de fundo (identidade visual Fernand #E9F7FE -> #E2F3FC) */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#E9F7FE] via-[#E2F3FC] to-white opacity-40" />

      {/* 2. Elemento de vídeo em loop do Cloudinary
          - SEM crossOrigin="anonymous" (evita falha silenciosa de CORS se o CDN não enviar Access-Control-Allow-Origin para vídeo)
          - muted / autoPlay / playsInline / loop garantidos
          - Visível por padrão assim que carrega metadados/frames
      */}
      {!prefersReducedMotion && !hasError && (
        <video
          key="landing-bg-video"
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          src={CLOUDINARY_VIDEO_URL}
          onPlaying={() => setIsPlaying(true)}
          onLoadedData={() => {
            setIsPlaying(true)
            if (videoRef.current && !prefersReducedMotion) {
              videoRef.current.muted = true
              videoRef.current
                .play()
                .then(() => setIsPlaying(true))
                .catch(() => {})
            }
          }}
          onCanPlay={() => {
            setIsPlaying(true)
            if (videoRef.current && !prefersReducedMotion) {
              videoRef.current.muted = true
              videoRef.current
                .play()
                .then(() => setIsPlaying(true))
                .catch(() => {})
            }
          }}
          onError={(e) => {
            console.warn('Falha ao reproduzir vídeo de fundo do Cloudinary:', e)
            setHasError(true)
            setIsPlaying(false)
          }}
          className={`h-full w-full object-cover transition-opacity duration-700 ${
            isPlaying ? 'opacity-100' : 'opacity-40'
          }`}
        >
          <source src={CLOUDINARY_VIDEO_URL} type="video/mp4" />
        </video>
      )}
      {overlayClassName ? (
        <div className={`pointer-events-none absolute inset-0 ${overlayClassName}`} />
      ) : null}
    </div>
  )
}

export default LandingVideoBackground
