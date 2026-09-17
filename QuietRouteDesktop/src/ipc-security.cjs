function isTrustedShellUrl(candidate) {
  try {
    const url = new URL(candidate)
    return url.protocol === 'quiet-route:' && url.hostname === 'shell'
  } catch {
    return false
  }
}

module.exports = { isTrustedShellUrl }
