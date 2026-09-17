function normalizeDimension(value, maximum) {
  return Math.max(1, Math.min(Math.round(value), Math.round(maximum)))
}

function centerBounds(size, workArea) {
  const width = normalizeDimension(size.width, workArea.width)
  const height = normalizeDimension(size.height, workArea.height)

  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height,
  }
}

function clampBoundsToWorkArea(bounds, workArea) {
  const width = normalizeDimension(bounds.width, workArea.width)
  const height = normalizeDimension(bounds.height, workArea.height)
  const maximumX = workArea.x + workArea.width - width
  const maximumY = workArea.y + workArea.height - height

  return {
    x: Math.round(Math.min(Math.max(bounds.x, workArea.x), maximumX)),
    y: Math.round(Math.min(Math.max(bounds.y, workArea.y), maximumY)),
    width,
    height,
  }
}

function getCompactBounds(
  workArea,
  preferredSize,
  margin = 24,
  bottomMargin = margin,
) {
  const safeMargin = Math.max(0, Math.round(margin))
  const safeBottomMargin = Math.max(0, Math.round(bottomMargin))
  const availableWidth = Math.max(1, workArea.width - safeMargin * 2)
  const availableHeight = Math.max(
    1,
    workArea.height - safeMargin - safeBottomMargin,
  )
  const width = normalizeDimension(preferredSize.width, availableWidth)
  const height = normalizeDimension(preferredSize.height, availableHeight)

  return {
    x: Math.round(workArea.x + workArea.width - safeMargin - width),
    y: Math.round(workArea.y + workArea.height - safeBottomMargin - height),
    width,
    height,
  }
}

module.exports = {
  centerBounds,
  clampBoundsToWorkArea,
  getCompactBounds,
}
