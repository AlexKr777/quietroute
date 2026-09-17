import type { AudioChannel, AudioState } from './audio-state'

export const OPTIONAL_AUDIO_CHANNELS = [
  'wind',
  'night',
  'thunder',
] as const satisfies readonly AudioChannel[]

export type OptionalAudioChannel = (typeof OPTIONAL_AUDIO_CHANNELS)[number]

function channelIsReady(
  state: AudioState | null,
  channel: OptionalAudioChannel,
): boolean {
  if (!state?.started) return false
  const channelState = state.channels[channel]
  return !channelState.muted && channelState.volume > 0
}

export function getOptionalAuditionChannels(
  previous: AudioState | null,
  next: AudioState,
): OptionalAudioChannel[] {
  if (!next.started || next.masterMuted || previous?.masterMuted) return []

  return OPTIONAL_AUDIO_CHANNELS.filter((channel) =>
    channelIsReady(next, channel) && !channelIsReady(previous, channel)
  )
}
