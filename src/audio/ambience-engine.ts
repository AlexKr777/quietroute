import type { AudioState } from './audio-state'
import { resolveEffectiveGain } from './audio-state'
import {
  getNightEventDelay,
  getRainEventDelay,
  getThunderEventDelay,
  getTramEventDelay,
  getWindEventDelay,
  selectRainEvent,
  type RainEventKind,
} from './event-scheduling'
import { COMFORT_MIX_PROFILE } from './comfort-profile'
import { getOptionalAuditionChannels } from './audition'
import { MusicEventRegistry } from './music-event-registry'
import {
  getMusicArrangement,
  MUSIC_ARRANGEMENTS,
  type BeatStep,
  type MusicArrangement,
} from './music-arrangements'
import { getMusicTrack, getMusicTrackCount } from './music-library'
import { RecordedMusicPlayer } from './recorded-music-player'
import { RecordedAmbientPlayer } from './recorded-ambient-player'
import { BIRDSONG_PROFILE } from './birdsong-profile'
import { GENTLE_RAIN_PROFILE } from './rain-profile'
import { catchUpMusicSchedule, scheduleVoiceEnvelope } from './scheduling'
import { closeLoopEndpoint } from './signal'

interface ActiveVoice {
  oscillator: OscillatorNode
  level: GainNode
}

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

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

function createNoiseBuffer(
  context: AudioContext,
  durationSeconds: number,
  seed: number,
  color: 'rain' | 'pink' | 'brown',
): AudioBuffer {
  const sampleRate = Math.min(
    context.sampleRate,
    COMFORT_MIX_PROFILE.bufferSampleRate,
  )
  const frameCount = Math.ceil(sampleRate * durationSeconds)
  const buffer = context.createBuffer(2, frameCount, sampleRate)
  const random = createSeededRandom(seed)

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel)
    let slow = 0
    let brown = 0
    let pink0 = 0
    let pink1 = 0
    let pink2 = 0
    let pink3 = 0
    let pink4 = 0
    let pink5 = 0
    let pink6 = 0

    for (let index = 0; index < frameCount; index += 1) {
      const white = random() * 2 - 1
      slow = slow * 0.988 + white * 0.012
      brown = (brown + white * 0.016) / 1.016

      if (color === 'brown') {
        data[index] = Math.max(-1, Math.min(1, brown * 3))
      } else if (color === 'pink') {
        pink0 = 0.99886 * pink0 + white * 0.0555179
        pink1 = 0.99332 * pink1 + white * 0.0750759
        pink2 = 0.969 * pink2 + white * 0.153852
        pink3 = 0.8665 * pink3 + white * 0.3104856
        pink4 = 0.55 * pink4 + white * 0.5329522
        pink5 = -0.7616 * pink5 - white * 0.016898
        const pink = (
          pink0 + pink1 + pink2 + pink3 + pink4 + pink5 + pink6 + white * 0.5362
        ) * 0.11
        pink6 = white * 0.115926
        data[index] = Math.max(-1, Math.min(1, pink))
      } else {
        data[index] = white * 0.08 + slow * 1.8
      }
    }

    data.set(closeLoopEndpoint(data))
  }

  return buffer
}

function createImpactBuffer(
  context: AudioContext,
  seed: number,
  durationSeconds: number,
  decay: number,
): AudioBuffer {
  const frameCount = Math.ceil(context.sampleRate * durationSeconds)
  const buffer = context.createBuffer(1, frameCount, context.sampleRate)
  const data = buffer.getChannelData(0)
  const random = createSeededRandom(seed)

  for (let index = 0; index < frameCount; index += 1) {
    const time = index / context.sampleRate
    data[index] = (random() * 2 - 1) * Math.exp(-time * decay)
  }

  return buffer
}

function smoothGain(gain: GainNode, value: number, now: number): void {
  gain.gain.cancelScheduledValues(now)
  gain.gain.setTargetAtTime(value, now, 0.14)
}

const PROCEDURAL_MUSIC_LEVEL = 0.86
const SILENCE = 0.0001

