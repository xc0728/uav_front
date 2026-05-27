<script setup>
import { ref, onMounted, watch } from 'vue'
import { ChevronLeft, Plane, AlertTriangle, FileCheck, Route, RefreshCw, Loader2, Shield, X } from 'lucide-vue-next'

const emit = defineEmits(['switch-view', 'route-monitor-start', 'route-monitor-stop', 'visualize-event'])

// 接收外部传入的监控状态
const props = defineProps({
  monitoredRouteIds: {
    type: Array,
    default: () => []
  }
})

const currentView = ref('list') // 'list' | 'detail'
const activeModuleId = ref('')
const isLoading = ref(false)

// 信息管理系统功能模块
const infoModules = [
  {
    id: 'aircraft-status',
    name: '飞行器状态',
    shortName: '飞行器状态',
    icon: Plane,
    status: 'pending',
  },
  {
    id: 'event-management',
    name: '异常事件管理',
    shortName: '异常事件管理',
    icon: AlertTriangle,
    status: 'active',
  },
  {
    id: 'qualification-approval',
    name: '飞行资质审批',
    shortName: '飞行资质审批',
    icon: FileCheck,
    status: 'pending',
  },
  {
    id: 'route-info',
    name: '航线信息管理',
    shortName: '航线信息管理',
    icon: Route,
    status: 'developing',
  },
  {
    id: 'fence-info',
    name: '电子围栏管理',
    shortName: '电子围栏管理',
    icon: Shield,
    status: 'developing',
  },
]

// 航线数据
const routeList = ref([])
const routeError = ref('')

// 电子围栏数据
const fenceList = ref([])
const fenceError = ref('')

// 分页
const currentPage = ref(1)
const pageSize = ref(10)
const totalCount = ref(0)

// 详情数据
const selectedRoute = ref(null)
const selectedFence = ref(null)
const selectedRoutePath = ref([])

// 弹窗状态
const showEventDialog = ref(false)
const eventList = ref([])
const selectedEvent = ref(null)
const eventJudgementLoading = ref(false)
const eventJudgementResult = ref(null)
const eventVisualizationPayload = ref(null)
const eventForm = ref(getDefaultEventForm())
const selectedRouteForEventId = ref('')
const routeDetailLoading = ref(false)
const routeDetailError = ref('')

function getDefaultEventForm() {
  return {
    事件类型: '失联事件',
    位置经度: 120.1234,
    位置纬度: 30.2345,
    位置高度: 120.0,
    网格层级: 14,
    事件时间: '2024-03-09T10:00',
    飞行速度: 16.0,
    失联时长: 90,
    电量: 28,
    偏航距离: 0,
    返回点经度: 120.13,
    返回点纬度: 30.22,
    返回点高度: 80.0,
    备降点名称: 'A1备降点',
    备降点经度: 120.135,
    备降点纬度: 30.24,
    备降点高度: 60.0,
    救援资源名称: '应急车组-1',
    救援资源经度: 120.12,
    救援资源纬度: 30.23,
    救援资源高度: 0.0,
    是否封控: true,
    警戒半径: 500,
    最大网格数: 300,
    封控时长: 1800,
    是否入库: true,
    航线ID: '',
    航线名称: '',
  }
}

function normalizeFilledValue(value, fallback = '未填写') {
  if (value === null || value === undefined || value === '') return fallback
  return value
}

function joinFilledValues(values, fallback = '未填写') {
  const list = values.filter(v => v !== null && v !== undefined && v !== '')
  return list.length ? list.join('，') : fallback
}

function toDisplayValue(value) {
  return value === null || value === undefined || value === '' ? '未填写' : value
}

function formatEventForm(form) {
  const eventTypeMap = {
    '失联事件': 'lost_contact',
    '低电量事件': 'low_battery',
    '偏航事件': 'deviation',
    '事故事件': 'accident',
  }
  const displayType = normalizeFilledValue(form.事件类型, '异常事件')
  return {
    displayType,
    eventType: eventTypeMap[form.事件类型] || 'manual',
    eventTimeText: toDisplayValue(form.事件时间),
    positionText: joinFilledValues([form.位置经度, form.位置纬度, form.位置高度]),
    gridLevel: toDisplayValue(form.网格层级),
    speedText: toDisplayValue(form.飞行速度),
    linkLostText: toDisplayValue(form.失联时长),
    batteryText: toDisplayValue(form.电量),
    deviationText: toDisplayValue(form.偏航距离),
    homeText: joinFilledValues([form.返回点经度, form.返回点纬度, form.返回点高度]),
    landingSiteText: form.备降点名称
      ? `${form.备降点名称}（${joinFilledValues([form.备降点经度, form.备降点纬度, form.备降点高度], '坐标未填写')}）`
      : '未填写',
    rescueText: form.救援资源名称
      ? `${form.救援资源名称}（${joinFilledValues([form.救援资源经度, form.救援资源纬度, form.救援资源高度], '坐标未填写')}）`
      : '未填写',
    controlText: form.是否封控 ? `是，半径 ${toDisplayValue(form.警戒半径)} 米，最大网格 ${toDisplayValue(form.最大网格数)}，时长 ${toDisplayValue(form.封控时长)} 秒` : '否',
    persistText: form.是否入库 ? '是' : '否',
  }
}

function createEventFromForm() {
  const formSnapshot = { ...eventForm.value }
  const detail = formatEventForm(formSnapshot)
  return {
    id: `event-${Date.now()}`,
    name: `${detail.displayType} · ${formSnapshot.位置经度 || '新事件'}`,
    status: detail.displayType,
    time: detail.eventTimeText,
    form: formSnapshot,
    detail,
  }
}

function resetEventFormByRoute(routeDetail) {
  const base = getDefaultEventForm()
  const path = Array.isArray(routeDetail?.path) ? routeDetail.path : []
  const firstPoint = path[0]?.center || []
  const lastPoint = path[path.length - 1]?.center || []

  selectedRoutePath.value = path
  eventForm.value = {
    ...base,
    航线ID: routeDetail?.id || '',
    航线名称: routeDetail?.name || '',
    位置经度: firstPoint[0] ?? base.位置经度,
    位置纬度: firstPoint[1] ?? base.位置纬度,
    位置高度: firstPoint[2] ?? base.位置高度,
    返回点经度: lastPoint[0] ?? base.返回点经度,
    返回点纬度: lastPoint[1] ?? base.返回点纬度,
    返回点高度: lastPoint[2] ?? base.返回点高度,
    网格层级: path[0]?.pathIndex ?? base.网格层级,
    偏航距离: 0,
  }
}

function getRouteRecordById(routeId) {
  const baseUrl = '/api/airRoute/routeManagement/getRouteRecordById'
  const url = routeId ? `${baseUrl}?id=${encodeURIComponent(routeId)}` : `${baseUrl}?id=`
  const headers = new Headers()
  headers.append('X-API-Key', import.meta.env.VITE_API_KEY || '')

  return fetch(url, {
    method: 'GET',
    headers,
    redirect: 'follow',
  })
}

function parseNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function getRouteSegments(routePath) {
  return Array.isArray(routePath) ? routePath : []
}

