const path = require('node:path')

const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  net,
  protocol,
  screen,
  session,
} = require('electron')

const {
  installProtocolHandler,
  registerProtocolPrivileges,
} = require('./app-protocol.cjs')
const { IPC_CHANNELS } = require('./ipc-channels.cjs')
const { isTrustedShellUrl } = require('./ipc-security.cjs')
const { createWindowController } = require('./window-controller.cjs')
const { centerBounds, clampBoundsToWorkArea } = require('./window-layout.cjs')
const { readWindowState, writeWindowState } = require('./window-state.cjs')

const NORMAL_WINDOW_SIZE = { width: 1100, height: 680 }
const MINIMUM_WINDOW_SIZE = { width: 260, height: 180 }

let mainWindow = null
let windowController = null

registerProtocolPrivileges(protocol)
app.enableSandbox()

const debugPort = process.env.QUIET_ROUTE_CDP_PORT
if (/^\d{4,5}$/.test(debugPort ?? '')) {
  app.commandLine.appendSwitch('remote-debugging-port', debugPort)
}

const testUserDataDirectory = process.env.QUIET_ROUTE_TEST_USER_DATA
if (debugPort && testUserDataDirectory) {
  app.setPath('userData', path.resolve(testUserDataDirectory))
}

function getProtocolRoots() {
  return {
    shell: path.join(__dirname, 'shell'),
    site: app.isPackaged
      ? path.join(process.resourcesPath, 'site')
      : path.resolve(__dirname, '..', 'site'),
  }
}

function publishWindowState(state = windowController?.getState()) {
  if (!state || !mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(IPC_CHANNELS.stateChanged, state)
}

function requireTrustedWindow(event) {
  const senderWindow = BrowserWindow.fromWebContents(event.sender)
  const senderUrl = event.senderFrame?.url ?? ''

  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    senderWindow !== mainWindow ||
    !isTrustedShellUrl(senderUrl)
  ) {
    throw new Error('Rejected window command from an untrusted renderer')
  }

  return senderWindow
}

function registerWindowIpc() {
  ipcMain.handle(IPC_CHANNELS.getState, (event) => {
    requireTrustedWindow(event)
    return windowController?.getState() ?? {
      compact: false,
      alwaysOnTop: false,
    }
  })

  ipcMain.handle(IPC_CHANNELS.toggleCompact, (event) => {
    requireTrustedWindow(event)
    return windowController.toggleCompact()
  })

  ipcMain.handle(IPC_CHANNELS.toggleAlwaysOnTop, (event) => {
    requireTrustedWindow(event)
    return windowController.toggleAlwaysOnTop()
  })

  ipcMain.handle(IPC_CHANNELS.ensureMixerSpace, (event) => {
    requireTrustedWindow(event)
    return windowController.ensureMixerSpace()
  })

  ipcMain.handle(IPC_CHANNELS.restoreMixerSpace, (event) => {
    requireTrustedWindow(event)
    return windowController.restoreMixerSpace()
  })

  ipcMain.handle(IPC_CHANNELS.minimize, (event) => {
    requireTrustedWindow(event).minimize()
    return true
  })

  ipcMain.handle(IPC_CHANNELS.close, (event) => {
    requireTrustedWindow(event).close()
    return true
  })
}

function createMainWindow() {
  const defaultBounds = centerBounds(
    NORMAL_WINDOW_SIZE,
    screen.getPrimaryDisplay().workArea,
  )
  const savedState = readWindowState(
    path.join(app.getPath('userData'), 'window-state.json'),
  )
  const initialDisplay = savedState
    ? screen.getDisplayMatching(savedState.bounds)
    : screen.getPrimaryDisplay()
  const initialBounds = savedState
    ? clampBoundsToWorkArea(savedState.bounds, initialDisplay.workArea)
    : defaultBounds
  const window = new BrowserWindow({
    ...initialBounds,
    minWidth: MINIMUM_WINDOW_SIZE.width,
    minHeight: MINIMUM_WINDOW_SIZE.height,
    useContentSize: true,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#080d18',
    alwaysOnTop: savedState?.alwaysOnTop ?? false,
    title: 'Тихий маршрут',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  })

  mainWindow = window
  windowController = createWindowController({
    window,
    getDisplayMatching: (bounds) => screen.getDisplayMatching(bounds),
    initialCompact: savedState?.compact,
    initialExpandedBounds: savedState?.expandedBounds ?? initialBounds,
    initialAlwaysOnTop: savedState?.alwaysOnTop,
    onStateChange: publishWindowState,
  })

  const persistWindowState = () => {
    if (!windowController) return
    writeWindowState(
      path.join(app.getPath('userData'), 'window-state.json'),
      { version: 1, ...windowController.getPersistenceState() },
    )
  }

  const keepWindowVisible = () => windowController?.keepVisible()
  screen.on('display-metrics-changed', keepWindowVisible)
  screen.on('display-removed', keepWindowVisible)

  window.removeMenu()
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isTrustedShellUrl(targetUrl)) event.preventDefault()
  })
  window.webContents.on('did-finish-load', () => publishWindowState())
  window.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`[quiet-route-desktop] load failed ${code}: ${description} (${url})`)
  })

  window.on('move', () => windowController?.captureExpandedBounds())
  window.on('resize', () => windowController?.captureExpandedBounds())
  window.on('close', persistWindowState)
  window.on('always-on-top-changed', () => publishWindowState())
  window.once('ready-to-show', () => {
    window.show()
    window.focus()
    console.log('[quiet-route-desktop] ready')
  })
  window.on('closed', () => {
    screen.removeListener('display-metrics-changed', keepWindowVisible)
    screen.removeListener('display-removed', keepWindowVisible)
    if (mainWindow === window) {
      mainWindow = null
      windowController = null
    }
  })

  void window.loadURL('quiet-route://shell/index.html')
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (attachEvent) => {
      attachEvent.preventDefault()
    })
  })

  app.whenReady().then(() => {
    if (process.platform === 'win32') {
      app.setAppUserModelId('local.quietroute.desktop')
    }

    Menu.setApplicationMenu(null)
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, _permission, callback) => callback(false),
    )
    installProtocolHandler({
      protocol,
      net,
      roots: getProtocolRoots(),
    })
    registerWindowIpc()
    createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  }).catch((error) => {
    console.error('[quiet-route-desktop] startup failed', error)
    app.quit()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
