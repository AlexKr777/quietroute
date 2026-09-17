const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const {
  DESKTOP_WEATHER_PROFILE,
  getWeatherChannelGain,
  getThunderDelay,
} = require('../src/site-overrides/desktop-weather-profile.js')

test('recorded rain stays gentle, dark, and long enough to avoid an obvious loop', () => {
  const rain = DESKTOP_WEATHER_PROFILE.rain

  assert.equal(rain.source, '/audio/gentle-outdoor-rain.mp3')
  assert.ok(rain.minimumDurationSeconds >= 540)
  assert.ok(rain.crossfadeSeconds >= 8)
  assert.ok(rain.crossfadeSeconds <= 16)
  assert.ok(rain.highpassFrequency >= 45)
  assert.ok(rain.lowpassFrequency <= 4_200)
  assert.ok(rain.outputTrim >= 0.1)
  assert.ok(rain.outputTrim <= 0.18)
  assert.ok(rain.fadeSeconds >= 0.5)
})

test('bundled rain is the documented CC0 high-quality preview', () => {
  const assetPath = path.resolve(__dirname, '..', 'assets', 'audio', 'gentle-outdoor-rain.mp3')
  const licensePath = path.resolve(__dirname, '..', 'assets', 'AUDIO_LICENSES.md')
  const audio = fs.readFileSync(assetPath)
  const licenses = fs.readFileSync(licensePath, 'utf8')

  assert.equal(audio.byteLength, 9_326_024)
  assert.equal(
    crypto.createHash('sha256').update(audio).digest('hex'),
    'c3d8de631694b4304a5c2c70e834cba6ea9e8da68899dddf47ad8c6ee687b26c',
  )
  assert.match(licenses, /JonCon_Library/)
  assert.match(licenses, /freesound\.org\/people\/JonCon_Library\/sounds\/668061/)
  assert.match(licenses, /CC0 1\.0 Universal/)
})

test('distant thunder stays soft but remains audible on ordinary speakers', () => {
  const thunder = DESKTOP_WEATHER_PROFILE.thunder

  assert.ok(thunder.bufferDurationSeconds >= 8)
  assert.ok(thunder.attackSeconds >= 1.1)
  assert.ok(thunder.secondSwellSeconds > thunder.attackSeconds + 1.4)
  assert.ok(thunder.releaseSeconds >= 3)
  assert.ok(thunder.highpassFrequency >= 28)
  assert.ok(thunder.highpassFrequency <= 48)
  assert.ok(thunder.lowpassFrequency >= 320)
  assert.ok(thunder.lowpassFrequency <= 560)
  assert.ok(thunder.eventMinimum >= 0.18)
  assert.ok(thunder.eventMaximum <= 0.28)
  assert.ok(thunder.eventMinimum < thunder.eventMaximum)
  assert.ok(thunder.panMaximum <= 0.18)
  assert.ok(thunder.auditionDelaySeconds <= 0.5)
  assert.ok(thunder.minimumDelayMs >= 40_000)
  assert.ok(thunder.maximumDelayMs >= 90_000)
})

test('desktop wind is a dark slow bed rather than bright pink-noise hiss', () => {
  const wind = DESKTOP_WEATHER_PROFILE.wind

  assert.ok(wind)
  assert.equal(wind.noiseColor, 'brown')
  assert.ok(wind.bufferDurationSeconds >= 30)
  assert.ok(wind.highpassFrequency >= 30)
  assert.ok(wind.highpassFrequency <= 60)
  assert.ok(wind.lowpassFrequency >= 240)
  assert.ok(wind.lowpassFrequency <= 420)
  assert.ok(wind.floorLevel > 0)
  assert.ok(wind.gustMaximum <= 0.18)
  assert.ok(wind.gustAttackSeconds >= 3.5)
  assert.ok(wind.gustReleaseSeconds >= 5)
})

test('weather channel gain is squared, bounded, and honors mute state', () => {
  assert.equal(getWeatherChannelGain({ started: false, masterMuted: false, volume: 1, muted: false }), 0)
  assert.equal(getWeatherChannelGain({ started: true, masterMuted: true, volume: 1, muted: false }), 0)
  assert.equal(getWeatherChannelGain({ started: true, masterMuted: false, volume: 1, muted: true }), 0)
  assert.equal(getWeatherChannelGain({ started: true, masterMuted: false, volume: 0.5, muted: false }), 0.25)
  assert.equal(getWeatherChannelGain({ started: true, masterMuted: false, volume: 2, muted: false }), 1)
  assert.equal(getWeatherChannelGain({ started: true, masterMuted: false, volume: Number.NaN, muted: false }), 0)
})

test('thunder scheduler spans the full quiet interval deterministically', () => {
  const thunder = DESKTOP_WEATHER_PROFILE.thunder

  assert.equal(getThunderDelay(0), thunder.minimumDelayMs)
  assert.equal(getThunderDelay(1), thunder.maximumDelayMs)
  assert.equal(
    getThunderDelay(0.5),
    Math.round((thunder.minimumDelayMs + thunder.maximumDelayMs) / 2),
  )
})
