import React, { useEffect, useRef, useState, useMemo } from 'react'

export interface BlurTextProps {
  text?: string
  children?: React.ReactNode
  delay?: number
  className?: string
  animateBy?: 'words' | 'letters'
  direction?: 'top' | 'bottom'
  threshold?: number
  rootMargin?: string
  initialDelay?: number
  stepDuration?: number
  highlightWord?: string
  highlightClassName?: string
}

export const BlurText: React.FC<BlurTextProps> = ({
  text = '',
  delay = 70,
  className = '',
  animateBy = 'words',
  direction = 'top',
  threshold = 0.1,
  rootMargin = '0px',
  initialDelay = 0,
  stepDuration = 0.45,
  highlightWord,
  highlightClassName = 'landing-underline',
}) => {
  const elements = useMemo(() => {
    if (!text) return []
    return animateBy === 'words' ? text.split(' ') : text.split('')
  }, [text, animateBy])

  const [inView, setInView] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.unobserve(el)
        }
      },
      { threshold, rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, rootMargin])

  const initialY = direction === 'top' ? '-14px' : '14px'

  return (
    <span ref={ref} className={`inline ${className}`} style={{ display: 'inline' }}>
      {elements.map((segment, index) => {
        const isHighlight =
          highlightWord &&
          (segment.toLowerCase().includes(highlightWord.toLowerCase()) ||
            segment.toLowerCase().replace(/[^a-z0-9áàâãéèêíïóôõöúçñ]/gi, '') ===
              highlightWord.toLowerCase().replace(/[^a-z0-9áàâãéèêíïóôõöúçñ]/gi, ''))

        const itemDelayMs = initialDelay + index * delay

        const style: React.CSSProperties = {
          display: 'inline-block',
          transition: `filter ${stepDuration}s cubic-bezier(0.16, 1, 0.3, 1), opacity ${stepDuration}s cubic-bezier(0.16, 1, 0.3, 1), transform ${stepDuration}s cubic-bezier(0.16, 1, 0.3, 1)`,
          transitionDelay: `${itemDelayMs}ms`,
          filter: inView ? 'blur(0px)' : 'blur(8px)',
          opacity: inView ? 1 : 0,
          transform: inView ? 'translateY(0)' : `translateY(${initialY})`,
          willChange: 'transform, filter, opacity',
        }

        const spanContent = segment === ' ' ? '\u00A0' : segment

        return (
          <React.Fragment key={index}>
            <span style={style} className={isHighlight ? highlightClassName : undefined}>
              {spanContent}
            </span>
            {animateBy === 'words' && index < elements.length - 1 && ' '}
          </React.Fragment>
        )
      })}
    </span>
  )
}

export default BlurText
