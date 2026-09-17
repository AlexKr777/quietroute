import { describe, expect, it } from 'vitest'

import {
  calculateIntegerAspectCrop,
  calculateIntegerCoverLayout,
  isRenderableViewport,
} from '../src/scene/layout'

describe('isRenderableViewport', () => {
  it('accepts a visible desktop-app viewport', () => {
    expect(isRenderableViewport(480, 322, 1.5)).toBe(true)
  })

  it('rejects transient zero-size frames during native window resizing', () => {
    expect(isRenderableViewport(0, 0, 1)).toBe(false)
  })

  it('rejects invalid device scale factors', () => {
    expect(isRenderableViewport(480, 322, Number.NaN)).toBe(false)
    expect(isRenderableViewport(480, 322, 0)).toBe(false)
  })
})

describe('calculateIntegerCoverLayout', () => {
  it('maps a 640x360 scene to a 4K viewport with an exact 6x scale', () => {
    expect(calculateIntegerCoverLayout(3840, 2160)).toEqual({
      scale: 6,
      width: 3840,
      height: 2160,
      offsetX: 0,
      offsetY: 0,
    })
  })

  it('uses integer cover scaling and symmetric cropping for a portrait viewport', () => {
    expect(calculateIntegerCoverLayout(1170, 2532)).toEqual({
      scale: 8,
      width: 5120,
      height: 2880,
      offsetX: -1975,
      offsetY: -174,
    })
  })

  it('rejects invalid viewport dimensions', () => {
    expect(() => calculateIntegerCoverLayout(0, 2160)).toThrow(
      'Viewport dimensions must be positive',
    )
  })
})

describe('calculateIntegerAspectCrop', () => {
  it('finds the largest centered integer 16:9 crop inside the reference image', () => {
    expect(calculateIntegerAspectCrop(1672, 941, 16, 9)).toEqual({
      sourceX: 4,
      sourceY: 2,
      sourceWidth: 1664,
      sourceHeight: 936,
    })
  })

  it('rejects invalid source dimensions', () => {
    expect(() => calculateIntegerAspectCrop(0, 941, 16, 9)).toThrow(
      'Image and aspect dimensions must be positive integers',
    )
  })
})
