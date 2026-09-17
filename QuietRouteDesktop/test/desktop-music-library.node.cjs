const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const {
  RECORDED_LOFI_TRACKS,
  getMusicTrack,
  getMusicTrackCount,
} = require('../src/site-overrides/desktop-music-library.ts')

const TRACKS = [
  {
    id: 'community', artist: '1000 Handz', rmsDb: -16.04, trim: 0.16,
    source: 'https://freemusicarchive.org/music/1000-handz/cc-by-free-to-use-chillstudylounge-instrumentals/community/',
    sha256: '77a30cadd2e74fb162ba682d1fe6b8947a008e6c7b0c67548703fcd0fc67b25d',
  },
  {
    id: 'open-window', artist: '1000 Handz', rmsDb: -14.84, trim: 0.14,
    source: 'https://freemusicarchive.org/music/1000-handz/cc-by-free-to-use-chillstudylounge-instrumentals/open-window-1/',
    sha256: 'e4de85ff0250bad0e7a9d7543782b4ccbca6b2179e9c3e16c243fea5f8080bc0',
  },
  {
    id: 'lever', artist: '1000 Handz', rmsDb: -15.74, trim: 0.15,
    source: 'https://freemusicarchive.org/music/1000-handz/cc-by-free-to-use-chillstudylounge-instrumentals/lever/',
    sha256: 'efcea87d7c3b5b9fd1443cae7bbb32a66ff913bc7b8a1afcf5d9f75decd5765f',
  },
  {
    id: 'lemongrass', artist: '1000 Handz', rmsDb: -14.35, trim: 0.13,
    source: 'https://freemusicarchive.org/music/1000-handz/cc-by-free-to-use-chillstudylounge-instrumentals/lemongrass/',
    sha256: '6e5854201f237ada4fa2edeb6205c1f78b40c90d1ce17d028dfa86317e481fff',
  },
  {
    id: 'yorkville', artist: '1000 Handz', rmsDb: -14.82, trim: 0.14,
    source: 'https://freemusicarchive.org/music/1000-handz/cc-by-free-to-use-chillstudylounge-instrumentals/yorkville/',
    sha256: 'e71b7bb995c6005c0aa75be416cab4ee45630ea80dbadddce0f57bf3856f7502',
  },
  {
    id: 'brass-railing', artist: '1000 Handz', rmsDb: -14.85, trim: 0.14,
    source: 'https://freemusicarchive.org/music/1000-handz/cc-by-free-to-use-chillstudylounge-instrumentals/brass-railing/',
    sha256: 'e9736d8da7f65007d3c090c82be0cd53cf7f3a349a69d6d8439377728201a91d',
  },
  {
    id: 'blue-sky', artist: '1000 Handz', rmsDb: -14.19, trim: 0.13,
    source: 'https://freemusicarchive.org/music/1000-handz/cc-by-free-to-use-chillstudylounge-instrumentals/blue-sky-2/',
    sha256: '22d2c59512951cb71be55aecfe69df9b98de47fbd0841095c4a2e8b7840f8f84',
  },
  {
    id: 'always-faithful', artist: 'Ketsa', rmsDb: -13.09, trim: 0.11,
    source: 'https://freemusicarchive.org/music/Ketsa/cc-by-free-to-use-for-anything/always-faithful/',
    sha256: 'a7bef4fe165a4354055d5fbdd0c6871f0ea6d811bf2ccf769b89661f62aa7f00',
  },
  {
    id: 'will-make-you-happy', artist: 'Ketsa', rmsDb: -12.95, trim: 0.11,
    source: 'https://freemusicarchive.org/music/Ketsa/cc-by-free-to-use-for-anything/will-make-you-happy/',
    sha256: 'b37bd275269c43f7770f61486765c6c2fd3435b4d88af6a2a343f60ffaaa6741',
  },
  {
    id: 'feeling', artist: 'Ketsa', rmsDb: -12.85, trim: 0.11,
    source: 'https://freemusicarchive.org/music/Ketsa/cc-by-free-to-use-for-anything/feeling-1/',
    sha256: '2e8f12ed353597d11cbc84f5c3907ac4eba3d87fe97ae4ed20e760a3ea7f0614',
  },
  {
    id: 'the-road', artist: 'Ketsa', rmsDb: -12.44, trim: 0.105,
    source: 'https://freemusicarchive.org/music/Ketsa/cc-by-free-to-use-for-anything/the-road-1/',
    sha256: '8a8c08e81e57f894c914284f77b8f4c3671cce5da524b6ff4085c414093457ef',
  },
  {
    id: 'my-town', artist: 'Ketsa', rmsDb: -12.57, trim: 0.107,
    source: 'https://freemusicarchive.org/music/Ketsa/cc-by-free-to-use-for-anything/my-town/',
    sha256: '7d0f1d6697bd9575875062de600d2b4b6fa8694818d188c65bfa7ac46ccd790e',
  },
  {
    id: 'her-memory-fading', artist: 'Ketsa', rmsDb: -12.76, trim: 0.11,
    source: 'https://freemusicarchive.org/music/Ketsa/cc-by-free-to-use-for-anything/her-memory-fading/',
    sha256: '167b5e9373364a40328a81920c32758e349d1009171268e47800c4eba0b0ece6',
  },
]

