import { describe, expect, it } from 'vitest'

import {
  AUDIO_CHANNELS,
  createInitialAudioState,
  cycleMusicTrack,
  resolveEffectiveGain,
  setChannelVolume,
  startAudioFromGesture,
  toggleChannelMute,
  toggleMasterMute,
} from '../src/audio/audio-state'
import { getMusicTrackCount } from '../src/audio/music-library'

describe('audio state', () => {
  it('keeps every channel silent before the entry gesture', () => {
    const state = createInitialAudioState()

    for (const channel of AUDIO_CHANNELS) {
      expect(resolveEffectiveGain(state, channel)).toBe(0)
    }
  })

  it('starts with a low-pressure core mix and optional ambience muted', () => {
    const state = createInitialAudioState()

    expect(state.musicTrackIndex).toBe(0)
    expect(state.channels.rain).toEqual({ volume: 0.44, muted: false })
    expect(state.channels.music).toEqual({ volume: 0.38, muted: false })
    expect(state.channels.tram).toEqual({ volume: 0.22, muted: false })
    expect(state.channels.wind).toEqual({ volume: 0.28, muted: true })
    expect(state.channels.night).toEqual({ volume: 0.28, muted: true })
    expect(state.channels.birds).toEqual({ volume: 0.18, muted: true })
    expect(state.channels.thunder).toEqual({ volume: 0.26, muted: true })
  })

  it('starts rain and music from the explicit entry gesture', () => {
    const state = startAudioFromGesture(createInitialAudioState())

    expect(resolveEffectiveGain(state, 'rain')).toBeCloseTo(0.44 ** 2)
    expect(resolveEffectiveGain(state, 'music')).toBeCloseTo(0.38 ** 2)
    expect(resolveEffectiveGain(state, 'tram')).toBeCloseTo(0.22 ** 2)
  })

  it('clamps a channel volume between zero and one', () => {
    const state = createInitialAudioState()

    expect(setChannelVolume(state, 'rain', 4).channels.rain.volume).toBe(1)
    expect(setChannelVolume(state, 'rain', -2).channels.rain.volume).toBe(0)
  })

  it('mutes rain without muting music', () => {
    const started = startAudioFromGesture(createInitialAudioState())
    const state = toggleChannelMute(started, 'rain')

    expect(resolveEffectiveGain(state, 'rain')).toBe(0)
    expect(resolveEffectiveGain(state, 'music')).toBeCloseTo(0.38 ** 2)
  })

  it('enables wind without changing rain, music, or night', () => {
    const started = startAudioFromGesture(createInitialAudioState())
    const state = toggleChannelMute(started, 'wind')

    expect(resolveEffectiveGain(state, 'wind')).toBeCloseTo(0.28 ** 2)
    expect(resolveEffectiveGain(state, 'rain')).toBeCloseTo(0.44 ** 2)
    expect(resolveEffectiveGain(state, 'music')).toBeCloseTo(0.38 ** 2)
    expect(resolveEffectiveGain(state, 'night')).toBe(0)
  })

  it('enables birds without changing rain, music, or night', () => {
    const started = startAudioFromGesture(createInitialAudioState())
    const state = toggleChannelMute(started, 'birds')

    expect(resolveEffectiveGain(state, 'birds')).toBeCloseTo(0.18 ** 2)
    expect(resolveEffectiveGain(state, 'rain')).toBeCloseTo(0.44 ** 2)
    expect(resolveEffectiveGain(state, 'music')).toBeCloseTo(0.38 ** 2)
    expect(resolveEffectiveGain(state, 'night')).toBe(0)
  })

  it('lets master mute override every independent channel', () => {
    const started = startAudioFromGesture(createInitialAudioState())
    const muted = toggleMasterMute(started)

    for (const channel of AUDIO_CHANNELS) {
      expect(resolveEffectiveGain(muted, channel)).toBe(0)
    }
  })

  it('cycles every recorded music track without changing channel settings', () => {
    const original = createInitialAudioState()
    const trackCount = getMusicTrackCount()
    const next = cycleMusicTrack(original, trackCount)
    let wrapped = original
    for (let index = 0; index < trackCount; index += 1) {
      wrapped = cycleMusicTrack(wrapped, trackCount)
    }

    expect(next.musicTrackIndex).toBe(1)
    expect(next.channels).toEqual(original.channels)
    expect(wrapped.musicTrackIndex).toBe(0)
  })

  it('cycles music tracks backwards and ignores an invalid track count', () => {
    const original = createInitialAudioState()

    const trackCount = getMusicTrackCount()
    expect(cycleMusicTrack(original, trackCount, -1).musicTrackIndex)
      .toBe(trackCount - 1)
    expect(cycleMusicTrack(original, 1)).toBe(original)
  })
})
