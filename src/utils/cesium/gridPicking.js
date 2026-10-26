const PARALLEL_EPSILON = 1e-12
const AXES = ['x', 'y', 'z']
const MINIMUM_KEYS = ['minX', 'minY', 'minZ']
const MAXIMUM_KEYS = ['maxX', 'maxY', 'maxZ']

/**
 * 返回射线进入轴对齐包围盒的最近非负距离；不相交时返回 undefined。
 */
export function rayAabbEntryDistance(origin, direction, bounds) {
  let entry = -Infinity
  let exit = Infinity

  for (let index = 0; index < AXES.length; index++) {
    const axis = AXES[index]
    const originValue = Number(origin?.[axis])
    const directionValue = Number(direction?.[axis])
    const minimum = Number(bounds?.[MINIMUM_KEYS[index]])
    const maximum = Number(bounds?.[MAXIMUM_KEYS[index]])
    if (![originValue, directionValue, minimum, maximum].every(Number.isFinite)) return undefined

    if (Math.abs(directionValue) < PARALLEL_EPSILON) {
      if (originValue < minimum || originValue > maximum) return undefined
      continue
    }

    const first = (minimum - originValue) / directionValue
    const second = (maximum - originValue) / directionValue
    entry = Math.max(entry, Math.min(first, second))
    exit = Math.min(exit, Math.max(first, second))
    if (exit < entry) return undefined
  }

  if (exit < 0) return undefined
  return Math.max(entry, 0)
}
