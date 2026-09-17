export const COMFORT_MIX_PROFILE = {
  bufferSampleRate: 12_000,
  bufferDurations: {
    rainBody: 19.3,
    rainAir: 23.1,
    rainRoad: 17.7,
    tram: 15.7,
    wind: 25.1,
    night: 29.3,
  },
  masterLevel: 0.62,
  compressor: {
    threshold: -14,
    knee: 14,
    ratio: 1.6,
    attack: 0.04,
    release: 0.72,
  },
  music: {
    continuousNoiseLevel: 0,
    highpassFrequency: 68,
    kickPeak: 0.019,
    brushPeak: 0.0035,
    bassPeak: 0.014,
  },
  tram: {
    rumbleLevel: 0.16,
    motorLevel: 0.006,
  },
  wind: {
    floorLevel: 0.006,
    gustMinimum: 0.03,
    gustMaximum: 0.048,
  },
  night: {
    washLevel: 0.032,
    callPeak: 0.014,
  },
  thunder: {
    eventMinimum: 0.024,
    eventMaximum: 0.04,
  },
} as const
