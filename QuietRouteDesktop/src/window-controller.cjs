const {
  clampBoundsToWorkArea,
  getCompactBounds,
} = require('./window-layout.cjs')

const DEFAULT_COMPACT_SIZE = { width: 480, height: 360 }
const DEFAULT_COMPACT_MARGIN = 24
const DEFAULT_COMPACT_BOTTOM_MARGIN = 72

function createWindowController({
  window,
  getDisplayMatching,
  compactSize = DEFAULT_COMPACT_SIZE,
  compactMargin = DEFAULT_COMPACT_MARGIN,
  compactBottomMargin = DEFAULT_COMPACT_BOTTOM_MARGIN,
  initialCompact = false,
  initialExpandedBounds = window.getBounds(),
  initialAlwaysOnTop = window.isAlwaysOnTop(),
  onStateChange = () => undefined,
}) {
  let compact = Boolean(initialCompact)
  let expandedBounds = initialExpandedBounds
  let alwaysOnTop = Boolean(initialAlwaysOnTop)
  let compactAutoEnabledAlwaysOnTop = false
  let mixerRestoreBounds = null

  if (compact) {
    window.setMaximizable(false)
    window.setResizable(true)
  }

  function applyAlwaysOnTop(enabled) {
    alwaysOnTop = Boolean(enabled)
    window.setAlwaysOnTop(alwaysOnTop, 'floating')
  }

  function getState() {
    return {
      compact,
      alwaysOnTop,
    }
  }

  function publishState() {
    const state = getState()
    onStateChange(state)
    return state
  }

  function toggleCompact() {
    if (!compact) {
      mixerRestoreBounds = null
      expandedBounds = window.getBounds()
      const wasAlwaysOnTop = alwaysOnTop
      const display = getDisplayMatching(expandedBounds)
      const compactBounds = getCompactBounds(
        display.workArea,
        compactSize,
        compactMargin,
        compactBottomMargin,
      )

      compact = true
      compactAutoEnabledAlwaysOnTop = !wasAlwaysOnTop
      if (typeof window.isFullScreen === 'function' && window.isFullScreen()) {
        window.setFullScreen(false)
      }
      if (typeof window.isMaximized === 'function' && window.isMaximized()) {
        window.unmaximize()
      }
      window.setMaximizable(false)
      window.setResizable(true)
      window.setBounds(compactBounds)
      if (compactAutoEnabledAlwaysOnTop) {
        applyAlwaysOnTop(true)
      }
      return publishState()
    }

    const display = getDisplayMatching(expandedBounds)
    const visibleBounds = clampBoundsToWorkArea(
      expandedBounds,
      display.workArea,
    )
    if (compactAutoEnabledAlwaysOnTop && alwaysOnTop) {
      applyAlwaysOnTop(false)
    }
    compactAutoEnabledAlwaysOnTop = false
    compact = false
    mixerRestoreBounds = null
    window.setMaximizable(true)
    window.setResizable(true)
    window.setBounds(visibleBounds)
    expandedBounds = visibleBounds
    return publishState()
  }

  function toggleAlwaysOnTop() {
    const enabled = !alwaysOnTop
    applyAlwaysOnTop(enabled)
    if (compact) compactAutoEnabledAlwaysOnTop = false
    return publishState()
  }

  function captureExpandedBounds() {
    if (!compact) expandedBounds = window.getBounds()
  }

  function ensureMixerSpace() {
    const currentBounds = window.getBounds()
    if (
      currentBounds.width >= compactSize.width &&
      currentBounds.height >= compactSize.height
    ) {
      return publishState()
    }

    if (!mixerRestoreBounds) mixerRestoreBounds = currentBounds
    const display = getDisplayMatching(currentBounds)
    const nextBounds = clampBoundsToWorkArea({
      ...currentBounds,
      width: Math.max(currentBounds.width, compactSize.width),
      height: Math.max(currentBounds.height, compactSize.height),
    }, display.workArea)
    window.setBounds(nextBounds)
    if (!compact) expandedBounds = nextBounds
    return publishState()
  }

  function restoreMixerSpace() {
    if (!mixerRestoreBounds) return publishState()

    const requestedBounds = mixerRestoreBounds
    mixerRestoreBounds = null
    const display = getDisplayMatching(requestedBounds)
    const restoredBounds = clampBoundsToWorkArea(
      requestedBounds,
      display.workArea,
    )
    window.setBounds(restoredBounds)
    if (!compact) expandedBounds = restoredBounds
    return publishState()
  }

  function keepVisible() {
    const currentBounds = window.getBounds()
    const display = getDisplayMatching(currentBounds)
    const nextBounds = clampBoundsToWorkArea(currentBounds, display.workArea)

    window.setBounds(nextBounds)
    if (!compact) expandedBounds = nextBounds
  }

  function getPersistenceState() {
    return {
      compact,
      alwaysOnTop,
      bounds: window.getBounds(),
      expandedBounds,
    }
  }

  return {
    captureExpandedBounds,
    ensureMixerSpace,
    getState,
    getPersistenceState,
    keepVisible,
    restoreMixerSpace,
    toggleAlwaysOnTop,
    toggleCompact,
  }
}

module.exports = {
  DEFAULT_COMPACT_BOTTOM_MARGIN,
  DEFAULT_COMPACT_SIZE,
  createWindowController,
}
