import type { AudioState } from '../../../src/audio/audio-state'
import './desktop-weather-profile.js'

interface WeatherProfile {
  rain: {
    source: string
    minimumDurationSeconds: number
    crossfadeSeconds: number
    highpassFrequency: number
    lowpassFrequency: number
    outputTrim: number
    fadeSeconds: number
    pollIntervalMs: number
  }
  wind: {
    noiseColor: 'brown'
    bufferDurationSeconds: number
    highpassFrequency: number
    lowpassFrequency: number
    floorLevel: number
    gustMinimum: number
    gustMaximum: number
    gustAttackSeconds: number
    gustReleaseSeconds: number
    auditionDelayMs: number
    minimumDelayMs: number
    maximumDelayMs: number
    fadeSeconds: number
  }
  thunder: {
    bufferDurationSeconds: number
    attackSeconds: number
    secondSwellSeconds: number
    releaseSeconds: number
    highpassFrequency: number
    lowpassFrequency: number
    eventMinimum: number
    eventMaximum: number
    panMaximum: number
    auditionDelaySeconds: number
    minimumDelayMs: number
    maximumDelayMs: number
  }
}

interface WeatherProfileApi {
  DESKTOP_WEATHER_PROFILE: WeatherProfile
  getThunderDelay: (randomValue: number) => number
  getWindDelay: (randomValue: number) => number
  getWeatherChannelGain: (state: {
    started: boolean
    masterMuted: boolean
    volume: number
    muted: boolean
  }) => number
}

declare global {
  interface Window {
    QuietRouteDesktopWeather?: WeatherProfileApi
  }
}

interface RainDeck {
  media: HTMLAudioElement
  source: MediaElementAudioSourceNode
  level: GainNode
}

const SILENCE = 0.0001
function requireWeatherApi(): WeatherProfileApi {
  const api = window.QuietRouteDesktopWeather
  if (!api) throw new Error('Desktop weather profile failed to initialize')
  return api
}

const WEATHER_API = requireWeatherApi()
const WEATHER_PROFILE = WEATHER_API.DESKTOP_WEATHER_PROFILE

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

function getPlaybackErrorName(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof error.name === 'string'
  ) {
    return error.name
  }
  return 'PlaybackError'
}

function isWeatherChannelActive(
  state: AudioState,
  channel: 'rain' | 'wind' | 'thunder',
): boolean {
  return WEATHER_API.getWeatherChannelGain({
    started: state.started,
    masterMuted: state.masterMuted,
    volume: state.channels[channel].volume,
    muted: state.channels[channel].muted,
  }) > 0
}

function createWindBuffer(context: AudioContext): AudioBuffer {
  const profile = WEATHER_PROFILE.wind
  const frameCount = Math.ceil(
    context.sampleRate * profile.bufferDurationSeconds,
  )
  const buffer = context.createBuffer(2, frameCount, context.sampleRate)
  const edgeFrames = Math.min(Math.round(context.sampleRate * 0.7), frameCount)

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const random = createSeededRandom(3_061 + channel * 5_009)
    const data = buffer.getChannelData(channel)
    let brown = 0
    let distant = 0

    for (let index = 0; index < frameCount; index += 1) {
      const white = random() * 2 - 1
      brown = (brown + white * 0.026) / 1.026
      distant = distant * 0.9986 + brown * 0.0014
      data[index] = Math.max(-1, Math.min(1, brown * 3.4 + distant * 2.2))
    }

    for (let index = 0; index < edgeFrames; index += 1) {
      const edgeGain = Math.sin(
        (index / Math.max(1, edgeFrames - 1)) * Math.PI * 0.5,
      )
      const trailingIndex = frameCount - 1 - index
      data[index] = (data[index] ?? 0) * edgeGain
      data[trailingIndex] = (data[trailingIndex] ?? 0) * edgeGain
    }
  }

  return buffer
}

