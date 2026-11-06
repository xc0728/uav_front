import { errorMessage } from './http.js'

export const CONFLICT_LEVEL = 17
export const CONFLICT_ENDPOINT = '/api/airRoute/conflictCheck/clickhouse'
export const CONFLICT_CHECKS = [
  { key: 'missingGrid', label: '空域数据覆盖', description: '报告当前数据集未覆盖的航迹网格' },
  { key: 'dz_17', label: '禁飞区与禁止性空域' },
  { key: 'gd_17', label: '全部模型障碍', description: '建筑、实景三维、通信、导航、监视、输电等模型' },
  { key: 'za_17', label: '地形、不可飞状态与三维障碍要素' },
  { key: 'ad_17', label: '限制区与管制空域' },
  { key: 'hlz_17', label: '将已有航路作为避让对象' },
]
const REASONS = {
  GRID_NOT_FOUND: '空域网格缺失', NO_FLY_ZONE: '禁飞区', NO_FLY_ZONE_FEATURE: '禁止性空域',
  TERRAIN_SURFACE: '接触地表', UNDERGROUND: '进入地下', OSGB: '实景三维障碍',
  MODEL_OBSTACLE: '模型障碍', NOT_FLYABLE: '不可飞网格', RESTRICTED_ZONE: '限制区',
  CONTROLLED_AIRSPACE: '管制空域', AIR_ROUTE_FEATURE: '已有航路', AIRSPACE_FEATURE: '管控空域要素',
  OBSTACLE_FEATURE: '三维障碍要素', MANAGED_BUILDING: '正式维护建筑', MANAGED_PROHIBITED: '正式维护禁飞区',
  ENVIRONMENT_THRESHOLD: '环境条件超限', ENVIRONMENT_DATA_MISSING: '环境数据缺测',
  HORIZONTAL_AVOIDANCE: '水平避让区域', FEATURE_COLLISION: '航图实体碰撞', RULE_THRESHOLD: '属性条件超限',
  RULE_VALUE_AVOIDANCE: '命中避让属性取值', RULE_DATA_MISSING: '规则所需数据缺测', GROUND_HEIGHT_MISSING: '离地高度数据缺失', MIN_AGL: '低于最低离地高度',
}
export const MODEL_SOURCE_LABELS = {
  osgb: '实景三维', lod13: '建筑物', communication: '通信设施', navigation: '导航设施',
  surveillance: '监视设施', power: '输电设施',
}
export function conflictReasonLabel(reason) { return REASONS[reason] || reason }
export function conflictReasonsText(reasons = []) { return reasons.map(conflictReasonLabel).join('、') }
export function createConflictForm() {
  return {
    datasetId: '', datasetVersion: '', stateRevision: '', timestamp: '',
    catalogLoaded: false, catalogItems: [], rules: [],
  }
}
const blank = value => value == null || String(value).trim() === ''
function finiteNumber(value, label) {
  if (blank(value) || !['number', 'string'].includes(typeof value) || !Number.isFinite(Number(value))) throw new Error(`${label}必须为有限数值`)
  return Number(value)
}
function positiveInteger(value, label) {
  const number = finiteNumber(value, label)
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label}必须为安全范围内的正整数`)
  return number
}
export function buildConflictPayload(form, points, mode = 'ALL') {
  if (!String(form.datasetId || '').trim()) throw new Error('请选择活动的 L17 真高空域数据集')
  if (!['ALL', 'FIRST'].includes(mode)) throw new Error('检测模式无效')
  if (!Array.isArray(points) || points.length < 2) throw new Error('请至少添加两个航点')
  const payload = {
    datasetId: form.datasetId.trim(), level: CONFLICT_LEVEL, mode,
    points: points.map(point => {
      const [lon, lat, height] = Array.isArray(point) ? point : [point.lon, point.lat, point.height]
      const values = [finiteNumber(lon, '经度'), finiteNumber(lat, '纬度'), finiteNumber(height, '绝对高程')]
      if (Math.abs(values[0]) > 180 || Math.abs(values[1]) > 90) throw new Error('经纬度超出有效范围')
      return values
    }),
  }
  for (const key of ['datasetVersion', 'stateRevision', 'timestamp']) {
    if (!blank(form[key])) payload[key] = positiveInteger(form[key], key === 'timestamp' ? '查询时间（UTC Unix 秒）' : '版本号')
  }
  if (form.catalogLoaded !== undefined) {
    if (!form.catalogLoaded) throw new Error('请先成功加载当前数据集的判定目录')
    payload.rules = buildCatalogRules(form, payload.timestamp)
    return payload
  }
  payload.checks = Object.fromEntries(CONFLICT_CHECKS.map(({ key }) => {
    if (typeof form.checks?.[key] !== 'boolean') throw new Error('检测开关必须为布尔值')
    return [key, form.checks[key]]
  }))
  const rules = form.environmentChecks || []
  if (!Array.isArray(rules) || rules.length > 32) throw new Error('环境条件最多 32 项')
  const codes = new Set()
  payload.environmentChecks = rules.map(rule => {
    const attributeCode = String(rule.attributeCode || '').trim()
    if (!attributeCode || codes.has(attributeCode)) throw new Error('环境条件需选择属性，且不能重复')
    codes.add(attributeCode)
    const condition = { attributeCode, missing: rule.missing || 'conflict' }
    if (!['conflict', 'ignore'].includes(condition.missing)) throw new Error('缺测处理方式无效')
    for (const bound of ['min', 'max']) if (!blank(rule[bound])) condition[bound] = finiteNumber(rule[bound], '环境阈值')
    if (condition.min == null && condition.max == null) throw new Error('每项环境条件至少填写一个允许界限')
    if (condition.min != null && condition.max != null && condition.min > condition.max) throw new Error('允许最小值不能大于最大值')
    if (rule.temporalMode === 'interval' && !payload.timestamp) throw new Error('时变环境属性必须填写查询时间（UTC Unix 秒）')
    return condition
  })
  return payload
}

export function createCatalogRule(item, methodId = item.defaultMethod) {
  const method = item.methods.find(option => option.id === methodId)
  if (!method) throw new Error('目录没有声明此判定方式')
  const rule = { elementId: item.id, elementRevision: item.revision, method: method.id }
  for (const parameter of method.parameters || []) if (parameter.default !== undefined) rule[parameter.name] = parameter.default
  return rule
}

export function buildCatalogRules(form, timestamp) {
  if (!Array.isArray(form.rules) || form.rules.length > 256) throw new Error('判定规则最多 256 项')
  if (form.catalogItems.some(item => item.mandatory && !item.available)) throw new Error('正式维护强制约束尚未具备 L17 投影，不能忽略')
  const catalog = new Map(form.catalogItems.map(item => [item.id, item]))
  const selected = new Set()
  let environments = 0
  return form.rules.map(rule => {
    const item = catalog.get(rule.elementId)
    if (!item?.available || selected.has(rule.elementId)) throw new Error('所选要素已不可用或重复，请刷新目录')
    selected.add(rule.elementId)
    if (rule.elementRevision !== item.revision) throw new Error(`${item.name}的版本已变化，请取消后重新选择`)
    const method = item.methods.find(option => option.id === rule.method)
    if (!method) throw new Error(`${item.name}不支持此判定方式`)
    const output = { elementId: item.id, elementRevision: item.revision, method: method.id }
    for (const parameter of method.parameters || []) {
      const value = blank(rule[parameter.name]) ? parameter.default : rule[parameter.name]
      if (blank(value)) {
        if (parameter.required) throw new Error(`${item.name}：请填写${parameter.label}`)
        continue
      }
      if (parameter.type === 'number') {
        output[parameter.name] = finiteNumber(value, parameter.label)
        if ((['minAgl', 'maxAgl'].includes(parameter.name) || method.id === 'min_agl') && output[parameter.name] < 0) throw new Error('离地高度不能小于 0')
      } else if (parameter.type === 'values') {
        let values
        try { values = typeof value === 'string' ? JSON.parse(value) : value } catch { throw new Error('避让取值必须为有效 JSON 数组') }
        if (!Array.isArray(values) || !values.length || values.length > 128 || values.some(entry => !['string', 'number', 'boolean'].includes(typeof entry) || (typeof entry === 'number' && !Number.isFinite(entry)))) throw new Error('避让取值只能包含 1-128 个字符串、有限数值或布尔值')
        output[parameter.name] = values
      } else {
        output[parameter.name] = String(value).trim()
        if (parameter.type === 'select' && !parameter.options.some(option => option.value === output[parameter.name])) throw new Error(`${item.name}：参数选项无效`)
      }
    }
    if (method.requiresOneOf?.length && !method.requiresOneOf.some(key => output[key] !== undefined)) throw new Error(`${item.name}：至少填写一个允许范围界限`)
    for (const [min, max] of [['min', 'max'], ['minAgl', 'maxAgl']]) if (output[min] !== undefined && output[max] !== undefined && output[min] > output[max]) throw new Error(`${item.name}：最小值不能大于最大值`)
    if (item.requiresTimestamp && !timestamp) throw new Error(`${item.name}是时变属性，必须填写查询时间（UTC Unix 秒）`)
    if (item.kind === 'environment' && ++environments > 32) throw new Error('数值环境条件最多 32 项')
    return output
  })
}

// A* 只接收其支持的候选约束；完整目录规则始终在生成路线后复检。
export function scenarioPlanningCondition(form, payload) {
  if (!payload.rules) return Object.fromEntries(Object.entries(payload.checks).filter(([key, enabled]) => enabled && key.endsWith('_17')).map(([key]) => [key, '']))
  const items = new Map(form.catalogItems.map(item => [item.id, item]))
  return Object.fromEntries(payload.rules.map(rule => items.get(rule.elementId)?.planningKey).filter(Boolean).map(key => [key, '']))
}

export async function requestConflictCatalog(form, options) {
  const payload = { datasetId: form.datasetId, level: CONFLICT_LEVEL }
  if (!blank(form.datasetVersion)) payload.datasetVersion = positiveInteger(form.datasetVersion, '数据集版本')
  if (!blank(form.stateRevision)) payload.stateRevision = positiveInteger(form.stateRevision, '状态修订号')
  const body = await fetchJson('/api/airRoute/conflictCheck/catalog', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }, options)
  if (body.data?.level !== CONFLICT_LEVEL || body.data?.datasetId !== form.datasetId || !Array.isArray(body.data?.items)
      || body.data.items.some(item => typeof item.id !== 'string' || typeof item.revision !== 'string' || !Array.isArray(item.methods))) throw new Error('判定目录响应格式不正确')
  return body.data
}

// 目录以活动定义和当前数据集绑定为准，包含可按时刻查询的环境属性。
export function conflictEnvironmentAttributes(items, datasetId, datasetVersion) {
  const latest = new Map()
  for (const item of items) {
    if (item.state !== 'active' || !item.code) continue
    if (!latest.has(item.code) || Number(item.schemaVersion) > Number(latest.get(item.code).schemaVersion)) latest.set(item.code, item)
  }
  return [...latest.values()].filter(item => ['float', 'int', 'uint'].includes(item.valueType)
    && ['static', 'interval'].includes(item.temporalMode)
    && item.bindings?.some(binding => binding.datasetId === datasetId
      && String(binding.datasetVersion) === String(datasetVersion) && Number(binding.level) === CONFLICT_LEVEL
      && binding.bindingId && Number(binding.projectionRevision) > 0))
}

async function fetchJson(url, options = {}, { signal, timeoutMs = 35000 } = {}) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) controller.abort()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    if (!response.ok) throw new Error(await errorMessage(response, `请求失败（${response.status}）`))
    const body = await response.json()
    if (body?.status !== 'success') throw new Error(body?.message || '服务返回失败')
    return body
  } catch (error) {
    if (timedOut) throw new Error('查询超时，请缩短航迹或减少检测条件后重试')
    throw error
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
export async function requestConflictCheck(payload, options) {
  const body = await fetchJson(CONFLICT_ENDPOINT, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }, options)
  const data = body.data
  if (typeof data?.conflict !== 'boolean' || !Array.isArray(data.conflicts)
      || data.level !== CONFLICT_LEVEL || data.conflict !== (data.conflicts.length > 0)
      || !Number.isSafeInteger(data.checkedGridCount) || data.checkedGridCount < 0
      || data.conflictGridCount !== data.conflicts.length || data.checkedGridCount < data.conflictGridCount
      || data.conflicts.some(hit => !/^[0-7]{17}$/.test(String(hit?.code || '').replace(/^dqg/, ''))
        || !Array.isArray(hit.reasons) || !hit.reasons.every(reason => typeof reason === 'string'))) {
    throw new Error('冲突检测响应格式不正确，未确认检测结果')
  }
  return data
}
export async function requestConflictPathCells(points, options) {
  const body = await fetchJson('/api/multiSource/geometricGrid/getGridByLine', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ line: points, level: CONFLICT_LEVEL }),
  }, options)
  if (!Array.isArray(body.data?.cells)) throw new Error('路径网格响应格式不正确')
  return body.data.cells
}
const codeOf = cell => String(cell.code || '').replace(/^dqg/, '')
export function conflictDisplayGrids(data, pathCells) {
  const geometry = new Map(pathCells.map(cell => [codeOf(cell), cell]))
  return data.conflicts.map(hit => ({ ...geometry.get(codeOf(hit)), ...hit, reason: conflictReasonsText(hit.reasons) }))
}
export function conflictMapCells(data, pathCells, mode) {
  const hits = new Map(data.conflicts.map(hit => [codeOf(hit), hit]))
  return pathCells.map(cell => {
    const hit = hits.get(codeOf(cell))
    const bounds = cell.bounds || { north: cell.maxlat, south: cell.minlat, east: cell.maxlon, west: cell.minlon, top: cell.top, bottom: cell.bottom }
    return {
      code: codeOf(cell), bounds, level: CONFLICT_LEVEL, isConflict: Boolean(hit),
      color: hit ? '#ef4444' : mode === 'FIRST' && data.conflict ? '#64748b' : '#3b82f6',
      reason: hit ? conflictReasonsText(hit.reasons) : '',
    }
  }).filter(cell => Object.values(cell.bounds).length === 6 && Object.values(cell.bounds).every(Number.isFinite))
}

// 冲突记录通常已合并航迹边界；可视化失败时仍能按完整三维编码单独定位。
export async function resolveConflictGrid(grid, options) {
  const code = codeOf(grid)
  if (!/^[0-7]{17}$/.test(code)) throw new Error('冲突网格编码必须为 L17')
  const normalize = value => ({
    west: value.bounds?.west ?? value.minlon ?? value.west,
    east: value.bounds?.east ?? value.maxlon ?? value.east,
    south: value.bounds?.south ?? value.minlat ?? value.south,
    north: value.bounds?.north ?? value.maxlat ?? value.north,
    bottom: value.bottom ?? value.bounds?.bottom,
    top: value.top ?? value.bounds?.top,
  })
  const valid = bounds => Object.values(bounds).every(Number.isFinite)
    && bounds.east > bounds.west && bounds.north > bounds.south && bounds.top >= bounds.bottom
    && bounds.west >= -180 && bounds.east <= 180 && bounds.south >= -90 && bounds.north <= 90
  let bounds = normalize(grid)
  if (!valid(bounds)) {
    const body = await fetchJson('/api/multiSource/basicGrid/getGridBoundaryByCode', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gridCode: code }),
    }, { timeoutMs: 10000, ...options })
    if (codeOf(body.data || {}) !== code || body.data?.level !== CONFLICT_LEVEL) throw new Error('网格边界响应与所选编码不一致')
    bounds = normalize(body.data)
    if (!valid(bounds)) throw new Error('未取得有效的网格边界，无法定位')
  }
  return { ...grid, code, level: CONFLICT_LEVEL, bounds }
}
