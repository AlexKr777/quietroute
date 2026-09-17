import type { AudioState } from '../../../src/audio/audio-state'

const BIRDSONG_CONTROL_EXPONENT = 0.72
const DESKTOP_AUDIO_CHANNELS = [
  'rain',
  'music',
  'tram',
  'wind',
  'night',
  'birds',
  'thunder',
] as const

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function createCoreAmbienceState(state: AudioState): AudioState {
  const birdsVolume = clamp01(state.channels.birds.volume)
    ** BIRDSONG_CONTROL_EXPONENT

  return {
    ...state,
    channels: {
      ...state.channels,
      rain: { ...state.channels.rain, muted: true },
      wind: { ...state.channels.wind, muted: true },
      birds: { ...state.channels.birds, volume: birdsVolume },
      thunder: { ...state.channels.thunder, muted: true },
    },
  }
}

export function createMasterScaledState(
  state: AudioState,
  masterVolume: number,
): AudioState {
  const scale = clamp01(masterVolume)
  const channels = Object.fromEntries(
    DESKTOP_AUDIO_CHANNELS.map((channel) => [
      channel,
      {
        ...state.channels[channel],
        volume: state.channels[channel].volume * scale,
      },
    ]),
  ) as AudioState['channels']

  return { ...state, channels }
}
