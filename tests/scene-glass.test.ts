import { describe, expect, it } from 'vitest'

import {
  getActiveGlassTraces,
  getGlassTraceRadius,
  interpolateScenePoints,
  isInsideMainWindow,
  mapViewportPointToScene,
} from '../src/scene/glass'

describe('mapViewportPointToScene', () => {
  it('maps a cropped canvas rectangle back to the 640x360 scene', () => {
    expect(
      mapViewportPointToScene(960, 540, {
        left: 0,
        top: 0,
        width: 1920,
        height: 1080,
      }),
    ).toEqual({ x: 320, y: 180 })
  })
})

describe('isInsideMainWindow', () => {
  it('accepts the city view and rejects the seat area', () => {
    expect(isInsideMainWindow({ x: 300, y: 160 })).toBe(true)
    expect(isInsideMainWindow({ x: 580, y: 300 })).toBe(false)
  })
})

describe('getActiveGlassTraces', () => {
  it('drops expired traces while keeping recent pointer marks', () => {
    const traces = [
      { x: 100, y: 100, createdAt: 100 },
      { x: 110, y: 105, createdAt: 2100 },
    ]

    expect(getActiveGlassTraces(traces, 2500, 1200)).toEqual([traces[1]])
  })
})

describe('interpolateScenePoints', () => {
  it('fills a fast pointer stroke without gaps larger than two scene pixels', () => {
    const points = interpolateScenePoints({ x: 10, y: 10 }, { x: 22, y: 16 }, 2)

    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1]
      const current = points[index]
      if (!previous || !current) continue
      expect(Math.hypot(current.x - previous.x, current.y - previous.y))
        .toBeLessThanOrEqual(2.01)
    }
  })
})

describe('getGlassTraceRadius', () => {
  it('lets a cleared stroke close gradually instead of expanding', () => {
    const fresh = getGlassTraceRadius(1000, 1000, 4200)
    const aging = getGlassTraceRadius(1000, 3500, 4200)

    expect(fresh).toBe(9)
    expect(aging).toBeLessThan(fresh)
    expect(aging).toBeGreaterThanOrEqual(3)
  })
})
