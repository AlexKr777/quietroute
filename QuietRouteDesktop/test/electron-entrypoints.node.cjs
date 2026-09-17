const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

test('Electron entrypoints use the runtime module exposed by the packaged binary', () => {
  for (const relativePath of ['src/main.cjs', 'src/preload.cjs']) {
    const source = fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8')
    assert.doesNotMatch(source, /require\(['"]electron\/(?:main|renderer)['"]\)/)
    assert.match(source, /require\(['"]electron['"]\)/)
  }
})

test('runtime smoke uses an isolated profile without disabling the app lock', () => {
  const mainSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'src/main.cjs'),
    'utf8',
  )
  const smokeSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'scripts/runtime-smoke.cjs'),
    'utf8',
  )

  assert.match(mainSource, /app\.setPath\('userData', path\.resolve\(testUserDataDirectory\)\)/)
  assert.match(mainSource, /const hasSingleInstanceLock = app\.requestSingleInstanceLock\(\)/)
  assert.match(smokeSource, /QUIET_ROUTE_TEST_USER_DATA: runtimeProfileDirectory/)
})
