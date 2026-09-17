const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  createCoreAmbienceState,
  createMasterScaledState,
} = require('../src/site-overrides/desktop-channel-routing.ts')

function createState() {
  return {
    started: true,
    masterMuted: false,
    musicTrackIndex: 2,
    channels: {
      rain: { volume: 0.44, muted: false },
      music: { volume: 0.38, muted: false },
      tram: { volume: 0.22, muted: false },
      wind: { volume: 0.28, muted: false },
      night: { volume: 0.28, muted: false },
      birds: { volume: 0.18, muted: false },
      thunder: { volume: 0.26, muted: false },
    },
  }
}

test('desktop owns rain, wind, and thunder while core keeps music, tram, and night', () => {
  const original = createState()
  const routed = createCoreAmbienceState(original)

  assert.equal(routed.channels.rain.muted, true)
  assert.equal(routed.channels.wind.muted, true)
  assert.equal(routed.channels.thunder.muted, true)
  assert.deepEqual(routed.channels.music, original.channels.music)
  assert.deepEqual(routed.channels.tram, original.channels.tram)
  assert.deepEqual(routed.channels.night, original.channels.night)
})

test('desktop birds use a softened curve that keeps the default channel behind music', () => {
  const original = createState()
  const routed = createCoreAmbienceState(original)
  const effectiveGain = routed.channels.birds.volume ** 2

  assert.equal(routed.channels.birds.muted, false)
  assert.ok(routed.channels.birds.volume > original.channels.birds.volume)
  assert.ok(effectiveGain > 0.07)
  assert.ok(effectiveGain < 0.1)
})

test('desktop master scales every channel copy without moving the original sliders', () => {
  const original = createState()
  const scaled = createMasterScaledState(original, 0.5)

  for (const channel of Object.keys(original.channels)) {
    assert.equal(
      scaled.channels[channel].volume,
      original.channels[channel].volume * 0.5,
    )
    assert.equal(scaled.channels[channel].muted, original.channels[channel].muted)
  }
  assert.deepEqual(original, createState())
  assert.equal(createMasterScaledState(original, 2).channels.music.volume, 0.38)
  assert.equal(createMasterScaledState(original, Number.NaN).channels.music.volume, 0)
})
