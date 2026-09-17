import { describe, expect, it } from 'vitest'

import {
  AUDIO_SILENCE_FLOOR,
  catchUpMusicSchedule,
  scheduleVoiceEnvelope,
} from '../src/audio/scheduling'

describe('catchUpMusicSchedule', () => {
  it('keeps a future chord schedule unchanged', () => {
    expect(catchUpMusicSchedule({ nextTime: 12, chordIndex: 3 }, 10, 8, 4)).toEqual({
      nextTime: 12,
      chordIndex: 3,
    })
  })

  it('skips missed chords instead of creating a burst after a throttled tab', () => {
    expect(catchUpMusicSchedule({ nextTime: 1, chordIndex: 0 }, 101, 8, 4)).toEqual({
      nextTime: 101,
      chordIndex: 1,
    })
  })
})

describe('scheduleVoiceEnvelope', () => {
  it('silences a future voice before scheduling any gain automation', () => {
    const events: Array<[string, number, number?]> = []
    let currentValue = 1
    const parameter = {
      get value() {
        return currentValue
      },
      set value(value: number) {
        currentValue = value
        events.push(['initial', value])
      },
      setValueAtTime(value: number, time: number) {
        events.push(['set', value, time])
      },
      exponentialRampToValueAtTime(value: number, time: number) {
        events.push(['ramp', value, time])
      },
    }

    scheduleVoiceEnvelope(parameter, 10, 5, 0.018)

    expect(parameter.value).toBe(AUDIO_SILENCE_FLOOR)
    expect(events[0]).toEqual(['initial', AUDIO_SILENCE_FLOOR])
    expect(events).toEqual([
      ['initial', AUDIO_SILENCE_FLOOR],
      ['set', AUDIO_SILENCE_FLOOR, 10],
      ['ramp', 0.018, 10.52],
      ['ramp', 0.018 * 0.48, 14.28],
      ['ramp', AUDIO_SILENCE_FLOOR, 15],
    ])
  })

  it('uses the track-specific slow attack and release without clipping the envelope', () => {
    const events: Array<[string, number, number?]> = []
    const parameter = {
      value: 1,
      setValueAtTime(value: number, time: number) {
        events.push(['set', value, time])
      },
      exponentialRampToValueAtTime(value: number, time: number) {
        events.push(['ramp', value, time])
      },
    }

    scheduleVoiceEnvelope(parameter, 10, 5, 0.02, {
      attackSeconds: 1.2,
      releaseSeconds: 1.8,
    })

    expect(events).toEqual([
      ['set', AUDIO_SILENCE_FLOOR, 10],
      ['ramp', 0.02, 11.2],
      ['ramp', 0.02 * 0.48, 13.2],
      ['ramp', AUDIO_SILENCE_FLOOR, 15],
    ])
  })
})
