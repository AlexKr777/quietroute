const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const {
  getCompactDockKeys,
  resolveOutsideMixerPress,
  resolveCompactMixerTransition,
  resolveMixerPointerAction,
} = require('../src/site-overrides/desktop-mixer-behavior.js')

const desktopOverrideCss = fs.readFileSync(
  path.resolve(__dirname, '..', 'src', 'site-overrides', 'desktop-overrides.css'),
  'utf8',
)

test('one clean press on the sound label toggles the mixer', () => {
  assert.equal(
    resolveMixerPointerAction({ startedOnGrip: false, travelPixels: 0 }),
    'toggle',
  )
  assert.equal(
    resolveMixerPointerAction({ startedOnGrip: false, travelPixels: 5.9 }),
    'toggle',
  )
})

test('holding either the sound label or its three-dot grip starts a mixer drag', () => {
  assert.equal(
    resolveMixerPointerAction({ startedOnGrip: true, travelPixels: 0 }),
    'drag',
  )
  assert.equal(
    resolveMixerPointerAction({ startedOnGrip: true, travelPixels: 42 }),
    'drag',
  )
  assert.equal(
    resolveMixerPointerAction({ startedOnGrip: false, travelPixels: 7 }),
    'drag',
  )
})

test('compact mixer docks toward the lower-right corner', () => {
  assert.deepEqual(getCompactDockKeys(), ['ArrowRight', 'ArrowDown'])
})

test('every compact entry starts with the mixer collapsed', () => {
  let state = {
    compactCollapsed: true,
    wasCompact: false,
  }

  state = resolveCompactMixerTransition({ ...state, isCompact: true })
  assert.deepEqual(state, {
    compactCollapsed: true,
    wasCompact: true,
  })

  state = { ...state, compactCollapsed: false }
  state = resolveCompactMixerTransition({ ...state, isCompact: false })
  assert.deepEqual(state, {
    compactCollapsed: true,
    wasCompact: false,
  })

  state = resolveCompactMixerTransition({ ...state, isCompact: true })
  assert.deepEqual(state, {
    compactCollapsed: true,
    wasCompact: true,
  })
})

test('a clean scene click closes an expanded mixer at every window size', () => {
  assert.equal(resolveOutsideMixerPress({
    compact: true,
    collapsed: false,
    startedInsideMixer: false,
    endedInsideMixer: false,
    travelPixels: 3,
  }), 'collapse')
  assert.equal(resolveOutsideMixerPress({
    compact: false,
    collapsed: false,
    startedInsideMixer: false,
    endedInsideMixer: false,
    travelPixels: 3,
  }), 'collapse')
})

test('scene drags and mixer presses leave the mixer alone', () => {
  for (const options of [
    {
      compact: true,
      collapsed: false,
      startedInsideMixer: false,
      endedInsideMixer: false,
      travelPixels: 12,
    },
    {
      compact: true,
      collapsed: false,
      startedInsideMixer: true,
      endedInsideMixer: false,
      travelPixels: 0,
    },
    {
      compact: true,
      collapsed: false,
      startedInsideMixer: false,
      endedInsideMixer: true,
      travelPixels: 0,
    },
  ]) {
    assert.equal(resolveOutsideMixerPress(options), 'ignore')
  }
})

test('collapsed compact sound chip centers its label and uses horizontal drag dots', () => {
  const gripRule = desktopOverrideCss.match(
    /\.desktop-mixer-ready \.desktop-mixer-grip\s*\{([\s\S]*?)\}/,
  )?.[1]
  const collapsedHandleRule = desktopOverrideCss.match(
    /\.desktop-mixer-collapsed \.sound-controls__drag-handle\s*\{([\s\S]*?)\}/,
  )?.[1]
  const collapsedLabelRule = desktopOverrideCss.match(
    /\.desktop-mixer-collapsed \.sound-controls__drag-label\s*\{([\s\S]*?)\}/,
  )?.[1]
  const collapsedGripRule = desktopOverrideCss.match(
    /\.desktop-mixer-collapsed \.sound-controls__drag-handle \.desktop-mixer-grip\s*\{([\s\S]*?)\}/,
  )?.[1]

  assert.ok(gripRule)
  assert.ok(collapsedHandleRule)
  assert.ok(collapsedLabelRule)
  assert.ok(collapsedGripRule)
  assert.match(gripRule, /grid-template-columns:\s*repeat\(3,\s*0\.14rem\)/)
  assert.doesNotMatch(gripRule, /grid-template-rows:\s*repeat\(3/)
  assert.match(
    collapsedHandleRule,
    /grid-template-columns:\s*0\.86rem\s+minmax\(0,\s*1fr\)\s+0\.86rem/,
  )
  assert.match(collapsedLabelRule, /grid-column:\s*2/)
  assert.match(collapsedLabelRule, /text-align:\s*center/)
  assert.match(collapsedLabelRule, /line-height:\s*1/)
  assert.match(collapsedGripRule, /grid-column:\s*3/)
  assert.match(collapsedGripRule, /justify-self:\s*end/)
})