function getPointCoordsFromRoutePoint(point) {
  if (!point) return null
  if (Array.isArray(point.center) && point.center.length >= 3) return point.center
  if (Array.isArray(point.position) && point.position.length >= 3) return point.position
  if (Array.isArray(point.coordinates) && point.coordinates.length >= 3) return point.coordinates
  if (Array.isArray(point) && point.length >= 3) return point
  return null
}

function getRoutePointToPointDistance(pointA, pointB) {
  const R = 6371000
  const lon1 = (pointA[0] * Math.PI) / 180
  const lat1 = (pointA[1] * Math.PI) / 180
  const lon2 = (pointB[0] * Math.PI) / 180
  const lat2 = (pointB[1] * Math.PI) / 180
  const dLon = lon2 - lon1
  const dLat = lat2 - lat1
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const horizontal = R * c
  const vertical = (pointB[2] ?? 0) - (pointA[2] ?? 0)
  return Math.sqrt(horizontal ** 2 + vertical ** 2)
}

function getPointToSegmentDistance(point, start, end) {
  const p = { x: point[0], y: point[1], z: point[2] ?? 0 }
  const a = { x: start[0], y: start[1], z: start[2] ?? 0 }
  const b = { x: end[0], y: end[1], z: end[2] ?? 0 }
  const toXY = (coord) => {
    const latRad = (coord.y * Math.PI) / 180
    return {
      x: coord.x * 111320 * Math.cos(latRad),
      y: coord.y * 110540,
      z: coord.z,
    }
  }
  const pp = toXY(p)
  const aa = toXY(a)
  const bb = toXY(b)
  const abx = bb.x - aa.x
  const aby = bb.y - aa.y
  const abz = bb.z - aa.z
  const apx = pp.x - aa.x
  const apy = pp.y - aa.y
  const apz = pp.z - aa.z
  const abLenSq = abx * abx + aby * aby + abz * abz
  if (abLenSq === 0) return Math.sqrt(apx * apx + apy * apy + apz * apz)
  let t = (apx * abx + apy * aby + apz * abz) / abLenSq
  t = Math.max(0, Math.min(1, t))
  const cx = aa.x + abx * t
  const cy = aa.y + aby * t
  const cz = aa.z + abz * t
  return Math.sqrt((pp.x - cx) ** 2 + (pp.y - cy) ** 2 + (pp.z - cz) ** 2)
}

function getPointToRouteMinDistance(point, routePath) {
  const segments = getRouteSegments(routePath)
  if (!segments.length) return null

  let minDistance = Infinity
  for (const segment of segments) {
    const coords = getPointCoordsFromRoutePoint(segment)
    if (coords) {
      const distance = getRoutePointToPointDistance(point, coords)
      minDistance = Math.min(minDistance, distance)
    }
  }

  for (let i = 0; i < segments.length - 1; i++) {
    const start = getPointCoordsFromRoutePoint(segments[i])
    const end = getPointCoordsFromRoutePoint(segments[i + 1])
    if (start && end) {
      const distance = getPointToSegmentDistance(point, start, end)
      minDistance = Math.min(minDistance, distance)
    }
  }

  return Number.isFinite(minDistance) ? minDistance : null
}

function updateDeviationByEventLocation() {
  const lon = parseNumber(eventForm.value.位置经度)
  const lat = parseNumber(eventForm.value.位置纬度)
  const height = parseNumber(eventForm.value.位置高度)

  if (lon === null || lat === null || height === null) return

  const point = [lon, lat, height]
  const routePath = selectedRoutePath.value
  if (!routePath.length) {
    eventForm.value.偏航距离 = 0
    return
  }

  const minDistance = getPointToRouteMinDistance(point, routePath)
  eventForm.value.偏航距离 = minDistance === null ? 0 : Number(minDistance.toFixed(2))
}

function handleEventLocationBlur() {
  updateDeviationByEventLocation()
}

async function handleRouteSelection(routeId) {
  selectedRouteForEventId.value = routeId
  routeDetailError.value = ''

  if (!routeId) {
    selectedRoutePath.value = []
    eventForm.value = getDefaultEventForm()
    return
  }

  routeDetailLoading.value = true
  try {
    const resp = await getRouteRecordById(routeId)
    const data = await resp.json().catch(() => null)
    if (!resp.ok) {
      throw new Error(data?.message || `请求失败: ${resp.status}`)
    }

    if (data?.status !== 'success' || !Array.isArray(data?.results?.path)) {
      throw new Error(data?.message || '航线详情返回格式不正确')
    }

    const routeDetail = {
      id: routeId,
      name: routeList.value.find(item => String(item.id) === String(routeId))?.name || '',
      path: data.results.path,
    }
    resetEventFormByRoute(routeDetail)
  } catch (err) {
    routeDetailError.value = err?.message || '获取航线详情失败'
    selectedRoutePath.value = []
    eventForm.value = {
      ...getDefaultEventForm(),
      航线ID: routeId,
      航线名称: routeList.value.find(item => String(item.id) === String(routeId))?.name || '',
      偏航距离: 0,
    }
  } finally {
    routeDetailLoading.value = false
  }
}

// 航线监控状态
const monitoredRoutes = ref(new Set())

// 监听 prop 变化，同步到本地状态
watch(() => props.monitoredRouteIds, (newIds) => {
  monitoredRoutes.value = new Set(newIds)
}, { immediate: true })

// 判断航线是否被监控
function isRouteMonitored(routeId) {
  return props.monitoredRouteIds.includes(routeId)
}

// 切换航线监控状态
async function toggleRouteMonitor(route) {
  const routeId = route.id
  const isMonitored = isRouteMonitored(routeId)

  if (isMonitored) {
    emit('route-monitor-stop', { id: routeId })
  } else {
    emit('route-monitor-start', { id: routeId, name: route.name })
  }
}

// 电子围栏分页
const fenceCurrentPage = ref(1)
const fencePageSize = ref(10)
const fenceTotalCount = ref(0)
const fenceTotalPages = ref(1)
const paginatedFences = ref([])

// 返回列表
function goBack() {
  currentView.value = 'list'
  activeModuleId.value = ''
  selectedRoute.value = null
  selectedFence.value = null
}

// 点击模块
function selectModule(module) {
  if (module.status === 'pending') return

  activeModuleId.value = module.id

  if (module.id === 'route-info') {
    currentView.value = 'list'
    fetchRoutes()
  } else if (module.id === 'fence-info') {
    currentView.value = 'list'
    fetchFences()
  } else if (module.id === 'event-management') {
    currentView.value = 'event-dashboard'
  }
}

function openEventDialog() {
  selectedRouteForEventId.value = ''
  routeDetailError.value = ''
  eventForm.value = getDefaultEventForm()
  showEventDialog.value = true
}

function closeEventDialog() {
  showEventDialog.value = false
  selectedRouteForEventId.value = ''
  routeDetailLoading.value = false
  routeDetailError.value = ''
}

function confirmEventDialog() {
  const newEvent = createEventFromForm()
  eventList.value.unshift(newEvent)
  selectedEvent.value = newEvent
  eventJudgementResult.value = null
  showEventDialog.value = false
  activeModuleId.value = 'event-management'
  currentView.value = 'event-dashboard'
}

