import { errorMessage } from './http.js'

export const CHART_THEMES = [
  'vertiport',
  'navigation',
  'surveillance',
  'airspace',
  'utility',
  'transport',
  'road',
  'water',
  'structure',
  'landuse',
  'landcover',
]

export const LOD13_BUILDING_DATASET_ID = 'deqing_lod13_buildings'

export const CHART_DATASETS = [
  ['deqing_chart_l17_takeoff_points', '起降点', 'vertiport', '#22c55e', '2D', 'takeoff_point', ['功能要素'], 81],
  ['deqing_chart_l17_surveillance_points', '监视设施', 'surveillance', '#f43f5e', '2D', 'surveillance_facility', ['环境要素', '建构筑物', '人工构筑物'], 13],
  ['deqing_chart_l17_navigation_monitoring_stations', '导航监测数据', 'navigation', '#8b5cf6', '2D', 'navigation_monitoring_station', ['功能要素', '飞行控制空间', '飞行信息控制要素'], 78],
  ['deqing_chart_l17_water_facility_points', '水利设施点', 'utility', '#06b6d4', '2D', 'water_facility', ['环境要素', '建构筑物', '人工构筑物'], 11],
  ['deqing_chart_l17_prohibited_airspace', '禁止性管制空域', 'airspace', '#dc2626', '3D', 'prohibited_airspace', ['功能要素', '飞行控制空间', '空域管理单元'], 70],
  ['deqing_chart_l17_rail_facility_lines', '轨道交通服务设施线', 'transport', '#d97706', '2D', 'rail_service_facility_line', ['环境要素', '公共交通服务设施'], 63],
  ['deqing_chart_l17_road_facility_areas', '道路交通服务设施面', 'transport', '#ea580c', '2D', 'road_service_facility_area', ['环境要素', '公共交通服务设施'], 64],
  ['deqing_chart_l17_road_junctions', '路口', 'road', '#f59e0b', '2D', 'road_junction_area', ['环境要素', '地面道路及附属设施'], 4],
  ['deqing_chart_l17_roads', '道路', 'road', '#facc15', '2D', 'road', ['环境要素', '地面道路及附属设施'], 3],
  ['deqing_chart_l17_hydropower_plants', '水电厂房', 'utility', '#a855f7', '2D', 'hydropower_plant_area', ['环境要素', '水体', '水工设施'], 60],
  ['deqing_chart_l17_lakes', '湖泊', 'water', '#4f46e5', '2D', 'lake_area', ['环境要素', '水体', '江河湖泊'], 46],
  ['deqing_chart_l17_ponds', '水塘', 'water', '#0ea5e9', '2D', 'pond_area', ['环境要素', '水体', '水库水塘'], 49],
  ['deqing_chart_l17_reservoir_extensions', '水库水塘扩展要素', 'water', '#0284c7', '2D', 'reservoir_pond_extension_area', ['环境要素', '水体', '水库水塘'], 50],
  ['deqing_chart_l17_rivers', '江河', 'water', '#1d4ed8', '2D', 'river_area', ['环境要素', '水体', '江河湖泊'], 45],
  ['deqing_chart_l17_artificial_structures', '人工构筑物扩展要素', 'structure', '#64748b', '2D', 'artificial_structure_area', ['环境要素', '建构筑物', '人工构筑物'], 15],
  ['deqing_chart_l17_structure_attachments', '建构筑物及附属扩展要素', 'structure', '#475569', '2D', 'structure_attachment_area', ['环境要素', '建构筑物'], 16],
  ['deqing_chart_l17_agricultural_land', '农用地', 'landuse', '#65a30d', '2D', 'agricultural_land_area', ['环境要素', '地表覆盖与土地利用', '土地利用'], 41],
  ['deqing_chart_l17_artificial_excavation', '人工堆掘地', 'landuse', '#a16207', '2D', 'artificial_excavation_area', ['环境要素', '地表覆盖与土地利用', '地表覆盖'], 38],
  ['deqing_chart_l17_construction_land', '建设用地', 'landuse', '#92400e', '2D', 'construction_land_area', ['环境要素', '地表覆盖与土地利用', '土地利用'], 42],
  ['deqing_chart_l17_cultivated_land', '种植土地', 'landuse', '#16a34a', '2D', 'cultivated_land_area', ['环境要素', '地表覆盖与土地利用', '地表覆盖'], 36],
  ['deqing_chart_l17_unused_land', '未利用地', 'landuse', '#78716c', '2D', 'unused_land_area', ['环境要素', '地表覆盖与土地利用', '土地利用'], 43],
  ['deqing_chart_l17_bare_surface', '裸露地表', 'landcover', '#a8a29e', '2D', 'bare_surface_area', ['环境要素', '地表覆盖与土地利用', '地表覆盖'], 39],
  ['deqing_chart_l17_forest_grass_cover', '林草覆盖', 'landcover', '#15803d', '2D', 'forest_grass_cover', ['环境要素', '地表覆盖与土地利用', '地表覆盖'], 37],
  ['deqing_chart_l17_wetlands', '湿地', 'landcover', '#14b8a6', '2D', 'wetland', ['环境要素', '水体', '滩涂湿地'], 52],
  [LOD13_BUILDING_DATASET_ID, '建筑物（LOD1.3）', 'structure', '#2563eb', '3D', 'lod13_building', ['环境要素', '建构筑物'], 9, 'lod13'],
].map(([id, label, theme, color, dimensionMode, featureType, catalogPath, catalogOrder, sourceKind = 'static']) => ({
  id, label, theme, color, dimensionMode, featureType, catalogPath, catalogOrder, sourceKind,
}))