export class AmbienceEngine {
  private context: AudioContext | null = null
  private masterGain: GainNode | null = null
  private rainGain: GainNode | null = null
  private musicGain: GainNode | null = null
  private tramGain: GainNode | null = null
  private windGain: GainNode | null = null
  private nightGain: GainNode | null = null
  private birdsGain: GainNode | null = null
  private thunderGain: GainNode | null = null
  private windBedLevel: GainNode | null = null
  private musicBus: GainNode | null = null
  private recordedMusicPlayer: RecordedMusicPlayer | null = null
  private birdsPlayer: RecordedAmbientPlayer | null = null
  private musicHighpass: BiquadFilterNode | null = null
  private musicFilter: BiquadFilterNode | null = null
  private musicDelay: DelayNode | null = null
  private musicEchoLevel: GainNode | null = null
  private musicBrushBuffer: AudioBuffer | null = null
  private glassImpactBuffer: AudioBuffer | null = null
  private railImpactBuffer: AudioBuffer | null = null
  private thunderBuffer: AudioBuffer | null = null
  private random = createSeededRandom(94_231)
  private intervalIds = new Set<number>()
  private timeoutIds = new Set<number>()
  private activeVoices = new Set<ActiveVoice>()
  private activeBeatEvents = new MusicEventRegistry()
  private nextChordTime = 0
  private chordIndex = 0
  private nextBeatTime = 0
  private beatIndex = 0
  private musicTrackIndex = 0
  private fallbackMusicArrangementIndex = 0
  private proceduralMusicEnabled = false
  private musicSelectionGeneration = 0
  private lastAppliedState: AudioState | null = null

  constructor(
    private onMusicTrackAdvance?: () => void,
    private onBirdsongUnavailable?: () => void,
  ) {}

  get status(): 'idle' | AudioContextState {
    return this.context?.state ?? 'idle'
  }

