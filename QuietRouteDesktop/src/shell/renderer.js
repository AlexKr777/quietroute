const compactButton = document.querySelector('#compact-toggle')
const compactLabel = document.querySelector('#compact-label')
const alwaysOnTopButton = document.querySelector('#always-on-top')
const minimizeButton = document.querySelector('#minimize-window')
const closeButton = document.querySelector('#close-window')
const masterSoundButton = document.querySelector('#master-sound')
const siteFrame = document.querySelector('#quiet-route-site')
const loadingState = document.querySelector('#loading-state')
const errorState = document.querySelector('#error-state')
const errorMessage = document.querySelector('#error-message')
const retryButton = document.querySelector('#retry-site')
const liveClock = document.querySelector('#live-clock')
const clockWidget = document.querySelector('#clock-widget')
const desktopBridge = window.quietRouteDesktop
const clockTools = window.QuietRouteClock
const clockControlTools = window.QuietRouteClockControls
const SITE_ORIGIN = 'quiet-route://site'

let loadTimeout = null
let unsubscribeState = null
let clockTimeout = null
let clockControls = null

function updateLiveClock() {
  if (!liveClock || !clockTools) return

  const now = new Date()
  const value = clockTools.formatLocalClock(now)
  const textNode = Array.from(liveClock.childNodes).find(
    (node) => node.nodeType === Node.TEXT_NODE,
  )
  if (textNode) textNode.nodeValue = value
  liveClock.dateTime = value
  liveClock.setAttribute('aria-label', `Текущее время ${value}`)

  window.clearTimeout(clockTimeout)
  clockTimeout = window.setTimeout(
    updateLiveClock,
    clockTools.getDelayUntilNextMinute(now),
  )
}

function applyMasterSoundState(muted) {
  if (!masterSoundButton) return
  masterSoundButton.ariaPressed = String(muted)
  masterSoundButton.ariaLabel = muted ? 'Включить звук' : 'Выключить звук'
  masterSoundButton.title = masterSoundButton.ariaLabel
}

function postSoundCommand(action) {
  siteFrame.contentWindow?.postMessage({
    type: 'quiet-route:desktop:audio-command',
    action,
  }, SITE_ORIGIN)
}

function showError(message) {
  loadingState.hidden = true
  errorMessage.textContent = message
  errorState.hidden = false
}

function beginLoading() {
  errorState.hidden = true
  loadingState.hidden = false
  window.clearTimeout(loadTimeout)
  loadTimeout = window.setTimeout(() => {
    showError('маршрут открывается слишком долго')
  }, 12_000)
}

function finishLoading() {
  window.clearTimeout(loadTimeout)
  loadTimeout = null
  loadingState.hidden = true
  errorState.hidden = true
}

function applyWindowState(state) {
  document.body.dataset.compact = String(state.compact)
  document.body.dataset.alwaysOnTop = String(state.alwaysOnTop)

  compactButton.ariaPressed = String(state.compact)
  compactLabel.textContent = state.compact ? 'вернуть' : 'мини'
  compactButton.title = state.compact
    ? 'Вернуть обычный размер (Ctrl+Shift+M)'
    : 'Переключить микро-окно (Ctrl+Shift+M)'

  alwaysOnTopButton.ariaPressed = String(state.alwaysOnTop)
  alwaysOnTopButton.title = state.alwaysOnTop
    ? 'Не держать поверх остальных окон (Ctrl+Shift+P)'
    : 'Держать поверх остальных окон (Ctrl+Shift+P)'
}

async function runWindowAction(button, action) {
  button.disabled = true
  try {
    const state = await action()
    if (state) applyWindowState(state)
  } catch {
    showError('команда окна сейчас недоступна')
  } finally {
    button.disabled = false
  }
}

function reloadSite() {
  beginLoading()
  siteFrame.src = 'quiet-route://site/index.html?desktopHost=1'
}

siteFrame.addEventListener('load', finishLoading)
siteFrame.addEventListener('load', () => postSoundCommand('get-state'))
siteFrame.addEventListener('error', () => showError('не удалось открыть маршрут'))
retryButton.addEventListener('click', reloadSite)

if (!desktopBridge) {
  showError('оконная оболочка не загрузилась')
} else {
  compactButton.addEventListener('click', () => {
    void runWindowAction(compactButton, desktopBridge.toggleCompact)
  })
  alwaysOnTopButton.addEventListener('click', () => {
    void runWindowAction(alwaysOnTopButton, desktopBridge.toggleAlwaysOnTop)
  })
  minimizeButton.addEventListener('click', () => {
    void runWindowAction(minimizeButton, desktopBridge.minimize)
  })
  closeButton.addEventListener('click', () => {
    void desktopBridge.close()
  })
  masterSoundButton?.addEventListener('click', () => {
    postSoundCommand('toggle-master')
  })

  document.addEventListener('keydown', (event) => {
    if (!event.ctrlKey || !event.shiftKey || event.altKey) return

    if (event.code === 'KeyM') {
      event.preventDefault()
      void runWindowAction(compactButton, desktopBridge.toggleCompact)
    } else if (event.code === 'KeyP') {
      event.preventDefault()
      void runWindowAction(
        alwaysOnTopButton,
        desktopBridge.toggleAlwaysOnTop,
      )
    }
  })

  unsubscribeState = desktopBridge.onStateChanged(applyWindowState)
  void desktopBridge.getState()
    .then(applyWindowState)
    .catch(() => showError('не удалось прочитать состояние окна'))
}

window.addEventListener('message', (event) => {
  if (event.origin !== SITE_ORIGIN || event.source !== siteFrame.contentWindow) return
  if (event.data?.type === 'quiet-route:desktop:audio-state') {
    applyMasterSoundState(Boolean(event.data.muted))
    return
  }
  if (event.data?.type === 'quiet-route:desktop:scene-press') {
    clockControls?.close?.()
    return
  }
  if (event.data?.type === 'quiet-route:desktop:mixer-open-request') {
    void desktopBridge?.ensureMixerSpace?.()
      .then(() => {
        siteFrame.contentWindow?.postMessage({
          type: 'quiet-route:desktop:mixer-space-ready',
        }, SITE_ORIGIN)
      })
      .catch(() => showError('не удалось открыть панель звука'))
    return
  }
  if (event.data?.type === 'quiet-route:desktop:mixer-close') {
    void desktopBridge?.restoreMixerSpace?.()
  }
})

document.addEventListener('pointerdown', (event) => {
  if (!clockWidget?.contains(event.target)) clockControls?.close?.()
}, true)

window.addEventListener('beforeunload', () => {
  window.clearTimeout(loadTimeout)
  window.clearTimeout(clockTimeout)
  unsubscribeState?.()
})

updateLiveClock()
clockControls = clockControlTools?.initClockControls?.({
  clock: liveClock,
  host: clockWidget,
})
beginLoading()
