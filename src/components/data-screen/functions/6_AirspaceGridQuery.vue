<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ZoomIn, Loader2 } from 'lucide-vue-next'
import ChartDatasetTreeNode from './ChartDatasetTreeNode.vue'
import { errorMessage } from '../../../utils/http'
import { getGridVisualStyle } from '../../../utils/cesium/gridVisualStyle'
import {
  TRUE_ALTITUDE_QUERY_MODE,
  activeTrueAltitudeDatasets,
  buildTrueAltitudeRegionPayload,
  compactMixedDisplayCells,
  toAirspaceMapCells,
  trueAltitudeQueryOptions,
} from '../../../utils/trueAltitudeGrid'
import {
  GRID_ATTRIBUTE_TOPICS,
  gridAttributeLegend,
  noiseGridColor,
} from '../../../utils/noiseGrid'
import {
  LOD13_BUILDING_DATASET_ID,
  buildChartDatasetTree,
  chartFeatureColor,
  chartFeatureDimensionLabel,
  chartFeatureDimensionMode,
  chartFeatureLabel,
  chartThemeLabel,
  featuresByGrid,
  horizontalGridCode,
  loadAvailableChartDatasets,
  queryChartFeatures,
  queryChartSourcePages,
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
const trueAltitudeDatasetMode = computed(() => trueAltitudeMode.value || chartMode.value)

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
const selectedGridAttributeCode = ref('')
const selectedGridAttributeLegend = computed(() => gridAttributeLegend(selectedGridAttributeCode.value))
const gridAttributeTopicGroups = [
  { label: '噪声', topics: GRID_ATTRIBUTE_TOPICS.filter(item => item.kind === 'zone' || item.kind === 'margin') },
  { label: '电磁场强', topics: GRID_ATTRIBUTE_TOPICS.filter(item => item.kind === 'emf') },
  { label: '气象', topics: GRID_ATTRIBUTE_TOPICS.filter(item => item.kind === 'weather') },
  { label: '气象数据质量', topics: GRID_ATTRIBUTE_TOPICS.filter(item => item.kind === 'weather_quality') },
]
const attributeTopicMode = computed(() => chartMode.value && Boolean(selectedGridAttributeCode.value))
const trueAltitudeQueryMode = computed(() => trueAltitudeMode.value || attributeTopicMode.value)
const trueAltitudeResolutionMode = ref(TRUE_ALTITUDE_QUERY_MODE.LOD)
const trueAltitudeLodEnabled = computed(
  () => trueAltitudeResolutionMode.value === TRUE_ALTITUDE_QUERY_MODE.LOD,
)
// 试验开关默认关闭；整个分页查询固定一次选择，避免中途改变算法。
const experimentalMixedResolution = ref(false)
const gridsData = ref([])
const chartSummary = ref(null)
const chartDatasets = ref([])
const chartDatasetLoading = ref(false)
const chartDatasetError = ref('')
const chartDatasetTree = computed(() => buildChartDatasetTree(chartDatasets.value))
const selectedDatasetIds = ref([])
let chartDatasetRequest = null
let totalCount = 0

function selectAllDatasets() {
  selectedDatasetIds.value = chartDatasets.value.map(dataset => dataset.id)
}

function clearDatasetSelection() {
  selectedDatasetIds.value = []
}

function setDatasetIdsSelected(ids, checked) {
  const selected = new Set(selectedDatasetIds.value)
  ids.forEach(id => checked ? selected.add(id) : selected.delete(id))
  selectedDatasetIds.value = chartDatasets.value.filter(dataset => selected.has(dataset.id)).map(dataset => dataset.id)
}

async function loadChartDatasets() {
  if (!chartMode.value) return
  chartDatasetRequest?.abort()
  const controller = new AbortController()
  chartDatasetRequest = controller
  chartDatasetLoading.value = true
  chartDatasetError.value = ''
  try {
    const datasets = await loadAvailableChartDatasets({ signal: controller.signal })
    if (controller.signal.aborted) return
    const availableIds = new Set(datasets.map(dataset => dataset.id))
    const retainedIds = selectedDatasetIds.value.filter(id => availableIds.has(id))
    chartDatasets.value = datasets
    selectedDatasetIds.value = retainedIds.length
      ? retainedIds
      : datasets.slice(0, 4).map(dataset => dataset.id)
    if (datasets.length === 0) chartDatasetError.value = '当前没有已激活且可查询的航图要素'
  } catch (err) {
    if (err?.name === 'AbortError') return
    chartDatasets.value = []
    selectedDatasetIds.value = []
    chartDatasetError.value = err?.message || '航图要素列表加载失败'
  } finally {
    if (chartDatasetRequest === controller) {
      chartDatasetLoading.value = false
      chartDatasetRequest = null
    }
  }
}

watch(chartMode, (active) => {
  if (!active) {
    selectedGridAttributeCode.value = ''
    chartDatasetRequest?.abort()
    return
  }
  airspaceGridForm.level = 17
  loadChartDatasets()
}, { immediate: true })

const selectedTrueAltitudeDataset = computed(() =>
  trueAltitudeDatasets.value.find(dataset => dataset.datasetId === airspaceGridForm.datasetId) || null,
)

function applyTrueAltitudeDataset(dataset) {
  if (!dataset) return
  // 数据集层级只作为默认值；航图模式允许用户按实际 Feature 层级调整。
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
    const datasets = Array.isArray(body?.data?.datasets)
      ? body.data.datasets
      : (Array.isArray(body?.datasets) ? body.datasets : [])
    trueAltitudeDatasets.value = activeTrueAltitudeDatasets(body)
    const hasSelectedDataset = trueAltitudeDatasets.value.some(
      dataset => dataset.datasetId === airspaceGridForm.datasetId,
    )
    if (!hasSelectedDataset && (!chartMode.value || !airspaceGridForm.datasetId)) {
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

watch(selectedGridAttributeCode, code => {
  if (code) experimentalMixedResolution.value = false
})

watch(trueAltitudeResolutionMode, mode => {
  if (mode !== TRUE_ALTITUDE_QUERY_MODE.LOD) experimentalMixedResolution.value = false
})

watch(trueAltitudeDatasetMode, (active) => {
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
    `<li>${escapeHtml(chartFeatureLabel(feature))}（${escapeHtml(chartFeatureDimensionLabel(feature))}）</li>`,
  ).join('')
  return `<b>航图要素网格</b><br>编码：${escapeHtml(cell.code)}<br>` +
    `高度：${cell.bounds.bottom.toFixed(2)}–${cell.bounds.top.toFixed(2)} m<br>` +
    `主题：${escapeHtml(themes.map(chartThemeLabel).join('、'))}<br>关联要素：${features.length}<ul>${rows}</ul>`
}

async function buildDisplayedCells(rawGrids, signal, { updateSummary = true, renderOnly = false } = {}) {
  const cells = toMapCells(rawGrids)
  if (updateSummary) chartSummary.value = null
  if (!chartMode.value || cells.length === 0) return cells

  // 批量渲染只保留实例化绘制所需的边界和颜色。完整要素属性在点击网格时再查询，
  // 避免为数十万个格元构造 description、features 和 chartFeatures 对象。
  if (renderOnly) {
    return cells.flatMap(cell => {
      const features = cell.features || []
      if (features.length === 0) return []
      const primaryFeature = features.find(feature => feature.dimensionMode === '3D') || features[0]
      const chartSourceMask = features.reduce((mask, feature) => (
        mask | (feature.datasetId === LOD13_BUILDING_DATASET_ID ? 2 : 1)
      ), 0)
      return [{
        code: cell.code,
        level: cell.level,
        x: cell.x,
        y: cell.y,
        z: cell.z,
        bounds: cell.bounds,
        gridType: cell.gridType,
        chartSourceMask,
        color: chartFeatureColor(primaryFeature),
      }]
    })
  }

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
      dimensionMode: chartFeatureDimensionMode(feature),
    }))
    const primaryFeature = features.find(feature => feature.dimensionMode === '3D') || features[0]
    const chartFeatures = [...new Map(features.map(feature => {
      const type = feature.datasetId || feature.featureType
      return [type, {
        type,
        label: chartFeatureLabel(feature),
        theme: feature.theme,
        color: chartFeatureColor(feature),
        dimensionMode: chartFeatureDimensionMode(feature),
        verticalMode: feature.verticalMode,
      }]
    })).values()]
    return [{
      ...cell,
      color: chartFeatureColor(primaryFeature),
      description: featureDescription(cell, features),
      features,
      chartFeatures,
    }]
  })
  const summary = {
    grids: displayed.length,
    features2D: uniqueFeatureCount(features2D),
    features3D: uniqueFeatureCount(features3D),
    datasets: [...datasets.values()],
  }
  if (updateSummary) chartSummary.value = summary
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

