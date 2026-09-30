import { errorMessage } from './http.js'

export const CHART_GRID_LEVEL = 16
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
  'landuse',
  'landcover',
]

export const CHART_DATASETS = [
  ['route_l1_north_south_120', '航路网航路南北向L1真高120', 'air_route', '#06b6d4'],
  ['route_l1_east_west_170', '航路网航路东西向L1真高170', 'air_route', '#3b82f6'],
  ['route_l2_north_south_220', '航路网航路南北向L2真高220', 'air_route', '#6366f1'],
  ['route_l2_northwest_270', '航路网航路西北向L2真高270', 'air_route', '#8b5cf6'],
  ['route_node_departure_net1', '航路网1离场点', 'air_route', '#22d3ee'],
  ['route_node_arrival_net2', '航路网2进场点', 'air_route', '#60a5fa'],
  ['route_node_entry_net3', '航路网3进入点', 'air_route', '#818cf8'],
  ['route_node_entry_net4', '航路网4进入点', 'air_route', '#a78bfa'],
  ['route_node_waypoint_net6', '航路网6航路点', 'air_route', '#c084fc'],
  ['route_ramp_same_level', '航路网同层路口匝道', 'air_route', '#14b8a6'],
  ['route_ramp_cross_level', '航路网异层匝道', 'air_route', '#f97316'],
  ['route_uturn_bidirectional', '航路网双向掉头连接', 'air_route', '#ec4899'],
  ['route_takeoff_landing_points', '航路网起降点', 'vertiport', '#22c55e'],
  ['route_takeoff_landing_connectors', '航路网起降点线', 'vertiport', '#84cc16'],
  ['prohibited_airspace', '禁止性管制空域', 'airspace', '#ef4444'],
  ['flight_obstacles', '空间限制设施（障碍物）', 'obstacle', '#f97316'],
  ['utility_power_poles', '电杆', 'utility', '#a855f7'],
  ['utility_power_lines', '输电线', 'utility', '#d946ef'],
  ['road_and_facilities', '道路及附属设施', 'road', '#eab308'],
  ['landcover_bare_surface', '裸露地表', 'landcover', '#a16207'],
  ['landuse_unused_land', '未利用地', 'landuse', '#78716c'],
  ['landuse_artificial_excavation', '人工堆掘地', 'landuse', '#b45309'],
  ['landcover_forest_grass', '林草覆盖', 'landcover', '#16a34a'],
  ['landuse_cultivated_land', '种植土地', 'landuse', '#65a30d'],
  ['landuse_construction_land', '建设用地', 'landuse', '#64748b'],
  ['water_ponds', '水塘', 'water', '#0ea5e9'],
  ['water_lake_points', '湖泊位置点', 'water', '#2563eb'],
  ['admin_county_areas', '县级行政区', 'admin', '#7c3aed'],
  ['admin_township_areas', '乡镇级行政区', 'admin', '#a78bfa'],
  ['structure_bridge_lines', '桥隧设施线', 'structure', '#475569'],
  ['utility_fire_hydrants', '消防设施', 'utility', '#dc2626'],
  ['transport_road_service_facilities', '道路交通服务设施', 'transport', '#f59e0b'],
  ['communication_facilities', '通信设施', 'communication', '#db2777'],
].map(([id, label, theme, color]) => ({ id, label, theme, color }))

const DATASETS_BY_ID = Object.fromEntries(CHART_DATASETS.map(dataset => [dataset.id, dataset]))

const THEME_LABELS = {
  air_route: '航路', vertiport: '起降设施', airspace: '空域', obstacle: '障碍物',
  utility: '市政设施', transport: '交通设施', road: '道路', water: '水体',
  admin: '行政区划', administrative: '行政区划', landuse: '土地利用', landcover: '地表覆盖',
  structure: '构筑物', communication: '通信设施',
}

const TREE_GROUPS = [
  ['aeronautical', '航空要素', ['air_route', 'vertiport']],
  ['airspace_safety', '空域安全', ['airspace', 'obstacle']],
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
  const body = { ...payload, level: CHART_GRID_LEVEL }
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

export async function queryChartFeatures(cells, { signal } = {}) {
  const groups = new Map()
  for (const cell of cells) {
    const code = String(cell.code || '')
    const bottom = Number(cell.bounds?.bottom)
    const top = Number(cell.bounds?.top)
    if (!code || !Number.isFinite(bottom) || !Number.isFinite(top) || bottom >= top) continue
    const key = `${bottom}\u0000${top}`
    if (!groups.has(key)) groups.set(key, { bottom, top, codes: new Set() })
    groups.get(key).codes.add(code)
  }

  const jobs = [...groups.values()].flatMap(({ bottom, top, codes }) =>
    chunks([...codes], MAX_CODES_PER_REQUEST).map(batch => ({
      level: CHART_GRID_LEVEL,
      codes: batch,
      bottom,
      top,
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
    return result
  }, { features2D: [], features3D: [] })
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
