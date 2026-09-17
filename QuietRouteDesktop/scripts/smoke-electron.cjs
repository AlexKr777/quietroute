const fs = require('node:fs')
const path = require('node:path')

const port = Number(process.argv[2] ?? 9333)
const screenshotPath = process.argv[3]

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl)
  const pending = new Map()
  const events = []
  let nextId = 1

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id)
      if (message.error) request.reject(new Error(message.error.message))
      else request.resolve(message.result)
      return
    }

    events.push(message)
  })

  function send(method, params = {}) {
    const id = nextId++
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`CDP timeout: ${method}`))
      }, 8_000)

      pending.set(id, {
        resolve: (result) => {
          clearTimeout(timeout)
          resolve(result)
        },
        reject: (error) => {
          clearTimeout(timeout)
          reject(error)
        },
      })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }

  return {
    events,
    send,
    close: () => socket.close(),
  }
}

async function evaluate(client, expression, userGesture = false) {
  let result
  try {
    result = await client.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture,
    })
  } catch (error) {
    error.message = `${error.message}; expression: ${expression.slice(0, 90)}`
    throw error
  }
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? 'Runtime evaluation failed')
  }
  return result.result.value
}

async function poll(readValue, predicate, timeoutMs = 8_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const value = await readValue()
    if (predicate(value)) return value
    await wait(150)
  }
  throw new Error('Timed out waiting for the expected application state')
}

