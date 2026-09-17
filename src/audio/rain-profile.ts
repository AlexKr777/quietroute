export const GENTLE_RAIN_PROFILE = {
  bodyLevel: 0.11,
  airLevel: 0.006,
  roadLevel: 0.05,
  impactLevel: {
    minimum: 0.0025,
    maximum: 0.008,
  },
  impactFrequency: {
    minimum: 720,
    maximum: 1840,
  },
  resonanceFrequency: {
    minimum: 820,
    maximum: 1440,
  },
} as const
