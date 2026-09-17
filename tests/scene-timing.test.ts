import { describe, expect, it } from 'vitest'

import {
  easeOutCubic,
  getEntryFrame,
  getEntryMotion,
  quantizeCameraOffset,
} from '../src/scene/timing'

describe('getEntryMotion', () => {
  it('keeps the full first-person sit-down motion by default', () => {
    expect(getEntryMotion(false)).toEqual({
      durationMs: 2200,
      startX: -18,
      startY: 58,
      contactY: -25,
      startScale: 1.055,
    })
  })

  it('replaces camera movement with a short fade for reduced motion', () => {
    expect(getEntryMotion(true)).toEqual({
      durationMs: 400,
      startX: 0,
      startY: 0,
      contactY: 0,
      startScale: 1,
    })
  })
})

describe('easeOutCubic', () => {
  it('clamps progress and preserves the exact endpoints', () => {
    expect(easeOutCubic(-1)).toBe(0)
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(2)).toBe(1)
  })

  it('moves quickly at first and settles gently', () => {
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875)
  })
})

describe('getEntryFrame', () => {
  it('starts in the standing framing', () => {
    expect(getEntryFrame(0, false)).toEqual({
      x: -18,
      y: 58,
      shade: 0,
      scale: 1.055,
      progress: 0,
    })
  })

  it('settles on the exact seated framing', () => {
    expect(getEntryFrame(2200, false)).toEqual({
      x: 0,
      y: 0,
      shade: 0,
      scale: 1,
      progress: 1,
    })
  })

  it('hits the designer keyframes during the seated camera motion', () => {
    const decision = getEntryFrame(2200 * 0.08, false)
    const descent = getEntryFrame(2200 * 0.54, false)
    const rebound = getEntryFrame(2200 * 0.72, false)
    const secondSettle = getEntryFrame(2200 * 0.88, false)

    expect(decision).toMatchObject({
      x: -18,
      y: 58,
      shade: 0.02,
      scale: 1.055,
    })
    expect(descent).toMatchObject({
      x: 7,
      y: -25,
      shade: 0.34,
      scale: 1.075,
    })
    expect(rebound).toMatchObject({
      x: -4,
      y: 14,
      shade: 0.16,
      scale: 1.055,
    })
    expect(secondSettle).toMatchObject({
      x: 2,
      y: -5,
      shade: 0.06,
      scale: 1.025,
    })
  })

  it('keeps neighboring frame movement restrained and settles without a large bounce', () => {
    const samples = Array.from({ length: 46 }, (_, index) =>
      getEntryFrame(index * (1000 / 30), false).y,
    )
    const deltas = samples.slice(1).map((value, index) =>
      Math.abs(value - (samples[index] ?? value)),
    )

    expect(Math.max(...deltas)).toBeLessThan(6.2)
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(-25.1)
  })

  it('does not move the camera when reduced motion is requested', () => {
    expect(getEntryFrame(200, true)).toEqual({
      x: 0,
      y: 0,
      shade: 0,
      scale: 1,
      progress: 0.875,
    })
  })

  it('quantizes camera offsets to physical pixels at fractional DPR', () => {
    expect(quantizeCameraOffset(2.26, 1.5)).toBeCloseTo(2)
    expect(quantizeCameraOffset(-2.26, 1.5)).toBeCloseTo(-2)
    expect(quantizeCameraOffset(3.4, 0)).toBe(3)
  })
})
