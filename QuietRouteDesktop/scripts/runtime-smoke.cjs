const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')

const electronPath = require('electron')
const appDirectory = path.resolve(__dirname, '..')
const outputDirectory = path.join(appDirectory, 'output')
const runtimeProfileDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'quiet-route-runtime-'),
)
const audioPreferenceFixture = Object.freeze({
  masterVolume: '37',
  masterMuted: 'true',
  channelVolumes: Object.freeze({
    rain: '44',
    music: '27',
    tram: '19',
    wind: '12',
    night: '8',
    birds: '16',
    thunder: '23',
  }),
  channelPressed: Object.freeze({
    rain: 'true',
    music: 'false',
    tram: 'true',
    wind: 'false',
    night: 'true',
    birds: 'false',
    thunder: 'true',
  }),
})

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function removeRuntimeProfile() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      fs.rmSync(runtimeProfileDirectory, { recursive: true, force: true })
      return
    } catch (error) {
      if (!['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(error.code)) throw error
      await delay(250)
    }
  }

  console.warn(`Could not remove runtime profile: ${runtimeProfileDirectory}`)
}

async function readSocketMessage(data) {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8')
  }
  if (typeof data?.text === 'function') return data.text()
  return String(data)
}

class CdpClient {
  constructor(url) {
    this.url = url
    this.nextId = 1
    this.pending = new Map()
    this.socket = null
    this.events = []
  }

  async connect() {
    this.socket = new WebSocket(this.url)
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
    this.socket.addEventListener('message', async (event) => {
      const message = JSON.parse(await readSocketMessage(event.data))
      if (!message.id) {
        this.events.push(message)
        return
      }
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(message.error.message))
      else pending.resolve(message.result)
    })
  }

  send(method, params = {}) {
    const id = this.nextId
    this.nextId += 1
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed')
    }
    return result.result.value
  }

  close() {
    this.socket?.close()
  }

  getRuntimeErrors() {
    return this.events.filter((event) => (
      event.method === 'Runtime.exceptionThrown' ||
      (event.method === 'Runtime.consoleAPICalled' && event.params?.type === 'error')
    ))
  }

  getNetworkResponses(pattern) {
    return this.events
      .filter((event) => event.method === 'Network.responseReceived')
      .map((event) => event.params?.response)
      .filter((response) => response && pattern.test(response.url))
  }
}

async function waitForTargets(port, timeoutMilliseconds = 15_000) {
  const deadline = Date.now() + timeoutMilliseconds
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      const targets = await response.json()
      const shell = targets.find((target) => target.url === 'quiet-route://shell/index.html')
      const site = targets.find((target) => target.url.startsWith('quiet-route://site/index.html'))
      if (shell && site) return { shell, site }
    } catch {
      // Electron is still starting.
    }
    await delay(125)
  }
  throw new Error('Electron CDP targets did not become ready')
}

async function waitForValue(client, expression, predicate, timeoutMilliseconds = 10_000) {
  const deadline = Date.now() + timeoutMilliseconds
  let value
  while (Date.now() < deadline) {
    value = await client.evaluate(expression)
    if (predicate(value)) return value
    await delay(100)
  }
  throw new Error(`Timed out waiting for runtime value: ${JSON.stringify(value)}`)
}

async function waitForCondition(readValue, predicate, timeoutMilliseconds = 10_000) {
  const deadline = Date.now() + timeoutMilliseconds
  let value
  while (Date.now() < deadline) {
    value = await readValue()
    if (predicate(value)) return value
    await delay(100)
  }
  throw new Error(`Timed out waiting for condition: ${JSON.stringify(value)}`)
}

function startDesktopApp(port) {
  const environment = {
    ...process.env,
    QUIET_ROUTE_CDP_PORT: String(port),
    QUIET_ROUTE_TEST_USER_DATA: runtimeProfileDirectory,
  }
  delete environment.ELECTRON_RUN_AS_NODE

  const packagedExecutable = process.env.QUIET_ROUTE_EXECUTABLE
  const executable = packagedExecutable
    ? path.resolve(packagedExecutable)
    : electronPath
  const launchArguments = packagedExecutable ? [] : ['.']
  const output = []
  const child = spawn(executable, launchArguments, {
    cwd: appDirectory,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child.stdout.on('data', (chunk) => output.push(chunk.toString()))
  child.stderr.on('data', (chunk) => output.push(chunk.toString()))
  child.runtimeOutput = output
  return child
}

async function connectApp(port) {
  const targets = await waitForTargets(port)
  const shell = new CdpClient(targets.shell.webSocketDebuggerUrl)
  const site = new CdpClient(targets.site.webSocketDebuggerUrl)
  await Promise.all([shell.connect(), site.connect()])
  await Promise.all([
    shell.send('Runtime.enable'),
    shell.send('Page.enable'),
    site.send('Runtime.enable'),
    site.send('Page.enable'),
    site.send('Network.enable'),
  ])
  return { shell, site }
}

async function clickOnce(client, rectangle) {
  const x = rectangle.x + rectangle.width / 2
  const y = rectangle.y + rectangle.height / 2
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  })
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  })
}

async function dragPointer(client, rectangle, deltaX, deltaY) {
  const startX = rectangle.x + rectangle.width / 2
  const startY = rectangle.y + rectangle.height / 2
  const endX = startX + deltaX
  const endY = startY + deltaY
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: startX,
    y: startY,
  })
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: startX,
    y: startY,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  })
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: endX,
    y: endY,
    button: 'left',
    buttons: 1,
  })
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: endX,
    y: endY,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  })
}

async function clickTwice(client, rectangle) {
  const x = rectangle.x + rectangle.width / 2
  const y = rectangle.y + rectangle.height / 2
  for (const clickCount of [1, 2]) {
    await client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount,
    })
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount,
    })
  }
}

