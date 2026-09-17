import { SCENE_HEIGHT, SCENE_WIDTH } from './layout'

export interface ScenePoint {
  x: number
  y: number
}

export interface ViewportRect {
  left: number
  top: number
  width: number
  height: number
}

export interface GlassTrace extends ScenePoint {
  createdAt: number
}

export const MAIN_WINDOW_POLYGON: readonly ScenePoint[] = [
  { x: 0, y: 0 },
  { x: 497, y: 0 },
  { x: 496, y: 212 },
  { x: 490, y: 238 },
  { x: 476, y: 251 },
  { x: 28, y: 318 },
  { x: 0, y: 303 },
]

export function mapViewportPointToScene(
  clientX: number,
  clientY: number,
  rect: ViewportRect,
): ScenePoint {
  return {
    x: ((clientX - rect.left) / rect.width) * SCENE_WIDTH,
    y: ((clientY - rect.top) / rect.height) * SCENE_HEIGHT,
  }
}

export function isInsideMainWindow(point: ScenePoint): boolean {
  let inside = false

  for (
    let current = 0, previous = MAIN_WINDOW_POLYGON.length - 1;
    current < MAIN_WINDOW_POLYGON.length;
    previous = current, current += 1
  ) {
    const currentPoint = MAIN_WINDOW_POLYGON[current]
    const previousPoint = MAIN_WINDOW_POLYGON[previous]
    if (!currentPoint || !previousPoint) continue

    const crossesHorizontalRay =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x

    if (crossesHorizontalRay) inside = !inside
  }

  return inside
}

export function getActiveGlassTraces(
  traces: readonly GlassTrace[],
  now: number,
  lifetimeMs: number,
): GlassTrace[] {
  return traces.filter((trace) => now - trace.createdAt < lifetimeMs)
}

export function interpolateScenePoints(
  from: ScenePoint,
  to: ScenePoint,
  maximumStep: number,
): ScenePoint[] {
  if (!Number.isFinite(maximumStep) || maximumStep <= 0) {
    throw new Error('Maximum interpolation step must be positive')
  }

  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  const segmentCount = Math.max(1, Math.ceil(distance / maximumStep))

  return Array.from({ length: segmentCount + 1 }, (_, index) => {
    const progress = index / segmentCount
    return {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    }
  })
}

export function getGlassTraceRadius(
  createdAt: number,
  now: number,
  lifetimeMs: number,
): number {
  if (lifetimeMs <= 0) return 3
  const progress = Math.min(1, Math.max(0, (now - createdAt) / lifetimeMs))
  return 9 - progress * 6
}
