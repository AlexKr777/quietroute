(function attachQuietRouteClockControls(globalScope) {
  const CLOCK_PREFERENCES_KEY = 'quiet-route-desktop:clock-preferences-v1'
  const DEFAULT_CLOCK_PREFERENCES = Object.freeze({ x: 50, y: 4, scale: 1 })
  const MIN_CLOCK_SCALE = 0.72
  const MAX_CLOCK_SCALE = 2.4
  const MIN_CLOCK_POSITION = 4
  const MAX_CLOCK_POSITION = 96

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value))
  }

  function normalizeClockPreferences(value) {
    if (!value || typeof value !== 'object') return null
    if (![value.x, value.y, value.scale].every((part) => typeof part === 'number')) {
      return null
    }
    const x = Number(value.x)
    const y = Number(value.y)
    const scale = Number(value.scale)
    if (![x, y, scale].every(Number.isFinite)) return null
    return { x, y, scale }
  }

  function clampClockPreferences(value) {
    const normalized = normalizeClockPreferences(value) ?? DEFAULT_CLOCK_PREFERENCES
    return {
      x: Math.round(clamp(normalized.x, MIN_CLOCK_POSITION, MAX_CLOCK_POSITION) * 10) / 10,
      y: Math.round(clamp(normalized.y, MIN_CLOCK_POSITION, MAX_CLOCK_POSITION) * 10) / 10,
      scale: Math.round(clamp(normalized.scale, MIN_CLOCK_SCALE, MAX_CLOCK_SCALE) * 100) / 100,
    }
  }

  function readClockPreferences(storage) {
    try {
      return clampClockPreferences(JSON.parse(storage?.getItem?.(CLOCK_PREFERENCES_KEY) ?? ''))
    } catch {
      return { ...DEFAULT_CLOCK_PREFERENCES }
    }
  }

  function saveClockPreferences(storage, preferences) {
    try {
      storage?.setItem?.(CLOCK_PREFERENCES_KEY, JSON.stringify(preferences))
      return true
    } catch {
      return false
    }
  }

  function initClockControls(options = {}) {
    const root = options.root ?? globalScope
    const documentRef = options.document ?? root.document
    const storage = options.storage ?? root.localStorage
    const clock = options.clock ?? documentRef?.querySelector?.('#live-clock')
    if (!clock) return null
    const host = options.host ?? clock

    let preferences = readClockPreferences(storage)
    let press = null

    function apply() {
      host.style.setProperty('--clock-x', `${preferences.x}%`)
      host.style.setProperty('--clock-y', `${preferences.y}%`)
      host.style.setProperty('--clock-scale', String(preferences.scale))
    }

    function persist() {
      saveClockPreferences(storage, preferences)
    }

    function setEditing(enabled) {
      host.classList.toggle('is-editing', enabled)
      clock.classList.toggle('is-editing', enabled)
      clock.setAttribute('aria-pressed', String(enabled))
      clock.setAttribute(
        'aria-label',
        enabled
          ? 'Время: режим изменения. Тяните плашку для перемещения, уголок — для размера.'
          : 'Текущее время. Нажмите, чтобы изменить положение и размер.',
      )
    }

    function stopPress(event) {
      if (!press || (event && press.pointerId !== event.pointerId)) return
      if (clock.hasPointerCapture?.(press.pointerId)) {
        clock.releasePointerCapture(press.pointerId)
      }
      if (press.moved) persist()
      press = null
    }

    function close() {
      if (press && clock.hasPointerCapture?.(press.pointerId)) {
        clock.releasePointerCapture(press.pointerId)
      }
      press = null
      setEditing(false)
    }

    clock.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      const resizing = Boolean(event.target?.closest?.('.scene-clock__resize-handle'))
      if (!clock.classList.contains('is-editing') && !resizing) setEditing(true)
      press = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        preferences: { ...preferences },
        resizing,
        moved: false,
      }
      clock.setPointerCapture?.(event.pointerId)
      event.preventDefault()
    })

    clock.addEventListener('pointermove', (event) => {
      if (!press || press.pointerId !== event.pointerId) return
      const dx = event.clientX - press.x
      const dy = event.clientY - press.y
      if (!press.moved && Math.hypot(dx, dy) < 4) return
      press.moved = true

      if (press.resizing) {
        preferences = clampClockPreferences({
          ...press.preferences,
          scale: press.preferences.scale + dx / 160,
        })
      } else {
        preferences = clampClockPreferences({
          ...press.preferences,
          x: press.preferences.x + (dx / Math.max(1, root.innerWidth)) * 100,
          y: press.preferences.y + (dy / Math.max(1, root.innerHeight)) * 100,
        })
      }
      apply()
    })

    clock.addEventListener('pointerup', stopPress)
    clock.addEventListener('pointercancel', stopPress)
    clock.addEventListener('lostpointercapture', stopPress)
    clock.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        setEditing(!clock.classList.contains('is-editing'))
        return
      }
      if (!clock.classList.contains('is-editing')) return

      const step = event.shiftKey ? 4 : 1
      const movement = {
        ArrowUp: { x: 0, y: -step },
        ArrowDown: { x: 0, y: step },
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
      }[event.key]
      if (movement) {
        event.preventDefault()
        preferences = clampClockPreferences({
          ...preferences,
          x: preferences.x + movement.x,
          y: preferences.y + movement.y,
        })
        apply()
        persist()
      }
    })

    apply()
    setEditing(false)
    return { close, getPreferences: () => ({ ...preferences }), persist }
  }

  const api = {
    CLOCK_PREFERENCES_KEY,
    clampClockPreferences,
    initClockControls,
    normalizeClockPreferences,
  }

  if (typeof module === 'object' && module.exports) module.exports = api
  globalScope.QuietRouteClockControls = api
})(typeof window !== 'undefined' ? window : globalThis)
