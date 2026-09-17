(function initDesktopWeatherProfile(root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  if (root) root.QuietRouteDesktopWeather = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDesktopWeatherProfile() {
  const DESKTOP_WEATHER_PROFILE = Object.freeze({
    rain: Object.freeze({
      source: '/audio/gentle-outdoor-rain.mp3',
      minimumDurationSeconds: 540,
      crossfadeSeconds: 12,
      highpassFrequency: 60,
      lowpassFrequency: 3_300,
      outputTrim: 0.14,
      fadeSeconds: 0.95,
      pollIntervalMs: 250,
    }),
    wind: Object.freeze({
      noiseColor: 'brown',
      bufferDurationSeconds: 41.7,
      highpassFrequency: 42,
      lowpassFrequency: 340,
      floorLevel: 0.105,
      gustMinimum: 0.135,
      gustMaximum: 0.175,
      gustAttackSeconds: 4.6,
      gustReleaseSeconds: 7.8,
      auditionDelayMs: 550,
      minimumDelayMs: 32_000,
      maximumDelayMs: 68_000,
      fadeSeconds: 1.4,
    }),
    thunder: Object.freeze({
      bufferDurationSeconds: 10.8,
      attackSeconds: 1.2,
      secondSwellSeconds: 3.8,
      releaseSeconds: 5,
      highpassFrequency: 34,
      lowpassFrequency: 420,
      eventMinimum: 0.19,
      eventMaximum: 0.25,
      panMaximum: 0.12,
      auditionDelaySeconds: 0.35,
      minimumDelayMs: 45_000,
      maximumDelayMs: 105_000,
    }),
  })

  function clamp01(value) {
    if (!Number.isFinite(value)) return 0
    return Math.min(1, Math.max(0, value))
  }

  function getWeatherChannelGain(state) {
    if (!state.started || state.masterMuted || state.muted) return 0
    const volume = clamp01(state.volume)
    return volume * volume
  }

  function getThunderDelay(randomValue) {
    const random = clamp01(randomValue)
    const profile = DESKTOP_WEATHER_PROFILE.thunder
    return Math.round(
      profile.minimumDelayMs +
      random * (profile.maximumDelayMs - profile.minimumDelayMs),
    )
  }

  function getWindDelay(randomValue) {
    const random = clamp01(randomValue)
    const profile = DESKTOP_WEATHER_PROFILE.wind
    return Math.round(
      profile.minimumDelayMs +
      random * (profile.maximumDelayMs - profile.minimumDelayMs),
    )
  }

  return {
    DESKTOP_WEATHER_PROFILE,
    getThunderDelay,
    getWindDelay,
    getWeatherChannelGain,
  }
})