async function captureScreenshot(client, filename) {
  const result = await client.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
  })
  fs.mkdirSync(outputDirectory, { recursive: true })
  fs.writeFileSync(path.join(outputDirectory, filename), Buffer.from(result.data, 'base64'))
}

async function readSiteState(site) {
  return site.evaluate(`(() => {
    const controls = document.querySelector('#sound-controls')
    const handle = document.querySelector('#sound-drag-handle')
    const label = handle?.querySelector('.sound-controls__drag-label')
    const grip = handle?.querySelector('[data-desktop-mixer-grip="true"]')
    const gripDots = [...(grip?.querySelectorAll('i') ?? [])]
    const masterVolume = document.querySelector('#desktop-master-volume')
    const masterMute = document.querySelector('#master-mute')
    const rain = document.querySelector('[data-desktop-rain-overlay="true"]')
    const rainAudio = [...document.querySelectorAll('audio[data-desktop-rain-audio="true"]')]
    const rect = controls?.getBoundingClientRect()
    const readRect = (element) => {
      const box = element?.getBoundingClientRect()
      return box && { x: box.x, y: box.y, width: box.width, height: box.height }
    }
    let paintedRainPixels = 0
    let visibleStrongRainPixels = 0
    if (rain) {
      const pixels = rain.getContext('2d').getImageData(0, 0, rain.width, rain.height).data
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) paintedRainPixels += 1
      }
      const rainRect = rain.getBoundingClientRect()
      const scaleX = rain.width / rainRect.width
      const scaleY = rain.height / rainRect.height
      const visibleLeft = Math.max(0, rainRect.left)
      const visibleTop = Math.max(0, rainRect.top)
      const visibleRight = Math.min(innerWidth, rainRect.right)
      const visibleBottom = Math.min(innerHeight, rainRect.bottom)
      const sourceX = Math.max(0, Math.floor((visibleLeft - rainRect.left) * scaleX))
      const sourceY = Math.max(0, Math.floor((visibleTop - rainRect.top) * scaleY))
      const sourceWidth = Math.max(1, Math.min(
        rain.width - sourceX,
        Math.ceil((visibleRight - visibleLeft) * scaleX),
      ))
      const sourceHeight = Math.max(1, Math.min(
        rain.height - sourceY,
        Math.ceil((visibleBottom - visibleTop) * scaleY),
      ))
      const visiblePixels = rain.getContext('2d')
        .getImageData(sourceX, sourceY, sourceWidth, sourceHeight).data
      for (let index = 3; index < visiblePixels.length; index += 4) {
        if (visiblePixels[index] >= 24) visibleStrongRainPixels += 1
      }
    }
    return {
      viewport: { width: innerWidth, height: innerHeight },
      entered: document.body.dataset.entered,
      collapsed: document.body.classList.contains('desktop-mixer-collapsed'),
      expandedSounds: controls?.dataset.expanded,
      controlsText: label?.textContent.replace(/\\s+/g, ' ').trim(),
      controlsRect: rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      handleRect: readRect(handle),
      labelRect: readRect(label),
      gripRect: readRect(grip),
      gripDotRects: gripDots.map(readRect),
      gripOpacity: grip && getComputedStyle(grip).opacity,
      gripCursor: grip && getComputedStyle(grip).cursor,
      masterVolume: masterVolume && {
        value: masterVolume.value,
        rangeValue: masterVolume.style.getPropertyValue('--range-value'),
        effective: document.body.dataset.desktopMasterVolume,
      },
      masterMuted: masterMute && {
        pressed: masterMute.getAttribute('aria-pressed'),
        active: masterMute.dataset.active,
      },
      channelVolumes: Object.fromEntries(
        ['rain', 'music', 'tram', 'wind', 'night', 'birds', 'thunder']
          .map((channel) => [channel, document.querySelector('#' + channel + '-volume')?.value]),
      ),
      channelPressed: Object.fromEntries(
        ['rain', 'music', 'tram', 'wind', 'night', 'birds', 'thunder']
          .map((channel) => [channel, document.querySelector('#' + channel + '-toggle')?.getAttribute('aria-pressed')]),
      ),
      dock: {
        x: controls?.style.getPropertyValue('--dock-x'),
        y: controls?.style.getPropertyValue('--dock-y'),
      },
      visibleRows: [...document.querySelectorAll('.sound-controls__row')]
        .filter((row) => getComputedStyle(row).display !== 'none').length,
      track: document.body.dataset.musicTrack,
      rainApi: typeof window.QuietRouteDesktopRain?.initDesktopRainOverlay,
      sceneCanvasPresent: Boolean(document.querySelector('#scene-canvas')),
      rain: rain && {
        width: rain.width,
        height: rain.height,
        clipPath: rain.style.clipPath,
        opacity: getComputedStyle(rain).opacity,
        paintedRainPixels,
        visibleStrongRainPixels,
      },
      rainAudio: rainAudio.map((audio) => ({
        duration: audio.duration,
        currentTime: audio.currentTime,
        paused: audio.paused,
        readyState: audio.readyState,
        source: audio.currentSrc,
      })),
      birdsPressed: document.querySelector('#birds-toggle')?.getAttribute('aria-pressed'),
      windPressed: document.querySelector('#wind-toggle')?.getAttribute('aria-pressed'),
      windState: document.body.dataset.desktopWindState,
      thunderState: document.body.dataset.desktopThunderState,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    }
  })()`)
}

async function closeApp(shell, child) {
  try {
    await shell.evaluate(`document.querySelector('#close-window')?.click()`)
  } catch {
    // Closing the renderer can race the CDP response.
  }
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(5_000),
  ])
  if (child.exitCode === null) child.kill()
}

