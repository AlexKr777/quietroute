import './styles.css'

import { AmbienceEngine } from './audio/ambience-engine'
import {
  cycleMusicTrack,
  createInitialAudioState,
  setChannelVolume,
  startAudioFromGesture,
  toggleChannelMute,
  toggleMasterMute,
  type AudioChannel,
} from './audio/audio-state'
import { getMusicTrack, getMusicTrackCount } from './audio/music-library'
import { resolveMusicClick } from './audio/music-gesture'
import {
  calculateIntegerCoverLayout,
  isRenderableViewport,
} from './scene/layout'
import {
  renderPassingLight,
  renderGlassTraces,
  renderRainLayer,
} from './scene/atmosphere-renderer'
import {
  getActiveGlassTraces,
  interpolateScenePoints,
  isInsideMainWindow,
  mapViewportPointToScene,
  type ScenePoint,
  type GlassTrace,
} from './scene/glass'
import { createRainField, getRainDensity } from './scene/rain'
import { renderReferenceFrame } from './scene/reference-renderer'
import {
  easeOutCubic,
  getEntryFrame,
  getEntryMotion,
  quantizeCameraOffset,
} from './scene/timing'
import {
  clampDockPosition,
  getDefaultDockPosition,
  moveDockPosition,
  snapDockPosition,
  type Point,
} from './ui/dock-position'
import {
  getDockRevealDelay,
  shouldRequestEntryFullscreen,
} from './ui/entry-flow'

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) {
    throw new Error(`Missing required element: ${selector}`)
  }
  return element
}

function requireCanvasContext(
  canvasElement: HTMLCanvasElement,
): CanvasRenderingContext2D {
  const canvasContext = canvasElement.getContext('2d', { alpha: false })
  if (!canvasContext) {
    throw new Error('Canvas 2D is unavailable in this browser')
  }

  return canvasContext
}

const canvas = requireElement<HTMLCanvasElement>('#scene-canvas')
const sceneCamera = requireElement<HTMLElement>('#scene-camera')
const sceneShade = requireElement<HTMLElement>('.scene__shade')
const enterButton = requireElement<HTMLButtonElement>('#enter-button')
const entryPanel = requireElement<HTMLElement>('#entry-panel')
const entryNote = requireElement<HTMLElement>('#entry-note')
const soundControls = requireElement<HTMLElement>('#sound-controls')
const soundDragHandle = requireElement<HTMLButtonElement>('#sound-drag-handle')
const loadStatus = requireElement<HTMLElement>('#load-status')
const audioStatus = requireElement<HTMLElement>('#audio-status')
const masterMute = requireElement<HTMLButtonElement>('#master-mute')
const fullscreenToggle = requireElement<HTMLButtonElement>('#fullscreen-toggle')
const ambienceToggle = requireElement<HTMLButtonElement>('#ambience-toggle')
const additionalSounds = requireElement<HTMLElement>('#additional-sounds')
const audioRetry = requireElement<HTMLButtonElement>('#audio-retry')
const rainToggle = requireElement<HTMLButtonElement>('#rain-toggle')
const musicToggle = requireElement<HTMLButtonElement>('#music-toggle')
const tramToggle = requireElement<HTMLButtonElement>('#tram-toggle')
const windToggle = requireElement<HTMLButtonElement>('#wind-toggle')
const nightToggle = requireElement<HTMLButtonElement>('#night-toggle')
const birdsToggle = requireElement<HTMLButtonElement>('#birds-toggle')
const thunderToggle = requireElement<HTMLButtonElement>('#thunder-toggle')
const rainVolume = requireElement<HTMLInputElement>('#rain-volume')
const musicVolume = requireElement<HTMLInputElement>('#music-volume')
const tramVolume = requireElement<HTMLInputElement>('#tram-volume')
const windVolume = requireElement<HTMLInputElement>('#wind-volume')
const nightVolume = requireElement<HTMLInputElement>('#night-volume')
const birdsVolume = requireElement<HTMLInputElement>('#birds-volume')
const thunderVolume = requireElement<HTMLInputElement>('#thunder-volume')
const trackStatus = requireElement<HTMLElement>('#track-status')
const context = requireCanvasContext(canvas)
const desktopHosted = new URLSearchParams(window.location.search).get('desktopHost') === '1'
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
const ambience = new AmbienceEngine(
  () => changeMusicTrack(),
  () => handleBirdsongUnavailable(),
)

