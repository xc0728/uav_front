<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ZoomIn, Loader2 } from 'lucide-vue-next'
import { errorMessage } from '../../../utils/http'
import {
  activeTrueAltitudeDatasets,
  buildTrueAltitudeRegionPayload,
  compactMixedDisplayCells,
  toAirspaceMapCells,
} from '../../../utils/trueAltitudeGrid'
import {
  CHART_GRID_LEVEL,
  CHART_DATASETS,
  CHART_DATASET_TREE,
  chartFeatureColor,
  chartFeatureLabel,
  chartThemeLabel,
  featuresByGrid,
  horizontalGridCode,
  queryChartFeatures,
  queryChartRegion,
} from '../../../utils/staticFeatures'

const props = defineProps({
  serviceName: {
    type: String,
    default: '空域网格化入库/查询服务'
  },
  functionName: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['close', 'showPoint', 'showGrid', 'get-view-bounds'])
const chartMode = computed(() => props.functionName === '航图要素网格查询')
const trueAltitudeMode = computed(() => props.functionName === '真高空域网格查询')

/** 高度快选：100, 200, 300, 400, 500, 600 */
const heightPresetOptions = [100, 200, 300, 400, 500, 600]
const airspaceOptions = [
  'Changsha_AIRSPACE',
  'Xiangtan_AIRSPACE',
  'Zhuzhou_AIRSPACE',
  'ZheJiang_AIRSPACE',
  'Deqing_Airspace',
]

function onBottomPresetChange(event) {
  const val = event.target.value
  if (val !== '') {
    airspaceGridForm.bottom = Number(val)
  }
  event.target.selectedIndex = 0
}

function onTopPresetChange(event) {
  const val = event.target.value
  if (val !== '') {
    airspaceGridForm.top = Number(val)
  }
  event.target.selectedIndex = 0
}

function onMinAglPresetChange(event) {
  const val = event.target.value
  if (val !== '') airspaceGridForm.minAgl = Number(val)
  event.target.selectedIndex = 0
}

function onMaxAglPresetChange(event) {
  const val = event.target.value
  if (val !== '') airspaceGridForm.maxAgl = Number(val)
  event.target.selectedIndex = 0
}

const airspaceGridForm = reactive({
  level: 12,
  minLon: null,
  maxLon: null,
  minLat: null,
  maxLat: null,
  top: 600,
  bottom: 0,
  airspaceId: '',
  datasetId: '',
  minAgl: 0,
  maxAgl: 600,
})

const loading = ref(false)
const datasetLoading = ref(false)
const datasetError = ref('')
const trueAltitudeDatasets = ref([])
const error = ref('')
const result = ref(null)
const queryStats = ref(null)
// 试验开关默认关闭；整个分页查询固定一次选择，避免中途改变算法。
const experimentalMixedResolution = ref(false)
const gridsData = ref([])
const chartSummary = ref(null)
const selectedDatasetIds = ref(CHART_DATASETS.slice(0, 4).map(dataset => dataset.id))
let totalCount = 0

function selectAllDatasets() {
  selectedDatasetIds.value = CHART_DATASETS.map(dataset => dataset.id)
}

function clearDatasetSelection() {
  selectedDatasetIds.value = []
}

function datasetIdsOf(node) {
  return node.datasets
    ? node.datasets.map(dataset => dataset.id)
    : node.children.flatMap(datasetIdsOf)
}

function isNodeSelected(node) {
  const ids = datasetIdsOf(node)
  return ids.length > 0 && ids.every(id => selectedDatasetIds.value.includes(id))
}

function setNodeSelected(node, checked) {
  const selected = new Set(selectedDatasetIds.value)
  datasetIdsOf(node).forEach(id => checked ? selected.add(id) : selected.delete(id))
  selectedDatasetIds.value = CHART_DATASETS.filter(dataset => selected.has(dataset.id)).map(dataset => dataset.id)
}

watch(chartMode, (active) => {
  if (!active) return
  airspaceGridForm.level = CHART_GRID_LEVEL
  if (airspaceGridForm.top > 300) airspaceGridForm.top = 300
}, { immediate: true })

const selectedTrueAltitudeDataset = computed(() =>
  trueAltitudeDatasets.value.find(dataset => dataset.datasetId === airspaceGridForm.datasetId) || null,
)

function applyTrueAltitudeDataset(dataset) {
  if (!dataset) return
  airspaceGridForm.level = Number(dataset.activeLevel)
  if (Number.isFinite(Number(dataset.minAgl))) airspaceGridForm.minAgl = Number(dataset.minAgl)
  if (Number.isFinite(Number(dataset.maxAgl))) airspaceGridForm.maxAgl = Number(dataset.maxAgl)
}

async function loadTrueAltitudeDatasets() {
  if (datasetLoading.value) return
  datasetLoading.value = true
  datasetError.value = ''
  try {
    const response = await fetch('/api/true-altitude-airspace/datasets')
    if (!response.ok) throw new Error(await errorMessage(response, `数据集加载失败，状态码 ${response.status}`))
    const body = await response.json()
    const datasets = Array.isArray(body?.data?.datasets) ? body.data.datasets : []
    trueAltitudeDatasets.value = activeTrueAltitudeDatasets(body)
    if (!trueAltitudeDatasets.value.some(dataset => dataset.datasetId === airspaceGridForm.datasetId)) {
      airspaceGridForm.datasetId = trueAltitudeDatasets.value[0]?.datasetId || ''
    }
    applyTrueAltitudeDataset(selectedTrueAltitudeDataset.value)
    if (datasets.length > 0 && trueAltitudeDatasets.value.length === 0) {
      datasetError.value = '存在真高数据集，但尚无已激活且层级有效的版本'
    }
  } catch (err) {
    datasetError.value = err?.message || '真高数据集加载失败'
    trueAltitudeDatasets.value = []
  } finally {
    datasetLoading.value = false
  }
}

watch(() => airspaceGridForm.datasetId, () => {
  applyTrueAltitudeDataset(selectedTrueAltitudeDataset.value)
})

watch(trueAltitudeMode, (active) => {
  if (active) loadTrueAltitudeDatasets()
}, { immediate: true })

function uniqueFeatureCount(features) {
  return new Set(features.map(feature => feature.featureUid)).size
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function toMapCells(rawGrids) {
  return toAirspaceMapCells(rawGrids)
}

function featureDescription(cell, features) {
  const themes = [...new Set(features.map(feature => feature.theme).filter(Boolean))]
  const rows = features.slice(0, 8).map(feature =>
    `<li>${escapeHtml(chartFeatureLabel(feature))}</li>`,
  ).join('')
  return `<b>航图要素网格</b><br>编码：${escapeHtml(cell.code)}<br>` +
    `高度：${cell.bounds.bottom.toFixed(2)}–${cell.bounds.top.toFixed(2)} m<br>` +
    `主题：${escapeHtml(themes.map(chartThemeLabel).join('、'))}<br>关联要素：${features.length}<ul>${rows}</ul>`
}

async function buildDisplayedCells(rawGrids, signal) {
  const cells = toMapCells(rawGrids)
  chartSummary.value = null
  if (!chartMode.value || cells.length === 0) return cells

  const embeddedFeatures = cells.flatMap(cell => cell.features || [])
  const { features2D, features3D } = embeddedFeatures.length
    ? {
        features2D: embeddedFeatures.filter(feature => feature.dimensionMode !== '3D'),
        features3D: embeddedFeatures.filter(feature => feature.dimensionMode === '3D'),
      }
    : await queryChartFeatures(cells, { signal })
  const grouped = featuresByGrid(features2D, features3D)
  const datasets = new Map()
  const displayed = cells.flatMap(cell => {
    const features = cell.features || grouped.get(horizontalGridCode(cell.code)) || []
    if (features.length === 0) return []
    features.forEach(feature => datasets.set(feature.datasetId, {
      id: feature.datasetId,
      label: chartFeatureLabel(feature),
      color: chartFeatureColor(feature),
    }))
    const primaryFeature = features.find(feature => feature.dimensionMode === '3D') || features[0]
    const chartFeatures = [...new Map(features.map(feature => {
      const type = feature.datasetId || feature.featureType
      return [type, {
        type,
        label: chartFeatureLabel(feature),
        theme: feature.theme,
        color: chartFeatureColor(feature),
      }]
    })).values()]
    return [{
      ...cell,
      color: chartFeatureColor(primaryFeature),
      description: featureDescription(cell, features),
      chartFeatures,
    }]
  })
  chartSummary.value = {
    grids: displayed.length,
    features2D: uniqueFeatureCount(features2D),
    features3D: uniqueFeatureCount(features3D),
    datasets: [...datasets.values()],
  }
  return displayed
}

// ====== 动态缩放模式 ======
const dynamicZoomEnabled = ref(false)   // 动态缩放开关
const dynamicRuntime = ref(0)            // 动态缩放最近一次耗时(ms)
const dynamicLoading = ref(false)        // 动态缩放加载状态
let abortController = null               // 动态缩放：取消上一次未完成的请求
let manualAbortController = null         // 手动查询：取消当前请求
let manualTimeoutId = null               // 手动查询：超时定时器
let manualTimedOut = false               // 手动查询：是否因超时而中止
const TRUE_ALTITUDE_PAGE_SIZE = 50000
const TRUE_ALTITUDE_RENDER_TARGET = 100000

async function queryAndRenderTrueAltitudePages(basePayload, controller, options = {}) {
  let cursor
  let pageIndex = 0
  let total = 0
  let displayed = 0
  let mixedDisplayCells = []
  let displayCoarsened = false
  let lastData = null
  let datasetVersion = basePayload.datasetVersion
  const mixed = experimentalMixedResolution.value
  const levels = new Set()
  const startedAt = performance.now()

  do {
    const payload = buildTrueAltitudeRegionPayload({
      ...basePayload,
      datasetVersion,
      pageSize: TRUE_ALTITUDE_PAGE_SIZE,
      renderTargetCells: TRUE_ALTITUDE_RENDER_TARGET,
      experimentalMixedResolution: mixed,
      cursor,
    })
    const response = await fetch('/api/true-altitude-airspace/grid/region', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(await errorMessage(response, `请求失败，状态码 ${response.status}`))
    const data = await response.json()
    if (controller.signal.aborted) return null
    if (mixed && (data?.data?.mixedResolution !== true || data?.data?.countExact !== true)) {
      throw new Error('当前后端不支持混合多粒度试验，请更新后端或关闭试验开关')
    }
    datasetVersion ??= data?.data?.datasetVersion

    const rawCells = Array.isArray(data?.data?.cells) ? data.data.cells : []
    const pageCells = toMapCells(rawCells)
    let cells = pageCells
    if (mixed) {
      const compacted = compactMixedDisplayCells(
        mixedDisplayCells,
        pageCells,
        TRUE_ALTITUDE_RENDER_TARGET,
      )
      mixedDisplayCells = compacted.cells
      displayCoarsened ||= compacted.coarsened
      cells = mixedDisplayCells
    }
    if (mixed) levels.clear()
    for (const cell of cells) levels.add(Number(cell.level))
    const runtime = performance.now() - startedAt
    const pageSourceCount = Number(data?.data?.sourceCellCount)
    total += Number.isFinite(pageSourceCount)
      ? pageSourceCount
      : pageCells.reduce((sum, cell) => sum + (Number(cell.sourceCellCount) || 1), 0)
    displayed = mixed ? cells.length : displayed + cells.length
    lastData = data
    result.value = data
    queryStats.value = {
      total,
      displayed,
      sourceLevel: data?.data?.sourceLevel,
      renderLevel: data?.data?.renderLevel,
      lod: data?.data?.lod === true,
      mixedResolution: data?.data?.mixedResolution === true,
      countExact: data?.data?.countExact === true,
      levels: [...levels].sort((a, b) => a - b).map(level => `L${level}`).join(' / '),
      displayCoarsened,
      complete: data?.data?.hasMore !== true,
      status: data?.success === true ? 'success' : (data?.status || 'unknown'),
    }

    if (cells.length > 0) {
      emit('showGrid', {
        cells,
        level: Number(data?.data?.renderLevel ?? basePayload.level),
        runtime,
        renderer: 'instanced',
        fillAlpha: data?.data?.lod === true ? 0.08 : 0.18,
        outlineAlpha: data?.data?.lod === true ? 0.65 : 0.85,
        append: mixed ? false : pageIndex > 0,
        skipFlyTo: options.skipFlyTo === true || pageIndex > 0,
      })
    } else if (pageIndex === 0) {
      emit('showGrid', { cells: [], level: Number(basePayload.level), runtime })
    }

    const nextCursor = data?.data?.nextCursor
    const hasMore = data?.data?.hasMore === true
    if (!hasMore) break
    if (!nextCursor || nextCursor === cursor) throw new Error('真高网格分页游标无效')
    cursor = nextCursor
    pageIndex++
    // 将控制权交还浏览器，避免连续解析和 GPU 提交阻塞界面。
    await new Promise(resolve => setTimeout(resolve, 0))
  } while (!controller.signal.aborted)

  gridsData.value = []
  totalCount = total
  return { data: lastData, total, displayed, runtime: performance.now() - startedAt }
}

/**
 * 核心：视图边界变化时（由 CesiumMap 400ms debounce 后触发）
 * 只在 dynamicZoomEnabled=true 时自动查询
 * 使用用户手动设置的 level，不做自动映射（避免用户设 level=10 被覆盖成 17）
 */
async function onViewBoundsChanged(bounds) {
  if (!dynamicZoomEnabled.value) return
  if (!bounds) return
  if (chartMode.value && selectedDatasetIds.value.length === 0) return
  if (trueAltitudeMode.value && !airspaceGridForm.datasetId) return

  // 1. 取消上一次未完成的请求（避免旧响应覆盖新响应）
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  const controller = new AbortController()
  abortController = controller

  // 2. 使用用户手动设置的层级（不做自动映射，尊重用户选择）
  const queryLevel = chartMode.value ? CHART_GRID_LEVEL : (Number(airspaceGridForm.level) || 12)

  dynamicLoading.value = true
  error.value = ''

  try {
    const minLon = Number(bounds.west)
    const maxLon = Number(bounds.east)
    const minLat = Number(bounds.south)
    const maxLat = Number(bounds.north)

    const polygon = [
      [minLon, minLat],
      [maxLon, minLat],
      [maxLon, maxLat],
      [minLon, maxLat],
      [minLon, minLat],
    ]

    // 真高查询返回完整结果；普通空域/航图分支仍保留各自的 maxCells 保护。
    const payload = trueAltitudeMode.value ? buildTrueAltitudeRegionPayload({
      datasetId: airspaceGridForm.datasetId,
      polygon,
      minAgl: Number(airspaceGridForm.minAgl),
      maxAgl: Number(airspaceGridForm.maxAgl),
      level: queryLevel,
    }) : {
      airspaceId: airspaceGridForm.airspaceId.trim(),
      polygon,
      bottom: chartMode.value ? Math.max(Number(airspaceGridForm.bottom) || 0, 0) : (Number(airspaceGridForm.bottom) || 0),
      top: chartMode.value ? Math.min(Number(airspaceGridForm.top) || 300, 300) : (Number(airspaceGridForm.top) || 600),
      level: queryLevel,
      maxCells: 200000,
      query_concurrency: 4,
      ...(chartMode.value ? { datasetIds: selectedDatasetIds.value, maxMappings: 2000000 } : {}),
    }

    if (trueAltitudeMode.value) {
      const pagedResult = await queryAndRenderTrueAltitudePages(payload, controller, { skipFlyTo: true })
      if (!pagedResult || controller.signal.aborted) return
      dynamicRuntime.value = pagedResult.runtime
      if (pagedResult.total === 0) queryStats.value = { total: 0, status: 'empty' }
      return
    }

    const t0 = performance.now()
    const data = chartMode.value
      ? await queryChartRegion(payload, { signal: controller.signal })
      : await (async () => {
          const endpoint = trueAltitudeMode.value
            ? '/api/true-altitude-airspace/grid/region'
            : '/api/multiSource/airSpaceDB/grid/region'
          const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
          })
          if (!resp.ok) throw new Error(await errorMessage(resp, `状态码 ${resp.status}`))
          return resp.json()
        })()
    const runtime = Math.round(performance.now() - t0)

    // 如果 controller 已被取消，说明有更新的请求在路上了，直接丢弃本次结果
    if (controller.signal.aborted) return

    dynamicRuntime.value = runtime

    // 解析 cells
    let rawGrids = null
    if (data?.data?.cells && data.data.cells.length > 0) rawGrids = data.data.cells
    else if (data?.data?.grids && data.data.grids.length > 0) rawGrids = data.data.grids

    if (rawGrids && rawGrids.length > 0) {
      const cells = await buildDisplayedCells(rawGrids, controller.signal)

      gridsData.value = rawGrids
      totalCount = rawGrids.length
      queryStats.value = {
        total: chartMode.value ? cells.length : totalCount,
        status: data?.success === true ? 'success' : (data?.status || 'unknown'),
      }
      emit('showGrid', { cells, level: queryLevel, runtime, skipFlyTo: true })
    } else {
      gridsData.value = []
      totalCount = 0
      queryStats.value = { total: 0, status: 'empty' }
      emit('showGrid', { cells: [], level: queryLevel, runtime, skipFlyTo: true })
    }
  } catch (err) {
    if (err?.name === 'AbortError') return // 被取消的请求静默忽略
    console.warn('[空域网格查询] 动态缩放请求失败:', err?.message)
    // 动态缩放失败不弹窗打扰用户，只在控制台提示
  } finally {
    if (controller.signal.aborted) return
    dynamicLoading.value = false
  }
}

function toggleDynamicZoom() {
  if (!dynamicZoomEnabled.value && chartMode.value && selectedDatasetIds.value.length === 0) {
    error.value = '请至少勾选一种航图要素'
    return
  }
  if (!dynamicZoomEnabled.value && trueAltitudeMode.value && !airspaceGridForm.datasetId) {
    error.value = '请选择已激活的真高数据集'
    return
  }
  dynamicZoomEnabled.value = !dynamicZoomEnabled.value
  if (dynamicZoomEnabled.value) {
    // 开启时立即触发一次查询
    emit('get-view-bounds')
  } else {
    // 关闭时取消未完成的请求
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }
}

function resetForm() {
  cancelManualQuery()
  loading.value = false
  error.value = ''
  result.value = null
  queryStats.value = null
  gridsData.value = []
  chartSummary.value = null
  dynamicZoomEnabled.value = false
  dynamicRuntime.value = 0
  if (abortController) {
    abortController.abort()
    abortController = null
  }
}

function setPointFromMap(lon, lat, height) {
  // 空域网格查询暂不支持地图点选
}

// 获取视图边界
function requestViewBounds() {
  emit('get-view-bounds')
}

/**
 * 估算查询区域在指定层级下的格网数量（用于提前预警）
 * GeoSOT level n 格子边长 ≈ 360° / 2^n
 */
function estimateCellCount(minLon, maxLon, minLat, maxLat, level) {
  const cellSize = 360 / Math.pow(2, level) // 度
  const lonCells = Math.ceil((maxLon - minLon) / cellSize)
  const latCells = Math.ceil((maxLat - minLat) / cellSize)
  return lonCells * latCells
}

/**
 * 取消当前手动查询请求
 */
function cancelManualQuery() {
  manualTimedOut = false
  if (manualAbortController) {
    manualAbortController.abort()
    manualAbortController = null
  }
  if (manualTimeoutId) {
    clearTimeout(manualTimeoutId)
    manualTimeoutId = null
  }
  loading.value = false
}

// 设置视图边界
function setViewBounds(bounds) {
  airspaceGridForm.minLon = Number(bounds.west.toFixed(4))
  airspaceGridForm.maxLon = Number(bounds.east.toFixed(4))
  airspaceGridForm.minLat = Number(bounds.south.toFixed(4))
  airspaceGridForm.maxLat = Number(bounds.north.toFixed(4))
}

defineExpose({ resetForm, setPointFromMap, setViewBounds, onViewBoundsChanged })

async function submitAirspaceGridQuery() {
  error.value = ''
  result.value = null
  queryStats.value = null

  // 验证层级
  if (!Number.isInteger(Number(airspaceGridForm.level)) || airspaceGridForm.level < 0) {
    error.value = '请输入有效的层级'
    return
  }

  // 验证边界参数
  if (airspaceGridForm.minLon === null || airspaceGridForm.maxLon === null ||
      airspaceGridForm.minLat === null || airspaceGridForm.maxLat === null) {
    error.value = '请先在地图上框选查询区域，或手动输入边界参数'
    return
  }

  if (trueAltitudeMode.value && !airspaceGridForm.datasetId) {
    error.value = '请选择已激活的真高数据集'
    return
  }
  // 普通空域和航图查询仍使用 airspaceId
  if (!trueAltitudeMode.value && (!airspaceGridForm.airspaceId || airspaceGridForm.airspaceId.trim() === '')) {
    error.value = '请输入空域ID'
    return
  }
  if (chartMode.value && selectedDatasetIds.value.length === 0) {
    error.value = '请至少勾选一种航图要素'
    return
  }

  const minLon = Number(airspaceGridForm.minLon)
  const maxLon = Number(airspaceGridForm.maxLon)
  const minLat = Number(airspaceGridForm.minLat)
  const maxLat = Number(airspaceGridForm.maxLat)

  if (minLon >= maxLon || minLat >= maxLat) {
    error.value = '边界参数不合法：minLon < maxLon, minLat < maxLat'
    return
  }
  if (trueAltitudeMode.value) {
    const minAgl = Number(airspaceGridForm.minAgl)
    const maxAgl = Number(airspaceGridForm.maxAgl)
    if (!Number.isFinite(minAgl) || !Number.isFinite(maxAgl) || minAgl < 0 || maxAgl < minAgl) {
      error.value = '真高范围必须满足 0 ≤ 最低真高 ≤ 最高真高'
      return
    }
  }

  // 估算格网数量，超过阈值时预警
  const queryLevel = chartMode.value ? CHART_GRID_LEVEL : Number(airspaceGridForm.level)
  const estimatedCells = estimateCellCount(minLon, maxLon, minLat, maxLat, queryLevel)
  const WARN_THRESHOLD = 50000
  if (!chartMode.value && !trueAltitudeMode.value && estimatedCells > WARN_THRESHOLD) {
    const ok = window.confirm(
      `当前区域在 level ${queryLevel} 下预估约 ${estimatedCells.toLocaleString()} 个格网，` +
      `查询可能较慢。是否继续？\n\n（建议缩小区域或降低层级）`
    )
    if (!ok) return
  }

  // 取消上一次未完成的手动查询
  cancelManualQuery()

  loading.value = true

  try {
    // 构建 polygon：顺时针闭合多边形顶点数组 [lon, lat]
    const polygon = [
      [minLon, minLat],
      [maxLon, minLat],
      [maxLon, maxLat],
      [minLon, maxLat],
      [minLon, minLat],
    ]

    // 真高查询覆盖完整原始数据，显示端由后端自动选择聚合层级；普通空域/航图仍保留 maxCells。
    const payload = trueAltitudeMode.value ? buildTrueAltitudeRegionPayload({
      datasetId: airspaceGridForm.datasetId,
      polygon: polygon,
      minAgl: Number(airspaceGridForm.minAgl),
      maxAgl: Number(airspaceGridForm.maxAgl),
      level: queryLevel,
    }) : {
      airspaceId: airspaceGridForm.airspaceId.trim(),
      polygon: polygon,
      bottom: chartMode.value ? Math.max(Number(airspaceGridForm.bottom) || 0, 0) : (Number(airspaceGridForm.bottom) || 0),
      top: chartMode.value ? Math.min(Number(airspaceGridForm.top) || 300, 300) : (Number(airspaceGridForm.top) || 600),
      level: queryLevel,
      maxCells: 200000,
      query_concurrency: 4,
      ...(chartMode.value ? { datasetIds: selectedDatasetIds.value, maxMappings: 2000000 } : {}),
    }

    console.log('[空域网格查询] 发送 payload:', payload, `预估格网约 ${estimatedCells} 个`)

    // 创建 AbortController 支持取消
    const controller = new AbortController()
    manualAbortController = controller

    // 航图大区域返回量较大，给聚合查询更充足的响应时间。
    manualTimedOut = false
    const timeoutMs = trueAltitudeMode.value ? 0 : (chartMode.value ? 180000 : 60000)
    const timeoutSeconds = timeoutMs / 1000
    if (timeoutMs > 0) {
      manualTimeoutId = setTimeout(() => {
        manualTimedOut = true
        controller.abort()
        console.warn(`[空域网格查询] 请求超时（${timeoutSeconds}s），已取消前端等待`)
      }, timeoutMs)
    }

    if (trueAltitudeMode.value) {
      const pagedResult = await queryAndRenderTrueAltitudePages(payload, controller)
      if (!pagedResult || controller.signal.aborted) return
      if (pagedResult.total === 0) {
        error.value = '未查询到空域网格数据'
        queryStats.value = { total: 0, status: 'empty' }
      }
      return
    }

    const t0 = performance.now()
    const data = chartMode.value
      ? await queryChartRegion(payload, { signal: controller.signal })
      : await (async () => {
          const endpoint = trueAltitudeMode.value
            ? '/api/true-altitude-airspace/grid/region'
            : '/api/multiSource/airSpaceDB/grid/region'
          const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
          })
          if (!resp.ok) throw new Error(await errorMessage(resp, `请求失败，状态码 ${resp.status}`))
          return resp.json()
        })()
    const runtime = performance.now() - t0
    result.value = data
    console.log('[空域网格查询] 原始返回:', data)
    if (chartMode.value) {
      console.info('[航图专题网格诊断]', {
        airspaceId: data?.data?.airspaceId,
        version: data?.data?.version,
        airspaceVersion: data?.data?.airspaceVersion,
        matchedCount: data?.data?.matchedCount,
        mappingCount: data?.data?.mappingCount,
        truncated: data?.data?.truncated,
        returnedCells: data?.data?.cells?.length,
      })
    }

    // 解析返回数据
    let rawGrids = null
    if (data?.data?.grids && data.data.grids.length > 0) {
      rawGrids = data.data.grids
    } else if (data?.data?.cells && data.data.cells.length > 0) {
      rawGrids = data.data.cells
    } else if (data?.data?.features && data.data.features.length > 0) {
      rawGrids = data.data.features
    } else if (data?.data?.airspace && Array.isArray(data.data.airspace) && data.data.airspace.length > 0) {
      // 新接口返回格式：data.data.airspace[]
      rawGrids = data.data.airspace
    } else if (Array.isArray(data?.data)) {
      rawGrids = data.data
    } else if (data?.airspace && Array.isArray(data.airspace)) {
      // 备用格式：data.airspace[]
      rawGrids = data.airspace
    }

    if (!rawGrids || rawGrids.length === 0) {
      error.value = '未查询到空域网格数据'
      totalCount = 0
    } else {
      gridsData.value = rawGrids
      totalCount = rawGrids.length
    }

    queryStats.value = {
      total: totalCount,
      status: data?.success === true ? 'success' : (data?.status || 'unknown'),
    }

    // 如果返回了格网数据，通知地图组件显示
    if (gridsData.value.length > 0) {
      const cells = await buildDisplayedCells(gridsData.value, controller.signal)

      queryStats.value.total = chartMode.value ? cells.length : totalCount

      console.log('[空域网格查询] 转换后的 cells 前3条:', JSON.stringify(cells.slice(0, 3)))
      emit('showGrid', { cells, level: queryLevel, runtime })
    }
  } catch (err) {
    if (err?.name === 'AbortError') {
      error.value = manualTimedOut
        ? `请求超时（${timeoutSeconds}s），请缩小查询区域或收紧专题条件后重试`
        : '查询已取消'
      console.warn('[空域网格查询] 请求被中止:', manualTimedOut ? '超时' : '用户取消')
    } else {
      console.error('[空域网格查询] 请求错误:', err)
      error.value = err?.message || '请求失败，请稍后重试'
    }
  } finally {
    // 清理超时定时器和 controller 引用
    if (manualTimeoutId) {
      clearTimeout(manualTimeoutId)
      manualTimeoutId = null
    }
    manualAbortController = null
    loading.value = false
  }
}

