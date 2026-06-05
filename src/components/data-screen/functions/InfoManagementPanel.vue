<script setup>
import { ref, onMounted, watch } from 'vue'
import { ChevronLeft, Plane, AlertTriangle, FileCheck, Route, RefreshCw, Loader2, Shield, X, Trash2, Database } from 'lucide-vue-next'

const emit = defineEmits(['switch-view', 'route-monitor-start', 'route-monitor-stop', 'visualize-event', 'show-no-fly-zone', 'hide-no-fly-zone'])

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
    name: '飞行器管理',
    shortName: '飞行器管理',
    icon: Plane,
    status: 'developing',
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
    name: '飞行资质管理',
    shortName: '飞行资质管理',
    icon: FileCheck,
    status: 'developing',
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
    name: '禁飞区管理',
    shortName: '禁飞区管理',
    icon: Shield,
    status: 'developing',
  },
]

// 航线数据
const routeList = ref([])
const routeError = ref('')

// 飞行器管理数据
const aircraftList = ref([
  {
    id: 'aircraft-001',
    name: '大疆',
    model: 'M3T',
    transponderNo: '11111',
    bindTime: '2024-12-02 10:06:50',
    owner: '张三',
  },
])
const aircraftFilters = ref({
  deviceName: '',
  bindTime: [],
})
const aircraftSearchLoading = ref(false)
const aircraftError = ref('')
const showAircraftDialog = ref(false)
const aircraftForm = ref({
  id: '',
  name: '',
  model: '',
  transponderNo: '',
  bindTime: '',
  owner: '',
})
const aircraftSelected = ref(null)
const aircraftCurrentPage = ref(1)
const aircraftPageSize = ref(10)
const aircraftTotalCount = ref(0)
const aircraftPaginatedList = ref([])

// 电子围栏数据
const fenceList = ref([])
const fenceError = ref('')
const fenceTypeCode = ref('electronic_fence')
const noFlyZoneVisibleMap = ref({})
const selectedFenceIds = ref(new Set())
const isSyncing = ref(false)

// 分页
const currentPage = ref(1)
const pageSize = ref(10)
const totalCount = ref(0)

// 飞行资质管理数据
const qualificationList = ref([
  { id: '145', userId: '145', userName: '飞行用户9788', userEmail: 'ahkf555@outlook.com', phoneNumber: '18888888888', gender: '男', avatar: '', createdAt: '2023-08-28' },
  { id: '146', userId: '146', userName: '飞行用户4687', userEmail: 'ident45@outlook.com', phoneNumber: '18974365228', gender: '男', avatar: '', createdAt: '2023-08-28' },
])
const qualificationFilters = ref({ phoneNumber: '', createdAt: '' })
const qualificationSearchLoading = ref(false)
const qualificationCurrentPage = ref(1)
const qualificationPageSize = ref(10)
const qualificationTotalCount = ref(qualificationList.value.length)
const qualificationPaginatedList = ref([])
const qualificationForm = ref({ userId: '', userName: '', userEmail: '', phoneNumber: '', gender: '男', createdAt: '' })
const showQualificationDialog = ref(false)
const qualificationEditingId = ref('')
const qualificationSelectedIds = ref([])

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

function openAircraftDialog() {
  aircraftSelected.value = null
  aircraftForm.value = {
    id: '',
    name: '',
    model: '',
    transponderNo: '',
    bindTime: '',
    owner: '',
  }
  showAircraftDialog.value = true
}

function closeAircraftDialog() {
  showAircraftDialog.value = false
}

function saveAircraft() {
  const form = { ...aircraftForm.value }
  if (!form.name || !form.model || !form.transponderNo) return

  const record = {
    id: form.id || `aircraft-${Date.now()}`,
    name: form.name,
    model: form.model,
    transponderNo: form.transponderNo,
    bindTime: form.bindTime || new Date().toISOString().slice(0, 19).replace('T', ' '),
    owner: form.owner || '-',
  }

  if (aircraftSelected.value?.id) {
    aircraftList.value = aircraftList.value.map(item => item.id === aircraftSelected.value.id ? record : item)
  } else {
    aircraftList.value.unshift(record)
  }

  aircraftSelected.value = record
  aircraftTotalCount.value = aircraftList.value.length
  updateAircraftPagination()
  showAircraftDialog.value = false
}

function editAircraft(item) {
  aircraftSelected.value = item
  aircraftForm.value = { ...item }
  showAircraftDialog.value = true
}

