import { calculateIntegerAspectCrop, SCENE_HEIGHT, SCENE_WIDTH } from './layout'

const OVERSCAN_WIDTH = 48
const OVERSCAN_HEIGHT = 27

export function renderReferenceFrame(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource & { width: number; height: number },
): void {
  const crop = calculateIntegerAspectCrop(image.width, image.height, 16, 9)
  const destinationWidth = SCENE_WIDTH + OVERSCAN_WIDTH
  const destinationHeight = SCENE_HEIGHT + OVERSCAN_HEIGHT
  const destinationX = Math.round((SCENE_WIDTH - destinationWidth) / 2)
  const destinationY = -1

  context.save()
  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT)
  context.drawImage(
    image,
    crop.sourceX,
    crop.sourceY,
    crop.sourceWidth,
    crop.sourceHeight,
    destinationX,
    destinationY,
    destinationWidth,
    destinationHeight,
  )
  context.fillStyle = 'rgba(3, 8, 18, 0.08)'
  context.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT)
  context.restore()
}
