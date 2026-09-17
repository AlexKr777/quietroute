export interface EntryMotion {
  durationMs: number
  startX: number
  startY: number
  contactY: number
  startScale: number
}

export interface EntryFrame {
  x: number
  y: number
  shade: number
  scale: number
  progress: number
}

const STANDARD_ENTRY: EntryMotion = {
  durationMs: 2200,
  startX: -18,
  startY: 58,
  contactY: -25,
  startScale: 1.055,
}

const REDUCED_ENTRY: EntryMotion = {
  durationMs: 400,
  startX: 0,
  startY: 0,
  contactY: 0,
  startScale: 1,
}

function clampProgress(progress: number): number {
  return Math.min(1, Math.max(0, progress))
}

function smootherStep(progress: number): number {
  const value = clampProgress(progress)
  return value ** 3 * (value * (value * 6 - 15) + 10)
}

function interpolate(from: number, to: number, progress: number): number {
  return from + (to - from) * progress
}

export function getEntryMotion(prefersReducedMotion: boolean): EntryMotion {
  return prefersReducedMotion ? { ...REDUCED_ENTRY } : { ...STANDARD_ENTRY }
}

export function easeOutCubic(progress: number): number {
  const clamped = clampProgress(progress)
  return 1 - (1 - clamped) ** 3
}

export function quantizeCameraOffset(value: number, dpr: number): number {
  const safeDpr = Number.isFinite(dpr) && dpr >= 1 ? dpr : 1
  return Math.round(value * safeDpr) / safeDpr
}

export function getEntryFrame(
  elapsedMs: number,
  prefersReducedMotion: boolean,
): EntryFrame {
  const motion = getEntryMotion(prefersReducedMotion)
  const rawProgress = clampProgress(elapsedMs / motion.durationMs)
  const progress = easeOutCubic(rawProgress)

  if (prefersReducedMotion) {
    return { x: 0, y: 0, shade: 0, scale: 1, progress }
  }

  if (rawProgress === 0) {
    return {
      x: motion.startX,
      y: motion.startY,
      shade: 0,
      scale: motion.startScale,
      progress,
    }
  }

  const decisionEnd = 0.08
  const descentEnd = 0.54
  const reboundEnd = 0.72
  const secondSettleEnd = 0.88

  if (rawProgress < decisionEnd) {
    const phase = smootherStep(rawProgress / decisionEnd)
    return {
      x: motion.startX,
      y: motion.startY,
      shade: 0.02 * phase,
      scale: motion.startScale,
      progress,
    }
  }

  if (rawProgress < descentEnd) {
    const phase = smootherStep(
      (rawProgress - decisionEnd) / (descentEnd - decisionEnd),
    )
    return {
      x: interpolate(motion.startX, 7, phase),
      y: interpolate(motion.startY, motion.contactY, phase),
      shade: interpolate(0.02, 0.34, phase),
      scale: interpolate(motion.startScale, 1.075, phase),
      progress,
    }
  }

  if (rawProgress < reboundEnd) {
    const phase = smootherStep(
      (rawProgress - descentEnd) / (reboundEnd - descentEnd),
    )
    return {
      x: interpolate(7, -4, phase),
      y: interpolate(motion.contactY, 14, phase),
      shade: interpolate(0.34, 0.16, phase),
      scale: interpolate(1.075, 1.055, phase),
      progress,
    }
  }

  if (rawProgress < secondSettleEnd) {
    const phase = smootherStep(
      (rawProgress - reboundEnd) / (secondSettleEnd - reboundEnd),
    )
    return {
      x: interpolate(-4, 2, phase),
      y: interpolate(14, -5, phase),
      shade: interpolate(0.16, 0.06, phase),
      scale: interpolate(1.055, 1.025, phase),
      progress,
    }
  }

  if (rawProgress < 1) {
    const phase = smootherStep(
      (rawProgress - secondSettleEnd) / (1 - secondSettleEnd),
    )
    return {
      x: interpolate(2, 0, phase),
      y: interpolate(-5, 0, phase),
      shade: interpolate(0.06, 0, phase),
      scale: interpolate(1.025, 1, phase),
      progress,
    }
  }

  return { x: 0, y: 0, shade: 0, scale: 1, progress: 1 }
}
