export function closeLoopEndpoint(samples: Float32Array): Float32Array {
  const closed = samples.slice()
  if (closed.length < 2) return closed

  const first = closed[0] ?? 0
  const last = closed.at(-1) ?? first
  const difference = last - first
  const finalIndex = closed.length - 1

  for (let index = 0; index <= finalIndex; index += 1) {
    const value = closed[index] ?? 0
    closed[index] = value - difference * (index / finalIndex)
  }

  return closed
}
