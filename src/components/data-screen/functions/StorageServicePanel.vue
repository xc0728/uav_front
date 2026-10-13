<script setup>
import { ref, reactive, computed, onBeforeUnmount } from 'vue'
import { Loader2, RefreshCw, ChevronDown, ChevronUp, Box, Building2, Mountain, Cloud, Search, Layers, Waypoints, Radar, Wrench } from 'lucide-vue-next'

// ==================== Tab 状态 ====================
const TABS = [
  { id: 'osgb', label: '模型网格化', icon: Box },
  { id: 'building', label: '建筑白模入库', icon: Building2 },
  { id: 'dem', label: 'DEM 地面网格', icon: Mountain },
  { id: 'demClassify', label: 'DEM 地形分类', icon: Layers },
  { id: 'trueAltitude', label: '真高空域剖分', icon: Cloud },
  { id: 'featureImport', label: '静态 Feature 导入', icon: Waypoints },
  { id: 'saveGrid', label: '空域网格入库', icon: Radar },
  { id: 'maintain', label: '维护与查询', icon: Wrench },
  { id: 'job', label: '任务查询', icon: Search },
]

const activeTab = ref('osgb')

const currentTabLabel = computed(() => TABS.find(t => t.id === activeTab.value)?.label || '')

function switchTab(id) {
  activeTab.value = id
  errors.value = {}
  feedback.value = null
}

// ==================== 提交状态与反馈 ====================
// 各功能独立提交状态：任一功能进行中时仅自身按钮显示"提交中"
const submittingMap = reactive({
  osgb: false,
  building: false,
  dem: false,
  demClassify: false,
  trueAltitude: false,
  featureImport: false,
  saveGrid: false,
})
const feedback = ref(null) // { type: 'success' | 'error', title, detail?, lines? }

// ==================== 校验工具 ====================
const errors = ref({})

function isBlank(v) {
  return v === null || v === undefined || String(v).trim() === ''
}

const INT_RE = /^-?\d+$/

// 整数范围校验：返回错误信息或空串
function intCheck(value, label, min, max) {
  if (isBlank(value)) return `${label}不能为空`
  const str = String(value).trim()
  if (!INT_RE.test(str)) return `${label}必须为整数`
  const num = Number(str)
  if (min !== undefined && num < min) return `${label}不能小于 ${min}`
  if (max !== undefined && num > max) return `${label}不能大于 ${max}`
  return ''
}

// 数值范围校验（允许小数，如真高米数）
function numCheck(value, label, min, max) {
  if (isBlank(value)) return `${label}不能为空`
  const num = Number(value)
  if (!Number.isFinite(num)) return `${label}必须为数字`
  if (min !== undefined && num < min) return `${label}不能小于 ${min}`
  if (max !== undefined && num > max) return `${label}不能大于 ${max}`
  return ''
}

function hasErrors(e) {
  return Object.values(e).some(msg => msg)
}

function setErrors(e) {
  errors.value = { ...errors.value, ...e }
}

// ==================== 模型网格化 ====================
const osgbForm = ref({
  mode: 'sync', // sync | aggregation
  format: 'osgb', // osgb | 3dtiles | auto
  source: 'osgb', // osgb | lod13
  inputFolder: '',
  level: 8,
  minLevel: 0,
})

function validateOsgb(key) {
  const f = osgbForm.value
  const e = {}
  if (isBlank(f.inputFolder)) e.inputFolder = '模型数据目录不能为空'
  const lv = intCheck(f.level, '目标网格层级', 0, 21)
  if (lv) e.level = lv
  if (f.mode === 'aggregation') {
    const ml = intCheck(f.minLevel, '最小聚合层级', 0, 21)
    if (ml) e.minLevel = ml
    else if (Number(f.minLevel) > Number(f.level)) e.minLevel = '最小聚合层级不能大于目标网格层级'
  }
  return key ? { [key]: e[key] || '' } : e
}

// ==================== 建筑白模 ====================
const buildingForm = ref({
  table: '',
  level: 14,
  input: 'building_model.json',
  maxCells: 2000000,
  refreshObstacle: false,
  replace: false,
  confirmReplace: false,
})

const WHITE_TABLE_RE = /^white_model_grid_[0-9]+$/

function validateBuilding(key) {
  const f = buildingForm.value
  const e = {}
  if (isBlank(f.table)) e.table = '目标表名不能为空'
  else if (!WHITE_TABLE_RE.test(String(f.table).trim())) e.table = '表名格式：white_model_grid_<层级>，如 white_model_grid_14'
  const lv = intCheck(f.level, '网格层级', 1, 21)
  if (lv) e.level = lv
  const mc = intCheck(f.maxCells, '最大网格数', 1, 2000000)
  if (mc) e.maxCells = mc
  if (f.replace && !f.confirmReplace) e.confirmReplace = '勾选覆盖已有数据后，必须勾选二次确认'
  return key ? { [key]: e[key] || '' } : e
}

// ==================== DEM 地面网格 ====================
const demForm = ref({
  buildId: '',
  inputPath: 'data/dem/zhejiang_dem_glo30.tif',
  table: '',
  level: 16,
  maxCells: 1000000000,
  batchSize: 100000,
})

const BUILD_ID_RE = /^[A-Za-z_][A-Za-z0-9_]{0,23}$/
const DEM_TABLE_RE = /^demgrid(?:_[0-9]+)?$/

function validateDem(key) {
  const f = demForm.value
  const e = {}
  if (isBlank(f.buildId)) e.buildId = '构建标识不能为空'
  else if (!BUILD_ID_RE.test(String(f.buildId).trim())) e.buildId = '仅允许字母/数字/下划线，且以字母或下划线开头，长度 1-24'
  if (isBlank(f.inputPath)) e.inputPath = 'DEM 文件路径不能为空'
  if (!isBlank(f.table) && !DEM_TABLE_RE.test(String(f.table).trim())) e.table = '表名格式：demgrid 或 demgrid_<层级>，如 demgrid_16'
  const lv = intCheck(f.level, '网格层级', 1, 21)
  if (lv) e.level = lv
  const mc = intCheck(f.maxCells, '最大网格数', 1, 5000000000)
  if (mc) e.maxCells = mc
  const bs = intCheck(f.batchSize, '批处理大小', 1000, 1000000)
  if (bs) e.batchSize = bs
  return key ? { [key]: e[key] || '' } : e
}

// ==================== 真高空域 ====================
const trueAltForm = ref({
  datasetId: '',
  sourceTable: 'demgrid',
  description: '',
  polygon: '',
  level: 17,
  minAgl: 0,
  maxAgl: 600,
  showAdvanced: false,
  maxSourceRows: 50000000,
  maxCells: 1000000000,
  batchSize: 100000,
  computeThreads: 0,
  maxConcurrentIo: 2,
  resumeVersion: '',
})

const DATASET_ID_RE = /^[A-Za-z0-9_.-]+$/

// 空间范围多边形校验：JSON 数组 [[lon,lat],...]，至少 3 点
function polygonCheck(v) {
  if (isBlank(v)) return ''
  let parsed
  try {
    parsed = JSON.parse(String(v))
  } catch {
    return '必须为合法 JSON，例如 [[119.9,30.5],[120.2,30.5],[120.2,30.65]]'
  }
  if (!Array.isArray(parsed) || parsed.length < 3) return '至少需要 3 个坐标点'
  for (const p of parsed) {
    if (!Array.isArray(p) || p.length !== 2 || !Number.isFinite(Number(p[0])) || !Number.isFinite(Number(p[1]))) {
      return '每个点必须是 [经度, 纬度] 的数字数组'
    }
  }
  return ''
}

function validateTrueAltitude(key) {
  const f = trueAltForm.value
  const e = {}
  if (isBlank(f.datasetId)) e.datasetId = '数据集标识不能为空'
  else {
    const v = String(f.datasetId).trim()
    if (!DATASET_ID_RE.test(v)) e.datasetId = '仅允许字母/数字/下划线/点/短横线'
    else if (v.length > 128) e.datasetId = '长度不能超过 128 个字符'
  }
  if (!isBlank(f.sourceTable) && !DEM_TABLE_RE.test(String(f.sourceTable).trim())) e.sourceTable = '表名格式：demgrid 或 demgrid_<层级>'
  const lv = intCheck(f.level, '网格层级', 17, 17)
  if (lv) e.level = '真高权威明细固定使用 L17；L16-L10 显示层级自动生成'
  const mn = numCheck(f.minAgl, '最低真高', 0, 100000)
  if (mn) e.minAgl = mn
  const mx = numCheck(f.maxAgl, '最高真高', 0, 100000)
  if (mx) e.maxAgl = mx
  else if (!mn && Number(f.maxAgl) < Number(f.minAgl)) e.maxAgl = '最高真高不能小于最低真高'
  const pg = polygonCheck(f.polygon)
  if (pg) e.polygon = pg
  if (!isBlank(f.description) && String(f.description).length > 2000) e.description = '描述长度不能超过 2000 个字符'
  if (f.showAdvanced) {
    const msr = intCheck(f.maxSourceRows, '最大源行数', 1, 4000000000)
    if (msr) e.maxSourceRows = msr
    const mc = intCheck(f.maxCells, '最大网格数', 1, 1000000000000)
    if (mc) e.maxCells = mc
    const bs = intCheck(f.batchSize, '批处理大小', 1)
    if (bs) e.batchSize = bs
    const ct = intCheck(f.computeThreads, '计算线程数', 0)
    if (ct) e.computeThreads = ct
    const io = intCheck(f.maxConcurrentIo, '最大并发 IO', 1, 64)
    if (io) e.maxConcurrentIo = io
    if (!isBlank(f.resumeVersion)) {
      const rv = intCheck(f.resumeVersion, '续跑版本号', 1)
      if (rv) e.resumeVersion = rv
    }
  }
  return key ? { [key]: e[key] || '' } : e
}

// ==================== DEM 地形分类 ====================
const demClassifyForm = ref({
  sourceTable: 'demgrid_16',
  level: 16,
  showAdvanced: false,
  maxSourceRows: 50000000,
  maxMappings: '',
})

function validateDemClassify(key) {
  const f = demClassifyForm.value
  const e = {}
  if (!isBlank(f.sourceTable) && !DEM_TABLE_RE.test(String(f.sourceTable).trim())) e.sourceTable = '表名格式：demgrid 或 demgrid_<层级>'
  const lv = intCheck(f.level, 'DQG 层级', 1, 21)
  if (lv) e.level = lv
  if (f.showAdvanced) {
    const msr = intCheck(f.maxSourceRows, '最大源行数', 1, 4000000000)
    if (msr) e.maxSourceRows = msr
    if (!isBlank(f.maxMappings)) {
      const mm = intCheck(f.maxMappings, '最大分类映射数', 1)
      if (mm) e.maxMappings = mm
    }
  }
  return key ? { [key]: e[key] || '' } : e
}

