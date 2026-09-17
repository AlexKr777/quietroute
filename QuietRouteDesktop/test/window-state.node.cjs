const assert = require('node:assert/strict')
const test = require('node:test')

const {
  normalizeWindowState,
  readWindowState,
  writeWindowState,
} = require('../src/window-state.cjs')

test('normalizes only usable persisted window bounds and presentation state', () => {
  assert.deepEqual(normalizeWindowState({
    version: 1,
    compact: true,
    alwaysOnTop: true,
    bounds: { x: 12.4, y: -8.7, width: 481.2, height: 359.8 },
    expandedBounds: { x: 100, y: 80, width: 1100, height: 680 },
  }), {
    version: 1,
    compact: true,
    alwaysOnTop: true,
    bounds: { x: 12, y: -9, width: 481, height: 360 },
    expandedBounds: { x: 100, y: 80, width: 1100, height: 680 },
  })

  assert.equal(normalizeWindowState({ version: 1, bounds: { width: 0 } }), null)
  assert.equal(normalizeWindowState({ version: 2, bounds: { x: 0, y: 0, width: 1, height: 1 } }), null)
})

test('reads and writes a versioned window state without crashing on storage failures', () => {
  const files = new Map()
  const fs = {
    readFileSync(filePath) {
      if (!files.has(filePath)) throw new Error('missing')
      return files.get(filePath)
    },
    mkdirSync() {},
    renameSync(from, to) {
      files.set(to, files.get(from))
      files.delete(from)
    },
    writeFileSync(filePath, value) {
      files.set(filePath, value)
    },
  }
  const state = {
    version: 1,
    compact: false,
    alwaysOnTop: false,
    bounds: { x: 30, y: 40, width: 920, height: 610 },
    expandedBounds: { x: 30, y: 40, width: 920, height: 610 },
  }

  assert.equal(writeWindowState('profile/window-state.json', state, { fs, path: require('node:path') }), true)
  assert.deepEqual(readWindowState('profile/window-state.json', { fs }), state)
  assert.equal(readWindowState('missing.json', { fs }), null)
  assert.equal(writeWindowState('broken.json', state, {
    fs: { ...fs, writeFileSync() { throw new Error('blocked') } },
    path: require('node:path'),
  }), false)
})
