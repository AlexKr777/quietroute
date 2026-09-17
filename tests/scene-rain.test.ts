import { describe, expect, it } from 'vitest'

import {
  createRainField,
  getRainDensity,
  getRainDropPosition,
  getRainImpactProgress,
  type RainDrop,
} from '../src/scene/rain'

const bounds = { width: 640, height: 360 }

describe('createRainField', () => {
  it('returns the same drops for the same seed', () => {
    expect(createRainField(2347, 8, bounds)).toEqual(
      createRainField(2347, 8, bounds),
    )
  })

  it('keeps generated drop properties inside restrained ranges', () => {
    const drops = createRainField(2347, 96, bounds)

    expect(drops).toHaveLength(96)
    for (const drop of drops) {
      expect(drop.x).toBeGreaterThanOrEqual(0)
      expect(drop.x).toBeLessThan(bounds.width)
      expect(drop.y).toBeGreaterThanOrEqual(0)
      expect(drop.y).toBeLessThan(bounds.height)
      expect(drop.length).toBeGreaterThanOrEqual(1)
      expect(drop.length).toBeLessThanOrEqual(8)
      expect(drop.speed).toBeGreaterThanOrEqual(0)
      expect(drop.speed).toBeLessThanOrEqual(48)
      expect(drop.opacity).toBeGreaterThanOrEqual(0.05)
      expect(drop.opacity).toBeLessThanOrEqual(0.34)
    }
  })

  it('mixes distant rain, diagonal streaks, sticky beads, and rare impacts', () => {
    const kinds = new Set(createRainField(2347, 96, bounds).map((drop) => drop.kind))

    expect(kinds).toEqual(new Set(['distant', 'streak', 'bead', 'impact']))
  })

  it('keeps glass beads slower than exterior streaks', () => {
    const drops = createRainField(2347, 96, bounds)
    const beads = drops.filter((drop) => drop.kind === 'bead')
    const streaks = drops.filter((drop) => drop.kind === 'streak')

    expect(beads.length).toBeGreaterThan(0)
    expect(streaks.length).toBeGreaterThan(0)
    expect(Math.max(...beads.map((drop) => drop.speed)))
      .toBeLessThan(Math.min(...streaks.map((drop) => drop.speed)))
  })
})

describe('getRainDropPosition', () => {
  it('wraps a falling drop back above the scene without losing it', () => {
    const [drop] = createRainField(23, 1, bounds)
    if (!drop) throw new Error('Expected one drop')

    const position = getRainDropPosition(drop, 120_000, bounds)

    expect(position.x).toBeGreaterThanOrEqual(0)
    expect(position.x).toBeLessThan(bounds.width)
    expect(position.y).toBeGreaterThanOrEqual(-drop.length)
    expect(position.y).toBeLessThan(bounds.height)
  })

  it('lets a bead rest on the glass before it slips', () => {
    const bead: RainDrop = {
      kind: 'bead',
      x: 80,
      y: 40,
      length: 2,
      speed: 4,
      drift: 0.1,
      opacity: 0.22,
      phaseOffsetMs: 0,
      cycleMs: 2000,
      holdRatio: 0.6,
    }

    const resting = getRainDropPosition(bead, 300, bounds)
    const stillResting = getRainDropPosition(bead, 900, bounds)
    const slipping = getRainDropPosition(bead, 1700, bounds)

    expect(stillResting.y).toBeCloseTo(resting.y)
    expect(slipping.y).toBeGreaterThan(stillResting.y)
  })
})

describe('getRainImpactProgress', () => {
  it('shows a rare short impact rather than a continuously visible mark', () => {
    const impact: RainDrop = {
      kind: 'impact',
      x: 120,
      y: 90,
      length: 1,
      speed: 0,
      drift: 0,
      opacity: 0.2,
      phaseOffsetMs: 0,
      cycleMs: 5000,
      holdRatio: 0.94,
    }

    expect(getRainImpactProgress(impact, 1000)).toBeNull()
    expect(getRainImpactProgress(impact, 4900)).toBeGreaterThanOrEqual(0)
    expect(getRainImpactProgress(impact, 4900)).toBeLessThanOrEqual(1)
  })
})

describe('getRainDensity', () => {
  it('keeps reduced motion calm without removing the rain completely', () => {
    expect(getRainDensity(true)).toBeGreaterThan(0)
    expect(getRainDensity(true)).toBeLessThan(getRainDensity(false))
  })
})
