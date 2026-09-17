const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  AUDIO_PREFERENCES_KEY,
  applyAudioPreferences,
  captureAudioPreferences,
  normalizeAudioPreferences,
  readAudioPreferences,
  writeAudioPreferences,
} = require('../src/site-overrides/desktop-audio-preferences.js')

class FakeInput {
  constructor(value) {
    this.value = value
    this.events = []
  }

  dispatchEvent(event) {
    this.events.push(event.type)
    return true
  }
}

class FakeButton {
  constructor(pressed) {
    this.pressed = pressed
    this.clicks = 0
  }

  getAttribute(name) {
    return name === 'aria-pressed' ? String(this.pressed) : null
  }

  click() {
    this.clicks += 1
    this.pressed = !this.pressed
  }
}

function createDocumentFixture() {
  const elements = new Map()
  const channelState = {
    rain: { volume: '44', active: true },
    music: { volume: '38', active: false },
    tram: { volume: '22', active: true },
    wind: { volume: '28', active: false },
    night: { volume: '28', active: false },
    birds: { volume: '18', active: true },
    thunder: { volume: '26', active: false },
  }

  for (const [channel, state] of Object.entries(channelState)) {
    elements.set(`#${channel}-volume`, { value: state.volume })
    elements.set(`#${channel}-toggle`, {
      getAttribute(name) {
        return name === 'aria-pressed' ? String(state.active) : null
      },
    })
  }

  elements.set('#desktop-master-volume', { value: '67' })
  elements.set('#master-mute', {
    getAttribute(name) {
      return name === 'aria-pressed' ? 'true' : null
    },
  })

  return {
    querySelector(selector) {
      return elements.get(selector) ?? null
    },
  }
}

test('normalizes only supported persisted audio settings', () => {
  assert.deepEqual(normalizeAudioPreferences({
    version: 1,
    masterVolume: 72.6,
    masterMuted: true,
    started: true,
    musicTrackIndex: 4,
    channels: {
      rain: { volume: 41.4, muted: false },
      music: { volume: 250, muted: true },
      birds: { volume: '18', muted: false },
      unknown: { volume: 50, muted: false },
    },
  }), {
    version: 1,
    masterVolume: 73,
    masterMuted: true,
    channels: {
      rain: { volume: 41, muted: false },
      music: { volume: 100, muted: true },
      birds: { muted: false },
    },
  })
})

test('captures master and channel controls without launch-track state', () => {
  const preferences = captureAudioPreferences(createDocumentFixture())

  assert.deepEqual(preferences, {
    version: 1,
    masterVolume: 67,
    masterMuted: true,
    channels: {
      rain: { volume: 44, muted: false },
      music: { volume: 38, muted: true },
      tram: { volume: 22, muted: false },
      wind: { volume: 28, muted: true },
      night: { volume: 28, muted: true },
      birds: { volume: 18, muted: false },
      thunder: { volume: 26, muted: true },
    },
  })
  assert.equal(Object.hasOwn(preferences, 'musicTrackIndex'), false)
  assert.equal(Object.hasOwn(preferences, 'started'), false)
})

test('storage reads and writes are versioned and failure-safe', () => {
  const values = new Map()
  const storage = {
    getItem(key) {
      return values.get(key) ?? null
    },
    setItem(key, value) {
      values.set(key, value)
    },
  }
  const preferences = {
    version: 1,
    masterVolume: 55,
    masterMuted: false,
    channels: { rain: { volume: 33, muted: false } },
  }

  assert.equal(writeAudioPreferences(storage, preferences), true)
  assert.equal(values.has(AUDIO_PREFERENCES_KEY), true)
  assert.deepEqual(readAudioPreferences(storage), preferences)

  values.set(AUDIO_PREFERENCES_KEY, '{broken json')
  assert.equal(readAudioPreferences(storage), null)
  assert.equal(readAudioPreferences({ getItem() { throw new Error('blocked') } }), null)
  assert.equal(writeAudioPreferences({ setItem() { throw new Error('blocked') } }, preferences), false)
})

test('restores controls by replaying their existing app events', () => {
  const elements = new Map([
    ['#desktop-master-volume', new FakeInput('100')],
    ['#rain-volume', new FakeInput('44')],
    ['#music-volume', new FakeInput('38')],
    ['#rain-toggle', new FakeButton(true)],
    ['#music-toggle', new FakeButton(false)],
    ['#master-mute', new FakeButton(false)],
  ])
  const documentRef = {
    querySelector(selector) {
      return elements.get(selector) ?? null
    },
  }

  assert.equal(applyAudioPreferences(documentRef, {
    version: 1,
    masterVolume: 61,
    masterMuted: true,
    channels: {
      rain: { volume: 27, muted: true },
      music: { volume: 49, muted: true },
    },
  }, { Event }), true)

  assert.equal(elements.get('#desktop-master-volume').value, '61')
  assert.deepEqual(elements.get('#desktop-master-volume').events, ['input'])
  assert.equal(elements.get('#rain-volume').value, '27')
  assert.deepEqual(elements.get('#rain-volume').events, ['input'])
  assert.equal(elements.get('#music-volume').value, '49')
  assert.deepEqual(elements.get('#music-volume').events, ['input'])
  assert.equal(elements.get('#rain-toggle').pressed, false)
  assert.equal(elements.get('#rain-toggle').clicks, 1)
  assert.equal(elements.get('#music-toggle').pressed, false)
  assert.equal(elements.get('#music-toggle').clicks, 0)
  assert.equal(elements.get('#master-mute').pressed, true)
  assert.equal(elements.get('#master-mute').clicks, 1)
})
