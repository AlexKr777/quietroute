export interface RecordedAmbientProfile {
  src: string
  trimGain: number
  highpassFrequency: number
  lowpassFrequency: number
}

export class RecordedAmbientPlayer {
  private media: HTMLAudioElement
  private source: MediaElementAudioSourceNode
  private highpass: BiquadFilterNode
  private lowpass: BiquadFilterNode
  private trim: GainNode
  private sourceLoaded = false
  private requestedActive = false
  private disposed = false
  private pendingPlayback: Promise<boolean> | null = null

  constructor(
    context: AudioContext,
    output: AudioNode,
    private profile: RecordedAmbientProfile,
    private onPlaybackUnavailable?: () => void,
    createMedia: () => HTMLAudioElement = () => new Audio(),
  ) {
    this.media = createMedia()
    this.media.loop = true
    this.media.preload = 'none'

    this.source = context.createMediaElementSource(this.media)
    this.highpass = context.createBiquadFilter()
    this.highpass.type = 'highpass'
    this.highpass.frequency.value = profile.highpassFrequency
    this.lowpass = context.createBiquadFilter()
    this.lowpass.type = 'lowpass'
    this.lowpass.frequency.value = profile.lowpassFrequency
    this.trim = context.createGain()
    this.trim.gain.value = profile.trimGain

    this.source.connect(this.highpass)
    this.highpass.connect(this.lowpass)
    this.lowpass.connect(this.trim)
    this.trim.connect(output)
  }

  async setActive(active: boolean): Promise<boolean> {
    if (this.disposed) return false

    this.requestedActive = active
    if (!active) {
      this.media.pause()
      return true
    }

    return this.play()
  }

  pause(): void {
    if (this.disposed) return
    this.media.pause()
  }

  async resume(): Promise<boolean> {
    if (this.disposed || !this.requestedActive) return false
    return this.play()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.requestedActive = false
    this.media.pause()
    this.media.removeAttribute('src')
    this.media.load()
    this.sourceLoaded = false
    this.source.disconnect()
    this.highpass.disconnect()
    this.lowpass.disconnect()
    this.trim.disconnect()
  }

  private async play(): Promise<boolean> {
    this.loadSource()
    if (!this.media.paused) return true
    if (this.pendingPlayback) return this.pendingPlayback

    this.pendingPlayback = this.beginPlayback()
    try {
      return await this.pendingPlayback
    } finally {
      this.pendingPlayback = null
    }
  }

  private async beginPlayback(): Promise<boolean> {
    try {
      await this.media.play()
      if (this.disposed || !this.requestedActive) {
        this.media.pause()
        return false
      }
      return true
    } catch {
      if (!this.disposed && this.requestedActive) {
        this.onPlaybackUnavailable?.()
      }
      return false
    }
  }

  private loadSource(): void {
    if (this.sourceLoaded) return
    this.sourceLoaded = true
    this.media.src = this.profile.src
    this.media.preload = 'auto'
    this.media.load()
  }
}
