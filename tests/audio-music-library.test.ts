import { describe, expect, it } from 'vitest'

import { MUSIC_ARRANGEMENTS } from '../src/audio/music-arrangements'
import {
  getMusicTrack,
  getMusicTrackCount,
  RECORDED_LOFI_TRACKS,
} from '../src/audio/music-library'

describe('recorded lo-fi library', () => {
  it('provides several real local recordings as the visible music rotation', () => {
    expect(RECORDED_LOFI_TRACKS).toHaveLength(28)
    expect(getMusicTrackCount()).toBe(RECORDED_LOFI_TRACKS.length)
    expect(new Set(RECORDED_LOFI_TRACKS.map((track) => track.id)).size)
      .toBe(RECORDED_LOFI_TRACKS.length)
  })

  it('keeps a verifiable license and safe playback trim on every recording', () => {
    for (const track of RECORDED_LOFI_TRACKS) {
      expect(track.title.length).toBeGreaterThan(0)
      expect(['HoliznaCC0', 'VHS Jazz', '1000 Handz', 'Ketsa']).toContain(
        track.artist,
      )
      expect(track.src).toMatch(/^\/audio\/(?:lofi\/)?[a-z0-9-]+\.mp3$/)
      expect(track.sourceUrl).toMatch(
        /^https:\/\/(?:archive\.org|freemusicarchive\.org)\//,
      )
      expect([
        'CC0 1.0 Universal',
        'Creative Commons Attribution 4.0 International',
      ]).toContain(track.license.name)
      expect([
        'https://creativecommons.org/publicdomain/zero/1.0/',
        'https://creativecommons.org/licenses/by/4.0/',
      ]).toContain(track.license.url)
      expect(track.trimGain).toBeGreaterThanOrEqual(0.06)
      expect(track.trimGain).toBeLessThanOrEqual(0.22)
      expect(track.fallbackArrangementIndex).toBeGreaterThanOrEqual(0)
      expect(track.fallbackArrangementIndex).toBeLessThan(
        MUSIC_ARRANGEMENTS.length,
      )
    }
  })

  it('keeps every recording inside the quiet playback trim envelope', () => {
    expect(Math.max(...RECORDED_LOFI_TRACKS.map((track) => track.trimGain)))
      .toBeLessThanOrEqual(0.22)
    expect(Math.min(...RECORDED_LOFI_TRACKS.map((track) => track.trimGain)))
      .toBeGreaterThanOrEqual(0.06)
    expect(getMusicTrack(12).trimGain).toBeLessThanOrEqual(0.08)
  })

  it('wraps track lookup in both directions', () => {
    expect(getMusicTrack(getMusicTrackCount())).toBe(RECORDED_LOFI_TRACKS[0])
    expect(getMusicTrack(-1)).toBe(
      RECORDED_LOFI_TRACKS[RECORDED_LOFI_TRACKS.length - 1],
    )
  })
})
