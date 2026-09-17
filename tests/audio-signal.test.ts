import { describe, expect, it } from 'vitest'

import { closeLoopEndpoint } from '../src/audio/signal'

describe('closeLoopEndpoint', () => {
  it('makes the first and last sample meet without changing the first sample', () => {
    const samples = Float32Array.from([0.25, 0.8, -0.4, -0.75])
    const closed = closeLoopEndpoint(samples)

    expect(closed[0]).toBeCloseTo(0.25)
    expect(closed.at(-1)).toBeCloseTo(0.25)
  })

  it('does not mutate the generated source samples', () => {
    const samples = Float32Array.from([0.1, 0.2, 0.3])

    closeLoopEndpoint(samples)

    expect([...samples]).toEqual([
      expect.closeTo(0.1),
      expect.closeTo(0.2),
      expect.closeTo(0.3),
    ])
  })
})