let audioState = createInitialAudioState()
let prefersReducedMotion = reducedMotionQuery.matches
let rainDrops = createRainField(
  2347,
  getRainDensity(prefersReducedMotion),
  { width: canvas.width, height: canvas.height },
)
let enteredAt: number | null = null
let sceneStartedAt = 0
let lastRenderedAt = Number.NEGATIVE_INFINITY
let glassTraces: GlassTrace[] = []
let tracingGlass = false
let lastGlassPoint: ScenePoint | null = null
let ambienceExpanded = true
let entryRequested = false
let musicClickTimer: number | null = null
let committedMusicPointerToggle: { mutedBefore: boolean } | null = null
let trackStatusTimer: number | null = null
let dockReleaseTimer: number | null = null
let dockRevealTimer: number | null = null
let dockPosition: Point | null = null
let dockHomePosition: Point | null = null
let dockDrag: {
  pointerId: number
  pointerOrigin: Point
  positionOrigin: Point
} | null = null

const DOCK_PADDING = 16
const DOCK_SNAP_THRESHOLD = 36
const DOCK_DRAG_SCALE = 1.012

function getDockViewportSize(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight }
}

function getDockSize(): { width: number; height: number } {
  const bounds = soundControls.getBoundingClientRect()
  const scale = soundControls.classList.contains('is-dragging')
    ? DOCK_DRAG_SCALE
    : 1
  return { width: bounds.width / scale, height: bounds.height / scale }
}

function applyDockPosition(position: Point): void {
  dockPosition = position
  soundControls.style.setProperty('--dock-x', `${position.x.toFixed(2)}px`)
  soundControls.style.setProperty('--dock-y', `${position.y.toFixed(2)}px`)
  soundControls.dataset.noticeSide = position.y <= 52 ? 'below' : 'above'
}

function initializeSoundDock(): void {
  if (dockPosition) return

  const viewport = getDockViewportSize()
  const initialDockSize = getDockSize()
  const preferredPosition = getDefaultDockPosition(
    viewport,
    initialDockSize,
    DOCK_PADDING,
  )

  soundControls.classList.add('sound-controls--positioned')
  const position = clampDockPosition(
    preferredPosition,
    viewport,
    getDockSize(),
    DOCK_PADDING,
  )
  dockHomePosition = position
  applyDockPosition(position)
}

function clearDockReleaseTimer(): void {
  if (dockReleaseTimer === null) return
  window.clearTimeout(dockReleaseTimer)
  dockReleaseTimer = null
}

function animateDockTo(position: Point): void {
  clearDockReleaseTimer()
  soundControls.classList.remove('is-dragging')
  soundControls.classList.add('is-releasing')
  applyDockPosition(position)
  dockReleaseTimer = window.setTimeout(() => {
    soundControls.classList.remove('is-releasing')
    dockReleaseTimer = null
  }, 420)
}

function reclampSoundDock(): void {
  if (!dockPosition || dockDrag) return
  const position = clampDockPosition(
    dockPosition,
    getDockViewportSize(),
    getDockSize(),
    DOCK_PADDING,
  )
  if (position.x === dockPosition.x && position.y === dockPosition.y) return
  applyDockPosition(position)
}

function fitCanvasToViewport(): void {
  const dpr = Math.max(1, window.devicePixelRatio || 1)

  // Native window-mode changes can briefly report a 0x0 viewport on Windows.
  // Keep the last valid canvas layout until the next resize frame arrives.
  if (!isRenderableViewport(window.innerWidth, window.innerHeight, dpr)) {
    return
  }

  const physicalWidth = Math.round(window.innerWidth * dpr)
  const physicalHeight = Math.round(window.innerHeight * dpr)
  const layout = calculateIntegerCoverLayout(physicalWidth, physicalHeight)

  canvas.style.width = `${layout.width / dpr}px`
  canvas.style.height = `${layout.height / dpr}px`
  canvas.style.left = `${layout.offsetX / dpr}px`
  canvas.style.top = `${layout.offsetY / dpr}px`
}