function deleteSelectedEvent() {
  if (!selectedEvent.value) return
  const deleteId = selectedEvent.value.id
  eventList.value = eventList.value.filter(item => item.id !== deleteId)
  selectedEvent.value = eventList.value[0] || null
  eventJudgementResult.value = null
  eventVisualizationPayload.value = null
  emit('visualize-event', null)
}

function buildEmergencyHandlePayload(form) {
  const location = [form.位置经度, form.位置纬度, form.位置高度].filter(v => v !== null && v !== undefined && v !== '')
  const home = [form.返回点经度, form.返回点纬度, form.返回点高度].filter(v => v !== null && v !== undefined && v !== '')

  return {
    eventType: formatEventForm(form).eventType,
    position: location,
    level: Number(form.网格层级) || 14,
    eventTime: form.事件时间 ? new Date(form.事件时间).getTime() : Date.now(),
    telemetry: {
      speed: Number(form.飞行速度) || 0,
      linkLostSeconds: Number(form.失联时长) || 0,
      battery: Number(form.电量) || 0,
      deviationMeters: Number(form.偏航距离) || 0,
    },
    flightPlan: {
      home,
    },
    landingSites: form.备降点名称 ? [{
      name: form.备降点名称,
      point: [form.备降点经度, form.备降点纬度, form.备降点高度].filter(v => v !== null && v !== undefined && v !== ''),
    }] : [],
    rescueResources: form.救援资源名称 ? [{
      name: form.救援资源名称,
      point: [form.救援资源经度, form.救援资源纬度, form.救援资源高度].filter(v => v !== null && v !== undefined && v !== ''),
    }] : [],
    control: {
      apply: !!form.是否封控,
      radiusMeters: Number(form.警戒半径) || 500,
      maxGridCount: Number(form.最大网格数) || 300,
      ttlSeconds: Number(form.封控时长) || 1800,
    },
    persist: !!form.是否入库,
  }
}

async function executeEventJudgement() {
  if (!selectedEvent.value) return
  eventJudgementLoading.value = true
  eventJudgementResult.value = null

  try {
    const payload = buildEmergencyHandlePayload(selectedEvent.value.form || eventForm.value)
    const resp = await fetch('/api/emergency/handle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await resp.json().catch(() => null)
    if (!resp.ok) {
      throw new Error(data?.message || `请求失败: ${resp.status}`)
    }

    eventJudgementResult.value = data
  } catch (err) {
    eventJudgementResult.value = {
      status: 'error',
      message: err?.message || '研判失败',
    }
  } finally {
    eventJudgementLoading.value = false
  }
}

function buildVisualizationPayload(result) {
  const data = result?.data || {}
  const eventGrid = data.eventGrid || {}
  return {
    eventId: data.eventId || selectedEvent.value?.id || '',
    eventType: data.eventType || selectedEvent.value?.detail?.eventType || '',
    eventPoint: {
      lon: parseNumber(selectedEvent.value?.form?.位置经度),
      lat: parseNumber(selectedEvent.value?.form?.位置纬度),
      height: parseNumber(selectedEvent.value?.form?.位置高度),
    },
    grid: {
      center: Array.isArray(eventGrid.center) ? eventGrid.center : null,
      level: eventGrid.level ?? selectedEvent.value?.form?.网格层级 ?? null,
      id: eventGrid.id || eventGrid.gridId || '',
      points: Array.isArray(eventGrid.points) ? eventGrid.points : [],
    },
    warningArea: data.warningArea || null,
    control: data.control || null,
    phase: data.phase || '',
    message: result?.message || '',
    timestamp: Date.now(),
  }
}

function handleVisualizeEvent() {
  if (!eventJudgementResult.value || eventJudgementResult.value.status === 'error') return
  eventVisualizationPayload.value = buildVisualizationPayload(eventJudgementResult.value)
  emit('visualize-event', eventVisualizationPayload.value)
}


// 获取航线列表
async function fetchRoutes() {
  isLoading.value = true
  routeError.value = ''

  try {
    const resp = await fetch('/api/airRoute/routeManagement/listStoredRoutes', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(`请求失败: ${resp.status}`)
    }

    const data = await resp.json()
    console.log('[航线列表] 返回数据:', data)

    if (data?.status === 'success' && Array.isArray(data?.data)) {
      routeList.value = data.data
      totalCount.value = data.data.length
      updatePagination()
    } else {
      routeList.value = []
      totalCount.value = 0
      updatePagination()
    }
  } catch (err) {
    console.error('[航线列表] 请求错误:', err)
    routeError.value = err?.message || '获取航线列表失败'
  } finally {
    isLoading.value = false
  }
}

// 查看详情
function viewDetail(route) {
  selectedRoute.value = route
  currentView.value = 'detail'
}

// 获取电子围栏列表
async function fetchFences() {
  isLoading.value = true
  fenceError.value = ''

  try {
    const resp = await fetch('/api/airRoute/fenceManagement/listFences', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(`请求失败: ${resp.status}`)
    }

    const data = await resp.json()
    console.log('[电子围栏列表] 返回数据:', data)

    if (data?.status === 'success' && Array.isArray(data?.data)) {
      fenceList.value = data.data
      fenceTotalCount.value = data.data.length
      updateFencePagination()
    } else {
      fenceList.value = []
      fenceTotalCount.value = 0
      updateFencePagination()
    }
  } catch (err) {
    console.error('[电子围栏列表] 请求错误:', err)
    fenceError.value = err?.message || '获取电子围栏列表失败'
  } finally {
    isLoading.value = false
  }
}

// 查看电子围栏详情
function viewFenceDetail(fence) {
  selectedFence.value = fence
  currentView.value = 'fence-detail'
}

// 电子围栏分页
function updateFencePagination() {
  fenceTotalPages.value = Math.max(1, Math.ceil(fenceTotalCount.value / fencePageSize.value))
  const start = (fenceCurrentPage.value - 1) * fencePageSize.value
  paginatedFences.value = fenceList.value.slice(start, start + fencePageSize.value)
}

function prevFencePage() {
  if (fenceCurrentPage.value > 1) {
    fenceCurrentPage.value--
    updateFencePagination()
  }
}

function nextFencePage() {
  if (fenceCurrentPage.value < fenceTotalPages.value) {
    fenceCurrentPage.value++
    updateFencePagination()
  }
}

// 格式化坐标
function formatCoord(point) {
  if (!point || point.length < 3) return '-'
  return `${point[0].toFixed(6)}, ${point[1].toFixed(6)}, ${point[2]}m`
}

function formatEventTypeLabel(type) {
  const map = {
    lost_contact: '失联事件',
    low_battery: '低电量事件',
    deviation: '偏航事件',
    accident: '事故事件',
  }
  return map[type] || type || '-'
}

function formatPhaseLabel(phase) {
  const map = {
    emergency_response: '应急处置',
  }
  return map[phase] || phase || '-'
}

function getSeverityClass(level) {
  const map = {
    I: 'severity-i',
    II: 'severity-ii',
    III: 'severity-iii',
    IV: 'severity-iv',
  }
  return map[level] || 'severity-default'
}

function formatEventGridText(grid) {
  if (!grid) return '未返回事件位置'
  const center = Array.isArray(grid.center) ? grid.center : []
  if (center.length >= 3) {
    return `${center[0].toFixed(6)}, ${center[1].toFixed(6)}, ${center[2].toFixed(1)}m`
  }
  return '已返回事件位置'
}

function formatWarningAreaText(area) {
  if (!area) return '未返回警戒范围'
  const count = area.estimatedHorizontalGridCount ?? area.sampleGridCount ?? '-'
  const radius = area.radiusMeters ?? '-'
  return `半径 ${radius} 米，约 ${count} 个网格${area.truncated ? '，已截断展示' : ''}`
}

function formatActionsText(actions) {
  if (!Array.isArray(actions) || actions.length === 0) return '无需额外动作'
  return actions.map(item => item.message).filter(Boolean).join('；') || '无需额外动作'
}

function formatLandingPlanText(plan) {
  if (!plan?.available) return '暂无返航方案'
  const siteName = plan.selectedSite?.name || '最近备降点'
  const routeText = plan.route?.constraintCheck?.message || '路径已生成'
  return `${siteName}，${routeText}`
}

function formatControlText(control) {
  if (!control?.requested && !control?.applied) return '未启用临时围栏'
  return control?.message || '已启用临时围栏'
}

function formatPersistenceText(persistence) {
  if (!persistence) return '未返回台账状态'
  return persistence.saved ? '已写入应急台账' : (persistence.message || '未写入台账')
}

// 获取当前模块名称
function getModuleName() {
  const module = infoModules.find(m => m.id === activeModuleId.value)
  return module?.name || ''
}

// 计算分页
const totalPages = ref(1)
const paginatedRoutes = ref([])

function updatePagination() {
  totalPages.value = Math.max(1, Math.ceil(totalCount.value / pageSize.value))
  const start = (currentPage.value - 1) * pageSize.value
  paginatedRoutes.value = routeList.value.slice(start, start + pageSize.value)
}

function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value--
    updatePagination()
  }
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
    updatePagination()
  }
}

