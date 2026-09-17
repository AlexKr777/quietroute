import { describe, expect, it } from 'vitest'

import { BIRDSONG_PROFILE } from '../src/audio/birdsong-profile'

describe('recorded birdsong profile', () => {
  it('uses one long local CC0 recording with a restrained playback profile', () => {
    expect(BIRDSONG_PROFILE.src).toBe('/audio/birds.mp3')
    expect(BIRDSONG_PROFILE.durationSeconds).toBeGreaterThan(180)
    expect(BIRDSONG_PROFILE.sourceUrl).toBe(
      'https://freesound.org/people/rubindaniel/sounds/730710/',
    )
    expect(BIRDSONG_PROFILE.license.name).toBe('CC0 1.0 Universal')
    expect(BIRDSONG_PROFILE.license.url).toBe(
      'https://creativecommons.org/publicdomain/zero/1.0/',
    )
    const measuredSourceRmsDb = -52.4
    const measuredSourcePeakDb = -27.08
    const trimDb = 20 * Math.log10(BIRDSONG_PROFILE.trimGain)

    expect(measuredSourceRmsDb + trimDb).toBeGreaterThanOrEqual(-34)
    expect(measuredSourceRmsDb + trimDb).toBeLessThanOrEqual(-32)
    expect(measuredSourcePeakDb + trimDb).toBeLessThanOrEqual(-7.5)
    expect(BIRDSONG_PROFILE.highpassFrequency).toBeGreaterThanOrEqual(180)
    expect(BIRDSONG_PROFILE.lowpassFrequency).toBeLessThanOrEqual(6_000)
  })
})