function syncAudioControls(): void {
  const controls: ReadonlyArray<[
    AudioChannel,
    HTMLButtonElement,
    HTMLInputElement,
  ]> = [
    ['rain', rainToggle, rainVolume],
    ['music', musicToggle, musicVolume],
    ['tram', tramToggle, tramVolume],
    ['wind', windToggle, windVolume],
    ['night', nightToggle, nightVolume],
    ['birds', birdsToggle, birdsVolume],
    ['thunder', thunderToggle, thunderVolume],
  ]

  for (const [channel, toggle, volume] of controls) {
    const channelState = audioState.channels[channel]
    const active = !channelState.muted
    const percentage = Math.round(channelState.volume * 100)
    toggle.ariaPressed = String(active)
    toggle.dataset.active = String(active)
    volume.value = String(percentage)
    volume.style.setProperty('--range-value', `${percentage}%`)
  }

  const track = getMusicTrack(audioState.musicTrackIndex)
  musicToggle.ariaLabel = `музыка, ${track.title}; двойное нажатие — другой трек`
  musicToggle.dataset.track = track.id
  document.body.dataset.musicTrack = track.id
  masterMute.dataset.active = String(!audioState.masterMuted)
  masterMute.ariaPressed = String(audioState.masterMuted)
  masterMute.textContent = audioState.masterMuted ? 'вернуть звук' : 'тишина'
  ambience.applyState(audioState)
}

function handleBirdsongUnavailable(): void {
  if (!audioState.channels.birds.muted) {
    audioState = toggleChannelMute(audioState, 'birds')
    syncAudioControls()
  }
  audioStatus.textContent = 'пение птиц сейчас недоступно'
}

function clearMusicClickTimer(): void {
  if (musicClickTimer === null) return
  window.clearTimeout(musicClickTimer)
  musicClickTimer = null
}

function showTrackStatus(): void {
  const track = getMusicTrack(audioState.musicTrackIndex)
  trackStatus.textContent = `трек · ${track.title}`
  soundControls.dataset.trackNotice = 'true'

  if (trackStatusTimer !== null) window.clearTimeout(trackStatusTimer)
  trackStatusTimer = window.setTimeout(() => {
    delete soundControls.dataset.trackNotice
    trackStatusTimer = null
  }, 1700)
}

function changeMusicTrack(direction = 1): void {
  audioState = cycleMusicTrack(
    audioState,
    getMusicTrackCount(),
    direction,
  )
  syncAudioControls()
  showTrackStatus()
}

function setAmbienceExpanded(expanded: boolean): void {
  ambienceExpanded = expanded
  ambienceToggle.ariaExpanded = String(expanded)
  ambienceToggle.textContent = expanded ? 'скрыть' : 'ещё'
  additionalSounds.inert = !expanded
  additionalSounds.setAttribute('aria-hidden', String(!expanded))
  soundControls.dataset.expanded = String(expanded)
}

function syncFullscreenControl(): void {
  const isFullscreen = document.fullscreenElement !== null
  const compactLabel = window.innerWidth <= 390
  fullscreenToggle.hidden = desktopHosted || !document.fullscreenEnabled
  fullscreenToggle.ariaPressed = String(isFullscreen)
  fullscreenToggle.ariaLabel = isFullscreen
    ? 'выйти из полного экрана'
    : 'полный экран'
  fullscreenToggle.textContent = isFullscreen
    ? 'выйти'
    : compactLabel
      ? 'экран'
      : 'полный экран'
}

async function attemptAudioStart(): Promise<void> {
  audioRetry.hidden = true
  try {
    await ambience.start(audioState)
    document.body.dataset.audioState = ambience.status
    audioStatus.textContent = 'дождь, музыка и трамвай звучат'
  } catch {
    document.body.dataset.audioState = 'error'
    audioStatus.textContent = 'браузер не смог включить звук'
    audioRetry.hidden = false
  }
}

function clearDockRevealTimer(): void {
  if (dockRevealTimer === null) return
  window.clearTimeout(dockRevealTimer)
  dockRevealTimer = null
}

function revealSoundDock(): void {
  initializeSoundDock()
  soundControls.inert = false
  soundControls.removeAttribute('aria-hidden')
  document.body.dataset.dockReady = 'true'
}

function scheduleSoundDockReveal(): void {
  clearDockRevealTimer()
  dockRevealTimer = window.setTimeout(() => {
    dockRevealTimer = null
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(revealSoundDock)
    })
  }, getDockRevealDelay(prefersReducedMotion))
}

function beginEntryMotion(): void {
  if (enteredAt !== null) return

  enteredAt = performance.now()
  document.body.dataset.entered = 'true'
  document.body.dataset.cameraMoving = 'true'
  loadStatus.textContent = 'вы у окна'
  scheduleSoundDockReveal()
}

