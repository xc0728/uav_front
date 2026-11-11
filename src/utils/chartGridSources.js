// 渲染和拾取共享来源位标记，避免为每个格元保留完整模型属性。
// 保留历史位：1=静态要素，2=建筑物。当前全部来源可放入 Uint8Array。
export const CHART_STATIC_SOURCE = 1
export const MODEL_GRID_SOURCE_BITS = Object.freeze({
  lod13: 2,
  osgb: 4,
  communication: 8,
  navigation: 16,
  surveillance: 32,
  power: 64,
  crane: 128,
})

export const LOD13_BUILDING_DATASET_ID = 'deqing_lod13_buildings'
export const MODEL_GRID_DATASET_IDS = Object.freeze({
  osgb: 'deqing_model_grid_osgb',
  lod13: LOD13_BUILDING_DATASET_ID,
  communication: 'deqing_model_grid_communication',
  navigation: 'deqing_model_grid_navigation',
  surveillance: 'deqing_model_grid_surveillance',
  power: 'deqing_model_grid_power',
  crane: 'deqing_model_grid_crane',
})

const sourceByDatasetId = new Map(
  Object.entries(MODEL_GRID_DATASET_IDS).map(([source, id]) => [id, source]),
)

export function chartGridSourceMask(cell) {
  let mask = Number(cell?.chartSourceMask) || 0
  mask |= MODEL_GRID_SOURCE_BITS[cell?.modelSource] || 0
  for (const source of cell?.modelSources || []) mask |= MODEL_GRID_SOURCE_BITS[source] || 0
  for (const feature of [...(cell?.features || []), ...(cell?.displayClasses || [])]) {
    const source = sourceByDatasetId.get(feature.datasetId)
    mask |= source ? MODEL_GRID_SOURCE_BITS[source] : CHART_STATIC_SOURCE
  }
  return mask
}

export function chartGridModelSources(cell) {
  const mask = chartGridSourceMask(cell)
  return Object.keys(MODEL_GRID_SOURCE_BITS).filter(source => (mask & MODEL_GRID_SOURCE_BITS[source]) !== 0)
}

export function chartGridHasStaticSource(cell) {
  const mask = chartGridSourceMask(cell)
  // 没有来源信息的基础/旧版格元，继续走原静态反查路径。
  return mask === 0 || (mask & CHART_STATIC_SOURCE) !== 0
}