onMounted(() => {
  // 默认进入航线信息管理
  selectModule(infoModules.find(m => m.id === 'route-info'))
})

defineExpose({
  goBack
})
</script>

<template>
  <div class="info-management-page">
    <!-- 左侧导航栏 -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <h2>信息管理</h2>
      </div>
      <nav class="sidebar-nav">
        <button
          v-for="module in infoModules"
          :key="module.id"
          class="nav-item"
          :class="{ active: activeModuleId === module.id, disabled: module.status === 'pending' }"
          @click="selectModule(module)"
        >
          <component :is="module.icon" :size="18" class="nav-icon" />
          <span class="nav-text">{{ module.shortName }}</span>
          <span v-if="module.status === 'pending'" class="nav-badge">待开发</span>
        </button>
      </nav>
    </aside>

    <!-- 主内容区 -->
    <main class="main-content">
      <!-- 航线信息管理视图 -->
      <template v-if="activeModuleId === 'route-info'">
        <!-- 面包屑导航 -->
        <div class="breadcrumb">
          <span class="breadcrumb-item">智绘平台</span>
          <span class="breadcrumb-separator">/</span>
          <span class="breadcrumb-item">信息管理系统</span>
          <span class="breadcrumb-separator">/</span>
          <span class="breadcrumb-item current">航线信息管理</span>
        </div>

        <!-- 航线列表视图 -->
        <div v-if="currentView === 'list'" class="route-list-view">
          <div class="view-header">
            <h3>航线列表</h3>
            <button class="btn-refresh" @click="fetchRoutes" :disabled="isLoading">
              <Loader2 v-if="isLoading" :size="14" class="spin" />
              <RefreshCw v-else :size="14" />
              刷新
            </button>
          </div>

          <!-- 加载状态 -->
          <div v-if="isLoading && routeList.length === 0" class="loading-state">
            <Loader2 :size="32" class="spin" />
            <span>加载中...</span>
          </div>

          <!-- 错误提示 -->
          <div v-else-if="routeError" class="error-state">
            {{ routeError }}
          </div>

          <!-- 空状态 -->
          <div v-else-if="routeList.length === 0" class="empty-state">
            <Route :size="48" class="empty-icon" />
            <p>暂无航线数据</p>
          </div>

          <!-- 数据表格 -->
          <div v-else class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>序号</th>
                  <th>航线ID</th>
                  <th>航线名称</th>
                  <th>起点坐标</th>
                  <th>终点坐标</th>
                  <th>监控</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(route, index) in paginatedRoutes" :key="route.id">
                  <td class="col-index">{{ (currentPage - 1) * pageSize + index + 1 }}</td>
                  <td class="col-id">{{ route.id }}</td>
                  <td class="col-name">{{ route.name || '-' }}</td>
                  <td class="col-coord">{{ formatCoord(route.startPoint) }}</td>
                  <td class="col-coord">{{ formatCoord(route.endPoint) }}</td>
                  <td class="col-actions">
                    <label class="switch">
                      <input
                        type="checkbox"
                        :checked="isRouteMonitored(route.id)"
                        @change="toggleRouteMonitor(route)"
                      />
                      <span class="slider"></span>
                    </label>
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- 分页 -->
            <div class="pagination">
              <span class="page-info">
                共 {{ totalCount }} 条记录，第 {{ currentPage }} / {{ totalPages }} 页
              </span>
              <div class="page-buttons">
                <button class="btn-page" @click="prevPage" :disabled="currentPage <= 1">上一页</button>
                <button class="btn-page" @click="nextPage" :disabled="currentPage >= totalPages">下一页</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 航线详情视图 -->
        <div v-else-if="currentView === 'detail' && selectedRoute" class="route-detail-view">
          <div class="view-header">
            <button class="btn-back" @click="goBack">
              <ChevronLeft :size="18" />
              返回列表
            </button>
            <h3>航线详情</h3>
          </div>

          <div class="detail-content">
            <div class="detail-section">
              <h4>基本信息</h4>
              <div class="detail-grid">
                <div class="detail-item">
                  <label>航线ID</label>
                  <span>{{ selectedRoute.id }}</span>
                </div>
                <div class="detail-item">
                  <label>航线名称</label>
                  <span>{{ selectedRoute.name || '未命名' }}</span>
                </div>
              </div>
            </div>

            <div class="detail-section">
              <h4>航线坐标</h4>
              <div class="coord-info">
                <div class="coord-item">
                  <span class="coord-label">起点</span>
                  <span class="coord-value">{{ formatCoord(selectedRoute.startPoint) }}</span>
                </div>
                <div class="coord-item">
                  <span class="coord-label">终点</span>
                  <span class="coord-value">{{ formatCoord(selectedRoute.endPoint) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 电子围栏管理视图 -->
        <template v-else-if="activeModuleId === 'fence-info'">
          <!-- 面包屑导航 -->
          <div class="breadcrumb">
            <span class="breadcrumb-item">智绘平台</span>
            <span class="breadcrumb-separator">/</span>
            <span class="breadcrumb-item">信息管理系统</span>
            <span class="breadcrumb-separator">/</span>
            <span class="breadcrumb-item current">电子围栏管理</span>
          </div>

          <!-- 电子围栏列表视图 -->
          <div v-if="currentView === 'list'" class="fence-list-view">
            <div class="view-header">
              <h3>电子围栏列表</h3>
              <button class="btn-refresh" @click="fetchFences" :disabled="isLoading">
                <Loader2 v-if="isLoading" :size="14" class="spin" />
                <RefreshCw v-else :size="14" />
                刷新
              </button>
            </div>

            <!-- 加载状态 -->
            <div v-if="isLoading && fenceList.length === 0" class="loading-state">
              <Loader2 :size="32" class="spin" />
              <span>加载中...</span>
            </div>

            <!-- 错误提示 -->
            <div v-else-if="fenceError" class="error-state">
              {{ fenceError }}
            </div>

            <!-- 空状态 -->
            <div v-else-if="fenceList.length === 0" class="empty-state">
              <Shield :size="48" class="empty-icon" />
              <p>暂无电子围栏数据</p>
            </div>

            <!-- 数据表格 -->
            <div v-else class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>序号</th>
                    <th>围栏ID</th>
                    <th>围栏名称</th>
                    <th>围栏类型</th>
                    <th>中心坐标</th>
                    <th>半径/范围</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(fence, index) in paginatedFences" :key="fence.id">
                    <td class="col-index">{{ (fenceCurrentPage - 1) * fencePageSize + index + 1 }}</td>
                    <td class="col-id">{{ fence.id }}</td>
                    <td class="col-name">{{ fence.name || '-' }}</td>
                    <td class="col-type">
                      <span class="type-badge" :class="fence.type === 'circle' ? 'type-circle' : 'type-polygon'">
                        {{ fence.type === 'circle' ? '圆形' : '多边形' }}
                      </span>
                    </td>
                    <td class="col-coord">{{ fence.center ? `${fence.center[0].toFixed(6)}, ${fence.center[1].toFixed(6)}` : '-' }}</td>
                    <td class="col-radius">
                      {{ fence.type === 'circle' ? `${fence.radius || 0}m` : fence.points?.length ? `${fence.points.length}个点` : '-' }}
                    </td>
                    <td class="col-actions">
                      <button class="btn-action view" @click="viewFenceDetail(fence)">查看</button>
                    </td>
                  </tr>
                </tbody>
              </table>

              <!-- 分页 -->
              <div class="pagination">
                <span class="page-info">
                  共 {{ fenceTotalCount }} 条记录，第 {{ fenceCurrentPage }} / {{ fenceTotalPages }} 页
                </span>
                <div class="page-buttons">
                  <button class="btn-page" @click="prevFencePage" :disabled="fenceCurrentPage <= 1">上一页</button>
                  <button class="btn-page" @click="nextFencePage" :disabled="fenceCurrentPage >= fenceTotalPages">下一页</button>
                </div>
              </div>
            </div>
          </div>

          <!-- 电子围栏详情视图 -->
          <div v-else-if="currentView === 'fence-detail' && selectedFence" class="fence-detail-view">
            <div class="view-header">
              <button class="btn-back" @click="goBack">
                <ChevronLeft :size="18" />
                返回列表
              </button>
              <h3>电子围栏详情</h3>
            </div>

            <div class="detail-content">
              <div class="detail-section">
                <h4>基本信息</h4>
                <div class="detail-grid">
                  <div class="detail-item">
                    <label>围栏ID</label>
                    <span>{{ selectedFence.id }}</span>
                  </div>
                  <div class="detail-item">
                    <label>围栏名称</label>
                    <span>{{ selectedFence.name || '未命名' }}</span>
                  </div>
                  <div class="detail-item">
                    <label>围栏类型</label>
                    <span>
                      <span class="type-badge" :class="selectedFence.type === 'circle' ? 'type-circle' : 'type-polygon'">
                        {{ selectedFence.type === 'circle' ? '圆形' : '多边形' }}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              <div class="detail-section" v-if="selectedFence.type === 'circle'">
                <h4>圆形围栏参数</h4>
                <div class="detail-grid">
                  <div class="detail-item">
                    <label>中心经度</label>
                    <span>{{ selectedFence.center?.[0]?.toFixed(6) || '-' }}</span>
                  </div>
                  <div class="detail-item">
                    <label>中心纬度</label>
                    <span>{{ selectedFence.center?.[1]?.toFixed(6) || '-' }}</span>
                  </div>
                  <div class="detail-item">
                    <label>半径</label>
                    <span>{{ selectedFence.radius || 0 }} 米</span>
                  </div>
                </div>
              </div>

              <div class="detail-section" v-else>
                <h4>多边形围栏坐标</h4>
                <div class="polygon-points">
                  <div class="point-item" v-for="(point, idx) in selectedFence.points" :key="idx">
                    <span class="point-index">{{ idx + 1 }}</span>
                    <span class="point-coord">{{ point[0].toFixed(6) }}, {{ point[1].toFixed(6) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </template>

      <!-- 异常事件管理视图 -->
      <template v-else-if="activeModuleId === 'event-management'">
        <div class="breadcrumb">
          <span class="breadcrumb-item">智绘平台</span>
          <span class="breadcrumb-separator">/</span>
          <span class="breadcrumb-item">信息管理系统</span>
          <span class="breadcrumb-separator">/</span>
          <span class="breadcrumb-item current">异常事件管理</span>
        </div>

        <div class="event-management-view">
          <section class="event-panel event-list-panel">
            <div class="panel-header panel-header-row">
              <h3>事件列表</h3>
              <div class="panel-actions">
                <button class="btn-panel add" @click="openEventDialog">添加</button>
                <button class="btn-panel delete" :disabled="!selectedEvent" @click="deleteSelectedEvent">删除</button>
              </div>
            </div>
            <div class="panel-body list-body compact-body">
              <div v-if="eventList.length === 0" class="placeholder-card active-card compact-card">
                <AlertTriangle :size="28" class="placeholder-icon" />
                <h4>暂无事件</h4>
                <p>点击右上角“添加”，填写事件信息后会在这里显示。</p>
              </div>
              <button
                v-for="item in eventList"
                :key="item.id"
                class="event-list-item"
                :class="{ active: selectedEvent?.id === item.id }"
                @click="selectedEvent = item"
              >
                <div class="event-list-item-title">{{ item.name }}</div>
                <div class="event-list-item-sub">{{ item.time }}</div>
              </button>
            </div>
          </section>

          <section class="event-panel event-detail-panel">
            <div class="panel-header panel-header-row">
              <h3>事件详情</h3>
            </div>
            <div class="panel-body detail-body compact-body">
              <div v-if="!selectedEvent" class="placeholder-card compact-card">
                <FileCheck :size="28" class="placeholder-icon" />
                <h4>等待选择事件</h4>
                <p>选中左侧事件后，这里将展示事件位置、类型、时间与处置信息。</p>
              </div>
              <div v-else class="info-card">
                <div class="info-row"><span>事件类型</span><strong>{{ selectedEvent.detail.displayType }}</strong></div>
                <div class="info-row"><span>发生时间</span><strong>{{ selectedEvent.detail.eventTimeText }}</strong></div>
                <div class="info-row"><span>位置</span><strong>{{ selectedEvent.detail.positionText }}</strong></div>
                <div class="info-row"><span>网格层级</span><strong>{{ selectedEvent.detail.gridLevel }}</strong></div>
                <div class="info-row"><span>飞行速度</span><strong>{{ selectedEvent.form?.飞行速度 || selectedEvent.detail.speedText }}</strong></div>
                <div class="info-row"><span>失联时长</span><strong>{{ selectedEvent.form?.失联时长 || selectedEvent.detail.linkLostText }}</strong></div>
                <div class="info-row"><span>电量</span><strong>{{ selectedEvent.form?.电量 || selectedEvent.detail.batteryText }}</strong></div>
                <div class="info-row"><span>偏航距离</span><strong>{{ selectedEvent.form?.偏航距离 || selectedEvent.detail.deviationText }}</strong></div>
                <div class="info-row"><span>返回点</span><strong>{{ selectedEvent.detail.homeText }}</strong></div>
                <div class="info-row"><span>备降点</span><strong>{{ selectedEvent.detail.landingSiteText }}</strong></div>
                <div class="info-row"><span>救援资源</span><strong>{{ selectedEvent.detail.rescueText }}</strong></div>
                <div class="panel-action-center">
                  <button class="btn-judge" :disabled="eventJudgementLoading" @click="executeEventJudgement">
                    {{ eventJudgementLoading ? '研判中...' : '执行研判' }}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section class="event-panel event-result-panel">
            <div class="panel-header panel-header-row">
              <h3>研判结果</h3>
            </div>
            <div class="panel-body detail-body compact-body">
              <div v-if="eventJudgementLoading" class="placeholder-card compact-card">
                <Loader2 :size="28" class="placeholder-icon spin" />
                <h4>正在研判</h4>
                <p>请稍候，正在向后端获取研判结果。</p>
              </div>
              <div v-else-if="!eventJudgementResult" class="placeholder-card compact-card">
                <Shield :size="28" class="placeholder-icon" />
                <h4>研判结果区域</h4>
                <p>点击“执行研判”后，这里会显示后端返回的处置结果。</p>
              </div>
              <div v-else-if="eventJudgementResult.status === 'error'" class="info-card error-card">
                <div class="result-banner error">研判失败</div>
                <div class="info-row"><span>提示</span><strong>{{ eventJudgementResult.message }}</strong></div>
              </div>
              <div v-else class="info-card result-card">
                <div class="result-banner success">研判完成</div>
                <div class="info-row"><span>事件编号</span><strong>{{ eventJudgementResult?.data?.eventId || '-' }}</strong></div>
                <div class="info-row"><span>事件类型</span><strong>{{ formatEventTypeLabel(eventJudgementResult?.data?.eventType) }}</strong></div>
                <div class="info-row risk-row"><span>风险等级</span><strong :class="getSeverityClass(eventJudgementResult?.data?.severity?.level)">{{ eventJudgementResult?.data?.severity?.label || '-' }}</strong></div>
                <div class="info-row"><span>风险分值</span><strong>{{ eventJudgementResult?.data?.severity?.score ?? '-' }}</strong></div>
                <div class="info-row"><span>研判阶段</span><strong>{{ formatPhaseLabel(eventJudgementResult?.data?.phase) }}</strong></div>
                <div class="info-row"><span>处置结论</span><strong>{{ eventJudgementResult?.message || '已完成研判' }}</strong></div>
                <div class="info-row"><span>事件位置</span><strong>{{ formatEventGridText(eventJudgementResult?.data?.eventGrid) }}</strong></div>
                <div class="info-row"><span>警戒范围</span><strong>{{ formatWarningAreaText(eventJudgementResult?.data?.warningArea) }}</strong></div>
                <div class="info-row"><span>处置动作</span><strong>{{ formatActionsText(eventJudgementResult?.data?.actions) }}</strong></div>
                <div class="info-row"><span>返航方案</span><strong>{{ formatLandingPlanText(eventJudgementResult?.data?.landingPlan) }}</strong></div>
                <div class="info-row"><span>临时围栏</span><strong>{{ formatControlText(eventJudgementResult?.data?.control) }}</strong></div>
                <div class="info-row"><span>台账状态</span><strong>{{ formatPersistenceText(eventJudgementResult?.data?.persistence) }}</strong></div>
                <div class="result-actions">
                  <button class="btn-result secondary" type="button" @click="handleVisualizeEvent">可视化</button>
                  <button class="btn-result danger" type="button" @click="eventJudgementResult = null; eventVisualizationPayload = null">清除</button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </template>

      <!-- 其他模块 -->
      <template v-else>
        <div class="coming-soon">
          <h3>{{ getModuleName() }}</h3>
          <p>该模块正在开发中，敬请期待...</p>
        </div>
      </template>
    </main>

    <div v-if="showEventDialog" class="dialog-mask" @click.self="closeEventDialog">
      <div class="dialog-card event-dialog">
        <div class="dialog-header">
          <h3>新增异常事件</h3>
          <button class="dialog-close" @click="closeEventDialog"><X :size="18" /></button>
        </div>

        <div class="dialog-body">
          <div class="form-grid two-col">
            <div class="form-item">
              <label>选择航线</label>
              <select v-model="selectedRouteForEventId" @change="handleRouteSelection(selectedRouteForEventId)">
                <option value="">请选择航线</option>
                <option v-for="route in routeList" :key="route.id" :value="route.id">
                  {{ route.name || `航线 ${route.id}` }}
                </option>
              </select>
              <p v-if="routeDetailLoading" class="field-hint">正在加载航线详情...</p>
              <p v-else-if="routeDetailError" class="field-hint error">{{ routeDetailError }}</p>
            </div>
            <div class="form-item">
              <label>事件时间</label>
              <input v-model="eventForm.事件时间" type="datetime-local" />
            </div>
          </div>

          <div class="form-grid two-col">
            <div class="form-item">
              <label>事件类型</label>
              <select v-model="eventForm.事件类型">
                <option>失联事件</option>
                <option>低电量事件</option>
                <option>偏航事件</option>
                <option>事故事件</option>
              </select>
            </div>
            <div class="form-item">
              <label>航线名称</label>
              <input v-model="eventForm.航线名称" type="text" placeholder="选择航线后自动填充" readonly />
            </div>
          </div>

          <div class="form-section-title">位置参数</div>
          <div class="form-grid three-col">
            <div class="form-item"><label>经度</label><input v-model="eventForm.位置经度" type="number" step="any" placeholder="120.1234" @blur="handleEventLocationBlur" /></div>
            <div class="form-item"><label>纬度</label><input v-model="eventForm.位置纬度" type="number" step="any" placeholder="30.2345" @blur="handleEventLocationBlur" /></div>
            <div class="form-item"><label>高度</label><input v-model="eventForm.位置高度" type="number" step="any" placeholder="120.0" @blur="handleEventLocationBlur" /></div>
          </div>

          <div class="form-grid three-col">
            <div class="form-item"><label>网格层级</label><input v-model="eventForm.网格层级" type="number" min="1" max="21" /></div>
            <div class="form-item"><label>飞行速度（m/s）</label><input v-model="eventForm.飞行速度" type="number" step="any" placeholder="16.0" /></div>
            <div class="form-item"><label>失联时长（秒）</label><input v-model="eventForm.失联时长" type="number" placeholder="90" /></div>
          </div>
          <div v-if="eventForm.航线ID" class="selected-route-summary">
            <span>已选航线：</span>
            <strong>{{ eventForm.航线名称 || eventForm.航线ID }}</strong>
          </div>

          <div class="form-grid three-col">
            <div class="form-item"><label>电量（%）</label><input v-model="eventForm.电量" type="number" min="0" max="100" placeholder="28" /></div>
            <div class="form-item"><label>偏航距离（米）</label><input v-model="eventForm.偏航距离" type="number" step="any" placeholder="120" readonly /></div>
            <div></div>
          </div>

          <div class="form-grid three-col inline-row">
            <div class="form-item"><label>返回点经度</label><input v-model="eventForm.返回点经度" type="number" step="any" placeholder="120.1300" /></div>
            <div class="form-item"><label>返回点纬度</label><input v-model="eventForm.返回点纬度" type="number" step="any" placeholder="30.2200" /></div>
            <div class="form-item"><label>返回点高度</label><input v-model="eventForm.返回点高度" type="number" step="any" placeholder="80.0" /></div>
          </div>

          <div class="form-section-title">备降点信息</div>
          <div class="form-grid two-col">
            <div class="form-item"><label>备降点名称</label><input v-model="eventForm.备降点名称" type="text" placeholder="A1备降点" /></div>
            <div class="form-item"><label>备降点高度</label><input v-model="eventForm.备降点高度" type="number" step="any" placeholder="60.0" /></div>
          </div>
          <div class="form-grid two-col">
            <div class="form-item"><label>备降点经度</label><input v-model="eventForm.备降点经度" type="number" step="any" placeholder="120.1350" /></div>
            <div class="form-item"><label>备降点纬度</label><input v-model="eventForm.备降点纬度" type="number" step="any" placeholder="30.2400" /></div>
          </div>

          <div class="form-section-title">救援资源信息</div>
          <div class="form-grid two-col">
            <div class="form-item"><label>救援资源名称</label><input v-model="eventForm.救援资源名称" type="text" placeholder="应急车组-1" /></div>
            <div class="form-item"><label>救援资源高度</label><input v-model="eventForm.救援资源高度" type="number" step="any" placeholder="0.0" /></div>
          </div>
          <div class="form-grid two-col">
            <div class="form-item"><label>救援资源经度</label><input v-model="eventForm.救援资源经度" type="number" step="any" placeholder="120.1200" /></div>
            <div class="form-item"><label>救援资源纬度</label><input v-model="eventForm.救援资源纬度" type="number" step="any" placeholder="30.2300" /></div>
          </div>

          <div class="form-section-title">处置参数</div>
          <div class="form-grid three-col">
            <div class="form-item"><label>是否封控</label><select v-model="eventForm.是否封控"><option :value="true">是</option><option :value="false">否</option></select></div>
            <div class="form-item"><label>警戒半径（米）</label><input v-model="eventForm.警戒半径" type="number" placeholder="500" /></div>
            <div class="form-item"><label>最大网格数</label><input v-model="eventForm.最大网格数" type="number" placeholder="300" /></div>
          </div>
          <div class="form-grid two-col">
            <div class="form-item"><label>封控时长（秒）</label><input v-model="eventForm.封控时长" type="number" placeholder="1800" /></div>
            <div class="form-item"><label>是否入库</label><select v-model="eventForm.是否入库"><option :value="true">是</option><option :value="false">否</option></select></div>
          </div>
        </div>

        <div class="dialog-footer">
          <button class="btn-dialog cancel" @click="closeEventDialog">取消</button>
          <button class="btn-dialog primary" @click="confirmEventDialog">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.info-management-page {
  display: flex;
  width: 100%;
  height: 100%;
  background: #f8fafc;
}

/* 左侧导航栏 */
.sidebar {
  width: 240px;
  min-width: 240px;
  background: #ffffff;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 20px 16px;
  border-bottom: 1px solid #e2e8f0;
}

.sidebar-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
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
  padding: 12px 14px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #64748b;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}

.nav-item:hover:not(.disabled) {
  background: #f1f5f9;
  color: #1e293b;
}

.nav-item.active {
  background: #eff6ff;
  color: #3b82f6;
}

.nav-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.nav-icon {
  flex-shrink: 0;
}

.nav-text {
  flex: 1;
}

.nav-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #f1f5f9;
  color: #94a3b8;
}

/* 主内容区 */
.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
}

/* 面包屑 */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
  font-size: 14px;
}

.breadcrumb-item {
  color: #64748b;
}

.breadcrumb-item.current {
  color: #1e293b;
  font-weight: 500;
}

.breadcrumb-separator {
  color: #cbd5e1;
}

/* 视图头部 */
.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.view-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-tip {
  display: block;
  margin-bottom: 16px;
  font-size: 12px;
  color: #94a3b8;
}

.btn-panel {
  padding: 7px 12px;
  border: 1px solid #dbe4f0;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: #ffffff;
}

.btn-panel.add {
  color: #2563eb;
  background: #eff6ff;
  border-color: #bfdbfe;
}

.btn-panel.add:hover {
  background: #dbeafe;
  border-color: #93c5fd;
}

.btn-panel.delete {
  color: #94a3b8;
  background: #f8fafc;
}

.btn-panel.delete:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-refresh {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
  color: #64748b;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-refresh:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.btn-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 开关样式 */
.switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #cbd5e1;
  transition: 0.3s;
  border-radius: 24px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
}

.switch input:checked + .slider {
  background-color: #10b981;
}

.switch input:checked + .slider:before {
  transform: translateX(20px);
}

.btn-back {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
  color: #64748b;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-back:hover {
  background: #f8fafc;
  color: #1e293b;
}

/* 状态显示 */
.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px;
  color: #64748b;
  font-size: 14px;
  gap: 12px;
}

