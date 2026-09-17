const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const {
  BIRDSONG_PROFILE,
} = require('../src/site-overrides/desktop-birdsong-profile.ts')

test('desktop birdsong stays present without overpowering the long-running mix', () => {
  assert.equal(BIRDSONG_PROFILE.src, '/audio/birds.mp3')
  assert.equal(BIRDSONG_PROFILE.trimGain, 16)
  assert.ok(BIRDSONG_PROFILE.highpassFrequency >= 220)
  assert.ok(BIRDSONG_PROFILE.lowpassFrequency <= 5_600)
})

test('the documented birdsong recording remains bundled unchanged', () => {
  const asset = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'public', 'audio', 'birds.mp3'),
  )
  const licenses = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'public', 'audio', 'LICENSES.md'),
    'utf8',
  )

  assert.equal(asset.byteLength, 3_990_616)
  assert.equal(
    crypto.createHash('sha256').update(asset).digest('hex'),
    'c0a4ac6e221b54ce86a1a2062ca5b1611cc608a195851d9b520e5728300198bb',
  )
  assert.match(licenses, /rubindaniel/)
  assert.match(licenses, /freesound\.org\/people\/rubindaniel\/sounds\/730710/)
  assert.match(licenses, /CC0 1\.0 Universal/)
})
