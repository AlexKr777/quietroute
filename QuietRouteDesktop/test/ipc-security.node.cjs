const test = require('node:test')
const assert = require('node:assert/strict')

const { isTrustedShellUrl } = require('../src/ipc-security.cjs')

test('accepts only the local shell origin for privileged window commands', () => {
  assert.equal(
    isTrustedShellUrl('quiet-route://shell/index.html'),
    true,
  )
  assert.equal(
    isTrustedShellUrl('quiet-route://site/index.html'),
    false,
  )
  assert.equal(
    isTrustedShellUrl('https://example.com/quiet-route://shell/index.html'),
    false,
  )
  assert.equal(isTrustedShellUrl('not a url'), false)
})
