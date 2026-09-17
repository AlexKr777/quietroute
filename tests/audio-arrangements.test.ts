import { describe, expect, it } from 'vitest'

import {
  getMusicArrangement,
  MUSIC_ARRANGEMENTS,
} from '../src/audio/music-arrangements'

describe('music arrangements', () => {
  it('provides eight distinct original procedural tracks', () => {
    expect(MUSIC_ARRANGEMENTS).toHaveLength(8)
    expect(new Set(MUSIC_ARRANGEMENTS.map((track) => track.id)).size).toBe(8)
    expect(new Set(MUSIC_ARRANGEMENTS.map((track) => track.title)).size).toBe(8)
    expect(new Set(MUSIC_ARRANGEMENTS.map((track) => track.chordIntervalSeconds)).size)
      .toBeGreaterThanOrEqual(6)
  })

  it('keeps every scheduled note inside a restrained musical range', () => {
    for (const arrangement of MUSIC_ARRANGEMENTS) {
      expect(arrangement.chords.length).toBeGreaterThanOrEqual(4)
      const notes = [
        ...arrangement.chords.flat(),
        ...arrangement.melody.filter((note): note is number => note !== null),
        ...arrangement.bassline.filter((note): note is number => note !== null),
      ]
      for (const note of notes) {
        expect(note).toBeGreaterThanOrEqual(36)
        expect(note).toBeLessThanOrEqual(79)
      }
    }
  })

  it('gives every track a quiet, recognisable lo-fi groove', () => {
    const grooveSignatures = new Set<string>()

    for (const arrangement of MUSIC_ARRANGEMENTS) {
      expect(arrangement.beatsPerMinute).toBeGreaterThanOrEqual(58)
      expect(arrangement.beatsPerMinute).toBeLessThanOrEqual(74)
      expect(arrangement.swing).toBeGreaterThanOrEqual(0.04)
      expect(arrangement.swing).toBeLessThanOrEqual(0.16)
      expect(arrangement.beatPattern.length).toBeGreaterThanOrEqual(8)
      expect(arrangement.bassline).toHaveLength(arrangement.beatPattern.length)
      expect(arrangement.beatPattern).toContain('kick')
      expect(arrangement.beatPattern).toContain('brush')
      grooveSignatures.add(arrangement.beatPattern.join('|'))
    }

    expect(grooveSignatures.size).toBeGreaterThanOrEqual(6)
  })

  it('keeps every timbre dark, slow, and below a fatigue-prone peak', () => {
    for (const arrangement of MUSIC_ARRANGEMENTS) {
      expect(arrangement.filterFrequency).toBeGreaterThanOrEqual(760)
      expect(arrangement.filterFrequency).toBeLessThanOrEqual(1800)
      expect(arrangement.chordPeak).toBeLessThanOrEqual(0.028)
      expect(arrangement.melodyPeak).toBeLessThanOrEqual(0.012)
      expect(arrangement.echoLevel).toBeLessThanOrEqual(0.14)
      expect(arrangement.attackSeconds).toBeGreaterThanOrEqual(0.45)
      expect(arrangement.releaseSeconds).toBeGreaterThanOrEqual(0.8)
      expect(arrangement.harmonicLevel).toBeLessThanOrEqual(0.18)
    }
  })

  it('wraps arrangement lookup in both directions', () => {
    expect(getMusicArrangement(8)).toBe(MUSIC_ARRANGEMENTS[0])
    expect(getMusicArrangement(-1)).toBe(MUSIC_ARRANGEMENTS[7])
  })
})
