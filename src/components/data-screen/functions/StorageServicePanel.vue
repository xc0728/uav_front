<script setup>
import { ref, reactive, computed, onBeforeUnmount } from 'vue'
import { Loader2, RefreshCw, ChevronDown, ChevronUp, Box, Building2, Mountain, Cloud, Search, Layers, Waypoints, Radar, Wrench, FileSpreadsheet } from 'lucide-vue-next'
import FeatureDatasetManager from './FeatureDatasetManager.vue'

// ==================== Tab 状态 ====================
const TABS = [
  { id: 'osgb', label: '模型网格化', icon: Box },
  { id: 'building', label: '建筑白模入库', icon: Building2 },
  { id: 'dem', label: 'DEM 地面网格', icon: Mountain },
  { id: 'demClassify', label: 'DEM 地形分类', icon: Layers },
  { id: 'trueAltitude', label: '真高空域剖分', icon: Cloud },
  { id: 'parquetAttribute', label: 'Parquet 属性导入', icon: FileSpreadsheet },
  { id: 'fieldResample', label: '多维场重采样', icon: Cloud },
  { id: 'featureImport', label: '静态 Feature 导入', icon: Waypoints },
  { id: 'featureManage', label: '航图要素管理', icon: Waypoints },
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
  parquetAttribute: false,
  fieldResample: false,
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

// ==================== Parquet 网格属性导入 ====================
const WEATHER_ATTRIBUTE_MAPPINGS = [
  { sourceField: 'wind_speed_m_s', attributeCode: 'wind_speed', attributeName: '风速', category: 'meteorology', valueType: 'float', unit: 'm/s' },
  { sourceField: 'wind_from_direction_deg', attributeCode: 'wind_direction', attributeName: '风向', category: 'meteorology', valueType: 'float', unit: '°' },
  { sourceField: 'u_m_s', attributeCode: 'wind_u', attributeName: '东西向风速分量', category: 'meteorology', valueType: 'float', unit: 'm/s' },
  { sourceField: 'v_m_s', attributeCode: 'wind_v', attributeName: '南北向风速分量', category: 'meteorology', valueType: 'float', unit: 'm/s' },
  { sourceField: 'nearest_station_distance_m', attributeCode: 'wind_nearest_station_distance', attributeName: '最近气象站距离', category: 'meteorology_quality', valueType: 'float', unit: 'm' },
  { sourceField: 'support_station_count', attributeCode: 'wind_support_station_count', attributeName: '支持气象站数量', category: 'meteorology_quality', valueType: 'uint', unit: '个' },
]

const parquetAttributeForm = ref({
  importMode: 'generic_horizontal_agl',
  datasetId: '',
  datasetVersion: '',
  input: 'data/deqing_map/deqing_dqg_L17_quasi2d_20250412_130000.parquet',
  level: 17,
  dryRun: true,
  source: 'deqing_weather_static',
  codeField: 'dqg_code_key',
  codeTextField: 'dqg_horizontal_code',
  levelField: 'dqg_level',
  minAglField: 'min_height_agl_m',
  maxAglField: 'max_height_agl_m',
  validField: 'valid',
  unmatchedCodePolicy: 'SKIP',
  verifyCodeConsistency: true,
  attributeMappingsText: JSON.stringify(WEATHER_ATTRIBUTE_MAPPINGS, null, 2),
  showAdvanced: false,
  batchSize: 100000,
  maxRows: 20000000,
  heightTolerance: 0.02,
  registerMissingAttributes: true,
})

function validateParquetAttribute(key) {
  const f = parquetAttributeForm.value
  const e = {}
  if (!['generic_horizontal_agl', 'dqg_noise_v1'].includes(f.importMode)) e.importMode = '请选择导入方式'
  if (isBlank(f.datasetId)) e.datasetId = '目标数据集标识不能为空'
  else {
    const value = String(f.datasetId).trim()
    if (!DATASET_ID_RE.test(value)) e.datasetId = '仅允许字母/数字/下划线/点/短横线'
    else if (value.length > 128) e.datasetId = '长度不能超过 128 个字符'
  }
  const version = intCheck(f.datasetVersion, '目标版本号', 1)
  if (version) e.datasetVersion = version
  if (isBlank(f.input)) e.input = 'Parquet 文件路径不能为空'
  else if (!/\.parquet$/i.test(String(f.input).trim())) e.input = '输入文件必须为 .parquet'
  const level = intCheck(f.level, '网格层级', 17, 17)
  if (level) e.level = '当前模板固定使用 L17'
  if (f.importMode === 'generic_horizontal_agl') {
    for (const [field, label] of [
      ['codeField', '压缩编码字段'], ['minAglField', '最小离地高度字段'], ['maxAglField', '最大离地高度字段'],
    ]) {
      if (isBlank(f[field])) e[field] = `${label}不能为空`
      else if (!/^[A-Za-z0-9_]+$/.test(String(f[field]))) e[field] = `${label}只能包含字母、数字和下划线`
    }
    for (const field of ['codeTextField', 'levelField', 'validField']) {
      if (!isBlank(f[field]) && !/^[A-Za-z0-9_]+$/.test(String(f[field]))) e[field] = '字段名只能包含字母、数字和下划线'
    }
    try {
      const mappings = JSON.parse(f.attributeMappingsText)
      if (!Array.isArray(mappings) || mappings.length < 1 || mappings.length > 64) {
        e.attributeMappingsText = '属性映射必须是包含 1–64 项的 JSON 数组'
      } else if (mappings.some(item => !item?.sourceField || !item?.attributeCode || !item?.attributeName || !item?.valueType)) {
        e.attributeMappingsText = '每项必须包含源字段、属性编码、属性名称和数值类型'
      }
    } catch {
      e.attributeMappingsText = '属性映射不是有效 JSON'
    }
  }
  if (f.showAdvanced) {
    if (isBlank(f.source)) e.source = '来源标识不能为空'
    else if (String(f.source).length > 128) e.source = '来源标识不能超过 128 个字符'
    const batchSize = intCheck(f.batchSize, '批量行数', 10000, 100000)
    if (batchSize) e.batchSize = batchSize
    const maxRows = intCheck(f.maxRows, '最大源行数', 1, 100000000)
    if (maxRows) e.maxRows = maxRows
    if (f.importMode === 'dqg_noise_v1') {
      const tolerance = numCheck(f.heightTolerance, '高度容差', 0, 1)
      if (tolerance) e.heightTolerance = tolerance
    }
  }
  return key ? { [key]: e[key] || '' } : e
}

// ==================== 多维场重采样 ====================
const FIELD_VARIABLE_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/
const ATTRIBUTE_CODE_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
const FIELD_VALUE_PRESETS = {
  original: { valueTransform: 'identity', transformScale: 1, transformOffset: 0 },
  emfSquared: { valueTransform: 'log10', transformScale: 10, transformOffset: 120 },
  emfAmplitude: { valueTransform: 'log10', transformScale: 20, transformOffset: 120 },
}
const fieldValuePreset = ref('emfSquared')
const fieldResampleForm = ref({
  datasetId: '',
  datasetVersion: '',
  input: 'data/deqing_map/emf_deqing_v4/emf_deqing_v4.nc',
  inputFormat: 'netcdf',
  sourceCrs: 'EPSG:4549',
  xVariable: 'x',
  yVariable: 'y',
  groundVariable: 'ground_height',
  verticalVariable: 'height_agl',
  valueVariable: 'field_total',
  verticalReference: 'AGL',
  attributeCode: 'emf_strength_dbuv_m',
  attributeName: '电磁场强',
  category: 'environment_field',
  unit: 'dBμV/m',
  description: '低空三维电磁场强',
  valueTransform: 'log10',
  transformScale: 10,
  transformOffset: 120,
  dryRun: true,
  showAdvanced: false,
  source: 'emf_simulation',
  batchSize: 50000,
  maxSourceLocations: 5000000,
  maxSourceValues: 100000000,
  maxTargetCells: 100000000,
  registerMissingAttribute: true,
})

function applyFieldValuePreset() {
  const preset = FIELD_VALUE_PRESETS[fieldValuePreset.value]
  if (!preset) return
  Object.assign(fieldResampleForm.value, preset)
  if (fieldValuePreset.value !== 'original') fieldResampleForm.value.unit = 'dBμV/m'
  delete errors.value.transformScale
  delete errors.value.transformOffset
}

function openManagedFieldImport({ type, attribute, binding }) {
  switchTab(type)
  const form = type === 'fieldResample' ? fieldResampleForm.value : parquetAttributeForm.value
  if (binding) {
    form.datasetId = binding.datasetId
    form.datasetVersion = binding.datasetVersion
  }
  if (type === 'fieldResample' && attribute) {
    form.attributeCode = attribute.code
    form.attributeName = attribute.name || attribute.code
    form.category = attribute.category || 'environment_field'
    form.unit = attribute.unit || ''
  }
}

function validateFieldResample(key) {
  const f = fieldResampleForm.value
  const e = {}
  if (isBlank(f.datasetId)) e.datasetId = '目标数据集标识不能为空'
  else if (!DATASET_ID_RE.test(String(f.datasetId).trim())) e.datasetId = '数据集标识格式不正确'
  const version = intCheck(f.datasetVersion, '目标版本号', 1)
  if (version) e.datasetVersion = version
  if (isBlank(f.input)) e.input = 'NetCDF 文件路径不能为空'
  else if (!/\.nc4?$/i.test(String(f.input).trim())) e.input = '输入文件必须为 .nc 或 .nc4'
  if (isBlank(f.sourceCrs)) e.sourceCrs = '源坐标系不能为空'
  for (const [name, label] of [
    ['xVariable', 'X 坐标变量'], ['yVariable', 'Y 坐标变量'],
    ['verticalVariable', '垂直坐标变量'], ['valueVariable', '数值变量'],
  ]) {
    if (isBlank(f[name])) e[name] = `${label}不能为空`
    else if (!FIELD_VARIABLE_RE.test(String(f[name]).trim())) e[name] = `${label}名称格式不正确`
  }
  if (f.verticalReference === 'AGL') {
    if (isBlank(f.groundVariable)) e.groundVariable = 'AGL 模式必须指定地面高程变量'
    else if (!FIELD_VARIABLE_RE.test(String(f.groundVariable).trim())) e.groundVariable = '地面高程变量名称格式不正确'
  }
  if (isBlank(f.attributeCode)) e.attributeCode = '属性编码不能为空'
  else if (!ATTRIBUTE_CODE_RE.test(String(f.attributeCode).trim())) e.attributeCode = '仅允许字母开头的字母、数字和下划线'
  if (isBlank(f.attributeName)) e.attributeName = '属性名称不能为空'
  const scale = numCheck(f.transformScale, '变换乘数', -1e12, 1e12)
  if (scale) e.transformScale = scale
  const offset = numCheck(f.transformOffset, '变换偏移', -1e12, 1e12)
  if (offset) e.transformOffset = offset
  if (f.showAdvanced) {
    if (isBlank(f.source)) e.source = '来源标识不能为空'
    const batchSize = intCheck(f.batchSize, '批量行数', 10000, 100000)
    if (batchSize) e.batchSize = batchSize
    const sourceLocations = intCheck(f.maxSourceLocations, '最大源水平点数', 3, 50000000)
    if (sourceLocations) e.maxSourceLocations = sourceLocations
    const sourceValues = intCheck(f.maxSourceValues, '最大源场数值数', 3, 1000000000)
    if (sourceValues) e.maxSourceValues = sourceValues
    const targetCells = intCheck(f.maxTargetCells, '最大目标格元数', 1, 1000000000)
    if (targetCells) e.maxTargetCells = targetCells
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
const HEIGHT_SOURCES = ['NONE', 'ATTRIBUTE', 'GEOMETRY_Z', 'DEM_AGL']

const featureForm = ref({
  datasetId: '',
  datasetName: '',
  theme: 'road',
  dimensionMode: '2D',
  level: 17,
  input: '',
  featureType: 'road',
  featureTypeField: '',
  heightSource: 'NONE',
  aglHeightField: 'Descriptio',
  demGridTable: 'demgrid_17',
  demNoDataPolicy: 'SKIP_CELL',
  showAdvanced: false,
  featureTypeMapping: '',
  propertyFields: '',
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
  if (f.dimensionMode === '2D' && f.heightSource !== 'NONE') e.heightSource = '2D 模式只能选择无高度'
  if (f.heightSource === 'DEM_AGL') {
    if (f.dimensionMode !== '3D') e.heightSource = 'DEM＋离地高度仅用于 3D 面要素'
    if (isBlank(f.aglHeightField)) e.aglHeightField = '请填写离地高度上限字段'
    if (!['ERROR', 'SKIP_CELL'].includes(f.demNoDataPolicy)) e.demNoDataPolicy = '请选择缺测处理方式'
  }
  if (f.showAdvanced) {
    if (!isBlank(f.featureTypeMapping)) {
      try {
        const m = JSON.parse(String(f.featureTypeMapping))
        if (!m || typeof m !== 'object' || Array.isArray(m)) e.featureTypeMapping = '必须为 JSON 对象，如 {"禁止性管制空域":"prohibited_airspace"}'
      } catch {
        e.featureTypeMapping = '必须为合法 JSON 对象'
      }
    }
    if (!isBlank(f.propertyFields)) {
      try {
        const fields = JSON.parse(String(f.propertyFields))
        if (!Array.isArray(fields) || fields.length === 0 ||
            fields.some(name => typeof name !== 'string' || !name.trim())) {
          e.propertyFields = '必须为非空字符串 JSON 数组，如 ["GRID_ID","TOT_SCORE"]'
        } else if (new Set(fields).size !== fields.length) {
          e.propertyFields = '字段名不能重复'
        }
      } catch {
        e.propertyFields = '必须为合法 JSON 数组'
      }
    }
    const hasMin = !isBlank(f.minHeightField)
    const hasMax = !isBlank(f.maxHeightField)
    if (f.heightSource === 'DEM_AGL' && (hasMin || hasMax)) e.minHeightField = 'DEM_AGL 不允许混填绝对底高/顶高字段，请清空'
    else if (hasMin !== hasMax) e.minHeightField = 'RANGE 最小/最大高度字段必须成对填写'
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
    parquetAttribute: validateParquetAttribute,
    fieldResample: validateFieldResample,
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

async function submitParquetAttribute() {
  const e = validateParquetAttribute()
  setErrors(e)
  if (hasErrors(e)) return
  submittingMap.parquetAttribute = true
  feedback.value = null
  const f = parquetAttributeForm.value
  try {
    const body = {
      datasetId: String(f.datasetId).trim(),
      datasetVersion: Number(f.datasetVersion),
      input: String(f.input).trim(),
      level: Number(f.level),
      dryRun: Boolean(f.dryRun),
      source: String(f.source).trim(),
      batchSize: Number(f.batchSize),
      maxRows: Number(f.maxRows),
      registerMissingAttributes: Boolean(f.registerMissingAttributes),
    }
    if (f.importMode === 'dqg_noise_v1') {
      body.template = 'dqg_noise_v1'
    } else {
      body.inputFormat = 'parquet'
      body.gridKeyMode = 'HORIZONTAL_AGL_RANGE'
      body.codeField = String(f.codeField).trim()
      body.codeEncoding = 'PACKED_UINT64'
      body.codeTextField = String(f.codeTextField || '').trim()
      body.levelField = String(f.levelField || '').trim()
      body.minAglField = String(f.minAglField).trim()
      body.maxAglField = String(f.maxAglField).trim()
      body.validField = String(f.validField || '').trim()
      body.unmatchedCodePolicy = f.unmatchedCodePolicy
      body.verifyCodeConsistency = Boolean(f.verifyCodeConsistency)
      body.attributeMappings = JSON.parse(f.attributeMappingsText)
    }
    if (f.importMode === 'dqg_noise_v1') body.heightTolerance = Number(f.heightTolerance)
    const data = await postJson('/api/grid-attributes/parquet-import-jobs', body)
    handleJobAccepted(data, f.dryRun ? 'Parquet 网格属性预检' : 'Parquet 网格属性导入')
  } catch (err) {
    feedback.value = {
      type: 'error',
      title: 'Parquet 网格属性任务提交失败',
      detail: err?.message || '网络错误，请稍后重试',
    }
  } finally {
    submittingMap.parquetAttribute = false
  }
}

async function submitFieldResample() {
  const e = validateFieldResample()
  setErrors(e)
  if (hasErrors(e)) return
  submittingMap.fieldResample = true
  feedback.value = null
  const f = fieldResampleForm.value
  try {
    const body = {
      datasetId: String(f.datasetId).trim(),
      datasetVersion: Number(f.datasetVersion),
      input: String(f.input).trim(),
      inputFormat: f.inputFormat,
      sourceCrs: String(f.sourceCrs).trim(),
      xVariable: String(f.xVariable).trim(),
      yVariable: String(f.yVariable).trim(),
      groundVariable: String(f.groundVariable || '').trim(),
      verticalVariable: String(f.verticalVariable).trim(),
      valueVariable: String(f.valueVariable).trim(),
      verticalReference: f.verticalReference,
      attributeCode: String(f.attributeCode).trim(),
      attributeName: String(f.attributeName).trim(),
      category: String(f.category).trim(),
      unit: String(f.unit || '').trim(),
      description: String(f.description || '').trim(),
      valueTransform: f.valueTransform,
      transformScale: Number(f.transformScale),
      transformOffset: Number(f.transformOffset),
      horizontalInterpolation: 'delaunay_linear',
      verticalInterpolation: 'linear',
      outsidePolicy: 'skip',
      dryRun: Boolean(f.dryRun),
    }
    if (f.showAdvanced) {
      body.source = String(f.source).trim()
      body.batchSize = Number(f.batchSize)
      body.maxSourceLocations = Number(f.maxSourceLocations)
      body.maxSourceValues = Number(f.maxSourceValues)
      body.maxTargetCells = Number(f.maxTargetCells)
      body.registerMissingAttribute = Boolean(f.registerMissingAttribute)
    }
    const data = await postJson('/api/grid-attributes/field-resample-import-jobs', body)
    handleJobAccepted(data, f.dryRun ? '多维场重采样预检' : '多维场重采样挂载')
  } catch (err) {
    feedback.value = {
      type: 'error',
      title: '多维场重采样任务提交失败',
      detail: err?.message || '网络错误，请稍后重试',
    }
  } finally {
    submittingMap.fieldResample = false
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
    if (f.heightSource === 'DEM_AGL') {
      body.heightReference = 'ABSOLUTE'
      body.aglHeightField = String(f.aglHeightField).trim()
      body.demGridTable = String(f.demGridTable || 'demgrid_17').trim()
      body.demNoDataPolicy = f.demNoDataPolicy
    }
    if (!isBlank(f.datasetName)) body.datasetName = String(f.datasetName).trim()
    if (!isBlank(f.featureType)) body.featureType = String(f.featureType).trim()
    if (!isBlank(f.featureTypeField)) body.featureTypeField = String(f.featureTypeField).trim()
    if (f.showAdvanced) {
      if (!isBlank(f.featureTypeMapping)) body.featureTypeMapping = JSON.parse(String(f.featureTypeMapping))
      if (!isBlank(f.propertyFields)) body.propertyFields = JSON.parse(String(f.propertyFields))
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
        <p v-if="osgbForm.mode === 'sync'" class="card-desc">标准入库默认自动同步 ClickHouse；任务成功后重新查询航图要素即可显示。同步失败时 PostgreSQL 数据保留，只需重试同步，无需重新网格化。</p>

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

      <!-- Parquet 网格属性导入 -->
      <section v-show="activeTab === 'parquetAttribute'" class="storage-card">
        <div class="card-title">Parquet 网格属性批量导入</div>
        <p class="card-desc">通过通用字段映射把 Parquet 属性挂载到已有网格。水平 L17 数据可按离地高度范围动态覆盖三维格元，不需要为每一种专题开发新模板；旧噪声数据仍可选择兼容预设。</p>

        <div class="form-grid">
          <div class="form-field" :class="{ 'has-error': errors.importMode }">
            <label>导入方式 <span class="req">*</span></label>
            <select v-model="parquetAttributeForm.importMode" @change="validateField('importMode')">
              <option value="generic_horizontal_agl">通用：水平网格 + 离地高度范围</option>
              <option value="dqg_noise_v1">兼容预设：DQG 噪声 v1</option>
            </select>
            <span v-if="errors.importMode" class="field-error">{{ errors.importMode }}</span>
            <span v-else class="field-hint">气象等准二维场选择通用方式；只有旧噪声文件选择兼容预设</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.level }">
            <label>网格层级</label>
            <input v-model.number="parquetAttributeForm.level" type="number" min="17" max="17" readonly @blur="validateField('level')" />
            <span v-if="errors.level" class="field-error">{{ errors.level }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.datasetId }">
            <label>目标数据集标识 <span class="req">*</span></label>
            <input v-model="parquetAttributeForm.datasetId" type="text" placeholder="deqing_true_altitude_l17" @blur="validateField('datasetId')" />
            <span v-if="errors.datasetId" class="field-error">{{ errors.datasetId }}</span>
            <span v-else class="field-hint">必须是当前已激活的 L17 真高网格数据集</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.datasetVersion }">
            <label>目标活动版本号 <span class="req">*</span></label>
            <input v-model.number="parquetAttributeForm.datasetVersion" type="number" min="1" placeholder="1" @blur="validateField('datasetVersion')" />
            <span v-if="errors.datasetVersion" class="field-error">{{ errors.datasetVersion }}</span>
          </div>
          <div class="form-field span-2" :class="{ 'has-error': errors.input }">
            <label>Parquet 文件路径 <span class="req">*</span></label>
            <input v-model="parquetAttributeForm.input" type="text" placeholder="data/dqg_noise/dqg_native_noise_l17.parquet" @blur="validateField('input')" />
            <span v-if="errors.input" class="field-error">{{ errors.input }}</span>
            <span v-else class="field-hint">项目根目录下的相对路径，不允许绝对路径、.. 或符号链接</span>
          </div>

          <template v-if="parquetAttributeForm.importMode === 'generic_horizontal_agl'">
            <div class="form-field" :class="{ 'has-error': errors.codeField }">
              <label>水平格压缩编码字段 <span class="req">*</span></label>
              <input v-model="parquetAttributeForm.codeField" type="text" @blur="validateField('codeField')" />
              <span v-if="errors.codeField" class="field-error">{{ errors.codeField }}</span>
            </div>
            <div class="form-field" :class="{ 'has-error': errors.codeTextField }">
              <label>水平格文本编码字段</label>
              <input v-model="parquetAttributeForm.codeTextField" type="text" @blur="validateField('codeTextField')" />
              <span v-if="errors.codeTextField" class="field-error">{{ errors.codeTextField }}</span>
            </div>
            <div class="form-field" :class="{ 'has-error': errors.minAglField }">
              <label>最小离地高度字段 <span class="req">*</span></label>
              <input v-model="parquetAttributeForm.minAglField" type="text" @blur="validateField('minAglField')" />
              <span v-if="errors.minAglField" class="field-error">{{ errors.minAglField }}</span>
            </div>
            <div class="form-field" :class="{ 'has-error': errors.maxAglField }">
              <label>最大离地高度字段 <span class="req">*</span></label>
              <input v-model="parquetAttributeForm.maxAglField" type="text" @blur="validateField('maxAglField')" />
              <span v-if="errors.maxAglField" class="field-error">{{ errors.maxAglField }}</span>
            </div>
            <div class="form-field" :class="{ 'has-error': errors.levelField }">
              <label>层级字段（可选）</label>
              <input v-model="parquetAttributeForm.levelField" type="text" @blur="validateField('levelField')" />
              <span v-if="errors.levelField" class="field-error">{{ errors.levelField }}</span>
            </div>
            <div class="form-field" :class="{ 'has-error': errors.validField }">
              <label>有效标记字段（可选）</label>
              <input v-model="parquetAttributeForm.validField" type="text" @blur="validateField('validField')" />
              <span v-if="errors.validField" class="field-error">{{ errors.validField }}</span>
            </div>
            <div class="form-field">
              <label>目标空域外编码处理</label>
              <select v-model="parquetAttributeForm.unmatchedCodePolicy">
                <option value="SKIP">跳过，只导入与目标空域的交集（环境场推荐）</option>
                <option value="REJECT">发现任一目标外编码即拒绝</option>
              </select>
              <span class="field-hint">跳过的数量会记录在任务结果中，不会生成属性事实</span>
            </div>
            <div class="form-field span-2" :class="{ 'has-error': errors.attributeMappingsText }">
              <label>属性字段映射（JSON） <span class="req">*</span></label>
              <textarea v-model="parquetAttributeForm.attributeMappingsText" rows="13" spellcheck="false" @blur="validateField('attributeMappingsText')"></textarea>
              <span v-if="errors.attributeMappingsText" class="field-error">{{ errors.attributeMappingsText }}</span>
              <span v-else class="field-hint">时间字段不在映射中，因此本次数据按静态属性导入</span>
            </div>
            <div class="form-field span-2">
              <label class="checkbox-item">
                <input v-model="parquetAttributeForm.verifyCodeConsistency" type="checkbox" />
                <span>核验文本 DQG 编码与压缩编码完全一致</span>
              </label>
            </div>
          </template>
        </div>

        <div class="check-group">
          <label class="checkbox-item">
            <input v-model="parquetAttributeForm.dryRun" type="checkbox" />
            <span>只执行全量预检，不写入属性事实和活动绑定（推荐先勾选）</span>
          </label>
        </div>

        <button class="advanced-toggle" type="button" @click="parquetAttributeForm.showAdvanced = !parquetAttributeForm.showAdvanced">
          <component :is="parquetAttributeForm.showAdvanced ? ChevronUp : ChevronDown" :size="14" />
          <span>{{ parquetAttributeForm.showAdvanced ? '收起高级参数' : '展开高级参数' }}</span>
        </button>

        <div v-show="parquetAttributeForm.showAdvanced" class="form-grid advanced">
          <div class="form-field" :class="{ 'has-error': errors.source }">
            <label>来源标识</label>
            <input v-model="parquetAttributeForm.source" type="text" maxlength="128" @blur="validateField('source')" />
            <span v-if="errors.source" class="field-error">{{ errors.source }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.batchSize }">
            <label>RowBinary 批量行数</label>
            <input v-model.number="parquetAttributeForm.batchSize" type="number" min="10000" max="100000" @blur="validateField('batchSize')" />
            <span v-if="errors.batchSize" class="field-error">{{ errors.batchSize }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.maxRows }">
            <label>最大源行数</label>
            <input v-model.number="parquetAttributeForm.maxRows" type="number" min="1" max="100000000" @blur="validateField('maxRows')" />
            <span v-if="errors.maxRows" class="field-error">{{ errors.maxRows }}</span>
          </div>
          <div v-if="parquetAttributeForm.importMode === 'dqg_noise_v1'" class="form-field" :class="{ 'has-error': errors.heightTolerance }">
            <label>高度边界容差（米）</label>
            <input v-model.number="parquetAttributeForm.heightTolerance" type="number" min="0" max="1" step="0.001" @blur="validateField('heightTolerance')" />
            <span v-if="errors.heightTolerance" class="field-error">{{ errors.heightTolerance }}</span>
          </div>
          <div class="form-field span-2">
            <label class="checkbox-item">
              <input v-model="parquetAttributeForm.registerMissingAttributes" type="checkbox" />
              <span>正式导入时自动注册字段映射中缺失的属性定义</span>
            </label>
          </div>
        </div>

        <div class="submit-row">
          <button class="btn-primary" type="button" :disabled="submittingMap.parquetAttribute" @click="submitParquetAttribute">
            <Loader2 v-if="submittingMap.parquetAttribute" :size="14" class="spin" />
            <span>{{ submittingMap.parquetAttribute ? '提交中...' : (parquetAttributeForm.dryRun ? '提交预检任务' : '提交正式导入') }}</span>
          </button>
          <span class="submit-hint">任务提交后进入异步队列，并自动跳转到任务进度页面</span>
        </div>
      </section>

      <!-- 多维场重采样 -->
      <section v-show="activeTab === 'fieldResample'" class="storage-card">
        <div class="card-title">多维场数据重采样与网格属性挂载</div>
        <p class="card-desc">读取 NetCDF 点剖面数据，按编码游标分批读取目标空域的 L17 权威格元，仅对这些格元执行水平 Delaunay、垂直线性插值；不再先生成源场范围内的全部三维候选。</p>

        <div class="form-grid">
          <div class="form-field" :class="{ 'has-error': errors.datasetId }">
            <label>目标数据集标识 <span class="req">*</span></label>
            <input v-model="fieldResampleForm.datasetId" type="text" placeholder="deqing_true_altitude_l17" @blur="validateField('datasetId')" />
            <span v-if="errors.datasetId" class="field-error">{{ errors.datasetId }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.datasetVersion }">
            <label>目标活动版本号 <span class="req">*</span></label>
            <input v-model.number="fieldResampleForm.datasetVersion" type="number" min="1" @blur="validateField('datasetVersion')" />
            <span v-if="errors.datasetVersion" class="field-error">{{ errors.datasetVersion }}</span>
          </div>
          <div class="form-field span-2" :class="{ 'has-error': errors.input }">
            <label>NetCDF 文件路径 <span class="req">*</span></label>
            <input v-model="fieldResampleForm.input" type="text" placeholder="data/field/source.nc" @blur="validateField('input')" />
            <span v-if="errors.input" class="field-error">{{ errors.input }}</span>
            <span v-else class="field-hint">项目根目录下的 .nc/.nc4 相对路径</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.sourceCrs }">
            <label>源水平坐标系 <span class="req">*</span></label>
            <input v-model="fieldResampleForm.sourceCrs" type="text" placeholder="EPSG:4549" @blur="validateField('sourceCrs')" />
            <span v-if="errors.sourceCrs" class="field-error">{{ errors.sourceCrs }}</span>
          </div>
          <div class="form-field">
            <label>垂直坐标基准</label>
            <select v-model="fieldResampleForm.verticalReference" @change="validateField('groundVariable')">
              <option value="AGL">AGL（离地高度）</option>
              <option value="ABSOLUTE">ABSOLUTE（绝对高度）</option>
            </select>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.xVariable }">
            <label>X 坐标变量 <span class="req">*</span></label>
            <input v-model="fieldResampleForm.xVariable" type="text" @blur="validateField('xVariable')" />
            <span v-if="errors.xVariable" class="field-error">{{ errors.xVariable }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.yVariable }">
            <label>Y 坐标变量 <span class="req">*</span></label>
            <input v-model="fieldResampleForm.yVariable" type="text" @blur="validateField('yVariable')" />
            <span v-if="errors.yVariable" class="field-error">{{ errors.yVariable }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.groundVariable }">
            <label>地面高程变量</label>
            <input v-model="fieldResampleForm.groundVariable" type="text" :disabled="fieldResampleForm.verticalReference !== 'AGL'" @blur="validateField('groundVariable')" />
            <span v-if="errors.groundVariable" class="field-error">{{ errors.groundVariable }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.verticalVariable }">
            <label>垂直坐标变量 <span class="req">*</span></label>
            <input v-model="fieldResampleForm.verticalVariable" type="text" @blur="validateField('verticalVariable')" />
            <span v-if="errors.verticalVariable" class="field-error">{{ errors.verticalVariable }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.valueVariable }">
            <label>原始数值变量 <span class="req">*</span></label>
            <input v-model="fieldResampleForm.valueVariable" type="text" @blur="validateField('valueVariable')" />
            <span v-if="errors.valueVariable" class="field-error">{{ errors.valueVariable }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.attributeCode }">
            <label>目标属性编码 <span class="req">*</span></label>
            <input v-model="fieldResampleForm.attributeCode" type="text" @blur="validateField('attributeCode')" />
            <span v-if="errors.attributeCode" class="field-error">{{ errors.attributeCode }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.attributeName }">
            <label>目标属性名称 <span class="req">*</span></label>
            <input v-model="fieldResampleForm.attributeName" type="text" @blur="validateField('attributeName')" />
            <span v-if="errors.attributeName" class="field-error">{{ errors.attributeName }}</span>
          </div>
          <div class="form-field">
            <label>单位</label>
            <input v-model="fieldResampleForm.unit" type="text" placeholder="dBμV/m" />
          </div>
          <div class="form-field span-2">
            <label>数值保存方式</label>
            <select v-model="fieldValuePreset" @change="applyFieldValuePreset">
              <option value="original">原值保存（不换算）</option>
              <option value="emfSquared">电磁场强平方值 → dBμV/m（本次通导监兼容文件）</option>
              <option value="emfAmplitude">电磁场强 V/m → dBμV/m</option>
              <option value="custom">自定义换算</option>
            </select>
            <span v-if="fieldValuePreset === 'emfSquared'" class="field-hint">适用于本次 *_profiles.nc 的 field_total（单位为 (V/m)²），自动使用 log10、10、120。</span>
            <span v-else-if="fieldValuePreset === 'emfAmplitude'" class="field-hint">适用于单位为 V/m 的场强值，例如原文件的 E_V_M，自动使用 log10、20、120。</span>
            <span v-else-if="fieldValuePreset === 'original'" class="field-hint">插值结果直接保存，自动使用 identity、1、0；请填写源数值对应的单位。</span>
          </div>
          <div v-if="fieldValuePreset === 'custom'" class="form-field">
            <label>数值变换</label>
            <select v-model="fieldResampleForm.valueTransform">
              <option value="identity">原值：scale × value + offset</option>
              <option value="log10">对数：scale × log10(value) + offset</option>
            </select>
          </div>
          <div v-if="fieldValuePreset === 'custom'" class="form-field" :class="{ 'has-error': errors.transformScale }">
            <label>变换乘数</label>
            <input v-model.number="fieldResampleForm.transformScale" type="number" step="any" @blur="validateField('transformScale')" />
            <span v-if="errors.transformScale" class="field-error">{{ errors.transformScale }}</span>
          </div>
          <div v-if="fieldValuePreset === 'custom'" class="form-field" :class="{ 'has-error': errors.transformOffset }">
            <label>变换偏移</label>
            <input v-model.number="fieldResampleForm.transformOffset" type="number" step="any" @blur="validateField('transformOffset')" />
            <span v-if="errors.transformOffset" class="field-error">{{ errors.transformOffset }}</span>
          </div>
        </div>

        <div class="check-group">
          <label class="checkbox-item">
            <input v-model="fieldResampleForm.dryRun" type="checkbox" />
            <span>只执行重采样和权威网格成员校验，不激活属性（推荐先勾选）</span>
          </label>
        </div>

        <button class="advanced-toggle" type="button" @click="fieldResampleForm.showAdvanced = !fieldResampleForm.showAdvanced">
          <component :is="fieldResampleForm.showAdvanced ? ChevronUp : ChevronDown" :size="14" />
          <span>{{ fieldResampleForm.showAdvanced ? '收起高级参数' : '展开高级参数' }}</span>
        </button>

        <div v-show="fieldResampleForm.showAdvanced" class="form-grid advanced">
          <div class="form-field">
            <label>属性分类</label>
            <input v-model="fieldResampleForm.category" type="text" />
          </div>
          <div class="form-field" :class="{ 'has-error': errors.source }">
            <label>来源标识</label>
            <input v-model="fieldResampleForm.source" type="text" maxlength="128" @blur="validateField('source')" />
            <span v-if="errors.source" class="field-error">{{ errors.source }}</span>
          </div>
          <div class="form-field span-2">
            <label>属性说明</label>
            <input v-model="fieldResampleForm.description" type="text" maxlength="2000" />
          </div>
          <div class="form-field" :class="{ 'has-error': errors.batchSize }">
            <label>RowBinary 批量行数</label>
            <input v-model.number="fieldResampleForm.batchSize" type="number" min="10000" max="100000" @blur="validateField('batchSize')" />
            <span v-if="errors.batchSize" class="field-error">{{ errors.batchSize }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.maxSourceLocations }">
            <label>最大源水平点数</label>
            <input v-model.number="fieldResampleForm.maxSourceLocations" type="number" min="3" max="50000000" @blur="validateField('maxSourceLocations')" />
            <span v-if="errors.maxSourceLocations" class="field-error">{{ errors.maxSourceLocations }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.maxSourceValues }">
            <label>最大源场数值数</label>
            <input v-model.number="fieldResampleForm.maxSourceValues" type="number" min="3" max="1000000000" @blur="validateField('maxSourceValues')" />
            <span v-if="errors.maxSourceValues" class="field-error">{{ errors.maxSourceValues }}</span>
          </div>
          <div class="form-field" :class="{ 'has-error': errors.maxTargetCells }">
            <label>最大有效目标格元数</label>
            <input v-model.number="fieldResampleForm.maxTargetCells" type="number" min="1" max="1000000000" @blur="validateField('maxTargetCells')" />
            <span v-if="errors.maxTargetCells" class="field-error">{{ errors.maxTargetCells }}</span>
            <span v-else class="field-hint">限制插值有效且属于目标空域的输出数量，不限制读取批次数；超限会报错，不会截断入库。</span>
          </div>
          <div class="form-field">
            <label class="checkbox-item">
              <input v-model="fieldResampleForm.registerMissingAttribute" type="checkbox" />
              <span>正式导入时自动注册缺失属性</span>
            </label>
          </div>
        </div>

        <div class="submit-row">
          <button class="btn-primary" type="button" :disabled="submittingMap.fieldResample" @click="submitFieldResample">
            <Loader2 v-if="submittingMap.fieldResample" :size="14" class="spin" />
            <span>{{ submittingMap.fieldResample ? '提交中...' : (fieldResampleForm.dryRun ? '提交重采样预检' : '提交重采样挂载') }}</span>
          </button>
          <span class="submit-hint">L17 权威格元分批重采样，按批次限制内存，保留最终成员校验和属性写入计数核验。</span>
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
              <option value="DEM_AGL">DEM_AGL（L17 地面高程＋离地高度上限）</option>
            </select>
            <span v-if="errors.heightSource" class="field-error">{{ errors.heightSource }}</span>
          </div>
          <template v-if="featureForm.heightSource === 'DEM_AGL'">
            <div class="form-field" :class="{ 'has-error': errors.aglHeightField }">
              <label>离地高度上限字段（米） <span class="req">*</span></label>
              <input v-model="featureForm.aglHeightField" type="text" placeholder="Descriptio" @blur="validateField('aglHeightField')" />
              <span v-if="errors.aglHeightField" class="field-error">{{ errors.aglHeightField }}</span>
              <span v-else class="field-hint">从地面至该离地高度禁飞，支持纯数值字符串；不读取几何 Z 值</span>
            </div>
            <div class="form-field">
              <label>地面高程来源</label>
              <input :value="featureForm.demGridTable || 'demgrid_17'" type="text" readonly />
              <span class="field-hint">读取 L17 demgrid_17 表的 ST_Z(center)；请确保其与真高剖分使用的 sourceTable 和数据版本一致</span>
            </div>
            <div class="form-field" :class="{ 'has-error': errors.demNoDataPolicy }">
              <label>地面高程缺测处理</label>
              <select v-model="featureForm.demNoDataPolicy" @change="validateField('demNoDataPolicy')">
                <option value="SKIP_CELL">跳过缺测网格（其余区域正常入库）</option>
                <option value="ERROR">报错并停止整批</option>
              </select>
              <span v-if="errors.demNoDataPolicy" class="field-error">{{ errors.demNoDataPolicy }}</span>
              <span v-else class="field-hint">跳过单位为 L17 水平格；缺少有效 ST_Z(center) 的格不入库，不用零高程填补</span>
            </div>
          </template>
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
          <div class="form-field span-2" :class="{ 'has-error': errors.propertyFields }">
            <label>保留属性字段（JSON 数组）</label>
            <textarea
              v-model="featureForm.propertyFields"
              rows="2"
              placeholder='["GRID_ID","TOT_SCORE"]'
              @blur="validateField('propertyFields')"
            ></textarea>
            <span v-if="errors.propertyFields" class="field-error">{{ errors.propertyFields }}</span>
            <span v-else class="field-hint">可选：留空保存全部源属性；填写后只保存数组中列出的字段</span>
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

      <!-- 航图要素数据管理 -->
      <section v-show="activeTab === 'featureManage'" class="dataset-manager-shell">
        <FeatureDatasetManager @import-field="openManagedFieldImport" />
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