function createThunderBuffer(context: AudioContext): AudioBuffer {
  const profile = WEATHER_PROFILE.thunder
  const frameCount = Math.ceil(
    context.sampleRate * profile.bufferDurationSeconds,
  )
  const buffer = context.createBuffer(2, frameCount, context.sampleRate)

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const random = createSeededRandom(8_119 + channel * 4_013)
    const data = buffer.getChannelData(channel)
    let brown = 0
    let distant = 0

    for (let index = 0; index < frameCount; index += 1) {
      const white = random() * 2 - 1
      brown = (brown + white * 0.018) / 1.018
      distant = distant * 0.9975 + brown * 0.0025
      data[index] = Math.max(-1, Math.min(1, brown * 3.2 + distant * 4.6))
    }

    const edgeFrames = Math.min(Math.round(context.sampleRate * 0.08), frameCount)
    for (let index = 0; index < edgeFrames; index += 1) {
      const edgeGain = index / Math.max(1, edgeFrames - 1)
      const trailingIndex = frameCount - 1 - index
      data[index] = (data[index] ?? 0) * edgeGain
      data[trailingIndex] = (data[trailingIndex] ?? 0) * edgeGain
    }
  }

  return buffer
}

function createRainDeck(context: AudioContext, output: AudioNode): RainDeck {
  const media = new Audio()
  media.loop = false
  media.preload = 'metadata'
  media.hidden = true
  media.dataset.desktopRainAudio = 'true'
  media.setAttribute('aria-hidden', 'true')
  document.body.append(media)
  const source = context.createMediaElementSource(media)
  const level = context.createGain()
  level.gain.value = 0
  source.connect(level).connect(output)
  return { media, source, level }
}

export class DesktopWeatherPlayer {
  private context: AudioContext | null = null
  private rainDecks: readonly [RainDeck, RainDeck] | null = null
  private rainGain: GainNode | null = null
  private windGain: GainNode | null = null
  private windBedLevel: GainNode | null = null
  private windSource: AudioBufferSourceNode | null = null
  private thunderGain: GainNode | null = null
  private thunderBuffer: AudioBuffer | null = null
  private activeRainDeck: 0 | 1 = 0
  private rainCrossfadeStarted = false
  private rainCrossfadePending = false
  private rainPollTimer: number | null = null
  private windTimer: number | null = null
  private thunderTimer: number | null = null
  private lastState: AudioState | null = null
  private started = false
  private disposed = false
  private random = createSeededRandom(54_421)

  async start(state: AudioState): Promise<void> {
    if (this.disposed) return
    this.lastState = state
    this.ensureGraph()
    const context = this.context
    if (!context) throw new Error('Desktop weather audio graph is unavailable')

    this.started = true
    this.applyGainState(state)
    const resumeContext = context.state === 'suspended'
      ? context.resume()
      : Promise.resolve()
    const rainPlayback = isWeatherChannelActive(state, 'rain')
      ? this.ensureRainPlayback().catch((error: unknown) => {
        this.handleRainPlaybackFailure(error, false)
        throw error
      })
      : Promise.resolve()

    if (isWeatherChannelActive(state, 'thunder') && this.thunderTimer === null) {
      this.scheduleThunder(WEATHER_PROFILE.thunder.auditionDelaySeconds * 1000)
    }
    if (isWeatherChannelActive(state, 'wind') && this.windTimer === null) {
      document.body.dataset.desktopWindState = 'playing'
      this.scheduleWindGust(WEATHER_PROFILE.wind.auditionDelayMs)
    }

    await Promise.all([resumeContext, rainPlayback])
  }

