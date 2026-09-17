import type { RecordedMusicTrack } from './music-library'

interface MusicDeck {
  media: HTMLAudioElement
  source: MediaElementAudioSourceNode
  level: GainNode
  pauseTimer: ReturnType<typeof setTimeout> | null
  selectionGeneration: number
  trackId: string | null
  advanceRequested: boolean
  handleTimeUpdate: () => void
  handleEnded: () => void
}

const SILENCE = 0.0001
const FADE_TIME_CONSTANT_SECONDS = 0.18
const RETIRE_DELAY_MS = 1000
const AUTO_ADVANCE_LEAD_SECONDS = 3

export class RecordedMusicPlayer {
  private decks: readonly [MusicDeck, MusicDeck]
  private activeDeckIndex: 0 | 1 | null = null
  private selectionGeneration = 0
  private disposed = false
  private playbackPaused = false
  private selectedTrackId: string | null = null

  constructor(
    private context: AudioContext,
    output: AudioNode,
    createMedia: () => HTMLAudioElement = () => new Audio(),
    private onTrackEnding: (trackId: string) => void = () => {},
  ) {
    this.decks = [0, 1].map(() => {
      const media = createMedia()
      media.loop = false
      media.preload = 'metadata'
      const source = context.createMediaElementSource(media)
      const level = context.createGain()
      level.gain.value = SILENCE
      source.connect(level)
      level.connect(output)
      const deck = {
        media,
        source,
        level,
        pauseTimer: null,
        selectionGeneration: 0,
        trackId: null,
        advanceRequested: false,
        handleTimeUpdate: () => {},
        handleEnded: () => {},
      } satisfies MusicDeck
      deck.handleTimeUpdate = () => this.requestTrackAdvance(deck, false)
      deck.handleEnded = () => this.requestTrackAdvance(deck, true)
      media.addEventListener('timeupdate', deck.handleTimeUpdate)
      media.addEventListener('ended', deck.handleEnded)
      return deck
    }) as unknown as readonly [MusicDeck, MusicDeck]
  }

  get currentTrackId(): string | null {
    return this.selectedTrackId
  }

  async select(track: RecordedMusicTrack): Promise<boolean> {
    if (this.disposed) return false

    const activeDeck = this.getActiveDeck()
    if (activeDeck && this.selectedTrackId === track.id) {
      return this.resume()
    }

    const generation = ++this.selectionGeneration
    const nextDeckIndex: 0 | 1 = this.activeDeckIndex === 0 ? 1 : 0
    const nextDeck = this.decks[nextDeckIndex]
    this.clearPauseTimer(nextDeck)
    this.resetMedia(nextDeck, false)
    nextDeck.selectionGeneration = generation
    nextDeck.media.src = track.src
    nextDeck.media.loop = false
    nextDeck.media.preload = 'auto'
    nextDeck.trackId = track.id
    nextDeck.advanceRequested = false
    nextDeck.media.load()

    const now = this.context.currentTime
    nextDeck.level.gain.cancelAndHoldAtTime(now)
    nextDeck.level.gain.setValueAtTime(SILENCE, now)

    try {
      await nextDeck.media.play()
    } catch {
      if (nextDeck.selectionGeneration === generation) {
        this.resetMedia(nextDeck, false)
      }
      if (generation === this.selectionGeneration) {
        this.retireActiveDeck(this.context.currentTime)
      }
      return false
    }

    if (this.disposed || generation !== this.selectionGeneration) {
      if (nextDeck.selectionGeneration === generation) {
        this.resetMedia(nextDeck, false)
      }
      return false
    }

    if (this.playbackPaused) nextDeck.media.pause()

    const crossfadeAt = this.context.currentTime
    nextDeck.level.gain.cancelAndHoldAtTime(crossfadeAt)
    nextDeck.level.gain.setTargetAtTime(
      track.trimGain,
      crossfadeAt,
      FADE_TIME_CONSTANT_SECONDS,
    )

    if (activeDeck) {
      this.fadeOutDeck(activeDeck, crossfadeAt)
    }

    this.activeDeckIndex = nextDeckIndex
    this.selectedTrackId = track.id
    return true
  }

  pause(): void {
    this.playbackPaused = true
    for (const deck of this.decks) {
      this.clearPauseTimer(deck)
      deck.media.pause()
    }
  }

  async resume(): Promise<boolean> {
    if (this.disposed) return false
    const activeDeck = this.getActiveDeck()
    if (!activeDeck) return false

    this.playbackPaused = false

    try {
      await activeDeck.media.play()
      return true
    } catch {
      this.retireActiveDeck(this.context.currentTime)
      return false
    }
  }

  stop(): void {
    this.selectionGeneration += 1
    this.retireActiveDeck(this.context.currentTime)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.playbackPaused = true
    this.selectionGeneration += 1
    this.selectedTrackId = null
    this.activeDeckIndex = null

    for (const deck of this.decks) {
      this.clearPauseTimer(deck)
      this.resetMedia(deck, true)
      deck.media.removeEventListener('timeupdate', deck.handleTimeUpdate)
      deck.media.removeEventListener('ended', deck.handleEnded)
      deck.source.disconnect()
      deck.level.disconnect()
    }
  }

  private getActiveDeck(): MusicDeck | null {
    if (this.activeDeckIndex === null) return null
    return this.decks[this.activeDeckIndex]
  }

  private retireActiveDeck(now: number): void {
    const activeDeck = this.getActiveDeck()
    if (activeDeck) this.fadeOutDeck(activeDeck, now)
    this.activeDeckIndex = null
    this.selectedTrackId = null
  }

  private fadeOutDeck(deck: MusicDeck, now: number): void {
    deck.level.gain.cancelAndHoldAtTime(now)
    deck.level.gain.setTargetAtTime(
      SILENCE,
      now,
      FADE_TIME_CONSTANT_SECONDS,
    )
    this.clearPauseTimer(deck)
    deck.pauseTimer = setTimeout(() => {
      deck.pauseTimer = null
      this.resetMedia(deck, false)
    }, RETIRE_DELAY_MS)
  }

  private clearPauseTimer(deck: MusicDeck): void {
    if (deck.pauseTimer === null) return
    clearTimeout(deck.pauseTimer)
    deck.pauseTimer = null
  }

  private requestTrackAdvance(deck: MusicDeck, ended: boolean): void {
    if (
      this.disposed ||
      deck !== this.getActiveDeck() ||
      deck.advanceRequested ||
      !deck.trackId
    ) {
      return
    }

    const remaining = deck.media.duration - deck.media.currentTime
    if (
      !ended &&
      (!Number.isFinite(remaining) || remaining > AUTO_ADVANCE_LEAD_SECONDS)
    ) {
      return
    }

    deck.advanceRequested = true
    this.onTrackEnding(deck.trackId)
  }

  private resetMedia(deck: MusicDeck, releaseSource: boolean): void {
    deck.media.pause()
    try {
      deck.media.currentTime = 0
    } catch {
      // Metadata may not have loaded yet, so there is nothing to rewind.
    }
    if (!releaseSource) return
    deck.media.removeAttribute('src')
    deck.media.load()
    deck.trackId = null
    deck.advanceRequested = false
  }
}
