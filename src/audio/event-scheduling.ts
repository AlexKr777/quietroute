export type RainEventKind = 'tap' | 'drip' | 'runoff'

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function getRainEventDelay(randomValue: number): number {
  const value = clampUnit(randomValue)
  return Math.round(1150 + value ** 1.45 * 6100)
}

export function selectRainEvent(randomValue: number): RainEventKind {
  const value = clampUnit(randomValue)
  if (value < 0.72) return 'tap'
  if (value < 0.94) return 'drip'
  return 'runoff'
}

export function getNightEventDelay(randomValue: number): number {
  const value = clampUnit(randomValue)
  return Math.round(14000 + value * 25000)
}

export function getWindEventDelay(randomValue: number): number {
  const value = clampUnit(randomValue)
  return Math.round(7000 + value ** 1.2 * 14000)
}

export function getTramEventDelay(randomValue: number): number {
  const value = clampUnit(randomValue)
  return Math.round(2400 + value ** 1.1 * 4400)
}

export function getThunderEventDelay(randomValue: number): number {
  const value = clampUnit(randomValue)
  return Math.round(28000 + value * 41000)
}