function clearGrids() {
  emit('showGrid', { cells: [] })
  result.value = null
  queryStats.value = null
  gridsData.value = []
  chartSummary.value = null
}
</script>

<template>
  <div class="airspace-grid-query">
    <template v-if="trueAltitudeMode || functionName === '空域网格查询' || chartMode">
      <!-- 层级设置 -->
      <div class="form-group">
        <div class="group-title">层级设置</div>
        <div class="level-row">
          <div v-if="chartMode" class="fixed-level">Level {{ CHART_GRID_LEVEL }}（航图固定层级）</div>
          <div v-else-if="trueAltitudeMode" class="fixed-level">
            {{ selectedTrueAltitudeDataset ? `Level ${airspaceGridForm.level}（活动版本固定层级）` : '请先选择数据集' }}
          </div>
          <select
            v-else
            id="agq-level"
            v-model.number="airspaceGridForm.level"
            class="level-select"
          >
            <option :value="null" disabled>选择层级</option>
            <option v-for="lvl in 22" :key="lvl - 1" :value="lvl - 1">{{ lvl - 1 }}</option>
          </select>
        </div>
      </div>

      <!-- 真高数据集 -->
      <div v-if="trueAltitudeMode" class="form-group">
        <div class="dataset-title-row">
          <div class="group-title">真高数据集</div>
          <button type="button" class="dataset-refresh" :disabled="datasetLoading" @click="loadTrueAltitudeDatasets">
            {{ datasetLoading ? '加载中...' : '刷新' }}
          </button>
        </div>
        <select v-model="airspaceGridForm.datasetId" class="level-select" :disabled="datasetLoading">
          <option value="" disabled>{{ datasetLoading ? '正在加载数据集' : '选择已激活数据集' }}</option>
          <option v-for="dataset in trueAltitudeDatasets" :key="dataset.datasetId" :value="dataset.datasetId">
            {{ dataset.datasetId }} · v{{ dataset.activeVersion }} · L{{ dataset.activeLevel }}
          </option>
        </select>
        <div v-if="selectedTrueAltitudeDataset" class="dataset-hint">
          活动版本 v{{ selectedTrueAltitudeDataset.activeVersion }}；可用真高
          {{ selectedTrueAltitudeDataset.minAgl ?? 0 }}–{{ selectedTrueAltitudeDataset.maxAgl ?? '—' }} m
        </div>
        <div v-if="datasetError" class="error-box dataset-error">{{ datasetError }}</div>
        <label class="dataset-hint">
          <input v-model="experimentalMixedResolution" type="checkbox" :disabled="loading || dynamicZoomEnabled" />
          混合多粒度网格（试验，默认关闭）
        </label>
        <div v-if="experimentalMixedResolution" class="dataset-hint">
          内部粗网格、边界细网格；精确统计继续分页，最多绘制 100,000 个显示网格。关闭可回退原查询。
        </div>
      </div>

      <!-- 普通空域ID -->
      <div v-else class="form-group">
        <div class="group-title">空域ID</div>
        <input
          v-model="airspaceGridForm.airspaceId"
          list="airspace-options"
          type="text"
          class="airspace-id-input"
          placeholder="选择或输入空域ID"
        >
        <datalist id="airspace-options">
          <option v-for="airspaceId in airspaceOptions" :key="airspaceId" :value="airspaceId" />
        </datalist>
      </div>

      <div v-if="chartMode" class="form-group">
        <div class="dataset-title-row">
          <div class="group-title">查询要素（已选 {{ selectedDatasetIds.length }}）</div>
          <div class="dataset-actions">
            <button type="button" @click="selectAllDatasets">全选</button>
            <button type="button" @click="clearDatasetSelection">清空</button>
          </div>
        </div>
        <div class="dataset-tree">
          <details v-for="group in CHART_DATASET_TREE" :key="group.id" class="tree-group" open>
            <summary>
              <input
                type="checkbox"
                :checked="isNodeSelected(group)"
                @click.stop
                @change="setNodeSelected(group, $event.target.checked)"
              >
              <span>{{ group.label }}</span>
            </summary>
            <details v-for="theme in group.children" :key="theme.id" class="tree-theme" open>
              <summary>
                <input
                  type="checkbox"
                  :checked="isNodeSelected(theme)"
                  @click.stop
                  @change="setNodeSelected(theme, $event.target.checked)"
                >
                <span>{{ theme.label }}</span>
              </summary>
              <label v-for="dataset in theme.datasets" :key="dataset.id" class="dataset-option">
                <input v-model="selectedDatasetIds" type="checkbox" :value="dataset.id">
                <i :style="{ background: dataset.color }" />
                <span>{{ dataset.label }}</span>
              </label>
            </details>
          </details>
        </div>
        <div class="dataset-hint">只会向后端查询已勾选的数据集。</div>
      </div>

      <!-- 查询边界 -->
      <div class="form-group">
        <div class="group-title">查询边界</div>
        <div class="coord-grid">
          <div class="coord-line">
            <span class="coord-label">西</span>
            <input
              v-model.number="airspaceGridForm.minLon"
              type="number"
              step="0.0001"
              placeholder="经度"
            >
            <span class="coord-label">东</span>
            <input
              v-model.number="airspaceGridForm.maxLon"
              type="number"
              step="0.0001"
              placeholder="经度"
            >
          </div>
          <div class="coord-line">
            <span class="coord-label">南</span>
            <input
              v-model.number="airspaceGridForm.minLat"
              type="number"
              step="0.0001"
              placeholder="纬度"
            >
            <span class="coord-label">北</span>
            <input
              v-model.number="airspaceGridForm.maxLat"
              type="number"
              step="0.0001"
              placeholder="纬度"
            >
          </div>
        </div>
        <button class="btn-view" @click="requestViewBounds" :disabled="loading">
          获取当前视图
        </button>
        <!-- 动态缩放开关 -->
        <button
          class="btn-dynamic-zoom"
          :class="{ active: dynamicZoomEnabled }"
          @click="toggleDynamicZoom"
          :disabled="loading"
          type="button"
        >
          <ZoomIn :size="14" />
          <span>{{ dynamicZoomEnabled ? '关闭视野联动' : '开启视野联动' }}</span>
          <Loader2 v-if="dynamicLoading" :size="12" class="spin" />
        </button>
      </div>

      <!-- 高程/真高参数 -->
      <div class="form-group">
        <div class="group-title">{{ trueAltitudeMode ? '真高范围（AGL）' : '高程参数' }}</div>
        <div class="height-grid">
          <div class="coord-line">
            <span class="coord-label">{{ trueAltitudeMode ? '最低' : '底' }}</span>
            <div class="param-input-combo">
              <input
                v-if="trueAltitudeMode"
                v-model.number="airspaceGridForm.minAgl"
                type="number"
                step="10"
                min="0"
                class="height-input"
                placeholder="输入值"
              >
              <input
                v-else
                v-model.number="airspaceGridForm.bottom"
                type="number"
                step="10"
                min="0"
                class="height-input"
                placeholder="输入值"
              >
              <select
                class="param-preset-select"
                @change="trueAltitudeMode ? onMinAglPresetChange($event) : onBottomPresetChange($event)"
              >
                <option value="">快选</option>
                <option v-for="h in heightPresetOptions" :key="`bottom-${h}`" :value="h">{{ h }}</option>
              </select>
            </div>
          </div>
          <div class="coord-line">
            <span class="coord-label">{{ trueAltitudeMode ? '最高' : '顶' }}</span>
            <div class="param-input-combo">
              <input
                v-if="trueAltitudeMode"
                v-model.number="airspaceGridForm.maxAgl"
                type="number"
                step="10"
                min="0"
                class="height-input"
                placeholder="输入值"
              >
              <input
                v-else
                v-model.number="airspaceGridForm.top"
                type="number"
                step="10"
                min="0"
                class="height-input"
                placeholder="输入值"
              >
              <select
                class="param-preset-select"
                @change="trueAltitudeMode ? onMaxAglPresetChange($event) : onTopPresetChange($event)"
              >
                <option value="">快选</option>
                <option v-for="h in heightPresetOptions" :key="`top-${h}`" :value="h">{{ h }}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="btn-row">
        <button
          class="btn-query"
          @click="submitAirspaceGridQuery"
          :disabled="loading || datasetLoading || (chartMode && !selectedDatasetIds.length) || (trueAltitudeMode && !airspaceGridForm.datasetId)"
        >
          <span>{{ loading ? '查询中...' : (chartMode ? '查询并展示航图要素' : (trueAltitudeMode ? '查询真高网格' : '查询')) }}</span>
        </button>
        <button v-if="loading" class="btn-cancel" @click="cancelManualQuery" type="button">
          <span>取消</span>
        </button>
        <button v-else class="btn-clear" @click="clearGrids" :disabled="!result">
          <span>清除网格</span>
        </button>
      </div>

      <!-- 错误提示 -->
      <div v-if="error" class="error-box">{{ error }}</div>

      <!-- 查询结果 -->
      <div v-if="queryStats" class="result-box">
        <div class="result-row">
          <span class="result-label">{{ queryStats.countExact ? (queryStats.complete ? '精确命中' : '精确命中（累计）') : (queryStats.lod ? 'LOD覆盖明细' : '原始命中') }}</span>
          <span class="result-num">{{ Number(queryStats.total).toLocaleString() }}</span>
        </div>
        <div v-if="queryStats.lod" class="result-row">
          <span class="result-label">显示网格</span>
          <span class="result-num">{{ Number(queryStats.displayed).toLocaleString() }}（{{ queryStats.mixedResolution ? queryStats.levels : `预生成 L${queryStats.renderLevel}` }}，权威层 L{{ queryStats.sourceLevel }}）</span>
        </div>
        <div v-if="queryStats.displayCoarsened" class="dataset-hint">显示节点已按父层级合并到预算内；区域保持完整概略覆盖，精确命中数仍按 L17 统计。</div>
        <div class="result-row">
          <span class="result-label">状态</span>
          <span class="result-status" :class="queryStats.status === 'success' ? 'success' : ''">
            {{ queryStats.status === 'success' ? '成功' : queryStats.status }}
          </span>
        </div>
        <!-- 动态缩放耗时 -->
        <div v-if="dynamicZoomEnabled && dynamicRuntime > 0" class="result-row runtime-row">
          <span class="result-label">缩放耗时</span>
          <span class="result-num runtime-num" :class="{ slow: dynamicRuntime > 1000 }">{{ dynamicRuntime }} ms</span>
        </div>
      </div>

      <div v-if="chartMode && chartSummary" class="chart-summary">
        <div class="chart-summary-title">航图要素</div>
        <div class="chart-summary-counts">
          <span>要素网格 <b>{{ chartSummary.grids }}</b></span>
          <span>二维要素 <b>{{ chartSummary.features2D }}</b></span>
          <span>三维要素 <b>{{ chartSummary.features3D }}</b></span>
        </div>
        <div v-if="chartSummary.datasets.length" class="theme-legend">
          <span v-for="dataset in chartSummary.datasets" :key="dataset.id">
            <i :style="{ background: dataset.color }" />{{ dataset.label }}
          </span>
        </div>
      </div>

      <!-- 动态缩放提示 -->
      <div v-if="dynamicZoomEnabled" class="dynamic-zoom-hint">
        <Loader2 v-if="dynamicLoading" :size="12" class="spin" />
        <span>{{ dynamicLoading ? '正在根据视图加载...' : (chartMode ? '移动/缩放地图即可刷新航图要素网格' : '移动/缩放地图即可自动刷新格网') }}</span>
      </div>

      <!-- 无数据 -->
      <div v-if="result?.data && queryStats?.total === 0" class="empty-box">
        该区域未查询到网格数据
      </div>
    </template>
  </div>
