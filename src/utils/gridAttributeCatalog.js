import { GRID_ATTRIBUTE_TOPICS } from './noiseGrid.js'
import { errorMessage } from './http.js'
import { activeTrueAltitudeDatasets } from './trueAltitudeGrid.js'

export const GRID_ATTRIBUTE_CATALOG_CHANGED = 'grid-attribute-catalog-changed'

// 静态定义只提供图例和样式；目录状态与当前活动绑定决定选项是否存在。
export function availableGridAttributeGroups(items, dataset) {
  if (!dataset?.datasetId || dataset.activeVersion == null || dataset.activeLevel == null) return []
  const definitions = new Map(GRID_ATTRIBUTE_TOPICS.map((item, index) => [item.code, { ...item, index }]))
  const latest = new Map()
  for (const item of items) {
    if (item?.state !== 'active' || !item.code) continue
    const previous = latest.get(item.code)
    if (!previous || Number(item.schemaVersion) > Number(previous.schemaVersion)) latest.set(item.code, item)
  }
  const groups = new Map(['噪声', '电磁场强', '气象数据', '其他场属性'].map(label => [label, []]))
  for (const item of latest.values()) {
    if (item.temporalMode !== 'static' || !Array.isArray(item.bindings)) continue
    const bound = item.bindings.some(binding => binding?.datasetId === dataset.datasetId
      && String(binding.datasetVersion) === String(dataset.activeVersion)
      && Number(binding.level) === Number(dataset.activeLevel)
      && binding.bindingId && Number(binding.projectionRevision) > 0)
    if (!bound) continue
    const definition = definitions.get(item.code)
    const kind = definition?.kind
    const group = kind === 'weather' || item.category === 'meteorology' || item.category === 'meteorology_quality'
      ? '气象数据'
      : kind === 'emf' ? '电磁场强'
        : kind === 'zone' || kind === 'margin' || item.category === 'noise' ? '噪声' : '其他场属性'
    groups.get(group).push({
      ...definition,
      code: item.code,
      label: item.name || definition?.label || item.code,
      unit: item.unit || definition?.unit || '',
      index: definition?.index ?? Number.MAX_SAFE_INTEGER,
    })
  }
  return [...groups].filter(([, topics]) => topics.length).map(([label, topics]) => ({
    label,
    topics: topics.sort((a, b) => a.index - b.index || a.label.localeCompare(b.label, 'zh-CN')),
  }))
}

export async function loadGridAttributeCatalog({ signal } = {}) {
  const response = await fetch('/api/grid-attributes/catalog', { signal, cache: 'no-store' })
  if (!response.ok) throw new Error(await errorMessage(response, '查询内容目录加载失败'))
  const body = await response.json()
  if (body?.success === false || body?.status === 'error' || !Array.isArray(body?.data?.items)) {
    throw new Error(body?.message || '查询内容目录响应格式不正确')
  }
  return body.data.items
}

export async function loadActiveAttributeDatasets({ signal } = {}) {
  const response = await fetch('/api/true-altitude-airspace/datasets', { signal, cache: 'no-store' })
  if (!response.ok) throw new Error(await errorMessage(response, '活动空域版本加载失败'))
  const body = await response.json()
  if (body?.success === false || body?.status === 'error'
      || !Array.isArray(body?.data?.datasets ?? body?.datasets)) {
    throw new Error(body?.message || '活动空域版本响应格式不正确')
  }
  return activeTrueAltitudeDatasets(body)
}

export function notifyGridAttributeCatalogChanged() {
  window.dispatchEvent(new Event(GRID_ATTRIBUTE_CATALOG_CHANGED))
}
