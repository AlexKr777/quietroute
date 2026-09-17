export interface RainBounds {
  width: number
  height: number
}

export type RainDropKind = 'distant' | 'streak' | 'bead' | 'impact'

export interface RainDrop {
  kind: RainDropKind
  x: number
  y: number
  length: number
  speed: number
  drift: number
  opacity: number
  phaseOffsetMs: number
  cycleMs: number
  holdRatio: number
}

export interface RainDropPosition {
  x: number
  y: number
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

function wrap(value: number, span: number): number {
  return ((value % span) + span) % span
}

function smootherStep(progress: number): number {
  const value = Math.min(1, Math.max(0, progress))
  return value ** 3 * (value * (value * 6 - 15) + 10)
}

function selectKind(index: number): RainDropKind {
  const slot = index % 20
  if (slot < 9) return 'distant'
  if (slot < 14) return 'streak'
  if (slot < 19) return 'bead'
  return 'impact'
}

export function getRainDensity(prefersReducedMotion: boolean): number {
  return prefersReducedMotion ? 14 : 44
}

export function createRainField(
  seed: number,
  density: number,
  bounds: RainBounds,
): RainDrop[] {
  if (!Number.isInteger(density) || density < 0) {
    throw new Error('Rain density must be a non-negative integer')
  }
  if (bounds.width <= 0 || bounds.height <= 0) {
    throw new Error('Rain bounds must be positive')
  }

  const random = createSeededRandom(seed)
  return Array.from({ length: density }, (_, index) => {
    const kind = selectKind(index)
    const common = {
      kind,
      x: random() * bounds.width,
      y: random() * bounds.height,
    }

    if (kind === 'distant') {
      return {
        ...common,
        length: 1 + Math.floor(random() * 3),
        speed: 16 + random() * 12,
        drift: -2.4 + random() * 1.8,
        opacity: 0.05 + random() * 0.08,
        phaseOffsetMs: random() * 2200,
        cycleMs: 2200,
        holdRatio: 0,
      }
    }

    if (kind === 'streak') {
      return {
        ...common,
        length: 3 + Math.floor(random() * 6),
        speed: 30 + random() * 18,
        drift: -4 + random() * 2.5,
        opacity: 0.08 + random() * 0.1,
        phaseOffsetMs: random() * 1800,
        cycleMs: 1800,
        holdRatio: 0,
      }
    }

    if (kind === 'bead') {
      const cycleMs = 2600 + random() * 5400
      return {
        ...common,
        length: 1 + Math.floor(random() * 2),
        speed: 2 + random() * 4,
        drift: -0.25 + random() * 0.5,
        opacity: 0.12 + random() * 0.16,
        phaseOffsetMs: random() * cycleMs,
        cycleMs,
        holdRatio: 0.45 + random() * 0.35,
      }
    }

    const cycleMs = 4200 + random() * 6800
    return {
      ...common,
      length: 1,
      speed: 0,
      drift: 0,
      opacity: 0.18 + random() * 0.16,
      phaseOffsetMs: random() * cycleMs,
      cycleMs,
      holdRatio: 0.92 + random() * 0.05,
    }
  })
}

export function getRainDropPosition(
  drop: RainDrop,
  elapsedMs: number,
  bounds: RainBounds,
): RainDropPosition {
  const safeElapsedMs = Math.max(0, elapsedMs)

  if (drop.kind === 'impact') {
    return { x: drop.x, y: drop.y }
  }

  if (drop.kind === 'bead') {
    const totalMs = safeElapsedMs + drop.phaseOffsetMs
    const cycleIndex = Math.floor(totalMs / drop.cycleMs)
    const cycleProgress = (totalMs % drop.cycleMs) / drop.cycleMs
    const slipProgress = cycleProgress <= drop.holdRatio
      ? 0
      : smootherStep(
          (cycleProgress - drop.holdRatio) / (1 - drop.holdRatio),
        )
    const slipDistance = 8 + drop.speed * 3
    const traveled = (cycleIndex + slipProgress) * slipDistance
    const verticalSpan = bounds.height + drop.length
    const wobble = Math.sin(totalMs / 780 + drop.x) * 0.55

    return {
      x: wrap(drop.x + wobble + drop.drift * (cycleIndex + slipProgress), bounds.width),
      y: wrap(drop.y + drop.length + traveled, verticalSpan) - drop.length,
    }
  }

  const elapsedSeconds = safeElapsedMs / 1000
  const verticalSpan = bounds.height + drop.length

  return {
    x: wrap(drop.x + drop.drift * elapsedSeconds, bounds.width),
    y: wrap(drop.y + drop.length + drop.speed * elapsedSeconds, verticalSpan) -
      drop.length,
  }
}

export function getRainImpactProgress(
  drop: RainDrop,
  elapsedMs: number,
): number | null {
  if (drop.kind !== 'impact') return null

  const totalMs = Math.max(0, elapsedMs) + drop.phaseOffsetMs
  const phase = (totalMs % drop.cycleMs) / drop.cycleMs
  if (phase < drop.holdRatio) return null

  return Math.min(1, Math.max(0, (phase - drop.holdRatio) / (1 - drop.holdRatio)))
}
