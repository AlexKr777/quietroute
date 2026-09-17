(function (root, factory) {
  const behavior = factory()
  if (typeof module === 'object' && module.exports) {
    module.exports = behavior
  }
  if (root && typeof window !== 'undefined') {
    root.QuietRouteDesktopMixerBehavior = behavior
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  const MAX_PRESS_TRAVEL_PX = 6
  const COMPACT_DOCK_KEYS = ['ArrowRight', 'ArrowDown']

  function resolveMixerPointerAction(options) {
    if (options && options.startedOnGrip) return 'drag'
    const travelPixels = Number(options && options.travelPixels)
    if (Number.isFinite(travelPixels) && travelPixels <= MAX_PRESS_TRAVEL_PX) {
      return 'toggle'
    }
    return Number.isFinite(travelPixels) ? 'drag' : 'none'
  }

  function getCompactDockKeys() {
    return COMPACT_DOCK_KEYS.slice()
  }

  function resolveOutsideMixerPress(options) {
    if (!options || options.collapsed) return 'ignore'
    if (options.startedInsideMixer || options.endedInsideMixer) return 'ignore'

    const travelPixels = Number(options.travelPixels)
    if (!Number.isFinite(travelPixels) || travelPixels > MAX_PRESS_TRAVEL_PX) {
      return 'ignore'
    }
    return 'collapse'
  }

  function resolveCompactMixerTransition(options) {
    const isCompact = Boolean(options && options.isCompact)
    const wasCompact = Boolean(options && options.wasCompact)
    let compactCollapsed = Boolean(options && options.compactCollapsed)

    if (isCompact && !wasCompact) {
      compactCollapsed = true
    } else if (!isCompact && wasCompact) {
      compactCollapsed = true
    }

    return {
      compactCollapsed,
      wasCompact: isCompact,
    }
  }

  return {
    getCompactDockKeys,
    resolveOutsideMixerPress,
    resolveCompactMixerTransition,
    resolveMixerPointerAction,
  }
})
