const path = require('node:path')

function resolveProtocolFile(requestUrl, rootsByHost) {
  let parsedUrl
  try {
    parsedUrl = new URL(requestUrl)
  } catch {
    return null
  }

  if (parsedUrl.protocol !== 'quiet-route:') return null

  const root = rootsByHost[parsedUrl.hostname]
  if (!root) return null

  let decodedPath
  try {
    decodedPath = decodeURIComponent(parsedUrl.pathname)
  } catch {
    return null
  }

  if (decodedPath.includes('\0')) return null

  const relativeRequestPath = decodedPath.replace(/^[/\\]+/, '') || 'index.html'
  const absoluteRoot = path.resolve(root)
  const requestedFile = path.resolve(absoluteRoot, relativeRequestPath)
  const relativeFile = path.relative(absoluteRoot, requestedFile)

  if (
    relativeFile.startsWith('..') ||
    path.isAbsolute(relativeFile) ||
    relativeFile === ''
  ) {
    return null
  }

  return requestedFile
}

module.exports = { resolveProtocolFile }
