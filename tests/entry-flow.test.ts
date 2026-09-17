import { describe, expect, it } from 'vitest'

import {
  getDockRevealDelay,
  shouldRequestEntryFullscreen,
} from '../src/ui/entry-flow'

describe('entry flow', () => {
  it('requests fullscreen from the desktop entry gesture when available', () => {
    expect(shouldRequestEntryFullscreen({
      fullscreenEnabled: true,
      hasFullscreenElement: false,
      viewportWidth: 1920,
    })).toBe(true)
  })

  it('does not force fullscreen on narrow devices or unavailable browser states', () => {
    expect(shouldRequestEntryFullscreen({
      fullscreenEnabled: true,
      hasFullscreenElement: false,
      viewportWidth: 390,
    })).toBe(false)
    expect(shouldRequestEntryFullscreen({
      fullscreenEnabled: false,
      hasFullscreenElement: false,
      viewportWidth: 1920,
    })).toBe(false)
    expect(shouldRequestEntryFullscreen({
      fullscreenEnabled: true,
      hasFullscreenElement: true,
      viewportWidth: 1920,
    })).toBe(false)
  })

  it('leaves window sizing to the desktop shell', () => {
    expect(shouldRequestEntryFullscreen({
      fullscreenEnabled: true,
      hasFullscreenElement: false,
      viewportWidth: 1920,
      desktopHosted: true,
    })).toBe(false)
  })

  it('reveals the dock after the descent, with a short reduced-motion delay', () => {
    expect(getDockRevealDelay(false)).toBe(2350)
    expect(getDockRevealDelay(true)).toBe(250)
  })
})
