const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  clamp01,
  createSeededRandom,
  getRainDensity,
  getRainVisualProfile,
  createRainParticles,
  stepRainParticles,
  initDesktopRainOverlay,
  normalizeRangeValue,
} = require('../src/site-overrides/desktop-rain.js')

test('getRainDensity keeps app rain noticeable but bounded', () => {
  assert.equal(getRainDensity({ active: false, volume: 1, reducedMotion: false }), 0)
  assert.equal(getRainDensity({ active: true, volume: 0, reducedMotion: false }), 0)

  const soft = getRainDensity({ active: true, volume: 0.35, reducedMotion: false })
  const full = getRainDensity({ active: true, volume: 1, reducedMotion: false })
  const reduced = getRainDensity({ active: true, volume: 1, reducedMotion: true })

  assert.ok(soft > 0.28 && soft < 0.5)
  assert.ok(full <= 0.82)
  assert.ok(full > soft)
  assert.ok(reduced < full)
  assert.ok(reduced >= 0.18)
})

test('compact rain gains legibility without exceeding a calm visual ceiling', () => {
  const normal = getRainVisualProfile({
    density: 0.48,
    compact: false,
    reducedMotion: false,
  })
  const compact = getRainVisualProfile({
    density: 0.48,
    compact: true,
    reducedMotion: false,
  })
  const compactReduced = getRainVisualProfile({
    density: 0.48,
    compact: true,
    reducedMotion: true,
  })

  assert.equal(normal.overlayOpacity, 0.72)
  assert.equal(compact.overlayOpacity, 0.84)
  assert.ok(compact.visualStrength > normal.visualStrength)
  assert.ok(compact.visualStrength <= 1)
  assert.ok(compact.lineWidthScale > 1 && compact.lineWidthScale <= 1.2)
  assert.ok(compact.beadScale > 1 && compact.beadScale <= 1.15)
  assert.ok(compactReduced.visualStrength < compact.visualStrength)
  assert.ok(compactReduced.visualStrength > 0)
})

test('createRainParticles is deterministic and stays inside a 640x360 stage budget', () => {
  const first = createRainParticles({ width: 640, height: 360, density: 0.72, seed: 2347 })
  const second = createRainParticles({ width: 640, height: 360, density: 0.72, seed: 2347 })

  assert.deepEqual(first.streaks.slice(0, 8), second.streaks.slice(0, 8))
  assert.deepEqual(first.beads.slice(0, 8), second.beads.slice(0, 8))
  assert.deepEqual(first.impacts.slice(0, 8), second.impacts.slice(0, 8))

  assert.ok(first.streaks.length >= 32 && first.streaks.length <= 72)
  assert.ok(first.streaks.length > first.beads.length * 2)
  assert.ok(first.beads.length >= 12 && first.beads.length <= 24)
  assert.ok(first.impacts.length >= 4 && first.impacts.length <= 10)

  for (const streak of first.streaks) {
    assert.ok(streak.x >= -16 && streak.x <= 656)
    assert.ok(streak.y >= -32 && streak.y <= 392)
    assert.ok(streak.length >= 7 && streak.length <= 20)
    assert.ok(streak.alpha >= 0.16 && streak.alpha <= 0.46)
    assert.ok(streak.speed >= 18 && streak.speed <= 64)
  }

  for (const bead of first.beads) {
    assert.ok(bead.x >= 0 && bead.x <= 640)
    assert.ok(bead.y >= 0 && bead.y <= 360)
    assert.ok(bead.radius >= 0.7 && bead.radius <= 2.4)
    assert.ok(bead.wait >= 0.6 && bead.wait <= 4.8)
    assert.ok(bead.slideSpeed >= 1.2 && bead.slideSpeed <= 8.5)
  }
})

test('stepRainParticles advances gently, wraps particles, and honors reduced motion', () => {
  const particles = createRainParticles({ width: 640, height: 360, density: 0.8, seed: 47 })
  const before = structuredClone(particles)
  const random = createSeededRandom(47)

  stepRainParticles(particles, { width: 640, height: 360, deltaSeconds: 1 / 30, density: 0.8, random, reducedMotion: false })

  assert.notDeepEqual(particles.streaks[0], before.streaks[0])
  assert.ok(particles.streaks.every((streak) => streak.y <= 392 && streak.x <= 656))

  const reduced = structuredClone(before)
  stepRainParticles(reduced, { width: 640, height: 360, deltaSeconds: 1, density: 0.8, random, reducedMotion: true })

  assert.deepEqual(reduced, before)
})

test('clamp01 sanitizes volume-like values', () => {
  assert.equal(clamp01(-2), 0)
  assert.equal(clamp01(2), 1)
  assert.equal(clamp01(Number.NaN), 0)
  assert.equal(clamp01(0.42), 0.42)
})

test('normalizeRangeValue converts the real 0–100 rain slider to 0–1', () => {
  assert.equal(normalizeRangeValue('44', '100'), 0.44)
  assert.equal(normalizeRangeValue('18', '100'), 0.18)
  assert.equal(normalizeRangeValue('0.65', '1'), 0.65)
})