.error-state {
  color: #ef4444;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 16px;
}

.empty-icon {
  color: #cbd5e1;
}

/* 数据表格 */
.table-container {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid #f1f5f9;
}

.data-table th {
  background: #f8fafc;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  border-bottom: 1px solid #e2e8f0;
}

.data-table td {
  font-size: 13px;
  color: #334155;
}

.data-table tbody tr:hover {
  background: #f8fafc;
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.col-index {
  width: 60px;
  color: #94a3b8 !important;
}

.col-id {
  font-family: monospace;
}

.col-name {
  font-weight: 500;
}

.col-coord {
  font-family: monospace;
  font-size: 12px !important;
  color: #64748b !important;
}

.col-actions {
  width: 80px;
}

.btn-action {
  padding: 4px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  background: #ffffff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-action.view {
  color: #3b82f6;
  border-color: #bfdbfe;
  background: #eff6ff;
}

.btn-action.view:hover {
  background: #dbeafe;
  border-color: #93c5fd;
}

/* 分页 */
.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid #f1f5f9;
  background: #f8fafc;
}

.page-info {
  font-size: 13px;
  color: #64748b;
}

.page-buttons {
  display: flex;
  gap: 8px;
}

.btn-page {
  padding: 6px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  background: #ffffff;
  color: #64748b;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-page:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #cbd5e1;
  color: #1e293b;
}