// ==================== 静态 Feature 导入 ====================
const FEATURE_THEMES = [
  'road', 'landuse', 'landcover', 'water', 'admin', 'transport', 'sensitive',
  'communication', 'navigation', 'surveillance', 'airspace', 'obstacle',
  'vertiport', 'terrain', 'air_route', 'utility', 'structure',
]
const HEIGHT_SOURCES = ['NONE', 'ATTRIBUTE', 'GEOMETRY_Z']

const featureForm = ref({
  datasetId: '',
  datasetName: '',
  theme: 'road',
  dimensionMode: '2D',
  level: 14,
  input: '',
  featureType: 'road',
  featureTypeField: '',
  heightSource: 'NONE',
  showAdvanced: false,
  featureTypeMapping: '',
  minHeightField: '',
  maxHeightField: '',
  maxMappings: 5000000,
})

function validateFeature(key) {
  const f = featureForm.value
  const e = {}
  if (isBlank(f.datasetId)) e.datasetId = 'Dataset 标识不能为空'
  else {
    const v = String(f.datasetId).trim()
    if (!DATASET_ID_RE.test(v)) e.datasetId = '仅允许字母/数字/下划线/点/短横线'
    else if (v.length > 128) e.datasetId = '长度不能超过 128 个字符'
  }
  if (!FEATURE_THEMES.includes(f.theme)) e.theme = '请选择业务主题'
  if (f.dimensionMode !== '2D' && f.dimensionMode !== '3D') e.dimensionMode = '维度模式只能为 2D 或 3D'
  const lv = intCheck(f.level, '水平 DQG 层级', 1, 21)
  if (lv) e.level = lv
  if (isBlank(f.input)) e.input = 'OGR 数据路径不能为空'
  else if (!/\.(shp|json|geojson)$/i.test(String(f.input).trim())) e.input = '仅支持 .shp / .json / .geojson 文件'
  if (isBlank(f.featureType) && isBlank(f.featureTypeField)) e.featureType = '固定 Feature 类型与类型字段必须二选一'
  if (!isBlank(f.featureType) && !isBlank(f.featureTypeField)) e.featureTypeField = '与固定 Feature 类型互斥，请清空其中一项'
  if (!HEIGHT_SOURCES.includes(f.heightSource)) e.heightSource = '高度来源不合法'
  if (f.showAdvanced) {
    if (!isBlank(f.featureTypeMapping)) {
      try {
        const m = JSON.parse(String(f.featureTypeMapping))
        if (!m || typeof m !== 'object' || Array.isArray(m)) e.featureTypeMapping = '必须为 JSON 对象，如 {"禁止性管制空域":"prohibited_airspace"}'
      } catch {
        e.featureTypeMapping = '必须为合法 JSON 对象'
      }
    }
    const hasMin = !isBlank(f.minHeightField)
    const hasMax = !isBlank(f.maxHeightField)
    if (hasMin !== hasMax) e.minHeightField = 'RANGE 最小/最大高度字段必须成对填写'
    else if ((hasMin || hasMax) && f.dimensionMode !== '3D') e.minHeightField = 'RANGE 高度字段仅 3D 模式可用'
    const mm = intCheck(f.maxMappings, '稀疏映射上限', 1, 50000000)
    if (mm) e.maxMappings = mm
  }
  return key ? { [key]: e[key] || '' } : e
}

// ==================== 空域网格入库 saveGrid ====================
const saveGridForm = ref({
  airspaceId: '',
  polygon: '',
  top: 500,
  bottom: 0,
  levels: '16,17',
  description: '',
  showAdvanced: false,
  batchSize: '',
  maxConcurrentIo: '',
  computeThreads: '',
})

function validateSaveGrid(key) {
  const f = saveGridForm.value
  const e = {}
  if (isBlank(f.airspaceId)) e.airspaceId = '空域标识不能为空'
  if (isBlank(f.polygon)) e.polygon = '空域多边形边界不能为空'
  else {
    const pg = polygonCheck(f.polygon)
    if (pg) e.polygon = pg
  }
  const tp = numCheck(f.top, '顶部高度', -1000, 100000)
  if (tp) e.top = tp
  const bt = numCheck(f.bottom, '底部高度', -1000, 100000)
  if (bt) e.bottom = bt
  else if (!tp && Number(f.bottom) >= Number(f.top)) e.bottom = '底部高度必须小于顶部高度'
  if (isBlank(f.levels)) e.levels = 'DQG 层级列表不能为空'
  else {
    const parts = String(f.levels).split(',').map(s => s.trim()).filter(s => s !== '')
    if (parts.length === 0) e.levels = 'DQG 层级列表不能为空'
    else if (parts.some(p => !/^\d+$/.test(p) || Number(p) > 21)) e.levels = '每项须为 0-21 的整数，用逗号分隔，如 16,17'
    else if (new Set(parts).size !== parts.length) e.levels = '层级不能重复'
  }
  if (!isBlank(f.description) && String(f.description).length > 2000) e.description = '描述长度不能超过 2000 个字符'
  if (f.showAdvanced) {
    if (!isBlank(f.batchSize)) {
      const v = intCheck(f.batchSize, 'ClickHouse 批量行数', 1)
      if (v) e.batchSize = v
    }
    if (!isBlank(f.maxConcurrentIo)) {
      const v = intCheck(f.maxConcurrentIo, '并发 IO 线程数', 1)
      if (v) e.maxConcurrentIo = v
    }
    if (!isBlank(f.computeThreads)) {
      const v = intCheck(f.computeThreads, '计算线程数', 0)
      if (v) e.computeThreads = v
    }
  }
  return key ? { [key]: e[key] || '' } : e
}

// ==================== 维护与查询 ====================
const maintainState = reactive({
  mapImport: { level: 16, airspaceId: '', version: '', source: 'osgb', busy: false },
  summaryBuild: { version: '', busy: false },
  taskStatus: { taskCode: '', busy: false },
  ta: { datasetId: '', datasetVersion: '', busy: false },
  activeVersionBusy: false,
  resultTitle: '',
  result: null,
  error: '',
})

function showMaintainResult(title, data) {
  maintainState.resultTitle = title
  maintainState.result = data
  maintainState.error = ''
}

function showMaintainError(title, err) {
  maintainState.resultTitle = title
  maintainState.result = null
  maintainState.error = err?.message || '请求失败，请稍后重试'
}

// 维护页轻量校验：失败时直接写入结果区错误信息
function maintainGuard(title, check) {
  const msg = check()
  if (msg) {
    showMaintainError(title, new Error(msg))
    return false
  }
  return true
}

async function runMapImport() {
  const m = maintainState.mapImport
  if (!maintainGuard('导入 OSGB 稀疏映射', () => {
    if (intCheck(m.level, '网格层级', 0, 21)) return intCheck(m.level, '网格层级', 0, 21)
    if (isBlank(m.airspaceId)) return '空域标识不能为空'
    if (intCheck(m.version, '全局版本', 0)) return intCheck(m.version, '全局版本', 0)
    return ''
  })) return
  m.busy = true
  try {
    const data = await postJson('/api/multiSource/airSpaceDB/grid/osgb/map/import', {
      level: Number(m.level),
      airspaceId: String(m.airspaceId).trim(),
      version: Number(m.version),
      source: m.source,
    })
    showMaintainResult('OSGB 稀疏映射导入完成', data?.data ?? data)
  } catch (e) {
    showMaintainError('OSGB 稀疏映射导入失败', e)
  } finally {
    m.busy = false
  }
}

async function runSummaryBuild() {
  const s = maintainState.summaryBuild
  if (!maintainGuard('构建 Block 汇总表', () => intCheck(s.version, '全局版本号', 0))) return
  s.busy = true
  try {
    const data = await postJson('/api/multiSource/airSpaceDB/summary/build', { version: Number(s.version) })
    showMaintainResult('Block 汇总表构建完成', data?.data ?? data)
  } catch (e) {
    showMaintainError('Block 汇总表构建失败', e)
  } finally {
    s.busy = false
  }
}

async function runTaskStatus() {
  const t = maintainState.taskStatus
  if (!maintainGuard('空域任务状态查询', () => (isBlank(t.taskCode) ? '任务编码 task_code 不能为空' : ''))) return
  t.busy = true
  try {
    const resp = await fetch(`/api/multiSource/airSpaceDB/task/status?task_code=${encodeURIComponent(String(t.taskCode).trim())}`, {
      headers: { 'Content-Type': 'application/json' },
    })
    let data = null
    try { data = await resp.json() } catch { /* 非 JSON 响应 */ }
    if (!resp.ok) throw new Error(data?.message || `查询失败: ${resp.status}`)
    showMaintainResult('空域任务状态', data?.data ?? data)
  } catch (e) {
    showMaintainError('空域任务状态查询失败', e)
  } finally {
    t.busy = false
  }
}

async function runActiveVersion() {
  maintainState.activeVersionBusy = true
  try {
    const resp = await fetch('/api/multiSource/airSpaceDB/version/active', {
      headers: { 'Content-Type': 'application/json' },
    })
    let data = null
    try { data = await resp.json() } catch { /* 非 JSON 响应 */ }
    if (!resp.ok) throw new Error(data?.message || `查询失败: ${resp.status}`)
    showMaintainResult('当前激活版本', data?.data ?? data)
  } catch (e) {
    showMaintainError('当前激活版本查询失败', e)
  } finally {
    maintainState.activeVersionBusy = false
  }
}

async function runTaDatasets() {
  const t = maintainState.ta
  t.busy = true
  try {
    const resp = await fetch('/api/true-altitude-airspace/datasets', { headers: { 'Content-Type': 'application/json' } })
    let data = null
    try { data = await resp.json() } catch { /* 非 JSON 响应 */ }
    if (!resp.ok) throw new Error(data?.message || `查询失败: ${resp.status}`)
    showMaintainResult('真高数据集列表', data?.data ?? data)
  } catch (e) {
    showMaintainError('真高数据集列表查询失败', e)
  } finally {
    t.busy = false
  }
}

