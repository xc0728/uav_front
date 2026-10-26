// 稠密模式保留全部原生边，仅按稳定索引和投影尺寸区分主线/细线。
export function getGridVisualStyle(cellCount, isLod) {
  const count = Number(cellCount) || 0
  if (count >= 3000) {
    return {
      fillAlpha: 0,
      outlineAlpha: 1,
      distanceFadeMinAlpha: 1,
      detailBeginPx: 3,
      detailEndPx: 14,
      minorFarAlpha: 0.1,
      minorNearAlpha: 0.68,
      primaryFarAlpha: 0.72,
      primaryNearAlpha: 1,
      primaryStep: 4,
      farBrightness: 0.62,
    }
  }
  return {
    fillAlpha: isLod ? 0.08 : 0.18,
    outlineAlpha: isLod ? 0.65 : 0.85,
    distanceFadeMinAlpha: 1,
    detailBeginPx: 0,
    detailEndPx: 1,
    minorFarAlpha: 1,
    minorNearAlpha: 1,
    primaryFarAlpha: 1,
    primaryNearAlpha: 1,
    primaryStep: 4,
    farBrightness: 1,
  }
}