const DATASETS_BY_ID = new Map(CHART_DATASETS.map(dataset => [dataset.id, dataset]))

const THEME_LABELS = {
  vertiport: '起降设施', navigation: '导航监测', surveillance: '监视设施', airspace: '空域安全',
  utility: '市政设施', transport: '交通设施', road: '道路', water: '水体',
  landuse: '土地利用', landcover: '地表覆盖', structure: '构筑物', air_route: '航路',
  sensitive: '敏感要素', communication: '通信设施', obstacle: '障碍物', terrain: '地形',
}

const THEME_COLORS = {
  vertiport: '#22c55e', navigation: '#8b5cf6', surveillance: '#f43f5e', airspace: '#dc2626',
  utility: '#06b6d4', transport: '#d97706', road: '#f59e0b', water: '#0ea5e9',
  landuse: '#65a30d', landcover: '#15803d', structure: '#64748b', air_route: '#fde047',
  sensitive: '#ec4899', communication: '#14b8a6', obstacle: '#ef4444', terrain: '#78716c',
}

const FEATURE_TYPE_LABELS = Object.freeze({
  privacy_sensitivity: '隐私敏感度',
  population_concentration: '人口聚集度',
  ground_crash_consequence: '地面坠毁后果',
})

const TRAILING_FEATURE_TYPES = new Set(Object.keys(FEATURE_TYPE_LABELS))

function normalizedFeatureType(featureOrType) {
  if (typeof featureOrType === 'string') return featureOrType.trim().toLowerCase()
  const featureType = String(featureOrType?.featureType || '').trim().toLowerCase()
  if (featureType) return featureType
  const datasetId = String(featureOrType?.datasetId || '').trim().toLowerCase()
  return [...TRAILING_FEATURE_TYPES].find(type => datasetId.endsWith(`_${type}`)) || ''
}

export function buildChartDatasetTree(datasets) {
  const roots = []
  for (const dataset of datasets) {
    let siblings = roots
    let path = ''
    for (const label of dataset.catalogPath) {
      path = path ? `${path}/${label}` : label
      let node = siblings.find(item => item.label === label)
      if (!node) {
        node = { id: path, label, order: dataset.catalogOrder, children: [] }
        siblings.push(node)
      }
      node.order = Math.min(node.order, dataset.catalogOrder)
      siblings = node.children
    }
    siblings.push({
      id: dataset.id,
      label: dataset.label,
      order: dataset.catalogOrder,
      dataset,
      children: [],
    })
  }

  function sortNodes(nodes) {
    nodes.sort((left, right) => left.order - right.order)
    nodes.forEach(node => {
      sortNodes(node.children)
    })
  }
  sortNodes(roots)
  return roots
}

export const CHART_DATASET_TREE = buildChartDatasetTree(CHART_DATASETS)