  async start(state: AudioState): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'playback' })
      this.buildGraph(this.context, state.musicTrackIndex)
    }

    const recordedPlayback = this.selectRecordedMusic(state.musicTrackIndex)

    if (this.context.state === 'suspended') {
      await this.context.resume()
    }

    this.applyState(state)
    await recordedPlayback
  }

  applyState(state: AudioState): void {
    if (
      !this.context ||
      !this.rainGain ||
      !this.musicGain ||
      !this.tramGain ||
      !this.windGain ||
      !this.nightGain ||
      !this.birdsGain ||
      !this.thunderGain
    ) {
      return
    }

    const auditionChannels = getOptionalAuditionChannels(
      this.lastAppliedState,
      state,
    )

    if (state.musicTrackIndex !== this.musicTrackIndex) {
      void this.selectRecordedMusic(state.musicTrackIndex)
    }

    const now = this.context.currentTime
    smoothGain(this.rainGain, resolveEffectiveGain(state, 'rain'), now)
    smoothGain(this.musicGain, resolveEffectiveGain(state, 'music'), now)
    smoothGain(this.tramGain, resolveEffectiveGain(state, 'tram'), now)
    smoothGain(this.windGain, resolveEffectiveGain(state, 'wind'), now)
    smoothGain(this.nightGain, resolveEffectiveGain(state, 'night'), now)
    const birdsGain = resolveEffectiveGain(state, 'birds')
    smoothGain(this.birdsGain, birdsGain, now)
    smoothGain(this.thunderGain, resolveEffectiveGain(state, 'thunder'), now)
    void this.birdsPlayer?.setActive(birdsGain > 0)

    this.lastAppliedState = state
    for (const channel of auditionChannels) {
      if (channel === 'wind') this.scheduleWindGust(true)
      else if (channel === 'night') this.scheduleNightCall(0.12)
      else this.scheduleThunder(0.2)
    }
  }

  async suspend(): Promise<void> {
    this.recordedMusicPlayer?.pause()
    this.birdsPlayer?.pause()
    if (this.context?.state === 'running') {
      await this.context.suspend()
    }
  }

  dispose(): void {
    this.musicSelectionGeneration += 1
    for (const timerId of this.intervalIds) window.clearInterval(timerId)
    for (const timerId of this.timeoutIds) window.clearTimeout(timerId)
    this.intervalIds.clear()
    this.timeoutIds.clear()
    this.activeVoices.clear()
    this.activeBeatEvents.clear()

    const context = this.context
    this.context = null
    this.masterGain = null
    this.rainGain = null
    this.musicGain = null
    this.tramGain = null
    this.windGain = null
    this.nightGain = null
    this.birdsGain = null
    this.thunderGain = null
    this.windBedLevel = null
    this.musicBus = null
    this.musicHighpass = null
    this.musicFilter = null
    this.musicDelay = null
    this.musicEchoLevel = null
    this.musicBrushBuffer = null
    this.glassImpactBuffer = null
    this.railImpactBuffer = null
    this.thunderBuffer = null
    this.lastAppliedState = null
    this.recordedMusicPlayer?.dispose()
    this.recordedMusicPlayer = null
    this.birdsPlayer?.dispose()
    this.birdsPlayer = null

    if (context && context.state !== 'closed') void context.close()
  }

  private buildGraph(context: AudioContext, musicTrackIndex: number): void {
    const compressor = context.createDynamicsCompressor()
    compressor.threshold.value = COMFORT_MIX_PROFILE.compressor.threshold
    compressor.knee.value = COMFORT_MIX_PROFILE.compressor.knee
    compressor.ratio.value = COMFORT_MIX_PROFILE.compressor.ratio
    compressor.attack.value = COMFORT_MIX_PROFILE.compressor.attack
    compressor.release.value = COMFORT_MIX_PROFILE.compressor.release

    this.masterGain = context.createGain()
    this.masterGain.gain.value = COMFORT_MIX_PROFILE.masterLevel
    this.masterGain.connect(compressor)
    compressor.connect(context.destination)

    this.rainGain = this.createChannelGain(context)
    this.tramGain = this.createChannelGain(context)
    this.musicGain = this.createChannelGain(context)
    this.windGain = this.createChannelGain(context)
    this.nightGain = this.createChannelGain(context)
    this.birdsGain = this.createChannelGain(context)
    this.thunderGain = this.createChannelGain(context)

    this.buildRain(context)
    this.buildTram(context)
    this.buildWind(context)
    this.buildNight(context)
    this.buildBirds(context)
    this.buildMusic(context, musicTrackIndex)
    this.glassImpactBuffer = createImpactBuffer(context, 721, 0.12, 38)
    this.railImpactBuffer = createImpactBuffer(context, 811, 0.22, 18)
    this.thunderBuffer = createImpactBuffer(context, 3901, 5.4, 0.72)
    this.startSchedulers(context)
  }

  private createChannelGain(context: AudioContext): GainNode {
    if (!this.masterGain) throw new Error('Master gain is unavailable')
    const gain = context.createGain()
    gain.gain.value = 0
    gain.connect(this.masterGain)
    return gain
  }

  private buildRain(context: AudioContext): void {
    if (!this.rainGain) return

    const body = context.createBufferSource()
    body.buffer = createNoiseBuffer(
      context,
      COMFORT_MIX_PROFILE.bufferDurations.rainBody,
      2347,
      'rain',
    )
    body.loop = true
    body.playbackRate.value = 0.985
    const bodyHighpass = context.createBiquadFilter()
    bodyHighpass.type = 'highpass'
    bodyHighpass.frequency.value = 85
    const bodyLowpass = context.createBiquadFilter()
    bodyLowpass.type = 'lowpass'
    bodyLowpass.frequency.value = 1320
    bodyLowpass.Q.value = 0.24
    const bodyLevel = context.createGain()
    bodyLevel.gain.value = GENTLE_RAIN_PROFILE.bodyLevel
    body
      .connect(bodyHighpass)
      .connect(bodyLowpass)
      .connect(bodyLevel)
      .connect(this.rainGain)
    body.start()

    const air = context.createBufferSource()
    air.buffer = createNoiseBuffer(
      context,
      COMFORT_MIX_PROFILE.bufferDurations.rainAir,
      7499,
      'pink',
    )
    air.loop = true
    air.playbackRate.value = 0.79
    const airHighpass = context.createBiquadFilter()
    airHighpass.type = 'highpass'
    airHighpass.frequency.value = 1050
    const airLowpass = context.createBiquadFilter()
    airLowpass.type = 'lowpass'
    airLowpass.frequency.value = 2800
    const airLevel = context.createGain()
    airLevel.gain.value = GENTLE_RAIN_PROFILE.airLevel
    air
      .connect(airHighpass)
      .connect(airLowpass)
      .connect(airLevel)
      .connect(this.rainGain)
    air.start()

    const road = context.createBufferSource()
    road.buffer = createNoiseBuffer(
      context,
      COMFORT_MIX_PROFILE.bufferDurations.rainRoad,
      917,
      'brown',
    )
    road.loop = true
    road.playbackRate.value = 0.83
    const roadHighpass = context.createBiquadFilter()
    roadHighpass.type = 'highpass'
    roadHighpass.frequency.value = 35
    const roadFilter = context.createBiquadFilter()
    roadFilter.type = 'lowpass'
    roadFilter.frequency.value = 320
    const roadLevel = context.createGain()
    roadLevel.gain.value = GENTLE_RAIN_PROFILE.roadLevel
    road
      .connect(roadHighpass)
      .connect(roadFilter)
      .connect(roadLevel)
      .connect(this.rainGain)
    road.start()
  }

  private buildTram(context: AudioContext): void {
    if (!this.tramGain) return

    const rumble = context.createBufferSource()
    rumble.buffer = createNoiseBuffer(
      context,
      COMFORT_MIX_PROFILE.bufferDurations.tram,
      811,
      'brown',
    )
    rumble.loop = true
    rumble.playbackRate.value = 0.77
    const highpass = context.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = 42
    const lowpass = context.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = 150
    lowpass.Q.value = 0.45
    const level = context.createGain()
    level.gain.value = COMFORT_MIX_PROFILE.tram.rumbleLevel
    rumble
      .connect(highpass)
      .connect(lowpass)
      .connect(level)
      .connect(this.tramGain)
    rumble.start()

    const motor = context.createOscillator()
    motor.type = 'sine'
    motor.frequency.value = 58
    const motorLevel = context.createGain()
    motorLevel.gain.value = COMFORT_MIX_PROFILE.tram.motorLevel
    motor.connect(motorLevel).connect(this.tramGain)
    motor.start()
  }

  private buildWind(context: AudioContext): void {
    if (!this.windGain) return

    const wind = context.createBufferSource()
    wind.buffer = createNoiseBuffer(
      context,
      COMFORT_MIX_PROFILE.bufferDurations.wind,
      3061,
      'pink',
    )
    wind.loop = true
    wind.playbackRate.value = 0.61
    const highpass = context.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = 72
    const lowpass = context.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = 720
    const filter = context.createBiquadFilter()
    filter.type = 'peaking'
    filter.frequency.value = 260
    filter.Q.value = 0.38
    filter.gain.value = 2
    const level = context.createGain()
    level.gain.value = COMFORT_MIX_PROFILE.wind.floorLevel
    this.windBedLevel = level
    wind
      .connect(highpass)
      .connect(lowpass)
      .connect(filter)
      .connect(level)
      .connect(this.windGain)
    wind.start()
  }

  private buildNight(context: AudioContext): void {
    if (!this.nightGain) return

    const wash = context.createBufferSource()
    wash.buffer = createNoiseBuffer(
      context,
      COMFORT_MIX_PROFILE.bufferDurations.night,
      6007,
      'brown',
    )
    wash.loop = true
    wash.playbackRate.value = 0.67
    const highpass = context.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = 46
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 220
    filter.Q.value = 0.32
    const level = context.createGain()
    level.gain.value = COMFORT_MIX_PROFILE.night.washLevel
    wash
      .connect(highpass)
      .connect(filter)
      .connect(level)
      .connect(this.nightGain)
    wash.start()
  }

  private buildBirds(context: AudioContext): void {
    if (!this.birdsGain) return

    this.birdsPlayer = new RecordedAmbientPlayer(
      context,
      this.birdsGain,
      BIRDSONG_PROFILE,
      this.onBirdsongUnavailable,
    )
  }

  private buildMusic(context: AudioContext, trackIndex: number): void {
    if (!this.musicGain) return

    this.musicBus = context.createGain()
    this.musicBus.gain.value = SILENCE
    this.musicHighpass = context.createBiquadFilter()
    this.musicHighpass.type = 'highpass'
    this.musicHighpass.frequency.value = COMFORT_MIX_PROFILE.music.highpassFrequency
    this.musicHighpass.Q.value = 0.45
    this.musicFilter = context.createBiquadFilter()
    this.musicFilter.type = 'lowpass'
    this.musicFilter.Q.value = 0.55
    this.musicBus
      .connect(this.musicHighpass)
      .connect(this.musicFilter)
      .connect(this.musicGain)

    this.musicDelay = context.createDelay(1)
    this.musicEchoLevel = context.createGain()
    const feedback = context.createGain()
    feedback.gain.value = 0.11
    this.musicFilter.connect(this.musicDelay)
    this.musicDelay.connect(this.musicEchoLevel).connect(this.musicGain)
    this.musicDelay.connect(feedback).connect(this.musicDelay)

    this.recordedMusicPlayer = new RecordedMusicPlayer(
      context,
      this.musicGain,
      undefined,
      (trackId) => this.handleRecordedTrackEnding(trackId),
    )

    this.musicBrushBuffer = createImpactBuffer(context, 1499, 0.22, 28)

    const track = getMusicTrack(trackIndex)
    const fallbackArrangement = getMusicArrangement(
      track.fallbackArrangementIndex,
    )
    this.musicTrackIndex = this.normalizeMusicTrackIndex(trackIndex)
    this.fallbackMusicArrangementIndex = MUSIC_ARRANGEMENTS.indexOf(
      fallbackArrangement,
    )
    this.proceduralMusicEnabled = false
    this.applyMusicTone(fallbackArrangement, context.currentTime)
    this.nextChordTime = context.currentTime + 0.12
    this.nextBeatTime = context.currentTime + 0.18
  }

  private startSchedulers(context: AudioContext): void {
    this.intervalIds.add(window.setInterval(() => this.scheduleMusic(context), 120))
    this.scheduleNextRainEvent()
    this.scheduleNextTramEvent()
    this.scheduleNextWindEvent()
    this.scheduleNextNightEvent()
    this.scheduleNextThunderEvent(true)
    this.scheduleMusic(context)
  }

  private setManagedTimeout(callback: () => void, delayMs: number): void {
    const timerId = window.setTimeout(() => {
      this.timeoutIds.delete(timerId)
      callback()
    }, delayMs)
    this.timeoutIds.add(timerId)
  }

  private scheduleNextRainEvent(): void {
    this.setManagedTimeout(() => {
      this.scheduleRainEvent(selectRainEvent(this.random()))
      this.scheduleNextRainEvent()
    }, getRainEventDelay(this.random()))
  }

  private scheduleNextTramEvent(): void {
    this.setManagedTimeout(() => {
      this.scheduleRailClack()
      this.scheduleNextTramEvent()
    }, getTramEventDelay(this.random()))
  }

  private scheduleNextWindEvent(): void {
    this.setManagedTimeout(() => {
      this.scheduleWindGust()
      this.scheduleNextWindEvent()
    }, getWindEventDelay(this.random()))
  }

  private scheduleRainEvent(kind: RainEventKind): void {
    const context = this.context
    if (
      !context ||
      context.state !== 'running' ||
      !this.rainGain ||
      !this.glassImpactBuffer
    ) {
      return
    }

    const offsets = kind === 'tap'
      ? [0]
      : kind === 'drip'
        ? [0, 0.16]
        : [0, 0.2, 0.44]
    const pan = this.random() * 1.2 - 0.6

    offsets.forEach((offset, index) => {
      this.scheduleGlassDrop(
        context,
        context.currentTime + 0.015 + offset,
        pan,
        kind === 'runoff' ? 0.5 - index * 0.08 : index === 0 ? 1 : 0.55,
      )
    })
  }

  private scheduleGlassDrop(
    context: AudioContext,
    startAt: number,
    panValue: number,
    strength: number,
  ): void {
    if (!this.rainGain || !this.glassImpactBuffer) return

    const source = context.createBufferSource()
    source.buffer = this.glassImpactBuffer
    source.playbackRate.value = 0.62 + this.random() * 0.58
    const filter = context.createBiquadFilter()
    filter.type = 'bandpass'
    const impactFrequency = GENTLE_RAIN_PROFILE.impactFrequency
    filter.frequency.value = impactFrequency.minimum + (
      this.random() * (impactFrequency.maximum - impactFrequency.minimum)
    )
    filter.Q.value = 0.72
    const level = context.createGain()
    const profile = GENTLE_RAIN_PROFILE.impactLevel
    level.gain.value = (
      profile.minimum + this.random() * (profile.maximum - profile.minimum)
    ) * strength
    const pan = context.createStereoPanner()
    pan.pan.value = panValue
    source.connect(filter).connect(level).connect(pan).connect(this.rainGain)
    source.start(startAt)

    const resonance = context.createOscillator()
    resonance.type = 'sine'
    const resonanceFrequency = GENTLE_RAIN_PROFILE.resonanceFrequency
    resonance.frequency.value = resonanceFrequency.minimum + (
      this.random() * (resonanceFrequency.maximum - resonanceFrequency.minimum)
    )
    const resonanceLevel = context.createGain()
    resonanceLevel.gain.setValueAtTime(0.0001, startAt)
    resonanceLevel.gain.exponentialRampToValueAtTime(0.00055 * strength, startAt + 0.008)
    resonanceLevel.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.11)
    resonance.connect(resonanceLevel).connect(pan).connect(this.rainGain)
    resonance.start(startAt)
    resonance.stop(startAt + 0.13)
  }

  private scheduleWindGust(audition = false): void {
    const context = this.context
    const level = this.windBedLevel
    if (!context || context.state !== 'running' || !level) return

    const now = context.currentTime + (audition ? 0.08 : 0.02)
    const attack = audition
      ? 0.38 + this.random() * 0.18
      : 1.4 + this.random() * 1.1
    const duration = audition
      ? 3.1 + this.random() * 1.2
      : 4.8 + this.random() * 2.8
    const profile = COMFORT_MIX_PROFILE.wind
    const peak = profile.gustMinimum + (
      this.random() * (profile.gustMaximum - profile.gustMinimum)
    )
    level.gain.cancelAndHoldAtTime(now)
    level.gain.linearRampToValueAtTime(peak, now + attack)
    level.gain.linearRampToValueAtTime(profile.floorLevel, now + duration)
  }

  private scheduleRailClack(): void {
    const context = this.context
    if (
      !context ||
      context.state !== 'running' ||
      !this.tramGain ||
      !this.railImpactBuffer
    ) {
      return
    }

    for (const offset of [0, 0.13]) {
      const source = context.createBufferSource()
      source.buffer = this.railImpactBuffer
      source.playbackRate.value = 0.24 + this.random() * 0.1
      const filter = context.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 340
      const level = context.createGain()
      level.gain.value = offset === 0 ? 0.022 : 0.013
      source.connect(filter).connect(level).connect(this.tramGain)
      source.start(context.currentTime + 0.02 + offset)
    }
  }

  private scheduleNextNightEvent(): void {
    this.setManagedTimeout(() => {
      this.scheduleNightCall()
      this.scheduleNextNightEvent()
    }, getNightEventDelay(this.random()))
  }

  private scheduleNextThunderEvent(initial = false): void {
    const delay = initial
      ? 10000 + Math.round(this.random() * 8000)
      : getThunderEventDelay(this.random())
    this.setManagedTimeout(() => {
      this.scheduleThunder()
      this.scheduleNextThunderEvent()
    }, delay)
  }

  private scheduleThunder(delaySeconds = 0.02): void {
    const context = this.context
    if (
      !context ||
      context.state !== 'running' ||
      !this.thunderGain ||
      !this.thunderBuffer
    ) {
      return
    }

    const source = context.createBufferSource()
    source.buffer = this.thunderBuffer
    source.playbackRate.value = 0.72 + this.random() * 0.18
    const highpass = context.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = 28
    const lowpass = context.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = 138
    const level = context.createGain()
    const profile = COMFORT_MIX_PROFILE.thunder
    level.gain.value = profile.eventMinimum + (
      this.random() * (profile.eventMaximum - profile.eventMinimum)
    )
    const pan = context.createStereoPanner()
    pan.pan.value = this.random() * 0.5 - 0.25
    source
      .connect(highpass)
      .connect(lowpass)
      .connect(level)
      .connect(pan)
      .connect(this.thunderGain)
    source.start(context.currentTime + delaySeconds)
  }

  private scheduleNightCall(delaySeconds = 0.02): void {
    const context = this.context
    if (!context || context.state !== 'running' || !this.nightGain) return

    const startAt = context.currentTime + delaySeconds
    const baseFrequency = 215 + this.random() * 70
    const pan = context.createStereoPanner()
    pan.pan.value = this.random() * 1.4 - 0.7
    pan.connect(this.nightGain)

    for (const [index, offset] of [0, 0.24].entries()) {
      const oscillator = context.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.value = baseFrequency * (index === 0 ? 1 : 0.82)
      const level = context.createGain()
      const noteStart = startAt + offset
      level.gain.setValueAtTime(0.0001, noteStart)
      level.gain.exponentialRampToValueAtTime(
        COMFORT_MIX_PROFILE.night.callPeak,
        noteStart + 0.1,
      )
      level.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.7)
      oscillator.connect(level).connect(pan)
      oscillator.start(noteStart)
      oscillator.stop(noteStart + 0.74)
    }
  }

  private normalizeMusicTrackIndex(trackIndex: number): number {
    const count = getMusicTrackCount()
    return count === 0
      ? 0
      : ((Math.trunc(trackIndex) % count) + count) % count
  }

  private handleRecordedTrackEnding(trackId: string): void {
    if (getMusicTrack(this.musicTrackIndex).id !== trackId) return

    if (this.onMusicTrackAdvance) {
      this.onMusicTrackAdvance()
      return
    }

    void this.selectRecordedMusic(this.musicTrackIndex + 1)
  }

  private async selectRecordedMusic(trackIndex: number): Promise<void> {
    const context = this.context
    const player = this.recordedMusicPlayer
    const musicBus = this.musicBus
    if (!context || !player || !musicBus) return

    const normalizedIndex = this.normalizeMusicTrackIndex(trackIndex)
    const track = getMusicTrack(normalizedIndex)
    if (normalizedIndex !== this.musicTrackIndex) {
      this.musicTrackIndex = normalizedIndex
      this.prepareProceduralFallback(track.fallbackArrangementIndex, context.currentTime)
    }

    const generation = ++this.musicSelectionGeneration
    const selected = await player.select(track)
    if (
      generation !== this.musicSelectionGeneration ||
      context !== this.context
    ) {
      return
    }

    const now = context.currentTime
    musicBus.gain.cancelAndHoldAtTime(now)
    if (selected) {
      this.proceduralMusicEnabled = false
      musicBus.gain.setTargetAtTime(SILENCE, now, 0.16)
      this.retireProceduralMusic(now)
      return
    }

    this.proceduralMusicEnabled = true
    musicBus.gain.setTargetAtTime(PROCEDURAL_MUSIC_LEVEL, now, 0.24)
    this.scheduleMusic(context)
  }

  private prepareProceduralFallback(
    arrangementIndex: number,
    now: number,
  ): void {
    const arrangement = getMusicArrangement(arrangementIndex)
    this.fallbackMusicArrangementIndex = MUSIC_ARRANGEMENTS.indexOf(arrangement)
    this.retireProceduralMusic(now)
    this.chordIndex = 0
    this.beatIndex = 0
    this.nextChordTime = now + 0.22
    this.nextBeatTime = now + 0.24
    this.applyMusicTone(arrangement, now)
  }

  private retireProceduralMusic(now: number): void {
    for (const voice of this.activeVoices) {
      voice.level.gain.cancelAndHoldAtTime(now)
      voice.level.gain.setTargetAtTime(SILENCE, now, 0.14)
      try {
        voice.oscillator.stop(now + 0.6)
      } catch {
        // The oscillator may already have reached its scheduled stop time.
      }
    }
    this.activeBeatEvents.retireAll(now)
  }

  private applyMusicTone(arrangement: MusicArrangement, now: number): void {
    this.musicFilter?.frequency.setTargetAtTime(arrangement.filterFrequency, now, 0.3)
    this.musicDelay?.delayTime.setTargetAtTime(arrangement.delaySeconds, now, 0.3)
    this.musicEchoLevel?.gain.setTargetAtTime(arrangement.echoLevel, now, 0.3)
  }

  private scheduleMusic(context: AudioContext): void {
    if (!this.proceduralMusicEnabled) return
    if (!this.musicBus || context.state === 'closed') return

    const arrangement = getMusicArrangement(this.fallbackMusicArrangementIndex)
    const resumedSchedule = catchUpMusicSchedule(
      { nextTime: this.nextChordTime, chordIndex: this.chordIndex },
      context.currentTime,
      arrangement.chords.length,
      arrangement.chordIntervalSeconds,
    )
    this.nextChordTime = resumedSchedule.nextTime
    this.chordIndex = resumedSchedule.chordIndex

    const scheduleUntil = context.currentTime + 0.8
    while (this.nextChordTime < scheduleUntil) {
      this.scheduleChord(context, arrangement, this.nextChordTime, this.chordIndex)
      this.nextChordTime += arrangement.chordIntervalSeconds
      this.chordIndex = (this.chordIndex + 1) % arrangement.chords.length
    }

    this.scheduleBeatPattern(context, arrangement, scheduleUntil)
  }

  private scheduleBeatPattern(
    context: AudioContext,
    arrangement: MusicArrangement,
    scheduleUntil: number,
  ): void {
    const patternLength = arrangement.beatPattern.length
    if (patternLength === 0) return

    const stepDuration = 30 / arrangement.beatsPerMinute
    if (this.nextBeatTime < context.currentTime - stepDuration) {
      const skippedSteps = Math.ceil(
        (context.currentTime - this.nextBeatTime) / stepDuration,
      )
      this.nextBeatTime += skippedSteps * stepDuration
      this.beatIndex = (this.beatIndex + skippedSteps) % patternLength
    }

    while (this.nextBeatTime < scheduleUntil) {
      const patternIndex = this.beatIndex % patternLength
      const swingOffset = patternIndex % 2 === 1
        ? stepDuration * arrangement.swing
        : 0
      this.scheduleBeat(
        context,
        arrangement.beatPattern[patternIndex],
        arrangement.bassline[patternIndex],
        this.nextBeatTime + swingOffset,
        stepDuration,
      )
      this.nextBeatTime += stepDuration
      this.beatIndex = (this.beatIndex + 1) % patternLength
    }
  }

  private scheduleBeat(
    context: AudioContext,
    step: BeatStep | undefined,
    bassMidi: number | null | undefined,
    startAt: number,
    stepDuration: number,
  ): void {
    if (step === 'kick' || step === 'ghost') {
      this.scheduleSoftKick(context, startAt, step === 'ghost' ? 0.52 : 1)
    } else if (step === 'brush') {
      this.scheduleSoftBrush(context, startAt)
    }

    if (bassMidi !== null && bassMidi !== undefined) {
      this.scheduleVoice(
        context,
        bassMidi,
        startAt + 0.018,
        Math.min(0.74, stepDuration * 1.45),
        COMFORT_MIX_PROFILE.music.bassPeak,
        'sine',
        0.035,
        Math.min(0.52, stepDuration),
      )
    }
  }

  private scheduleSoftKick(
    context: AudioContext,
    startAt: number,
    intensity: number,
  ): void {
    if (!this.musicFilter) return

    const oscillator = context.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(62, startAt)
    oscillator.frequency.exponentialRampToValueAtTime(48, startAt + 0.17)
    const level = context.createGain()
    level.gain.value = 0.0001
    level.gain.setValueAtTime(0.0001, startAt)
    level.gain.exponentialRampToValueAtTime(
      COMFORT_MIX_PROFILE.music.kickPeak * intensity,
      startAt + 0.012,
    )
    level.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.32)
    oscillator.connect(level).connect(this.musicFilter)
    this.activeBeatEvents.track(oscillator, level)
    oscillator.start(startAt)
    oscillator.stop(startAt + 0.34)
  }

  private scheduleSoftBrush(context: AudioContext, startAt: number): void {
    if (!this.musicBus || !this.musicBrushBuffer) return

    const source = context.createBufferSource()
    source.buffer = this.musicBrushBuffer
    source.playbackRate.value = 0.86 + this.random() * 0.16
    const bandpass = context.createBiquadFilter()
    bandpass.type = 'bandpass'
    bandpass.frequency.value = 720 + this.random() * 260
    bandpass.Q.value = 0.52
    const lowpass = context.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = 1380
    const level = context.createGain()
    level.gain.value = COMFORT_MIX_PROFILE.music.brushPeak
    const pan = context.createStereoPanner()
    pan.pan.value = this.random() * 0.26 - 0.13
    source
      .connect(bandpass)
      .connect(lowpass)
      .connect(level)
      .connect(pan)
      .connect(this.musicBus)
    this.activeBeatEvents.track(source, level)
    source.start(startAt)
  }

  private scheduleChord(
    context: AudioContext,
    arrangement: MusicArrangement,
    startAt: number,
    chordIndex: number,
  ): void {
    const chord = arrangement.chords[chordIndex % arrangement.chords.length]
    const melody = arrangement.melody[chordIndex % arrangement.melody.length]
    if (!chord) return

    for (const [noteIndex, midi] of chord.entries()) {
      const noteStart = startAt + noteIndex * 0.014 + this.random() * 0.018
      this.scheduleVoice(
        context,
        midi,
        noteStart,
        arrangement.chordDurationSeconds,
        arrangement.chordPeak,
        arrangement.chordWave,
        arrangement.attackSeconds,
        arrangement.releaseSeconds,
      )

      if (arrangement.harmonicLevel > 0 && midi + 12 <= 79) {
        this.scheduleVoice(
          context,
          midi + 12,
          noteStart + 0.012,
          arrangement.chordDurationSeconds * 0.82,
          arrangement.chordPeak * arrangement.harmonicLevel,
          arrangement.harmonicWave,
          arrangement.attackSeconds * 0.8,
          arrangement.releaseSeconds * 0.8,
          1.5,
        )
      }
    }

    if (melody !== null && melody !== undefined) {
      this.scheduleVoice(
        context,
        melody,
        startAt + arrangement.melodyOffsetSeconds,
        arrangement.melodyDurationSeconds,
        arrangement.melodyPeak,
        arrangement.melodyWave,
        arrangement.attackSeconds * 0.65,
        arrangement.releaseSeconds * 0.75,
      )
    }
  }

  private scheduleVoice(
    context: AudioContext,
    midi: number,
    startAt: number,
    duration: number,
    peak: number,
    type: OscillatorType,
    attackSeconds: number,
    releaseSeconds: number,
    detuneOffset = 0,
  ): void {
    if (!this.musicBus) return

    const oscillator = context.createOscillator()
    oscillator.type = type
    oscillator.frequency.value = midiToFrequency(midi)
    oscillator.detune.value = (this.random() - 0.5) * 4 + detuneOffset
    const level = context.createGain()
    const endAt = startAt + duration
    scheduleVoiceEnvelope(level.gain, startAt, duration, peak, {
      attackSeconds,
      releaseSeconds,
    })
    oscillator.connect(level).connect(this.musicBus)

    const voice = { oscillator, level }
    this.activeVoices.add(voice)
    oscillator.addEventListener('ended', () => this.activeVoices.delete(voice), {
      once: true,
    })
    oscillator.start(startAt)
    oscillator.stop(endAt + 0.02)
  }
}
