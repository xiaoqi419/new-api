import { useEffect, useMemo, useRef, useState } from 'react'

import {
  CosmicRenderer,
  DEFAULT_AUTH_CAPSULE_PRESET,
  FallbackRenderer,
  type AuthCapsulePreset,
} from './auth-cosmic-renderer'

export type AuthCapsuleCanvasProps = {
  className?: string
  preset?: Partial<AuthCapsulePreset>
}

type Renderer = CosmicRenderer | FallbackRenderer

/**
 * Renders the nebula-capsules visual as an actual WebGL2 canvas, falling back
 * to the repository's Canvas2D renderer when WebGL2 is unavailable.
 *
 * The component owns the render loop and browser observers so mounting it in a
 * button or another capsule never leaks a RAF, observer, or WebGL resource.
 */
export function AuthCapsuleCanvas(props: AuthCapsuleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rendererKind, setRendererKind] = useState<
    'pending' | 'webgl2' | 'canvas2d'
  >('pending')
  const preset = useMemo<AuthCapsulePreset>(
    () => ({
      ...DEFAULT_AUTH_CAPSULE_PRESET,
      ...props.preset,
      colors: props.preset?.colors ?? DEFAULT_AUTH_CAPSULE_PRESET.colors,
    }),
    [props.preset]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof window === 'undefined') return

    // Some DOM implementations expose canvas elements without a usable
    // drawing context. Do not start an animation loop in that environment.
    let hasCanvasContext = false
    try {
      hasCanvasContext = Boolean(
        canvas.getContext('webgl2') || canvas.getContext('2d')
      )
    } catch {
      hasCanvasContext = false
    }
    if (!hasCanvasContext) {
      return
    }

    let renderer: Renderer | null = null
    try {
      renderer = new CosmicRenderer(canvas, preset)
      setRendererKind('webgl2')
    } catch {
      try {
        renderer = new FallbackRenderer(canvas, preset)
        setRendererKind('canvas2d')
      } catch {
        // Keep the CSS fallback in place when neither canvas backend exists.
      }
    }

    if (!renderer) return

    let frameId = 0
    let disposed = false
    let animationStart = performance.now()
    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    let reducedMotion = motionQuery?.matches === true

    const renderFrame = (timestamp: number) => {
      if (disposed || reducedMotion) return
      renderer.draw((timestamp - animationStart) / 1000)
      frameId = window.requestAnimationFrame(renderFrame)
    }

    const drawStatic = () => {
      renderer.resize()
      renderer.draw(0, true)
    }

    const syncMotionPreference = () => {
      reducedMotion = motionQuery?.matches === true
      if (reducedMotion) {
        window.cancelAnimationFrame(frameId)
        frameId = 0
        drawStatic()
        return
      }
      animationStart = performance.now()
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(renderFrame)
    }

    drawStatic()
    if (!reducedMotion) {
      frameId = window.requestAnimationFrame(renderFrame)
    }

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(() => {
            drawStatic()
          })
    resizeObserver?.observe(canvas)

    motionQuery?.addEventListener?.('change', syncMotionPreference)

    return () => {
      disposed = true
      window.cancelAnimationFrame(frameId)
      resizeObserver?.disconnect()
      motionQuery?.removeEventListener?.('change', syncMotionPreference)
      renderer.dispose()
    }
  }, [preset])

  return (
    <span
      aria-hidden='true'
      data-auth-capsule='canvas'
      data-auth-capsule-renderer={rendererKind}
      className={props.className}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        borderRadius: 'inherit',
      }}
    >
      <canvas
        ref={canvasRef}
        data-auth-capsule-canvas='true'
        className='auth-submit-canvas'
        width={2}
        height={2}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />
    </span>
  )
}
