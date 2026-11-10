import React, { useRef, useLayoutEffect, useEffect } from 'react'

export interface AnimatedListItemProps {
  id: string
  children: React.ReactNode
  className?: string
  layoutDuration?: number // in seconds
}

export const AnimatedListItem: React.FC<AnimatedListItemProps> = ({
  id,
  children,
  className = '',
  layoutDuration = 0.35,
}) => {
  const domRef = useRef<HTMLDivElement>(null)
  const prevRectRef = useRef<DOMRect | null>(null)
  const isFirstRender = useRef(true)

  useLayoutEffect(() => {
    const el = domRef.current
    if (!el) return

    const currentRect = el.getBoundingClientRect()

    if (isFirstRender.current) {
      isFirstRender.current = false
      prevRectRef.current = currentRect
      return
    }

    const prevRect = prevRectRef.current
    if (prevRect) {
      const deltaY = prevRect.top - currentRect.top
      const deltaX = prevRect.left - currentRect.left

      if (deltaY !== 0 || deltaX !== 0) {
        // Invert
        el.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`
        el.style.transition = 'none'

        // Force reflow
        void el.offsetHeight

        // Play
        el.style.transition = `transform ${layoutDuration}s cubic-bezier(0.16, 1, 0.3, 1), opacity ${layoutDuration}s ease-out`
        el.style.transform = 'translate3d(0, 0, 0)'
      }
    }

    prevRectRef.current = currentRect
  })

  useEffect(() => {
    return () => {
      prevRectRef.current = null
    }
  }, [id])

  return (
    <div
      ref={domRef}
      data-animated-id={id}
      className={`will-change-transform ${className}`}
      style={{
        transition: `opacity ${layoutDuration}s ease-out`,
      }}
    >
      {children}
    </div>
  )
}

export default AnimatedListItem
