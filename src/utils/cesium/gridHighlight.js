function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

/**
 * 生成完整格元高亮的经纬高路径：上下两个闭合矩形和四条竖边，共 12 条边。
 * 返回普通数组，避免把 Cesium 类型耦合进几何单元测试。
 */
export function buildGridHighlightPaths(bounds) {
  const west = finiteNumber(bounds?.west)
  const east = finiteNumber(bounds?.east)
  const south = finiteNumber(bounds?.south)
  const north = finiteNumber(bounds?.north)
  const bottom = finiteNumber(bounds?.bottom)
  const top = finiteNumber(bounds?.top)

  if ([west, east, south, north, bottom, top].some(value => value === null)) return []
  if (east <= west || north <= south || top < bottom) return []

  const bottomCorners = [
    [west, south, bottom],
    [east, south, bottom],
    [east, north, bottom],
    [west, north, bottom],
  ]
  const topCorners = bottomCorners.map(([longitude, latitude]) => [longitude, latitude, top])

  return [
    [...bottomCorners, bottomCorners[0]],
    [...topCorners, topCorners[0]],
    ...bottomCorners.map((corner, index) => [corner, topCorners[index]]),
  ]
}

export function countGridHighlightEdges(paths) {
  return paths.reduce((count, path) => count + Math.max(0, path.length - 1), 0)
}
