export const AUDIO_CHANNELS = [
  'rain',
  'music',
  'tram',
  'wind',
  'night',
  'birds',
  'thunder',
] as const

export type AudioChannel = (typeof AUDIO_CHANNELS)[number]

export interface AudioChannelState {
  volume: number
  muted: boolean
}

export interface AudioState {
  started: boolean
  masterMuted: boolean
  musicTrackIndex: number
  channels: Record<AudioChannel, AudioChannelState>
}

export function createInitialAudioState(): AudioState {
  return {
    started: false,
    masterMuted: false,
    musicTrackIndex: 0,
    channels: {
      rain: { volume: 0.44, muted: false },
      music: { volume: 0.38, muted: false },
      tram: { volume: 0.22, muted: false },
      wind: { volume: 0.28, muted: true },
      night: { volume: 0.28, muted: true },
      birds: { volume: 0.18, muted: true },
      thunder: { volume: 0.26, muted: true },
    },
  }
}

export function startAudioFromGesture(state: AudioState): AudioState {
  return { ...state, started: true }
}

export function setChannelVolume(
  state: AudioState,
  channel: AudioChannel,
  volume: number,
): AudioState {
  const nextVolume = Number.isFinite(volume)
    ? Math.min(1, Math.max(0, volume))
    : 0

  return {
    ...state,
    channels: {
      ...state.channels,
      [channel]: { ...state.channels[channel], volume: nextVolume },
    },
  }
}

export function toggleChannelMute(
  state: AudioState,
  channel: AudioChannel,
): AudioState {
  const channelState = state.channels[channel]
  return {
    ...state,
    channels: {
      ...state.channels,
      [channel]: { ...channelState, muted: !channelState.muted },
    },
  }
}

export function toggleMasterMute(state: AudioState): AudioState {
  return { ...state, masterMuted: !state.masterMuted }
}

export function cycleMusicTrack(
  state: AudioState,
  trackCount: number,
  direction = 1,
): AudioState {
  if (!Number.isInteger(trackCount) || trackCount < 2) return state

  const normalizedDirection = direction < 0 ? -1 : 1
  const musicTrackIndex = (
    state.musicTrackIndex + normalizedDirection + trackCount
  ) % trackCount

  return { ...state, musicTrackIndex }
}

export function resolveEffectiveGain(
  state: AudioState,
  channel: AudioChannel,
): number {
  if (!state.started || state.masterMuted || state.channels[channel].muted) {
    return 0
  }

  const volume = state.channels[channel].volume
  return volume * volume
}