.btn-page:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 详情视图 */
.route-detail-view {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.detail-content {
  padding: 20px;
}

.detail-section {
  margin-bottom: 24px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.detail-section h4 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  padding-bottom: 8px;
  border-bottom: 1px solid #f1f5f9;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-item label {
  font-size: 12px;
  color: #64748b;
}

.detail-item span {
  font-size: 14px;
  color: #1e293b;
  font-weight: 500;
}

.coord-info {
  display: flex;
  gap: 32px;
}

.coord-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.coord-label {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  background: #eff6ff;
  color: #3b82f6;
}

.coord-value {
  font-family: monospace;
  font-size: 13px;
  color: #334155;
}

/* 电子围栏类型标签 */
.col-type {
  width: 90px;
}

.type-badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.type-circle {
  background: #fef3c7;
  color: #d97706;
}

.type-polygon {
  background: #dbeafe;
  color: #2563eb;
}

.col-radius {
  font-family: monospace;
  font-size: 12px !important;
  color: #64748b !important;
}

/* 电子围栏详情视图 */
.fence-detail-view {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.polygon-points {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.point-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 6px;
}

.point-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #e2e8f0;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
}

.point-coord {
  font-family: monospace;
  font-size: 13px;
  color: #334155;
}

/* 监控勾选框 */
.monitor-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.monitor-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #5b9fd4;
}

