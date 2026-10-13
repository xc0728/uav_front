import { errorMessage } from './http.js'

export const CHART_THEMES = [
  'air_route',
  'vertiport',
  'airspace',
  'obstacle',
  'utility',
  'transport',
  'road',
  'water',
  'admin',
  'administrative',
  'structure',
  'communication',
  'surveillance',
  'landuse',
  'landcover',
]

export const CHART_DATASETS = [
  ['deqing_chart_l17_takeoff_points', '起降点', 'vertiport', '#22c55e'],
  ['deqing_chart_l17_surveillance_points', '监控设施', 'surveillance', '#ef4444'],
  ['deqing_chart_l17_rail_facility_points', '铁路服务设施点', 'transport', '#f59e0b'],
  ['deqing_chart_l17_water_extension_points', '水系附属点', 'water', '#38bdf8'],
  ['deqing_chart_l17_road_facility_points', '道路服务设施点', 'transport', '#f97316'],
  ['deqing_chart_l17_landcover_extension_lines', '地表覆盖附属线', 'landcover', '#84cc16'],
  ['deqing_chart_l17_water_facility_lines', '水利设施线', 'water', '#0ea5e9'],
  ['deqing_chart_l17_rail_facility_lines', '铁路服务设施线', 'transport', '#d97706'],
  ['deqing_chart_l17_road_facility_lines', '道路服务设施线', 'transport', '#eab308'],
  ['deqing_chart_l17_artificial_structures', '人工构筑物', 'structure', '#64748b'],
  ['deqing_chart_l17_structure_attachments', '构筑物附属面', 'structure', '#475569'],
  ['deqing_chart_l17_landuse_extensions', '土地利用附属面', 'landuse', '#a16207'],
  ['deqing_chart_l17_unused_land', '未利用地', 'landuse', '#78716c'],
  ['deqing_chart_l17_agricultural_land', '农业用地', 'landuse', '#65a30d'],
  ['deqing_chart_l17_cultivated_land', '种植土地', 'landuse', '#16a34a'],
  ['deqing_chart_l17_road_extensions', '道路附属面', 'road', '#facc15'],
  ['deqing_chart_l17_road_junctions', '道路交叉口', 'road', '#f59e0b'],
  ['deqing_chart_l17_roundabouts', '环岛', 'road', '#fb923c'],
  ['deqing_chart_l17_road_facility_areas', '道路服务设施面', 'transport', '#ea580c'],
  ['deqing_chart_l17_hydropower_plants', '水电站', 'utility', '#a855f7'],
  ['deqing_chart_l17_hydraulic_structures', '水工构筑物', 'water', '#06b6d4'],
  ['deqing_chart_l17_reservoir_extensions', '水库水塘附属面', 'water', '#0284c7'],
  ['deqing_chart_l17_river_lake_extensions', '河流湖泊附属面', 'water', '#2563eb'],
  ['deqing_chart_l17_water_extensions', '水系附属面', 'water', '#3b82f6'],
  ['deqing_chart_l17_ponds', '水塘', 'water', '#0ea5e9'],
  ['deqing_chart_l17_rivers', '河流', 'water', '#1d4ed8'],
  ['deqing_chart_l17_lakes', '湖泊', 'water', '#4f46e5'],
].map(([id, label, theme, color]) => ({ id, label, theme, color }))

const DATASETS_BY_ID = Object.fromEntries(CHART_DATASETS.map(dataset => [dataset.id, dataset]))

const THEME_LABELS = {
  air_route: '航路', vertiport: '起降设施', airspace: '空域', obstacle: '障碍物',
  utility: '市政设施', transport: '交通设施', road: '道路', water: '水体',
  admin: '行政区划', administrative: '行政区划', landuse: '土地利用', landcover: '地表覆盖',
  structure: '构筑物', communication: '通信设施',
  surveillance: '监控设施',
}

const TREE_GROUPS = [
  ['aeronautical', '航空要素', ['air_route', 'vertiport']],
  ['airspace_safety', '空域安全', ['airspace', 'obstacle']],
  ['surveillance', '监控设施', ['surveillance']],
  ['infrastructure', '城市基础设施', ['utility', 'transport', 'road', 'structure', 'communication']],
  ['geography', '自然与地表', ['water', 'landuse', 'landcover']],
  ['administration', '行政区划', ['admin']],
]

export const CHART_DATASET_TREE = TREE_GROUPS.map(([id, label, themes]) => ({
  id,
  label,
  children: themes.map(theme => ({
    id: theme,
    label: THEME_LABELS[theme],
    datasets: CHART_DATASETS.filter(dataset => dataset.theme === theme),
  })).filter(child => child.datasets.length),
})).filter(group => group.children.length)

export function chartFeatureLabel(feature) {
  return DATASETS_BY_ID[feature.datasetId]?.label || feature.featureType || THEME_LABELS[feature.theme] || feature.datasetId || '未命名要素'
}

export function chartFeatureColor(feature) {
  return DATASETS_BY_ID[feature.datasetId]?.color || '#38bdf8'
}

export function chartThemeLabel(theme) {
  return THEME_LABELS[theme] || theme
}
const MAX_CODES_PER_REQUEST = 1000
const MAX_CONCURRENCY = 4
const MAX_REGION_SPLIT_DEPTH = 6

export async function queryChartRegion(payload, { signal } = {}) {
  const body = { ...payload }
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
