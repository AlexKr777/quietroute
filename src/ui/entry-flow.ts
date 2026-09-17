interface EntryFullscreenContext {
  fullscreenEnabled: boolean
  hasFullscreenElement: boolean
  viewportWidth: number
  desktopHosted?: boolean
}

const AUTO_FULLSCREEN_MIN_WIDTH = 720

export function shouldRequestEntryFullscreen(
  context: EntryFullscreenContext,
): boolean {
  return (
    !context.desktopHosted &&
    context.fullscreenEnabled &&
    !context.hasFullscreenElement &&
    context.viewportWidth >= AUTO_FULLSCREEN_MIN_WIDTH
  )
}

export function getDockRevealDelay(prefersReducedMotion: boolean): number {
  return prefersReducedMotion ? 250 : 2350
}
