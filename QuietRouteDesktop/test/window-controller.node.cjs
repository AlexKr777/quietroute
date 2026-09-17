const test = require('node:test')
const assert = require('node:assert/strict')

const { createWindowController } = require('../src/window-controller.cjs')

function createFakeWindow(initialBounds, options = {}) {
  let bounds = { ...initialBounds }
  let resizable = true
  let alwaysOnTop = Boolean(options.alwaysOnTop)
  const staleAlwaysOnTopGetter = Boolean(options.staleAlwaysOnTopGetter)
  let fullScreen = Boolean(options.fullScreen)
  let maximized = Boolean(options.maximized)
  const calls = []
  let duringSetBounds = () => undefined

  return {
    calls,
    getBounds: () => ({ ...bounds }),
    isAlwaysOnTop: () => staleAlwaysOnTopGetter ? Boolean(options.alwaysOnTop) : alwaysOnTop,
    isFullScreen: () => fullScreen,
    isMaximized: () => maximized,
    setAlwaysOnTop: (enabled, level) => {
      alwaysOnTop = enabled
      calls.push(['setAlwaysOnTop', enabled, level])
    },
    setFullScreen: (enabled) => {
      fullScreen = enabled
      calls.push(['setFullScreen', enabled])
    },
    unmaximize: () => {
      maximized = false
      calls.push(['unmaximize'])
    },
    setBounds: (nextBounds) => {
      bounds = { ...nextBounds }
      calls.push(['setBounds', nextBounds])
      duringSetBounds()
    },
    setResizable: (enabled) => {
      resizable = enabled
      calls.push(['setResizable', enabled])
    },
    setMaximizable: (enabled) => {
      calls.push(['setMaximizable', enabled])
    },
    getResizable: () => resizable,
    setDuringSetBounds: (callback) => {
      duringSetBounds = callback
    },
  }
}

const display = {
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
}

test('toggles into a resizable compact window in the current display corner', () => {
  const fakeWindow = createFakeWindow({ x: 410, y: 180, width: 1100, height: 680 })
  const controller = createWindowController({
    window: fakeWindow,
    getDisplayMatching: () => display,
  })

  assert.deepEqual(controller.toggleCompact(), {
    compact: true,
    alwaysOnTop: true,
  })
  assert.deepEqual(fakeWindow.calls, [
    ['setMaximizable', false],
    ['setResizable', true],
    ['setBounds', { x: 1416, y: 608, width: 480, height: 360 }],
    ['setAlwaysOnTop', true, 'floating'],
  ])
  assert.equal(fakeWindow.getResizable(), true)
})

test('restores the remembered normal bounds, resizability, and pre-compact top state', () => {
  const fakeWindow = createFakeWindow({ x: 410, y: 180, width: 1100, height: 680 })
  const controller = createWindowController({
    window: fakeWindow,
    getDisplayMatching: () => display,
  })

  controller.toggleCompact()
  fakeWindow.calls.length = 0

  assert.deepEqual(controller.toggleCompact(), {
    compact: false,
    alwaysOnTop: false,
  })
  assert.deepEqual(fakeWindow.calls, [
    ['setAlwaysOnTop', false, 'floating'],
    ['setMaximizable', true],
    ['setResizable', true],
    ['setBounds', { x: 410, y: 180, width: 1100, height: 680 }],
  ])
})

test('does not overwrite remembered bounds when Electron emits move during compacting', () => {
  const fakeWindow = createFakeWindow({ x: 410, y: 180, width: 1100, height: 680 })
  const controller = createWindowController({
    window: fakeWindow,
    getDisplayMatching: () => display,
  })
  fakeWindow.setDuringSetBounds(() => controller.captureExpandedBounds())

  controller.toggleCompact()
  controller.toggleCompact()

  assert.deepEqual(fakeWindow.getBounds(), {
    x: 410,
    y: 180,
    width: 1100,
    height: 680,
  })
})

test('leaves expanded fullscreen and maximized states before applying compact bounds', () => {
  const fakeWindow = createFakeWindow(
    { x: 0, y: 0, width: 1920, height: 1040 },
    { fullScreen: true, maximized: true },
  )
  const controller = createWindowController({
    window: fakeWindow,
    getDisplayMatching: () => display,
  })

  assert.deepEqual(controller.toggleCompact(), {
    compact: true,
    alwaysOnTop: true,
  })
  assert.deepEqual(fakeWindow.calls, [
    ['setFullScreen', false],
    ['unmaximize'],
    ['setMaximizable', false],
    ['setResizable', true],
    ['setBounds', { x: 1416, y: 608, width: 480, height: 360 }],
    ['setAlwaysOnTop', true, 'floating'],
  ])
})

