import { describe, expect, it } from 'vitest'

import { resolveMusicClick } from '../src/audio/music-gesture'

describe('resolveMusicClick', () => {
  it('defers the first pointer click so a second click can become track change', () => {
    expect(resolveMusicClick(1, false)).toBe('defer-toggle')
  })

  it('changes track on the second pointer click without toggling mute', () => {
    expect(resolveMusicClick(2, true)).toBe('cycle-track')
  })

  it('restores music before cycling when a slow first click already toggled it', () => {
    expect(resolveMusicClick(2, false, true)).toBe('restore-and-cycle-track')
  })

  it('keeps keyboard activation immediate', () => {
    expect(resolveMusicClick(0, false)).toBe('toggle-now')
  })
})