function matchesAudioPreferenceFixture(value) {
  return (
    value?.masterVolume?.value === audioPreferenceFixture.masterVolume &&
    value?.masterVolume?.rangeValue === `${audioPreferenceFixture.masterVolume}%` &&
    value?.masterMuted?.pressed === audioPreferenceFixture.masterMuted &&
    Object.entries(audioPreferenceFixture.channelVolumes)
      .every(([channel, expected]) => value?.channelVolumes?.[channel] === expected) &&
    Object.entries(audioPreferenceFixture.channelPressed)
      .every(([channel, expected]) => value?.channelPressed?.[channel] === expected)
  )
}

async function setPersistentAudioFixture(site) {
  await site.evaluate(`(() => {
    const fixture = ${JSON.stringify(audioPreferenceFixture)}
    const setRange = (id, value) => {
      const input = document.querySelector(id)
      if (!input) return
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const setPressed = (id, pressed) => {
      const button = document.querySelector(id)
      if (!button) return
      if (button.getAttribute('aria-pressed') !== pressed) button.click()
    }

    setRange('#desktop-master-volume', fixture.masterVolume)
    setPressed('#master-mute', fixture.masterMuted)
    for (const [channel, value] of Object.entries(fixture.channelVolumes)) {
      setRange('#' + channel + '-volume', value)
    }
    for (const [channel, pressed] of Object.entries(fixture.channelPressed)) {
      setPressed('#' + channel + '-toggle', pressed)
    }
  })()`)

  return waitForValue(
    site,
    `(() => {
      const masterVolume = document.querySelector('#desktop-master-volume')
      const masterMute = document.querySelector('#master-mute')
      const channels = ['rain', 'music', 'tram', 'wind', 'night', 'birds', 'thunder']
      return {
        masterVolume: masterVolume && {
          value: masterVolume.value,
          rangeValue: masterVolume.style.getPropertyValue('--range-value'),
          effective: document.body.dataset.desktopMasterVolume,
        },
        masterMuted: masterMute && {
          pressed: masterMute.getAttribute('aria-pressed'),
          active: masterMute.dataset.active,
        },
        channelVolumes: Object.fromEntries(
          channels.map((channel) => [channel, document.querySelector('#' + channel + '-volume')?.value]),
        ),
        channelPressed: Object.fromEntries(
          channels.map((channel) => [channel, document.querySelector('#' + channel + '-toggle')?.getAttribute('aria-pressed')]),
        ),
      }
    })()`,
    matchesAudioPreferenceFixture,
    3_000,
  )
}