test('restores a custom compact size without locking its resize border', () => {
  const fakeWindow = createFakeWindow({ x: 1260, y: 570, width: 620, height: 430 })
  const controller = createWindowController({
    window: fakeWindow,
    getDisplayMatching: () => display,
    initialCompact: true,
    initialExpandedBounds: { x: 300, y: 140, width: 1080, height: 700 },
    initialAlwaysOnTop: true,
  })

  assert.deepEqual(controller.getState(), { compact: true, alwaysOnTop: true })
  assert.equal(fakeWindow.getResizable(), true)
  assert.deepEqual(controller.getPersistenceState(), {
    compact: true,
    alwaysOnTop: true,
    bounds: { x: 1260, y: 570, width: 620, height: 430 },
    expandedBounds: { x: 300, y: 140, width: 1080, height: 700 },
  })
})

test('temporarily enlarges a tiny window for the mixer and restores its exact size', () => {
  const fakeWindow = createFakeWindow({ x: 120, y: 80, width: 260, height: 180 })
  const controller = createWindowController({
    window: fakeWindow,
    getDisplayMatching: () => display,
  })

  assert.deepEqual(controller.ensureMixerSpace(), {
    compact: false,
    alwaysOnTop: false,
  })
  assert.deepEqual(fakeWindow.getBounds(), {
    x: 120,
    y: 80,
    width: 480,
    height: 360,
  })

  assert.deepEqual(controller.restoreMixerSpace(), {
    compact: false,
    alwaysOnTop: false,
  })
  assert.deepEqual(fakeWindow.getBounds(), {
    x: 120,
    y: 80,
    width: 260,
    height: 180,
  })
})

test('keeps a user-disabled compact top state disabled when returning to normal', () => {
  const fakeWindow = createFakeWindow({ x: 410, y: 180, width: 1100, height: 680 })
  const controller = createWindowController({
    window: fakeWindow,
    getDisplayMatching: () => display,
  })

  controller.toggleCompact()
  assert.deepEqual(controller.toggleAlwaysOnTop(), {
    compact: true,
    alwaysOnTop: false,
  })
  fakeWindow.calls.length = 0

  assert.deepEqual(controller.toggleCompact(), {
    compact: false,
    alwaysOnTop: false,
  })
  assert.deepEqual(fakeWindow.calls, [
    ['setMaximizable', true],
    ['setResizable', true],
    ['setBounds', { x: 410, y: 180, width: 1100, height: 680 }],
  ])

  fakeWindow.calls.length = 0
  assert.deepEqual(controller.toggleCompact(), {
    compact: true,
    alwaysOnTop: true,
  })
  assert.deepEqual(fakeWindow.calls.at(-1), [
    'setAlwaysOnTop', true, 'floating',
  ])
})

test('toggles always-on-top at Electron floating level', () => {
  const fakeWindow = createFakeWindow({ x: 410, y: 180, width: 1100, height: 680 })
  const controller = createWindowController({
    window: fakeWindow,
    getDisplayMatching: () => display,
  })

  assert.deepEqual(controller.toggleAlwaysOnTop(), {
    compact: false,
    alwaysOnTop: true,
  })
  assert.deepEqual(fakeWindow.calls, [
    ['setAlwaysOnTop', true, 'floating'],
  ])
})

test('tracks the requested top state while Electron reports a stale native value', () => {
  const fakeWindow = createFakeWindow(
    { x: 410, y: 180, width: 1100, height: 680 },
    { staleAlwaysOnTopGetter: true },
  )
  const controller = createWindowController({
    window: fakeWindow,
    getDisplayMatching: () => display,
  })

  assert.deepEqual(controller.toggleAlwaysOnTop(), {
    compact: false,
    alwaysOnTop: true,
  })
  assert.deepEqual(controller.getState(), {
    compact: false,
    alwaysOnTop: true,
  })
  assert.deepEqual(controller.toggleAlwaysOnTop(), {
    compact: false,
    alwaysOnTop: false,
  })
  assert.deepEqual(fakeWindow.calls, [
    ['setAlwaysOnTop', true, 'floating'],
    ['setAlwaysOnTop', false, 'floating'],
  ])
})

test('reclamps remembered bounds when their display is no longer available', () => {
  const fakeWindow = createFakeWindow({ x: 2700, y: 160, width: 1100, height: 680 })
  const controller = createWindowController({
    window: fakeWindow,
    getDisplayMatching: () => display,
  })

  controller.keepVisible()

  assert.deepEqual(fakeWindow.getBounds(), {
    x: 820,
    y: 160,
    width: 1100,
    height: 680,
  })
})