function searchAircraft() {
  aircraftSearchLoading.value = true
  aircraftError.value = ''

  const keyword = (aircraftFilters.value.deviceName || '').trim().toLowerCase()
  const bindRange = aircraftFilters.value.bindTime || []

  const filtered = aircraftList.value.filter(item => {
    const matchName = !keyword || [item.name, item.model, item.transponderNo, item.owner].some(v => String(v || '').toLowerCase().includes(keyword))
    const bindTimeValue = item.bindTime ? new Date(item.bindTime.replace(/-/g, '/')).getTime() : null
    const startTime = bindRange[0] ? new Date(bindRange[0]).getTime() : null
    const endTime = bindRange[1] ? new Date(bindRange[1]).getTime() : null
    const matchTime = (!startTime || !bindTimeValue || bindTimeValue >= startTime) && (!endTime || !bindTimeValue || bindTimeValue <= endTime + 86399999)
    return matchName && matchTime
  })

  aircraftTotalCount.value = filtered.length
  aircraftPaginatedList.value = filtered.slice(0, aircraftPageSize.value)
  aircraftCurrentPage.value = 1
  setTimeout(() => {
    aircraftSearchLoading.value = false
  }, 120)
}

function resetAircraftSearch() {
  aircraftFilters.value = { deviceName: '', bindTime: [] }
  aircraftTotalCount.value = aircraftList.value.length
  aircraftCurrentPage.value = 1
  updateAircraftPagination()
}

function updateAircraftPagination() {
  aircraftTotalCount.value = aircraftList.value.length
  const start = (aircraftCurrentPage.value - 1) * aircraftPageSize.value
  aircraftPaginatedList.value = aircraftList.value.slice(start, start + aircraftPageSize.value)
}

function prevAircraftPage() {
  if (aircraftCurrentPage.value > 1) {
    aircraftCurrentPage.value--
    updateAircraftPagination()
  }
}

function nextAircraftPage() {
  const totalPages = Math.max(1, Math.ceil(aircraftTotalCount.value / aircraftPageSize.value))
  if (aircraftCurrentPage.value < totalPages) {
    aircraftCurrentPage.value++
    updateAircraftPagination()
  }
}

function getAircraftModuleName() {
  return infoModules.find(m => m.id === 'aircraft-status')?.name || '飞行器管理'
}

function updateQualificationPagination() {
  qualificationTotalCount.value = qualificationList.value.length
  const start = (qualificationCurrentPage.value - 1) * qualificationPageSize.value
  qualificationPaginatedList.value = qualificationList.value.slice(start, start + qualificationPageSize.value)
}

updateQualificationPagination()

function searchQualification() {
  qualificationSearchLoading.value = true
  const keyword = (qualificationFilters.value.phoneNumber || '').trim().toLowerCase()
  const dateValue = (qualificationFilters.value.createdAt || '').trim()
  const filtered = qualificationList.value.filter(item => {
    const matchPhone = !keyword || [item.userId, item.userName, item.phoneNumber].some(v => String(v || '').toLowerCase().includes(keyword))
    const matchDate = !dateValue || String(item.createdAt || '').includes(dateValue)
    return matchPhone && matchDate
  })
  qualificationTotalCount.value = filtered.length
  qualificationPaginatedList.value = filtered.slice(0, qualificationPageSize.value)
  qualificationCurrentPage.value = 1
  setTimeout(() => { qualificationSearchLoading.value = false }, 120)
}

function addQualification() {
  qualificationEditingId.value = ''
  qualificationForm.value = { userId: '', userName: '', userEmail: '', phoneNumber: '', gender: '男', createdAt: '' }
  showQualificationDialog.value = true
}

function isValidQualificationEmail(email) {
  return typeof email === 'string' && email.includes('@') && email.includes('.com')
}

function saveQualification() {
  const form = { ...qualificationForm.value }
  if (!form.userId || !form.userName || !form.phoneNumber) return
  if (!isValidQualificationEmail(form.userEmail)) {
    window.alert('请输入正确的邮箱格式，必须包含 @ 和 .com')
    return
  }
  const record = { id: qualificationEditingId.value || `${form.userId}-${Date.now()}`, ...form }
  if (qualificationEditingId.value) {
    qualificationList.value = qualificationList.value.map(item => item.id === qualificationEditingId.value ? record : item)
  } else {
    qualificationList.value.unshift(record)
  }
  showQualificationDialog.value = false
  qualificationSelectedIds.value = []
  updateQualificationPagination()
}

function deleteSelectedQualifications() {
  if (!qualificationSelectedIds.value.length) return
  qualificationList.value = qualificationList.value.filter(item => !qualificationSelectedIds.value.includes(item.id))
  qualificationSelectedIds.value = []
  updateQualificationPagination()
}

function closeQualificationDialog() {
  showQualificationDialog.value = false
}