  applyState(state: AudioState): void {
    const thunderWasActive = this.lastState
      ? isWeatherChannelActive(this.lastState, 'thunder')
      : false
    const windWasActive = this.lastState
      ? isWeatherChannelActive(this.lastState, 'wind')
      : false
    const thunderIsActive = isWeatherChannelActive(state, 'thunder')
    const windIsActive = isWeatherChannelActive(state, 'wind')
    this.lastState = state

    if (!this.context || !this.started) return
    this.applyGainState(state)
    this.resumeContextForActiveWeather(state)

    if (isWeatherChannelActive(state, 'rain')) {
      void this.ensureRainPlayback().catch((error: unknown) => {
        this.handleRainPlaybackFailure(error, false)
      })
    }

    if (windIsActive && !windWasActive) {
      document.body.dataset.desktopWindState = 'playing'
      this.scheduleWindGust(WEATHER_PROFILE.wind.auditionDelayMs)
    } else if (!windIsActive) {
      this.clearWindTimer()
      document.body.dataset.desktopWindState = 'idle'
    } else if (this.windTimer === null) {
      this.scheduleWindGust(WEATHER_API.getWindDelay(this.random()))
    }

    if (thunderIsActive && !thunderWasActive) {
      this.scheduleThunder(WEATHER_PROFILE.thunder.auditionDelaySeconds * 1000)
    } else if (!thunderIsActive) {
      this.clearThunderTimer()
    } else if (this.thunderTimer === null) {
      this.scheduleThunder(WEATHER_API.getThunderDelay(this.random()))
    }
  }

  async suspend(): Promise<void> {
    this.pauseRainDecks()
    if (this.context?.state === 'running') await this.context.suspend()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.started = false
    this.clearWindTimer()
    this.clearThunderTimer()
    if (this.rainPollTimer !== null) {
      window.clearInterval(this.rainPollTimer)
      this.rainPollTimer = null
    }

    for (const deck of this.rainDecks ?? []) {
      deck.media.pause()
      deck.media.removeAttribute('src')
      deck.media.load()
      deck.media.remove()
      deck.source.disconnect()
      deck.level.disconnect()
    }

    this.rainGain?.disconnect()
    try {
      this.windSource?.stop()
    } catch {
      // The source may already have stopped with its AudioContext.
    }
    this.windSource?.disconnect()
    this.windBedLevel?.disconnect()
    this.windGain?.disconnect()
    this.thunderGain?.disconnect()
    const context = this.context
    this.context = null
    this.rainDecks = null
    this.rainGain = null
    this.windGain = null
    this.windBedLevel = null
    this.windSource = null
    this.thunderGain = null
    this.thunderBuffer = null
    if (context && context.state !== 'closed') void context.close()
  }

  private ensureGraph(): void {
    if (this.context) return

    const context = new AudioContext({ latencyHint: 'playback' })
    const weatherOutput = context.createDynamicsCompressor()
    weatherOutput.threshold.value = -18
    weatherOutput.knee.value = 12
    weatherOutput.ratio.value = 2
    weatherOutput.attack.value = 0.08
    weatherOutput.release.value = 0.8
    weatherOutput.connect(context.destination)

    const rainHighpass = context.createBiquadFilter()
    rainHighpass.type = 'highpass'
    rainHighpass.frequency.value = WEATHER_PROFILE.rain.highpassFrequency
    rainHighpass.Q.value = 0.3
    const rainLowpass = context.createBiquadFilter()
    rainLowpass.type = 'lowpass'
    rainLowpass.frequency.value = WEATHER_PROFILE.rain.lowpassFrequency
    rainLowpass.Q.value = 0.28
    this.rainGain = context.createGain()
    this.rainGain.gain.value = 0
    rainHighpass
      .connect(rainLowpass)
      .connect(this.rainGain)
      .connect(weatherOutput)

    const windHighpass = context.createBiquadFilter()
    windHighpass.type = 'highpass'
    windHighpass.frequency.value = WEATHER_PROFILE.wind.highpassFrequency
    windHighpass.Q.value = 0.28
    const windLowpass = context.createBiquadFilter()
    windLowpass.type = 'lowpass'
    windLowpass.frequency.value = WEATHER_PROFILE.wind.lowpassFrequency
    windLowpass.Q.value = 0.34
    this.windBedLevel = context.createGain()
    this.windBedLevel.gain.value = WEATHER_PROFILE.wind.floorLevel
    this.windGain = context.createGain()
    this.windGain.gain.value = 0
    this.windGain.connect(weatherOutput)
    this.windSource = context.createBufferSource()
    this.windSource.buffer = createWindBuffer(context)
    this.windSource.loop = true
    this.windSource.playbackRate.value = 0.73
    this.windSource
      .connect(windHighpass)
      .connect(windLowpass)
      .connect(this.windBedLevel)
      .connect(this.windGain)
    this.windSource.start()

    this.thunderGain = context.createGain()
    this.thunderGain.gain.value = 0
    this.thunderGain.connect(weatherOutput)
    this.thunderBuffer = createThunderBuffer(context)
    this.rainDecks = [
      createRainDeck(context, rainHighpass),
      createRainDeck(context, rainHighpass),
    ]
    this.context = context
  }