function beginEntryAfterViewportSettles(): void {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(beginEntryMotion)
  })
}

function requestEntryFullscreen(): Promise<void> | null {
  if (!shouldRequestEntryFullscreen({
    fullscreenEnabled: document.fullscreenEnabled,
    hasFullscreenElement: document.fullscreenElement !== null,
    viewportWidth: window.innerWidth,
    desktopHosted,
  })) {
    return null
  }

  try {
    return document.documentElement.requestFullscreen()
  } catch {
    return null
  }
}

function addGlassTrace(event: PointerEvent): void {
  if (enteredAt === null) return

  const point = mapViewportPointToScene(
    event.clientX,
    event.clientY,
    canvas.getBoundingClientRect(),
  )
  if (!isInsideMainWindow(point)) return

  if (lastGlassPoint && Math.hypot(point.x - lastGlassPoint.x, point.y - lastGlassPoint.y) < 1) {
    return
  }

  const createdAt = Math.max(0, performance.now() - sceneStartedAt)
  const points = lastGlassPoint
    ? interpolateScenePoints(lastGlassPoint, point, 2).slice(1)
    : [point]

  glassTraces.push(...points.map((tracePoint) => ({
    ...tracePoint,
    createdAt,
  })))
  glassTraces = glassTraces.slice(-120)
  lastGlassPoint = point
}

function bindChannelControls(
  channel: AudioChannel,
  toggle: HTMLButtonElement,
  volume: HTMLInputElement,
): void {
  toggle.addEventListener('click', () => {
    audioState = toggleChannelMute(audioState, channel)
    syncAudioControls()
  })

  volume.addEventListener('input', () => {
    audioState = setChannelVolume(audioState, channel, Number(volume.value) / 100)
    syncAudioControls()
  })
}

function bindVolumeControl(
  channel: AudioChannel,
  volume: HTMLInputElement,
): void {
  volume.addEventListener('input', () => {
    audioState = setChannelVolume(audioState, channel, Number(volume.value) / 100)
    syncAudioControls()
  })
}

function finishDockDrag(event: PointerEvent, shouldSnap: boolean): void {
  const activeDrag = dockDrag
  if (
    !activeDrag ||
    activeDrag.pointerId !== event.pointerId ||
    !dockPosition
  ) {
    return
  }

  dockDrag = null
  if (soundDragHandle.hasPointerCapture(event.pointerId)) {
    soundDragHandle.releasePointerCapture(event.pointerId)
  }

  const position = shouldSnap
    ? snapDockPosition(
        dockPosition,
        getDockViewportSize(),
        getDockSize(),
        DOCK_SNAP_THRESHOLD,
        DOCK_PADDING,
      )
    : dockPosition
  animateDockTo(position)
}

function renderScene(timestamp: number): void {
  const sceneElapsed = Math.max(0, timestamp - sceneStartedAt)
  const entryElapsed = enteredAt === null ? 0 : Math.max(0, timestamp - enteredAt)
  const enteredIntensity = enteredAt === null
    ? 0.26
    : 0.26 + easeOutCubic(Math.min(1, entryElapsed / 850)) * 0.74

  renderReferenceFrame(context, referenceImage)
  if (!prefersReducedMotion) {
    renderPassingLight(context, sceneElapsed, enteredIntensity)
  }
  glassTraces = getActiveGlassTraces(glassTraces, sceneElapsed, 4200)
  renderGlassTraces(context, glassTraces, sceneElapsed)
  renderRainLayer(
    context,
    rainDrops,
    sceneElapsed,
    enteredIntensity,
    glassTraces,
  )

  if (
    enteredAt !== null &&
    timestamp - enteredAt >= getEntryMotion(prefersReducedMotion).durationMs
  ) {
    document.body.dataset.entrySettled = 'true'
  }
}

