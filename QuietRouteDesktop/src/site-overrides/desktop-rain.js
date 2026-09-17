(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) {
    module.exports = api
  }
  root.QuietRouteDesktopRain = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  const STAGE_WIDTH = 640
  const STAGE_HEIGHT = 360
  const FRAME_INTERVAL_MS = 1000 / 30
  const WINDOW_CLIP_PATH = [
    '0 0',
    '77.66% 0',
    '77.5% 58.89%',
    '76.56% 66.11%',
    '74.38% 69.72%',
    '4.38% 88.33%',
    '0 84.17%',
  ].join(', ')

  function clamp01(value) {
    if (!Number.isFinite(value)) return 0
    return Math.min(1, Math.max(0, value))
  }

  function normalizeRangeValue(value, maximum = 100) {
    const numericValue = Number(value)
    const numericMaximum = Number(maximum)
    if (!Number.isFinite(numericValue) || !Number.isFinite(numericMaximum)) {
      return 0
    }
    if (numericMaximum <= 0) return 0
    return clamp01(numericValue / numericMaximum)
  }

  function createSeededRandom(seed) {
    let state = (seed >>> 0) || 1
    return function random() {
      state = (state * 1664525 + 1013904223) >>> 0
      return state / 4294967296
    }
  }

  function getRainDensity({ active, volume, reducedMotion }) {
    if (!active) return 0
    const gain = clamp01(volume)
    if (gain <= 0) return 0
    const density = 0.22 + gain * 0.58
    return reducedMotion ? Math.max(0.18, density * 0.42) : Math.min(0.82, density)
  }

  function getRainVisualProfile({ density, compact, reducedMotion }) {
    const d = clamp01(density)
    const motionStrength = reducedMotion ? d * 0.48 : d
    const compactBoost = compact ? (reducedMotion ? 1.14 : 1.26) : 1

    return {
      visualStrength: Math.min(1, motionStrength * compactBoost),
      overlayOpacity: compact ? 0.84 : 0.72,
      lineWidthScale: compact ? 1.18 : 1,
      beadScale: compact ? 1.12 : 1,
    }
  }

  function between(random, min, max) {
    return min + random() * (max - min)
  }

  function createRainParticles({ width, height, density, seed }) {
    const random = createSeededRandom(seed)
    const d = clamp01(density)
    const streakCount = Math.round(32 + d * 50)
    const beadCount = Math.round(8 + d * 18)
    const impactCount = Math.round(3 + d * 8)
    const streaks = []
    const beads = []
    const impacts = []

    for (let index = 0; index < streakCount; index += 1) {
      streaks.push({
        x: between(random, -16, width + 16),
        y: between(random, -32, height + 32),
        length: between(random, 7, 20),
        speed: between(random, 18, 64),
        drift: between(random, -7, -1.2),
        alpha: between(random, 0.16, 0.46),
      })
    }

    for (let index = 0; index < beadCount; index += 1) {
      beads.push({
        x: between(random, 0, width),
        y: between(random, 0, height),
        radius: between(random, 0.7, 2.1),
        wait: between(random, 0.6, 4.8),
        age: between(random, 0, 4.8),
        slideSpeed: between(random, 1.2, 8.5),
        alpha: between(random, 0.12, 0.34),
      })
    }

    for (let index = 0; index < impactCount; index += 1) {
      impacts.push({
        x: between(random, 4, width - 4),
        y: between(random, 4, height - 4),
        age: between(random, 0, 1.8),
        interval: between(random, 1.4, 5.8),
        alpha: between(random, 0.06, 0.16),
      })
    }

    return { streaks, beads, impacts }
  }

  function stepRainParticles(
    particles,
    { width, height, deltaSeconds, density, random, reducedMotion },
  ) {
    if (reducedMotion) return particles
    const dt = Math.min(0.05, Math.max(0, deltaSeconds))
    const d = clamp01(density)

    for (const streak of particles.streaks) {
      streak.y += streak.speed * dt * (0.65 + d * 0.55)
      streak.x += streak.drift * dt

      if (streak.y > height + 32 || streak.x < -16) {
        streak.x = random() * (width + 32) - 16
        streak.y = -32 - random() * 26
      }
    }

    for (const bead of particles.beads) {
      bead.age += dt
      if (bead.age >= bead.wait) {
        bead.y += bead.slideSpeed * dt
        bead.x -= 0.3 * dt
      }
      if (bead.y > height + 8) {
        bead.x = random() * width
        bead.y = random() * height * 0.68
        bead.age = 0
        bead.wait = 0.6 + random() * 4.2
      }
    }

    for (const impact of particles.impacts) {
      impact.age += dt
      if (impact.age >= impact.interval) {
        impact.x = 4 + random() * (width - 8)
        impact.y = 4 + random() * (height - 8)
        impact.age = 0
        impact.interval = 1.4 + random() * 5.8
      }
    }

    return particles
  }

  function drawRain(
    ctx,
    particles,
    { width, height, density, reducedMotion, compact = false },
  ) {
    ctx.clearRect(0, 0, width, height)

    if (density <= 0) return

    const profile = getRainVisualProfile({ density, compact, reducedMotion })
    const visualStrength = profile.visualStrength
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (const streak of particles.streaks) {
      const alpha = streak.alpha * visualStrength
      const endX = streak.x + streak.drift * 0.75
      const endY = streak.y + streak.length
      ctx.strokeStyle = `rgba(178, 204, 218, ${alpha})`
      ctx.lineWidth = (streak.length > 15 ? 0.95 : 0.72) * profile.lineWidthScale
      ctx.beginPath()
      ctx.moveTo(streak.x, streak.y)
      ctx.lineTo(endX, endY)
      ctx.stroke()

      ctx.strokeStyle = `rgba(23, 34, 47, ${0.09 * visualStrength})`
      ctx.lineWidth = 0.7 * profile.lineWidthScale
      ctx.beginPath()
      ctx.moveTo(streak.x + 1, streak.y)
      ctx.lineTo(endX + 1, endY)
      ctx.stroke()
    }

    for (const bead of particles.beads) {
      const alpha = bead.alpha * visualStrength
      if (bead.age >= bead.wait) {
        const trailLength = Math.min(9, 1.5 + bead.slideSpeed * 0.7)
        ctx.strokeStyle = `rgba(154, 184, 201, ${0.12 * visualStrength})`
        ctx.lineWidth = 0.62 * profile.lineWidthScale
        ctx.beginPath()
        ctx.moveTo(bead.x + 0.2, bead.y - trailLength)
        ctx.lineTo(bead.x, bead.y)
        ctx.stroke()
      }
      ctx.fillStyle = `rgba(166, 193, 207, ${alpha})`
      ctx.beginPath()
      ctx.ellipse(
        bead.x,
        bead.y,
        bead.radius * 0.72 * profile.beadScale,
        bead.radius * 1.16 * profile.beadScale,
        0.08,
        0,
        Math.PI * 2,
      )
      ctx.fill()

      ctx.fillStyle = `rgba(232, 241, 246, ${0.18 * visualStrength})`
      ctx.fillRect(Math.round(bead.x - bead.radius * 0.25), Math.round(bead.y - bead.radius * 0.35), 1, 1)
    }

    for (const impact of particles.impacts) {
      const progress = Math.min(1, impact.age / 0.7)
      if (progress >= 1) continue
      ctx.strokeStyle = `rgba(188, 214, 225, ${(1 - progress) * impact.alpha * visualStrength})`
      ctx.lineWidth = 0.7 * profile.lineWidthScale
      ctx.beginPath()
      ctx.arc(impact.x, impact.y, 1.2 + progress * 3.6, 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.restore()
  }

  function readRainControls(documentRef, reducedMotion) {
    const toggle = documentRef.querySelector('#rain-toggle')
    const slider = documentRef.querySelector('#rain-volume')
    const active = toggle
      ? toggle.dataset.active !== 'false' && toggle.getAttribute('aria-pressed') !== 'false'
      : true
    const volume = slider
      ? normalizeRangeValue(slider.value, slider.max || 100)
      : 0.72

    return {
      active,
      volume,
      reducedMotion,
    }
  }

  function syncCanvasLayout(source, overlay) {
    overlay.style.width = source.style.width || '100%'
    overlay.style.height = source.style.height || '100%'
    overlay.style.left = source.style.left || '0'
    overlay.style.top = source.style.top || '0'
    overlay.style.transform = source.style.transform || ''
  }

  function initDesktopRainOverlay(options = {}) {
    const documentRef = options.document || (typeof document !== 'undefined' ? document : null)
    const windowRef = options.window || (typeof window !== 'undefined' ? window : null)
    if (!documentRef || !windowRef) return null

    const source = documentRef.querySelector(options.sourceSelector || '#scene-canvas')
    if (!source || !source.insertAdjacentElement) return null

    const existing = documentRef.querySelector('[data-desktop-rain-overlay="true"]')
    if (existing && existing.__quietRouteDesktopRainController) {
      return existing.__quietRouteDesktopRainController
    }

    const overlay = documentRef.createElement('canvas')
    overlay.width = STAGE_WIDTH
    overlay.height = STAGE_HEIGHT
    overlay.setAttribute('aria-hidden', 'true')
    overlay.setAttribute('data-desktop-rain-overlay', 'true')
    overlay.dataset.desktopRainOverlay = 'true'
    overlay.style.position = 'absolute'
    overlay.style.inset = '0 auto auto 0'
    overlay.style.pointerEvents = 'none'
    overlay.style.imageRendering = 'pixelated'
    overlay.style.mixBlendMode = 'screen'
    overlay.style.opacity = '0.72'
    overlay.style.zIndex = '1'
    overlay.style.clipPath = `polygon(${WINDOW_CLIP_PATH})`
    syncCanvasLayout(source, overlay)
    source.insertAdjacentElement('afterend', overlay)

    const ctx = overlay.getContext && overlay.getContext('2d')
    if (!ctx) {
      return {
        canvas: overlay,
        stop() {
          if (overlay.remove) overlay.remove()
        },
      }
    }

    const motionQuery = windowRef.matchMedia
      ? windowRef.matchMedia('(prefers-reduced-motion: reduce)')
      : { matches: false, addEventListener() {}, removeEventListener() {} }
    const random = createSeededRandom(options.seed || 2347)
    let particles = createRainParticles({
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      density: motionQuery.matches ? 0.24 : 0.72,
      seed: options.seed || 2347,
    })
    let frameId = 0
    let lastTimestamp = 0
    let lastPaint = 0
    let stopped = false

    function syncLayout() {
      syncCanvasLayout(source, overlay)
      const compact = Number.isFinite(Number(windowRef.innerWidth))
        && Number(windowRef.innerWidth) <= 520
      const profile = getRainVisualProfile({
        density: 1,
        compact,
        reducedMotion: motionQuery.matches,
      })
      overlay.style.opacity = String(profile.overlayOpacity)
    }

    function paint(timestamp) {
      if (stopped) return

      if (!documentRef.hidden && (lastPaint === 0 || timestamp - lastPaint >= FRAME_INTERVAL_MS)) {
        const state = readRainControls(documentRef, motionQuery.matches)
        const density = getRainDensity(state)
        const deltaSeconds = lastTimestamp > 0 ? (timestamp - lastTimestamp) / 1000 : 1 / 30
        stepRainParticles(particles, {
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          deltaSeconds,
          density,
          random,
          reducedMotion: motionQuery.matches,
        })
        drawRain(ctx, particles, {
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          density,
          reducedMotion: motionQuery.matches,
          compact: Number.isFinite(Number(windowRef.innerWidth))
            && Number(windowRef.innerWidth) <= 520,
        })
        lastTimestamp = timestamp
        lastPaint = timestamp
      }

      frameId = windowRef.requestAnimationFrame(paint)
    }

    function rebuildForMotionPreference() {
      particles = createRainParticles({
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
        density: motionQuery.matches ? 0.24 : 0.72,
        seed: options.seed || 2347,
      })
      lastTimestamp = 0
      lastPaint = 0
      syncLayout()
    }

    const MutationObserverCtor =
      windowRef.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null)
    const observer = MutationObserverCtor
      ? new MutationObserverCtor(syncLayout)
      : null
    if (observer) {
      observer.observe(source, { attributes: true, attributeFilter: ['style', 'width', 'height'] })
    }

    syncLayout()
    windowRef.addEventListener('resize', syncLayout)
    if (motionQuery.addEventListener) {
      motionQuery.addEventListener('change', rebuildForMotionPreference)
    }

    frameId = windowRef.requestAnimationFrame(paint)

    const controller = {
      canvas: overlay,
      stop() {
        stopped = true
        if (frameId) windowRef.cancelAnimationFrame(frameId)
        if (observer) observer.disconnect()
        windowRef.removeEventListener('resize', syncLayout)
        if (motionQuery.removeEventListener) {
          motionQuery.removeEventListener('change', rebuildForMotionPreference)
        }
        if (overlay.remove) overlay.remove()
      },
    }

    overlay.__quietRouteDesktopRainController = controller
    return controller
  }

  return {
    STAGE_WIDTH,
    STAGE_HEIGHT,
    clamp01,
    normalizeRangeValue,
    createSeededRandom,
    getRainDensity,
    getRainVisualProfile,
    createRainParticles,
    stepRainParticles,
    drawRain,
    initDesktopRainOverlay,
  }
})