  private applyGainState(state: AudioState): void {
    const context = this.context
    if (!context || !this.rainGain || !this.windGain || !this.thunderGain) return

    const rainLevel = WEATHER_API.getWeatherChannelGain({
      started: state.started,
      masterMuted: state.masterMuted,
      volume: state.channels.rain.volume,
      muted: state.channels.rain.muted,
    }) * WEATHER_PROFILE.rain.outputTrim
    const thunderLevel = WEATHER_API.getWeatherChannelGain({
      started: state.started,
      masterMuted: state.masterMuted,
      volume: state.channels.thunder.volume,
      muted: state.channels.thunder.muted,
    })
    const windLevel = WEATHER_API.getWeatherChannelGain({
      started: state.started,
      masterMuted: state.masterMuted,
      volume: state.channels.wind.volume,
      muted: state.channels.wind.muted,
    })

    this.rampGain(
      this.rainGain,
      rainLevel,
      WEATHER_PROFILE.rain.fadeSeconds,
    )
    this.rampGain(this.windGain, windLevel, WEATHER_PROFILE.wind.fadeSeconds)
    this.rampGain(this.thunderGain, thunderLevel, 0.7)
  }

  private rampGain(gain: GainNode, value: number, durationSeconds: number): void {
    const context = this.context
    if (!context) return
    const now = context.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(value, now + durationSeconds)
  }

  private resumeContextForActiveWeather(state: AudioState): void {
    const context = this.context
    if (!context || context.state !== 'suspended') return
    const hasActiveWeather = (['rain', 'wind', 'thunder'] as const)
      .some((channel) => isWeatherChannelActive(state, channel))
    if (!hasActiveWeather) return
    void context.resume().catch(() => undefined)
  }

  private async ensureRainPlayback(): Promise<void> {
    const decks = this.rainDecks
    if (!decks) throw new Error('Recorded rain decks are unavailable')

    const activeDeck = decks[this.activeRainDeck]
    if (!activeDeck.media.src) {
      activeDeck.media.src = WEATHER_PROFILE.rain.source
      activeDeck.media.preload = 'auto'
      activeDeck.media.load()
      activeDeck.level.gain.value = 1
    }

    if (activeDeck.media.paused) await activeDeck.media.play()
    activeDeck.media.loop = false
    if (
      Number.isFinite(activeDeck.media.duration) &&
      activeDeck.media.duration < WEATHER_PROFILE.rain.minimumDurationSeconds
    ) {
      throw new Error('Recorded rain is too short for a calm continuous bed')
    }

    if (this.rainCrossfadeStarted) {
      const nextIndex: 0 | 1 = this.activeRainDeck === 0 ? 1 : 0
      const nextDeck = decks[nextIndex]
      if (nextDeck.media.paused) await nextDeck.media.play()
    }
    document.body.dataset.desktopRainAudioState = this.rainCrossfadeStarted
      ? 'crossfading'
      : 'playing'
    delete document.body.dataset.desktopRainAudioError
    this.startRainPolling()
  }

  private startRainPolling(): void {
    if (this.rainPollTimer !== null) return
    this.rainPollTimer = window.setInterval(
      () => this.updateRainCrossfade(),
      WEATHER_PROFILE.rain.pollIntervalMs,
    )
  }

