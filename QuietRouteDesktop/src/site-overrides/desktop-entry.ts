import '../../../src/main.ts'
import './desktop-overrides.css'
import './track-rotation.js'
import './desktop-rain.js'
import './desktop-mixer-behavior.js'
import './desktop-audio-preferences.js'
import './desktop-overrides.js'
import {
  RECORDED_LOFI_TRACKS,
} from './desktop-music-library'

const SESSION_LAUNCH_KEY = 'quiet-route-desktop-launch-track-v1'

type RotationApi = {
  createTrackRotation?: (options: {
    tracks: readonly { id: string; src: string }[]
    storage?: Storage
  }) => {
    pickNext: () => { track: { id: string } }
  }
}

declare global {
  interface Window {
    QuietRouteTrackRotation?: RotationApi
  }
}

function readLaunchTrackId(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_LAUNCH_KEY)
  } catch {
    return null
  }
}

function saveLaunchTrackId(trackId: string): void {
  try {
    window.sessionStorage.setItem(SESSION_LAUNCH_KEY, trackId)
  } catch {
    // Storage can be unavailable in constrained contexts.
  }
}

function chooseLaunchTrackIndex(): number {
  const sessionTrackId = readLaunchTrackId()
  const sessionIndex = RECORDED_LOFI_TRACKS.findIndex(
    (track) => track.id === sessionTrackId,
  )
  if (sessionIndex >= 0) return sessionIndex

  const rotation = window.QuietRouteTrackRotation?.createTrackRotation?.({
    tracks: RECORDED_LOFI_TRACKS,
    storage: window.localStorage,
  })
  const trackId = rotation?.pickNext().track.id ?? RECORDED_LOFI_TRACKS[0]?.id
  if (!trackId) return 0
  saveLaunchTrackId(trackId)

  const index = RECORDED_LOFI_TRACKS.findIndex((track) => track.id === trackId)
  return index >= 0 ? index : 0
}

function applyLaunchTrackIndex(trackIndex: number): void {
  const musicToggle = document.querySelector<HTMLButtonElement>('#music-toggle')
  if (!musicToggle || trackIndex <= 0) return

  for (let index = 0; index < trackIndex; index += 1) {
    musicToggle.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      code: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    }))
  }
}

applyLaunchTrackIndex(chooseLaunchTrackIndex())
