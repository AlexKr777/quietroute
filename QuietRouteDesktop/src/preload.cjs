const { contextBridge, ipcRenderer } = require('electron')

// Sandboxed preloads can require Electron APIs, but not sibling files.
const IPC_CHANNELS = Object.freeze({
  close: 'quiet-route:window:close',
  ensureMixerSpace: 'quiet-route:window:ensure-mixer-space',
  getState: 'quiet-route:window:get-state',
  minimize: 'quiet-route:window:minimize',
  restoreMixerSpace: 'quiet-route:window:restore-mixer-space',
  stateChanged: 'quiet-route:window:state-changed',
  toggleAlwaysOnTop: 'quiet-route:window:toggle-always-on-top',
  toggleCompact: 'quiet-route:window:toggle-compact',
})

function normalizeState(state) {
  return {
    compact: Boolean(state?.compact),
    alwaysOnTop: Boolean(state?.alwaysOnTop),
  }
}

contextBridge.exposeInMainWorld('quietRouteDesktop', {
  close: () => ipcRenderer.invoke(IPC_CHANNELS.close),
  ensureMixerSpace: async () => normalizeState(
    await ipcRenderer.invoke(IPC_CHANNELS.ensureMixerSpace),
  ),
  getState: async () => normalizeState(
    await ipcRenderer.invoke(IPC_CHANNELS.getState),
  ),
  minimize: () => ipcRenderer.invoke(IPC_CHANNELS.minimize),
  restoreMixerSpace: async () => normalizeState(
    await ipcRenderer.invoke(IPC_CHANNELS.restoreMixerSpace),
  ),
  onStateChanged: (callback) => {
    const listener = (_event, state) => callback(normalizeState(state))
    ipcRenderer.on(IPC_CHANNELS.stateChanged, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.stateChanged, listener)
  },
  toggleAlwaysOnTop: async () => normalizeState(
    await ipcRenderer.invoke(IPC_CHANNELS.toggleAlwaysOnTop),
  ),
  toggleCompact: async () => normalizeState(
    await ipcRenderer.invoke(IPC_CHANNELS.toggleCompact),
  ),
})
