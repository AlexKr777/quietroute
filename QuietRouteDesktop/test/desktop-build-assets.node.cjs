const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')

const desktopOverridesSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'src', 'site-overrides', 'desktop-overrides.js'),
  'utf8',
)

function writeFixture(root, relativePath) {
  const target = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, relativePath)
}

test('desktop audio sync replaces every rejected site track instead of packaging it', async () => {
  const { syncDesktopAudioAssets } = await import('../vite.desktop.config.mjs')
  assert.equal(typeof syncDesktopAudioAssets, 'function')

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'quiet-route-audio-'))
  const desktopAudio = path.join(fixtureRoot, 'desktop-audio')
  const builtAudio = path.join(fixtureRoot, 'built-audio')

  try {
    writeFixture(builtAudio, 'birds.mp3')
    writeFixture(builtAudio, 'moon-unit.mp3')
    writeFixture(builtAudio, 'pretty-little-lies.mp3')
    writeFixture(builtAudio, 'vintage.mp3')
    writeFixture(builtAudio, 'whatever.mp3')
    writeFixture(builtAudio, path.join('lofi', 'goodnight.mp3'))
    writeFixture(builtAudio, path.join('lofi', 'midnight.mp3'))
    writeFixture(builtAudio, path.join('lofi', 'night-flight.mp3'))
    writeFixture(builtAudio, path.join('lofi', 'skylight.mp3'))

    writeFixture(desktopAudio, 'gentle-outdoor-rain.mp3')
    writeFixture(desktopAudio, path.join('lofi', 'community.mp3'))
    writeFixture(desktopAudio, path.join('lofi', 'open-window.mp3'))

    syncDesktopAudioAssets(desktopAudio, builtAudio)

    assert.deepEqual(
      fs.readdirSync(path.join(builtAudio, 'lofi')).sort(),
      ['community.mp3', 'open-window.mp3'],
    )
    for (const rejected of [
      'moon-unit.mp3',
      'pretty-little-lies.mp3',
      'vintage.mp3',
      'whatever.mp3',
    ]) {
      assert.equal(fs.existsSync(path.join(builtAudio, rejected)), false)
    }
    assert.equal(fs.existsSync(path.join(builtAudio, 'birds.mp3')), true)
    assert.equal(fs.existsSync(path.join(builtAudio, 'gentle-outdoor-rain.mp3')), true)
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test('desktop build injects a narrow dock bridge without changing the website source', async () => {
  const { injectDesktopDockBridge } = await import('../vite.desktop.config.mjs')
  const source = 'const desktopHosted = true\n'
  const transformed = injectDesktopDockBridge(source)

  assert.match(transformed, /QuietRouteDesktopDock/)
  assert.match(transformed, /getPosition\(\)/)
  assert.match(
    transformed,
    /moveTo\(position: Partial<Point>, dockSize\?: \{ width: number; height: number \}\)/,
  )
  assert.equal(transformed.startsWith(source), true)
})

test('desktop dock placement never fakes a synchronized move with CSS-only coordinates', () => {
  assert.match(desktopOverridesSource, /desktopDockState = 'unavailable'/)
  assert.doesNotMatch(
    desktopOverridesSource,
    /controls\.style\.setProperty\('--dock-[xy]'/,
  )
})