function fallbackCatalogPath(theme) {
  if (theme === 'air_route') return ['功能要素', '飞行控制空间', '航路']
  if (theme === 'airspace') return ['功能要素', '飞行控制空间', '空域管理单元']
  if (theme === 'vertiport') return ['功能要素', '飞行控制空间', '起降设施']
  return ['现有要素', chartThemeLabel(theme)]
}

function normalizeActiveDataset(item, index) {
  const id = String(item?.datasetId || '').trim()
  if (!id) return null
  const known = DATASETS_BY_ID.get(id)
  const featureTypes = Array.isArray(item.featureTypes)
    ? item.featureTypes.map(value => String(value || '').trim()).filter(Boolean)
    : []
  const dataset = {
    ...(known || {}),
    id,
    label: String(item.datasetName || known?.label || id),
    theme: String(item.theme || known?.theme || ''),
    color: known?.color || THEME_COLORS[item.theme] || '#38bdf8',
    dimensionMode: item.dimensionMode === '3D' ? '3D' : '2D',
    featureType: featureTypes.length === 1 ? featureTypes[0] : (known?.featureType || ''),
    featureTypes,
    count: Number(item.featureCount) || 0,
    mappingCount: (Number(item.mapping2dCount) || 0) + (Number(item.mapping3dCount) || 0),
    catalogPath: known?.catalogPath || fallbackCatalogPath(item.theme),
    catalogOrder: known?.catalogOrder ?? (1000 + index),
    sourceKind: 'static',
    activeRevision: Number(item.activeRevision) || 0,
    level: Number(item.level),
  }
  DATASETS_BY_ID.set(id, dataset)
  return dataset
}

async function hasLod13Source(signal) {
  try {
    const response = await fetch('/lod13-datasets.json', { signal })
    if (!response.ok) return false
    const manifest = await response.json()
    return Array.isArray(manifest) && manifest.length > 0
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    return false
  }
}

export async function loadAvailableChartDatasets({ signal, includeLod13 = true } = {}) {
  const items = []
  let offset = 0
  let total = Infinity
  while (offset < total) {
    const response = await fetch(`/api/static-features/datasets?state=active&limit=200&offset=${offset}`, { signal })
    if (!response.ok) {
      throw new Error(await errorMessage(response, `航图要素列表加载失败（${response.status}）`))
    }
    const body = await response.json()
    if (body?.status === 'error') throw new Error(body.message || '航图要素列表加载失败')
    const page = Array.isArray(body?.data?.items) ? body.data.items : []
    items.push(...page)
    total = Number.isFinite(Number(body?.data?.total)) ? Number(body.data.total) : items.length
    if (page.length === 0) break
    offset += page.length
  }
  const datasets = items
    .filter(item => item?.state === 'active' && Number(item.featureCount) > 0)
    .filter(item => (Number(item.mapping2dCount) || 0) + (Number(item.mapping3dCount) || 0) > 0)
    .map(normalizeActiveDataset)
    .filter(Boolean)

  if (includeLod13 && await hasLod13Source(signal)) {
    const lod13 = CHART_DATASETS.find(dataset => dataset.id === LOD13_BUILDING_DATASET_ID)
    if (lod13 && !datasets.some(dataset => dataset.id === lod13.id)) datasets.push(lod13)
  }
  return datasets
}

export function filterChartDatasetTree(datasetLayers) {
  const layersById = datasetLayers instanceof Map
    ? datasetLayers
    : new Map((datasetLayers || []).map(layer => [layer.type || layer.id, layer]))
  const datasets = [...layersById.entries()].map(([id, layer], index) => {
    const known = DATASETS_BY_ID.get(id)
    const theme = layer.theme || known?.theme || ''
    return {
      ...(known || {}),
      ...layer,
      id,
      label: layer.label || known?.label || id,
      theme,
      color: layer.color || known?.color || THEME_COLORS[theme] || '#38bdf8',
      dimensionMode: layer.dimensionMode === '3D' || known?.dimensionMode === '3D' ? '3D' : '2D',
      catalogPath: known?.catalogPath || fallbackCatalogPath(theme),
      catalogOrder: known?.catalogOrder ?? (1000 + index),
    }
  })
  return buildChartDatasetTree(datasets)
}