</template>

<style scoped>
.airspace-grid-query {
  padding: 0;
  width: 100%;
  box-sizing: border-box;
  position: relative;
}

/* 表单组 */
.form-group {
  margin-bottom: 12px;
}

.group-title {
  font-size: 15px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 8px;
}

.dataset-title-row,
.dataset-actions,
.dataset-option {
  display: flex;
  align-items: center;
}

.dataset-title-row {
  justify-content: space-between;
}

.dataset-title-row .group-title {
  margin-bottom: 0;
}

.dataset-actions {
  gap: 4px;
}

.dataset-actions button {
  padding: 2px 7px;
  border: 1px solid #bae6fd;
  border-radius: 4px;
  background: #f0f9ff;
  color: #0369a1;
  cursor: pointer;
}

.dataset-refresh {
  padding: 2px 7px;
  border: 1px solid #bae6fd;
  border-radius: 4px;
  background: #f0f9ff;
  color: #0369a1;
  cursor: pointer;
}

.dataset-refresh:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.dataset-error {
  margin-top: 8px;
  margin-bottom: 0;
}

.dataset-tree {
  height: clamp(240px, 36dvh, 380px);
  margin-top: 8px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
}

.tree-group > summary,
.tree-theme > summary {
  padding: 6px 8px;
  color: #1e3a5f;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}

.tree-theme > summary {
  padding-left: 20px;
  color: #475569;
  font-size: 12px;
  font-weight: 500;
}

.tree-group > summary input,
.tree-theme > summary input {
  margin: 0 6px 0 0;
}

.dataset-option {
  gap: 7px;
  padding: 6px 8px;
  color: #334155;
  font-size: 12px;
  cursor: pointer;
  padding-left: 42px;
}

.dataset-option:hover {
  background: #f8fafc;
}

.dataset-option i {
  width: 10px;
  height: 10px;
  flex: 0 0 10px;
  border-radius: 2px;
}

.dataset-option span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dataset-hint {
  margin-top: 5px;
  color: #64748b;
  font-size: 11px;
}

/* 层级选择 */
.level-row {
  display: flex;
  align-items: center;
}

.fixed-level {
  width: 100%;
  padding: 9px 10px;
  border: 1px solid #bae6fd;
  border-radius: 6px;
  background: #f0f9ff;
  color: #0369a1;
  font-size: 14px;
  box-sizing: border-box;
}

.level-select {
  flex: 1;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 14px;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}

.level-select:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
}