.checkbox-label {
  font-size: 13px;
  color: #64748b;
  user-select: none;
}

.monitor-checkbox input[type="checkbox"]:checked + .checkbox-label {
  color: #3b82f6;
  font-weight: 500;
}

/* 异常事件管理视图 */
.event-management-view {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  align-items: stretch;
  min-height: calc(100vh - 150px);
}

.event-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
  min-height: 560px;
}

.event-list-panel,
.event-detail-panel,
.event-result-panel {
  min-height: 420px;
}

.panel-header {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid #f1f5f9;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  box-sizing: border-box;
}

.panel-header-row {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
  line-height: 1;
}

.panel-tip {
  font-size: 12px;
  color: #94a3b8;
}

.panel-body {
  flex: 1;
  padding: 12px;
}

.list-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}

.detail-body {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.panel-action-center {
  display: flex;
  justify-content: center;
  padding-top: 6px;
}

.btn-judge {
  min-width: 120px;
  height: 40px;
  padding: 0 18px;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: #ffffff;
  font-size: 14px;
  cursor: pointer;
}

.btn-judge:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.placeholder-body {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fcfdff;
}

.compact-body {
  padding-top: 0;
}

.placeholder-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  min-height: 220px;
  padding: 20px;
  text-align: center;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  background: #ffffff;
  color: #64748b;
}

