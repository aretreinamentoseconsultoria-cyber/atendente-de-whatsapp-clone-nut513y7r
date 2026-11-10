import React, { useState, useEffect, useRef } from 'react'

export interface ShinyTextProps {
  text: string
  disabled?: boolean
  speed?: number
  className?: string
  color?: string
  shineColor?: string
  spread?: number
  direction?: 'left' | 'right'
}

export const ShinyText: React.FC<ShinyTextProps> = ({
  text,
  disabled = false,
  speed = 2,
  className = '',
  color = '#464B5F',
  shineColor = '#CBD6D7',
  spread = 120,
  direction = 'left',
}) => {
  const [progress, setProgress] = useState(0)
  const animFrameRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number | null>(null)
  const elapsedRef = useRef(0)

  useEffect(() => {
    if (disabled) {
      setProgress(0)
      return
    }

    const duration = speed * 1000

    const step = (time: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = time
      }
      const delta = time - lastTimeRef.current
      lastTimeRef.current = time
      elapsedRef.current = (elapsedRef.current + delta) % duration

      const p = (elapsedRef.current / duration) * 100
      setProgress(direction === 'left' ? p : 100 - p)

      animFrameRef.current = requestAnimationFrame(step)
    }

    animFrameRef.current = requestAnimationFrame(step)

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
      }
      lastTimeRef.current = null
    }
  }, [disabled, speed, direction])

  const bgPosition = `${150 - progress * 2}% center`

  const gradientStyle: React.CSSProperties = {
    backgroundImage: `linear-gradient(${spread}deg, ${color} 0%, ${color} 35%, ${shineColor} 50%, ${color} 65%, ${color} 100%)`,
    backgroundSize: '200% auto',
    backgroundPosition: bgPosition,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
    display: 'inline-block',
  }

  return (
    <span className={`inline-block ${className}`} style={gradientStyle}>
      {text}
    </span>
  )
}

export default ShinyText
