import { describe, expect, it } from 'vitest'

import { COMFORT_MIX_PROFILE } from '../src/audio/comfort-profile'

describe('comfort mix profile', () => {
  it('leaves generous master headroom instead of compressing a dense mix', () => {
    expect(COMFORT_MIX_PROFILE.masterLevel).toBeLessThanOrEqual(0.64)
    expect(COMFORT_MIX_PROFILE.compressor.ratio).toBeLessThanOrEqual(1.8)
    expect(COMFORT_MIX_PROFILE.compressor.release).toBeGreaterThanOrEqual(0.65)
  })

  it('does not add a permanent high-frequency noise layer to music', () => {
    expect(COMFORT_MIX_PROFILE.music.continuousNoiseLevel).toBe(0)
    expect(COMFORT_MIX_PROFILE.music.highpassFrequency).toBeGreaterThanOrEqual(60)
  })

  it('keeps optional environmental layers below attention-grabbing levels', () => {
    expect(COMFORT_MIX_PROFILE.wind.floorLevel).toBeGreaterThanOrEqual(0.004)
    expect(COMFORT_MIX_PROFILE.wind.gustMaximum).toBeGreaterThan(0.03)
    expect(COMFORT_MIX_PROFILE.wind.gustMaximum).toBeLessThanOrEqual(0.055)
    expect(COMFORT_MIX_PROFILE.tram.motorLevel).toBeLessThanOrEqual(0.008)
    expect(COMFORT_MIX_PROFILE.night.callPeak).toBeGreaterThanOrEqual(0.01)
    expect(COMFORT_MIX_PROFILE.night.callPeak).toBeLessThanOrEqual(0.02)
    expect(COMFORT_MIX_PROFILE.thunder.eventMaximum).toBeGreaterThan(0.025)
    expect(COMFORT_MIX_PROFILE.thunder.eventMaximum).toBeLessThanOrEqual(0.045)
  })

  it('keeps the lo-fi rhythm transient and below fatigue-prone peaks', () => {
    expect(COMFORT_MIX_PROFILE.music.kickPeak).toBeLessThanOrEqual(0.026)
    expect(COMFORT_MIX_PROFILE.music.brushPeak).toBeLessThanOrEqual(0.006)
    expect(COMFORT_MIX_PROFILE.music.bassPeak).toBeLessThanOrEqual(0.022)
  })

  it('keeps the persistent stereo noise bed inside a mobile-safe memory budget', () => {
    const durations = Object.values(COMFORT_MIX_PROFILE.bufferDurations)
    const persistentBufferBytes = durations.reduce((total, seconds) => total + seconds, 0) *
      COMFORT_MIX_PROFILE.bufferSampleRate *
      2 *
      Float32Array.BYTES_PER_ELEMENT

    expect(COMFORT_MIX_PROFILE.bufferSampleRate).toBeGreaterThanOrEqual(12_000)
    expect(COMFORT_MIX_PROFILE.bufferSampleRate).toBeLessThanOrEqual(16_000)
    expect(persistentBufferBytes).toBeLessThanOrEqual(16 * 1024 * 1024)
    expect(new Set(durations).size).toBe(durations.length)
  })
})
