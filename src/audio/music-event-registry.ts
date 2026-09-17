interface ScheduledMusicEvent {
  source: AudioScheduledSourceNode
  level: GainNode
}

const RETIRE_FADE_SECONDS = 0.025
const RETIRE_TAIL_SECONDS = 0.12

export class MusicEventRegistry {
  private events = new Set<ScheduledMusicEvent>()

  get size(): number {
    return this.events.size
  }

  track(source: AudioScheduledSourceNode, level: GainNode): void {
    const event = { source, level }
    this.events.add(event)
    source.addEventListener('ended', () => this.events.delete(event), {
      once: true,
    })
  }

  retireAll(now: number): void {
    const events = [...this.events]
    this.events.clear()

    for (const event of events) {
      event.level.gain.cancelAndHoldAtTime(now)
      event.level.gain.setTargetAtTime(
        0.0001,
        now,
        RETIRE_FADE_SECONDS,
      )
      try {
        event.source.stop(now + RETIRE_TAIL_SECONDS)
      } catch {
        // A source that has already ended no longer needs retirement.
      }
    }
  }

  clear(): void {
    this.events.clear()
  }
}
