import { afterEach, describe, expect, it, vi } from 'vitest'

import type { RecordedMusicTrack } from '../src/audio/music-library'
import { RecordedMusicPlayer } from '../src/audio/recorded-music-player'

function createTrack(id: string, trimGain = 0.16): RecordedMusicTrack {
  return {
    id,
    title: id,
    artist: 'VHS Jazz',
    src: `/audio/${id}.mp3`,
    sourceUrl: `https://freemusicarchive.org/${id}`,
    license: {
      name: 'CC0 1.0 Universal',
      url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    },
    trimGain,
    fallbackArrangementIndex: 0,
  }
}

function createFakeMedia(shouldReject = false) {
  const listeners = new Map<string, Set<() => void>>()
  const media = {
    src: '',
    loop: false,
    preload: '',
    currentTime: 0,
    duration: 180,
    paused: true,
    play: vi.fn(async () => {
      if (shouldReject) throw new Error('unsupported recording')
      media.paused = false
    }),
    pause: vi.fn(() => {
      media.paused = true
    }),
    load: vi.fn(),
    removeAttribute: vi.fn((name: string) => {
      if (name === 'src') media.src = ''
    }),
    addEventListener: vi.fn((name: string, listener: () => void) => {
      const callbacks = listeners.get(name) ?? new Set<() => void>()
      callbacks.add(listener)
      listeners.set(name, callbacks)
    }),
    removeEventListener: vi.fn((name: string, listener: () => void) => {
      listeners.get(name)?.delete(listener)
    }),
    dispatch: (name: string) => {
      for (const listener of listeners.get(name) ?? []) listener()
    },
  }

  return media
}

function createAudioHarness(
  rejectSecond = false,
  onTrackEnding = vi.fn<(trackId: string) => void>(),
) {
  const media = [createFakeMedia(), createFakeMedia(rejectSecond)]
  const gains = Array.from({ length: 2 }, () => ({
    gain: {
      value: 1,
      cancelAndHoldAtTime: vi.fn(),
      setValueAtTime: vi.fn(),
      setTargetAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }))
  let gainIndex = 0
  const sources = Array.from({ length: 2 }, () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
  }))
  let sourceIndex = 0
  const context = {
    currentTime: 4,
    createGain: vi.fn(() => gains[gainIndex++]),
    createMediaElementSource: vi.fn(() => sources[sourceIndex++]),
  }
  let mediaIndex = 0
  const createMedia = () => media[mediaIndex++] as unknown as HTMLAudioElement

  const player = new RecordedMusicPlayer(
    context as unknown as AudioContext,
    { connect: vi.fn() } as unknown as AudioNode,
    createMedia,
    onTrackEnding,
  )

  return { context, gains, media, onTrackEnding, player, sources }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('RecordedMusicPlayer', () => {
  it('streams a local track through one reusable Web Audio deck', async () => {
    const { media, player } = createAudioHarness()
    const track = createTrack('moon-unit', 0.14)

    await expect(player.select(track)).resolves.toBe(true)

    expect(media[0]?.src).toBe(track.src)
    expect(media[0]?.loop).toBe(false)
    expect(media[0]?.preload).toBe('auto')
    expect(media[0]?.play).toHaveBeenCalledOnce()
    expect(player.currentTrackId).toBe(track.id)
  })

  it('crossfades before retiring the previous recording', async () => {
    vi.useFakeTimers()
    const { gains, media, player } = createAudioHarness()
    const first = createTrack('moon-unit', 0.14)
    const second = createTrack('vintage', 0.17)

    await player.select(first)
    await player.select(second)

    expect(gains[0]?.gain.setTargetAtTime).toHaveBeenCalledWith(
      0.0001,
      4,
      expect.any(Number),
    )
    expect(gains[1]?.gain.setTargetAtTime).toHaveBeenCalledWith(
      second.trimGain,
      4,
      expect.any(Number),
    )
    expect(player.currentTrackId).toBe(second.id)

    await vi.advanceTimersByTimeAsync(1200)
    expect(media[0]?.pause).toHaveBeenCalledTimes(2)
  })

  it('returns a clean failure so the engine can keep procedural fallback', async () => {
    const { media, player } = createAudioHarness(true)

    await player.select(createTrack('moon-unit'))
    await expect(player.select(createTrack('missing'))).resolves.toBe(false)

    expect(media[1]?.pause).toHaveBeenCalled()
    expect(player.currentTrackId).toBeNull()
  })

  it('ignores an older play result during rapid track changes', async () => {
    const { media, player } = createAudioHarness()
    await player.select(createTrack('night-flight'))

    let resolveOlder!: () => void
    let resolveLatest!: () => void
    media[1]?.play
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        resolveOlder = resolve
      }))
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        resolveLatest = resolve
      }))

    const olderSelection = player.select(createTrack('skylight'))
    const latestSelection = player.select(createTrack('midnight'))
    resolveOlder()
    await expect(olderSelection).resolves.toBe(false)

    resolveLatest()
    await expect(latestSelection).resolves.toBe(true)
    expect(player.currentTrackId).toBe('midnight')
  })

  it('requests the next track before the current recording ends', async () => {
    const { media, onTrackEnding, player } = createAudioHarness()
    await player.select(createTrack('moon-unit'))

    if (media[0]) media[0].currentTime = 178
    media[0]?.dispatch('timeupdate')
    media[0]?.dispatch('timeupdate')

    expect(onTrackEnding).toHaveBeenCalledOnce()
    expect(onTrackEnding).toHaveBeenCalledWith('moon-unit')
  })

  it('still requests the next track from ended when duration is unavailable', async () => {
    const { media, onTrackEnding, player } = createAudioHarness()
    await player.select(createTrack('night-flight'))

    if (media[0]) media[0].duration = Number.NaN
    media[0]?.dispatch('timeupdate')
    expect(onTrackEnding).not.toHaveBeenCalled()

    media[0]?.dispatch('ended')
    expect(onTrackEnding).toHaveBeenCalledOnce()
    expect(onTrackEnding).toHaveBeenCalledWith('night-flight')
  })

  it('pauses, resumes, and releases both media decks on lifecycle changes', async () => {
    const { gains, media, player, sources } = createAudioHarness()
    await player.select(createTrack('moon-unit'))

    player.pause()
    await expect(player.resume()).resolves.toBe(true)
    player.dispose()

    expect(media[0]?.pause).toHaveBeenCalled()
    expect(media[0]?.removeAttribute).toHaveBeenCalledWith('src')
    expect(media[1]?.removeAttribute).toHaveBeenCalledWith('src')
    expect(sources[0]?.disconnect).toHaveBeenCalled()
    expect(sources[1]?.disconnect).toHaveBeenCalled()
    expect(gains[0]?.disconnect).toHaveBeenCalled()
    expect(gains[1]?.disconnect).toHaveBeenCalled()
  })
})