const ADDITIONAL_TRACK_IDS = [
  'neon', 'pay-it-forward', 'chill-out', 'the-shire', 'potential',
  'seasons-changing', 'wednesday', 'hopeful', 'giza', 'cross-rhodes',
  'no-option', 'voyage', 'overseas', 'tundra', 'announcement', 'baker',
  'abandoned', 'escape', 'ran-out', 'get-outta-there',
]

test('desktop replaces the rejected site playlist with 33 work-friendly instrumentals', () => {
  const totalTrackCount = TRACKS.length + ADDITIONAL_TRACK_IDS.length
  assert.equal(RECORDED_LOFI_TRACKS.length, totalTrackCount)
  assert.equal(getMusicTrackCount(), totalTrackCount)
  assert.equal(new Set(RECORDED_LOFI_TRACKS.map((track) => track.id)).size, totalTrackCount)
  assert.deepEqual(
    new Set(RECORDED_LOFI_TRACKS.map((track) => track.artist)),
    new Set(['1000 Handz', 'Ketsa']),
  )
  assert.doesNotMatch(
    RECORDED_LOFI_TRACKS.map((track) => `${track.artist} ${track.title}`).join(' '),
    /Holizna|VHS Jazz/i,
  )
  assert.equal(getMusicTrack(totalTrackCount), RECORDED_LOFI_TRACKS[0])
})

test('every desktop track is local, attributed, intact, and level matched', () => {
  const postTrimLevels = []

  for (const expected of TRACKS) {
    const track = RECORDED_LOFI_TRACKS.find((candidate) => candidate.id === expected.id)
    assert.ok(track, `missing ${expected.id}`)
    assert.equal(track.artist, expected.artist)
    assert.equal(track.sourceUrl, expected.source)
    assert.equal(track.license.name, 'Creative Commons Attribution 4.0 International')
    assert.equal(track.license.url, 'https://creativecommons.org/licenses/by/4.0/')
    assert.equal(track.trimGain, expected.trim)
    assert.equal(track.src, `/audio/lofi/${expected.id}.mp3`)

    const localPath = path.resolve(__dirname, '..', 'assets', track.src.slice(1))
    assert.equal(fs.existsSync(localPath), true, `missing ${localPath}`)
    assert.ok(fs.statSync(localPath).size > 2_000_000)
    const hash = crypto.createHash('sha256').update(fs.readFileSync(localPath)).digest('hex')
    assert.equal(hash, expected.sha256)
    postTrimLevels.push(expected.rmsDb + 20 * Math.log10(track.trimGain))
  }

  assert.ok(Math.max(...postTrimLevels) - Math.min(...postTrimLevels) <= 0.4)
})

test('the additional CC BY tracks are local and attributed', () => {
  for (const id of ADDITIONAL_TRACK_IDS) {
    const track = RECORDED_LOFI_TRACKS.find((candidate) => candidate.id === id)
    assert.ok(track, `missing ${id}`)
    assert.equal(track.license.name, 'Creative Commons Attribution 4.0 International')
    assert.equal(track.license.url, 'https://creativecommons.org/licenses/by/4.0/')
    assert.equal(track.src, `/audio/lofi/${id}.mp3`)
    const localPath = path.resolve(__dirname, '..', 'assets', track.src.slice(1))
    assert.equal(fs.existsSync(localPath), true, `missing ${localPath}`)
    assert.ok(fs.statSync(localPath).size > 2_000_000)
  }
})