test('initDesktopRainOverlay inserts and runs a controlled app-only canvas overlay', () => {
  const calls = []
  const resizeListeners = []
  const motionListeners = []
  const rafCallbacks = []
  let observedTarget = null
  let observerDisconnected = false

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback
    }

    observe(target) {
      observedTarget = target
    }

    disconnect() {
      observerDisconnected = true
    }
  }

  function createElement(tagName) {
    const element = {
      tagName,
      style: {},
      dataset: {},
      attributes: {},
      children: [],
      removed: false,
      setAttribute(name, value) {
        this.attributes[name] = String(value)
        if (name === 'data-desktop-rain-overlay') {
          this.dataset.desktopRainOverlay = String(value)
        }
      },
      getAttribute(name) {
        return this.attributes[name]
      },
      remove() {
        this.removed = true
      },
    }

    if (tagName === 'canvas') {
      element.getContext = () => ({
        clearRect: (...args) => calls.push(['clearRect', ...args]),
        save: () => calls.push(['save']),
        restore: () => calls.push(['restore']),
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        ellipse: () => {},
        fill: () => {},
        fillRect: () => {},
        arc: () => {},
        set globalCompositeOperation(value) {
          calls.push(['globalCompositeOperation', value])
        },
        set lineCap(value) {
          calls.push(['lineCap', value])
        },
        set lineJoin(value) {
          calls.push(['lineJoin', value])
        },
        set strokeStyle(value) {
          this._strokeStyle = value
        },
        set fillStyle(value) {
          this._fillStyle = value
        },
        set lineWidth(value) {
          this._lineWidth = value
        },
      })
    }

    return element
  }

  const overlayRegistry = []
  const source = createElement('canvas')
  source.style.width = '480px'
  source.style.height = '270px'
  source.style.left = '8px'
  source.style.top = '16px'
  source.insertAdjacentElement = (position, element) => {
    assert.equal(position, 'afterend')
    overlayRegistry.push(element)
  }

  const rainToggle = createElement('button')
  rainToggle.dataset.active = 'true'
  rainToggle.attributes['aria-pressed'] = 'true'
  const rainVolume = createElement('input')
  rainVolume.value = '0.65'

  const documentRef = {
    hidden: false,
    createElement,
    querySelector(selector) {
      if (selector === '#scene-canvas') return source
      if (selector === '#rain-toggle') return rainToggle
      if (selector === '#rain-volume') return rainVolume
      if (selector === '[data-desktop-rain-overlay="true"]') return overlayRegistry[0] || null
      return null
    },
  }

  const windowRef = {
    innerWidth: 478,
    MutationObserver: FakeMutationObserver,
    matchMedia(query) {
      assert.equal(query, '(prefers-reduced-motion: reduce)')
      return {
        matches: false,
        addEventListener(event, listener) {
          motionListeners.push([event, listener])
        },
        removeEventListener(event, listener) {
          const index = motionListeners.findIndex((entry) => entry[0] === event && entry[1] === listener)
          if (index >= 0) motionListeners.splice(index, 1)
        },
      }
    },
    requestAnimationFrame(callback) {
      rafCallbacks.push(callback)
      return rafCallbacks.length
    },
    cancelAnimationFrame(id) {
      calls.push(['cancelAnimationFrame', id])
    },
    addEventListener(event, listener) {
      resizeListeners.push([event, listener])
    },
    removeEventListener(event, listener) {
      const index = resizeListeners.findIndex((entry) => entry[0] === event && entry[1] === listener)
      if (index >= 0) resizeListeners.splice(index, 1)
    },
  }

  const controller = initDesktopRainOverlay({ document: documentRef, window: windowRef, seed: 123 })

  assert.ok(controller)
  assert.equal(overlayRegistry.length, 1)
  assert.equal(controller.canvas.width, 640)
  assert.equal(controller.canvas.height, 360)
  assert.equal(controller.canvas.style.pointerEvents, 'none')
  assert.equal(controller.canvas.style.imageRendering, 'pixelated')
  assert.equal(controller.canvas.style.opacity, '0.84')
  assert.match(controller.canvas.style.clipPath, /^polygon\(/)
  assert.equal(controller.canvas.style.width, '480px')
  assert.equal(controller.canvas.style.top, '16px')
  assert.equal(observedTarget, source)
  assert.equal(resizeListeners.length, 1)
  assert.equal(motionListeners.length, 1)
  assert.equal(rafCallbacks.length, 1)

  rafCallbacks[0](34)
  assert.ok(calls.some((call) => call[0] === 'clearRect'))

  const clearCountAfterPaint = calls.filter((call) => call[0] === 'clearRect').length
  documentRef.hidden = true
  rafCallbacks[1](68)
  assert.equal(calls.filter((call) => call[0] === 'clearRect').length, clearCountAfterPaint)

  controller.stop()
  assert.equal(observerDisconnected, true)
  assert.equal(resizeListeners.length, 0)
  assert.equal(motionListeners.length, 0)
  assert.equal(controller.canvas.removed, true)
})
