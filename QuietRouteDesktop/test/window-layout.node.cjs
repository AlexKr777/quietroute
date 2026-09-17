const test = require('node:test')
const assert = require('node:assert/strict')

const {
  centerBounds,
  clampBoundsToWorkArea,
  getCompactBounds,
} = require('../src/window-layout.cjs')

test('centers the normal window in device-independent work-area coordinates', () => {
  assert.deepEqual(
    centerBounds(
      { width: 1100, height: 680 },
      { x: -2560, y: 0, width: 2560, height: 1400 },
    ),
    { x: -1830, y: 360, width: 1100, height: 680 },
  )
})

test('places compact mode in the display corner with a quiet margin', () => {
  assert.deepEqual(
    getCompactBounds(
      { x: 0, y: 0, width: 3840, height: 2080 },
      { width: 480, height: 360 },
      24,
    ),
    { x: 3336, y: 1696, width: 480, height: 360 },
  )
})

test('supports a larger bottom reserve for an auto-revealed Windows taskbar', () => {
  assert.deepEqual(
    getCompactBounds(
      { x: 0, y: 0, width: 1920, height: 1080 },
      { width: 480, height: 360 },
      24,
      60,
    ),
    { x: 1416, y: 660, width: 480, height: 360 },
  )
})

test('shrinks compact mode when the display is smaller than its preferred size', () => {
  assert.deepEqual(
    getCompactBounds(
      { x: 100, y: 50, width: 420, height: 300 },
      { width: 480, height: 360 },
      24,
    ),
    { x: 124, y: 74, width: 372, height: 252 },
  )
})

test('clamps a remembered normal window after a monitor is disconnected', () => {
  assert.deepEqual(
    clampBoundsToWorkArea(
      { x: 3100, y: 120, width: 1100, height: 680 },
      { x: 0, y: 0, width: 1920, height: 1040 },
    ),
    { x: 820, y: 120, width: 1100, height: 680 },
  )
})

test('clamps oversized remembered bounds without leaving the work area', () => {
  assert.deepEqual(
    clampBoundsToWorkArea(
      { x: -500, y: -300, width: 1800, height: 1200 },
      { x: 20, y: 40, width: 1280, height: 720 },
    ),
    { x: 20, y: 40, width: 1280, height: 720 },
  )
})
