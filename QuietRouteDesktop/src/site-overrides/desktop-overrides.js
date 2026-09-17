(function () {
  'use strict'

  const root = window
  const COMPACT_BREAKPOINT = '(max-width: 520px)'
  const MASTER_VOLUME_EVENT = 'quiet-route-desktop-master-volume'
  const SHELL_ORIGIN = 'quiet-route://shell'
  const behavior = root.QuietRouteDesktopMixerBehavior

  function setupMasterVolume() {
    if (document.querySelector('#desktop-master-volume')) return

    const rainRow = document.querySelector('#rain-toggle')?.closest('.sound-controls__row')
    if (!rainRow) return

    const row = document.createElement('div')
    row.className = 'sound-controls__row desktop-master-volume'

    const label = document.createElement('label')
    label.className = 'sound-controls__channel desktop-master-volume__label'
    label.htmlFor = 'desktop-master-volume'
    label.dataset.active = 'true'
    label.innerHTML = '<span aria-hidden="true">◆</span> всё'

    const input = document.createElement('input')
    input.id = 'desktop-master-volume'
    input.type = 'range'
    input.min = '0'
    input.max = '100'
    input.value = '100'
    input.setAttribute('aria-label', 'Общая громкость всех звуков')

    function applyMasterVolume() {
      const percentage = Math.min(100, Math.max(0, Number(input.value) || 0))
      const normalized = percentage / 100
      input.value = String(percentage)
      input.style.setProperty('--range-value', `${percentage}%`)
      input.setAttribute('aria-valuetext', `${percentage} процентов`)
      document.body.dataset.desktopMasterVolume = String(normalized)
      root.dispatchEvent(new CustomEvent(MASTER_VOLUME_EVENT, {
        detail: normalized,
      }))
    }

    input.addEventListener('input', applyMasterVolume)
    row.append(label, input)
    rainRow.before(row)
    applyMasterVolume()
  }

  function setupMixerCollapse() {
    const controls = document.querySelector('#sound-controls')
    const handle = document.querySelector('#sound-drag-handle')
    if (!controls || !handle) return

    const compactQuery = root.matchMedia(COMPACT_BREAKPOINT)
    let compactCollapsed = true
    let normalCollapsed = false
    let wasCompact = false
    let compactDockLayout = null
    let compactDockUserMoved = false
    let compactReturnPosition = null
    let pressStart = null
    let outsidePressStart = null
    let redispatchingPointerDown = false
    let dockBridgeFailureReported = false

    function ensureGrip() {
      let grip = handle.querySelector('.desktop-mixer-grip')
      if (grip) return grip

      const label = handle.querySelector('span')
      label?.classList.add('sound-controls__drag-label')
      grip = document.createElement('span')
      grip.className = 'desktop-mixer-grip'
      grip.setAttribute('aria-hidden', 'true')
      grip.dataset.desktopMixerGrip = 'true'
      grip.innerHTML = '<i></i><i></i><i></i>'
      handle.append(grip)
      return grip
    }

    const grip = ensureGrip()

    function startedOnGrip(event) {
      return Boolean(event.target?.closest?.('.desktop-mixer-grip'))
    }

    function isCollapsed() {
      return compactQuery.matches ? compactCollapsed : normalCollapsed
    }

    function notifyShell(type) {
      if (root.parent === root) return
      root.parent.postMessage({ type }, SHELL_ORIGIN)
    }

    function readDockPosition() {
      const position = root.QuietRouteDesktopDock?.getPosition?.()
      if (Number.isFinite(position?.x) && Number.isFinite(position?.y)) {
        return { x: position.x, y: position.y }
      }

      const bounds = controls.getBoundingClientRect()
      return { x: bounds.x, y: bounds.y }
    }

    function getLowerRightDockPosition(dockSize) {
      const padding = root.QuietRouteDesktopDock?.getPadding?.() ?? 16
      return {
        x: root.innerWidth - dockSize.width - padding,
        y: root.innerHeight - dockSize.height - padding,
      }
    }

    function measureMixerSize() {
      const clone = controls.cloneNode(true)
      clone.removeAttribute('id')
      clone.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'))
      clone.classList.remove('is-dragging', 'is-releasing')
      clone.setAttribute('aria-hidden', 'true')
      clone.style.setProperty('display', 'block', 'important')
      clone.style.setProperty('position', 'fixed', 'important')
      clone.style.setProperty('inset', '0 auto auto 0', 'important')
      clone.style.setProperty('transform', 'none', 'important')
      clone.style.setProperty('transition', 'none', 'important')
      clone.style.setProperty('visibility', 'hidden', 'important')
      clone.style.setProperty('pointer-events', 'none', 'important')
      document.body.append(clone)
      const bounds = clone.getBoundingClientRect()
      clone.remove()
      return { width: bounds.width, height: bounds.height }
    }

    function moveDockTo(position, dockSize) {
      const moved = root.QuietRouteDesktopDock?.moveTo?.(position, dockSize)
      if (moved) {
        document.body.dataset.desktopDockState = 'ready'
        return true
      }

      document.body.dataset.desktopDockState = 'unavailable'
      if (!dockBridgeFailureReported) {
        dockBridgeFailureReported = true
        console.error('[quiet-route-desktop] synchronized dock bridge is unavailable')
      }
      return false
    }

    function markCompactDockUserMoved() {
      if (!compactQuery.matches) return
      compactDockUserMoved = true
    }

    function syncCompactDock(collapsed) {
      const layout = collapsed ? 'collapsed' : 'expanded'
      if (compactDockLayout === layout) return
      compactDockLayout = layout

      // While opening an existing chip, the site's ResizeObserver is allowed
      // to move the larger panel inward. Its chip anchor stays separate.
      if (!collapsed && compactReturnPosition) return
      if (compactDockUserMoved) return

      const returnPosition = collapsed && compactReturnPosition
        ? { ...compactReturnPosition }
        : null
      const dockSize = measureMixerSize()
      moveDockTo(
        returnPosition ?? getLowerRightDockPosition(dockSize),
        dockSize,
      )
      if (collapsed) compactReturnPosition = null
    }

    function apply() {
      const currentlyCompact = compactQuery.matches
      const enteredCompact = currentlyCompact && !wasCompact
      const transition = behavior?.resolveCompactMixerTransition?.({
        compactCollapsed,
        isCompact: currentlyCompact,
        wasCompact,
      })
      if (transition) {
        compactCollapsed = transition.compactCollapsed
        wasCompact = transition.wasCompact
      } else {
        if (currentlyCompact && !wasCompact) {
          compactCollapsed = true
        } else if (!currentlyCompact && wasCompact) {
          compactCollapsed = true
        }
        wasCompact = currentlyCompact
      }

      const collapsed = isCollapsed()
      document.body.classList.add('desktop-mixer-ready')
      document.body.classList.toggle('desktop-mixer-collapsed', collapsed)
      controls.dataset.desktopCollapsed = String(collapsed)
      handle.setAttribute('aria-expanded', String(!collapsed))
      handle.title = collapsed
        ? 'Нажать на «звук» — открыть панель'
        : 'Нажать на «звук» — свернуть панель'
      handle.setAttribute(
        'aria-label',
        `${handle.title}; удерживать «звук» и тянуть — переместить, стрелки — двигать`,
      )

      if (enteredCompact) {
        compactDockLayout = null
        compactDockUserMoved = false
        compactReturnPosition = null
      }

      if (currentlyCompact) {
        syncCompactDock(collapsed)
      } else {
        compactDockLayout = null
        compactDockUserMoved = false
        compactReturnPosition = null
      }
    }

    function toggle() {
      const wasCollapsed = isCollapsed()
      if (compactQuery.matches) {
        if (compactCollapsed) {
          compactReturnPosition = readDockPosition()
        }
        compactDockUserMoved = false
        compactCollapsed = !compactCollapsed
      } else {
        normalCollapsed = !normalCollapsed
      }
      apply()
      if (!wasCollapsed && isCollapsed()) {
        notifyShell('quiet-route:desktop:mixer-close')
      }
    }

    function toggleFromUser() {
      if (!isCollapsed()) {
        toggle()
        return
      }
      if (root.parent === root) {
        toggle()
        return
      }
      root.parent.postMessage({
        type: 'quiet-route:desktop:mixer-open-request',
      }, SHELL_ORIGIN)
    }

    handle.addEventListener('pointerdown', (event) => {
      if (redispatchingPointerDown || event.button !== 0) return
      if (startedOnGrip(event)) {
        markCompactDockUserMoved()
        pressStart = null
        return
      }

      event.preventDefault()
      event.stopImmediatePropagation()
      pressStart = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        dragging: false,
      }
      handle.setPointerCapture?.(event.pointerId)
    }, true)

    handle.addEventListener('pointermove', (event) => {
      if (
        !pressStart ||
        pressStart.pointerId !== event.pointerId ||
        pressStart.dragging
      ) {
        return
      }

      const travel = Math.hypot(
        event.clientX - pressStart.x,
        event.clientY - pressStart.y,
      )
      const action = behavior?.resolveMixerPointerAction?.({
        startedOnGrip: false,
        travelPixels: travel,
      }) ?? (travel > 6 ? 'drag' : 'toggle')
      if (action !== 'drag') return

      pressStart.dragging = true
      markCompactDockUserMoved()
      redispatchingPointerDown = true
      try {
        handle.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          isPrimary: event.isPrimary,
          button: 0,
          buttons: event.buttons || 1,
          clientX: pressStart.x,
          clientY: pressStart.y,
        }))
      } finally {
        redispatchingPointerDown = false
      }
    }, true)

    handle.addEventListener('pointerup', (event) => {
      if (!pressStart || pressStart.pointerId !== event.pointerId) return
      if (pressStart.dragging) {
        pressStart = null
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()

      const travel = Math.hypot(
        event.clientX - pressStart.x,
        event.clientY - pressStart.y,
      )
      pressStart = null
      if (handle.hasPointerCapture?.(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId)
      }
      const action = behavior?.resolveMixerPointerAction?.({
        startedOnGrip: false,
        travelPixels: travel,
      }) ?? (travel <= 6 ? 'toggle' : 'drag')
      if (action === 'toggle') {
        toggleFromUser()
      }
    }, true)

    handle.addEventListener('pointercancel', (event) => {
      const wasDragging = Boolean(
        pressStart?.pointerId === event.pointerId && pressStart.dragging,
      )
      pressStart = null
      if (wasDragging) return
      if (handle.hasPointerCapture?.(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId)
      }
    }, true)

    // Pointer releases above are used instead of relying on the synthetic
    // dblclick event, because the original draggable handle captures pointers.
    handle.addEventListener('dblclick', (event) => {
      event.preventDefault()
    })

    grip?.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
    })

    handle.addEventListener('keydown', (event) => {
      if (
        event.isTrusted &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)
      ) {
        markCompactDockUserMoved()
      }
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      toggleFromUser()
    })

    document.addEventListener('pointerdown', (event) => {
      if (
        event.button !== 0 ||
        isCollapsed() ||
        controls.contains(event.target)
      ) {
        outsidePressStart = null
        return
      }
      outsidePressStart = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      }
    }, true)

    document.addEventListener('pointerup', (event) => {
      if (!outsidePressStart || outsidePressStart.pointerId !== event.pointerId) {
        return
      }
      const started = outsidePressStart
      outsidePressStart = null
      const action = behavior?.resolveOutsideMixerPress?.({
        compact: compactQuery.matches,
        collapsed: isCollapsed(),
        startedInsideMixer: false,
        endedInsideMixer: controls.contains(event.target),
        travelPixels: Math.hypot(
          event.clientX - started.x,
          event.clientY - started.y,
        ),
      }) ?? 'ignore'
      if (action === 'collapse') toggle()
    }, true)

    document.addEventListener('pointercancel', (event) => {
      if (outsidePressStart?.pointerId === event.pointerId) {
        outsidePressStart = null
      }
    }, true)

    compactQuery.addEventListener?.('change', apply)
    // Chromium can resize an out-of-process iframe without dispatching the
    // MediaQueryList change event. The normal resize event keeps compact mode
    // deterministic inside Electron.
    root.addEventListener('resize', apply, { passive: true })
    root.addEventListener('message', (event) => {
      if (
        event.origin !== SHELL_ORIGIN ||
        event.data?.type !== 'quiet-route:desktop:mixer-space-ready' ||
        !isCollapsed()
      ) {
        return
      }
      toggle()
    })
    document.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || controls.contains(event.target)) return
      notifyShell('quiet-route:desktop:scene-press')
    }, true)
    apply()
  }

  function setupShellAudioBridge() {
    const masterMute = document.querySelector('#master-mute')
    if (!masterMute || root.parent === root) return

    const shellOrigin = SHELL_ORIGIN
    function publishState() {
      root.parent.postMessage({
        type: 'quiet-route:desktop:audio-state',
        muted: masterMute.getAttribute('aria-pressed') === 'true',
      }, shellOrigin)
    }

    const observer = new MutationObserver(publishState)
    observer.observe(masterMute, {
      attributes: true,
      attributeFilter: ['aria-pressed'],
    })
    root.addEventListener('message', (event) => {
      if (event.origin !== shellOrigin) return
      if (event.data?.type !== 'quiet-route:desktop:audio-command') return
      if (event.data.action === 'toggle-master') masterMute.click()
      if (event.data.action === 'get-state') publishState()
    })
    root.addEventListener('pagehide', () => observer.disconnect(), { once: true })
    publishState()
  }

  function setupRainOverlay() {
    const controller = root.QuietRouteDesktopRain?.initDesktopRainOverlay?.()
    if (!controller) return
    root.addEventListener('pagehide', () => controller.stop(), { once: true })
  }

  function setupAudioPreferences() {
    const controller = root.QuietRouteDesktopAudioPreferences
      ?.initDesktopAudioPreferences?.({
        root,
        document,
        storage: root.localStorage,
      })
    if (!controller) return
    root.addEventListener('pagehide', () => controller.dispose(), { once: true })
  }

  function init() {
    setupMasterVolume()
    setupAudioPreferences()
    setupMixerCollapse()
    setupShellAudioBridge()
    setupRainOverlay()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true })
  } else {
    init()
  }
})()
