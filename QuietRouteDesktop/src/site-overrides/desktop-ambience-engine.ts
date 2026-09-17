import type { AudioState } from '../../../src/audio/audio-state'
import { AmbienceEngine as SiteAmbienceEngine } from '../../../src/audio/ambience-engine'
import {
  createCoreAmbienceState,
  createMasterScaledState,
} from './desktop-channel-routing'
import { DesktopWeatherPlayer } from './desktop-weather-player'

const MASTER_VOLUME_EVENT = 'quiet-route-desktop-master-volume'

export class AmbienceEngine {
  private core: SiteAmbienceEngine
  private weather = new DesktopWeatherPlayer()
  private masterVolume = 1
  private lastState: AudioState | null = null

  private handleMasterVolume = (event: Event): void => {
    const value = event instanceof CustomEvent ? Number(event.detail) : 0
    this.masterVolume = Number.isFinite(value)
      ? Math.min(1, Math.max(0, value))
      : 0
    if (this.lastState) this.applyState(this.lastState)
  }

  constructor(
    onMusicTrackAdvance?: () => void,
    onBirdsongUnavailable?: () => void,
  ) {
    this.core = new SiteAmbienceEngine(
      onMusicTrackAdvance,
      onBirdsongUnavailable,
    )
    window.addEventListener(MASTER_VOLUME_EVENT, this.handleMasterVolume)
  }

  get status(): 'idle' | AudioContextState {
    return this.core.status
  }

  async start(state: AudioState): Promise<void> {
    this.lastState = state
    const weatherPlayback = this.weather.start(
      createMasterScaledState(state, this.masterVolume),
    )
    const corePlayback = this.core.start(
      createMasterScaledState(
        createCoreAmbienceState(state),
        this.masterVolume,
      ),
    )
    await Promise.all([weatherPlayback, corePlayback])
  }

  applyState(state: AudioState): void {
    this.lastState = state
    this.weather.applyState(createMasterScaledState(state, this.masterVolume))
    this.core.applyState(
      createMasterScaledState(
        createCoreAmbienceState(state),
        this.masterVolume,
      ),
    )
  }

  async suspend(): Promise<void> {
    await Promise.all([
      this.weather.suspend(),
      this.core.suspend(),
    ])
  }

  dispose(): void {
    window.removeEventListener(MASTER_VOLUME_EVENT, this.handleMasterVolume)
    this.lastState = null
    this.weather.dispose()
    this.core.dispose()
  }
}
