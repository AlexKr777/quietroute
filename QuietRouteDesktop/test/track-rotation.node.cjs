const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  createTrackRotation,
  normalizeStoredState,
  nextTrack,
} = require('../src/site-overrides/track-rotation.js')

const tracks = [
  { id: 'a', src: '/a.mp3' },
  { id: 'b', src: '/b.mp3' },
  { id: 'c', src: '/c.mp3' },
  { id: 'd', src: '/d.mp3' },
]

test('normalizeStoredState keeps only configured ids and drops stale entries', () => {
  assert.deepEqual(
    normalizeStoredState(
      {
        bag: ['z', 'b', 'a', 'b'],
        recent: ['z', 'a', 'c', 'x'],
        lastId: 'z',
      },
      tracks,
    ),
    {
      bag: ['b', 'a'],
      recent: ['a', 'c'],
      lastId: null,
    },
  )
})

test('nextTrack avoids the immediate previous track while consuming the bag', () => {
  let state = {
    bag: ['a', 'b', 'c', 'd'],
    recent: ['a'],
    lastId: 'a',
  }
  const visited = []

  for (let index = 0; index < 4; index += 1) {
    const result = nextTrack(state, tracks, () => 0)
    visited.push(result.track.id)
    state = result.state
  }

  assert.equal(visited[0], 'b')
  assert.equal(new Set(visited).size, 4)
  assert.notEqual(visited[0], 'a')
})

test('createTrackRotation persists state and avoids repeating launch starts too often', () => {
  const storage = new Map()
  const getItem = (key) => storage.get(key) ?? null
  const setItem = (key, value) => storage.set(key, value)
  const picks = []

  for (let launch = 0; launch < 5; launch += 1) {
    const rotation = createTrackRotation({
      tracks,
      storage: { getItem, setItem },
      random: () => 0,
      storageKey: 'rotation',
    })
    picks.push(rotation.pickNext().track.id)
  }

  assert.deepEqual(picks.slice(0, 4), ['a', 'b', 'c', 'd'])
  assert.notEqual(picks[4], picks[3])
  assert.ok(JSON.parse(storage.get('rotation')).recent.length <= 3)
})
