const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const appDirectory = path.resolve(__dirname, '..')
const { version } = require(path.join(appDirectory, 'package.json'))
const artifactName = `QuietRouteDesktop-${version}-portable.exe`
const temporaryOutput = fs.mkdtempSync(
  path.join(os.tmpdir(), 'quiet-route-desktop-build-'),
)
const builderCli = path.join(
  appDirectory,
  'node_modules',
  'electron-builder',
  'cli.js',
)

const result = spawnSync(process.execPath, [
  builderCli,
  '--win',
  'portable',
  '--x64',
  `--config.directories.output=${temporaryOutput}`,
], {
  cwd: appDirectory,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '',
  },
  stdio: 'inherit',
})

if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)

const builtExecutable = path.join(temporaryOutput, artifactName)
if (!fs.existsSync(builtExecutable)) {
  throw new Error(`Packaged executable was not found: ${builtExecutable}`)
}

const releaseDirectory = path.join(appDirectory, 'release')
const finalExecutable = path.join(releaseDirectory, 'QuietRouteDesktop.exe')
fs.mkdirSync(releaseDirectory, { recursive: true })
fs.copyFileSync(builtExecutable, finalExecutable)
fs.rmSync(temporaryOutput, { recursive: true, force: true })

console.log(`[quiet-route-desktop] portable app: ${finalExecutable}`)