function toggleQualificationSelection(id) {
  qualificationSelectedIds.value = qualificationSelectedIds.value.includes(id)
    ? qualificationSelectedIds.value.filter(item => item !== id)
    : [...qualificationSelectedIds.value, id]
}

function resetQualificationSearch() {
  qualificationFilters.value = { phoneNumber: '', createdAt: '' }
  qualificationCurrentPage.value = 1
  updateQualificationPagination()
}

function prevQualificationPage() {
  if (qualificationCurrentPage.value > 1) {
    qualificationCurrentPage.value--
    updateQualificationPagination()
  }
}

function nextQualificationPage() {
  const totalPages = Math.max(1, Math.ceil(qualificationTotalCount.value / qualificationPageSize.value))
  if (qualificationCurrentPage.value < totalPages) {
    qualificationCurrentPage.value++
    updateQualificationPagination()
  }
}

// 点击模块
function selectModule(module) {
  if (module.status === 'pending') return

  activeModuleId.value = module.id

  if (module.id === 'route-info') {
    currentView.value = 'list'
    fetchRoutes()
  } else if (module.id === 'aircraft-status') {
    currentView.value = 'list'
    updateAircraftPagination()
  } else if (module.id === 'qualification-approval') {
    currentView.value = 'list'
    updateQualificationPagination()
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

// 获取禁飞区列表
async function fetchFences() {
  isLoading.value = true
  fenceError.value = ''

  try {
    const resp = await fetch('/api/multiSource/airSpace/noFlyZone/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        typeCode: fenceTypeCode.value,
        page: fenceCurrentPage.value,
        pageSize: fencePageSize.value,
      }),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(`请求失败: ${resp.status}`)
    }

    const data = await resp.json()
    console.log('[禁飞区列表] 返回数据:', data)

    if (data?.status === 'success' && data?.data) {
      fenceList.value = data.data.items || []
      fenceTotalCount.value = data.data.count || 0
      fenceTotalPages.value = Math.max(1, Math.ceil(fenceTotalCount.value / fencePageSize.value))
      paginatedFences.value = fenceList.value
    } else {
      fenceList.value = []
      fenceTotalCount.value = 0
      fenceTotalPages.value = 1
      paginatedFences.value = []
    }
  } catch (err) {
    console.error('[禁飞区列表] 请求错误:', err)
    fenceError.value = err?.message || '获取禁飞区列表失败'
  } finally {
    isLoading.value = false
  }
}

async function toggleNoFlyZoneVisibility(zone) {
  const zoneId = zone.zone_id
  if (!zoneId) return

  if (noFlyZoneVisibleMap.value[zoneId]) {
    noFlyZoneVisibleMap.value[zoneId] = false
    emit('hide-no-fly-zone', { zoneId, typeCode: zone.type_code })
  } else {
    noFlyZoneVisibleMap.value[zoneId] = true
    try {
      const resp = await fetch('/api/multiSource/airSpace/noFlyZone/detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          typeCode: zone.type_code || 'electronic_fence',
          zoneId: zoneId,
        }),
      })
      const data = await resp.json()
      console.log('[禁飞区详情] 返回:', data)
      if (data?.status === 'success' && data?.data?.zone) {
        emit('show-no-fly-zone', data.data.zone)
      } else {
        noFlyZoneVisibleMap.value[zoneId] = false
        console.error('[禁飞区详情] 查询失败:', data)
      }
    } catch (err) {
      noFlyZoneVisibleMap.value[zoneId] = false
      console.error('[禁飞区详情] 请求错误:', err)
    }
  }
}

async function syncNoFlyZoneToRedis() {
  isSyncing.value = true
  try {
    const resp = await fetch('/api/multiSource/redisSync/syncNoFlyZoneToRedis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const data = await resp.json()
    if (data?.status === 'success') {
      const d = data.data || {}
      alert(`同步完成：共 ${d.totalGroups || 0} 组，${d.totalRecords || 0} 条记录，成功 ${d.syncedCount || 0}，失败 ${d.failedCount || 0}，跳过 ${d.skippedCount || 0}`)
    } else {
      alert('同步失败：' + (data?.message || '未知错误'))
    }
  } catch (err) {
    console.error('[禁飞区同步] 请求错误:', err)
    alert('同步请求失败')
  } finally {
    isSyncing.value = false
  }
}

async function deleteSelectedFences() {
  const ids = [...selectedFenceIds.value]
  if (ids.length === 0) return

  const confirmed = window.confirm(`确定要删除选中的 ${ids.length} 个禁飞区吗？`)
  if (!confirmed) return

  let successCount = 0
  for (const zoneId of ids) {
    const zone = fenceList.value.find(z => z.zone_id === zoneId)
    if (!zone) continue
    try {
      const resp = await fetch('/api/multiSource/airSpace/noFlyZone/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          typeCode: zone.type_code || 'electronic_fence',
          zoneId: zoneId,
          cleanupRedis: true,
        }),
      })
      const data = await resp.json()
      if (data?.status === 'success') {
        successCount++
        // 如果该禁飞区正在显示，先隐藏
        if (noFlyZoneVisibleMap.value[zoneId]) {
          noFlyZoneVisibleMap.value[zoneId] = false
          emit('hide-no-fly-zone', { zoneId, typeCode: zone.type_code })
        }
      } else {
        console.error('[禁飞区删除] 失败:', zoneId, data?.message)
      }
    } catch (err) {
      console.error('[禁飞区删除] 请求错误:', zoneId, err)
    }
  }

  if (successCount > 0) {
    selectedFenceIds.value = new Set()
    fetchFences()
  }
}