async function queryAndRenderChartPages(basePayload, controller, options = {}) {
  const startedAt = performance.now()
  const renderedCodes = new Set()
  const feature2DIds = new Set()
  const feature3DIds = new Set()
  const datasets = new Map()
  let pageCount = 0
  let rendered = 0
  let mappings = 0
  let lod13Grids = 0
  let lastData = null

  // 立即清除上一次查询结果；后续页面即使因高度过滤暂时为空，也不会残留旧网格。
  emit('showGrid', {
    cells: [],
    level: Number(basePayload.level),
    runtime: 0,
    skipFlyTo: true,
  })

  await queryChartSourcePages(basePayload, {
    signal: controller.signal,
    onPage: async (page) => {
      if (controller.signal.aborted) return
      const rawCells = (page?.data?.cells || []).filter(cell => {
        if (renderedCodes.has(cell.code)) return false
        renderedCodes.add(cell.code)
        return true
      })
      const cells = await buildDisplayedCells(rawCells, controller.signal, {
        updateSummary: false,
        renderOnly: true,
      })
      cells.forEach((cell) => {
        cell.datasetId ??= page?.data?.datasetId || basePayload.datasetId
        cell.datasetVersion ??= page?.data?.datasetVersion
      })
      const pageFeatures = rawCells.flatMap(cell => cell.features || [])
      for (const feature of pageFeatures) {
        const id = `${feature.datasetId || ''}\u0000${feature.featureUid || ''}`
        if (feature.dimensionMode === '3D') feature3DIds.add(id)
        else feature2DIds.add(id)
        const dataset = datasets.get(feature.datasetId) || {
          id: feature.datasetId,
          label: chartFeatureLabel(feature),
          color: chartFeatureColor(feature),
          dimensionMode: chartFeatureDimensionMode(feature),
          count: 0,
        }
        dataset.count += 1
        datasets.set(feature.datasetId, dataset)
      }
      mappings += pageFeatures.length
      lod13Grids += Number(page?.data?.lod13Count) || 0
      rendered += cells.length
      lastData = page
      result.value = page
      totalCount = rendered
      queryStats.value = {
        total: rendered,
        rendered,
        pages: pageCount + 1,
        complete: page?.data?.hasMore !== true,
        status: 'loading',
      }
      chartSummary.value = {
        grids: rendered,
        features2D: feature2DIds.size,
        features3D: feature3DIds.size,
        datasets: [...datasets.values()],
        baseDatasetId: page?.data?.datasetId || basePayload.datasetId,
        baseDatasetVersion: page?.data?.datasetVersion,
        mappings,
        lod13Grids,
        truncated: false,
      }

      if (cells.length > 0) {
        const visualStyle = getGridVisualStyle(rendered, false)
        emit('showGrid', {
          cells,
          level: Number(basePayload.level),
          runtime: performance.now() - startedAt,
          renderer: 'instanced',
          fillAlpha: visualStyle.fillAlpha,
          outlineAlpha: visualStyle.outlineAlpha,
          distanceFadeMinAlpha: visualStyle.distanceFadeMinAlpha,
          detailBeginPx: visualStyle.detailBeginPx,
          detailEndPx: visualStyle.detailEndPx,
          minorFarAlpha: visualStyle.minorFarAlpha,
          minorNearAlpha: visualStyle.minorNearAlpha,
          primaryFarAlpha: visualStyle.primaryFarAlpha,
          primaryNearAlpha: visualStyle.primaryNearAlpha,
          primaryStep: visualStyle.primaryStep,
          farBrightness: visualStyle.farBrightness,
          denseOutline: rendered >= 3000,
          chartLayers: [...datasets.values()].map(dataset => ({
            ...dataset,
            type: dataset.id,
            enabled: true,
          })),
          append: pageCount > 0,
          skipFlyTo: options.skipFlyTo === true || pageCount > 0,
        })
      }
      pageCount += 1
      await new Promise(resolve => setTimeout(resolve, 0))
    },
  })

  if (pageCount === 0) {
    emit('showGrid', {
      cells: [],
      level: Number(basePayload.level),
      runtime: performance.now() - startedAt,
      skipFlyTo: options.skipFlyTo === true,
    })
  }
  if (!controller.signal.aborted && queryStats.value) {
    queryStats.value = { ...queryStats.value, complete: true, status: 'success' }
  }
  gridsData.value = []
  return {
    data: lastData,
    total: rendered,
    displayed: rendered,
    runtime: performance.now() - startedAt,
    pageCount,
  }
}