export function chartFeatureLabel(feature) {
  return DATASETS_BY_ID.get(feature.datasetId)?.label
    || FEATURE_TYPE_LABELS[normalizedFeatureType(feature)]
    || feature.featureType
    || THEME_LABELS[feature.theme]
    || feature.datasetId
    || '未命名要素'
}

export function chartFeatureTypeLabel(featureType) {
  return FEATURE_TYPE_LABELS[normalizedFeatureType(featureType)] || featureType || '—'
}

export function chartFeatureDatasetLabel(feature) {
  return DATASETS_BY_ID.get(feature?.datasetId)?.label
    || FEATURE_TYPE_LABELS[normalizedFeatureType(feature)]
    || feature?.datasetId
    || '—'
}

export function sortChartFeaturesForDisplay(features) {
  const regularFeatures = []
  const trailingFeatures = []
  ;(features || []).forEach((feature) => {
    if (TRAILING_FEATURE_TYPES.has(normalizedFeatureType(feature))) {
      trailingFeatures.push(feature)
    } else {
      regularFeatures.push(feature)
    }
  })
  return regularFeatures.concat(trailingFeatures)
}

export function chartFeatureColor(feature) {
  return DATASETS_BY_ID.get(feature.datasetId)?.color || THEME_COLORS[feature?.theme] || '#38bdf8'
}

export function chartFeatureDimensionMode(feature) {
  const mode = feature?.dimensionMode || DATASETS_BY_ID.get(feature?.datasetId)?.dimensionMode
  return mode === '3D' ? '3D' : '2D'
}

export function chartFeatureDimensionLabel(feature) {
  const mode = chartFeatureDimensionMode(feature)
  if (mode === '2D') return '二维水平要素'
  if (feature?.verticalMode === 'ALL') return '三维 · 全高度'
  if (feature?.verticalMode === 'RANGE') return '三维 · 高度范围'
  return '三维要素'
}

export function chartThemeLabel(theme) {
  return THEME_LABELS[theme] || theme
}
const MAX_CODES_PER_REQUEST = 1000
const MAX_CONCURRENCY = 4
const MAX_REGION_SPLIT_DEPTH = 6

function chartFeatureIdentity(feature) {
  return [
    feature?.datasetId,
    feature?.featureUid,
    feature?.dimensionMode,
    feature?.code,
    feature?.level,
  ].map(value => String(value ?? '')).join('\u0000')
}

function mergeChartCells(groups) {
  const merged = new Map()
  groups.flat().forEach(cell => {
    const code = String(cell?.code || cell?.data?.grid?.code || '')
    if (!code) return
    const existing = merged.get(code)
    if (!existing) {
      merged.set(code, { ...cell, features: [...(cell.features || [])] })
      return
    }
    const features = [...(existing.features || []), ...(cell.features || [])]
    existing.features = [...new Map(features.map(feature => [chartFeatureIdentity(feature), feature])).values()]
  })
  return [...merged.values()].sort((left, right) => String(left.code).localeCompare(String(right.code)))
}

export async function queryChartRegion(payload, { signal, cursor } = {}) {
  const body = { ...payload, ...(cursor ? { cursor } : {}) }
  if (!body.datasetIds?.length && !body.featureTypes?.length && !body.themes?.length) body.themes = CHART_THEMES
  const response = await fetch('/api/static-features/region/grids', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) {
    throw new Error(await errorMessage(response, `航图专题网格查询失败（${response.status}）`))
  }
  return response.json()
}

function polygonBounds(polygon) {
  const points = Array.isArray(polygon) ? polygon : []
  const longitudes = points.map(point => Number(point?.[0])).filter(Number.isFinite)
  const latitudes = points.map(point => Number(point?.[1])).filter(Number.isFinite)
  if (longitudes.length < 3 || latitudes.length < 3) throw new Error('LOD1.3 建筑网格查询边界无效')
  return {
    minLon: Math.min(...longitudes),
    maxLon: Math.max(...longitudes),
    minLat: Math.min(...latitudes),
    maxLat: Math.max(...latitudes),
  }
}

