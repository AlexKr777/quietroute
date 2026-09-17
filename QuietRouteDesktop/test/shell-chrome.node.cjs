const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const shellHtml = fs.readFileSync(
  path.resolve(__dirname, '..', 'src', 'shell', 'index.html'),
  'utf8',
)
const shellCss = fs.readFileSync(
  path.resolve(__dirname, '..', 'src', 'shell', 'shell.css'),
  'utf8',
)

test('live clock belongs to the scene rather than the draggable titlebar', () => {
  const titlebar = shellHtml.match(/<header class="titlebar">([\s\S]*?)<\/header>/)?.[1]
  const sceneHost = shellHtml.match(/<main class="scene-host">([\s\S]*?)<\/main>/)?.[1]

  assert.ok(titlebar)
  assert.ok(sceneHost)
  assert.doesNotMatch(titlebar, /id="live-clock"/)
  assert.match(sceneHost, /id="live-clock"[^>]*class="scene-clock"/)
})

test('shell keeps the master-sound icon fixed in the scene corner, separate from the editable clock', () => {
  const sceneHost = shellHtml.match(/<main class="scene-host">([\s\S]*?)<iframe/)?.[1]
  const clockWidget = sceneHost?.match(/<div id="clock-widget"[\s\S]*?<\/div>/)?.[0]

  assert.ok(sceneHost)
  assert.match(sceneHost, /id="clock-widget"[^>]*class="scene-clock-widget"/)
  assert.match(sceneHost, /id="master-sound"[^>]*class="scene-master-sound"/)
  assert.doesNotMatch(clockWidget, /id="master-sound"/)
  assert.match(shellHtml, /class="scene-clock__resize-handle"/)
  assert.match(shellCss, /\.scene-master-sound\s*\{[\s\S]*?position:\s*absolute/)
  assert.match(shellCss, /\.scene-master-sound\s*\{[\s\S]*?right:\s*0\.75rem/)
  const soundRule = shellCss.match(/\.scene-master-sound\s*\{([\s\S]*?)\}/)?.[1]
  assert.match(soundRule ?? '', /background:\s*transparent/)
  assert.match(soundRule ?? '', /border:\s*0/)
  assert.match(shellCss, /\.scene-clock\.is-editing\s+\.scene-clock__resize-handle/)
})

test('pressed window controls stay visually neutral instead of amber', () => {
  const pressedRule = shellCss.match(
    /\.window-action\[aria-pressed="true"\]\s*\{([\s\S]*?)\}/,
  )?.[1]

  assert.ok(pressedRule)
  assert.doesNotMatch(pressedRule, /amber|214\s*,\s*161\s*,\s*93|#edc080/i)
  assert.match(pressedRule, /rgba\(147\s*,\s*165\s*,\s*184/i)
})

test('scene clock is modestly larger and legible in normal and compact layouts', () => {
  const sceneClockRule = shellCss.match(/\.scene-clock\s*\{([\s\S]*?)\}/)?.[1]
  const compactBlock = shellCss.match(/@media \(max-width: 520px\)\s*\{([\s\S]*)@media \(max-width: 430px\)/)?.[1]
  const compactClockRule = compactBlock?.match(/\.scene-clock\s*\{([\s\S]*?)\}/)?.[1]

  assert.ok(sceneClockRule)
  assert.ok(compactClockRule)
  assert.match(
    sceneClockRule,
    /font-size:\s*clamp\(1\.58rem,\s*2\.55vw,\s*2\.55rem\)/,
  )
  assert.match(sceneClockRule, /font-weight:\s*400/)
  assert.match(sceneClockRule, /rgba\(214\s*,\s*161\s*,\s*93\s*,\s*0\.24\)/)
  assert.match(compactClockRule, /font-size:\s*1\.48rem/)
})