  private updateRainCrossfade(): void {
    const decks = this.rainDecks
    if (!decks || !this.started || this.disposed) return

    const current = decks[this.activeRainDeck]
    const duration = current.media.duration
    if (!Number.isFinite(duration) || duration <= 0) return

    const crossfade = WEATHER_PROFILE.rain.crossfadeSeconds
    const remaining = duration - current.media.currentTime
    if (
      !this.rainCrossfadeStarted &&
      !this.rainCrossfadePending &&
      remaining <= crossfade
    ) {
      const nextIndex: 0 | 1 = this.activeRainDeck === 0 ? 1 : 0
      const next = decks[nextIndex]
      this.rainCrossfadePending = true
      next.media.src = WEATHER_PROFILE.rain.source
      next.media.preload = 'auto'
      next.level.gain.value = 0
      void next.media.play().then(() => {
        if (!this.disposed) {
          this.rainCrossfadePending = false
          this.rainCrossfadeStarted = true
          document.body.dataset.desktopRainAudioState = 'crossfading'
        }
      }).catch((error: unknown) => {
        this.rainCrossfadePending = false
        next.media.pause()
        next.media.removeAttribute('src')
        next.media.load()
        current.media.loop = true
        if (current.media.paused) {
          current.media.currentTime = 0
          void current.media.play().catch(() => undefined)
        }
        this.handleRainPlaybackFailure(error, true)
      })
    }

    if (!this.rainCrossfadeStarted) return
    const nextIndex: 0 | 1 = this.activeRainDeck === 0 ? 1 : 0
    const next = decks[nextIndex]
    const progress = Math.min(1, Math.max(0, 1 - remaining / crossfade))
    current.level.gain.value = Math.cos(progress * Math.PI * 0.5)
    next.level.gain.value = Math.sin(progress * Math.PI * 0.5)

    if (progress < 0.995 && !current.media.ended) return
    current.media.pause()
    current.media.removeAttribute('src')
    current.media.load()
    current.level.gain.value = 0
    next.level.gain.value = 1
    this.activeRainDeck = nextIndex
    this.rainCrossfadeStarted = false
    this.rainCrossfadePending = false
    document.body.dataset.desktopRainAudioState = 'playing'
    delete document.body.dataset.desktopRainAudioError
  }

  private handleRainPlaybackFailure(error: unknown, preservedByLoop: boolean): void {
    document.body.dataset.desktopRainAudioState = preservedByLoop
      ? 'fallback-loop'
      : 'error'
    document.body.dataset.desktopRainAudioError = getPlaybackErrorName(error)

    const status = document.querySelector<HTMLElement>('#audio-status')
    const retry = document.querySelector<HTMLButtonElement>('#audio-retry')
    if (status) {
      status.textContent = preservedByLoop
        ? 'дождь продолжается в запасном режиме'
        : 'запись дождя не удалось включить'
    }
    if (retry) retry.hidden = false
  }

  private pauseRainDecks(): void {
    for (const deck of this.rainDecks ?? []) deck.media.pause()
  }

  private scheduleWindGust(delayMilliseconds: number): void {
    this.clearWindTimer()
    this.windTimer = window.setTimeout(() => {
      this.windTimer = null
      const state = this.lastState
      if (!state || !isWeatherChannelActive(state, 'wind')) return
      this.playWindGust()
      this.scheduleWindGust(WEATHER_API.getWindDelay(this.random()))
    }, Math.max(0, delayMilliseconds))
  }

  private clearWindTimer(): void {
    if (this.windTimer !== null) {
      window.clearTimeout(this.windTimer)
      this.windTimer = null
    }

    const context = this.context
    const level = this.windBedLevel
    if (!context || !level) return
    const now = context.currentTime
    level.gain.cancelScheduledValues(now)
    level.gain.setValueAtTime(level.gain.value, now)
    level.gain.linearRampToValueAtTime(
      WEATHER_PROFILE.wind.floorLevel,
      now + 1.2,
    )
  }