.airspace-id-input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 14px;
  box-sizing: border-box;
}

.airspace-id-input::placeholder {
  color: #999;
}

.airspace-id-input:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
}

/* 坐标网格 */
.coord-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.coord-line {
  display: flex;
  align-items: center;
  gap: 4px;
}

.coord-label {
  width: 22px;
  font-size: 14px;
  color: #334155;
  text-align: center;
  flex-shrink: 0;
}

.coord-line input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 14px;
}

.coord-line input::placeholder {
  color: #999;
}

.coord-line input:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
}

/* 高程参数 */
.height-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.param-input-combo {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.height-input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 14px;
  box-sizing: border-box;
}

.height-input:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
}

.height-input::placeholder {
  color: #999;
}

.param-preset-select {
  flex: 0 0 56px;
  height: 34px;
  padding: 0 6px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #f5f3f0;
  color: #475569;
  font-size: 13px;
  cursor: pointer;
  box-sizing: border-box;
}

.param-preset-select:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
}

/* 获取视图按钮 */
.btn-view {
  width: 100%;
  height: 36px;
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f5f3f0;
  color: #334155;
  font-size: 14px;
  cursor: pointer;
}

.btn-view:hover:not(:disabled) {
  background: #e8e8e8;
}

.btn-view:disabled {
  color: #999;
  cursor: not-allowed;
}