async function queryAndRenderTrueAltitudePages(basePayload, controller, options = {}) {
  let cursor
  let pageIndex = 0
  let total = 0
  let displayed = 0
  let mixedDisplayCells = []
  let displayCoarsened = false
  let lastData = null
  let datasetVersion = basePayload.datasetVersion
  const attributeCode = attributeTopicMode.value ? selectedGridAttributeCode.value : ''
  const requestedLod = basePayload.renderTargetCells != null
  const mixed = !attributeCode && basePayload.experimentalMixedResolution === true
  const levels = new Set()
  const startedAt = performance.now()

  do {
    const payload = buildTrueAltitudeRegionPayload({
      ...basePayload,
      datasetVersion,
      pageSize: TRUE_ALTITUDE_PAGE_SIZE,
      renderTargetCells: basePayload.renderTargetCells,
      attributeCode,
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
    const pageCells = toMapCells(rawCells).map(cell => attributeCode ? {
      ...cell,
      color: noiseGridColor(attributeCode, cell.attributeValue),
      attributeGrid: true,
    } : cell)
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
      rendered: displayed,
      pages: pageIndex + 1,
      sourceLevel: data?.data?.sourceLevel,
      renderLevel: data?.data?.renderLevel,
      lod: data?.data?.lod === true,
      requestedLod,
      mixedResolution: data?.data?.mixedResolution === true,
      countExact: data?.data?.countExact === true,
      levels: [...levels].sort((a, b) => a - b).map(level => `L${level}`).join(' / '),
      displayCoarsened,
      complete: data?.data?.hasMore !== true,
      status: data?.success === true ? 'success' : (data?.status || 'unknown'),
      attributeCode: data?.data?.attributeCode,
    }

    if (cells.length > 0) {
      const visualStyle = getGridVisualStyle(displayed, data?.data?.lod === true)
      emit('showGrid', {
        cells,
        level: Number(data?.data?.renderLevel ?? basePayload.level),
        runtime,
        renderer: 'instanced',
        fillAlpha: visualStyle.fillAlpha,
        outlineAlpha: visualStyle.outlineAlpha,
        distanceFadeMinAlpha: visualStyle.distanceFadeMinAlpha,
        detailBeginPx: visualStyle.detailBeginPx,
        detailEndPx: visualStyle.detailEndPx,
        minorFarAlpha: visualStyle.minorFarAlpha,
        minorNearAlpha: visualStyle.minorNearAlpha,
        primaryFarAlpha: visualStyle.primaryFarAlpha,
        primaryNearAlpha: visualStyle.primaryNearAlpha,
        primaryStep: visualStyle.primaryStep,
        farBrightness: visualStyle.farBrightness,
        denseOutline: displayed >= 3000,
        enablePicking: Boolean(attributeCode),
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
  return {
    data: lastData,
    total,
    displayed,
    rendered: queryStats.value?.rendered ?? displayed,
    runtime: performance.now() - startedAt,
  }
}

/**
 * 核心：视图边界变化时（由 CesiumMap 400ms debounce 后触发）
 * 只在 dynamicZoomEnabled=true 时自动查询
 * 使用用户手动设置的 level，不做自动映射（避免用户设 level=10 被覆盖成 17）
 */
async function onViewBoundsChanged(bounds) {
  if (!dynamicZoomEnabled.value) return
  if (!bounds) return
  if (chartMode.value && !attributeTopicMode.value && selectedDatasetIds.value.length === 0) return
  if (trueAltitudeDatasetMode.value && !airspaceGridForm.datasetId) return

  // 1. 取消上一次未完成的请求（避免旧响应覆盖新响应）
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  const controller = new AbortController()
  abortController = controller

  // 2. 使用用户手动设置的层级（不做自动映射，尊重用户选择）
  const queryLevel = Number(airspaceGridForm.level)

  dynamicLoading.value = true
  error.value = ''
  queryStats.value = { total: 0, rendered: 0, pages: 0, complete: false, status: 'loading' }

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

    // 航图单页保留资源保护阈值；查询层通过网格编码游标继续加载并逐页渲染全部结果。
    const payload = trueAltitudeQueryMode.value ? buildTrueAltitudeRegionPayload({
      datasetId: airspaceGridForm.datasetId,
      polygon,
      minAgl: Number(airspaceGridForm.minAgl),
      maxAgl: Number(airspaceGridForm.maxAgl),
      level: queryLevel,
      attributeCode: attributeTopicMode.value ? selectedGridAttributeCode.value : '',
      ...(trueAltitudeMode.value ? trueAltitudeQueryOptions(trueAltitudeResolutionMode.value, {
        renderTargetCells: TRUE_ALTITUDE_RENDER_TARGET,
        experimentalMixedResolution: experimentalMixedResolution.value,
      }) : {}),
    }) : {
      ...(chartMode.value
        ? { datasetId: airspaceGridForm.datasetId }
        : { airspaceId: airspaceGridForm.airspaceId.trim() }),
      polygon,
      bottom: chartMode.value ? Math.max(Number(airspaceGridForm.bottom) || 0, 0) : (Number(airspaceGridForm.bottom) || 0),
      top: Number(airspaceGridForm.top) || 600,
      level: queryLevel,
      maxCells: chartMode.value ? 50000 : 200000,
      query_concurrency: 4,
      ...(chartMode.value ? {
        datasetIds: selectedDatasetIds.value,
        maxMappings: 50000,
        renderOnly: true,
        exactLevelOnly: queryLevel === 17,
      } : {}),
    }

    if (trueAltitudeQueryMode.value) {
      if (attributeTopicMode.value) chartSummary.value = null
      const pagedResult = await queryAndRenderTrueAltitudePages(payload, controller, { skipFlyTo: true })
      if (!pagedResult || controller.signal.aborted) return
      dynamicRuntime.value = pagedResult.runtime
      if (pagedResult.total === 0) queryStats.value = { total: 0, status: 'empty' }
      return
    }
    if (chartMode.value) {
      const pagedResult = await queryAndRenderChartPages(payload, controller, { skipFlyTo: true })
      if (!pagedResult || controller.signal.aborted) return
      dynamicRuntime.value = pagedResult.runtime
      if (pagedResult.total === 0) queryStats.value = { total: 0, status: 'empty' }
      return
    }

    const t0 = performance.now()
    const data = await (async () => {
          const endpoint = trueAltitudeQueryMode.value
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
      if (chartMode.value) {
        chartSummary.value = {
          ...chartSummary.value,
          baseDatasetId: data?.data?.datasetId || airspaceGridForm.datasetId,
          baseDatasetVersion: data?.data?.datasetVersion,
          mappings: Number(data?.data?.mappingCount) || 0,
          lod13Grids: Number(data?.data?.lod13Count) || 0,
          truncated: data?.data?.truncated === true,
        }
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
  if (!dynamicZoomEnabled.value && chartMode.value && !attributeTopicMode.value && selectedDatasetIds.value.length === 0) {
    error.value = '请至少勾选一种航图要素'
    return
  }
  if (!dynamicZoomEnabled.value && trueAltitudeDatasetMode.value && !airspaceGridForm.datasetId) {
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
  if (chartMode.value && (Number(airspaceGridForm.level) < 1 || Number(airspaceGridForm.level) > 21)) {
    error.value = '航图查询层级必须在 1–21 之间'
    return
  }

  // 验证边界参数
  if (airspaceGridForm.minLon === null || airspaceGridForm.maxLon === null ||
      airspaceGridForm.minLat === null || airspaceGridForm.maxLat === null) {
    error.value = '请先在地图上框选查询区域，或手动输入边界参数'
    return
  }

  if (trueAltitudeDatasetMode.value && !airspaceGridForm.datasetId) {
    error.value = '请选择已激活的真高数据集'
    return
  }
  // 只有旧版普通空域查询继续使用 airspaceId。
  if (!trueAltitudeDatasetMode.value && (!airspaceGridForm.airspaceId || airspaceGridForm.airspaceId.trim() === '')) {
    error.value = '请输入空域ID'
    return
  }
  if (chartMode.value && !attributeTopicMode.value && selectedDatasetIds.value.length === 0) {
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
  if (trueAltitudeQueryMode.value) {
    const minAgl = Number(airspaceGridForm.minAgl)
    const maxAgl = Number(airspaceGridForm.maxAgl)
    if (!Number.isFinite(minAgl) || !Number.isFinite(maxAgl) || minAgl < 0 || maxAgl < minAgl) {
      error.value = '真高范围必须满足 0 ≤ 最低真高 ≤ 最高真高'
      return
    }
  } else {
    const bottom = Number(airspaceGridForm.bottom)
    const top = Number(airspaceGridForm.top)
    if (!Number.isFinite(bottom) || !Number.isFinite(top) || bottom > top) {
      error.value = '海拔范围必须满足最低高度 ≤ 最高高度'
      return
    }
  }

  // 估算格网数量，超过阈值时预警
  const queryLevel = Number(airspaceGridForm.level)
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
  queryStats.value = { total: 0, rendered: 0, pages: 0, complete: false, status: 'loading' }

  try {
    // 构建 polygon：顺时针闭合多边形顶点数组 [lon, lat]
    const polygon = [
      [minLon, minLat],
      [maxLon, minLat],
      [maxLon, maxLat],
      [minLon, maxLat],
      [minLon, minLat],
    ]

    // 航图单批次保留保护阈值；达到阈值后由查询层自动空间分批并合并全部结果。
    const payload = trueAltitudeQueryMode.value ? buildTrueAltitudeRegionPayload({
      datasetId: airspaceGridForm.datasetId,
      polygon: polygon,
      minAgl: Number(airspaceGridForm.minAgl),
      maxAgl: Number(airspaceGridForm.maxAgl),
      level: queryLevel,
      attributeCode: attributeTopicMode.value ? selectedGridAttributeCode.value : '',
      ...(trueAltitudeMode.value ? trueAltitudeQueryOptions(trueAltitudeResolutionMode.value, {
        renderTargetCells: TRUE_ALTITUDE_RENDER_TARGET,
        experimentalMixedResolution: experimentalMixedResolution.value,
      }) : {}),
    }) : {
      ...(chartMode.value
        ? { datasetId: airspaceGridForm.datasetId }
        : { airspaceId: airspaceGridForm.airspaceId.trim() }),
      polygon: polygon,
      bottom: chartMode.value ? Math.max(Number(airspaceGridForm.bottom) || 0, 0) : (Number(airspaceGridForm.bottom) || 0),
      top: Number(airspaceGridForm.top) || 600,
      level: queryLevel,
      maxCells: chartMode.value ? 50000 : 200000,
      query_concurrency: 4,
      ...(chartMode.value ? {
        datasetIds: selectedDatasetIds.value,
        maxMappings: 50000,
        renderOnly: true,
        exactLevelOnly: queryLevel === 17,
      } : {}),
    }

    console.log('[空域网格查询] 发送 payload:', payload, `预估格网约 ${estimatedCells} 个`)

    // 创建 AbortController 支持取消
    const controller = new AbortController()
    manualAbortController = controller

    // 航图大区域返回量较大，给聚合查询更充足的响应时间。
    manualTimedOut = false
    // 航图采用可取消的游标分页；不再用固定总时限截断完整加载。
    const timeoutMs = (trueAltitudeMode.value || chartMode.value) ? 0 : 60000
    const timeoutSeconds = timeoutMs / 1000
    if (timeoutMs > 0) {
      manualTimeoutId = setTimeout(() => {
        manualTimedOut = true
        controller.abort()
        console.warn(`[空域网格查询] 请求超时（${timeoutSeconds}s），已取消前端等待`)
      }, timeoutMs)
    }

    if (trueAltitudeQueryMode.value) {
      if (attributeTopicMode.value) chartSummary.value = null
      const pagedResult = await queryAndRenderTrueAltitudePages(payload, controller)
      if (!pagedResult || controller.signal.aborted) return
      if (pagedResult.total === 0) {
        error.value = attributeTopicMode.value ? '未查询到专题属性网格数据' : '未查询到空域网格数据'
        queryStats.value = { total: 0, status: 'empty' }
      }
      return
    }
    if (chartMode.value) {
      const pagedResult = await queryAndRenderChartPages(payload, controller)
      if (!pagedResult || controller.signal.aborted) return
      if (pagedResult.total === 0) {
        error.value = '未查询到航图网格数据'
        queryStats.value = { total: 0, status: 'empty' }
      }
      return
    }

    const t0 = performance.now()
    const data = await (async () => {
          const endpoint = trueAltitudeQueryMode.value
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
        datasetId: data?.data?.datasetId,
        datasetVersion: data?.data?.datasetVersion,
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
      if (chartMode.value) {
        chartSummary.value = {
          ...chartSummary.value,
          baseDatasetId: data?.data?.datasetId || airspaceGridForm.datasetId,
          baseDatasetVersion: data?.data?.datasetVersion,
          mappings: Number(data?.data?.mappingCount) || 0,
          lod13Grids: Number(data?.data?.lod13Count) || 0,
          truncated: data?.data?.truncated === true,
        }
      }

      console.log('[空域网格查询] 转换后的 cells 前3条:', JSON.stringify(cells.slice(0, 3)))
      emit('showGrid', { cells, level: queryLevel, runtime })
    }
  } catch (err) {
    if (err?.name === 'AbortError') {
      error.value = manualTimedOut
        ? `请求超时（${timeoutSeconds}s），请缩小查询区域或收紧专题条件后重试`
        : '查询已取消'
      console.warn('[空域网格查询] 请求被中止:', manualTimedOut ? '超时' : '用户取消')
      queryStats.value = {
        ...(queryStats.value || { total: 0 }),
        complete: true,
        status: manualTimedOut ? 'timeout' : 'cancelled',
      }
    } else {
      console.error('[空域网格查询] 请求错误:', err)
      error.value = err?.message || '请求失败，请稍后重试'
      queryStats.value = {
        ...(queryStats.value || { total: 0 }),
        complete: true,
        status: 'error',
      }
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
          <div v-if="trueAltitudeMode || chartMode" class="fixed-level">
            {{ chartMode ? 'Level 17（航图统一层级）' : (selectedTrueAltitudeDataset ? `Level ${airspaceGridForm.level}（活动版本固定层级）` : '请先选择数据集') }}
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
      <div v-if="trueAltitudeDatasetMode" class="form-group">
        <div class="dataset-title-row">
          <div class="group-title">{{ chartMode ? '真高空域基底' : '真高数据集' }}</div>
          <button type="button" class="dataset-refresh" :disabled="datasetLoading" @click="loadTrueAltitudeDatasets">
            {{ datasetLoading ? '加载中...' : '刷新' }}
          </button>
        </div>
        <input
          v-if="chartMode"
          v-model.trim="airspaceGridForm.datasetId"
          list="true-altitude-dataset-options"
          type="text"
          class="airspace-id-input"
          placeholder="选择或输入真高空域 datasetId"
        >
        <datalist v-if="chartMode" id="true-altitude-dataset-options">
          <option v-for="dataset in trueAltitudeDatasets" :key="dataset.datasetId" :value="dataset.datasetId">
            v{{ dataset.activeVersion }} · L{{ dataset.activeLevel }}
          </option>
        </datalist>
        <select v-else v-model="airspaceGridForm.datasetId" class="level-select" :disabled="datasetLoading">
          <option value="" disabled>{{ datasetLoading ? '正在加载数据集' : '选择已激活数据集' }}</option>
          <option v-for="dataset in trueAltitudeDatasets" :key="dataset.datasetId" :value="dataset.datasetId">
            {{ dataset.datasetId }} · v{{ dataset.activeVersion }} · L{{ dataset.activeLevel }}
          </option>
        </select>
        <div v-if="selectedTrueAltitudeDataset" class="dataset-hint">
          活动版本 v{{ selectedTrueAltitudeDataset.activeVersion }}；权威层 L{{ selectedTrueAltitudeDataset.activeLevel }}；可用真高
          {{ selectedTrueAltitudeDataset.minAgl ?? 0 }}–{{ selectedTrueAltitudeDataset.maxAgl ?? '—' }} m
        </div>
        <template v-if="trueAltitudeMode">
          <div class="dataset-title-row attribute-layer-row">
            <div class="group-title">查询精度</div>
          </div>
          <select
            v-model="trueAltitudeResolutionMode"
            class="level-select"
            :disabled="loading || dynamicZoomEnabled"
          >
            <option :value="TRUE_ALTITUDE_QUERY_MODE.LOD">LOD 查询（大范围自动降级）</option>
            <option :value="TRUE_ALTITUDE_QUERY_MODE.HIGHEST_RESOLUTION">最高精度直查（原始权威层）</option>
          </select>
          <div class="dataset-hint">
            <template v-if="trueAltitudeLodEnabled">
              按 100,000 个显示节点预算选择预生成层级；小范围无需降级时仍返回权威层。
            </template>
            <template v-else>
              固定查询权威层 L{{ selectedTrueAltitudeDataset?.activeLevel ?? airspaceGridForm.level }}，逐页显示全部原始格元，不使用 LOD；大范围查询可能显著增加耗时和显存占用。
            </template>
          </div>
        </template>
        <div v-if="datasetError" class="error-box dataset-error">{{ datasetError }}</div>
        <div v-if="chartMode && !trueAltitudeDatasets.length" class="dataset-hint">
          未加载到数据集清单时仍可手动输入 datasetId。
        </div>
        <template v-if="chartMode">
          <div class="dataset-title-row attribute-layer-row">
            <div class="group-title">查询内容</div>
          </div>
          <select v-model="selectedGridAttributeCode" class="level-select" :disabled="loading || dynamicZoomEnabled">
            <option value="">航图实体要素</option>
            <optgroup v-for="group in gridAttributeTopicGroups" :key="group.label" :label="group.label">
              <option
                v-for="attribute in group.topics"
                :key="attribute.code"
                :value="attribute.code"
                :disabled="attribute.disabled === true"
              >
                {{ attribute.label }}
              </option>
            </optgroup>
          </select>
          <div v-if="selectedGridAttributeCode" class="noise-legend">
            <template v-if="selectedGridAttributeLegend.length">
              <span v-for="band in selectedGridAttributeLegend" :key="band.label"><i :style="{ background: band.color }" />{{ band.label }}</span>
            </template>
            <template v-else-if="selectedGridAttributeCode.includes('_zone_')">
              <span><i style="background:#ef4444" />不满足（0）</span>
              <span><i style="background:#f59e0b" />满足（1）</span>
              <span><i style="background:#22c55e" />优秀（2）</span>
            </template>
            <template v-else-if="selectedGridAttributeCode.includes('_margin_')">
              <span><i style="background:#ef4444" />超标 &gt; 0</span>
              <span><i style="background:#f59e0b" />0 ～ -5</span>
              <span><i style="background:#84cc16" />-5 ～ -10</span>
              <span><i style="background:#16a34a" />≤ -10 dB(A)</span>
            </template>
            <template v-else>
              <span><i style="background:#64748b" />&lt;120</span>
              <span><i style="background:#3b82f6" />120–124</span>
              <span><i style="background:#06b6d4" />124–128</span>
              <span><i style="background:#22c55e" />128–132</span>
              <span><i style="background:#facc15" />132–136</span>
              <span><i style="background:#f97316" />136–140</span>
              <span><i style="background:#dc2626" />≥140 dBμV/m</span>
            </template>
          </div>
          <div v-if="selectedGridAttributeCode" class="dataset-hint">
            专题属性按原始 L17 网格查询并逐页渲染，不使用粗层 LOD 聚合。
          </div>
          <div v-if="GRID_ATTRIBUTE_TOPICS.find(item => item.code === selectedGridAttributeCode)?.kind === 'emf'" class="dataset-hint">
            颜色仅表示电磁场强数值，不代表通信服务质量、导航定位精度或监视探测能力。
            请先完成对应属性的入库和激活；无结果时请核对场数据目录、空域绑定及查询范围。
          </div>
        </template>
        <label v-if="trueAltitudeMode && trueAltitudeLodEnabled" class="dataset-hint">
          <input v-model="experimentalMixedResolution" type="checkbox" :disabled="loading || dynamicZoomEnabled || Boolean(selectedGridAttributeCode)" />
          混合多粒度网格（试验，默认关闭）
        </label>
        <div v-if="trueAltitudeMode && trueAltitudeLodEnabled && experimentalMixedResolution" class="dataset-hint">
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

      <div v-if="chartMode && !attributeTopicMode" class="form-group">
        <div class="dataset-title-row">
          <div class="group-title">查询要素（已选 {{ selectedDatasetIds.length }}）</div>
          <div class="dataset-actions">
            <button type="button" :disabled="chartDatasetLoading" @click="loadChartDatasets">刷新</button>
            <button type="button" :disabled="chartDatasetLoading || !chartDatasets.length" @click="selectAllDatasets">全选</button>
            <button type="button" :disabled="chartDatasetLoading || !selectedDatasetIds.length" @click="clearDatasetSelection">清空</button>
          </div>
        </div>
        <div v-if="chartDatasetLoading" class="dataset-hint">正在读取当前活动要素…</div>
        <div v-else-if="chartDatasetError" class="dataset-hint dataset-error">{{ chartDatasetError }}</div>
        <div v-else class="dataset-tree">
          <ChartDatasetTreeNode
            v-for="node in chartDatasetTree"
            :key="node.id"
            :node="node"
            :selected-dataset-ids="selectedDatasetIds"
            @toggle="setDatasetIdsSelected"
          />
        </div>
        <div class="dataset-hint">列表来自当前活动 Dataset；仅显示已有 Feature 且存在网格映射的数据，并只查询已勾选项。</div>
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
        <div class="group-title">{{ trueAltitudeQueryMode ? '真高范围（AGL）' : (chartMode ? '海拔范围（MSL）' : '高程参数') }}</div>
        <div class="height-grid">
          <div class="coord-line">
            <span class="coord-label">{{ trueAltitudeQueryMode ? '最低' : '底' }}</span>
            <div class="param-input-combo">
              <input
                v-if="trueAltitudeQueryMode"
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
                @change="trueAltitudeQueryMode ? onMinAglPresetChange($event) : onBottomPresetChange($event)"
              >
                <option value="">快选</option>
                <option v-for="h in heightPresetOptions" :key="`bottom-${h}`" :value="h">{{ h }}</option>
              </select>
            </div>
          </div>
          <div class="coord-line">
            <span class="coord-label">{{ trueAltitudeQueryMode ? '最高' : '顶' }}</span>
            <div class="param-input-combo">
              <input
                v-if="trueAltitudeQueryMode"
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
                @change="trueAltitudeQueryMode ? onMaxAglPresetChange($event) : onTopPresetChange($event)"
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
          :disabled="loading || datasetLoading || (chartMode && !attributeTopicMode && !selectedDatasetIds.length) || (trueAltitudeDatasetMode && !airspaceGridForm.datasetId)"
        >
          <span>{{ loading ? '查询中...' : (attributeTopicMode ? '查询并展示专题属性' : (chartMode ? '查询并展示航图要素' : (trueAltitudeMode ? '查询真高网格' : '查询'))) }}</span>
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
          <span class="result-label">{{ queryStats.countExact ? (queryStats.complete ? '精确命中' : '累计命中') : (queryStats.lod ? 'LOD 覆盖' : '原始命中') }}</span>
          <span class="result-num">{{ Number(queryStats.total).toLocaleString() }}</span>
        </div>
        <div v-if="queryStats.lod" class="result-row">
          <span class="result-label">显示节点</span>
          <span class="result-num">{{ Number(queryStats.displayed).toLocaleString() }}</span>
        </div>
        <div v-if="queryStats.lod" class="result-meta">{{ queryStats.mixedResolution ? queryStats.levels : `预生成 L${queryStats.renderLevel}` }} · 权威层 L{{ queryStats.sourceLevel }}</div>
        <div v-if="trueAltitudeMode && queryStats.status !== 'loading'" class="result-meta">
          查询精度：{{ queryStats.requestedLod ? (queryStats.lod ? 'LOD' : 'LOD（本次使用最高精度）') : '最高精度直查' }}
        </div>
        <div v-if="queryStats.displayCoarsened" class="dataset-hint">显示节点已按父层级合并到预算内；区域保持完整概略覆盖，精确命中数仍按 L17 统计。</div>
        <div class="result-row">
          <span class="result-label">状态</span>
          <span
            class="result-status"
            :class="{
              success: !loading && !dynamicLoading && queryStats.status === 'success',
              querying: loading || dynamicLoading || queryStats.status === 'loading',
            }"
          >
            {{
              loading || dynamicLoading || queryStats.status === 'loading'
                ? `查询中${queryStats.pages ? `（已加载 ${queryStats.pages} 页）` : '…'}`
                : queryStats.status === 'success'
                  ? '已完成'
                  : queryStats.status === 'empty'
                    ? '已完成（无结果）'
                    : queryStats.status === 'cancelled'
                      ? '已取消'
                      : queryStats.status === 'timeout'
                        ? '已超时'
                        : queryStats.status === 'error'
                          ? '查询失败'
                          : queryStats.status
            }}
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
        <div v-if="chartSummary.baseDatasetId" class="result-meta">
          真高基底 {{ chartSummary.baseDatasetId }}<span v-if="chartSummary.baseDatasetVersion != null"> · v{{ chartSummary.baseDatasetVersion }}</span>
        </div>
        <div class="chart-summary-counts">
          <span>要素网格 <b>{{ chartSummary.grids }}</b></span>
          <span>二维要素 <b>{{ chartSummary.features2D }}</b></span>
          <span>三维要素 <b>{{ chartSummary.features3D }}</b></span>
          <span v-if="chartSummary.lod13Grids">LOD1.3网格 <b>{{ chartSummary.lod13Grids }}</b></span>
          <span>关联映射 <b>{{ chartSummary.mappings }}</b></span>
        </div>
        <div v-if="chartSummary.truncated" class="chart-warning">航图数据未完整返回，请检查分批查询异常。</div>
        <div v-if="chartSummary.datasets.length" class="theme-legend">
          <span v-for="dataset in chartSummary.datasets" :key="dataset.id">
            <i :style="{ background: dataset.color }" />{{ dataset.label }} · {{ dataset.dimensionMode }}
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

.dataset-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
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
  color: #dc2626;
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
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dataset-dimension {
  flex: 0 0 auto;
  padding: 1px 4px;
  border-radius: 4px;
  background: #e2e8f0;
  color: #475569;
  font-size: 10px;
  font-weight: 600;
}

.dataset-dimension.is-3d {
  background: #fee2e2;
  color: #b91c1c;
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
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid #dbe4ec;
  border-radius: 8px;
  background: #f8fafc;
}

.result-row {
  display: grid;
  grid-template-columns: minmax(88px, auto) minmax(0, 1fr);
  align-items: baseline;
  gap: 12px;
}

.result-label {
  font-size: 13px;
  color: #64748b;
  white-space: nowrap;
}

.result-num {
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
  color: #334155;
  text-align: right;
  font-variant-numeric: tabular-nums;
  word-break: keep-all;
}

.result-meta {
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
  text-align: right;
  white-space: normal;
  word-break: keep-all;
}

.result-status {
  font-size: 15px;
  font-weight: 600;
  color: #c00;
  text-align: right;
}

.result-status.success {
  color: #060;
}

.result-status.querying {
  color: #2563eb;
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

.chart-warning {
  margin-top: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: #fff7ed;
  color: #c2410c;
  font-size: 12px;
  line-height: 1.5;
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

.attribute-layer-row {
  margin-top: 12px;
}

.noise-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin-top: 8px;
  color: #475569;
  font-size: 12px;
}

.noise-legend span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.noise-legend i {
  width: 10px;
  height: 10px;
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