function toggleFenceSelection(zoneId) {
  const newSet = new Set(selectedFenceIds.value)
  if (newSet.has(zoneId)) {
    newSet.delete(zoneId)
  } else {
    newSet.add(zoneId)
  }
  selectedFenceIds.value = newSet
}

function toggleAllFenceSelection() {
  const pageIds = paginatedFences.value.map(z => z.zone_id)
  const allSelected = pageIds.length > 0 && pageIds.every(id => selectedFenceIds.value.has(id))
  const newSet = new Set(selectedFenceIds.value)
  if (allSelected) {
    pageIds.forEach(id => newSet.delete(id))
  } else {
    pageIds.forEach(id => newSet.add(id))
  }
  selectedFenceIds.value = newSet
}

function prevFencePage() {
  if (fenceCurrentPage.value > 1) {
    fenceCurrentPage.value--
    fetchFences()
  }
}

function nextFencePage() {
  if (fenceCurrentPage.value < fenceTotalPages.value) {
    fenceCurrentPage.value++
    fetchFences()
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
    manual: '手动事件',
  }
  return map[type] || type || '-'
}

function addAnomalyEvent(payload) {
  if (!payload) return
  const { routeId, routeName, eventType, position, responseData } = payload
  const severity = responseData?.severity || {}
  const eventGrid = responseData?.eventGrid || {}
  const warningArea = responseData?.warningArea || null
  const actions = responseData?.actions || []
  const landingPlan = responseData?.landingPlan || null
  const control = responseData?.control || null
  const persistence = responseData?.persistence || null
  const timeline = responseData?.timeline || []

  const displayType = formatEventTypeLabel(eventType)
  const positionText = Array.isArray(position)
    ? position.map(v => typeof v === 'number' ? v.toFixed(6) : v).join(', ')
    : '未知位置'

  const newEvent = {
    id: responseData?.eventId || `event-${Date.now()}`,
    name: `${routeName || routeId || '未知航线'} · ${displayType}`,
    status: displayType,
    time: new Date().toLocaleString('zh-CN'),
    source: 'simulation',
    routeId,
    routeName: routeName || routeId || '未知航线',
    detail: {
      displayType,
      eventType,
      eventTimeText: new Date().toLocaleString('zh-CN'),
      positionText,
      gridLevel: warningArea?.gridLevel ?? '-',
      speedText: '-',
      linkLostText: '-',
      batteryText: '-',
      deviationText: '-',
      homeText: '-',
      landingSiteText: '-',
      rescueText: '-',
      controlText: formatControlText(control),
      persistText: formatPersistenceText(persistence),
    },
    form: null,
    severity,
    eventGrid,
    warningArea,
    actions,
    landingPlan,
    control,
    persistence,
    timeline,
    judgementResult: {
      status: 'success',
      data: responseData,
    },
  }

  eventList.value.unshift(newEvent)
  selectedEvent.value = newEvent
  eventJudgementResult.value = newEvent.judgementResult
  activeModuleId.value = 'event-management'
  currentView.value = 'event-dashboard'
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
  goBack,
  addAnomalyEvent,
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
      <!-- 飞行器管理视图 -->
      <template v-if="activeModuleId === 'aircraft-status'">
        <div class="breadcrumb">
          <span class="breadcrumb-item">智绘平台</span>
          <span class="breadcrumb-separator">/</span>
          <span class="breadcrumb-item">信息管理系统</span>
          <span class="breadcrumb-separator">/</span>
          <span class="breadcrumb-item current">飞行器管理</span>
        </div>

        <div class="aircraft-view">
          <section class="aircraft-filter-card">
            <div class="filter-inline">
              <div class="form-item inline-item device-item">
                <label>设备名称</label>
                <input v-model="aircraftFilters.deviceName" type="text" placeholder="请输入设备名称" />
              </div>
              <div class="form-item inline-item time-item">
                <label>绑定时间</label>
                <input v-model="aircraftFilters.bindTime[0]" type="date" />
              </div>
              <div class="filter-actions inline-actions">
                <button class="btn-filter primary" @click="searchAircraft" :disabled="aircraftSearchLoading">
                  <Loader2 v-if="aircraftSearchLoading" :size="14" class="spin" />
                  <span v-else>搜索</span>
                </button>
                <button class="btn-filter" @click="resetAircraftSearch">重置</button>
                <button class="btn-filter add" @click="openAircraftDialog">新增</button>
              </div>
            </div>
          </section>

          <section class="aircraft-table-card">
            <div class="table-container">
              <table class="data-table aircraft-table">
                <thead>
                  <tr>
                    <th>无人机名称</th>
                    <th>无人机型号</th>
                    <th>飞控序列号</th>
                    <th>绑定时间</th>
                    <th>责任人</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in aircraftPaginatedList" :key="item.id">
                    <td class="col-name">{{ item.name }}</td>
                    <td>{{ item.model }}</td>
                    <td class="col-id">{{ item.transponderNo }}</td>
                    <td>{{ item.bindTime }}</td>
                    <td>{{ item.owner }}</td>
                    <td class="col-actions">
                      <button class="btn-action view" @click="editAircraft(item)">修改</button>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div class="pagination">
                <span class="page-info">共 {{ aircraftTotalCount }} 条，第 {{ aircraftCurrentPage }} / {{ Math.max(1, Math.ceil(aircraftTotalCount / aircraftPageSize)) }} 页</span>
                <div class="page-buttons">
                  <button class="btn-page" @click="prevAircraftPage" :disabled="aircraftCurrentPage <= 1">上一页</button>
                  <button class="btn-page" @click="nextAircraftPage" :disabled="aircraftCurrentPage >= Math.max(1, Math.ceil(aircraftTotalCount / aircraftPageSize))">下一页</button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </template>

      <!-- 飞行资质管理视图 -->
      <template v-if="activeModuleId === 'qualification-approval'">
        <div class="breadcrumb">
          <span class="breadcrumb-item">智绘平台</span>
          <span class="breadcrumb-separator">/</span>
          <span class="breadcrumb-item">信息管理系统</span>
          <span class="breadcrumb-separator">/</span>
          <span class="breadcrumb-item current">飞行资质管理</span>
        </div>

        <div class="qualification-view">
          <section class="qualification-filter-card">
            <div class="qualification-filter-row">
              <div class="form-item qualification-field phone-field">
                <label>手机号</label>
                <input v-model="qualificationFilters.phoneNumber" type="text" placeholder="请输入手机号" />
              </div>
              <div class="form-item qualification-field time-field">
                <label>创建时间</label>
                <input v-model="qualificationFilters.createdAt" type="date" />
              </div>
              <div class="qualification-actions">
                <button class="btn-filter primary" @click="searchQualification" :disabled="qualificationSearchLoading">
                  <Loader2 v-if="qualificationSearchLoading" :size="14" class="spin" />
                  <span v-else>搜索</span>
                </button>
                <button class="btn-filter add" @click="addQualification">添加</button>
                <button class="btn-filter danger" @click="deleteSelectedQualifications" :disabled="!qualificationSelectedIds.length">删除</button>
              </div>
            </div>
          </section>

          <section class="qualification-table-card">
            <div class="table-container">
              <table class="data-table qualification-table">
                <thead>
                  <tr>
                    <th style="width: 56px;">选择</th>
                    <th>用户ID</th>
                    <th>用户名称</th>
                    <th>用户邮箱</th>
                    <th>手机号码</th>
                    <th>用户性别</th>
                    <th>创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in qualificationPaginatedList" :key="item.id">
                    <td><input type="checkbox" :checked="qualificationSelectedIds.includes(item.id)" @change="toggleQualificationSelection(item.id)" /></td>
                    <td class="col-id">{{ item.userId }}</td>
                    <td class="col-name">{{ item.userName }}</td>
                    <td>{{ item.userEmail }}</td>
                    <td>{{ item.phoneNumber }}</td>
                    <td>{{ item.gender }}</td>
                    <td>{{ item.createdAt }}</td>
                  </tr>
                </tbody>
              </table>

              <div class="pagination qualification-pagination">
                <span class="page-info">共 {{ qualificationTotalCount }} 条</span>
                <div class="page-buttons">
                  <button class="btn-page" @click="prevQualificationPage" :disabled="qualificationCurrentPage <= 1">上一页</button>
                  <button class="btn-page current-page">{{ qualificationCurrentPage }}</button>
                  <button class="btn-page" @click="nextQualificationPage" :disabled="qualificationCurrentPage >= Math.max(1, Math.ceil(qualificationTotalCount / qualificationPageSize))">下一页</button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </template>

      <div v-if="showQualificationDialog" class="dialog-mask" @click.self="closeQualificationDialog">
        <div class="dialog-card qualification-dialog">
          <div class="dialog-header">
            <h3>添加飞行资质</h3>
            <button class="dialog-close" @click="closeQualificationDialog"><X :size="18" /></button>
          </div>
          <div class="dialog-body">
            <div class="form-grid two-col">
              <div class="form-item"><label>用户ID</label><input v-model="qualificationForm.userId" type="text" placeholder="请输入用户ID" /></div>
              <div class="form-item"><label>用户名称</label><input v-model="qualificationForm.userName" type="text" placeholder="请输入用户名称" /></div>
            </div>
            <div class="form-grid two-col">
              <div class="form-item"><label>用户邮箱</label><input v-model="qualificationForm.userEmail" type="text" placeholder="请输入用户邮箱" /></div>
              <div class="form-item"><label>手机号码</label><input v-model="qualificationForm.phoneNumber" type="text" placeholder="请输入手机号码" /></div>
            </div>
            <div class="form-grid two-col">
              <div class="form-item"><label>用户性别</label><input v-model="qualificationForm.gender" type="text" placeholder="请输入用户性别" /></div>
              <div class="form-item"><label>创建时间</label><input v-model="qualificationForm.createdAt" type="date" /></div>
            </div>
          </div>
          <div class="dialog-footer">
            <button class="btn-dialog cancel" @click="closeQualificationDialog">取消</button>
            <button class="btn-dialog primary" @click="saveQualification">确认</button>
          </div>
        </div>
      </div>

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
      </template>

      <!-- 禁飞区管理视图 -->
      <template v-if="activeModuleId === 'fence-info'">
          <!-- 面包屑导航 -->
          <div class="breadcrumb">
            <span class="breadcrumb-item">智绘平台</span>
            <span class="breadcrumb-separator">/</span>
            <span class="breadcrumb-item">信息管理系统</span>
            <span class="breadcrumb-separator">/</span>
            <span class="breadcrumb-item current">禁飞区管理</span>
          </div>

          <!-- 禁飞区列表视图 -->
          <div v-if="currentView === 'list'" class="fence-list-view">
            <div class="view-header">
              <h3>禁飞区列表</h3>
              <div class="view-header-actions">
                <select v-model="fenceTypeCode" class="type-select" @change="fenceCurrentPage = 1; fetchFences()">
                  <option value="electronic_fence">电子围栏</option>
                  <option value="risk_area">风险区域</option>
                </select>
                <button class="btn-refresh" @click="fetchFences" :disabled="isLoading">
                  <Loader2 v-if="isLoading" :size="14" class="spin" />
                  <RefreshCw v-else :size="14" />
                  刷新
                </button>
                <button class="btn-sync" @click="syncNoFlyZoneToRedis" :disabled="isSyncing">
                  <Loader2 v-if="isSyncing" :size="14" class="spin" />
                  <Database v-else :size="14" />
                  同步
                </button>
                <button class="btn-delete" @click="deleteSelectedFences" :disabled="selectedFenceIds.size === 0">
                  <Trash2 :size="14" />
                  删除
                </button>
              </div>
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
              <p>暂无禁飞区数据</p>
            </div>

            <!-- 数据表格 -->
            <div v-else class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th class="col-checkbox">
                      <input
                        type="checkbox"
                        :checked="paginatedFences.length > 0 && paginatedFences.every(z => selectedFenceIds.has(z.zone_id))"
                        @change="toggleAllFenceSelection"
                      />
                    </th>
                    <th>序号</th>
                    <th>区域ID</th>
                    <th>名称</th>
                    <th>类型</th>
                    <th>底面高(m)</th>
                    <th>顶面高(m)</th>
                    <th>边界范围</th>
                    <th>显示</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(zone, index) in paginatedFences" :key="zone.zone_id">
                    <td class="col-checkbox">
                      <input
                        type="checkbox"
                        :checked="selectedFenceIds.has(zone.zone_id)"
                        @change="toggleFenceSelection(zone.zone_id)"
                      />
                    </td>
                    <td class="col-index">{{ (fenceCurrentPage - 1) * fencePageSize + index + 1 }}</td>
                    <td class="col-id">{{ zone.zone_id }}</td>
                    <td class="col-name">{{ zone.name || '-' }}</td>
                    <td class="col-type">
                      <span class="type-badge" :class="zone.type_code === 'electronic_fence' ? 'type-circle' : 'type-polygon'">
                        {{ zone.type_name || (zone.type_code === 'electronic_fence' ? '电子围栏' : '风险区域') }}
                      </span>
                    </td>
                    <td class="col-coord">{{ zone.bottom ?? '-' }}</td>
                    <td class="col-coord">{{ zone.top ?? '-' }}</td>
                    <td class="col-coord">
                      <template v-if="zone.bbox">
                        {{ Number(zone.bbox.minlon).toFixed(4) }}, {{ Number(zone.bbox.minlat).toFixed(4) }} ~
                        {{ Number(zone.bbox.maxlon).toFixed(4) }}, {{ Number(zone.bbox.maxlat).toFixed(4) }}
                      </template>
                      <template v-else>-</template>
                    </td>
                    <td class="col-toggle">
                      <label class="toggle-switch">
                        <input
                          type="checkbox"
                          :checked="!!noFlyZoneVisibleMap[zone.zone_id]"
                          @change="toggleNoFlyZoneVisibility(zone)"
                        >
                        <span class="toggle-slider"></span>
                      </label>
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
            </div>
            <div class="panel-body list-body compact-body">
              <div v-if="eventList.length === 0" class="placeholder-card active-card compact-card">
                <AlertTriangle :size="28" class="placeholder-icon" />
                <h4>暂无事件</h4>
                <p>触发异常模拟后，事件会自动显示在这里。</p>
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
                <div v-if="selectedEvent.source === 'simulation'" class="info-row event-source-row"><span>事件来源</span><strong class="source-sim">异常模拟</strong></div>
                <div v-if="selectedEvent.routeName" class="info-row"><span>航线名称</span><strong>{{ selectedEvent.routeName }}</strong></div>
                <div class="info-row"><span>事件类型</span><strong>{{ selectedEvent.detail.displayType }}</strong></div>
                <div class="info-row"><span>发生时间</span><strong>{{ selectedEvent.detail.eventTimeText }}</strong></div>
                <div class="info-row"><span>位置</span><strong>{{ selectedEvent.detail.positionText }}</strong></div>
                <div v-if="selectedEvent.severity" class="info-row risk-row"><span>风险等级</span><strong :class="getSeverityClass(selectedEvent.severity.level)">{{ selectedEvent.severity.label || '-' }}</strong></div>
                <div v-if="selectedEvent.severity" class="info-row"><span>风险分值</span><strong>{{ selectedEvent.severity.score ?? '-' }}</strong></div>
                <div v-if="selectedEvent.actions && selectedEvent.actions.length" class="info-row"><span>处理建议</span><strong>{{ formatActionsText(selectedEvent.actions) }}</strong></div>
                <div v-if="selectedEvent.landingPlan" class="info-row"><span>返航方案</span><strong>{{ formatLandingPlanText(selectedEvent.landingPlan) }}</strong></div>
                <div v-if="selectedEvent.control" class="info-row"><span>临时围栏</span><strong>{{ formatControlText(selectedEvent.control) }}</strong></div>
                <template v-if="selectedEvent.source !== 'simulation'">
                  <div class="info-row"><span>网格层级</span><strong>{{ selectedEvent.detail.gridLevel }}</strong></div>
                  <div class="info-row"><span>飞行速度</span><strong>{{ selectedEvent.form?.飞行速度 || selectedEvent.detail.speedText }}</strong></div>
                  <div class="info-row"><span>失联时长</span><strong>{{ selectedEvent.form?.失联时长 || selectedEvent.detail.linkLostText }}</strong></div>
                  <div class="info-row"><span>电量</span><strong>{{ selectedEvent.form?.电量 || selectedEvent.detail.batteryText }}</strong></div>
                  <div class="info-row"><span>偏航距离</span><strong>{{ selectedEvent.form?.偏航距离 || selectedEvent.detail.deviationText }}</strong></div>
                  <div class="info-row"><span>返回点</span><strong>{{ selectedEvent.detail.homeText }}</strong></div>
                  <div class="info-row"><span>备降点</span><strong>{{ selectedEvent.detail.landingSiteText }}</strong></div>
                  <div class="info-row"><span>救援资源</span><strong>{{ selectedEvent.detail.rescueText }}</strong></div>
                </template>
              </div>
            </div>
          </section>

        </div>
      </template>

      <!-- 其他模块 -->
      <template v-else>
      </template>
    </main>

    <div v-if="showAircraftDialog" class="dialog-mask" @click.self="closeAircraftDialog">
      <div class="dialog-card aircraft-dialog">
        <div class="dialog-header">
          <h3>{{ aircraftSelected ? '修改飞行器' : '新增飞行器' }}</h3>
          <button class="dialog-close" @click="closeAircraftDialog"><X :size="18" /></button>
        </div>
        <div class="dialog-body">
          <div class="form-grid two-col">
            <div class="form-item"><label>无人机名称</label><input v-model="aircraftForm.name" type="text" placeholder="请输入无人机名称" /></div>
            <div class="form-item"><label>无人机型号</label><input v-model="aircraftForm.model" type="text" placeholder="请输入无人机型号" /></div>
          </div>
          <div class="form-grid two-col">
            <div class="form-item"><label>飞控序列号</label><input v-model="aircraftForm.transponderNo" type="text" placeholder="请输入飞控序列号" /></div>
            <div class="form-item"><label>绑定时间</label><input v-model="aircraftForm.bindTime" type="datetime-local" /></div>
          </div>
          <div class="form-grid two-col">
            <div class="form-item"><label>责任人</label><input v-model="aircraftForm.owner" type="text" placeholder="请输入责任人" /></div>
            <div class="form-item"><label>记录编号</label><input v-model="aircraftForm.id" type="text" placeholder="新增时自动生成" readonly /></div>
          </div>
        </div>
        <div class="dialog-footer">
          <button class="btn-dialog cancel" @click="closeAircraftDialog">取消</button>
          <button class="btn-dialog primary" @click="saveAircraft">确认</button>
        </div>
      </div>
    </div>

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

.view-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.type-select {
  height: 32px;
  padding: 0 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 13px;
  cursor: pointer;
}

.type-select:focus {
  outline: none;
  border-color: #7db8e0;
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

.btn-delete {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid #fecaca;
  border-radius: 6px;
  background: #ffffff;
  color: #dc2626;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-delete:hover:not(:disabled) {
  background: #fef2f2;
  border-color: #f87171;
}

.btn-delete:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-sync {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  background: #ffffff;
  color: #2563eb;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-sync:hover:not(:disabled) {
  background: #eff6ff;
  border-color: #93c5fd;
}

.btn-sync:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.col-checkbox {
  width: 36px;
  text-align: center;
}

.col-checkbox input[type="checkbox"] {
  width: 15px;
  height: 15px;
  cursor: pointer;
  accent-color: #dc2626;
}

.aircraft-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.aircraft-filter-card,
.aircraft-table-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
}

.filter-inline {
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  gap: 16px;
  padding: 16px;
}

.filter-inline .form-item {
  margin-bottom: 0;
}

.inline-item {
  margin: 0;
  flex: 0 0 auto;
}

.device-item {
  width: 240px;
}

.time-item {
  width: 180px;
}

.inline-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
  padding-left: 24px;
}

