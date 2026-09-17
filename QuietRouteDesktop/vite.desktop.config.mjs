import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(desktopDirectory, '..')
const desktopEntry = '/QuietRouteDesktop/src/site-overrides/desktop-entry.ts'
const desktopAmbienceEngine = path.join(
  desktopDirectory,
  'src',
  'site-overrides',
  'desktop-ambience-engine.ts',
)
const desktopMusicLibrary = path.join(
  desktopDirectory,
  'src',
  'site-overrides',
  'desktop-music-library.ts',
)
const desktopBirdsongProfile = path.join(
  desktopDirectory,
  'src',
  'site-overrides',
  'desktop-birdsong-profile.ts',
)
const desktopAssetsDirectory = path.join(desktopDirectory, 'assets')
const desktopSiteDirectory = path.join(desktopDirectory, 'site')

function copyDirectoryFiles(sourceDirectory, targetDirectory) {
  fs.mkdirSync(targetDirectory, { recursive: true })
  for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
    const source = path.join(sourceDirectory, entry.name)
    const target = path.join(targetDirectory, entry.name)
    if (entry.isDirectory()) {
      copyDirectoryFiles(source, target)
    } else if (entry.isFile()) {
      fs.copyFileSync(source, target)
    }
  }
}

const rejectedSiteMusicFiles = [
  'moon-unit.mp3',
  'pretty-little-lies.mp3',
  'vintage.mp3',
  'whatever.mp3',
]

const desktopDockBridge = `
if (desktopHosted) {
  Reflect.set(globalThis, 'QuietRouteDesktopDock', Object.freeze({
    getPosition() {
      initializeSoundDock()
      return dockPosition ? { ...dockPosition } : null
    },
    getPadding() {
      return DOCK_PADDING
    },
    moveTo(position: Partial<Point>, dockSize?: { width: number; height: number }) {
      initializeSoundDock()
      if (!dockPosition || !position) return null

      const requestedPosition = {
        x: Number.isFinite(position.x) ? Number(position.x) : dockPosition.x,
        y: Number.isFinite(position.y) ? Number(position.y) : dockPosition.y,
      }
      const nextPosition = clampDockPosition(
        requestedPosition,
        getDockViewportSize(),
        dockSize && Number.isFinite(dockSize.width) && Number.isFinite(dockSize.height)
          ? { width: Number(dockSize.width), height: Number(dockSize.height) }
          : getDockSize(),
        DOCK_PADDING,
      )
      animateDockTo(nextPosition)
      return { ...nextPosition }
    },
  }))
}
`

export function injectDesktopDockBridge(source) {
  return `${source}\n${desktopDockBridge}`
}

export function syncDesktopAudioAssets(sourceDirectory, targetDirectory) {
  if (!fs.existsSync(sourceDirectory)) return

  fs.rmSync(path.join(targetDirectory, 'lofi'), {
    recursive: true,
    force: true,
  })
  for (const fileName of rejectedSiteMusicFiles) {
    fs.rmSync(path.join(targetDirectory, fileName), { force: true })
  }
  copyDirectoryFiles(sourceDirectory, targetDirectory)
}

function desktopEntryPlugin() {
  return {
    name: 'quiet-route-desktop-entry',
    enforce: 'pre',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace('/src/main.ts', desktopEntry)
      },
    },
    resolveId(source, importer) {
      if (!importer) return null
      const normalizedImporter = path.normalize(importer)
      if (
        source === './audio/ambience-engine' &&
        normalizedImporter.endsWith(path.join('src', 'main.ts'))
      ) {
        return desktopAmbienceEngine
      }
      if (
        source === './audio/music-library' ||
        (source === './music-library' &&
          normalizedImporter.endsWith(path.join('src', 'audio', 'ambience-engine.ts')))
      ) {
        return desktopMusicLibrary
      }
      if (
        source === './birdsong-profile' &&
        normalizedImporter.endsWith(path.join('src', 'audio', 'ambience-engine.ts'))
      ) {
        return desktopBirdsongProfile
      }
      return null
    },
    transform(source, id) {
      const sourcePath = id.split('?', 1)[0]
      if (path.normalize(sourcePath) !== path.join(repositoryRoot, 'src', 'main.ts')) {
        return null
      }
      return {
        code: injectDesktopDockBridge(source),
        map: null,
      }
    },
    closeBundle() {
      const audioSource = path.join(desktopAssetsDirectory, 'audio')
      const audioTarget = path.join(desktopSiteDirectory, 'audio')
      syncDesktopAudioAssets(audioSource, audioTarget)
      for (const licenseName of ['AUDIO_LICENSES.md', 'FONT_LICENSES.md']) {
        const licenseSource = path.join(desktopAssetsDirectory, licenseName)
        if (fs.existsSync(licenseSource)) {
          fs.copyFileSync(
            licenseSource,
            path.join(desktopSiteDirectory, licenseName),
          )
        }
      }
    },
  }
}

export default defineConfig({
  root: repositoryRoot,
  publicDir: path.join(repositoryRoot, 'public'),
  plugins: [desktopEntryPlugin()],
  build: {
    outDir: desktopSiteDirectory,
    emptyOutDir: true,
  },
})
