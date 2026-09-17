const nodeFs = require('node:fs')
const nodePath = require('node:path')

const WINDOW_STATE_VERSION = 1

function normalizeBounds(value) {
  if (!value || typeof value !== 'object') return null

  const bounds = {}
  for (const key of ['x', 'y', 'width', 'height']) {
    const numeric = Number(value[key])
    if (!Number.isFinite(numeric)) return null
    bounds[key] = Math.round(numeric)
  }
  if (bounds.width < 1 || bounds.height < 1) return null
  return bounds
}

function normalizeWindowState(value) {
  if (!value || typeof value !== 'object' || value.version !== WINDOW_STATE_VERSION) {
    return null
  }

  const bounds = normalizeBounds(value.bounds)
  if (!bounds) return null

  return {
    version: WINDOW_STATE_VERSION,
    compact: Boolean(value.compact),
    alwaysOnTop: Boolean(value.alwaysOnTop),
    bounds,
    expandedBounds: normalizeBounds(value.expandedBounds) ?? bounds,
  }
}

function readWindowState(filePath, options = {}) {
  const fs = options.fs ?? nodeFs
  try {
    return normalizeWindowState(JSON.parse(fs.readFileSync(filePath, 'utf8')))
  } catch {
    return null
  }
}

function writeWindowState(filePath, state, options = {}) {
  const fs = options.fs ?? nodeFs
  const path = options.path ?? nodePath
  const normalized = normalizeWindowState(state)
  if (!normalized) return false

  const temporaryPath = `${filePath}.tmp`
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(temporaryPath, JSON.stringify(normalized), 'utf8')
    fs.renameSync(temporaryPath, filePath)
    return true
  } catch {
    return false
  }
}

module.exports = {
  WINDOW_STATE_VERSION,
  normalizeBounds,
  normalizeWindowState,
  readWindowState,
  writeWindowState,
}
