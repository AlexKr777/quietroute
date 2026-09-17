const assert = require('node:assert/strict')
const { test } = require('node:test')

const { formatLocalClock, getDelayUntilNextMinute } = require('../src/shell/clock.js')

test('formatLocalClock returns local hours and minutes with leading zeroes', () => {
  const date = new Date(2026, 6, 21, 7, 5, 42, 900)

  assert.equal(formatLocalClock(date), '07:05')
})

test('formatLocalClock keeps late-evening 24-hour time without seconds', () => {
  const date = new Date(2026, 6, 21, 23, 47, 0, 0)

  assert.equal(formatLocalClock(date), '23:47')
})

test('getDelayUntilNextMinute returns exact remaining milliseconds plus a small guard', () => {
  const date = new Date(2026, 6, 21, 23, 47, 12, 250)

  assert.equal(getDelayUntilNextMinute(date), 47_751)
})
