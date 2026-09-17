import type { RecordedAmbientProfile } from '../../../src/audio/recorded-ambient-player'

interface BirdsongProfile extends RecordedAmbientProfile {
  durationSeconds: number
  sourceUrl: string
  license: {
    name: string
    url: string
  }
}

export const BIRDSONG_PROFILE: BirdsongProfile = {
  src: '/audio/birds.mp3',
  durationSeconds: 210.0647,
  sourceUrl: 'https://freesound.org/people/rubindaniel/sounds/730710/',
  license: {
    name: 'CC0 1.0 Universal',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  // The CC0 field recording is unusually quiet (about -52 dBFS RMS), but it
  // must remain a distant layer rather than jump in front of the music.
  trimGain: 16,
  highpassFrequency: 280,
  lowpassFrequency: 5_200,
}
