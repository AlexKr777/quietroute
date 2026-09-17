export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

interface DockBounds {
  minimumX: number
  maximumX: number
  minimumY: number
  maximumY: number
}

function getDockBounds(
  viewport: Size,
  dock: Size,
  padding: number,
): DockBounds {
  return {
    minimumX: padding,
    maximumX: Math.max(padding, viewport.width - dock.width - padding),
    minimumY: padding,
    maximumY: Math.max(padding, viewport.height - dock.height - padding),
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function getDefaultDockLift(viewport: Size): number {
  if (viewport.width <= 520) return 36
  return clamp(viewport.height * 0.1, 84, 128)
}

export function getDefaultDockPosition(
  viewport: Size,
  dock: Size,
  padding = 16,
): Point {
  return clampDockPosition(
    {
      x: padding,
      y: viewport.height - dock.height - padding - getDefaultDockLift(viewport),
    },
    viewport,
    dock,
    padding,
  )
}

export function clampDockPosition(
  position: Point,
  viewport: Size,
  dock: Size,
  padding = 16,
): Point {
  const bounds = getDockBounds(viewport, dock, padding)

  return {
    x: clamp(position.x, bounds.minimumX, bounds.maximumX),
    y: clamp(position.y, bounds.minimumY, bounds.maximumY),
  }
}

export function moveDockPosition(
  origin: Point,
  delta: Point,
  viewport: Size,
  dock: Size,
  padding = 16,
): Point {
  return clampDockPosition(
    { x: origin.x + delta.x, y: origin.y + delta.y },
    viewport,
    dock,
    padding,
  )
}

export function snapDockPosition(
  position: Point,
  viewport: Size,
  dock: Size,
  threshold = 36,
  padding = 16,
): Point {
  const bounds = getDockBounds(viewport, dock, padding)
  const clampedPosition = clampDockPosition(position, viewport, dock, padding)
  let { x, y } = clampedPosition

  if (Math.abs(x - bounds.minimumX) <= threshold) x = bounds.minimumX
  else if (Math.abs(x - bounds.maximumX) <= threshold) x = bounds.maximumX

  if (Math.abs(y - bounds.minimumY) <= threshold) y = bounds.minimumY
  else if (Math.abs(y - bounds.maximumY) <= threshold) y = bounds.maximumY

  return { x, y }
}
