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

module.exports = { IPC_CHANNELS }
