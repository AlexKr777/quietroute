import { describe, expect, it, vi } from 'vitest'

import { RecordedAmbientPlayer } from '../src/audio/recorded-ambient-player'

const PROFILE = {
  src: '/audio/ambience/birds.mp3',
  trimGain: 0.24,
  highpassFrequency: 320,
  lowpassFrequency: 5_200,
}

function createFakeMedia(shouldReject = false, playGate?: Promise<void>) {
  const media = {
    src: '',
    loop: false,
    preload: '',
    paused: true,
    play: vi.fn(async () => {
      await playGate
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
  }

  return media
}

function createAudioHarness(
  shouldReject = false,
  playGate?: Promise<void>,
  onPlaybackUnavailable = vi.fn(),
) {
  const media = createFakeMedia(shouldReject, playGate)
  const source = { connect: vi.fn(), disconnect: vi.fn() }
  const filters = Array.from({ length: 2 }, () => ({
    type: 'lowpass',
    frequency: { value: 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }))
  let filterIndex = 0
  const trim = {
    gain: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
  const context = {
    createMediaElementSource: vi.fn(() => source),
    createBiquadFilter: vi.fn(() => filters[filterIndex++]),
    createGain: vi.fn(() => trim),
  }
  const output = { connect: vi.fn() }
  const player = new RecordedAmbientPlayer(
    context as unknown as AudioContext,
    output as unknown as AudioNode,
    PROFILE,
    onPlaybackUnavailable,
    () => media as unknown as HTMLAudioElement,
  )

  return { filters, media, onPlaybackUnavailable, player, source, trim }
}

describe('RecordedAmbientPlayer', () => {
  it('loads and starts a local ambience only when requested', async () => {
    const { filters, media, player, trim } = createAudioHarness()

    expect(media.src).toBe('')
    expect(media.preload).toBe('none')

    await expect(player.setActive(true)).resolves.toBe(true)

    expect(media.src).toBe(PROFILE.src)
    expect(media.loop).toBe(true)
    expect(media.preload).toBe('auto')
    expect(media.load).toHaveBeenCalledOnce()
    expect(media.play).toHaveBeenCalledOnce()
    expect(filters[0]?.type).toBe('highpass')
    expect(filters[0]?.frequency.value).toBe(PROFILE.highpassFrequency)
    expect(filters[1]?.type).toBe('lowpass')
    expect(filters[1]?.frequency.value).toBe(PROFILE.lowpassFrequency)
    expect(trim.gain.value).toBe(PROFILE.trimGain)
  })

  it('pauses when disabled and resumes the same recording after visibility', async () => {
    const { media, player } = createAudioHarness()
    await player.setActive(true)

    player.pause()
    await expect(player.resume()).resolves.toBe(true)
    await expect(player.setActive(false)).resolves.toBe(true)

    expect(media.pause).toHaveBeenCalledTimes(2)
    expect(media.play).toHaveBeenCalledTimes(2)
  })

  it('returns a clean failure when the recording cannot play', async () => {
    const { onPlaybackUnavailable, player } = createAudioHarness(true)

    await expect(player.setActive(true)).resolves.toBe(false)
    expect(onPlaybackUnavailable).toHaveBeenCalledOnce()
  })

  it('stays paused when disabled while the play request is pending', async () => {
    let releasePlayback = () => {}
    const playGate = new Promise<void>((resolve) => {
      releasePlayback = resolve
    })
    const { media, player } = createAudioHarness(false, playGate)

    const pendingPlayback = player.setActive(true)
    await player.setActive(false)
    releasePlayback()

    await expect(pendingPlayback).resolves.toBe(false)
    expect(media.paused).toBe(true)
  })

  it('does not report a delayed playback failure after the channel was disabled', async () => {
    let rejectPlayback = () => {}
    const playGate = new Promise<void>((resolve) => {
      rejectPlayback = resolve
    })
    const { onPlaybackUnavailable, player } = createAudioHarness(
      true,
      playGate,
    )

    const pendingPlayback = player.setActive(true)
    await player.setActive(false)
    rejectPlayback()

    await expect(pendingPlayback).resolves.toBe(false)
    expect(onPlaybackUnavailable).not.toHaveBeenCalled()
  })

  it('releases the media element and Web Audio nodes on dispose', async () => {
    const { filters, media, player, source, trim } = createAudioHarness()
    await player.setActive(true)

    player.dispose()

    expect(media.removeAttribute).toHaveBeenCalledWith('src')
    expect(source.disconnect).toHaveBeenCalledOnce()
    expect(filters[0]?.disconnect).toHaveBeenCalledOnce()
    expect(filters[1]?.disconnect).toHaveBeenCalledOnce()
    expect(trim.disconnect).toHaveBeenCalledOnce()
  })
})