  private playWindGust(): void {
    const context = this.context
    const level = this.windBedLevel
    if (!context || context.state !== 'running' || !level) return

    const profile = WEATHER_PROFILE.wind
    const startAt = context.currentTime + 0.03
    const peak = profile.gustMinimum +
      this.random() * (profile.gustMaximum - profile.gustMinimum)
    level.gain.cancelScheduledValues(startAt)
    level.gain.setValueAtTime(level.gain.value, startAt)
    level.gain.linearRampToValueAtTime(
      peak,
      startAt + profile.gustAttackSeconds,
    )
    level.gain.linearRampToValueAtTime(
      profile.floorLevel,
      startAt + profile.gustAttackSeconds + profile.gustReleaseSeconds,
    )
  }

  private scheduleThunder(delayMilliseconds: number): void {
    this.clearThunderTimer()
    document.body.dataset.desktopThunderState = 'scheduled'
    this.thunderTimer = window.setTimeout(() => {
      this.thunderTimer = null
      const state = this.lastState
      if (!state || !isWeatherChannelActive(state, 'thunder')) return
      this.scheduleThunder(WEATHER_API.getThunderDelay(this.random()))
      this.playThunder()
    }, Math.max(0, delayMilliseconds))
  }

  private clearThunderTimer(): void {
    if (this.thunderTimer === null) return
    window.clearTimeout(this.thunderTimer)
    this.thunderTimer = null
    document.body.dataset.desktopThunderState = 'idle'
  }

  private playThunder(): void {
    const context = this.context
    const output = this.thunderGain
    const buffer = this.thunderBuffer
    if (!context || !output || !buffer) return
    if (context.state === 'suspended') {
      void context.resume().then(() => {
        const state = this.lastState
        if (state && isWeatherChannelActive(state, 'thunder')) {
          this.playThunder()
        }
      }).catch(() => undefined)
      return
    }
    if (context.state !== 'running') return

    const profile = WEATHER_PROFILE.thunder
    document.body.dataset.desktopThunderState = 'playing'
    const startAt = context.currentTime + 0.02
    const source = context.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = 0.86 + this.random() * 0.1

    const highpass = context.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = profile.highpassFrequency
    highpass.Q.value = 0.32
    const lowpass = context.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = profile.lowpassFrequency
    lowpass.Q.value = 0.38
    const distanceFilter = context.createBiquadFilter()
    distanceFilter.type = 'lowpass'
    distanceFilter.frequency.value = profile.lowpassFrequency * 0.82
    distanceFilter.Q.value = 0.25

    const peak = profile.eventMinimum +
      this.random() * (profile.eventMaximum - profile.eventMinimum)
    const level = context.createGain()
    level.gain.setValueAtTime(SILENCE, startAt)
    level.gain.linearRampToValueAtTime(peak, startAt + profile.attackSeconds)
    level.gain.linearRampToValueAtTime(
      peak * 0.48,
      startAt + profile.attackSeconds + 1,
    )
    level.gain.linearRampToValueAtTime(
      peak * 0.72,
      startAt + profile.secondSwellSeconds,
    )
    level.gain.exponentialRampToValueAtTime(
      SILENCE,
      startAt + profile.secondSwellSeconds + profile.releaseSeconds,
    )

    const pan = context.createStereoPanner()
    pan.pan.value = (this.random() * 2 - 1) * profile.panMaximum
    source
      .connect(highpass)
      .connect(lowpass)
      .connect(distanceFilter)
      .connect(level)
      .connect(pan)
      .connect(output)
    source.addEventListener('ended', () => {
      source.disconnect()
      highpass.disconnect()
      lowpass.disconnect()
      distanceFilter.disconnect()
      level.disconnect()
      pan.disconnect()
      const thunderActive = this.lastState
        ? isWeatherChannelActive(this.lastState, 'thunder')
        : false
      document.body.dataset.desktopThunderState = thunderActive && this.thunderTimer !== null
        ? 'scheduled'
        : 'idle'
    }, { once: true })
    source.start(startAt)
    source.stop(startAt + profile.bufferDurationSeconds)
  }
}
