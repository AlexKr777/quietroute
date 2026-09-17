(function (root, factory) {
  const preferences = factory()
  if (typeof module === 'object' && module.exports) {
    module.exports = preferences
  }
  if (root && typeof window !== 'undefined') {
    root.QuietRouteDesktopAudioPreferences = preferences
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  const AUDIO_PREFERENCES_KEY = 'quiet-route-desktop:audio-preferences-v1'
  const AUDIO_PREFERENCES_VERSION = 1
  const AUDIO_CHANNELS = [
    'rain',
    'music',
    'tram',
    'wind',
    'night',
    'birds',
    'thunder',
  ]

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }

  function normalizePercentage(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
    return Math.round(Math.min(100, Math.max(0, value)))
  }

  function normalizeAudioPreferences(value) {
    if (!isRecord(value) || value.version !== AUDIO_PREFERENCES_VERSION) {
      return null
    }

    const channels = {}
    const storedChannels = isRecord(value.channels) ? value.channels : {}
    for (const channel of AUDIO_CHANNELS) {
      const storedChannel = storedChannels[channel]
      if (!isRecord(storedChannel)) continue

      const channelPreferences = {}
      const volume = normalizePercentage(storedChannel.volume)
      if (volume !== undefined) channelPreferences.volume = volume
      if (typeof storedChannel.muted === 'boolean') {
        channelPreferences.muted = storedChannel.muted
      }
      if (Object.keys(channelPreferences).length > 0) {
        channels[channel] = channelPreferences
      }
    }

    const normalized = {
      version: AUDIO_PREFERENCES_VERSION,
      channels,
    }
    const masterVolume = normalizePercentage(value.masterVolume)
    if (masterVolume !== undefined) normalized.masterVolume = masterVolume
    if (typeof value.masterMuted === 'boolean') {
      normalized.masterMuted = value.masterMuted
    }
    return normalized
  }

  function readPressed(element) {
    const pressed = element?.getAttribute?.('aria-pressed')
    if (pressed === 'true') return true
    if (pressed === 'false') return false
    const active = element?.dataset?.active
    if (active === 'true') return true
    if (active === 'false') return false
    return undefined
  }

  function captureAudioPreferences(documentRef) {
    const channels = {}
    for (const channel of AUDIO_CHANNELS) {
      const volume = normalizePercentage(
        Number(documentRef?.querySelector?.(`#${channel}-volume`)?.value),
      )
      const active = readPressed(
        documentRef?.querySelector?.(`#${channel}-toggle`),
      )
      const channelPreferences = {}
      if (volume !== undefined) channelPreferences.volume = volume
      if (active !== undefined) channelPreferences.muted = !active
      if (Object.keys(channelPreferences).length > 0) {
        channels[channel] = channelPreferences
      }
    }

    const captured = {
      version: AUDIO_PREFERENCES_VERSION,
      channels,
    }
    const masterVolume = normalizePercentage(
      Number(documentRef?.querySelector?.('#desktop-master-volume')?.value),
    )
    const masterMuted = readPressed(
      documentRef?.querySelector?.('#master-mute'),
    )
    if (masterVolume !== undefined) captured.masterVolume = masterVolume
    if (masterMuted !== undefined) captured.masterMuted = masterMuted
    return captured
  }

  function readAudioPreferences(storage) {
    try {
      const serialized = storage?.getItem?.(AUDIO_PREFERENCES_KEY)
      if (!serialized) return null
      return normalizeAudioPreferences(JSON.parse(serialized))
    } catch {
      return null
    }
  }

  function writeAudioPreferences(storage, preferences) {
    const normalized = normalizeAudioPreferences(preferences)
    if (!normalized) return false
    try {
      storage?.setItem?.(AUDIO_PREFERENCES_KEY, JSON.stringify(normalized))
      return true
    } catch {
      return false
    }
  }

  function dispatchInput(element, rootRef) {
    const EventConstructor = rootRef?.Event ?? Event
    element.dispatchEvent(new EventConstructor('input', { bubbles: true }))
  }

  function applyAudioPreferences(documentRef, preferences, rootRef) {
    const normalized = normalizeAudioPreferences(preferences)
    if (!normalized) return false

    const masterVolume = documentRef?.querySelector?.('#desktop-master-volume')
    if (masterVolume && normalized.masterVolume !== undefined) {
      masterVolume.value = String(normalized.masterVolume)
      dispatchInput(masterVolume, rootRef)
    }

    for (const channel of AUDIO_CHANNELS) {
      const storedChannel = normalized.channels[channel]
      if (!storedChannel) continue

      const volume = documentRef?.querySelector?.(`#${channel}-volume`)
      if (volume && storedChannel.volume !== undefined) {
        volume.value = String(storedChannel.volume)
        dispatchInput(volume, rootRef)
      }

      const toggle = documentRef?.querySelector?.(`#${channel}-toggle`)
      const active = readPressed(toggle)
      if (
        toggle &&
        typeof storedChannel.muted === 'boolean' &&
        active !== undefined &&
        storedChannel.muted === active
      ) {
        toggle.click()
      }
    }

    const masterMute = documentRef?.querySelector?.('#master-mute')
    const currentlyMasterMuted = readPressed(masterMute)
    if (
      masterMute &&
      typeof normalized.masterMuted === 'boolean' &&
      currentlyMasterMuted !== undefined &&
      normalized.masterMuted !== currentlyMasterMuted
    ) {
      masterMute.click()
    }
    return true
  }

  function initDesktopAudioPreferences(options = {}) {
    const rootRef = options.root ?? window
    const documentRef = options.document ?? rootRef.document
    const storage = options.storage ?? rootRef.localStorage
    const restored = readAudioPreferences(storage)
    if (restored) applyAudioPreferences(documentRef, restored, rootRef)

    const disposers = []
    let persistTimer = null

    function persist() {
      if (persistTimer !== null) {
        rootRef.clearTimeout(persistTimer)
        persistTimer = null
      }
      return writeAudioPreferences(
        storage,
        captureAudioPreferences(documentRef),
      )
    }

    function schedulePersist(delay = 0) {
      if (persistTimer !== null) rootRef.clearTimeout(persistTimer)
      persistTimer = rootRef.setTimeout(persist, delay)
    }

    const volumeInputs = [
      '#desktop-master-volume',
      ...AUDIO_CHANNELS.map((channel) => `#${channel}-volume`),
    ]
    for (const selector of volumeInputs) {
      const input = documentRef.querySelector(selector)
      if (!input) continue
      const listener = () => schedulePersist()
      input.addEventListener('input', listener)
      disposers.push(() => input.removeEventListener('input', listener))
    }

    const toggleButtons = [
      '#master-mute',
      ...AUDIO_CHANNELS.map((channel) => `#${channel}-toggle`),
    ]
    for (const selector of toggleButtons) {
      const button = documentRef.querySelector(selector)
      if (!button) continue
      const listener = () => schedulePersist(selector === '#music-toggle' ? 340 : 0)
      button.addEventListener('click', listener)
      disposers.push(() => button.removeEventListener('click', listener))
    }

    const pageHideListener = () => persist()
    rootRef.addEventListener('pagehide', pageHideListener)
    disposers.push(() => rootRef.removeEventListener('pagehide', pageHideListener))

    return {
      persist,
      restored,
      dispose() {
        if (persistTimer !== null) rootRef.clearTimeout(persistTimer)
        persistTimer = null
        for (const dispose of disposers) dispose()
      },
    }
  }

  return {
    AUDIO_CHANNELS: AUDIO_CHANNELS.slice(),
    AUDIO_PREFERENCES_KEY,
    applyAudioPreferences,
    captureAudioPreferences,
    initDesktopAudioPreferences,
    normalizeAudioPreferences,
    readAudioPreferences,
    writeAudioPreferences,
  }
})