async function runTaVersions() {
  const t = maintainState.ta
  if (!maintainGuard('真高数据集版本列表', () => (isBlank(t.datasetId) ? 'datasetId 不能为空' : ''))) return
  t.busy = true
  try {
    const resp = await fetch(`/api/true-altitude-airspace/datasets/${encodeURIComponent(String(t.datasetId).trim())}/versions`, {
      headers: { 'Content-Type': 'application/json' },
    })
    let data = null
    try { data = await resp.json() } catch { /* 非 JSON 响应 */ }
    if (!resp.ok) throw new Error(data?.message || `查询失败: ${resp.status}`)
    showMaintainResult(`真高数据集版本列表：${String(t.datasetId).trim()}`, data?.data ?? data)
  } catch (e) {
    showMaintainError('真高数据集版本列表查询失败', e)
  } finally {
    t.busy = false
  }
}

async function runTaVersionDetail() {
  const t = maintainState.ta
  if (!maintainGuard('真高数据集版本详情', () => {
    if (isBlank(t.datasetId)) return 'datasetId 不能为空'
    if (intCheck(t.datasetVersion, '版本号', 1)) return intCheck(t.datasetVersion, '版本号', 1)
    return ''
  })) return
  t.busy = true
  try {
    const resp = await fetch(
      `/api/true-altitude-airspace/datasets/${encodeURIComponent(String(t.datasetId).trim())}/versions/${Number(t.datasetVersion)}`,
      { headers: { 'Content-Type': 'application/json' } },
    )
    let data = null
    try { data = await resp.json() } catch { /* 非 JSON 响应 */ }
    if (!resp.ok) throw new Error(data?.message || `查询失败: ${resp.status}`)
    showMaintainResult(`真高版本详情：${String(t.datasetId).trim()} v${Number(t.datasetVersion)}`, data?.data ?? data)
  } catch (e) {
    showMaintainError('真高数据集版本详情查询失败', e)
  } finally {
    t.busy = false
  }
}

// ==================== 任务查询 ====================
const jobForm = ref({ jobId: '' })
const jobStatus = ref(null)
const jobError = ref('')
const jobPolling = ref(false)
let pollTimer = null

const JOB_ID_RE = /^[A-Za-z0-9_-]+$/

const JOB_STATUS_TEXT = {
  queued: '排队中',
  running: '执行中',
  succeeded: '成功',
  failed: '失败',
}

const jobStatusText = computed(() => JOB_STATUS_TEXT[jobStatus.value?.status] || jobStatus.value?.status || '-')

function validateJobId() {
  const v = String(jobForm.value.jobId || '').trim()
  if (isBlank(v)) return '任务 ID 不能为空'
  if (!JOB_ID_RE.test(v)) return '仅允许字母/数字/下划线/短横线'
  if (v.length > 128) return '长度不能超过 128 个字符'
  return ''
}

function stopJobPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
}

function startJobPolling(jobId) {
  stopJobPolling()
  jobForm.value.jobId = jobId
  activeTab.value = 'job'
  pollJobStatus(true)
  pollTimer = window.setInterval(() => pollJobStatus(false), 2000)
}