function lod13Feature(cell, properties, index) {
  const featureUid = properties?.tjh_featur || properties?.modelid || properties?.ID
    || properties?.OID || `${cell.code}-${index}`
  return {
    code: cell.code,
    datasetId: LOD13_BUILDING_DATASET_ID,
    featureUid: String(featureUid),
    featureType: 'lod13_building',
    theme: 'structure',
    dimensionMode: '3D',
    verticalMode: 'RANGE',
    minHeight: Number(cell.bottom),
    maxHeight: Number(cell.top),
    properties: properties || {},
  }
}

export async function queryLod13BuildingGrids(payload, { signal, cursor } = {}) {
  const bounds = polygonBounds(payload.polygon)
  const response = await fetch('/api/multiSource/triangleGrid/queryOsgbGrid', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      level: Number(payload.level),
      source: 'lod13',
      maxCells: Math.min(Number(payload.maxCells) || 50000, 50000),
      ...(payload.renderOnly === true ? { renderOnly: true } : {}),
      ...(cursor ? { cursor } : {}),
      ...bounds,
    }),
    signal,
  })
  if (!response.ok) {
    throw new Error(await errorMessage(response, `LOD1.3 建筑网格查询失败（${response.status}）`))
  }
  const body = await response.json()
  if (body?.data?.data_source !== 'clickhouse') {
    throw new Error('LOD1.3 建筑网格查询未使用 ClickHouse，已拒绝混用 PostgreSQL 结果')
  }
  const scannedCursor = lastGridCode(body?.data?.cells || [])
  const bottom = Number(payload.bottom)
  const top = Number(payload.top)
  const cells = (body?.data?.cells || [])
    .filter(cell => !Number.isFinite(bottom) || !Number.isFinite(top)
      || (Number(cell.top) > bottom && Number(cell.bottom) < top))
    .map(cell => {
      const properties = Array.isArray(cell.properties) && cell.properties.length
        ? cell.properties
        : [{}]
      return {
        ...cell,
        level: Number(payload.level),
        features: properties.map((item, index) => lod13Feature(cell, item, index)),
      }
    })
  return {
    status: body?.status || 'success',
    success: body?.status === 'success',
    data: { ...body?.data, count: cells.length, cells, scannedCursor },
  }
}

export async function queryLod13GridFeatures(cell, { signal } = {}) {
  const code = String(cell?.code || '')
  const level = Number(cell?.level ?? code.replace(/^dqg/, '').length)
  const bounds = cell?.bounds || {}
  const west = Number(bounds.west)
  const east = Number(bounds.east)
  const south = Number(bounds.south)
  const north = Number(bounds.north)
  if (!code || !Number.isInteger(level) || ![west, east, south, north].every(Number.isFinite)) {
    throw new Error('LOD1.3 网格详情参数无效')
  }
  const response = await fetch('/api/multiSource/triangleGrid/queryOsgbGrid', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      level,
      source: 'lod13',
      code,
      minLon: west,
      maxLon: east,
      minLat: south,
      maxLat: north,
      maxCells: 10,
    }),
    signal,
  })
  if (!response.ok) {
    throw new Error(await errorMessage(response, `LOD1.3 建筑属性查询失败（${response.status}）`))
  }
  const body = await response.json()
  if (body?.data?.data_source !== 'clickhouse') {
    throw new Error('LOD1.3 建筑属性查询未使用 ClickHouse')
  }
  const rows = (body?.data?.cells || []).filter(row => String(row?.code || '') === code.replace(/^dqg/, ''))
  return rows.flatMap(row => {
    const properties = Array.isArray(row.properties) && row.properties.length ? row.properties : [{}]
    return properties.map((item, index) => lod13Feature(row, item, index))
  })
}

function lastGridCode(cells) {
  return cells.length ? String(cells[cells.length - 1]?.code || '') : ''
}

