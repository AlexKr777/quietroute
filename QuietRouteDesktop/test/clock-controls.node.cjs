const assert = require('node:assert/strict')
const test = require('node:test')

const {
  clampClockPreferences,
  normalizeClockPreferences,
} = require('../src/shell/clock-controls.js')

test('keeps saved clock placement and scale inside a usable viewport range', () => {
  assert.deepEqual(normalizeClockPreferences({ x: 61.4, y: 18.6, scale: 1.35 }), {
    x: 61.4,
    y: 18.6,
    scale: 1.35,
  })
  assert.equal(normalizeClockPreferences({ x: '61', y: 18, scale: 1 }), null)
  assert.deepEqual(clampClockPreferences({ x: -8, y: 140, scale: 9 }), {
    x: 4,
    y: 96,
    scale: 2.4,
  })
})
