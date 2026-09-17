import type { RecordedAmbientProfile } from './recorded-ambient-player'

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
  trimGain: 9,
  highpassFrequency: 220,
  lowpassFrequency: 5_600,
}
