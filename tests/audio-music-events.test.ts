import { describe, expect, it, vi } from 'vitest'

import { MusicEventRegistry } from '../src/audio/music-event-registry'

function createScheduledEvent() {
  let ended: (() => void) | null = null
  const source = {
    addEventListener: vi.fn((type: string, listener: () => void) => {
      if (type === 'ended') ended = listener
    }),
    stop: vi.fn(),
  }
  const gain = {
    gain: {
      cancelAndHoldAtTime: vi.fn(),
      setTargetAtTime: vi.fn(),
    },
  }

  return {
    source,
    gain,
    finish: () => ended?.(),
  }
}

describe('MusicEventRegistry', () => {
  it('removes a completed transient from the active registry', () => {
    const registry = new MusicEventRegistry()
    const event = createScheduledEvent()

    registry.track(
      event.source as unknown as AudioScheduledSourceNode,
      event.gain as unknown as GainNode,
    )
    expect(registry.size).toBe(1)

    event.finish()
    expect(registry.size).toBe(0)
  })

  it('smoothly retires every pending kick and brush on a track switch', () => {
    const registry = new MusicEventRegistry()
    const kick = createScheduledEvent()
    const brush = createScheduledEvent()

    registry.track(
      kick.source as unknown as AudioScheduledSourceNode,
      kick.gain as unknown as GainNode,
    )
    registry.track(
      brush.source as unknown as AudioScheduledSourceNode,
      brush.gain as unknown as GainNode,
    )
    registry.retireAll(12.5)

    for (const event of [kick, brush]) {
      expect(event.gain.gain.cancelAndHoldAtTime).toHaveBeenCalledWith(12.5)
      expect(event.gain.gain.setTargetAtTime).toHaveBeenCalledWith(
        0.0001,
        12.5,
        0.025,
      )
      expect(event.source.stop).toHaveBeenCalledWith(12.62)
    }
    expect(registry.size).toBe(0)
  })
})
