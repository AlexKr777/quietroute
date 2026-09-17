export const SCENE_WIDTH = 640
export const SCENE_HEIGHT = 360

export interface IntegerCoverLayout {
  scale: number
  width: number
  height: number
  offsetX: number
  offsetY: number
}

export interface IntegerAspectCrop {
  sourceX: number
  sourceY: number
  sourceWidth: number
  sourceHeight: number
}

export function isRenderableViewport(
  viewportWidth: number,
  viewportHeight: number,
  devicePixelRatio: number,
): boolean {
  return [viewportWidth, viewportHeight, devicePixelRatio].every(
    (value) => Number.isFinite(value) && value > 0,
  )
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left
  let b = right

  while (b !== 0) {
    const remainder = a % b
    a = b
    b = remainder
  }

  return a
}

export function calculateIntegerCoverLayout(
  viewportWidth: number,
  viewportHeight: number,
  sceneWidth = SCENE_WIDTH,
  sceneHeight = SCENE_HEIGHT,
): IntegerCoverLayout {
  if (
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    sceneWidth <= 0 ||
    sceneHeight <= 0
  ) {
    throw new Error('Viewport dimensions must be positive')
  }

  const scale = Math.max(
    1,
    Math.ceil(Math.max(viewportWidth / sceneWidth, viewportHeight / sceneHeight)),
  )
  const width = sceneWidth * scale
  const height = sceneHeight * scale

  return {
    scale,
    width,
    height,
    offsetX: Math.round((viewportWidth - width) / 2),
    offsetY: Math.round((viewportHeight - height) / 2),
  }
}

export function calculateIntegerAspectCrop(
  sourceWidth: number,
  sourceHeight: number,
  aspectWidth: number,
  aspectHeight: number,
): IntegerAspectCrop {
  const values = [sourceWidth, sourceHeight, aspectWidth, aspectHeight]
  if (values.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new Error('Image and aspect dimensions must be positive integers')
  }

  const divisor = greatestCommonDivisor(aspectWidth, aspectHeight)
  const horizontalUnit = aspectWidth / divisor
  const verticalUnit = aspectHeight / divisor
  const multiplier = Math.floor(
    Math.min(sourceWidth / horizontalUnit, sourceHeight / verticalUnit),
  )
  const croppedWidth = horizontalUnit * multiplier
  const croppedHeight = verticalUnit * multiplier

  return {
    sourceX: Math.floor((sourceWidth - croppedWidth) / 2),
    sourceY: Math.floor((sourceHeight - croppedHeight) / 2),
    sourceWidth: croppedWidth,
    sourceHeight: croppedHeight,
  }
}
