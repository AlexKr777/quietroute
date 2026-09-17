const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const {
  installProtocolHandler,
  registerProtocolPrivileges,
} = require('../src/app-protocol.cjs')

test('registers a secure standard scheme with media streaming support', () => {
  let schemes
  registerProtocolPrivileges({
    registerSchemesAsPrivileged: (value) => {
      schemes = value
    },
  })

  assert.deepEqual(schemes, [{
    scheme: 'quiet-route',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true,
    },
  }])
})

test('serves site files and forwards media range headers to Chromium networking', async () => {
  const roots = {
    shell: path.resolve('C:/quiet-route/shell'),
    site: path.resolve('C:/quiet-route/site'),
  }
  let handler
  let forwarded
  const protocol = {
    handle: (scheme, nextHandler) => {
      assert.equal(scheme, 'quiet-route')
      handler = nextHandler
    },
  }
  const net = {
    fetch: async (url, options) => {
      forwarded = { url, options }
      return new Response('audio', { status: 206 })
    },
  }

  installProtocolHandler({ protocol, net, roots })
  const headers = new Headers({ range: 'bytes=0-1023' })
  const response = await handler({
    url: 'quiet-route://site/audio/rain.mp3',
    headers,
  })

  assert.equal(response.status, 206)
  assert.equal(
    forwarded.url,
    pathToFileURL(path.join(roots.site, 'audio', 'rain.mp3')).toString(),
  )
  assert.equal(forwarded.options.headers, headers)
})

test('returns a local 404 response for unknown hosts', async () => {
  let handler
  installProtocolHandler({
    protocol: {
      handle: (_scheme, nextHandler) => {
        handler = nextHandler
      },
    },
    net: {
      fetch: async () => {
        throw new Error('networking should not run')
      },
    },
    roots: {
      shell: path.resolve('C:/quiet-route/shell'),
      site: path.resolve('C:/quiet-route/site'),
    },
  })

  const response = await handler({
    url: 'quiet-route://private/secrets.txt',
    headers: new Headers(),
  })

  assert.equal(response.status, 404)
  assert.equal(await response.text(), 'not found')
})