export async function queryChartSourcePages(payload, { signal, onPage } = {}) {
  const requestedIds = payload.datasetIds || []
  const staticIds = requestedIds.filter(id => id !== LOD13_BUILDING_DATASET_ID)
  const includeLod13 = requestedIds.includes(LOD13_BUILDING_DATASET_ID)
  const states = [
    ...(staticIds.length ? [{
      name: 'static', cursor: undefined, watermark: undefined, hasMore: true,
      done: false, initialized: false, buffer: [], response: null,
      query: cursor => queryChartRegion({ ...payload, datasetIds: staticIds }, { signal, cursor }),
    }] : []),
    ...(includeLod13 ? [{
      name: 'lod13', cursor: undefined, watermark: undefined, hasMore: true,
      done: false, initialized: false, buffer: [], response: null,
      query: cursor => queryLod13BuildingGrids(payload, { signal, cursor }),
    }] : []),
  ]
  let pageIndex = 0
  let committedCursor

  async function fetchNext(state) {
    const response = await state.query(state.cursor)
    const data = response?.data || {}
    const cells = data.cells || []
    const scannedCursor = data.scannedCursor || lastGridCode(cells) || data.nextCursor
    if (data.hasMore === true && !scannedCursor) {
      throw new Error(`${state.name} 航图分页返回 hasMore，但当前页没有可推进游标`)
    }
    if (scannedCursor && state.cursor && scannedCursor <= state.cursor) {
      throw new Error(`${state.name} 航图分页游标没有向前推进`)
    }
    state.response = response
    state.buffer.push(...cells)
    state.initialized = true
    state.hasMore = data.hasMore === true
    state.done = !state.hasMore
    if (scannedCursor) {
      state.cursor = scannedCursor
      state.watermark = scannedCursor
    }
  }

  while (!signal?.aborted && states.length > 0) {
    const refill = states.filter(state =>
      !state.initialized || (!state.done && state.watermark === committedCursor),
    )
    await Promise.all(refill.map(fetchNext))

    const activeWatermarks = states
      .filter(state => !state.done)
      .map(state => state.watermark)
      .filter(Boolean)
      .sort()
    const boundary = activeWatermarks[0]
    const boundedGroups = states.map(state => {
      if (!boundary) {
        const cells = state.buffer
        state.buffer = []
        return cells
      }
      const cells = state.buffer.filter(cell => String(cell?.code || '') <= boundary)
      state.buffer = state.buffer.filter(cell => String(cell?.code || '') > boundary)
      return cells
    })
    const cells = mergeChartCells(boundedGroups)
    const pending = states.some(state => !state.done || state.buffer.length > 0)
    const features = cells.flatMap(cell => cell.features || [])
    const staticResponse = states.find(state => state.name === 'static')?.response
    const lod13Response = states.find(state => state.name === 'lod13')?.response
    const data = {
      ...(staticResponse?.data || lod13Response?.data || {}),
      cells,
      matchedCount: cells.length,
      mappingCount: features.length,
      lod13Count: new Set(features
        .filter(feature => feature.datasetId === LOD13_BUILDING_DATASET_ID)
        .map(feature => feature.code)).size,
      hasMore: pending,
      nextCursor: pending ? (boundary || committedCursor) : null,
      dataSource: 'clickhouse',
      pageIndex,
    }
    const page = { status: 'success', success: true, data }
    if (onPage) await onPage(page)
    if (boundary) committedCursor = boundary
    pageIndex += 1
    if (!pending) break
  }

  return { cursor: committedCursor, pageCount: pageIndex }
}

export async function queryChartSources(payload, { signal } = {}) {
  const pages = []
  await queryChartSourcePages(payload, {
    signal,
    onPage: page => pages.push(page),
  })
  const firstData = pages[0]?.data || {}
  const cells = mergeChartCells(pages.map(page => page.data.cells || []))
  const features = cells.flatMap(cell => cell.features || [])
  return {
    status: 'success',
    success: true,
    data: {
      ...firstData,
      cells,
      matchedCount: cells.length,
      mappingCount: features.length,
      lod13Count: new Set(features
        .filter(feature => feature.datasetId === LOD13_BUILDING_DATASET_ID)
        .map(feature => feature.code)).size,
      hasMore: false,
      nextCursor: null,
      truncated: false,
      dataSource: 'clickhouse',
      pageCount: pages.length,
    },
  }
}