async function runFirstLaunch(port) {
  const child = startDesktopApp(port)
  let shell
  let site
  try {
    ;({ shell, site } = await connectApp(port))

    await waitForValue(
      site,
      `document.body.dataset.sceneReady === 'true'`,
      Boolean,
    )

    const shellState = await shell.evaluate(`(() => {
      const clock = document.querySelector('#live-clock')
      const bar = document.querySelector('.titlebar')
      const scene = document.querySelector('.scene-host')
      const clockRect = clock?.getBoundingClientRect()
      const sceneRect = scene?.getBoundingClientRect()
      return {
        title: document.title,
        clock: clock?.textContent,
        expectedClock: new Intl.DateTimeFormat('ru-RU', {
          hour: '2-digit', minute: '2-digit', hour12: false,
        }).format(new Date()),
        clockFont: getComputedStyle(clock).fontFamily,
        clockFontLoaded: document.fonts.check('16px "Quiet Route Clock"'),
        titlebarHeight: bar?.getBoundingClientRect().height,
        clockParentClass: clock?.parentElement?.className,
        masterSoundParentClass: document.querySelector('#master-sound')?.parentElement?.className,
        clockRect: clockRect && {
          x: clockRect.x,
          y: clockRect.y,
          width: clockRect.width,
          height: clockRect.height,
        },
        sceneRect: sceneRect && {
          x: sceneRect.x,
          y: sceneRect.y,
          width: sceneRect.width,
          height: sceneRect.height,
        },
      }
    })()`)

    assert.equal(shellState.title, 'Тихий маршрут')
    assert.equal(shellState.clock, shellState.expectedClock)
    assert.equal(shellState.clockFontLoaded, true)
    assert.match(shellState.clockFont, /Quiet Route Clock/)
    assert.equal(shellState.titlebarHeight, 28)
    assert.equal(shellState.clockParentClass, 'scene-clock-widget')
    assert.equal(shellState.masterSoundParentClass, 'scene-host')
    assert.ok(shellState.clockRect.y >= shellState.sceneRect.y)
    assert.ok(shellState.clockRect.y + shellState.clockRect.height <= shellState.sceneRect.y + shellState.sceneRect.height)

    const desktopBridgeProbe = await shell.evaluate(`(
      window.quietRouteDesktop?.getState()
        .then((state) => ({ state }))
        .catch((error) => ({ error: String(error), stack: error?.stack }))
    )`)
    assert.ok(desktopBridgeProbe?.state, JSON.stringify(desktopBridgeProbe))

    await shell.evaluate(`document.querySelector('#always-on-top')?.click()`)
    const pressedPinStyle = await waitForValue(
      shell,
      `(() => {
        const button = document.querySelector('#always-on-top')
        const style = button && getComputedStyle(button)
        return {
          pressed: button?.getAttribute('aria-pressed'),
          color: style?.color,
          backgroundColor: style?.backgroundColor,
        }
      })()`,
      (value) => value.pressed === 'true',
    )
    assert.notEqual(pressedPinStyle.color, 'rgb(214, 161, 93)')
    assert.notEqual(pressedPinStyle.color, 'rgb(237, 192, 128)')
    assert.notEqual(pressedPinStyle.backgroundColor, 'rgb(214, 161, 93)')
    await shell.evaluate(`document.querySelector('#always-on-top')?.click()`)
    await waitForValue(
      shell,
      `document.querySelector('#always-on-top')?.getAttribute('aria-pressed')`,
      (value) => value === 'false',
    )

    const startingTrack = await site.evaluate(`document.body.dataset.musicTrack`)
    assert.ok(startingTrack)

    await site.evaluate(`document.querySelector('#enter-button')?.click()`)
    await waitForValue(
      site,
      `document.querySelector('#sound-controls')?.getAttribute('aria-hidden')`,
      (value) => value === null,
      8_000,
    )
    const recordedRain = await waitForValue(
      site,
      `(() => {
        const audio = [...document.querySelectorAll('audio[data-desktop-rain-audio="true"]')]
          .find((item) => !item.paused)
        return audio && {
          duration: audio.duration,
          currentTime: audio.currentTime,
          paused: audio.paused,
          readyState: audio.readyState,
          source: audio.currentSrc,
        }
      })()`,
      (value) => value && value.readyState >= 2 && value.duration >= 540 && !value.paused,
      15_000,
    )
    assert.match(recordedRain.source, /\/audio\/gentle-outdoor-rain\.mp3$/)
    const startingMusicResponse = await waitForCondition(
      () => site.getNetworkResponses(
        new RegExp(`/audio/lofi/${startingTrack}\\.mp3(?:$|\\?)`),
      ).at(-1),
      (value) => value && [200, 206].includes(value.status),
      8_000,
    )
    assert.match(startingMusicResponse.mimeType, /^audio\//)
    const mixBeforeMasterChange = await readSiteState(site)
    assert.deepEqual(mixBeforeMasterChange.masterVolume, {
      value: '100',
      rangeValue: '100%',
      effective: '1',
    })
    await site.evaluate(`(() => {
      const master = document.querySelector('#desktop-master-volume')
      if (!master) return
      master.value = '0'
      master.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await waitForValue(
      site,
      `document.body.dataset.desktopMasterVolume`,
      (value) => value === '0',
    )
    const mixAtSilence = await readSiteState(site)
    assert.deepEqual(mixAtSilence.channelVolumes, mixBeforeMasterChange.channelVolumes)
    await site.evaluate(`(() => {
      const master = document.querySelector('#desktop-master-volume')
      if (!master) return
      master.value = '100'
      master.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await waitForValue(
      site,
      `document.body.dataset.desktopMasterVolume`,
      (value) => value === '1',
    )
    await captureScreenshot(shell, 'normal-scene.png')
    await site.evaluate(`(() => {
      const audio = [...document.querySelectorAll('audio[data-desktop-rain-audio="true"]')]
        .find((item) => !item.paused)
      if (audio) {
        Object.defineProperty(audio, 'duration', {
          configurable: true,
          writable: true,
          value: audio.currentTime + 10,
        })
      }
    })()`)
    await waitForValue(
      site,
      `[...document.querySelectorAll('audio[data-desktop-rain-audio="true"]')]
        .map((item) => ({
          paused: item.paused,
          currentTime: item.currentTime,
          duration: item.duration,
          readyState: item.readyState,
          source: item.currentSrc,
        }))`,
      (value) => value.filter((item) => !item.paused).length === 2,
      5_000,
    )
    await site.evaluate(`(() => {
      const outgoing = [...document.querySelectorAll('audio[data-desktop-rain-audio="true"]')]
        .find((item) => !item.paused && Object.hasOwn(item, 'duration'))
      if (outgoing) outgoing.duration = outgoing.currentTime + 0.5
    })()`)
    const rainAfterCrossfade = await waitForValue(
      site,
      `(() => {
        const playing = [...document.querySelectorAll('audio[data-desktop-rain-audio="true"]')]
          .filter((item) => !item.paused)
        return {
          playing: playing.length,
          currentTime: playing[0]?.currentTime,
          source: playing[0]?.currentSrc,
        }
      })()`,
      (value) => value.playing === 1 && value.currentTime < 5,
      8_000,
    )
    assert.match(rainAfterCrossfade.source, /\/audio\/gentle-outdoor-rain\.mp3$/)
    await site.evaluate(`(() => {
      const decks = [...document.querySelectorAll('audio[data-desktop-rain-audio="true"]')]
      const active = decks.find((item) => !item.paused)
      const standby = decks.find((item) => item.paused)
      if (!active || !standby) return
      Object.defineProperty(active, 'duration', {
        configurable: true,
        writable: true,
        value: active.currentTime + 10,
      })
      standby.__quietRouteOriginalPlay = standby.play
      standby.play = () => Promise.reject(new DOMException('simulated deck failure', 'NotAllowedError'))
    })()`)
    const rainFallback = await waitForValue(
      site,
      `(() => {
        const active = [...document.querySelectorAll('audio[data-desktop-rain-audio="true"]')]
          .find((item) => !item.paused)
        return {
          state: document.body.dataset.desktopRainAudioState,
          error: document.body.dataset.desktopRainAudioError,
          activeLoop: active?.loop,
          retryVisible: !document.querySelector('#audio-retry')?.hidden,
        }
      })()`,
      (value) => value.state === 'fallback-loop' && value.activeLoop && value.retryVisible,
      5_000,
    )
    assert.equal(rainFallback.error, 'NotAllowedError')
    await site.evaluate(`(() => {
      const decks = [...document.querySelectorAll('audio[data-desktop-rain-audio="true"]')]
      const broken = decks.find((item) => item.__quietRouteOriginalPlay)
      const active = decks.find((item) => !item.paused)
      if (broken) {
        broken.play = broken.__quietRouteOriginalPlay
        delete broken.__quietRouteOriginalPlay
      }
      if (active) delete active.duration
      document.querySelector('#audio-retry')?.click()
    })()`)
    await waitForValue(
      site,
      `({
        state: document.body.dataset.desktopRainAudioState,
        retryHidden: document.querySelector('#audio-retry')?.hidden,
      })`,
      (value) => value.state === 'playing' && value.retryHidden,
      5_000,
    )

    assert.equal(site.getNetworkResponses(/\/audio\/birds\.mp3(?:$|\?)/).length, 0)
    await site.evaluate(`document.querySelector('#birds-toggle')?.click()`)
    await waitForValue(
      site,
      `document.querySelector('#birds-toggle')?.getAttribute('aria-pressed')`,
      (value) => value === 'true',
    )
    const birdsResponse = await waitForCondition(
      () => site.getNetworkResponses(/\/audio\/birds\.mp3(?:$|\?)/).at(-1),
      (value) => value && [200, 206].includes(value.status),
      8_000,
    )
    assert.match(birdsResponse.mimeType, /^audio\//)
    await delay(600)
    const birdsState = await site.evaluate(`({
      pressed: document.querySelector('#birds-toggle')?.getAttribute('aria-pressed'),
      status: document.querySelector('#audio-status')?.textContent,
    })`)
    assert.equal(birdsState.pressed, 'true')
    assert.doesNotMatch(birdsState.status ?? '', /недоступ/)
    await site.evaluate(`document.querySelector('#birds-toggle')?.click()`)

    await site.evaluate(`document.querySelector('#wind-toggle')?.click()`)
    const windState = await waitForValue(
      site,
      `document.body.dataset.desktopWindState`,
      (value) => value === 'playing',
      5_000,
    )
    await site.evaluate(`document.querySelector('#wind-toggle')?.click()`)
    await waitForValue(
      site,
      `document.body.dataset.desktopWindState`,
      (value) => value === 'idle',
      5_000,
    )

    await shell.evaluate(`document.querySelector('#compact-toggle')?.click()`)
    const compactShellState = await waitForValue(
      shell,
      `({
        width: innerWidth,
        compact: document.body.dataset.compact,
        alwaysOnTop: document.body.dataset.alwaysOnTop,
        pinPressed: document.querySelector('#always-on-top')?.getAttribute('aria-pressed'),
      })`,
      (value) => value.width <= 520 && value.compact === 'true' && value.alwaysOnTop === 'true',
    )
    assert.equal(compactShellState.pinPressed, 'true')
    await waitForValue(
      site,
      `(() => {
        const controls = document.querySelector('#sound-controls')
        const box = controls?.getBoundingClientRect()
        return {
          width: innerWidth,
          collapsed: document.body.classList.contains('desktop-mixer-collapsed'),
          visibleRows: [...document.querySelectorAll('.sound-controls__row')]
            .filter((row) => getComputedStyle(row).display !== 'none').length,
          right: box && innerWidth - box.right,
          bottom: box && innerHeight - box.bottom,
          dockBridge: typeof window.QuietRouteDesktopDock?.moveTo,
        }
      })()`,
      (value) => (
        value.width <= 520 &&
        value.collapsed &&
        value.right >= 8 && value.right <= 24 &&
        value.bottom >= 8 && value.bottom <= 24 &&
        value.dockBridge === 'function'
      ),
      3_000,
    )

    const compactWindow = await shell.evaluate(`({
      screenX,
      screenY,
      outerWidth,
      outerHeight,
      availLeft: screen.availLeft,
      availTop: screen.availTop,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
    })`)
    const compactRightGap = compactWindow.availLeft + compactWindow.availWidth
      - compactWindow.screenX - compactWindow.outerWidth
    const compactBottomGap = compactWindow.availTop + compactWindow.availHeight
      - compactWindow.screenY - compactWindow.outerHeight
    assert.ok(compactRightGap >= 0 && compactRightGap <= 64, JSON.stringify(compactWindow))
    assert.ok(compactBottomGap >= 60 && compactBottomGap <= 76, JSON.stringify(compactWindow))

    const firstCompactCollapsedState = await readSiteState(site)
    assert.equal(firstCompactCollapsedState.collapsed, true)
    assert.ok(firstCompactCollapsedState.controlsRect.width <= 76)
    await captureScreenshot(shell, 'compact-first-collapsed.png')

    await clickOnce(site, firstCompactCollapsedState.labelRect)
    await waitForValue(
      site,
      `(() => ({
        collapsed: document.body.classList.contains('desktop-mixer-collapsed'),
        visibleRows: [...document.querySelectorAll('.sound-controls__row')]
          .filter((row) => getComputedStyle(row).display !== 'none').length,
      }))()`,
      (value) => !value.collapsed && value.visibleRows === 8,
      3_000,
    )
    await delay(350)

    const firstCompactExpandedState = await readSiteState(site)
    assert.equal(firstCompactExpandedState.collapsed, false)
    assert.equal(firstCompactExpandedState.visibleRows, 8)
    await captureScreenshot(shell, 'compact-opened-from-chip.png')

    await clickOnce(site, firstCompactExpandedState.labelRect)
    await waitForValue(
      site,
      `(() => {
        const controls = document.querySelector('#sound-controls')
        const box = controls?.getBoundingClientRect()
        return box && {
          collapsed: document.body.classList.contains('desktop-mixer-collapsed'),
          right: innerWidth - box.right,
          bottom: innerHeight - box.bottom,
        }
      })()`,
      (value) => (
        value.collapsed &&
        value.right >= 8 && value.right <= 24 &&
        value.bottom >= 8 && value.bottom <= 24
      ),
      3_000,
    )

    const collapsedState = await readSiteState(site)
    assert.equal(collapsedState.horizontalOverflow, false)
    assert.equal(collapsedState.collapsed, true)
    assert.equal(collapsedState.controlsText, 'звук')
    assert.ok(collapsedState.controlsRect.width <= 76)
    const mixerRightInset = collapsedState.viewport.width
      - collapsedState.controlsRect.x - collapsedState.controlsRect.width
    const mixerBottomInset = collapsedState.viewport.height
      - collapsedState.controlsRect.y - collapsedState.controlsRect.height
    assert.ok(mixerRightInset >= 8 && mixerRightInset <= 24, JSON.stringify(collapsedState.controlsRect))
    assert.ok(mixerBottomInset >= 8 && mixerBottomInset <= 24, JSON.stringify(collapsedState.controlsRect))
    assert.ok(collapsedState.gripRect.width > 0)
    assert.equal(collapsedState.gripCursor, 'grab')
    const controlsCenterX = collapsedState.controlsRect.x
      + collapsedState.controlsRect.width / 2
    const labelCenterX = collapsedState.labelRect.x
      + collapsedState.labelRect.width / 2
    assert.ok(
      Math.abs(controlsCenterX - labelCenterX) <= 2,
      JSON.stringify({
        controlsRect: collapsedState.controlsRect,
        handleRect: collapsedState.handleRect,
        labelRect: collapsedState.labelRect,
        gripRect: collapsedState.gripRect,
      }),
    )
    assert.equal(collapsedState.gripDotRects.length, 3)
    const gripDotCenters = collapsedState.gripDotRects.map((rect) => ({
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    }))
    assert.ok(gripDotCenters[0].x < gripDotCenters[1].x)
    assert.ok(gripDotCenters[1].x < gripDotCenters[2].x)
    assert.ok(Math.abs(gripDotCenters[0].y - gripDotCenters[1].y) <= 1)
    assert.ok(Math.abs(gripDotCenters[1].y - gripDotCenters[2].y) <= 1)
    assert.ok(collapsedState.rain, `Rain overlay missing: ${JSON.stringify(collapsedState)}`)
    assert.equal(collapsedState.rain.width, 640)
    assert.equal(collapsedState.rain.height, 360)
    assert.match(collapsedState.rain.clipPath, /^polygon\(/)
    assert.ok(Number(collapsedState.rain.opacity) >= 0.82)
    assert.ok(collapsedState.rain.paintedRainPixels > 500)
    assert.ok(collapsedState.rain.visibleStrongRainPixels > 250)

    await site.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: collapsedState.gripRect.x + collapsedState.gripRect.width / 2,
      y: collapsedState.gripRect.y + collapsedState.gripRect.height / 2,
    })
    await waitForValue(
      site,
      `getComputedStyle(document.querySelector('[data-desktop-mixer-grip="true"]')).opacity`,
      (value) => Number(value) >= 0.7,
    )
    await captureScreenshot(shell, 'compact-collapsed.png')

    const dockBeforeLabelDrag = collapsedState.dock
    await dragPointer(site, collapsedState.labelRect, -42, -24)
    await waitForValue(
      site,
      `(() => {
        const controls = document.querySelector('#sound-controls')
        const box = controls?.getBoundingClientRect()
        return { x: box?.x, collapsed: document.body.classList.contains('desktop-mixer-collapsed') }
      })()`,
      (value) => value.x < collapsedState.controlsRect.x - 20 && value.collapsed,
    )
    const afterLabelDrag = await readSiteState(site)
    assert.ok(
      afterLabelDrag.dock.x !== dockBeforeLabelDrag.x ||
      afterLabelDrag.dock.y !== dockBeforeLabelDrag.y,
    )
    assert.equal(afterLabelDrag.collapsed, true)

    const gripDragX = afterLabelDrag.controlsRect.x <= 40 ? 48 : -48
    const gripDragY = afterLabelDrag.controlsRect.y <= 40 ? 28 : -28
    await dragPointer(site, afterLabelDrag.gripRect, gripDragX, gripDragY)
    const afterGripDrag = await waitForValue(
      site,
      `(() => {
        const controls = document.querySelector('#sound-controls')
        const box = controls?.getBoundingClientRect()
        return {
          x: box?.x,
          y: box?.y,
          dockX: controls?.style.getPropertyValue('--dock-x'),
          dockY: controls?.style.getPropertyValue('--dock-y'),
        }
      })()`,
      (value) => (
        Math.abs(value.x - afterLabelDrag.controlsRect.x) > 20 ||
        Math.abs(value.y - afterLabelDrag.controlsRect.y) > 20
      ),
    )
    assert.ok(
      afterGripDrag.dockX !== afterLabelDrag.dock.x ||
      afterGripDrag.dockY !== afterLabelDrag.dock.y,
    )

    await delay(500)
    const collapsedAfterDrag = await readSiteState(site)
    await clickOnce(site, collapsedAfterDrag.labelRect)
    await waitForValue(
      site,
      `!document.body.classList.contains('desktop-mixer-collapsed')`,
      Boolean,
    )
    await delay(350)

    const expandedState = await readSiteState(site)
    assert.equal(expandedState.collapsed, false)
    assert.ok(expandedState.controlsRect.width <= 272)
    assert.equal(expandedState.visibleRows, 8)
    assert.equal(expandedState.horizontalOverflow, false)
    await captureScreenshot(shell, 'compact-expanded.png')

    await dragPointer(site, { x: 18, y: 18, width: 4, height: 4 }, 34, 22)
    await delay(150)
    assert.equal(
      await site.evaluate(`document.body.classList.contains('desktop-mixer-collapsed')`),
      false,
    )

    const pinRect = await shell.evaluate(`(() => {
      const box = document.querySelector('#always-on-top')?.getBoundingClientRect()
      return box && { x: box.x, y: box.y, width: box.width, height: box.height }
    })()`)
    await clickOnce(shell, pinRect)
    await waitForValue(
      shell,
      `document.body.dataset.alwaysOnTop`,
      (value) => value === 'false',
    )
    assert.equal(
      await site.evaluate(`document.body.classList.contains('desktop-mixer-collapsed')`),
      false,
    )

    await site.evaluate(`document.querySelector('#thunder-toggle')?.click()`)
    const thunderState = await waitForValue(
      site,
      `document.body.dataset.desktopThunderState`,
      (value) => value === 'playing',
      5_000,
    )
    assert.equal(thunderState, 'playing')
    await site.evaluate(`document.querySelector('#thunder-toggle')?.click()`)

    const musicRect = await site.evaluate(`(() => {
      const box = document.querySelector('#music-toggle').getBoundingClientRect()
      return { x: box.x, y: box.y, width: box.width, height: box.height }
    })()`)
    await clickTwice(site, musicRect)
    const cycledTrack = await waitForValue(
      site,
      `document.body.dataset.musicTrack`,
      (value) => value && value !== startingTrack,
    )
    assert.notEqual(cycledTrack, startingTrack)
    const cycledMusicResponse = await waitForCondition(
      () => site.getNetworkResponses(
        new RegExp(`/audio/lofi/${cycledTrack}\\.mp3(?:$|\\?)`),
      ).at(-1),
      (value) => value && [200, 206].includes(value.status),
      8_000,
    )
    assert.match(cycledMusicResponse.mimeType, /^audio\//)

    await site.evaluate(`(() => {
      const controls = document.querySelector('#sound-controls')
      const start = controls?.getBoundingClientRect()
      if (!controls || !start) return
      const startedAt = performance.now()
      const samples = []
      const threshold = 2
      let firstPositionMoveAt = null
      let firstSizeChangeAt = null
      const sample = () => {
        const box = controls.getBoundingClientRect()
        const elapsed = performance.now() - startedAt
        if (
          firstPositionMoveAt === null &&
          (Math.abs(box.x - start.x) > threshold || Math.abs(box.y - start.y) > threshold)
        ) {
          firstPositionMoveAt = elapsed
        }
        if (
          firstSizeChangeAt === null &&
          (Math.abs(box.width - start.width) > threshold || Math.abs(box.height - start.height) > threshold)
        ) {
          firstSizeChangeAt = elapsed
        }
        samples.push({
          t: Math.round(elapsed),
          x: Math.round(box.x),
          y: Math.round(box.y),
          width: Math.round(box.width),
          height: Math.round(box.height),
          collapsed: document.body.classList.contains('desktop-mixer-collapsed'),
        })
        window.__quietRouteCollapseMotion = {
          done: elapsed >= 900,
          firstPositionMoveAt,
          firstSizeChangeAt,
          samples,
        }
        if (elapsed < 900) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })()`)
    await clickOnce(site, { x: 18, y: 18, width: 4, height: 4 })
    const restoredCollapsedState = await waitForValue(
      site,
      `(() => {
        const controls = document.querySelector('#sound-controls')
        const box = controls?.getBoundingClientRect()
        return box && {
          collapsed: document.body.classList.contains('desktop-mixer-collapsed'),
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
        }
      })()`,
      (value) => (
        value.collapsed &&
        Math.abs(value.x - collapsedAfterDrag.controlsRect.x) <= 1 &&
        Math.abs(value.y - collapsedAfterDrag.controlsRect.y) <= 1
      ),
      3_000,
    )
    const collapseMotion = await waitForValue(
      site,
      `window.__quietRouteCollapseMotion`,
      (value) => value?.done,
      2_000,
    )
    assert.ok(
      collapseMotion.firstPositionMoveAt !== null && collapseMotion.firstPositionMoveAt <= 240,
      JSON.stringify(collapseMotion),
    )
    await captureScreenshot(shell, 'compact-restored.png')

    await shell.evaluate(`document.querySelector('#compact-toggle')?.click()`)
    await waitForValue(
      shell,
      `({ compact: document.body.dataset.compact, alwaysOnTop: document.body.dataset.alwaysOnTop })`,
      (value) => value.compact === 'false' && value.alwaysOnTop === 'false',
    )
    await shell.evaluate(`document.querySelector('#compact-toggle')?.click()`)
    await waitForValue(
      shell,
      `({ compact: document.body.dataset.compact, alwaysOnTop: document.body.dataset.alwaysOnTop })`,
      (value) => value.compact === 'true' && value.alwaysOnTop === 'true',
    )
    const secondCompactCollapsedState = await waitForValue(
      site,
      `(() => {
        const controls = document.querySelector('#sound-controls')
        const box = controls?.getBoundingClientRect()
        return {
          width: innerWidth,
          collapsed: document.body.classList.contains('desktop-mixer-collapsed'),
          controlsRect: box && { x: box.x, y: box.y, width: box.width, height: box.height },
          right: box && innerWidth - box.right,
          bottom: box && innerHeight - box.bottom,
        }
      })()`,
      (value) => (
        value.width <= 520 &&
        value.collapsed &&
        value.right >= 8 && value.right <= 24 &&
        value.bottom >= 8 && value.bottom <= 24
      ),
      3_000,
    )
    assert.ok(secondCompactCollapsedState.controlsRect.width <= 76)

    const persistedAudioState = await setPersistentAudioFixture(site)

    assert.deepEqual(shell.getRuntimeErrors(), [])
    assert.deepEqual(site.getRuntimeErrors(), [])

    return {
      child,
      shell,
      site,
      startingTrack,
      cycledTrack,
      shellState,
      compactShellState,
      compactWindow,
      firstCompactCollapsedState,
      firstCompactExpandedState,
      collapsedState,
      expandedState,
      restoredCollapsedState,
      collapseMotion,
      secondCompactCollapsedState,
      persistedAudioState,
      recordedRain,
      startingMusicResponse,
      cycledMusicResponse,
      rainAfterCrossfade,
      rainFallback,
      birdsResponse,
      birdsState,
      windState,
      thunderState,
    }
  } catch (error) {
    if (child.exitCode === null) child.kill()
    const rendererErrors = {
      shell: shell?.getRuntimeErrors?.() ?? [],
      site: site?.getRuntimeErrors?.() ?? [],
    }
    if (rendererErrors.shell.length > 0 || rendererErrors.site.length > 0) {
      error.message += `\nRenderer errors:\n${JSON.stringify(rendererErrors, null, 2)}`
    }
    const runtimeOutput = child.runtimeOutput.join('').trim()
    if (runtimeOutput) error.message += `\nElectron output:\n${runtimeOutput}`
    throw error
  }
}

async function readSecondLaunchState(port) {
  const child = startDesktopApp(port)
  let shell
  let site
  try {
    ;({ shell, site } = await connectApp(port))
    await waitForValue(
      site,
      `document.body.dataset.sceneReady === 'true'`,
      Boolean,
    )
    const track = await waitForValue(
      site,
      `document.body.dataset.musicTrack`,
      Boolean,
    )
    const restoredAudioState = await waitForValue(
      site,
      `(() => {
        const masterVolume = document.querySelector('#desktop-master-volume')
        const masterMute = document.querySelector('#master-mute')
        const channels = ['rain', 'music', 'tram', 'wind', 'night', 'birds', 'thunder']
        return {
          masterVolume: masterVolume && {
            value: masterVolume.value,
            rangeValue: masterVolume.style.getPropertyValue('--range-value'),
            effective: document.body.dataset.desktopMasterVolume,
          },
          masterMuted: masterMute && {
            pressed: masterMute.getAttribute('aria-pressed'),
            active: masterMute.dataset.active,
          },
          channelVolumes: Object.fromEntries(
            channels.map((channel) => [channel, document.querySelector('#' + channel + '-volume')?.value]),
          ),
          channelPressed: Object.fromEntries(
            channels.map((channel) => [channel, document.querySelector('#' + channel + '-toggle')?.getAttribute('aria-pressed')]),
          ),
          entered: document.body.dataset.entered,
        }
      })()`,
      (value) => value.entered !== 'true' && matchesAudioPreferenceFixture(value),
      5_000,
    )
    return { child, shell, site, track, restoredAudioState }
  } catch (error) {
    if (child.exitCode === null) child.kill()
    throw error
  }
}

async function main() {
  const port = 9300 + (process.pid % 300)
  const first = await runFirstLaunch(port)
  await closeApp(first.shell, first.child)
  first.shell.close()
  first.site.close()

  const second = await readSecondLaunchState(port + 1)
  assert.notEqual(second.track, first.startingTrack)
  await closeApp(second.shell, second.child)
  second.shell.close()
  second.site.close()

  console.log(JSON.stringify({
    clock: first.shellState.clock,
    titlebarHeight: first.shellState.titlebarHeight,
    compactShellState: first.compactShellState,
    compactViewport: first.collapsedState.viewport,
    compactWindow: first.compactWindow,
    firstCompactCollapsedMixer: first.firstCompactCollapsedState.controlsRect,
    firstCompactExpandedMixer: first.firstCompactExpandedState.controlsRect,
    collapsedMixer: first.collapsedState.controlsRect,
    expandedMixer: first.expandedState.controlsRect,
    restoredCollapsedMixer: first.restoredCollapsedState,
    collapseMotion: {
      firstPositionMoveAt: first.collapseMotion.firstPositionMoveAt,
      firstSizeChangeAt: first.collapseMotion.firstSizeChangeAt,
    },
    secondCompactCollapsedMixer: first.secondCompactCollapsedState.controlsRect,
    persistedAudioState: first.persistedAudioState,
    restoredAudioState: second.restoredAudioState,
    paintedRainPixels: first.collapsedState.rain.paintedRainPixels,
    recordedRain: first.recordedRain,
    recordedMusic: {
      first: {
        status: first.startingMusicResponse.status,
        mimeType: first.startingMusicResponse.mimeType,
        url: first.startingMusicResponse.url,
      },
      cycled: {
        status: first.cycledMusicResponse.status,
        mimeType: first.cycledMusicResponse.mimeType,
        url: first.cycledMusicResponse.url,
      },
    },
    rainAfterCrossfade: first.rainAfterCrossfade,
    rainFallback: first.rainFallback,
    birdsResponse: {
      status: first.birdsResponse.status,
      mimeType: first.birdsResponse.mimeType,
      url: first.birdsResponse.url,
    },
    birdsState: first.birdsState,
    windState: first.windState,
    thunderState: first.thunderState,
    firstLaunchTrack: first.startingTrack,
    nextLaunchTrack: second.track,
    screenshots: [
      path.join(outputDirectory, 'normal-scene.png'),
      path.join(outputDirectory, 'compact-first-collapsed.png'),
      path.join(outputDirectory, 'compact-opened-from-chip.png'),
      path.join(outputDirectory, 'compact-collapsed.png'),
      path.join(outputDirectory, 'compact-expanded.png'),
      path.join(outputDirectory, 'compact-restored.png'),
    ],
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
}).finally(async () => {
  await removeRuntimeProfile()
})