async function pollJobStatus(reset) {
  if (jobPolling.value && !reset) return
  const err = validateJobId()
  if (err) {
    errors.value = { ...errors.value, jobId: err }
    return
  }
  errors.value = { ...errors.value, jobId: '' }
  jobPolling.value = true
  if (reset) {
    jobError.value = ''
    jobStatus.value = null
  }
  try {
    const resp = await fetch(`/api/data-processing-jobs/${encodeURIComponent(String(jobForm.value.jobId).trim())}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
    let data = null
    try { data = await resp.json() } catch { /* 非 JSON 响应 */ }
    if (!resp.ok) throw new Error(data?.message || `查询失败: ${resp.status}`)
    jobStatus.value = data?.data || null
    const st = jobStatus.value?.status
    if (st === 'succeeded' || st === 'failed') stopJobPolling()
  } catch (e) {
    jobError.value = e?.message || '查询任务状态失败'
    jobStatus.value = null
    stopJobPolling()
  } finally {
    jobPolling.value = false
  }
}

function formatTime(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('zh-CN', { hour12: false })
}

function formatNumber(n) {
  if (n === null || n === undefined) return '-'
  return Number(n).toLocaleString('zh-CN')
}

function formatProgressPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '-'
  return `${Math.round(Number(value))}%`
}

// ==================== 请求与提交 ====================
async function postJson(url, body) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  let data = null
  try { data = await resp.json() } catch { /* 非 JSON 响应 */ }
  if (!resp.ok) {
    throw new Error(data?.message || `请求失败: ${resp.status}`)
  }
  return data
}

function validateField(key) {
  const validators = {
    osgb: validateOsgb,
    building: validateBuilding,
    dem: validateDem,
    demClassify: validateDemClassify,
    trueAltitude: validateTrueAltitude,
    featureImport: validateFeature,
    saveGrid: validateSaveGrid,
  }
  const fn = validators[activeTab.value]
  if (fn && key) setErrors(fn(key))
}

async function submitOsgb() {
  const e = validateOsgb()
  setErrors(e)
  if (hasErrors(e)) return
  submittingMap.osgb = true
  feedback.value = null
  const f = osgbForm.value
  const useAggregation = f.mode === 'aggregation'
  try {
    const body = {
      level: Number(f.level),
      format: f.format,
      source: f.source,
    }
    if (useAggregation) {
      body.osgbFolder = String(f.inputFolder).trim()
      body.minLevel = Number(f.minLevel)
    } else {
      body.inputFolder = String(f.inputFolder).trim()
    }
    const url = useAggregation
      ? '/api/multiSource/triangleGrid/osgbToGridAggregation'
      : '/api/multiSource/triangleGrid/modelToGridJson'
    const data = await postJson(url, body)
    handleJobAccepted(data, useAggregation ? '模型聚合入库' : '模型网格化入库')
  } catch (err) {
    feedback.value = { type: 'error', title: '模型网格化入库任务提交失败', detail: err?.message || '网络错误，请稍后重试' }
  } finally {
    submittingMap.osgb = false
  }
}

async function submitBuilding() {
  const e = validateBuilding()
  setErrors(e)
  if (hasErrors(e)) return
  submittingMap.building = true
  feedback.value = null
  const f = buildingForm.value
  try {
    const body = {
      table: String(f.table).trim(),
      level: Number(f.level),
      maxCells: Number(f.maxCells),
    }
    if (!isBlank(f.input)) body.input = String(f.input).trim()
    if (f.refreshObstacle) body.refreshObstacle = true
    if (f.replace) {
      body.replace = true
      if (f.confirmReplace) body.confirmReplace = true
    }
    const data = await postJson('/api/building-model/grid-import-jobs', body)
    handleJobAccepted(data, '建筑白模网格化')
  } catch (err) {
    feedback.value = { type: 'error', title: '建筑白模入库任务提交失败', detail: err?.message || '网络错误，请稍后重试' }
  } finally {
    submittingMap.building = false
  }
}

async function submitDem() {
  const e = validateDem()
  setErrors(e)
  if (hasErrors(e)) return
  submittingMap.dem = true
  feedback.value = null
  const f = demForm.value
  try {
    const body = {
      buildId: String(f.buildId).trim(),
      inputPath: String(f.inputPath).trim(),
      level: Number(f.level),
      maxCells: Number(f.maxCells),
      batchSize: Number(f.batchSize),
    }
    if (!isBlank(f.table)) body.table = String(f.table).trim()
    const data = await postJson('/api/dem/raster-grid-build-jobs', body)
    handleJobAccepted(data, 'DEM 地面网格构建')
  } catch (err) {
    feedback.value = { type: 'error', title: 'DEM 构建任务提交失败', detail: err?.message || '网络错误，请稍后重试' }
  } finally {
    submittingMap.dem = false
  }
}

async function submitTrueAltitude() {
  const e = validateTrueAltitude()
  setErrors(e)
  if (hasErrors(e)) return
  submittingMap.trueAltitude = true
  feedback.value = null
  const f = trueAltForm.value
  try {
    const body = {
      datasetId: String(f.datasetId).trim(),
      level: Number(f.level),
      minAgl: Number(f.minAgl),
      maxAgl: Number(f.maxAgl),
    }
    if (!isBlank(f.sourceTable)) body.sourceTable = String(f.sourceTable).trim()
    if (!isBlank(f.description)) body.description = String(f.description).trim()
    if (!isBlank(f.polygon)) body.polygon = JSON.parse(String(f.polygon))
    if (f.showAdvanced) {
      body.maxSourceRows = Number(f.maxSourceRows)
      body.maxCells = Number(f.maxCells)
      body.batchSize = Number(f.batchSize)
      body.computeThreads = Number(f.computeThreads)
      body.maxConcurrentIo = Number(f.maxConcurrentIo)
      if (!isBlank(f.resumeVersion)) body.resumeVersion = Number(f.resumeVersion)
    }
    const data = await postJson('/api/true-altitude-airspace/import-jobs', body)
    handleJobAccepted(data, '真高空域剖分入库')
  } catch (err) {
    feedback.value = { type: 'error', title: '真高空域入库任务提交失败', detail: err?.message || '网络错误，请稍后重试' }
  } finally {
    submittingMap.trueAltitude = false
  }
}

async function submitDemClassify() {
  const e = validateDemClassify()
  setErrors(e)
  if (hasErrors(e)) return
  submittingMap.demClassify = true
  feedback.value = null
  const f = demClassifyForm.value
  try {
    const body = { level: Number(f.level) }
    if (!isBlank(f.sourceTable)) body.sourceTable = String(f.sourceTable).trim()
    if (f.showAdvanced) {
      body.maxSourceRows = Number(f.maxSourceRows)
      if (!isBlank(f.maxMappings)) body.maxMappings = Number(f.maxMappings)
    }
    const data = await postJson('/api/dem/terrain-classification-jobs', body)
    handleJobAccepted(data, 'DEM 地表/地下分类')
  } catch (err) {
    feedback.value = { type: 'error', title: 'DEM 地形分类任务提交失败', detail: err?.message || '网络错误，请稍后重试' }
  } finally {
    submittingMap.demClassify = false
  }
}

async function submitFeatureImport() {
  const e = validateFeature()
  setErrors(e)
  if (hasErrors(e)) return
  submittingMap.featureImport = true
  feedback.value = null
  const f = featureForm.value
  try {
    const body = {
      datasetId: String(f.datasetId).trim(),
      theme: f.theme,
      dimensionMode: f.dimensionMode,
      level: Number(f.level),
      input: String(f.input).trim(),
      heightSource: f.heightSource,
    }
    if (!isBlank(f.datasetName)) body.datasetName = String(f.datasetName).trim()
    if (!isBlank(f.featureType)) body.featureType = String(f.featureType).trim()
    if (!isBlank(f.featureTypeField)) body.featureTypeField = String(f.featureTypeField).trim()
    if (f.showAdvanced) {
      if (!isBlank(f.featureTypeMapping)) body.featureTypeMapping = JSON.parse(String(f.featureTypeMapping))
      if (!isBlank(f.minHeightField)) body.minHeightField = String(f.minHeightField).trim()
      if (!isBlank(f.maxHeightField)) body.maxHeightField = String(f.maxHeightField).trim()
      body.maxMappings = Number(f.maxMappings)
    }
    const data = await postJson('/api/static-features/import-jobs', body)
    handleJobAccepted(data, '静态 Feature 导入')
  } catch (err) {
    feedback.value = { type: 'error', title: '静态 Feature 导入任务提交失败', detail: err?.message || '网络错误，请稍后重试' }
  } finally {
    submittingMap.featureImport = false
  }
}

async function submitSaveGrid() {
  const e = validateSaveGrid()
  setErrors(e)
  if (hasErrors(e)) return
  submittingMap.saveGrid = true
  feedback.value = null
  const f = saveGridForm.value
  try {
    const body = {
      airspaceId: String(f.airspaceId).trim(),
      polygon: JSON.parse(String(f.polygon)),
      top: Number(f.top),
      bottom: Number(f.bottom),
      levels: String(f.levels).split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n)),
    }
    if (!isBlank(f.description)) body.description = String(f.description).trim()
    if (f.showAdvanced) {
      if (!isBlank(f.batchSize)) body.batch_size = Number(f.batchSize)
      if (!isBlank(f.maxConcurrentIo)) body.max_concurrent_io = Number(f.maxConcurrentIo)
      if (!isBlank(f.computeThreads)) body.compute_threads = Number(f.computeThreads)
    }
    const data = await postJson('/api/multiSource/airSpaceDB/saveGrid', body)
    // 双任务体系：jobId 走通用任务轮询；task_code 用于维护页查询空域持久任务详细状态
    const d = data?.data || {}
    const jobId = d.jobId ?? d.job_id
    const taskCode = d.task_code ?? d.taskCode
    if (jobId) {
      const lines = [`任务 ID：${jobId}，正在跟踪执行进度`]
      if (taskCode) lines.push(`空域任务编码 task_code：${taskCode}（可在“维护与查询”页跟踪详细状态）`)
      feedback.value = { type: 'success', title: '空域网格入库任务已提交', detail: lines.join('\n') }
      startJobPolling(jobId)
    } else {
      handleJobAccepted(data, '空域网格入库')
    }
  } catch (err) {
    feedback.value = { type: 'error', title: '空域网格入库任务提交失败', detail: err?.message || '网络错误，请稍后重试' }
  } finally {
    submittingMap.saveGrid = false
  }
}

// 202 异步任务统一处理：提示成功并自动轮询进度
// 兼容两种字段风格：triangleGrid 系列为 job_id/status_url，其余为 jobId/statusUrl
function handleJobAccepted(data, label) {
  const d = data?.data || {}
  const jobId = d.jobId ?? d.job_id
  if (jobId) {
    const lines = [`任务 ID：${jobId}，正在跟踪执行进度`]
    if (d.targetTable) lines.push(`目标表：${d.targetTable}`)
    feedback.value = {
      type: 'success',
      title: `${label}任务已提交`,
      detail: lines.join('\n'),
    }
    startJobPolling(jobId)
  } else {
    feedback.value = { type: 'success', title: `${label}提交成功`, detail: data?.message }
  }
}

onBeforeUnmount(() => {
  stopJobPolling()
})
</script>

<template>
  <div class="storage-panel">
    <!-- 左侧导航栏 -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <h2>数据管理服务</h2>
      </div>
      <nav class="sidebar-nav">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          type="button"
          class="nav-item"
          :class="{ active: activeTab === tab.id }"
          @click="switchTab(tab.id)"
        >
          <component :is="tab.icon" :size="18" class="nav-icon" />
          <span class="nav-text">{{ tab.label }}</span>
        </button>
      </nav>
    </aside>

    <!-- 主内容区 -->
    <main class="main-content">
      <div class="breadcrumb">
        <span class="breadcrumb-item">智绘平台</span>
        <span class="breadcrumb-separator">/</span>
        <span class="breadcrumb-item">数据管理服务</span>
        <span class="breadcrumb-separator">/</span>
        <span class="breadcrumb-item current">{{ currentTabLabel }}</span>
      </div>

      <div class="storage-body">
      <!-- 反馈提示条 -->
      <div v-if="feedback" class="feedback" :class="feedback.type" role="status">
        <span class="feedback-title">{{ feedback.title }}</span>
        <span v-if="feedback.detail" class="feedback-detail">{{ feedback.detail }}</span>
      </div>

      <!-- 模型网格化 -->
      <section v-show="activeTab === 'osgb'" class="storage-card">
        <div class="card-title">OSGB / 3D Tiles 模型网格化入库</div>
        <p class="card-desc">读取指定目录中的 OSGB 或 3D Tiles 模型，将三角面映射为指定层级的网格并写入数据库。任务提交后异步执行，将自动跟踪执行进度。</p>

        <div class="mode-row">
          <span class="mode-label">入库模式</span>
          <label class="radio-item">
            <input v-model="osgbForm.mode" type="radio" value="sync" />
            <span>标准入库（不跨层聚合）</span>
          </label>
          <label class="radio-item">
            <input v-model="osgbForm.mode" type="radio" value="aggregation" />
            <span>聚合入库（minLevel ~ level 跨层聚合）</span>
          </label>
        </div>

        <div class="mode-row">
          <span class="mode-label">输入格式</span>
          <label class="radio-item">
            <input v-model="osgbForm.format" type="radio" value="osgb" />
            <span>OSGB</span>
          </label>
          <label class="radio-item">
            <input v-model="osgbForm.format" type="radio" value="3dtiles" />
            <span>3D Tiles</span>
          </label>
          <label class="radio-item">
            <input v-model="osgbForm.format" type="radio" value="auto" />
            <span>自动识别</span>
          </label>
        </div>

        <div class="mode-row">
          <span class="mode-label">数据来源</span>
          <label class="radio-item">
            <input v-model="osgbForm.source" type="radio" value="osgb" />
            <span>倾斜摄影（osgbgrid 表）</span>
          </label>
          <label class="radio-item">
            <input v-model="osgbForm.source" type="radio" value="lod13" />
            <span>LOD1.3 建筑（lod13grid 表）</span>
          </label>
        </div>

        <div class="form-grid">
          <div class="form-field span-2" :class="{ 'has-error': errors.inputFolder }">
            <label>模型数据目录 <span class="req">*</span></label>
            <input
              v-model="osgbForm.inputFolder"
              type="text"
              placeholder="例如：data/osgb/tile_dir 或 data/lod13_3dtiles"
              @blur="validateField('inputFolder')"
            />
            <span v-if="errors.inputFolder" class="field-error">{{ errors.inputFolder }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.level }">
            <label>目标网格层级（0-21） <span class="req">*</span></label>
            <input v-model.number="osgbForm.level" type="number" min="0" max="21" @blur="validateField('level')" />
            <span v-if="errors.level" class="field-error">{{ errors.level }}</span>
          </div>
          <div v-if="osgbForm.mode === 'aggregation'" class="form-field" :class="{ 'has-error': errors.minLevel }">
            <label>最小聚合层级（0-21） <span class="req">*</span></label>
            <input v-model.number="osgbForm.minLevel" type="number" min="0" max="21" @blur="validateField('minLevel')" />
            <span v-if="errors.minLevel" class="field-error">{{ errors.minLevel }}</span>
            <span v-else class="field-hint">不得大于目标网格层级</span>
          </div>
        </div>

        <div class="submit-row">
          <button class="btn-primary" type="button" :disabled="submittingMap.osgb" @click="submitOsgb">
            <Loader2 v-if="submittingMap.osgb" :size="14" class="spin" />
            <span>{{ submittingMap.osgb ? '提交中...' : '提交入库' }}</span>
          </button>
          <span class="submit-hint">提交后任务进入异步队列，将自动跟踪进度</span>
        </div>
      </section>

      <!-- 建筑白模 -->
      <section v-show="activeTab === 'building'" class="storage-card">
        <div class="card-title">建筑白模网格化入库</div>
        <p class="card-desc">将单外环 Polygon 建筑白模 GeoJSON 网格化并异步写入 PostgreSQL。表名必须与层级一致。</p>

        <div class="form-grid">
          <div class="form-field" :class="{ 'has-error': errors.table }">
            <label>目标表名 <span class="req">*</span></label>
            <input
              v-model="buildingForm.table"
              type="text"
              placeholder="white_model_grid_14"
              @blur="validateField('table')"
            />
            <span v-if="errors.table" class="field-error">{{ errors.table }}</span>
            <span v-else class="field-hint">格式：white_model_grid_&lt;层级&gt;</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.level }">
            <label>网格层级（1-21）</label>
            <input v-model.number="buildingForm.level" type="number" min="1" max="21" @blur="validateField('level')" />
            <span v-if="errors.level" class="field-error">{{ errors.level }}</span>
          </div>
          <div class="form-field">
            <label>白模 GeoJSON 输入文件</label>
            <input v-model="buildingForm.input" type="text" placeholder="building_model.json" />
          </div>
          <div class="form-field" :class="{ 'has-error': errors.maxCells }">
            <label>最大网格数（1-2000000）</label>
            <input v-model.number="buildingForm.maxCells" type="number" min="1" max="2000000" @blur="validateField('maxCells')" />
            <span v-if="errors.maxCells" class="field-error">{{ errors.maxCells }}</span>
          </div>
        </div>

        <div class="check-group">
          <label class="checkbox-item">
            <input v-model="buildingForm.refreshObstacle" type="checkbox" />
            <span>提交后刷新障碍物数据（未勾选时仅层级 14 默认启用）</span>
          </label>
          <label class="checkbox-item">
            <input v-model="buildingForm.replace" type="checkbox" />
            <span>覆盖已有目标表数据（replace）</span>
          </label>
          <label v-if="buildingForm.replace" class="checkbox-item confirm" :class="{ 'has-error': errors.confirmReplace }">
            <input v-model="buildingForm.confirmReplace" type="checkbox" @change="validateField('confirmReplace')" />
            <span>我确认要覆盖目标表中的已有数据（二次确认）</span>
          </label>
          <span v-if="errors.confirmReplace" class="field-error">{{ errors.confirmReplace }}</span>
        </div>

        <div class="submit-row">
          <button class="btn-primary" type="button" :disabled="submittingMap.building" @click="submitBuilding">
            <Loader2 v-if="submittingMap.building" :size="14" class="spin" />
            <span>{{ submittingMap.building ? '提交中...' : '提交入库任务' }}</span>
          </button>
          <span class="submit-hint">提交后任务进入异步队列，将自动跟踪进度</span>
        </div>
      </section>

      <!-- DEM 地面网格 -->
      <section v-show="activeTab === 'dem'" class="storage-card">
        <div class="card-title">DEM 地面网格构建</div>
        <p class="card-desc">流式读取 GDAL 可识别且可转换到 EPSG:4490 的单波段 DEM GeoTIFF，按目标 DQG 网格中心双线性采样并批量写入 PostgreSQL。相同 buildId 可从检查点继续。</p>

        <div class="form-grid">
          <div class="form-field" :class="{ 'has-error': errors.buildId }">
            <label>构建标识 buildId <span class="req">*</span></label>
            <input
              v-model="demForm.buildId"
              type="text"
              placeholder="zhejiang_glo30_l16_v1"
              @blur="validateField('buildId')"
            />
            <span v-if="errors.buildId" class="field-error">{{ errors.buildId }}</span>
            <span v-else class="field-hint">字母/数字/下划线，字母或下划线开头，最长 24 字符；失败后可用相同值恢复</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.inputPath }">
            <label>DEM 文件路径 <span class="req">*</span></label>
            <input
              v-model="demForm.inputPath"
              type="text"
              placeholder="data/dem/zhejiang_dem_glo30.tif"
              @blur="validateField('inputPath')"
            />
            <span v-if="errors.inputPath" class="field-error">{{ errors.inputPath }}</span>
            <span v-else class="field-hint">项目根目录下的相对路径</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.table }">
            <label>目标表名</label>
            <input v-model="demForm.table" type="text" placeholder="demgrid_16" @blur="validateField('table')" />
            <span v-if="errors.table" class="field-error">{{ errors.table }}</span>
            <span v-else class="field-hint">demgrid 或 demgrid_&lt;层级&gt;，须与层级一致</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.level }">
            <label>网格层级（1-21）</label>
            <input v-model.number="demForm.level" type="number" min="1" max="21" @blur="validateField('level')" />
            <span v-if="errors.level" class="field-error">{{ errors.level }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.maxCells }">
            <label>最大网格数</label>
            <input v-model.number="demForm.maxCells" type="number" min="1" max="5000000000" @blur="validateField('maxCells')" />
            <span v-if="errors.maxCells" class="field-error">{{ errors.maxCells }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.batchSize }">
            <label>批处理大小（1000-1000000）</label>
            <input v-model.number="demForm.batchSize" type="number" min="1000" max="1000000" @blur="validateField('batchSize')" />
            <span v-if="errors.batchSize" class="field-error">{{ errors.batchSize }}</span>
          </div>
        </div>

        <div class="submit-row">
          <button class="btn-primary" type="button" :disabled="submittingMap.dem" @click="submitDem">
            <Loader2 v-if="submittingMap.dem" :size="14" class="spin" />
            <span>{{ submittingMap.dem ? '提交中...' : '提交构建任务' }}</span>
          </button>
          <span class="submit-hint">提交后任务进入异步队列，将自动跟踪进度</span>
        </div>
      </section>

      <!-- DEM 地形分类 -->
      <section v-show="activeTab === 'demClassify'" class="storage-card">
        <div class="card-title">DEM 地表/地下网格分类</div>
        <p class="card-desc">保持 PostgreSQL DEM 数据不变，将 ClickHouse 当前活动空域中与 DEM 同层的网格标记为 terrain_surface，更低网格标记为 underground，并设置 flyable=0。</p>

        <div class="form-grid">
          <div class="form-field" :class="{ 'has-error': errors.sourceTable }">
            <label>DEM 源表</label>
            <input v-model="demClassifyForm.sourceTable" type="text" placeholder="demgrid_16" @blur="validateField('sourceTable')" />
            <span v-if="errors.sourceTable" class="field-error">{{ errors.sourceTable }}</span>
            <span v-else class="field-hint">demgrid 或 demgrid_&lt;层级&gt;</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.level }">
            <label>DQG 层级（1-21）</label>
            <input v-model.number="demClassifyForm.level" type="number" min="1" max="21" @blur="validateField('level')" />
            <span v-if="errors.level" class="field-error">{{ errors.level }}</span>
          </div>
        </div>

        <button class="advanced-toggle" type="button" @click="demClassifyForm.showAdvanced = !demClassifyForm.showAdvanced">
          <component :is="demClassifyForm.showAdvanced ? ChevronUp : ChevronDown" :size="14" />
          <span>{{ demClassifyForm.showAdvanced ? '收起高级参数' : '展开高级参数' }}</span>
        </button>

        <div v-show="demClassifyForm.showAdvanced" class="form-grid advanced">
          <div class="form-field" :class="{ 'has-error': errors.maxSourceRows }">
            <label>DEM 源行数上限</label>
            <input v-model.number="demClassifyForm.maxSourceRows" type="number" min="1" max="4000000000" @blur="validateField('maxSourceRows')" />
            <span v-if="errors.maxSourceRows" class="field-error">{{ errors.maxSourceRows }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.maxMappings }">
            <label>分类映射上限</label>
            <input v-model.number="demClassifyForm.maxMappings" type="number" min="1" placeholder="留空使用服务端默认" @blur="validateField('maxMappings')" />
            <span v-if="errors.maxMappings" class="field-error">{{ errors.maxMappings }}</span>
          </div>
        </div>

        <div class="submit-row">
          <button class="btn-primary" type="button" :disabled="submittingMap.demClassify" @click="submitDemClassify">
            <Loader2 v-if="submittingMap.demClassify" :size="14" class="spin" />
            <span>{{ submittingMap.demClassify ? '提交中...' : '提交分类任务' }}</span>
          </button>
          <span class="submit-hint">提交后任务进入异步队列，将自动跟踪进度</span>
        </div>
      </section>

      <!-- 真高空域 -->
      <section v-show="activeTab === 'trueAltitude'" class="storage-card">
        <div class="card-title">真高空域网格剖分入库</div>
        <p class="card-desc">从 PostgreSQL DEM 地面网格读取地面高程，生成地面以上指定真高范围的三维 DQG 网格并写入 ClickHouse。不填写空间范围时处理整个源表。</p>

        <div class="form-grid">
          <div class="form-field" :class="{ 'has-error': errors.datasetId }">
            <label>数据集标识 datasetId <span class="req">*</span></label>
            <input
              v-model="trueAltForm.datasetId"
              type="text"
              placeholder="zhejiang_deqing_l14_0_600"
              @blur="validateField('datasetId')"
            />
            <span v-if="errors.datasetId" class="field-error">{{ errors.datasetId }}</span>
            <span v-else class="field-hint">同一标识的后续任务将生成新版本</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.sourceTable }">
            <label>源 DEM 网格表</label>
            <input v-model="trueAltForm.sourceTable" type="text" placeholder="demgrid" @blur="validateField('sourceTable')" />
            <span v-if="errors.sourceTable" class="field-error">{{ errors.sourceTable }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.level }">
            <label>网格层级（权威明细固定 L17；L16-L10 自动生成）</label>
            <input v-model.number="trueAltForm.level" type="number" min="17" max="17" readonly @blur="validateField('level')" />
            <span v-if="errors.level" class="field-error">{{ errors.level }}</span>
          </div>
          <div class="form-field">
            <label>任务描述</label>
            <input v-model="trueAltForm.description" type="text" maxlength="2000" placeholder="选填，最长 2000 字" @blur="validateField('description')" />
            <span v-if="errors.description" class="field-error">{{ errors.description }}</span>
          </div>
          <div class="form-field span-2" :class="{ 'has-error': errors.polygon }">
            <label>空间范围多边形 polygon（选填）</label>
            <textarea
              v-model="trueAltForm.polygon"
              rows="3"
              placeholder='[[119.9,30.5],[120.2,30.5],[120.2,30.65],[119.9,30.65]]'
              @blur="validateField('polygon')"
            ></textarea>
            <span v-if="errors.polygon" class="field-error">{{ errors.polygon }}</span>
            <span v-else class="field-hint">JSON 数组，[[经度,纬度],...] 单外环至少 3 点；留空处理整个源表</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.minAgl }">
            <label>最低真高（米）</label>
            <input v-model.number="trueAltForm.minAgl" type="number" min="0" max="100000" step="any" @blur="validateField('minAgl')" />
            <span v-if="errors.minAgl" class="field-error">{{ errors.minAgl }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.maxAgl }">
            <label>最高真高（米）</label>
            <input v-model.number="trueAltForm.maxAgl" type="number" min="0" max="100000" step="any" @blur="validateField('maxAgl')" />
            <span v-if="errors.maxAgl" class="field-error">{{ errors.maxAgl }}</span>
            <span v-else class="field-hint">不得小于最低真高</span>
          </div>
        </div>

        <button class="advanced-toggle" type="button" @click="trueAltForm.showAdvanced = !trueAltForm.showAdvanced">
          <component :is="trueAltForm.showAdvanced ? ChevronUp : ChevronDown" :size="14" />
          <span>{{ trueAltForm.showAdvanced ? '收起高级参数' : '展开高级参数' }}</span>
        </button>

        <div v-show="trueAltForm.showAdvanced" class="form-grid advanced">
          <div class="form-field" :class="{ 'has-error': errors.maxSourceRows }">
            <label>最大源行数</label>
            <input v-model.number="trueAltForm.maxSourceRows" type="number" min="1" max="4000000000" @blur="validateField('maxSourceRows')" />
            <span v-if="errors.maxSourceRows" class="field-error">{{ errors.maxSourceRows }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.maxCells }">
            <label>最大网格数</label>
            <input v-model.number="trueAltForm.maxCells" type="number" min="1" max="1000000000000" @blur="validateField('maxCells')" />
            <span v-if="errors.maxCells" class="field-error">{{ errors.maxCells }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.batchSize }">
            <label>批处理大小</label>
            <input v-model.number="trueAltForm.batchSize" type="number" min="1" @blur="validateField('batchSize')" />
            <span v-if="errors.batchSize" class="field-error">{{ errors.batchSize }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.computeThreads }">
            <label>TBB 计算线程数（0 为自动）</label>
            <input v-model.number="trueAltForm.computeThreads" type="number" min="0" @blur="validateField('computeThreads')" />
            <span v-if="errors.computeThreads" class="field-error">{{ errors.computeThreads }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.maxConcurrentIo }">
            <label>最大并发 IO（1-64）</label>
            <input v-model.number="trueAltForm.maxConcurrentIo" type="number" min="1" max="64" @blur="validateField('maxConcurrentIo')" />
            <span v-if="errors.maxConcurrentIo" class="field-error">{{ errors.maxConcurrentIo }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.resumeVersion }">
            <label>续跑版本号 resumeVersion</label>
            <input v-model.number="trueAltForm.resumeVersion" type="number" min="1" placeholder="留空表示新任务" @blur="validateField('resumeVersion')" />
            <span v-if="errors.resumeVersion" class="field-error">{{ errors.resumeVersion }}</span>
            <span v-else class="field-hint">仅可续跑该数据集下失败/构建中的版本，参数须与原任务一致</span>
          </div>
        </div>

        <div class="submit-row">
          <button class="btn-primary" type="button" :disabled="submittingMap.trueAltitude" @click="submitTrueAltitude">
            <Loader2 v-if="submittingMap.trueAltitude" :size="14" class="spin" />
            <span>{{ submittingMap.trueAltitude ? '提交中...' : '提交剖分任务' }}</span>
          </button>
          <span class="submit-hint">提交后任务进入异步队列，将自动跟踪进度</span>
        </div>
      </section>

      <!-- 静态 Feature 导入 -->
      <section v-show="activeTab === 'featureImport'" class="storage-card">
        <div class="card-title">静态业务 Feature-DQG 导入</div>
        <p class="card-desc">把 Shapefile/GeoJSON 通用业务要素转换为水平 DQG 稀疏关系：PostgreSQL 保存原始 Feature 与 Geometry，ClickHouse 保存查询投影。同一 datasetId 再次导入将全量覆盖该 Dataset。</p>

        <div class="form-grid">
          <div class="form-field" :class="{ 'has-error': errors.datasetId }">
            <label>Dataset 标识 <span class="req">*</span></label>
            <input v-model="featureForm.datasetId" type="text" placeholder="road_deqing" @blur="validateField('datasetId')" />
            <span v-if="errors.datasetId" class="field-error">{{ errors.datasetId }}</span>
            <span v-else class="field-hint">字母/数字/下划线/点/短横线，最长 128 字符</span>
          </div>
          <div class="form-field">
            <label>Dataset 名称</label>
            <input v-model="featureForm.datasetName" type="text" placeholder="留空时使用 datasetId" />
          </div>
          <div class="form-field" :class="{ 'has-error': errors.theme }">
            <label>业务主题 <span class="req">*</span></label>
            <select v-model="featureForm.theme" @change="validateField('theme')">
              <option v-for="t in FEATURE_THEMES" :key="t" :value="t">{{ t }}</option>
            </select>
            <span v-if="errors.theme" class="field-error">{{ errors.theme }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.dimensionMode }">
            <label>维度模式 <span class="req">*</span></label>
            <select v-model="featureForm.dimensionMode" @change="validateField('dimensionMode')">
              <option value="2D">2D（无 z 映射）</option>
              <option value="3D">3D（ALL 或 RANGE）</option>
            </select>
            <span v-if="errors.dimensionMode" class="field-error">{{ errors.dimensionMode }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.level }">
            <label>水平 DQG 层级（1-21） <span class="req">*</span></label>
            <input v-model.number="featureForm.level" type="number" min="1" max="21" @blur="validateField('level')" />
            <span v-if="errors.level" class="field-error">{{ errors.level }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.input }">
            <label>OGR 数据服务器路径 <span class="req">*</span></label>
            <input v-model="featureForm.input" type="text" placeholder="data/static/road.shp" @blur="validateField('input')" />
            <span v-if="errors.input" class="field-error">{{ errors.input }}</span>
            <span v-else class="field-hint">服务端 projectRoot 下相对路径，支持 .shp/.json/.geojson</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.featureType }">
            <label>固定 Feature 类型</label>
            <input v-model="featureForm.featureType" type="text" placeholder="road" @blur="validateField('featureType')" />
            <span v-if="errors.featureType" class="field-error">{{ errors.featureType }}</span>
            <span v-else class="field-hint">与"类型字段"二选一</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.featureTypeField }">
            <label>Feature 类型字段</label>
            <input v-model="featureForm.featureTypeField" type="text" placeholder="从 OGR 属性字段逐要素读取" @blur="validateField('featureTypeField')" />
            <span v-if="errors.featureTypeField" class="field-error">{{ errors.featureTypeField }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.heightSource }">
            <label>高度来源 <span class="req">*</span></label>
            <select v-model="featureForm.heightSource" @change="validateField('heightSource')">
              <option value="NONE">NONE（无高度）</option>
              <option value="ATTRIBUTE">ATTRIBUTE（属性字段）</option>
              <option value="GEOMETRY_Z">GEOMETRY_Z（几何 Z 值）</option>
            </select>
            <span v-if="errors.heightSource" class="field-error">{{ errors.heightSource }}</span>
          </div>
        </div>

        <button class="advanced-toggle" type="button" @click="featureForm.showAdvanced = !featureForm.showAdvanced">
          <component :is="featureForm.showAdvanced ? ChevronUp : ChevronDown" :size="14" />
          <span>{{ featureForm.showAdvanced ? '收起高级参数' : '展开高级参数' }}</span>
        </button>

        <div v-show="featureForm.showAdvanced" class="form-grid advanced">
          <div class="form-field span-2" :class="{ 'has-error': errors.featureTypeMapping }">
            <label>类型值映射（JSON 对象）</label>
            <textarea
              v-model="featureForm.featureTypeMapping"
              rows="2"
              placeholder='{"禁止性管制空域":"prohibited_airspace"}'
              @blur="validateField('featureTypeMapping')"
            ></textarea>
            <span v-if="errors.featureTypeMapping" class="field-error">{{ errors.featureTypeMapping }}</span>
            <span v-else class="field-hint">可选：把字段中的中文业务值映射为 ASCII feature_type code</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.minHeightField }">
            <label>RANGE 最小高度字段</label>
            <input v-model="featureForm.minHeightField" type="text" placeholder="仅 3D RANGE 使用" @blur="validateField('minHeightField')" />
            <span v-if="errors.minHeightField" class="field-error">{{ errors.minHeightField }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.maxHeightField }">
            <label>RANGE 最大高度字段</label>
            <input v-model="featureForm.maxHeightField" type="text" placeholder="与最小高度字段成对填写" @blur="validateField('maxHeightField')" />
            <span v-if="errors.maxHeightField" class="field-error">{{ errors.maxHeightField }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.maxMappings }">
            <label>稀疏映射安全上限</label>
            <input v-model.number="featureForm.maxMappings" type="number" min="1" max="50000000" @blur="validateField('maxMappings')" />
            <span v-if="errors.maxMappings" class="field-error">{{ errors.maxMappings }}</span>
          </div>
        </div>

        <div class="submit-row">
          <button class="btn-primary" type="button" :disabled="submittingMap.featureImport" @click="submitFeatureImport">
            <Loader2 v-if="submittingMap.featureImport" :size="14" class="spin" />
            <span>{{ submittingMap.featureImport ? '提交中...' : '提交导入任务' }}</span>
          </button>
          <span class="submit-hint">提交后任务进入异步队列，将自动跟踪进度</span>
        </div>
      </section>

      <!-- 空域网格入库 -->
      <section v-show="activeTab === 'saveGrid'" class="storage-card">
        <div class="card-title">空域网格入库（saveGrid）</div>
        <p class="card-desc">按多边形、高度范围和层级列表生成 DQG 空域网格并写入 ClickHouse。响应同时包含 jobId（通用任务）与 task_code（空域持久任务），task_code 可在"维护与查询"页跟踪详细状态。</p>

        <div class="form-grid">
          <div class="form-field" :class="{ 'has-error': errors.airspaceId }">
            <label>空域标识 <span class="req">*</span></label>
            <input v-model="saveGridForm.airspaceId" type="text" placeholder="zone-001" @blur="validateField('airspaceId')" />
            <span v-if="errors.airspaceId" class="field-error">{{ errors.airspaceId }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.levels }">
            <label>DQG 层级列表 <span class="req">*</span></label>
            <input v-model="saveGridForm.levels" type="text" placeholder="16,17" @blur="validateField('levels')" />
            <span v-if="errors.levels" class="field-error">{{ errors.levels }}</span>
            <span v-else class="field-hint">逗号分隔，每项 0-21，不得重复</span>
          </div>
          <div class="form-field span-2" :class="{ 'has-error': errors.polygon }">
            <label>空域多边形边界 <span class="req">*</span></label>
            <textarea
              v-model="saveGridForm.polygon"
              rows="3"
              placeholder='[[119.9,30.5],[120.2,30.5],[120.2,30.65],[119.9,30.65]]'
              @blur="validateField('polygon')"
            ></textarea>
            <span v-if="errors.polygon" class="field-error">{{ errors.polygon }}</span>
            <span v-else class="field-hint">JSON 数组，[[经度,纬度],...] 单外环至少 3 点</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.top }">
            <label>顶部高度（米） <span class="req">*</span></label>
            <input v-model.number="saveGridForm.top" type="number" min="-1000" max="100000" step="any" @blur="validateField('top')" />
            <span v-if="errors.top" class="field-error">{{ errors.top }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.bottom }">
            <label>底部高度（米） <span class="req">*</span></label>
            <input v-model.number="saveGridForm.bottom" type="number" min="-1000" max="100000" step="any" @blur="validateField('bottom')" />
            <span v-if="errors.bottom" class="field-error">{{ errors.bottom }}</span>
          </div>
          <div class="form-field span-2">
            <label>空域描述</label>
            <input v-model="saveGridForm.description" type="text" maxlength="2000" placeholder="选填，最长 2000 字" @blur="validateField('description')" />
            <span v-if="errors.description" class="field-error">{{ errors.description }}</span>
          </div>
        </div>

        <button class="advanced-toggle" type="button" @click="saveGridForm.showAdvanced = !saveGridForm.showAdvanced">
          <component :is="saveGridForm.showAdvanced ? ChevronUp : ChevronDown" :size="14" />
          <span>{{ saveGridForm.showAdvanced ? '收起高级参数' : '展开高级参数' }}</span>
        </button>

        <div v-show="saveGridForm.showAdvanced" class="form-grid advanced">
          <div class="form-field" :class="{ 'has-error': errors.batchSize }">
            <label>ClickHouse 批量行数</label>
            <input v-model.number="saveGridForm.batchSize" type="number" min="1" placeholder="留空使用服务端默认" @blur="validateField('batchSize')" />
            <span v-if="errors.batchSize" class="field-error">{{ errors.batchSize }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.maxConcurrentIo }">
            <label>并发 IO 写线程数</label>
            <input v-model.number="saveGridForm.maxConcurrentIo" type="number" min="1" placeholder="留空使用服务端默认" @blur="validateField('maxConcurrentIo')" />
            <span v-if="errors.maxConcurrentIo" class="field-error">{{ errors.maxConcurrentIo }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.computeThreads }">
            <label>网格计算线程数（0 为自动）</label>
            <input v-model.number="saveGridForm.computeThreads" type="number" min="0" placeholder="留空使用服务端默认" @blur="validateField('computeThreads')" />
            <span v-if="errors.computeThreads" class="field-error">{{ errors.computeThreads }}</span>
          </div>
        </div>

        <div class="submit-row">
          <button class="btn-primary" type="button" :disabled="submittingMap.saveGrid" @click="submitSaveGrid">
            <Loader2 v-if="submittingMap.saveGrid" :size="14" class="spin" />
            <span>{{ submittingMap.saveGrid ? '提交中...' : '提交入库任务' }}</span>
          </button>
          <span class="submit-hint">提交后任务进入异步队列，将自动跟踪进度</span>
        </div>
      </section>

      <!-- 维护与查询 -->
      <section v-show="activeTab === 'maintain'" class="storage-card">
        <div class="card-title">维护与查询</div>
        <p class="card-desc">ClickHouse 空域网格相关的同步维护操作与状态查询。危险操作（初始化存储 / 激活版本 / 旧版分块名回填）不在本页面提供，请使用 DataTaskConsole。</p>

        <div class="maintain-block">
          <div class="maintain-title">导入 OSGB 稀疏映射（推荐）</div>
          <p class="maintain-desc">从 PG osgbgrid_/lod13grid_ 表全量导入 ClickHouse osgb_grid_chunk_map 的 (level, source) 分区，不修改 grid_current。</p>
          <div class="maintain-row">
            <div class="form-field">
              <label>网格层级</label>
              <input v-model.number="maintainState.mapImport.level" type="number" min="0" max="21" />
            </div>
            <div class="form-field">
              <label>空域标识</label>
              <input v-model="maintainState.mapImport.airspaceId" type="text" placeholder="Xiangtan_AIRSPACE" />
            </div>
            <div class="form-field">
              <label>全局版本</label>
              <input v-model.number="maintainState.mapImport.version" type="number" min="0" placeholder="5" />
            </div>
            <div class="form-field">
              <label>数据来源</label>
              <select v-model="maintainState.mapImport.source">
                <option value="osgb">osgb（倾斜摄影）</option>
                <option value="lod13">lod13（LOD1.3 建筑）</option>
              </select>
            </div>
            <button class="btn-primary" type="button" :disabled="maintainState.mapImport.busy" @click="runMapImport">
              <Loader2 v-if="maintainState.mapImport.busy" :size="14" class="spin" />
              <span>{{ maintainState.mapImport.busy ? '导入中...' : '执行导入' }}</span>
            </button>
          </div>
        </div>

        <div class="maintain-block">
          <div class="maintain-title">构建 Block 汇总表</div>
          <p class="maintain-desc">ClickHouse 端先删除旧汇总，再按 (airspace_id, version, level, block_id, z) 聚合写入 grid_block_summary。</p>
          <div class="maintain-row">
            <div class="form-field">
              <label>全局版本号</label>
              <input v-model.number="maintainState.summaryBuild.version" type="number" min="0" placeholder="5" />
            </div>
            <button class="btn-primary" type="button" :disabled="maintainState.summaryBuild.busy" @click="runSummaryBuild">
              <Loader2 v-if="maintainState.summaryBuild.busy" :size="14" class="spin" />
              <span>{{ maintainState.summaryBuild.busy ? '构建中...' : '执行构建' }}</span>
            </button>
          </div>
        </div>

        <div class="maintain-block">
          <div class="maintain-title">空域任务状态查询</div>
          <p class="maintain-desc">按 task_code 查询空域持久任务（saveGrid 双任务体系）的详细状态。</p>
          <div class="maintain-row">
            <div class="form-field grow">
              <label>任务编码 task_code</label>
              <input v-model="maintainState.taskStatus.taskCode" type="text" placeholder="粘贴 saveGrid 返回的 task_code" @keyup.enter="runTaskStatus" />
            </div>
            <button class="btn-primary" type="button" :disabled="maintainState.taskStatus.busy" @click="runTaskStatus">
              <Loader2 v-if="maintainState.taskStatus.busy" :size="14" class="spin" />
              <RefreshCw v-else :size="14" />
              <span>{{ maintainState.taskStatus.busy ? '查询中...' : '查询' }}</span>
            </button>
          </div>
        </div>

        <div class="maintain-block">
          <div class="maintain-title">当前激活版本</div>
          <div class="maintain-row">
            <button class="btn-primary" type="button" :disabled="maintainState.activeVersionBusy" @click="runActiveVersion">
              <Loader2 v-if="maintainState.activeVersionBusy" :size="14" class="spin" />
              <RefreshCw v-else :size="14" />
              <span>{{ maintainState.activeVersionBusy ? '查询中...' : '查询激活版本' }}</span>
            </button>
          </div>
        </div>

        <div class="maintain-block">
          <div class="maintain-title">真高数据集查询</div>
          <p class="maintain-desc">数据集列表 → 版本列表 → 版本详情 三级查询。</p>
          <div class="maintain-row">
            <div class="form-field">
              <label>datasetId</label>
              <input v-model="maintainState.ta.datasetId" type="text" placeholder="deqing_low_zone" />
            </div>
            <div class="form-field">
              <label>版本号</label>
              <input v-model.number="maintainState.ta.datasetVersion" type="number" min="1" placeholder="1" />
            </div>
            <button class="btn-secondary" type="button" :disabled="maintainState.ta.busy" @click="runTaDatasets">
              <span>数据集列表</span>
            </button>
            <button class="btn-secondary" type="button" :disabled="maintainState.ta.busy" @click="runTaVersions">
              <span>版本列表</span>
            </button>
            <button class="btn-secondary" type="button" :disabled="maintainState.ta.busy" @click="runTaVersionDetail">
              <Loader2 v-if="maintainState.ta.busy" :size="14" class="spin" />
              <span>版本详情</span>
            </button>
          </div>
        </div>

        <div v-if="maintainState.error" class="feedback error standalone">
          <span class="feedback-title">{{ maintainState.resultTitle || '操作失败' }}</span>
          <span class="feedback-detail">{{ maintainState.error }}</span>
        </div>

        <div v-if="maintainState.result" class="job-result">
          <div class="job-header">
            <span class="polling-hint">{{ maintainState.resultTitle }}</span>
          </div>
          <pre class="result-json">{{ JSON.stringify(maintainState.result, null, 2) }}</pre>
        </div>
      </section>

      <!-- 任务查询 -->
      <section v-show="activeTab === 'job'" class="storage-card">
        <div class="card-title">入库任务状态查询</div>
        <p class="card-desc">查询异步数据处理任务的当前状态与进度。</p>

        <div class="job-query-row">
          <div class="form-field grow" :class="{ 'has-error': errors.jobId }">
            <label>任务 ID <span class="req">*</span></label>
            <input
              v-model="jobForm.jobId"
              type="text"
              placeholder="例如：data_tool_1787914571108_0"
              @blur="errors.jobId = validateJobId()"
              @keyup.enter="pollJobStatus(true)"
            />
            <span v-if="errors.jobId" class="field-error">{{ errors.jobId }}</span>
          </div>
          <button class="btn-primary" type="button" :disabled="jobPolling" @click="pollJobStatus(true)">
            <Loader2 v-if="jobPolling" :size="14" class="spin" />
            <RefreshCw v-else :size="14" />
            <span>{{ jobPolling ? '查询中...' : '查询' }}</span>
          </button>
        </div>

        <div v-if="jobError" class="feedback error standalone">
          <span class="feedback-title">查询失败</span>
          <span class="feedback-detail">{{ jobError }}</span>
        </div>

        <div v-if="jobStatus" class="job-result">
          <div class="job-header">
            <span class="status-badge" :class="jobStatus.status">{{ jobStatusText }}</span>
            <span v-if="jobPolling" class="polling-hint">每 2 秒自动刷新</span>
            <span v-else-if="jobStatus.status !== 'succeeded' && jobStatus.status !== 'failed'" class="polling-hint stopped">自动刷新已停止</span>
          </div>

          <div class="progress-row">
            <div class="progress-track">
              <div class="progress-fill" :class="jobStatus.status" :style="{ width: `${jobStatus.progress?.percent ?? 0}%` }"></div>
            </div>
            <span class="progress-text">
              {{ jobStatus.progress?.percent !== null && jobStatus.progress?.percent !== undefined ? formatProgressPercent(jobStatus.progress.percent) : (jobStatus.progress?.stage || '-') }}
            </span>
          </div>

          <div class="job-meta">
            <div class="meta-item">
              <span class="meta-label">任务 ID</span>
              <span class="meta-value">{{ jobStatus.jobId }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">操作类型</span>
              <span class="meta-value">{{ jobStatus.operation || '-' }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">当前阶段</span>
              <span class="meta-value">{{ jobStatus.progress?.stage || '-' }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">处理进度</span>
              <span class="meta-value">{{ formatNumber(jobStatus.progress?.processed) }} / {{ formatNumber(jobStatus.progress?.total) }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">创建时间</span>
              <span class="meta-value">{{ formatTime(jobStatus.createdAt) }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">完成时间</span>
              <span class="meta-value">{{ formatTime(jobStatus.finishedAt) }}</span>
            </div>
          </div>

          <div v-if="jobStatus.error" class="job-error">
            <span class="meta-label">错误信息</span>
            <span class="meta-value error-text">{{ jobStatus.error }}</span>
          </div>

          <details v-if="jobStatus.result && Object.keys(jobStatus.result).length" class="job-result-detail">
            <summary>查看执行结果</summary>
            <pre class="result-json">{{ JSON.stringify(jobStatus.result, null, 2) }}</pre>
          </details>
        </div>
      </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.storage-panel {
  display: flex;
  align-items: stretch;
  min-height: 100%;
  box-sizing: border-box;
}

/* 左侧导航栏 - 与信息归集服务一致的交互规范 */
.sidebar {
  width: 240px;
  min-width: 240px;
  background: var(--theme-dropdown-bg, #ffffff);
  border-right: 1px solid var(--theme-nav-border, rgba(90, 150, 200, 0.35));
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 20px 16px;
  border-bottom: 1px solid var(--theme-nav-border, rgba(90, 150, 200, 0.35));
}

.sidebar-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--theme-title-text, #1e4a6e);
}

.sidebar-nav {
  flex: 1;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--theme-side-label, #64748b);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
  box-sizing: border-box;
}

.nav-item:hover {
  background: var(--theme-dropdown-item-bg, rgba(242, 248, 253, 0.92));
  color: var(--theme-title-text, #1e4a6e);
}

.nav-item.active {
  background: var(--theme-dropdown-item-bg, rgba(242, 248, 253, 0.92));
  color: var(--theme-nav-active-text, #1e6ba8);
  font-weight: 600;
}

.nav-icon {
  flex-shrink: 0;
}

.nav-text {
  flex: 1;
}

/* 主内容区 */
.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 32px 40px;
  min-width: 0;
}

/* 面包屑 */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px 16px;
  font-size: 13px;
  color: var(--theme-side-label, #64748b);
}

.breadcrumb-item.current {
  color: var(--theme-title-text, #1e4a6e);
  font-weight: 600;
}

.breadcrumb-separator {
  color: var(--theme-side-label-secondary, #94a3b8);
}

/* 主体 */
.storage-body {
  max-width: 1080px;
  margin: 0 auto;
}

/* 反馈提示条 */
.feedback {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 13px;
  line-height: 1.5;
}

.feedback.success {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.35);
  color: #15803d;
}

.feedback.error {
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #b91c1c;
}

.feedback.standalone {
  margin-top: 14px;
}

.feedback-title {
  font-weight: 600;
}

.feedback-detail {
  word-break: break-all;
  white-space: pre-wrap;
}

/* 卡片 */
.storage-card {
  background: var(--theme-dropdown-bg, rgba(255, 255, 255, 0.96));
  border: 1px solid var(--theme-nav-border, rgba(90, 150, 200, 0.35));
  border-radius: 10px;
  padding: 22px 24px 24px;
  box-shadow: var(--theme-dropdown-shadow, 0 2px 12px rgba(60, 120, 180, 0.08));
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--theme-title-text, #1e4a6e);
  margin-bottom: 6px;
}

.card-desc {
  font-size: 12px;
  color: var(--theme-side-label, #64748b);
  line-height: 1.6;
  margin: 0 0 18px;
}

/* 入库模式单选 */
.mode-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 16px;
}

.mode-label {
  font-size: 13px;
  color: var(--theme-nav-text, #1e4a6e);
  font-weight: 600;
}

.radio-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--theme-nav-text, #1e4a6e);
  cursor: pointer;
}

.radio-item input {
  accent-color: var(--theme-nav-active-border, #4a90c2);
}

/* 表单 */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 18px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.form-field.span-2 {
  grid-column: span 2;
}

.form-field label {
  font-size: 12px;
  color: var(--theme-nav-text, #1e4a6e);
  font-weight: 600;
}

.req {
  color: #dc2626;
}

.form-field input[type='text'],
.form-field input[type='number'],
.form-field select {
  height: 34px;
  padding: 0 10px;
  font-size: 13px;
  color: var(--theme-title-text, #1e4a6e);
  background: var(--theme-dropdown-item-bg, rgba(242, 248, 253, 0.92));
  border: 1px solid var(--theme-nav-border, rgba(90, 150, 200, 0.45));
  border-radius: 6px;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  box-sizing: border-box;
}

.form-field textarea {
  padding: 8px 10px;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  color: var(--theme-title-text, #1e4a6e);
  background: var(--theme-dropdown-item-bg, rgba(242, 248, 253, 0.92));
  border: 1px solid var(--theme-nav-border, rgba(90, 150, 200, 0.45));
  border-radius: 6px;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  box-sizing: border-box;
  resize: vertical;
  width: 100%;
}

.form-field textarea::placeholder {
  color: var(--theme-side-label-secondary, #94a3b8);
}

.form-field input:focus,
.form-field textarea:focus,
.form-field select:focus {
  border-color: var(--theme-nav-active-border, #4a90c2);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-nav-active-border, #4a90c2) 18%, transparent);
}

.form-field.has-error input,
.form-field.has-error textarea,
.form-field.has-error select {
  border-color: #dc2626;
}

.field-error {
  font-size: 11px;
  color: #dc2626;
  line-height: 1.4;
}

.field-hint {
  font-size: 11px;
  color: var(--theme-side-label-secondary, #94a3b8);
  line-height: 1.4;
}

/* 复选框组 */
.check-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
  padding: 12px 14px;
  border: 1px dashed var(--theme-nav-border, rgba(90, 150, 200, 0.4));
  border-radius: 8px;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--theme-nav-text, #1e4a6e);
  cursor: pointer;
  line-height: 1.4;
}

.checkbox-item input {
  accent-color: var(--theme-nav-active-border, #4a90c2);
}

.checkbox-item.confirm {
  font-weight: 600;
  color: #b45309;
}

/* 高级参数 */
.advanced-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 16px 0 0;
  padding: 6px 10px;
  font-size: 12px;
  background: transparent;
  border: none;
  color: var(--theme-nav-active-text, #1e6ba8);
  cursor: pointer;
}

.advanced-toggle:hover {
  text-decoration: underline;
}

.form-grid.advanced {
  margin-top: 12px;
  padding-top: 14px;
  border-top: 1px dashed var(--theme-nav-border, rgba(90, 150, 200, 0.4));
}

/* 提交行 */
.submit-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--theme-nav-border, rgba(90, 150, 200, 0.25));
}

.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 128px;
  height: 36px;
  padding: 0 22px;
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-nav-active-text, #1e6ba8);
  background: var(--theme-nav-active-bg, #ffffff);
  border: 1px solid var(--theme-nav-active-border, #4a90c2);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary:hover:not(:disabled) {
  box-shadow: var(--theme-nav-active-shadow, 0 2px 10px rgba(60, 120, 180, 0.3));
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 96px;
  height: 34px;
  padding: 0 16px;
  font-size: 12px;
  font-weight: 500;
  color: var(--theme-title-text, #1e4a6e);
  background: var(--theme-dropdown-item-bg, rgba(242, 248, 253, 0.92));
  border: 1px solid var(--theme-nav-border, rgba(90, 150, 200, 0.45));
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-secondary:hover:not(:disabled) {
  border-color: var(--theme-nav-active-border, #4a90c2);
}

.btn-secondary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* 维护与查询 */
.maintain-block {
  padding: 14px 0;
  border-bottom: 1px dashed var(--theme-nav-border, rgba(90, 150, 200, 0.35));
}

.maintain-block:last-of-type {
  border-bottom: none;
}

.maintain-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-title-text, #1e4a6e);
  margin-bottom: 4px;
}

.maintain-desc {
  margin: 0 0 10px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--theme-side-label-secondary, #94a3b8);
}

.maintain-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.maintain-row .form-field {
  min-width: 150px;
}

.maintain-row .form-field.grow {
  flex: 1;
}

.maintain-row .btn-primary,
.maintain-row .btn-secondary {
  flex-shrink: 0;
}

.submit-hint {
  font-size: 11px;
  color: var(--theme-side-label-secondary, #94a3b8);
}

/* 任务查询 */
.job-query-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}

.job-query-row .form-field {
  flex: 1;
}

.job-query-row .btn-primary {
  min-width: 104px;
  flex-shrink: 0;
}

.job-result {
  margin-top: 18px;
  padding: 16px;
  border: 1px solid var(--theme-nav-border, rgba(90, 150, 200, 0.35));
  border-radius: 8px;
  background: var(--theme-dropdown-item-bg, rgba(242, 248, 253, 0.6));
}

.job-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.status-badge {
  padding: 3px 12px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}

.status-badge.queued {
  background: rgba(234, 179, 8, 0.15);
  color: #a16207;
  border: 1px solid rgba(234, 179, 8, 0.4);
}

.status-badge.running {
  background: rgba(59, 130, 246, 0.12);
  color: #1d4ed8;
  border: 1px solid rgba(59, 130, 246, 0.4);
}

.status-badge.succeeded {
  background: rgba(34, 197, 94, 0.15);
  color: #15803d;
  border: 1px solid rgba(34, 197, 94, 0.4);
}

.status-badge.failed {
  background: rgba(239, 68, 68, 0.12);
  color: #b91c1c;
  border: 1px solid rgba(239, 68, 68, 0.4);
}

.polling-hint {
  font-size: 11px;
  color: var(--theme-side-label, #64748b);
}

.polling-hint.stopped {
  color: #b45309;
}

/* 进度条 */
.progress-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.progress-track {
  flex: 1;
  height: 10px;
  border-radius: 5px;
  background: rgba(148, 163, 184, 0.25);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 5px;
  background: linear-gradient(90deg, #60a5fa, #3b82f6);
  transition: width 0.4s ease;
}

.progress-fill.succeeded {
  background: linear-gradient(90deg, #4ade80, #16a34a);
}

.progress-fill.failed {
  background: linear-gradient(90deg, #f87171, #dc2626);
}

.progress-fill.queued {
  background: linear-gradient(90deg, #facc15, #eab308);
}

.progress-text {
  min-width: 46px;
  text-align: right;
  font-size: 12px;
  font-weight: 600;
  color: var(--theme-title-text, #1e4a6e);
  font-variant-numeric: tabular-nums;
}

/* 任务元信息 */
.job-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 20px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.meta-label {
  font-size: 11px;
  color: var(--theme-side-label, #64748b);
}

.meta-value {
  font-size: 12px;
  font-weight: 600;
  color: var(--theme-title-text, #1e4a6e);
  word-break: break-all;
}

.meta-value.error-text {
  color: #b91c1c;
}

.job-error {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 12px;
  padding: 10px 12px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
}

.job-result-detail {
  margin-top: 14px;
}

.job-result-detail summary {
  font-size: 12px;
  color: var(--theme-nav-active-text, #1e6ba8);
  cursor: pointer;
}

.result-json {
  margin: 8px 0 0;
  padding: 12px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--theme-title-text, #1e4a6e);
  background: rgba(148, 163, 184, 0.12);
  border-radius: 6px;
  overflow: auto;
  max-height: 260px;
}

/* 加载动画 */
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 响应式 */
@media (max-width: 900px) {
  .storage-panel {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
    min-width: 0;
    border-right: none;
    border-bottom: 1px solid var(--theme-nav-border, rgba(90, 150, 200, 0.35));
  }

  .sidebar-header {
    padding: 14px 16px 10px;
  }

  .sidebar-nav {
    flex-direction: row;
    overflow-x: auto;
    padding: 4px 12px 12px;
    gap: 6px;
  }

  .nav-item {
    width: auto;
    flex-shrink: 0;
    padding: 9px 14px;
  }

  .main-content {
    padding: 14px 16px 32px;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-field.span-2 {
    grid-column: span 1;
  }

  .job-meta {
    grid-template-columns: 1fr;
  }

  .job-query-row {
    flex-direction: column;
    align-items: stretch;
  }

  .submit-row {
    flex-direction: column;
    align-items: stretch;
  }

  .submit-row .btn-primary {
    width: 100%;
  }

  .submit-hint {
    text-align: center;
  }
}
</style>
