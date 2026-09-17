export interface MusicSchedule {
  nextTime: number
  chordIndex: number
}

export const AUDIO_SILENCE_FLOOR = 0.0001

interface VoiceGainAutomation {
  value: number
  setValueAtTime(value: number, startTime: number): unknown
  exponentialRampToValueAtTime(value: number, endTime: number): unknown
}

interface VoiceEnvelopeTiming {
  attackSeconds: number
  releaseSeconds: number
}

export function scheduleVoiceEnvelope(
  parameter: VoiceGainAutomation,
  startAt: number,
  duration: number,
  peak: number,
  timing: VoiceEnvelopeTiming = {
    attackSeconds: 0.52,
    releaseSeconds: 0.72,
  },
): void {
  const endAt = startAt + duration
  const attackSeconds = Math.min(
    Math.max(0.02, timing.attackSeconds),
    duration * 0.45,
  )
  const releaseSeconds = Math.min(
    Math.max(0.08, timing.releaseSeconds),
    duration - attackSeconds - 0.05,
  )
  parameter.value = AUDIO_SILENCE_FLOOR
  parameter.setValueAtTime(AUDIO_SILENCE_FLOOR, startAt)
  parameter.exponentialRampToValueAtTime(peak, startAt + attackSeconds)
  parameter.exponentialRampToValueAtTime(peak * 0.48, endAt - releaseSeconds)
  parameter.exponentialRampToValueAtTime(AUDIO_SILENCE_FLOOR, endAt)
}

export function catchUpMusicSchedule(
  schedule: MusicSchedule,
  currentTime: number,
  chordCount: number,
  intervalSeconds: number,
): MusicSchedule {
  if (chordCount <= 0 || intervalSeconds <= 0) {
    throw new Error('Music schedule requires positive chord and interval values')
  }
  if (schedule.nextTime >= currentTime) {
    return { ...schedule }
  }

  const missedChords = Math.ceil(
    (currentTime - schedule.nextTime) / intervalSeconds,
  )

  return {
    nextTime: schedule.nextTime + missedChords * intervalSeconds,
    chordIndex: (schedule.chordIndex + missedChords) % chordCount,
  }
}