.event-list-item {
  width: 100%;
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.event-list-item.active {
  border-color: #93c5fd;
  background: #eff6ff;
}

.event-list-item-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.event-list-item-sub {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
}

.info-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  padding: 18px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #ffffff;
}

.result-card {
  gap: 12px;
}

.error-card {
  border-color: #fecaca;
  background: #fef2f2;
}

.result-banner {
  display: inline-flex;
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.result-banner.success {
  background: #dcfce7;
  color: #166534;
}

.result-banner.error {
  background: #fee2e2;
  color: #b91c1c;
}

.info-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f1f5f9;
  font-size: 13px;
}

.info-row:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.info-row span {
  color: #64748b;
  flex-shrink: 0;
}

.info-row strong {
  color: #1e293b;
  font-weight: 500;
  text-align: right;
}

.risk-row strong {
  padding: 2px 8px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.result-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 6px;
}

.btn-result {
  flex: 1;
  height: 36px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-result.secondary {
  background: #eff6ff;
  color: #2563eb;
}

.btn-result.secondary:hover {
  background: #dbeafe;
}

.btn-result.danger {
  background: #fee2e2;
  color: #b91c1c;
}

.btn-result.danger:hover {
  background: #fecaca;
}

.severity-i {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.15);
}

.severity-ii {
  color: #f97316;
  background: rgba(249, 115, 22, 0.15);
}

.severity-iii {
  color: #eab308;
  background: rgba(234, 179, 8, 0.15);
}

.severity-iv {
  color: #22c55e;
  background: rgba(34, 197, 94, 0.15);
}

.severity-default {
  color: #60a5fa;
  background: rgba(96, 165, 250, 0.15);
}

.compact-card {
  min-height: 180px;
}

.placeholder-card h4 {
  margin: 0;
  font-size: 16px;
  color: #1e293b;
}

.placeholder-card p {
  margin: 0;
  line-height: 1.6;
  font-size: 13px;
}

.placeholder-icon {
  color: #3b82f6;
}

.active-card {
  border-color: #93c5fd;
  background: #eff6ff;
}

/* 待开发视图 */
.coming-soon {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px;
  text-align: center;
}

.coming-soon h3 {
  margin: 0 0 12px;
  font-size: 20px;
  color: #1e293b;
}

.coming-soon p {
  margin: 0;
  color: #64748b;
  font-size: 14px;
}

.dialog-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 24px;
}

.dialog-card {
  width: min(1080px, 96vw);
  max-height: 90vh;
  background: #ffffff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 24px 80px rgba(15, 23, 42, 0.18);
  display: flex;
  flex-direction: column;
}

.event-dialog .dialog-body {
  padding: 20px;
  overflow-y: auto;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  color: #1e293b;
}

.dialog-close {
  border: none;
  background: transparent;
  cursor: pointer;
  color: #64748b;
}

.form-section-title {
  margin: 18px 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.field-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #64748b;
}

.field-hint.error {
  color: #dc2626;
}

.selected-route-summary {
  margin: 8px 0 4px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #eff6ff;
  color: #1e40af;
  font-size: 13px;
}

.selected-route-summary strong {
  margin-left: 6px;
}

.form-grid {
  display: grid;
  gap: 12px;
}

.two-col {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.three-col {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-item label {
  font-size: 12px;
  color: #64748b;
}

.form-item input,
.form-item select {
  height: 40px;
  padding: 0 12px;
  border: 1px solid #dbe4f0;
  border-radius: 8px;
  outline: none;
  font-size: 14px;
  color: #1e293b;
  background: #fff;
  box-sizing: border-box;
}

.form-item input:focus,
.form-item select:focus {
  border-color: #7db8e0;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
}

.btn-dialog {
  height: 40px;
  padding: 0 16px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
}

.btn-dialog.cancel {
  background: #ffffff;
  border-color: #dbe4f0;
  color: #334155;
}

.btn-dialog.primary {
  background: #2563eb;
  color: #ffffff;
}

/* 动画 */
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
