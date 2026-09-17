import { describe, expect, it } from 'vitest'

import {
  clampDockPosition,
  getDefaultDockPosition,
  moveDockPosition,
  snapDockPosition,
} from '../src/ui/dock-position'

const viewport = { width: 1200, height: 800 }
const dock = { width: 280, height: 150 }
const padding = 16

describe('getDefaultDockPosition', () => {
  it('places the desktop dock visibly above the bottom-left safe area', () => {
    expect(getDefaultDockPosition(viewport, dock, padding)).toEqual({
      x: 16,
      y: 550,
    })
  })

  it('clamps the desktop lift between 84 and 128 pixels from a 10vh target', () => {
    expect(
      getDefaultDockPosition({ width: 3840, height: 2160 }, dock, padding),
    ).toEqual({
      x: 16,
      y: 1866,
    })

    expect(
      getDefaultDockPosition({ width: 1200, height: 720 }, dock, padding),
    ).toEqual({
      x: 16,
      y: 470,
    })
  })

  it('uses a lower fixed lift on mobile widths', () => {
    expect(
      getDefaultDockPosition({ width: 390, height: 844 }, dock, padding),
    ).toEqual({
      x: 16,
      y: 642,
    })
  })
})

describe('clampDockPosition', () => {
  it('clamps a position past the left edge', () => {
    expect(
      clampDockPosition({ x: -80, y: 240 }, viewport, dock, padding),
    ).toEqual({ x: 16, y: 240 })
  })

  it('clamps a position past the right edge', () => {
    expect(
      clampDockPosition({ x: 1100, y: 240 }, viewport, dock, padding),
    ).toEqual({ x: 904, y: 240 })
  })

  it('clamps a position past the top edge', () => {
    expect(
      clampDockPosition({ x: 240, y: -80 }, viewport, dock, padding),
    ).toEqual({ x: 240, y: 16 })
  })

  it('clamps a position past the bottom edge', () => {
    expect(
      clampDockPosition({ x: 240, y: 760 }, viewport, dock, padding),
    ).toEqual({ x: 240, y: 634 })
  })

  it('reclamps an existing position after the viewport and dock sizes change', () => {
    const previousPosition = { x: 760, y: 520 }
    const smallerViewport = { width: 900, height: 620 }
    const tallerDock = { width: 300, height: 220 }

    expect(
      clampDockPosition(
        previousPosition,
        smallerViewport,
        tallerDock,
        padding,
      ),
    ).toEqual({ x: 584, y: 384 })
  })
})

describe('moveDockPosition', () => {
  it('moves from the drag origin by the pointer delta', () => {
    expect(
      moveDockPosition(
        { x: 80, y: 120 },
        { x: 135, y: -35 },
        viewport,
        dock,
        padding,
      ),
    ).toEqual({ x: 215, y: 85 })
  })
})

describe('snapDockPosition', () => {
  it('snaps positions near each pair of viewport edges', () => {
    expect(
      snapDockPosition(
        { x: 42, y: 610 },
        viewport,
        dock,
        36,
        padding,
      ),
    ).toEqual({ x: 16, y: 634 })

    expect(
      snapDockPosition(
        { x: 880, y: 45 },
        viewport,
        dock,
        36,
        padding,
      ),
    ).toEqual({ x: 904, y: 16 })
  })

  it('does not snap a position outside the edge threshold', () => {
    expect(
      snapDockPosition(
        { x: 300, y: 260 },
        viewport,
        dock,
        36,
        padding,
      ),
    ).toEqual({ x: 300, y: 260 })
  })
})