.qualification-filter-row {
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  gap: 16px;
  padding: 16px;
}

.qualification-field {
  margin-bottom: 0;
}

.phone-field {
  width: 220px;
}

.time-field {
  width: 200px;
}

.qualification-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.btn-filter.danger {
  background: #fee2e2;
  color: #dc2626;
  border-color: #fecaca;
}

.qualification-table th,
.qualification-table td {
  text-align: center;
}

.qualification-pagination {
  justify-content: flex-end;
}

.current-page {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}

.btn-filter.danger {
  background: #fee2e2;
  color: #dc2626;
  border-color: #fecaca;
}

.btn-filter {
  height: 34px;
  padding: 0 14px;
  border-radius: 6px;
  border: 1px solid #dbe4f0;
  background: #ffffff;
  color: #334155;
  cursor: pointer;
}

.btn-filter.primary {
  background: #2563eb;
  color: #ffffff;
  border-color: #2563eb;
}

.btn-filter.add {
  background: #eff6ff;
  color: #2563eb;
  border-color: #bfdbfe;
}

.filter-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  gap: 12px;
  padding: 16px;
}

.aircraft-table th,
.aircraft-table td {
  text-align: center;
}

.aircraft-dialog .dialog-body {
  padding: 20px;
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
  white-space: nowrap;
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
  grid-template-columns: 1fr 2fr;
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

.source-sim {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.15);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
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
  margin: 0;
  font-size: 20px;
  color: #1e293b;
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

.qualification-dialog .dialog-body {
  padding: 24px;
  overflow-y: auto;
}

.qualification-dialog .dialog-footer {
  padding: 16px 24px 24px;
}

.qualification-dialog .form-grid {
  padding: 0;
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

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
  cursor: pointer;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #cbd5e1;
  border-radius: 22px;
  transition: background-color 0.25s ease;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  height: 18px;
  width: 18px;
  left: 2px;
  bottom: 2px;
  background-color: #fff;
  border-radius: 50%;
  transition: transform 0.25s ease;
}

.toggle-switch input:checked + .toggle-slider {
  background-color: #5b9fd4;
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(18px);
}

.col-toggle {
  text-align: center;
  vertical-align: middle;
}
</style>
