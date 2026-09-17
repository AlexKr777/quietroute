const path = require('node:path')
const { spawn } = require('node:child_process')

const electronPath = require('electron')
const appDirectory = path.resolve(__dirname, '..')
const environment = { ...process.env }

// Some IDE terminals set this for tooling. A desktop launch must never inherit it.
delete environment.ELECTRON_RUN_AS_NODE

const child = spawn(electronPath, ['.'], {
  cwd: appDirectory,
  env: environment,
  stdio: 'inherit',
  windowsHide: false,
})

child.on('error', (error) => {
  console.error('[quiet-route-desktop] launch failed', error)
  process.exitCode = 1
})

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[quiet-route-desktop] stopped by ${signal}`)
    process.exitCode = 1
    return
  }

  process.exitCode = code ?? 0
})
