const { pathToFileURL } = require('node:url')

const { resolveProtocolFile } = require('./protocol-path.cjs')

const SCHEME = 'quiet-route'

function registerProtocolPrivileges(protocol) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        codeCache: true,
      },
    },
  ])
}

function installProtocolHandler({ protocol, net, roots }) {
  protocol.handle(SCHEME, async (request) => {
    const filePath = resolveProtocolFile(request.url, roots)
    if (!filePath) {
      return new Response('not found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    }

    try {
      return await net.fetch(pathToFileURL(filePath).toString(), {
        headers: request.headers,
      })
    } catch {
      return new Response('not found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    }
  })
}

module.exports = {
  SCHEME,
  installProtocolHandler,
  registerProtocolPrivileges,
}