async function main() {
  const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json())
  const shellTarget = targets.find((target) => target.url === 'quiet-route://shell/index.html')
  const siteTarget = targets.find((target) => target.url.startsWith('quiet-route://site/'))
  assert(shellTarget, 'Shell CDP target was not found')
  assert(siteTarget, 'Site iframe CDP target was not found')

  const shell = await connectCdp(shellTarget.webSocketDebuggerUrl)
  const site = await connectCdp(siteTarget.webSocketDebuggerUrl)

  try {
    for (const client of [shell, site]) {
      await client.send('Runtime.enable')
      await client.send('Network.enable')
      await client.send('Log.enable')
    }
    await shell.send('Page.enable')

    const shellState = await evaluate(shell, `({
      title: document.title,
      bridge: typeof window.quietRouteDesktop,
      loadingHidden: document.querySelector('#loading-state').hidden,
      errorHidden: document.querySelector('#error-state').hidden,
      iframeUrl: document.querySelector('#quiet-route-site').src,
      width: window.outerWidth,
      height: window.outerHeight
    })`)
    assert(shellState.bridge === 'object', 'Preload bridge is unavailable')
    assert(shellState.errorHidden, 'Shell shows an error state')
    assert(shellState.iframeUrl.includes('desktopHost=1'), 'Desktop host mode is missing')
    await evaluate(shell, `(async () => {
      let state = await window.quietRouteDesktop.getState()
      if (state.alwaysOnTop) state = await window.quietRouteDesktop.toggleAlwaysOnTop()
      if (state.compact) state = await window.quietRouteDesktop.toggleCompact()
      return state
    })()`)

    const siteReady = await poll(
      () => evaluate(site, `({
        ready: document.body.dataset.sceneReady === 'true',
        desktopHost: document.body.dataset.desktopHost === 'true',
        fullscreenHidden: document.querySelector('#fullscreen-toggle').hidden,
        audioState: document.body.dataset.audioState || 'idle'
      })`),
      (state) => state.ready,
    )
    assert(siteReady.desktopHost, 'Site did not enter desktop-host mode')
    assert(siteReady.fullscreenHidden, 'Duplicate fullscreen control is visible')

    await evaluate(
      site,
      `document.querySelector('#enter-button').click(); true`,
      true,
    )
    const enteredState = await poll(
      () => evaluate(site, `({
        entered: document.body.dataset.entered === 'true',
        dockReady: document.body.dataset.dockReady === 'true',
        audioState: document.body.dataset.audioState || 'idle'
      })`),
      (state) => state.dockReady && state.audioState === 'running',
      12_000,
    )
    assert(enteredState.entered, 'Entry interaction did not complete')

    const pinOn = await evaluate(
      shell,
      `document.querySelector('#always-on-top').click();
       new Promise((resolve) => setTimeout(async () => resolve(await window.quietRouteDesktop.getState()), 200))`,
      true,
    )
    assert(pinOn.alwaysOnTop, 'Always-on-top did not enable')

    const pinOff = await evaluate(
      shell,
      `document.querySelector('#always-on-top').click();
       new Promise((resolve) => setTimeout(async () => resolve(await window.quietRouteDesktop.getState()), 200))`,
      true,
    )
    assert(!pinOff.alwaysOnTop, 'Always-on-top did not disable')

    const compactState = await evaluate(
      shell,
      `document.querySelector('#compact-toggle').click();
       new Promise((resolve) => setTimeout(async () => resolve({
         state: await window.quietRouteDesktop.getState(),
         innerWidth: window.innerWidth,
         innerHeight: window.innerHeight,
         outerWidth: window.outerWidth,
         outerHeight: window.outerHeight,
         bodyState: document.body.dataset.compact
       }), 350))`,
      true,
    )
    assert(compactState.state.compact, 'Compact mode did not enable')
    assert(compactState.state.alwaysOnTop, 'Compact mode did not enable always-on-top')
    assert(compactState.bodyState === 'true', 'Compact UI state did not update')
    assert(compactState.innerWidth === 480, `Unexpected compact content width: ${compactState.innerWidth}`)
    assert(compactState.innerHeight === 360, `Unexpected compact content height: ${compactState.innerHeight}`)

    let compactScreenshotPath = null
    if (screenshotPath) {
      const extension = path.extname(screenshotPath)
      compactScreenshotPath = `${screenshotPath.slice(0, -extension.length)}-compact${extension}`
      const screenshot = await shell.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      })
      fs.mkdirSync(path.dirname(compactScreenshotPath), { recursive: true })
      fs.writeFileSync(compactScreenshotPath, Buffer.from(screenshot.data, 'base64'))
    }

    const restoredState = await evaluate(
      shell,
      `window.quietRouteDesktop.toggleCompact()`,
      true,
    )
    assert(!restoredState.compact, 'Normal window size did not restore')
    assert(!restoredState.alwaysOnTop, 'Auto compact always-on-top did not restore')

    if (screenshotPath) {
      const screenshot = await shell.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      })
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true })
      fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'))
    }

    const readAudioResponses = () => site.events
      .filter((event) => event.method === 'Network.responseReceived')
      .map((event) => event.params.response)
      .filter((response) => response.url.includes('/audio/'))
      .map((response) => ({ url: response.url, status: response.status }))
    const audioResponses = await poll(
      async () => readAudioResponses(),
      (responses) => responses.length > 0,
      12_000,
    )
    assert(
      audioResponses.every((response) => response.status === 200 || response.status === 206),
      'An audio request failed',
    )

    const runtimeErrors = [...shell.events, ...site.events].filter((event) => (
      event.method === 'Runtime.exceptionThrown' ||
      (event.method === 'Log.entryAdded' && event.params.entry.level === 'error')
    ))
    const runtimeErrorSummary = runtimeErrors.map((event) => (
      event.params.exceptionDetails?.exception?.description ??
      event.params.exceptionDetails?.text ??
      event.params.entry?.text ??
      event.method
    ))
    assert(
      runtimeErrors.length === 0,
      `Runtime errors observed: ${JSON.stringify(runtimeErrorSummary)}`,
    )

    console.log(JSON.stringify({
      shell: shellState,
      site: enteredState,
      compact: compactState,
      audioResponses,
      runtimeErrors: runtimeErrorSummary,
      screenshotPath: screenshotPath ?? null,
      compactScreenshotPath,
    }, null, 2))
  } finally {
    try {
      await evaluate(shell, `(async () => {
        let state = await window.quietRouteDesktop.getState()
        if (state.alwaysOnTop) state = await window.quietRouteDesktop.toggleAlwaysOnTop()
        if (state.compact) state = await window.quietRouteDesktop.toggleCompact()
        return state
      })()`)
    } catch {
      // Best-effort cleanup for an already-closing QA window.
    }
    shell.close()
    site.close()
  }
}

main().catch((error) => {
  console.error(error.stack ?? error.message)
  process.exitCode = 1
})
