import { describe, expect, it } from 'vitest'

import {
  getOptionalAuditionChannels,
  OPTIONAL_AUDIO_CHANNELS,
} from '../src/audio/audition'
import {
  createInitialAudioState,
  setChannelVolume,
  startAudioFromGesture,
  toggleChannelMute,
  toggleMasterMute,
} from '../src/audio/audio-state'

describe('optional ambience audition cues', () => {
  it.each(OPTIONAL_AUDIO_CHANNELS)(
    'requests an immediate, single-channel cue when %s becomes active',
    (channel) => {
      const previous = startAudioFromGesture(createInitialAudioState())
      const next = toggleChannelMute(previous, channel)

      expect(getOptionalAuditionChannels(previous, next)).toEqual([channel])
      expect(getOptionalAuditionChannels(next, next)).toEqual([])
    },
  )

  it('auditions an active channel when its volume rises from zero', () => {
    const started = startAudioFromGesture(createInitialAudioState())
    const activeAtZero = setChannelVolume(
      toggleChannelMute(started, 'wind'),
      'wind',
      0,
    )
    const audible = setChannelVolume(activeAtZero, 'wind', 0.3)

    expect(getOptionalAuditionChannels(activeAtZero, audible)).toEqual(['wind'])
  })

  it('does not stack three cues when the master channel is restored', () => {
    let active = startAudioFromGesture(createInitialAudioState())
    for (const channel of OPTIONAL_AUDIO_CHANNELS) {
      active = toggleChannelMute(active, channel)
    }
    const muted = toggleMasterMute(active)

    expect(getOptionalAuditionChannels(muted, active)).toEqual([])
  })

  it('does not cue muted defaults during the initial audio gesture', () => {
    const initial = createInitialAudioState()

    expect(
      getOptionalAuditionChannels(initial, startAudioFromGesture(initial)),
    ).toEqual([])
  })
})