function updateEntryCamera(timestamp: number): void {
  const motion = getEntryMotion(prefersReducedMotion)
  const elapsed = enteredAt === null ? 0 : Math.max(0, timestamp - enteredAt)
  const frame = getEntryFrame(elapsed, prefersReducedMotion)

  if (enteredAt !== null && elapsed >= motion.durationMs) {
    sceneCamera.style.removeProperty('transform')
    sceneShade.style.removeProperty('--sit-shade')
    delete document.body.dataset.cameraMoving
    return
  }

  const dpr = Math.max(1, window.devicePixelRatio || 1)
  const x = quantizeCameraOffset(frame.x, dpr)
  const y = quantizeCameraOffset(frame.y, dpr)
  sceneCamera.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${frame.scale.toFixed(5)})`
  sceneShade.style.setProperty('--sit-shade', String(frame.shade))
}

function animate(timestamp: number): void {
  window.requestAnimationFrame(animate)
  updateEntryCamera(timestamp)

  const minimumFrameDuration = prefersReducedMotion ? 1000 / 12 : 1000 / 30
  if (timestamp - lastRenderedAt < minimumFrameDuration) return

  lastRenderedAt = timestamp
  renderScene(timestamp)
}

const referenceImage = new Image()
referenceImage.decoding = 'async'
referenceImage.src = '/assets/tram-reference-gentle-rain.png'
referenceImage.addEventListener('load', () => {
  sceneStartedAt = performance.now()
  updateEntryCamera(sceneStartedAt)
  renderScene(sceneStartedAt)
  window.requestAnimationFrame(animate)
  loadStatus.textContent = 'окно готово'
  document.body.dataset.sceneReady = 'true'
})
referenceImage.addEventListener('error', () => {
  loadStatus.textContent = 'не удалось открыть окно'
})

enterButton.addEventListener('click', () => {
  if (entryRequested) return

  entryRequested = true
  document.body.dataset.entryRequested = 'true'
  entryPanel.inert = true
  entryPanel.setAttribute('aria-hidden', 'true')

  const fullscreenRequest = requestEntryFullscreen()

  audioState = startAudioFromGesture(audioState)
  syncAudioControls()
  void attemptAudioStart()

  if (fullscreenRequest) {
    void fullscreenRequest
      .catch(() => undefined)
      .finally(beginEntryAfterViewportSettles)
  } else {
    beginEntryAfterViewportSettles()
  }
})

masterMute.addEventListener('click', () => {
  audioState = toggleMasterMute(audioState)
  syncAudioControls()
})

ambienceToggle.addEventListener('click', () => {
  setAmbienceExpanded(!ambienceExpanded)
})

soundDragHandle.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  initializeSoundDock()
  if (!dockPosition) return

  clearDockReleaseTimer()
  soundControls.classList.remove('is-releasing')
  soundControls.classList.add('is-dragging')
  dockDrag = {
    pointerId: event.pointerId,
    pointerOrigin: { x: event.clientX, y: event.clientY },
    positionOrigin: dockPosition,
  }
  soundDragHandle.setPointerCapture(event.pointerId)
  event.preventDefault()
})

soundDragHandle.addEventListener('pointermove', (event) => {
  if (!dockDrag || dockDrag.pointerId !== event.pointerId) return

  const position = moveDockPosition(
    dockDrag.positionOrigin,
    {
      x: event.clientX - dockDrag.pointerOrigin.x,
      y: event.clientY - dockDrag.pointerOrigin.y,
    },
    getDockViewportSize(),
    getDockSize(),
    DOCK_PADDING,
  )
  applyDockPosition(position)
})

soundDragHandle.addEventListener('pointerup', (event) => {
  finishDockDrag(event, true)
})

soundDragHandle.addEventListener('pointercancel', (event) => {
  finishDockDrag(event, false)
})

soundDragHandle.addEventListener('lostpointercapture', (event) => {
  finishDockDrag(event, false)
})

soundDragHandle.addEventListener('keydown', (event) => {
  initializeSoundDock()
  if (!dockPosition) return

  if (event.key === 'Escape') {
    event.preventDefault()
    const homePosition = clampDockPosition(
      dockHomePosition ?? dockPosition,
      getDockViewportSize(),
      getDockSize(),
      DOCK_PADDING,
    )
    animateDockTo(homePosition)
    return
  }

  const step = event.shiftKey ? 48 : 12
  const deltas: Partial<Record<string, Point>> = {
    ArrowUp: { x: 0, y: -step },
    ArrowDown: { x: 0, y: step },
    ArrowLeft: { x: -step, y: 0 },
    ArrowRight: { x: step, y: 0 },
  }
  const delta = deltas[event.key]
  if (!delta) return

  event.preventDefault()
  animateDockTo(
    moveDockPosition(
      dockPosition,
      delta,
      getDockViewportSize(),
      getDockSize(),
      DOCK_PADDING,
    ),
  )
})

musicToggle.addEventListener('click', (event) => {
  const action = resolveMusicClick(
    event.detail,
    musicClickTimer !== null,
    committedMusicPointerToggle !== null,
  )

  if (action === 'restore-and-cycle-track') {
    clearMusicClickTimer()
    const committedToggle = committedMusicPointerToggle
    committedMusicPointerToggle = null
    if (
      committedToggle &&
      audioState.channels.music.muted !== committedToggle.mutedBefore
    ) {
      audioState = toggleChannelMute(audioState, 'music')
    }
    changeMusicTrack()
    return
  }

  if (action === 'cycle-track') {
    clearMusicClickTimer()
    committedMusicPointerToggle = null
    changeMusicTrack()
    return
  }

  if (action === 'toggle-now') {
    committedMusicPointerToggle = null
    audioState = toggleChannelMute(audioState, 'music')
    syncAudioControls()
    return
  }

  committedMusicPointerToggle = null
  musicClickTimer = window.setTimeout(() => {
    musicClickTimer = null
    committedMusicPointerToggle = {
      mutedBefore: audioState.channels.music.muted,
    }
    audioState = toggleChannelMute(audioState, 'music')
    syncAudioControls()
  }, 300)
})

musicToggle.addEventListener('dblclick', (event) => {
  event.preventDefault()
})

musicToggle.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
  event.preventDefault()
  clearMusicClickTimer()
  committedMusicPointerToggle = null
  changeMusicTrack(event.key === 'ArrowLeft' ? -1 : 1)
})

audioRetry.addEventListener('click', () => {
  void attemptAudioStart()
})

fullscreenToggle.addEventListener('click', () => {
  const fullscreenAction = document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen()
  void fullscreenAction.catch(() => {
    audioStatus.textContent = 'полный экран недоступен'
  })
})

document.addEventListener('fullscreenchange', () => {
  syncFullscreenControl()
  window.requestAnimationFrame(reclampSoundDock)
})

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    void ambience.suspend().then(() => {
      document.body.dataset.audioState = ambience.status
    })
  } else if (audioState.started) {
    void attemptAudioStart()
  }
})

window.addEventListener('pagehide', (event) => {
  if (event.persisted) return
  clearMusicClickTimer()
  committedMusicPointerToggle = null
  if (trackStatusTimer !== null) window.clearTimeout(trackStatusTimer)
  clearDockReleaseTimer()
  clearDockRevealTimer()
  dockResizeObserver.disconnect()
  ambience.dispose()
})

canvas.addEventListener('pointerdown', (event) => {
  if (enteredAt === null) return
  tracingGlass = true
  lastGlassPoint = null
  canvas.setPointerCapture(event.pointerId)
  addGlassTrace(event)
})

canvas.addEventListener('pointermove', (event) => {
  if (tracingGlass) addGlassTrace(event)
})

canvas.addEventListener('pointerup', () => {
  tracingGlass = false
  lastGlassPoint = null
})

canvas.addEventListener('pointercancel', () => {
  tracingGlass = false
  lastGlassPoint = null
})

bindChannelControls('rain', rainToggle, rainVolume)
bindChannelControls('tram', tramToggle, tramVolume)
bindChannelControls('wind', windToggle, windVolume)
bindChannelControls('night', nightToggle, nightVolume)
bindChannelControls('birds', birdsToggle, birdsVolume)
bindChannelControls('thunder', thunderToggle, thunderVolume)
bindVolumeControl('music', musicVolume)
if (desktopHosted) {
  document.body.dataset.desktopHost = 'true'
  entryNote.textContent = 'звук включится после посадки'
}
setAmbienceExpanded(true)
syncAudioControls()
syncFullscreenControl()

reducedMotionQuery.addEventListener('change', (event) => {
  prefersReducedMotion = event.matches
  rainDrops = createRainField(
    2347,
    getRainDensity(prefersReducedMotion),
    { width: canvas.width, height: canvas.height },
  )
  updateEntryCamera(performance.now())
})

fitCanvasToViewport()
window.addEventListener('resize', fitCanvasToViewport, { passive: true })
window.addEventListener('resize', syncFullscreenControl, { passive: true })
window.addEventListener('resize', () => {
  window.requestAnimationFrame(reclampSoundDock)
}, { passive: true })

const dockResizeObserver = new ResizeObserver(() => {
  window.requestAnimationFrame(reclampSoundDock)
})
dockResizeObserver.observe(soundControls)