/* 动态缩放按钮 */
.btn-dynamic-zoom {
  width: 100%;
  height: 36px;
  margin-top: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f5f3f0;
  color: #334155;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-dynamic-zoom:hover:not(:disabled) {
  background: #e8f0fe;
  border-color: #7db8e0;
}

.btn-dynamic-zoom.active {
  background: linear-gradient(135deg, #7db8e0, #5b9fd4);
  border-color: #5b9fd4;
  color: #fff;
}

.btn-dynamic-zoom.active:hover {
  background: linear-gradient(135deg, #6aa8d4, #4a8fc4);
}

.btn-dynamic-zoom:disabled {
  color: #999;
  cursor: not-allowed;
}

/* 动态缩放耗时 */
.result-row.runtime-row {
  flex: 0 0 auto;
  min-width: 100px;
}

.runtime-num {
  font-variant-numeric: tabular-nums;
  color: #059669;
}

.runtime-num.slow {
  color: #dc2626;
}

/* 动态缩放提示 */
.dynamic-zoom-hint {
  margin-top: 8px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #5b9fd4;
  background: #eef6fc;
  border: 1px solid #cfe3f4;
  border-radius: 6px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 按钮行 */
.btn-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.btn-query {
  flex: 1;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: linear-gradient(135deg, #7db8e0, #5b9fd4);
  border: none;
  color: #fff;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
}

.btn-query:hover:not(:disabled) {
  background: linear-gradient(135deg, #6aa8d4, #4a8fc4);
}

.btn-query:disabled {
  background: #e2e8f0;
  color: #94a3b8;
  cursor: not-allowed;
}

.btn-clear {
  width: 88px;
  white-space: nowrap;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  color: #475569;
  font-size: 15px;
  cursor: pointer;
}

.btn-clear:hover:not(:disabled) {
  background: #e8e8e8;
}

.btn-clear:disabled {
  color: #999;
  cursor: not-allowed;
}

/* 取消按钮 */
.btn-cancel {
  width: 88px;
  white-space: nowrap;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #fca5a5;
  color: #dc2626;
  font-size: 15px;
  cursor: pointer;
}

.btn-cancel:hover {
  background: #fef2f2;
}

/* 错误提示 */
.error-box {
  padding: 10px 12px;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  background: #fef2f2;
  font-size: 14px;
  color: #dc2626;
  margin-bottom: 10px;
}

/* 结果区 */
.result-box {
  display: flex;
  gap: 8px;
}

.result-row {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid #ddd;
  background: #f9f9f9;
}

.result-label {
  font-size: 13px;
  color: #64748b;
}

.result-num {
  font-size: 18px;
  font-weight: 600;
  color: #334155;
}

.result-status {
  font-size: 15px;
  font-weight: 600;
  color: #c00;
}

.result-status.success {
  color: #060;
}

.chart-summary {
  margin-top: 10px;
  padding: 10px;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  background: #f0f9ff;
}

.chart-summary-title {
  margin-bottom: 8px;
  color: #0c4a6e;
  font-size: 14px;
  font-weight: 600;
}

.chart-summary-counts,
.theme-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  color: #475569;
  font-size: 12px;
}

.theme-legend {
  margin-top: 8px;
}

.theme-legend span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.theme-legend i {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

/* 空状态 */
.empty-box {
  padding: 16px;
  text-align: center;
  color: #64748b;
  font-size: 14px;
  border: 1px dashed #d4c9b8;
  border-radius: 8px;
}
</style>
