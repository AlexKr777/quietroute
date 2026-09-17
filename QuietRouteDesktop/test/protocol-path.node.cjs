const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const { resolveProtocolFile } = require('../src/protocol-path.cjs')

const roots = {
  shell: path.resolve('C:/quiet-route/desktop-shell'),
  site: path.resolve('C:/quiet-route/site-dist'),
}

test('maps the site root and absolute asset paths into the Vite build', () => {
  assert.equal(
    resolveProtocolFile('quiet-route://site/', roots),
    path.join(roots.site, 'index.html'),
  )
  assert.equal(
    resolveProtocolFile('quiet-route://site/assets/scene.png', roots),
    path.join(roots.site, 'assets', 'scene.png'),
  )
})

test('maps shell files through their own isolated host', () => {
  assert.equal(
    resolveProtocolFile('quiet-route://shell/shell.css?v=1', roots),
    path.join(roots.shell, 'shell.css'),
  )
})

test('rejects unknown hosts', () => {
  assert.equal(
    resolveProtocolFile('quiet-route://unknown/index.html', roots),
    null,
  )
})

test('rejects encoded path traversal outside an allowed root', () => {
  assert.equal(
    resolveProtocolFile(
      'quiet-route://site/%2e%2e%2f%2e%2e%2fprivate.txt',
      roots,
    ),
    null,
  )
})

test('rejects malformed encoded paths without throwing', () => {
  assert.equal(
    resolveProtocolFile('quiet-route://site/%E0%A4%A', roots),
    null,
  )
})
