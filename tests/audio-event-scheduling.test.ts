import { describe, expect, it } from 'vitest'

import {
  getNightEventDelay,
  getRainEventDelay,
  getThunderEventDelay,
  getTramEventDelay,
  getWindEventDelay,
  selectRainEvent,
} from '../src/audio/event-scheduling'
import { GENTLE_RAIN_PROFILE } from '../src/audio/rain-profile'

describe('gentle rain profile', () => {
  it('keeps the continuous bed below a heavy shower mix', () => {
    expect(GENTLE_RAIN_PROFILE.bodyLevel).toBeLessThanOrEqual(0.12)
    expect(GENTLE_RAIN_PROFILE.airLevel).toBeLessThanOrEqual(0.008)
    expect(GENTLE_RAIN_PROFILE.roadLevel).toBeLessThanOrEqual(0.06)
    expect(GENTLE_RAIN_PROFILE.impactLevel.maximum).toBeLessThanOrEqual(0.009)
    expect(GENTLE_RAIN_PROFILE.impactFrequency.maximum).toBeLessThanOrEqual(1900)
    expect(GENTLE_RAIN_PROFILE.resonanceFrequency.maximum).toBeLessThanOrEqual(1500)
  })
})

describe('rain event scheduling', () => {
  it('uses sparse variable gaps instead of a fixed mechanical interval', () => {
    const delays = [0, 0.2, 0.5, 0.8, 1].map(getRainEventDelay)

    expect(Math.min(...delays)).toBeGreaterThanOrEqual(1100)
    expect(Math.max(...delays)).toBeLessThanOrEqual(7600)
    expect(new Set(delays).size).toBe(delays.length)
  })

  it('mixes common taps with rarer drips and runoff chains', () => {
    expect(selectRainEvent(0.2)).toBe('tap')
    expect(selectRainEvent(0.82)).toBe('drip')
    expect(selectRainEvent(0.98)).toBe('runoff')
  })

  it('keeps night events rare', () => {
    expect(getNightEventDelay(0)).toBeGreaterThanOrEqual(14000)
    expect(getNightEventDelay(1)).toBeLessThanOrEqual(40000)
  })

  it('spaces wind, tram, and distant thunder events without mechanical loops', () => {
    expect(getWindEventDelay(0)).toBeGreaterThanOrEqual(7000)
    expect(getWindEventDelay(1)).toBeLessThanOrEqual(22000)
    expect(getTramEventDelay(0)).toBeGreaterThanOrEqual(2400)
    expect(getTramEventDelay(1)).toBeLessThanOrEqual(7000)
    expect(getThunderEventDelay(0)).toBeGreaterThanOrEqual(28000)
    expect(getThunderEventDelay(1)).toBeLessThanOrEqual(70000)
  })
})