function splitRegion(payload) {
  const points = payload.polygon
  const west = Math.min(...points.map(point => Number(point[0])))
  const east = Math.max(...points.map(point => Number(point[0])))
  const south = Math.min(...points.map(point => Number(point[1])))
  const north = Math.max(...points.map(point => Number(point[1])))
  const splitLongitude = east - west >= north - south
  const middle = splitLongitude ? (west + east) / 2 : (south + north) / 2
  const rectangles = splitLongitude
    ? [[west, south, middle, north], [middle, south, east, north]]
    : [[west, south, east, middle], [west, middle, east, north]]
  return rectangles.map(([minLon, minLat, maxLon, maxLat]) => ({
    ...payload,
    polygon: [
      [minLon, minLat],
      [maxLon, minLat],
      [maxLon, maxLat],
      [minLon, maxLat],
      [minLon, minLat],
    ],
  }))
}

export async function queryRegionCells(payload, { signal, depth = 0 } = {}) {
  const response = await fetch('/api/multiSource/airSpaceDB/grid/region', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })
  if (response.ok) return response.json()

  const message = await errorMessage(response, `空域网格查询失败（${response.status}）`)
  if (!message.includes('more grid cells than maxCells')) throw new Error(message)
  if (depth >= MAX_REGION_SPLIT_DEPTH) {
    throw new Error('当前视域包含的网格仍然过多，请放大地图或缩小查询边界后重试')
  }

  const cells = []
  for (const part of splitRegion(payload)) {
    const result = await queryRegionCells(part, { signal, depth: depth + 1 })
    cells.push(...(result?.data?.cells || []))
  }
  return {
    status: 'success',
    success: true,
    data: { cells: [...new Map(cells.map(cell => [cell.code, cell])).values()] },
  }
}

export function horizontalGridCode(code) {
  const normalized = String(code || '').replace(/^dqg/, '')
  if (!/^[0-7]+$/.test(normalized)) return ''
  return [...normalized].map(digit => String(Number(digit) & 3)).join('')
}

function chunks(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  )
}

async function postGridFeatures(payload, signal) {
  const response = await fetch('/api/static-features/grid/features', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  })
  if (!response.ok) {
    throw new Error(await errorMessage(response, `航图要素查询失败（${response.status}）`))
  }
  return response.json()
}

export async function queryChartFeatures(cells, { signal, includeRelatedLevels = false } = {}) {
  const groups = new Map()
  for (const cell of cells) {
    const code = String(cell.code || '')
    const level = Number(cell.level ?? String(code).replace(/^dqg/, '').length)
    const bottom = Number(cell.bounds?.bottom)
    const top = Number(cell.bounds?.top)
    if (!code || !Number.isInteger(level) || !Number.isFinite(bottom) || !Number.isFinite(top) || bottom >= top) continue
    const key = `${level}\u0000${bottom}\u0000${top}`
    if (!groups.has(key)) groups.set(key, { level, bottom, top, codes: new Set() })
    groups.get(key).codes.add(code)
  }

  const jobs = [...groups.values()].flatMap(({ level, bottom, top, codes }) =>
    chunks([...codes], MAX_CODES_PER_REQUEST).map(batch => ({
      level,
      codes: batch,
      bottom,
      top,
      ...(includeRelatedLevels ? { includeRelatedLevels: true } : {}),
    })),
  )
  const responses = new Array(jobs.length)
  let nextJob = 0
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, jobs.length) }, async () => {
    while (nextJob < jobs.length) {
      const index = nextJob++
      responses[index] = await postGridFeatures(jobs[index], signal)
    }
  }))

  return responses.reduce((result, response) => {
    result.features2D.push(...(response?.data?.features2D || []))
    result.features3D.push(...(response?.data?.features3D || []))
    result.truncated ||= response?.data?.truncated === true
    return result
  }, { features2D: [], features3D: [], truncated: false })
}


export function featuresByGrid(features2D, features3D) {
  const result = new Map()
  const seen = new Set()
  for (const feature of [...features2D, ...features3D]) {
    const code = String(feature.code || '')
    const key = `${code}\u0000${feature.featureUid}\u0000${feature.dimensionMode}`
    if (seen.has(key)) continue
    seen.add(key)
    if (!result.has(code)) result.set(code, [])
    result.get(code).push(feature)
  }
  return result
}

export function isChartCellVisible(featureTypes, enabledTypes) {
  return featureTypes.some(type => enabledTypes.has(type))
}
