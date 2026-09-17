import { SCENE_HEIGHT, SCENE_WIDTH } from './layout'
import {
  getGlassTraceRadius,
  MAIN_WINDOW_POLYGON,
  type GlassTrace,
} from './glass'
import type { RainDrop } from './rain'
import { getRainDropPosition, getRainImpactProgress } from './rain'

const sceneBounds = { width: SCENE_WIDTH, height: SCENE_HEIGHT }

function clipToMainWindow(context: CanvasRenderingContext2D): void {
  const firstPoint = MAIN_WINDOW_POLYGON[0]
  if (!firstPoint) return

  context.beginPath()
  context.moveTo(firstPoint.x, firstPoint.y)
  for (const point of MAIN_WINDOW_POLYGON.slice(1)) {
    context.lineTo(point.x, point.y)
  }
  context.closePath()
  context.clip()
}

export function renderPassingLight(
  context: CanvasRenderingContext2D,
  elapsedMs: number,
  intensity: number,
): void {
  const cycle = 14_000
  const phase = (elapsedMs % cycle) / cycle
  const lightX = Math.round(-90 + phase * (SCENE_WIDTH + 180))

  context.save()
  clipToMainWindow(context)
  context.globalCompositeOperation = 'screen'
  context.fillStyle = `rgba(222, 156, 80, ${0.018 * intensity})`
  context.fillRect(lightX, 0, 28, SCENE_HEIGHT)
  context.fillStyle = `rgba(245, 190, 104, ${0.03 * intensity})`
  context.fillRect(lightX + 9, 0, 5, SCENE_HEIGHT)
  context.fillStyle = `rgba(255, 218, 146, ${0.04 * intensity})`
  context.fillRect(lightX + 11, 0, 1, SCENE_HEIGHT)
  context.restore()
}

export function renderRainLayer(
  context: CanvasRenderingContext2D,
  drops: readonly RainDrop[],
  elapsedMs: number,
  intensity: number,
  glassTraces: readonly GlassTrace[] = [],
): void {
  context.save()
  clipToMainWindow(context)

  for (const drop of drops) {
    const position = getRainDropPosition(drop, elapsedMs, sceneBounds)
    const isCleared = glassTraces.some((trace) => {
      const radiusX = getGlassTraceRadius(trace.createdAt, elapsedMs, 4200)
      const radiusY = radiusX * 0.58
      const distanceX = (position.x - trace.x) / radiusX
      const distanceY = (position.y - trace.y) / radiusY
      return distanceX ** 2 + distanceY ** 2 <= 1
    })
    if (isCleared) continue

    const x = Math.round(position.x)
    const y = Math.round(position.y)
    const alpha = drop.opacity * intensity

    if (drop.kind === 'distant') {
      context.globalCompositeOperation = 'screen'
      context.fillStyle = `rgba(132, 163, 184, ${alpha})`
      for (let step = 0; step < drop.length; step += 1) {
        context.fillRect(x - Math.floor(step / 2), y + step, 1, 1)
      }
      continue
    }

    if (drop.kind === 'streak') {
      context.globalCompositeOperation = 'screen'
      for (let step = 0; step < drop.length; step += 1) {
        const fade = 0.35 + (step / drop.length) * 0.65
        context.fillStyle = `rgba(163, 191, 207, ${alpha * fade})`
        context.fillRect(x - Math.floor(step / 3), y + step, 1, 1)
      }
      context.fillStyle = `rgba(226, 231, 222, ${alpha * 0.72})`
      context.fillRect(x - Math.floor((drop.length - 1) / 3), y + drop.length - 1, 1, 1)
      continue
    }

    if (drop.kind === 'bead') {
      context.globalCompositeOperation = 'source-over'
      context.fillStyle = `rgba(60, 91, 112, ${alpha * 0.34})`
      context.fillRect(x, y - drop.length - 1, 1, drop.length + 1)
      context.globalCompositeOperation = 'screen'
      context.fillStyle = `rgba(176, 202, 214, ${alpha})`
      context.fillRect(x, y, 1, Math.max(1, drop.length))
      if (drop.opacity > 0.2) {
        context.fillStyle = `rgba(231, 222, 190, ${alpha * 0.45})`
        context.fillRect(x + 1, y, 1, 1)
      }
      continue
    }

    const impactProgress = getRainImpactProgress(drop, elapsedMs)
    if (impactProgress === null) continue
    const pulse = Math.sin(impactProgress * Math.PI)
    const radius = impactProgress < 0.55 ? 1 : 2
    context.globalCompositeOperation = 'screen'
    context.fillStyle = `rgba(188, 211, 218, ${alpha * pulse})`
    context.fillRect(x - radius, y, 1, 1)
    context.fillRect(x + radius, y, 1, 1)
    context.fillRect(x, y - radius, 1, 1)
    context.fillRect(x, y + radius, 1, 1)
    if (impactProgress < 0.32) context.fillRect(x, y, 1, 1)
  }

  context.restore()
}

export function renderGlassTraces(
  context: CanvasRenderingContext2D,
  traces: readonly GlassTrace[],
  elapsedMs: number,
): void {
  context.save()
  clipToMainWindow(context)

  for (const trace of traces) {
    const ageProgress = Math.min(1, Math.max(0, (elapsedMs - trace.createdAt) / 4200))
    const fade = 1 - ageProgress
    const radius = Math.max(3, Math.round(getGlassTraceRadius(trace.createdAt, elapsedMs, 4200)))
    const x = Math.round(trace.x)
    const y = Math.round(trace.y)

    context.globalCompositeOperation = 'source-over'
    context.fillStyle = `rgba(8, 20, 31, ${0.08 * fade})`
    context.fillRect(x - radius, y - 1, radius * 2, 3)
    context.globalCompositeOperation = 'screen'
    context.fillStyle = `rgba(149, 183, 199, ${0.035 * fade})`
    context.fillRect(x - radius + 1, y - 2, Math.max(1, radius * 2 - 3), 1)
    context.fillStyle = `rgba(225, 207, 166, ${0.026 * fade})`
    context.fillRect(x + radius - 1, y + 1, 1, 1)
  }

  context.restore()
}
