(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) {
    module.exports = api
  }
  root.QuietRouteTrackRotation = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  const DEFAULT_STORAGE_KEY = 'quiet-route-desktop-track-rotation-v1'
  const RECENT_LIMIT = 3

  function sanitizeTrack(track) {
    if (!track || typeof track.id !== 'string' || typeof track.src !== 'string') {
      return null
    }
    return track
  }

  function configuredIds(tracks) {
    return tracks
      .map(sanitizeTrack)
      .filter(Boolean)
      .map((track) => track.id)
  }

  function uniqueConfiguredIds(values, allowed) {
    const seen = new Set()
    const result = []
    for (const value of Array.isArray(values) ? values : []) {
      if (!allowed.has(value) || seen.has(value)) continue
      seen.add(value)
      result.push(value)
    }
    return result
  }

  function normalizeStoredState(rawState, tracks) {
    const ids = configuredIds(tracks)
    const allowed = new Set(ids)
    const state = rawState && typeof rawState === 'object' ? rawState : {}
    const bag = uniqueConfiguredIds(state.bag, allowed)
    const recent = uniqueConfiguredIds(state.recent, allowed).slice(-RECENT_LIMIT)
    const lastId = allowed.has(state.lastId) ? state.lastId : null

    return { bag, recent, lastId }
  }

  function shuffleIds(ids, random) {
    const bag = ids.slice()
    for (let index = 0; index < bag.length - 1; index += 1) {
      const swapIndex = index + Math.floor(random() * (bag.length - index))
      const current = bag[index]
      bag[index] = bag[swapIndex]
      bag[swapIndex] = current
    }
    return bag
  }

  function refillBag(state, tracks, random) {
    const ids = configuredIds(tracks)
    const recent = new Set(state.recent)
    let bag = shuffleIds(ids, random).filter((id) => id !== state.lastId)
    const delayedRecent = bag.filter((id) => recent.has(id))
    bag = bag.filter((id) => !recent.has(id)).concat(delayedRecent)

    if (bag.length === 0 && ids.length > 0) {
      bag = shuffleIds(ids, random)
    }

    if (bag.length > 1 && bag[0] === state.lastId) {
      const swapIndex = bag.findIndex((id) => id !== state.lastId)
      if (swapIndex > 0) {
        const current = bag[0]
        bag[0] = bag[swapIndex]
        bag[swapIndex] = current
      }
    }

    return bag
  }

  function nextTrack(rawState, tracks, random = Math.random) {
    const usableTracks = tracks.map(sanitizeTrack).filter(Boolean)
    if (usableTracks.length === 0) {
      throw new Error('No desktop music tracks are configured')
    }

    const byId = new Map(usableTracks.map((track) => [track.id, track]))
    const state = normalizeStoredState(rawState, usableTracks)
    let bag = state.bag.filter((id) => byId.has(id) && id !== state.lastId)

    if (bag.length === 0) {
      bag = refillBag(state, usableTracks, random)
    }

    let pickedId = bag.shift()
    if (pickedId === state.lastId && bag.length > 0) {
      const deferred = pickedId
      pickedId = bag.shift()
      bag.push(deferred)
    }

    const track = byId.get(pickedId) || usableTracks[0]
    const recent = state.recent
      .filter((id) => id !== track.id)
      .concat(track.id)
      .slice(-RECENT_LIMIT)

    return {
      track,
      state: {
        bag,
        recent,
        lastId: track.id,
      },
    }
  }

  function parseStoredState(storage, storageKey) {
    if (!storage || typeof storage.getItem !== 'function') return null
    try {
      const value = storage.getItem(storageKey)
      return value ? JSON.parse(value) : null
    } catch {
      return null
    }
  }

  function saveStoredState(storage, storageKey, state) {
    if (!storage || typeof storage.setItem !== 'function') return
    try {
      storage.setItem(storageKey, JSON.stringify(state))
    } catch {
      // Storage may be unavailable in restricted contexts.
    }
  }

  function createTrackRotation(options) {
    const tracks = (options && options.tracks) || []
    const storage = options && options.storage
    const storageKey = (options && options.storageKey) || DEFAULT_STORAGE_KEY
    const random = (options && options.random) || Math.random

    let state = normalizeStoredState(
      parseStoredState(storage, storageKey),
      tracks,
    )

    return {
      pickNext() {
        const result = nextTrack(state, tracks, random)
        state = result.state
        saveStoredState(storage, storageKey, state)
        return result
      },
      getState() {
        return {
          bag: state.bag.slice(),
          recent: state.recent.slice(),
          lastId: state.lastId,
        }
      },
    }
  }

  return {
    createTrackRotation,
    nextTrack,
    normalizeStoredState,
  }
})
