<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CesiumMap from './data-screen/CesiumMap.vue'
import ElectronicFence from './data-screen/functions/8_ElectronicFence.vue'

const now = ref(new Date())
let clockTimer = null

const isOnline = ref(navigator.onLine)
const cesiumMapRef = ref(null)
const fencePanelRef = ref(null)

// 模拟无人机状态数据
const uavStatus = ref({
  online: false,
  speed: 0,
  battery: 100,
  altitude: 0,
  position: [0, 0],
  signal: 0,
  heading: 0,
})

// 飞行器列表数据
const aircraftList = ref([])
const aircraftLoading = ref(false)
const aircraftError = ref('')

async function fetchAircraftList() {
  aircraftLoading.value = true
  aircraftError.value = ''
  try {
    const resp = await fetch('/api/aircraft/list', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!resp.ok) {
      throw new Error(`请求失败: ${resp.status}`)
    }
    const data = await resp.json()
    console.log('[飞行器列表] 返回数据:', data)
    if (data?.status === 'success' && Array.isArray(data?.data)) {
      aircraftList.value = data.data
    } else if (Array.isArray(data)) {
      aircraftList.value = data
    } else {
      aircraftList.value = []
    }
  } catch (err) {
    console.error('[飞行器列表] 请求错误:', err)
    aircraftError.value = err?.message || '获取飞行器列表失败'
    aircraftList.value = []
  } finally {
    aircraftLoading.value = false
  }
}

const props = defineProps({
  routeData: {
    type: Array,
    default: () => []
  },
  eventVisualization: {
    type: Object,
    default: null,
  },
  visibleNoFlyZones: {
    type: Object,
    default: () => ({}),
  },
  theme: {
    type: String,
    default: 'white',
  },
})

const emit = defineEmits(['switch_page', 'visualize-event', 'start-event-simulation', 'stop-event-simulation', 'anomaly-triggered'])

// ========== 浙江省天气配置 ==========
// 浙江省11个地级市经纬度
const zhejiangCities = [
  { name: '杭州', lat: 30.2741, lon: 120.1551 },
  { name: '宁波', lat: 29.8683, lon: 121.5440 },
  { name: '温州', lat: 28.0006, lon: 120.6994 },
  { name: '嘉兴', lat: 30.7522, lon: 120.7550 },
  { name: '湖州', lat: 30.8928, lon: 120.0930 },
  { name: '绍兴', lat: 30.0020, lon: 120.5802 },
  { name: '金华', lat: 29.0789, lon: 119.6479 },
  { name: '衢州', lat: 28.9356, lon: 118.8590 },
  { name: '舟山', lat: 29.9850, lon: 122.2075 },
  { name: '台州', lat: 28.6565, lon: 121.4206 },
  { name: '丽水', lat: 28.4672, lon: 119.9229 },
]

const currentCityIndex = ref(4) // 默认选中湖州（德清所在）
const weatherData = ref({
  temperature: null,
  visibility: null,
  pressure: null,
  cloudcover: null,
  humidity: null,
  windspeed: null,
  winddirection: null,
  weathercode: null,
})
const weatherLoading = ref(false)
const weatherError = ref('')
const showCitySelector = ref(false)

async function fetchWeather() {
  if (weatherLoading.value) return
  weatherLoading.value = true
  weatherError.value = ''
  
  const city = zhejiangCities[currentCityIndex.value]
  try {
    // 使用 Open-Meteo API（免费无需 key）
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,visibility&timezone=Asia/Shanghai`
    
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`请求失败: ${resp.status}`)
    
    const data = await resp.json()
    const current = data.current
    
    weatherData.value = {
      temperature: current.temperature_2m,
      humidity: current.relative_humidity_2m,
      apparent: current.apparent_temperature,
      precipitation: current.precipitation,
      weathercode: current.weather_code,
      cloudcover: current.cloud_cover,
      pressure: current.pressure_msl,
      windspeed: current.wind_speed_10m,
      winddirection: current.wind_direction_10m,
      visibility: current.visibility ? (current.visibility / 1000).toFixed(1) : null,
    }
  } catch (err) {
    console.error('[天气] 获取失败:', err)
    weatherError.value = err.message || '获取天气失败'
  } finally {
    weatherLoading.value = false
  }
}

function switchCity(index) {
  currentCityIndex.value = index
  showCitySelector.value = false
  fetchWeather()
}

function toggleCitySelector() {
  showCitySelector.value = !showCitySelector.value
}

// WMO 天气代码映射
const weatherCodeMap = {
  0: '晴',
  1: '晴间多云',
  2: '多云',
  3: '阴',
  45: '雾',
  48: '霜雾',
  51: '小毛毛雨',
  53: '中毛毛雨',
  55: '大毛毛雨',
  56: '冻毛毛雨',
  57: '强冻毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '冻雨',
  67: '强冻雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '雪粒',
  80: '小阵雨',
  81: '中阵雨',
  82: '强阵雨',
  85: '小阵雪',
  86: '大阵雪',
  95: '雷暴',
  96: '雷暴+冰雹',
  99: '雷暴+大冰雹',
}

const weatherIconMap = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌧️', 53: '🌧️', 55: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '❄️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  85: '🌨️', 86: '❄️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
}

const currentCityName = computed(() => zhejiangCities[currentCityIndex.value].name)
const weatherDesc = computed(() => weatherCodeMap[weatherData.value.weathercode] || '--')
const weatherIcon = computed(() => weatherIconMap[weatherData.value.weathercode] || '☁️')
const windDirectionText = computed(() => {
  const d = weatherData.value.winddirection
  if (d === null || d === undefined) return '--'
  const directions = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
  const index = Math.round(d / 45) % 8
  return directions[index]
})

const isSimulationModalVisible = ref(false)
const selectedSimulationRouteIds = ref([])
const simulationTimers = ref([])
const simulationParamsMap = ref({})

const simulationParams = ref({
  user: {
    level: 14,
    eventTime: Date.now(),
    warningRadiusMeters: 500,
    maxRouteReturnGrids: 300,
    maxRouteCheckGrids: 500,
    persist: true,
    cruisingSpeed: 15,
    groundRescueSpeed: 12,
  },
  auto: {
    eventType: 'lost_contact',
    telemetry: {
      speed: 16,
      battery: 28,
      linkLostSeconds: 90,
      deviationMeters: 120,
    },
    position: [120.1234, 30.2345, 120],
    flightPlan: {
      home: [120.13, 30.22, 80],
    },
    control: {
      apply: false,
      radiusMeters: 500,
      maxGridCount: 300,
      ttlSeconds: 1800,
    },
    landingSites: [],
    rescueResources: [],
    condition: {},
  }
})

const networkStatus = computed(() => {
  return isOnline.value ? '运行中' : '网络未连接'
})

const networkStatusClass = computed(() => {
  return isOnline.value ? 'online' : 'offline'
})

const timeText = computed(() => {
  const d = now.value
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
})

function handleOnline() {
  isOnline.value = true
}

function handleOffline() {
  isOnline.value = false
}

onMounted(() => {
  clockTimer = window.setInterval(() => {
    now.value = new Date()
  }, 1000)

  isOnline.value = navigator.onLine
  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  
  // 获取飞行器列表
  fetchAircraftList()
  // 获取天气数据
  fetchWeather()
})

onBeforeUnmount(() => {
  if (clockTimer) {
    window.clearInterval(clockTimer)
    clockTimer = null
  }
  simulationTimers.value.forEach(t => window.clearTimeout(t))
  simulationTimers.value = []
  window.removeEventListener('online', handleOnline)
  window.removeEventListener('offline', handleOffline)
})

watch(() => cesiumMapRef.value?.isMapReady, (ready) => {
  if (ready) {
    console.log('[MonitoringScreen] CesiumMap 就绪')
    drawAllRoutes()
  }
})

watch(() => props.routeData, () => {
  drawAllRoutes()
}, { deep: true })

watch(() => props.eventVisualization, async (payload) => {
  if (payload) {
    await drawEventVisualization(payload)
  } else {
    clearEventVisualization()
  }
}, { deep: true, immediate: true })

function drawAllRoutes() {
  const routes = props.routeData || []
  console.log('[MonitoringScreen] 绘制航线:', routes.length)

  routes.forEach(route => {
    if (route && route.id && route.path) {
      if (cesiumMapRef.value && typeof cesiumMapRef.value.drawRouteGrid === 'function') {
        cesiumMapRef.value.drawRouteGrid(route.id, route.path)
      }
    }
  })
}

function clearRouteGrid(routeId) {
  if (cesiumMapRef.value && typeof cesiumMapRef.value.clearRouteGrid === 'function') {
    cesiumMapRef.value.clearRouteGrid(routeId)
  }
}

function clearEventVisualization() {
  if (cesiumMapRef.value && typeof cesiumMapRef.value.clearEventVisualization === 'function') {
    cesiumMapRef.value.clearEventVisualization()
  }
}

function drawWarningSampleGrids(warningArea) {
  const gridCells = warningArea?.gridCenters?.data?.cells
  if (!Array.isArray(gridCells) || gridCells.length === 0) return
  const cells = gridCells.map(cell => ({
    bounds: {
      west: cell.minlon,
      east: cell.maxlon,
      south: cell.minlat,
      north: cell.maxlat,
      top: cell.top,
      bottom: cell.bottom ?? 0,
    },
    color: '#f59e0b',
    level: warningArea?.gridLevel,
  }))
  if (cesiumMapRef.value && typeof cesiumMapRef.value.drawGridBoundary === 'function') {
    cesiumMapRef.value.drawGridBoundary({ cells })
  }
}

async function drawEventVisualization(payload) {
  if (!cesiumMapRef.value) return

  if (payload?.eventGrid && typeof cesiumMapRef.value.drawGridBoundary === 'function') {
    cesiumMapRef.value.drawGridBoundary({
      code: payload.eventGrid.code,
      center: payload.eventGrid.center,
      bounds: {
        west: payload.eventGrid.minlon,
        east: payload.eventGrid.maxlon,
        south: payload.eventGrid.minlat,
        north: payload.eventGrid.maxlat,
        top: payload.eventGrid.top,
        bottom: payload.eventGrid.bottom,
      },
    })
  }

  await drawWarningSampleGrids(payload?.warningArea)

  if (typeof cesiumMapRef.value.drawEventVisualization === 'function') {
    cesiumMapRef.value.drawEventVisualization({
      eventPoint: payload?.eventPoint,
      warningArea: payload?.warningArea,
    })
  }
}

const routeStats = computed(() => {
  const routes = props.routeData || []
  return {
    total: routes.length,
    totalGrids: routes.reduce((sum, r) => sum + (r.path?.length || 0), 0)
  }
})

function handleDrawSphereFence(params) {
  if (cesiumMapRef.value && typeof cesiumMapRef.value.startDrawSphereFence === 'function') {
    cesiumMapRef.value.startDrawSphereFence(params, () => {})
  }
}

function handleDrawLineFence(params) {
  if (cesiumMapRef.value && typeof cesiumMapRef.value.startDrawLineFence === 'function') {
    cesiumMapRef.value.startDrawLineFence(params, () => {})
  }
}

function handleCompleteSphereFence(fenceData) {
  if (cesiumMapRef.value && typeof cesiumMapRef.value.completeSphereFence === 'function') {
    cesiumMapRef.value.completeSphereFence(fenceData, (data) => {
      fencePanelRef.value?.confirmFenceDraw(data)
    })
  }
}

function handleCompleteLineFence(fenceData) {
  if (cesiumMapRef.value && typeof cesiumMapRef.value.completeLineFence === 'function') {
    cesiumMapRef.value.completeLineFence(fenceData, (data) => {
      fencePanelRef.value?.confirmFenceDraw(data)
    })
  }
}

function handleClearFence() {
  if (cesiumMapRef.value && typeof cesiumMapRef.value.clearFenceDrawing === 'function') {
    cesiumMapRef.value.clearFenceDrawing()
  }
}

function handleToggleFence(fence) {
  if (cesiumMapRef.value && typeof cesiumMapRef.value.toggleFenceVisibility === 'function') {
    cesiumMapRef.value.toggleFenceVisibility(fence)
  }
}

function handleDeleteFence(id) {
  if (cesiumMapRef.value && typeof cesiumMapRef.value.removeFenceFromMap === 'function') {
    cesiumMapRef.value.removeFenceFromMap(id)
  }
}

function handleStartEventSimulation() {
  const routes = props.routeData || []
  if (routes.length === 0) return
  selectedSimulationRouteIds.value = [routes[0].id]
  isSimulationModalVisible.value = true
}

function handleStopEventSimulation() {
  simulationTimers.value.forEach(t => window.clearTimeout(t))
  simulationTimers.value = []
  simulationParamsMap.value = {}

  if (cesiumMapRef.value) {
    if (typeof cesiumMapRef.value.stopUavAnimation === 'function') {
      cesiumMapRef.value.stopUavAnimation()
    }
    if (typeof cesiumMapRef.value.clearEventVisualization === 'function') {
      cesiumMapRef.value.clearEventVisualization()
    }
    if (typeof cesiumMapRef.value.clearGridVisual === 'function') {
      cesiumMapRef.value.clearGridVisual()
    }
    if (typeof cesiumMapRef.value.clearWarningGridPoints === 'function') {
      cesiumMapRef.value.clearWarningGridPoints()
    }
  }

  emit('stop-event-simulation')
}

function handleCloseSimulationModal() {
  isSimulationModalVisible.value = false
}

function toggleSimulationRoute(routeId) {
  selectedSimulationRouteIds.value = [routeId]
}

function resetSimulationParams() {
  simulationParams.value.user = {
    level: 14,
    warningRadiusMeters: 500,
    maxRouteReturnGrids: 300,
    maxRouteCheckGrids: 500,
    persist: true,
  }
  simulationParams.value.auto = {
    eventType: 'lost_contact',
    telemetry: {
      speed: 16,
      battery: 28,
      linkLostSeconds: 90,
      deviationMeters: 120,
    },
    position: [120.1234, 30.2345, 120],
    flightPlan: {
      home: [120.13, 30.22, 80],
    },
    control: {
      apply: false,
      radiusMeters: 500,
      maxGridCount: 300,
      ttlSeconds: 1800,
    },
    landingSites: [],
    rescueResources: [],
    condition: {},
  }
}

function haversineDistanceMeters(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY
  const toRad = deg => (deg * Math.PI) / 180
  const R = 6371000
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)
  const c = 2 * Math.asin(Math.sqrt(sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon))
  return R * c
}

function offsetPointMeters(point, eastMeters, northMeters) {
  if (!point) return null
  const latRad = (point[1] * Math.PI) / 180
  const deltaLat = northMeters / 111320
  const deltaLon = eastMeters / (111320 * Math.cos(latRad) || 1)
  return [point[0] + deltaLon, point[1] + deltaLat, point[2] ?? 120]
}

function extractRoutePoints(route) {
  const path = Array.isArray(route?.path) ? route.path : []
  return path.flatMap(item => {
    if (Array.isArray(item) && item.length >= 2 && Number.isFinite(Number(item[0])) && Number.isFinite(Number(item[1]))) {
      return [[Number(item[0]), Number(item[1]), Number(item[2] ?? 120)]]
    }
    if (item && typeof item === 'object') {
      const lon = Number(item.lon ?? item.lng ?? item.longitude)
      const lat = Number(item.lat ?? item.latitude)
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        return [[lon, lat, Number(item.height ?? item.alt ?? item.z ?? 120)]]
      }
    }
    return []
  })
}

async function resolveRouteAnchorPoint(route) {
  const routePoints = extractRoutePoints(route)
  if (routePoints.length > 0) return routePoints[Math.floor(routePoints.length / 2)]
  return null
}

async function buildAutoSimulationParams(routeIds) {
  const routes = (props.routeData || []).filter(route => routeIds.includes(route.id))
  const selectedRoute = routes[0] || null
  const anchorPoint = selectedRoute ? await resolveRouteAnchorPoint(selectedRoute) : null
  const onRoute = !!anchorPoint && routeIds.length > 0
  const useOffset = onRoute && Math.random() > 0.55
  const eventPoint = useOffset ? offsetPointMeters(anchorPoint, 120, 60) : anchorPoint
  const deviationMeters = eventPoint && anchorPoint ? Math.round(haversineDistanceMeters(anchorPoint, eventPoint)) : 0
  const safeDeviation = Math.min(200, deviationMeters)
  const autoEventType = safeDeviation === 0 ? 'lost_contact' : (safeDeviation < 80 ? 'deviation' : 'low_battery')

  return {
    eventType: autoEventType,
    telemetry: {
      speed: Math.max(5, Math.min(25, 12 + Math.round(Math.random() * 6))),
      battery: Math.max(10, Math.min(100, safeDeviation === 0 ? 42 : 26)),
      linkLostSeconds: Math.max(0, Math.min(600, safeDeviation === 0 ? 30 : 90)),
      deviationMeters: safeDeviation,
    },
    position: eventPoint || [120.1234, 30.2345, 120],
    flightPlan: {
      home: [120.13, 30.22, 80],
    },
    control: {
      apply: false,
      radiusMeters: 500,
      maxGridCount: 300,
      ttlSeconds: 1800,
    },
    landingSites: [],
    rescueResources: [],
    condition: {},
  }
}

async function handleConfirmSimulation() {
  if (selectedSimulationRouteIds.value.length === 0) return

  simulationTimers.value.forEach(t => window.clearTimeout(t))
  simulationTimers.value = []
  simulationParamsMap.value = {}

  if (cesiumMapRef.value) {
    if (typeof cesiumMapRef.value.stopUavAnimation === 'function') {
      cesiumMapRef.value.stopUavAnimation()
    }
    if (typeof cesiumMapRef.value.clearEventVisualization === 'function') {
      cesiumMapRef.value.clearEventVisualization()
    }
    if (typeof cesiumMapRef.value.clearGridVisual === 'function') {
      cesiumMapRef.value.clearGridVisual()
    }
    if (typeof cesiumMapRef.value.clearWarningGridPoints === 'function') {
      cesiumMapRef.value.clearWarningGridPoints()
    }
  }

  const routeIds = [...selectedSimulationRouteIds.value]
  const routes = (props.routeData || []).filter(route => routeIds.includes(route.id))

  const allAutoParams = {}
  for (const routeId of routeIds) {
    const auto = await buildAutoSimulationParams([routeId])
    allAutoParams[routeId] = auto
    simulationParamsMap.value[routeId] = {
      user: { ...simulationParams.value.user },
      auto,
    }
  }

  const firstAuto = allAutoParams[routeIds[0]]
  emit('start-event-simulation', {
    routeIds,
    params: JSON.parse(JSON.stringify({
      user: { ...simulationParams.value.user },
      auto: firstAuto,
    }))
  })

  routes.forEach((route, index) => {
    if (cesiumMapRef.value && typeof cesiumMapRef.value.startUavAnimation === 'function') {
      cesiumMapRef.value.startUavAnimation(route.path, route.id, index === 0)
    }

    const delay = 3000 + Math.random() * 5000
    const timer = window.setTimeout(() => {
      const willTrigger = Math.random() < 0.8
      if (willTrigger) {
        triggerAnomaly(route.id)
      }
    }, delay)
    simulationTimers.value.push(timer)
  })

  isSimulationModalVisible.value = false
}

async function triggerAnomaly(routeId) {
  if (!cesiumMapRef.value) return

  const currentPosition = typeof cesiumMapRef.value.getUavCurrentPosition === 'function'
    ? cesiumMapRef.value.getUavCurrentPosition(routeId)
    : null

  if (typeof cesiumMapRef.value.stopUavAnimationByRouteId === 'function') {
    cesiumMapRef.value.stopUavAnimationByRouteId(routeId)
  }

  const params = simulationParamsMap.value[routeId]
  if (!params) return

  const position = currentPosition || params.auto.position

  const requestBody = {
    position,
    eventType: params.auto.eventType,
    level: params.user.level,
    eventTime: params.user.eventTime || Date.now(),
    telemetry: params.auto.telemetry,
    cruisingSpeed: params.user.cruisingSpeed,
    groundRescueSpeed: params.user.groundRescueSpeed,
    flightPlan: params.auto.flightPlan,
    landingSites: params.auto.landingSites,
    rescueResources: params.auto.rescueResources,
    condition: params.auto.condition,
    control: params.auto.control,
    warningRadiusMeters: params.user.warningRadiusMeters,
    maxRouteReturnGrids: params.user.maxRouteReturnGrids,
    maxRouteCheckGrids: params.user.maxRouteCheckGrids,
    persist: params.user.persist,
  }

  try {
    const headers = new Headers()
    headers.append('Content-Type', 'application/json')
    headers.append('X-API-Key', import.meta.env.VITE_API_KEY || '')

    const resp = await fetch('/api/emergency/handle', {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    })

    const data = await resp.json()
    if (data?.status === 'success' && data?.data) {
      await visualizeEmergencyResponse(data.data)
      const eventPayload = {
        routeId,
        routeName: (props.routeData || []).find(r => r.id === routeId)?.name || '',
        eventType: params.auto.eventType,
        position,
        requestBody,
        responseData: data.data,
      }
      emit('anomaly-triggered', eventPayload)
      addLocalEvent(eventPayload)
    } else {
      console.warn('[MonitoringScreen] 应急接口返回异常:', data?.message)
    }
  } catch (err) {
    console.error('[MonitoringScreen] 应急接口调用失败:', err)
  }
}

async function visualizeEmergencyResponse(responseData) {
  if (!cesiumMapRef.value) return

  const allCells = []

  // 事件网格
  if (responseData.eventGrid) {
    allCells.push({
      bounds: {
        west: responseData.eventGrid.minlon,
        east: responseData.eventGrid.maxlon,
        south: responseData.eventGrid.minlat,
        north: responseData.eventGrid.maxlat,
        top: responseData.eventGrid.top,
        bottom: responseData.eventGrid.bottom,
      },
      color: '#ef4444',
      level: responseData.warningArea?.gridLevel,
    })
  }

  // 警戒区网格（从 gridCenters.data.cells 获取）
  const warningArea = responseData.warningArea
  const gridCells = warningArea?.gridCenters?.data?.cells
  if (Array.isArray(gridCells)) {
    gridCells.forEach(cell => {
      allCells.push({
        bounds: {
          west: cell.minlon,
          east: cell.maxlon,
          south: cell.minlat,
          north: cell.maxlat,
          top: cell.top,
          bottom: cell.bottom ?? 0,
        },
        color: '#f59e0b',
        level: warningArea?.gridLevel,
      })
    })
  }

  console.log('[MonitoringScreen] 可视化网格总数:', allCells.length, '事件网格:', responseData.eventGrid ? 1 : 0, '警戒区网格:', Array.isArray(gridCells) ? gridCells.length : 0)

  // 统一使用 drawGridBoundary 绘制所有网格
  if (allCells.length > 0 && typeof cesiumMapRef.value.drawGridBoundary === 'function') {
    cesiumMapRef.value.drawGridBoundary({ cells: allCells })
  }

  // 绘制事件位置点和警戒区范围
  if (typeof cesiumMapRef.value.drawEventVisualization === 'function') {
    const eg = responseData.eventGrid
    const waCenter = warningArea?.center
    cesiumMapRef.value.drawEventVisualization({
      eventPoint: eg?.center ? {
        lon: eg.center[0],
        lat: eg.center[1],
        height: eg.center[2] || 0,
      } : null,
      warningArea: warningArea || null,
      warningCenter: waCenter && Array.isArray(waCenter) ? {
        lon: waCenter[0],
        lat: waCenter[1],
        height: waCenter[2] || 0,
      } : null,
    })
  }
}

function handleSaveFence(fences) {
  console.log('保存围栏到后端:', fences)
}

function handleDrawFence(fence) {
  if (cesiumMapRef.value && typeof cesiumMapRef.value.drawFenceOnMap === 'function') {
    cesiumMapRef.value.drawFenceOnMap(fence)
  }
}

const fenceStats = computed(() => {
  const fences = fencePanelRef.value?.fences || []
  const applied = fences.filter(f => f.enabled).length
  const noFlyZoneCount = Object.keys(props.visibleNoFlyZones).length
  return {
    total: fences.length + noFlyZoneCount,
    applied: applied + noFlyZoneCount,
    unapplied: fences.length - applied
  }
})

// 本地异常事件列表（与 InfoManagementPanel 同步）
const localEventList = ref([])

function getEventTypeClass(displayType) {
  const map = {
    '失联事件': 'dot-lost',
    '低电量事件': 'dot-lowbat',
    '偏航事件': 'dot-deviation',
    '事故事件': 'dot-accident',
  }
  return map[displayType] || 'dot-default'
}

function getEventBadgeClass(displayType) {
  const map = {
    '失联事件': 'badge-lost',
    '低电量事件': 'badge-lowbat',
    '偏航事件': 'badge-deviation',
    '事故事件': 'badge-accident',
  }
  return map[displayType] || 'badge-default'
}

function formatEventTypeShort(displayType) {
  const map = {
    '失联事件': '失联',
    '低电量事件': '低电量',
    '偏航事件': '偏航',
    '事故事件': '事故',
  }
  return map[displayType] || '异常'
}

function addLocalEvent(payload) {
  if (!payload) return
  const { routeId, routeName, eventType, responseData } = payload
  const displayType = formatEventTypeLabel(eventType)
  const newEvent = {
    id: responseData?.eventId || `event-${Date.now()}`,
    name: `${routeName || routeId || '未知航线'} · ${displayType}`,
    time: new Date().toLocaleString('zh-CN'),
    source: 'simulation',
    routeId,
    routeName: routeName || routeId || '未知航线',
    detail: {
      displayType,
      eventType,
      eventTimeText: new Date().toLocaleString('zh-CN'),
      positionText: Array.isArray(payload.position)
        ? payload.position.map(v => typeof v === 'number' ? v.toFixed(6) : v).join(', ')
        : '未知位置',
    },
  }
  localEventList.value.unshift(newEvent)
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

const TYPE_COLORS = {
  electronic_fence: '#5b9fd4',
  risk_zone: '#a855f7',
  custom: '#f59e0b',
}

const TYPE_NAMES = {
  electronic_fence: '电子围栏',
  risk_zone: '风险区域',
  custom: '自定义区域',
}

const fenceTypeStats = computed(() => {
  const zones = Object.values(props.visibleNoFlyZones)
  const counts = {}
  zones.forEach(z => {
    const code = z.type_code || 'custom'
    counts[code] = (counts[code] || 0) + 1
  })
  const legend = Object.entries(counts).map(([type, count]) => ({
    type,
    name: TYPE_NAMES[type] || TYPE_NAMES.custom,
    color: TYPE_COLORS[type] || TYPE_COLORS.custom,
    count,
  }))

  const total = zones.length
  const circumference = 2 * Math.PI * 40
  let offset = 0
  const segments = legend.map(item => {
    const fraction = total > 0 ? item.count / total : 0
    const segLen = fraction * circumference
    const seg = {
      type: item.type,
      color: item.color,
      dash: `${segLen.toFixed(2)} ${circumference.toFixed(2)}`,
      offset: (circumference * 0.25 + offset).toFixed(2),
    }
    offset += segLen
    return seg
  })

  return { total, legend, segments }
})

const fenceZoneStats = computed(() => {
  const zones = Object.values(props.visibleNoFlyZones).map(z => {
    const code = z.type_code || 'custom'
    return {
      id: z.zone_id,
      name: z.name || '未命名禁飞区',
      tagName: TYPE_NAMES[code] || TYPE_NAMES.custom,
      tagColor: TYPE_COLORS[code] || TYPE_COLORS.custom,
    }
  })
  return { total: zones.length, list: zones }
})

function addNoFlyZoneVisualization(zone) {
  if (!cesiumMapRef.value) return
  const boundary = zone.boundary
  if (!boundary || boundary.length < 3) return

  cesiumMapRef.value.drawPolygon({
    type: 'noFlyZone',
    zoneId: zone.zone_id,
    points: boundary.map(coord => ({
      lon: Number(coord[0]),
      lat: Number(coord[1]),
    })),
    bottom: Number(zone.bottom ?? 0),
    top: Number(zone.top ?? 120),
    color: '#ef4444',
  })
}

function removeNoFlyZoneVisualization(zoneId) {
  if (!cesiumMapRef.value) return
  if (typeof cesiumMapRef.value.removeNoFlyZonePrism === 'function') {
    cesiumMapRef.value.removeNoFlyZonePrism(zoneId)
  }
}

watch(
  () => props.visibleNoFlyZones,
  (newVal) => {
    if (!cesiumMapRef.value) return
    if (typeof cesiumMapRef.value.removeNoFlyZonePrism !== 'function') return
    const entityIds = cesiumMapRef.value.viewer?.entities?.values?.map(e => e.id) || []
    const activeZoneIds = new Set(Object.keys(newVal))
    const renderedZoneIds = new Set()
    entityIds.forEach(id => {
      if (id && id.startsWith('noflyzone-prism-')) {
        renderedZoneIds.add(id.replace('noflyzone-prism-', ''))
      }
    })
    renderedZoneIds.forEach(zoneId => {
      if (!activeZoneIds.has(zoneId)) {
        cesiumMapRef.value.removeNoFlyZonePrism(zoneId)
      }
    })
    Object.values(newVal).forEach(zone => {
      if (!renderedZoneIds.has(zone.zone_id)) {
        addNoFlyZoneVisualization(zone)
      }
    })
  },
  { deep: true },
)

defineExpose({
  addNoFlyZoneVisualization,
  removeNoFlyZoneVisualization,
})

</script>

<template>
  <div class="app-root" :class="`theme-${props.theme}`">
    <CesiumMap ref="cesiumMapRef" :show3-d-toggle="false" />

    <!-- 顶部导航 -->
    <header class="topbar">
      <!-- 左侧导航按钮 -->
      <div class="left-nav-buttons">
        <div class="nav-btn" @click="$emit('switch_page', 'grid')">网格化算子</div>
        <div class="nav-btn active">实时监控大屏</div>
        <div class="nav-btn" @click="$emit('switch_page', 'info')">信息管理系统</div>
      </div>

      <!-- 中间标题 -->
      <div class="topbar-center">
        <h1 class="main-title">低空路径智绘平台</h1>
      </div>

      <!-- 右侧状态和时间 -->
      <div class="topbar-right">
        <div class="status-box">
          <span>系统状态：</span>
          <span :class="['status-value', networkStatusClass]">{{ networkStatus }}</span>
        </div>
        <div class="time-box">
          <span>{{ timeText }}</span>
        </div>
      </div>
    </header>

    <!-- 实时监控大屏内容区域 -->
    <main class="monitoring-content">
      <!-- 左侧面板：天气 + 禁飞区饼图 + 禁飞区列表 + 异常事件 -->
      <div class="control-panel-fence">
        <!-- 上1/4：实时天气 -->
        <div class="weather-section">
          <div class="section-title">实时天气</div>
          <div class="weather-content">
            <div class="weather-main" @click="toggleCitySelector">
              <div class="weather-icon">{{ weatherIcon }}</div>
              <div class="weather-temp">{{ weatherData.temperature !== null ? weatherData.temperature + '°C' : '--°C' }}</div>
              <div class="weather-city">{{ currentCityName }}</div>
            </div>
            <div class="weather-desc">{{ weatherDesc }}</div>
            <div class="weather-params">
              <div class="weather-param"><span class="wp-label">温度</span><span class="wp-value">{{ weatherData.temperature !== null ? weatherData.temperature + '°C' : '--°C' }}</span></div>
              <div class="weather-param"><span class="wp-label">能见度</span><span class="wp-value">{{ weatherData.visibility || '--' }} km</span></div>
              <div class="weather-param"><span class="wp-label">气压</span><span class="wp-value">{{ weatherData.pressure ? Math.round(weatherData.pressure) + ' hPa' : '-- hPa' }}</span></div>
              <div class="weather-param"><span class="wp-label">云量</span><span class="wp-value">{{ weatherData.cloudcover !== null ? weatherData.cloudcover + '%' : '--%' }}</span></div>
              <div class="weather-param"><span class="wp-label">湿度</span><span class="wp-value">{{ weatherData.humidity !== null ? weatherData.humidity + '%' : '--%' }}</span></div>
              <div class="weather-param"><span class="wp-label">风速</span><span class="wp-value">{{ weatherData.windspeed !== null ? weatherData.windspeed + ' km/h' : '-- km/h' }}</span></div>
            </div>
            <div class="weather-warning">{{ weatherError || '暂无气象预警信息' }}</div>
          </div>
          <!-- 城市选择器 -->
          <div v-if="showCitySelector" class="city-selector">
            <div class="city-selector-header">选择城市</div>
            <div class="city-list">
              <div
                v-for="(city, index) in zhejiangCities"
                :key="index"
                class="city-item"
                :class="{ active: index === currentCityIndex }"
                @click="switchCity(index)"
              >
                {{ city.name }}
              </div>
            </div>
          </div>
        </div>

        <!-- 中上1/4：禁飞区类型分布饼图 -->
        <div class="fence-pie-section">
          <div class="section-title">禁飞区类型分布</div>
          <div class="fence-pie-wrapper">
            <div class="pie-chart" id="fence-pie-chart">
              <svg viewBox="0 0 100 100" class="pie-svg">
                <circle class="pie-empty" cx="50" cy="50" r="40" />
                <circle
                  v-for="seg in fenceTypeStats.segments"
                  :key="seg.type"
                  class="pie-segment"
                  cx="50" cy="50" r="40"
                  :stroke="seg.color"
                  :stroke-dasharray="seg.dash"
                  :stroke-dashoffset="seg.offset"
                  stroke-linecap="butt"
                />
              </svg>
              <div class="pie-center">
                <span class="pie-total">{{ fenceTypeStats.total }}</span>
                <span class="pie-total-label">总计</span>
              </div>
            </div>
            <div class="pie-legend">
              <div v-for="item in fenceTypeStats.legend" :key="item.type" class="legend-item">
                <span class="legend-dot" :style="{ background: item.color }"></span>
                <span class="legend-name">{{ item.name }}</span>
                <span class="legend-count">{{ item.count }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 中下1/4：禁飞区列表 -->
        <div class="fence-list-section">
          <div class="section-title">已加载禁飞区</div>
          <div class="fence-list">
            <div v-if="fenceZoneStats.total === 0" class="empty-list">暂无禁飞区</div>
            <div v-for="zone in fenceZoneStats.list" :key="zone.id" class="fence-zone-item">
              <span class="fence-zone-tag" :style="{ background: zone.tagColor + '33', color: zone.tagColor }">{{ zone.tagName }}</span>
              <span class="fence-zone-name">{{ zone.name }}</span>
            </div>
          </div>
        </div>

        <!-- 下1/4：异常事件列表 -->
        <div class="event-list-section">
          <div class="section-title">异常事件</div>
          <div class="event-list">
            <div v-if="localEventList.length === 0" class="empty-list">暂无异常事件</div>
            <div
              v-for="evt in localEventList"
              :key="evt.id"
              class="event-item"
            >
              <span class="event-type-dot" :class="getEventTypeClass(evt.detail?.displayType)"></span>
              <div class="event-info">
                <span class="event-name">{{ evt.name || evt.detail?.displayType || '异常事件' }}</span>
                <span class="event-time">{{ evt.time }}</span>
              </div>
              <span class="event-badge" :class="getEventBadgeClass(evt.detail?.displayType)">{{ formatEventTypeShort(evt.detail?.displayType) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧监控航线面板 -->
      <div class="control-panel-route">
        <!-- 航线列表区域 上1/4 -->
        <div class="route-list-section">
          <div class="panel-header">
            <span class="panel-title">已展示航线</span>
            <div class="route-header-actions">
              <button class="action-btn simulate-btn" type="button" @click="handleStartEventSimulation">异常模拟</button>
              <button class="action-btn exit-btn" type="button" @click="handleStopEventSimulation">退出</button>
            </div>
          </div>
          <div class="route-list">
            <div v-if="routeStats.total === 0" class="empty-list">
              <span>暂无监控航线</span>
            </div>
            <div
              v-for="route in props.routeData"
              :key="route.id"
              class="route-item"
            >
              <div class="route-info">
                <span class="route-name">{{ route.name || '航线 ' + route.id }}</span>
                <span class="route-id">ID: {{ route.id }}</span>
              </div>
              <div class="route-grids">
                <span class="grid-count">{{ route.path?.length || 0 }}</span>
                <span class="grid-label">格网</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 航线统计区域 中上1/4 -->
        <div class="route-stats-section">
          <div class="stats-title">航线统计</div>
          <div class="stats-grid">
            <div class="stat-item">
              <div class="stat-value">{{ routeStats.total }}</div>
              <div class="stat-label">监控航线</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ routeStats.totalGrids }}</div>
              <div class="stat-label">格网总数</div>
            </div>
          </div>
        </div>

        <!-- 无人机状态卡片 中下1/4 -->
        <div class="uav-status-section">
          <div class="uav-status-card">
            <div class="uav-card-header">
              <span class="uav-card-title">无人机状态</span>
              <span class="uav-online-badge" :class="uavStatus.online ? 'online' : 'offline'">
                {{ uavStatus.online ? '在线' : '离线' }}
              </span>
            </div>
            <div class="uav-metrics-grid">
              <div class="uav-metric-item">
                <span class="uav-metric-label">速度</span>
                <span class="uav-metric-value">
                  {{ uavStatus.speed }}<span class="uav-metric-unit">m/s</span>
                </span>
              </div>
              <div class="uav-metric-item">
                <span class="uav-metric-label">电量</span>
                <span class="uav-metric-value" :class="{
                  'battery-full': uavStatus.battery > 60,
                  'battery-mid': uavStatus.battery > 20 && uavStatus.battery <= 60,
                  'battery-low': uavStatus.battery <= 20,
                }">
                  {{ uavStatus.battery }}<span class="uav-metric-unit">%</span>
                </span>
              </div>
              <div class="uav-metric-item">
                <span class="uav-metric-label">高度</span>
                <span class="uav-metric-value">
                  {{ uavStatus.altitude }}<span class="uav-metric-unit">m</span>
                </span>
              </div>
              <div class="uav-metric-item">
                <span class="uav-metric-label">信号</span>
                <span class="uav-metric-value" :class="{
                  'signal-strong': uavStatus.signal > 70,
                  'signal-medium': uavStatus.signal > 30 && uavStatus.signal <= 70,
                  'signal-weak': uavStatus.signal <= 30,
                }">
                  {{ uavStatus.signal }}<span class="uav-metric-unit">%</span>
                </span>
              </div>
            </div>
            <div class="uav-position-row">
              <span class="uav-position-label">位置</span>
              <span class="uav-position-value">
                {{ uavStatus.position[0] }}, {{ uavStatus.position[1] }}
              </span>
            </div>
          </div>
        </div>

        <!-- 飞行器列表区域 下1/4 -->
        <div class="aircraft-list-section">
          <div class="panel-header">
            <span class="panel-title">飞行器管理</span>
            <button class="action-btn refresh-btn" type="button" @click="fetchAircraftList" :disabled="aircraftLoading">
              <span v-if="aircraftLoading" class="loading-spinner"></span>
              <span v-else>刷新</span>
            </button>
          </div>
          <div class="aircraft-list">
            <div v-if="aircraftLoading && aircraftList.length === 0" class="empty-list">
              <span>加载中...</span>
            </div>
            <div v-else-if="aircraftError" class="empty-list error">
              <span>{{ aircraftError }}</span>
            </div>
            <div v-else-if="aircraftList.length === 0" class="empty-list">
              <span>暂无飞行器数据</span>
            </div>
            <div
              v-for="aircraft in aircraftList"
              :key="aircraft.id"
              class="aircraft-item"
            >
              <div class="aircraft-info">
                <span class="aircraft-name">{{ aircraft.name || aircraft.deviceName || '未知' }}</span>
                <span class="aircraft-model">{{ aircraft.model || '-' }}</span>
              </div>
              <div class="aircraft-sn">
                <span class="sn-label">序列号</span>
                <span class="sn-value">{{ aircraft.transponderNo || aircraft.serialNo || '-' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <div v-if="isSimulationModalVisible" class="simulation-modal-mask" @click.self="handleCloseSimulationModal">
      <div class="simulation-modal" role="dialog" aria-modal="true" aria-labelledby="simulation-modal-title">
        <div class="simulation-modal-header">
          <div id="simulation-modal-title" class="simulation-modal-title">异常模拟参数设置</div>
          <button class="modal-btn secondary" type="button" @click="handleCloseSimulationModal">关闭</button>
        </div>

        <div class="simulation-modal-body">
          <div class="simulation-section">
            <div class="section-title">1. 选择用于异常模拟的航线</div>
            <div v-if="routeStats.total === 0" class="param-tip">当前没有已展示航线，无法执行异常模拟。</div>
            <div v-else class="route-select-grid">
              <label
                v-for="route in props.routeData"
                :key="route.id"
                class="route-select-item"
                :class="{ selected: selectedSimulationRouteIds.includes(route.id) }"
              >
                <input
                  type="radio"
                  name="simulation-route"
                  :checked="selectedSimulationRouteIds.includes(route.id)"
                  @change="toggleSimulationRoute(route.id)"
                />
                <div class="route-select-main">
                  <span class="route-select-name">{{ route.name || '航线 ' + route.id }}</span>
                  <span class="route-select-meta">ID: {{ route.id }} · 格网 {{ route.path?.length || 0 }}</span>
                </div>
              </label>
            </div>
            <div class="param-tip">请选择一条航线参与异常模拟；没有航线时模拟按钮不可执行。</div>
          </div>

          <div class="simulation-section">
            <div class="section-title">2. 用户手动输入参数</div>
            <div class="param-grid single-grid">
              <div class="param-field">
                <label>网格层级</label>
                <input v-model.number="simulationParams.user.level" type="number" min="1" max="21" />
              </div>
              <div class="param-field">
                <label>警戒半径 (m)</label>
                <input v-model.number="simulationParams.user.warningRadiusMeters" type="number" min="0" />
              </div>
              <div class="param-field">
                <label>返航格网上限</label>
                <input v-model.number="simulationParams.user.maxRouteReturnGrids" type="number" min="1" />
              </div>
              <div class="param-field">
                <label>路径检查格网上限</label>
                <input v-model.number="simulationParams.user.maxRouteCheckGrids" type="number" min="1" />
              </div>
              <div class="param-field">
                <label>是否落库</label>
                <select v-model="simulationParams.user.persist">
                  <option :value="true">true</option>
                  <option :value="false">false</option>
                </select>
              </div>
            </div>
            <div class="param-tip">事件时间、巡航速度、地面救援速度、事件类型、电量、失联秒数、偏航距离等均由系统自动模拟，不在此窗口中展示。</div>
          </div>
        </div>

        <div class="simulation-modal-footer">
          <button class="modal-btn secondary" type="button" @click="resetSimulationParams">重置默认值</button>
          <button class="modal-btn secondary" type="button" @click="handleCloseSimulationModal">取消</button>
          <button class="modal-btn primary" type="button" :disabled="routeStats.total === 0 || selectedSimulationRouteIds.length === 0" @click="handleConfirmSimulation">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-root {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  --monitor-topbar-bg: #1a365d;
  --monitor-topbar-border: #2c5282;
  --monitor-nav-bg: #2c5282;
  --monitor-nav-border: #3182ce;
  --monitor-nav-text: #fff;
  --monitor-nav-hover-bg: #3182ce;
  --monitor-nav-active-bg: #c05621;
  --monitor-nav-active-border: #dd6b20;
  --monitor-title-text: #fff;
  --monitor-status-label: #a0aec0;
  --monitor-time-bg: #2d3748;
  --monitor-time-border: #4a5568;
  --monitor-time-text: #e2e8f0;
  --monitor-fence-overlay: linear-gradient(to left, rgba(180, 200, 220, 0.25) 0%, rgba(180, 200, 220, 0.55) 35%, rgba(180, 200, 220, 0.82) 100%);
  --monitor-route-overlay: linear-gradient(to right, rgba(180, 200, 220, 0.25) 0%, rgba(180, 200, 220, 0.55) 35%, rgba(180, 200, 220, 0.82) 100%);
  --monitor-panel-surface: rgba(180, 200, 220, 0.82);
  --monitor-panel-divider: rgba(226, 232, 240, 0.6);
  --monitor-stats-title: #2d3748;
  --monitor-stat-card-bg: rgba(247, 250, 252, 0.3);
  --monitor-stat-card-border: rgba(226, 232, 240, 0.4);
  --monitor-stat-value: #2d3748;
  --monitor-stat-label: #718096;
  --monitor-panel-title: #2d3748;
  --monitor-action-btn-bg: rgba(255, 255, 255, 0.9);
  --monitor-action-btn-border: rgba(90, 150, 200, 0.7);
  --monitor-action-btn-text: #1e4a6e;
  --monitor-action-btn-hover-bg: #ffffff;
  --monitor-action-btn-hover-border: #4a90c2;
  --monitor-action-btn-hover-shadow: 0 2px 6px rgba(60, 120, 180, 0.15);
  --monitor-panel-count: #2b6cb0;
  --monitor-route-item-bg: rgba(255, 255, 255, 0.58);
  --monitor-route-item-border: rgba(148, 163, 184, 0.28);
  --monitor-route-name: #1e293b;
  --monitor-route-meta: #64748b;
  --monitor-grid-count: #2563eb;
  --monitor-grid-label: #64748b;
  --monitor-empty-text: #64748b;
}

.app-root.theme-tech-blue {
  --monitor-topbar-bg: linear-gradient(180deg, rgba(3, 21, 44, 0.98), rgba(7, 43, 92, 0.95));
  --monitor-topbar-border: rgba(77, 189, 255, 0.45);
  --monitor-nav-bg: linear-gradient(180deg, rgba(10, 45, 90, 0.9), rgba(8, 31, 70, 0.96));
  --monitor-nav-border: rgba(73, 182, 255, 0.65);
  --monitor-nav-text: #ddf8ff;
  --monitor-nav-hover-bg: linear-gradient(180deg, rgba(19, 94, 165, 0.95), rgba(9, 54, 104, 0.98));
  --monitor-nav-active-bg: linear-gradient(180deg, rgba(0, 180, 216, 0.96), rgba(0, 119, 182, 0.98));
  --monitor-nav-active-border: rgba(128, 244, 255, 0.9);
  --monitor-title-text: #effcff;
  --monitor-status-label: #9fdcff;
  --monitor-time-bg: linear-gradient(180deg, rgba(10, 37, 74, 0.92), rgba(4, 24, 52, 0.96));
  --monitor-time-border: rgba(83, 202, 255, 0.52);
  --monitor-time-text: #dcf7ff;
  --monitor-fence-overlay: linear-gradient(to left, rgba(5, 35, 78, 0.4) 0%, rgba(5, 35, 78, 0.65) 35%, rgba(5, 35, 78, 0.9) 100%);
  --monitor-route-overlay: linear-gradient(to right, rgba(4, 34, 76, 0.4) 0%, rgba(4, 34, 76, 0.65) 35%, rgba(4, 34, 76, 0.9) 100%);
  --monitor-panel-surface: rgba(5, 35, 78, 0.82);
  --monitor-panel-divider: rgba(110, 214, 255, 0.22);
  --monitor-stats-title: #c8f4ff;
  --monitor-stat-card-bg: rgba(10, 52, 96, 0.52);
  --monitor-stat-card-border: rgba(116, 224, 255, 0.22);
  --monitor-stat-value: #f1fdff;
  --monitor-stat-label: #8fd2ee;
  --monitor-panel-title: #e5fbff;
  --monitor-action-btn-bg: rgba(7, 39, 79, 0.92);
  --monitor-action-btn-border: rgba(78, 198, 255, 0.62);
  --monitor-action-btn-text: #d8f7ff;
  --monitor-action-btn-hover-bg: rgba(11, 87, 151, 0.92);
  --monitor-action-btn-hover-border: rgba(128, 244, 255, 0.84);
  --monitor-action-btn-hover-shadow: 0 6px 18px rgba(0, 112, 201, 0.24);
  --monitor-panel-count: #7deaff;
  --monitor-route-item-bg: rgba(8, 39, 79, 0.48);
  --monitor-route-item-border: rgba(109, 214, 255, 0.18);
  --monitor-route-name: #effcff;
  --monitor-route-meta: #97d9ef;
  --monitor-grid-count: #7cecff;
  --monitor-grid-label: #9fdcff;
  --monitor-empty-text: #97d9ef;
}

.app-root.theme-fresh-green {
  --monitor-topbar-bg: linear-gradient(180deg, rgba(236, 249, 241, 0.98), rgba(219, 244, 228, 0.95));
  --monitor-topbar-border: rgba(122, 197, 150, 0.42);
  --monitor-nav-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(240, 250, 244, 0.96));
  --monitor-nav-border: rgba(122, 197, 150, 0.56);
  --monitor-nav-text: #35624a;
  --monitor-nav-hover-bg: linear-gradient(180deg, rgba(255, 255, 255, 1), rgba(232, 248, 238, 0.98));
  --monitor-nav-active-bg: linear-gradient(180deg, rgba(245, 253, 247, 1), rgba(225, 246, 233, 0.98));
  --monitor-nav-active-border: rgba(94, 172, 125, 0.82);
  --monitor-title-text: #315d46;
  --monitor-status-label: #5d8b70;
  --monitor-time-bg: rgba(255, 255, 255, 0.9);
  --monitor-time-border: rgba(122, 197, 150, 0.42);
  --monitor-time-text: #3c6d53;
  --monitor-fence-overlay: linear-gradient(to left, rgba(245, 252, 247, 0.35) 0%, rgba(245, 252, 247, 0.65) 35%, rgba(245, 252, 247, 0.94) 100%);
  --monitor-route-overlay: linear-gradient(to right, rgba(245, 252, 247, 0.35) 0%, rgba(245, 252, 247, 0.65) 35%, rgba(245, 252, 247, 0.94) 100%);
  --monitor-panel-surface: rgba(245, 252, 247, 0.86);
  --monitor-panel-divider: rgba(167, 214, 184, 0.28);
  --monitor-stats-title: #4a7f60;
  --monitor-stat-card-bg: rgba(255, 255, 255, 0.72);
  --monitor-stat-card-border: rgba(167, 214, 184, 0.34);
  --monitor-stat-value: #2f5d45;
  --monitor-stat-label: #6b8d79;
  --monitor-panel-title: #315d46;
  --monitor-action-btn-bg: rgba(255, 255, 255, 0.9);
  --monitor-action-btn-border: rgba(126, 198, 152, 0.56);
  --monitor-action-btn-text: #466c56;
  --monitor-action-btn-hover-bg: rgba(245, 253, 247, 0.98);
  --monitor-action-btn-hover-border: rgba(94, 172, 125, 0.76);
  --monitor-action-btn-hover-shadow: 0 6px 18px rgba(126, 198, 152, 0.16);
  --monitor-panel-count: #5fae7b;
  --monitor-route-item-bg: rgba(255, 255, 255, 0.64);
  --monitor-route-item-border: rgba(167, 214, 184, 0.3);
  --monitor-route-name: #315d46;
  --monitor-route-meta: #6b8d79;
  --monitor-grid-count: #5fae7b;
  --monitor-grid-label: #6b8d79;
  --monitor-empty-text: #6b8d79;
}

/* 顶部导航 */
.topbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: var(--monitor-topbar-bg);
  border-bottom: 2px solid var(--monitor-topbar-border);
  z-index: 100;
}

/* 导航按钮 */
.left-nav-buttons {
  display: flex;
  gap: 4px;
}

.nav-btn {
  padding: 6px 16px;
  background: var(--monitor-nav-bg);
  border: 1px solid var(--monitor-nav-border);
  color: var(--monitor-nav-text);
  font-size: 13px;
  cursor: pointer;
}

.nav-btn:hover {
  background: var(--monitor-nav-hover-bg);
}

.nav-btn.active {
  background: var(--monitor-nav-active-bg);
  border-color: var(--monitor-nav-active-border);
}

/* 中间标题区域 */
.topbar-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.main-title {
  font-size: 18px;
  font-weight: bold;
  color: var(--monitor-title-text);
  margin: 0;
  letter-spacing: 2px;
}

/* 右侧状态和时间 */
.topbar-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.status-box {
  font-size: 12px;
  color: var(--monitor-status-label);
}

.status-value {
  font-weight: bold;
}

.status-value.online {
  color: #68d391;
}

.status-value.offline {
  color: #fc8181;
}

.time-box {
  padding: 4px 12px;
  background: var(--monitor-time-bg);
  border: 1px solid var(--monitor-time-border);
  color: var(--monitor-time-text);
  font-size: 12px;
  font-family: monospace;
}

/* 监控内容区域 */
.monitoring-content {
  position: fixed;
  top: 50px;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  pointer-events: none;
  display: flex;
  gap: 0;
}

/* 左侧面板：天气 + 禁飞区饼图 + 禁飞区列表 */
.control-panel-fence {
  width: 320px;
  height: 100%;
  background: transparent;
  pointer-events: auto;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.section-title {
  font-size: 12px;
  font-weight: bold;
  color: var(--monitor-status-label);
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 8px;
}

/* 天气区域 */
.weather-section {
  flex: 1;
  min-height: 0;
  padding: 12px;
  display: flex;
  flex-direction: column;
  position: relative;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  overflow: visible;
  color: #1a365d;
}

.weather-section::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to left, rgba(180, 200, 220, 0.4) 0%, rgba(180, 200, 220, 0.7) 50%, rgba(180, 200, 220, 0.92) 100%);
  pointer-events: none;
  z-index: 0;
  border-radius: 4px;
}

.weather-section > * {
  position: relative;
  z-index: 1;
}

.weather-section .section-title {
  color: #1a365d;
}

.theme-tech-blue .weather-section::before {
  background: linear-gradient(to left, rgba(5, 35, 78, 0.5) 0%, rgba(5, 35, 78, 0.75) 50%, rgba(5, 35, 78, 0.95) 100%);
}

.theme-fresh-green .weather-section::before {
  background: linear-gradient(to left, rgba(245, 252, 247, 0.5) 0%, rgba(245, 252, 247, 0.75) 50%, rgba(245, 252, 247, 0.96) 100%);
}

/* 科技蓝主题 - 天气区域 */
.theme-tech-blue .weather-section {
  color: #dcf7ff;
}

.theme-tech-blue .weather-section .section-title,
.theme-tech-blue .weather-main,
.theme-tech-blue .weather-temp {
  color: #dcf7ff;
}

.theme-tech-blue .weather-city,
.theme-tech-blue .weather-desc,
.theme-tech-blue .wp-label {
  color: #8fd2ee;
}

.theme-tech-blue .weather-warning {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.15);
}

/* 清新绿主题 - 天气区域 */
.theme-fresh-green .weather-section {
  color: #315d46;
}

.theme-fresh-green .weather-section .section-title,
.theme-fresh-green .weather-main,
.theme-fresh-green .weather-temp {
  color: #315d46;
}

.theme-fresh-green .weather-city,
.theme-fresh-green .weather-desc,
.theme-fresh-green .wp-label {
  color: #5d8b70;
}

.weather-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #1a365d;
}

.weather-main {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  color: #1a365d;
}

.weather-main:hover .weather-icon {
  transform: scale(1.1);
}

.weather-icon {
  font-size: 36px;
  line-height: 1;
  transition: transform 0.2s;
}

.weather-temp {
  font-size: 28px;
  font-weight: bold;
  color: #1a365d;
  line-height: 1;
}

.weather-city {
  font-size: 12px;
  color: #4a6fa5;
  padding: 2px 6px;
  background: rgba(59, 130, 246, 0.1);
  border-radius: 4px;
}

.weather-desc {
  font-size: 13px;
  color: #4a6fa5;
  margin-top: 2px;
}

.weather-params {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 16px;
  color: #1a365d;
}

.weather-param {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
}

.wp-label {
  color: #4a6fa5;
}

.wp-value {
  color: #1a365d;
  font-weight: 500;
}

.weather-warning {
  font-size: 10px;
  color: #92400e;
  padding: 4px 8px;
  background: rgba(251, 191, 36, 0.15);
  border-radius: 4px;
  margin-top: 4px;
}

/* 城市选择器 */
.city-selector {
  position: absolute;
  top: 100%;
  left: 12px;
  right: 12px;
  background: var(--monitor-panel-bg, rgba(255,255,255,0.95));
  border: 1px solid var(--monitor-border-color, rgba(0,0,0,0.1));
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  z-index: 100;
  overflow: hidden;
}

.city-selector-header {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--monitor-title-text);
  background: var(--monitor-section-bg);
  border-bottom: 1px solid var(--monitor-border-color);
}

.city-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  padding: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.city-item {
  padding: 6px 8px;
  font-size: 12px;
  color: var(--monitor-title-text);
  text-align: center;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.city-item:hover {
  background: rgba(59, 130, 246, 0.15);
}

.city-item.active {
  background: rgba(59, 130, 246, 0.2);
  font-weight: 600;
}

/* 禁飞区饼图区域 */
.fence-pie-section {
  flex: 1;
  min-height: 0;
  padding: 12px;
  display: flex;
  flex-direction: column;
  position: relative;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  overflow: hidden;
}

.fence-pie-section::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to left, rgba(180, 200, 220, 0.25) 0%, rgba(180, 200, 220, 0.55) 35%, rgba(180, 200, 220, 0.82) 100%);
  pointer-events: none;
  z-index: 0;
}

.theme-tech-blue .fence-pie-section::before {
  background: linear-gradient(to left, rgba(5, 35, 78, 0.4) 0%, rgba(5, 35, 78, 0.65) 35%, rgba(5, 35, 78, 0.9) 100%);
}

.theme-fresh-green .fence-pie-section::before {
  background: linear-gradient(to left, rgba(245, 252, 247, 0.35) 0%, rgba(245, 252, 247, 0.65) 35%, rgba(245, 252, 247, 0.94) 100%);
}

.fence-pie-section > * {
  position: relative;
  z-index: 1;
}

.fence-pie-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 0;
}

.pie-chart {
  position: relative;
  width: 120px;
  height: 120px;
  flex-shrink: 0;
}

.pie-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.pie-empty {
  fill: none;
  stroke: rgba(255,255,255,0.08);
  stroke-width: 20;
}

.pie-segment {
  fill: none;
  stroke-width: 20;
  transition: stroke-dasharray 0.3s;
}

.pie-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}

.pie-total {
  font-size: 22px;
  font-weight: bold;
  color: var(--monitor-title-text);
}

.pie-total-label {
  font-size: 10px;
  color: var(--monitor-status-label);
}

.pie-legend {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.legend-name {
  flex: 1;
  color: var(--monitor-status-label);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.legend-count {
  font-weight: bold;
  color: var(--monitor-title-text);
}

/* 禁飞区列表区域 */
.fence-list-section {
  flex: 1;
  min-height: 0;
  padding: 12px;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.fence-list-section::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to left, rgba(180, 200, 220, 0.25) 0%, rgba(180, 200, 220, 0.55) 35%, rgba(180, 200, 220, 0.82) 100%);
  pointer-events: none;
  z-index: 0;
}

.theme-tech-blue .fence-list-section::before {
  background: linear-gradient(to left, rgba(5, 35, 78, 0.4) 0%, rgba(5, 35, 78, 0.65) 35%, rgba(5, 35, 78, 0.9) 100%);
}

.theme-fresh-green .fence-list-section::before {
  background: linear-gradient(to left, rgba(245, 252, 247, 0.35) 0%, rgba(245, 252, 247, 0.65) 35%, rgba(245, 252, 247, 0.94) 100%);
}

.fence-list-section > * {
  position: relative;
  z-index: 1;
}

.fence-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fence-zone-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  padding: 4px 0;
}

.fence-zone-tag {
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  white-space: nowrap;
  flex-shrink: 0;
}

.fence-zone-name {
  color: var(--monitor-title-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-list {
  font-size: 11px;
  color: var(--monitor-status-label);
  text-align: center;
  padding: 12px 0;
}

.fence-list .empty-list,
.event-list .empty-list {
  padding: 8px 0;
}

/* 异常事件列表区域 */
.event-list-section {
  flex: 1;
  min-height: 0;
  padding: 12px;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.event-list-section::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to left, rgba(180, 200, 220, 0.25) 0%, rgba(180, 200, 220, 0.55) 35%, rgba(180, 200, 220, 0.82) 100%);
  pointer-events: none;
  z-index: 0;
}

.theme-tech-blue .event-list-section::before {
  background: linear-gradient(to left, rgba(5, 35, 78, 0.4) 0%, rgba(5, 35, 78, 0.65) 35%, rgba(5, 35, 78, 0.9) 100%);
}

.theme-fresh-green .event-list-section::before {
  background: linear-gradient(to left, rgba(245, 252, 247, 0.35) 0%, rgba(245, 252, 247, 0.65) 35%, rgba(245, 252, 247, 0.94) 100%);
}

.event-list-section > * {
  position: relative;
  z-index: 1;
}

.event-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.event-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  cursor: default;
  transition: background 0.15s;
}

.event-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.event-type-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-lost { background: #ef4444; }
.dot-lowbat { background: #f59e0b; }
.dot-deviation { background: #8b5cf6; }
.dot-accident { background: #dc2626; }
.dot-default { background: #60a5fa; }

.event-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.event-name {
  font-size: 11px;
  color: var(--monitor-title-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-time {
  font-size: 10px;
  color: var(--monitor-status-label);
}

.event-badge {
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  white-space: nowrap;
  flex-shrink: 0;
}

.badge-lost { background: rgba(239,68,68,0.15); color: #ef4444; }
.badge-lowbat { background: rgba(245,158,11,0.15); color: #f59e0b; }
.badge-deviation { background: rgba(139,92,246,0.15); color: #8b5cf6; }
.badge-accident { background: rgba(220,38,38,0.15); color: #dc2626; }
.badge-default { background: rgba(96,165,250,0.15); color: #60a5fa; }

/* 右侧监控航线面板 */
.control-panel-route {
  position: absolute;
  right: 0;
  top: 0;
  width: 320px;
  height: 100%;
  background: transparent;
  pointer-events: auto;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.route-list-section {
  flex: 3;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
  border-radius: 0;
  box-shadow: none;
}

.route-list-section::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--monitor-route-overlay);
  border-radius: 0;
  pointer-events: none;
  z-index: 0;
}

.route-list-section > * {
  position: relative;
  z-index: 1;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid var(--monitor-panel-divider);
  background: transparent;
  border-radius: 0;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--monitor-panel-title);
  flex-shrink: 0;
}

.route-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  justify-content: flex-end;
}

.action-btn {
  padding: 5px 10px;
  border: 1px solid var(--monitor-action-btn-border);
  border-radius: 4px;
  background: var(--monitor-action-btn-bg);
  color: var(--monitor-action-btn-text);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  flex-shrink: 0;
}

.action-btn:hover {
  background: var(--monitor-action-btn-hover-bg);
  border-color: var(--monitor-action-btn-hover-border);
  box-shadow: var(--monitor-action-btn-hover-shadow);
}

.simulate-btn {
  color: #b45309;
}

.exit-btn {
  color: #b91c1c;
}

.panel-count {
  font-size: 16px;
  font-weight: bold;
  color: var(--monitor-panel-count);
  font-family: monospace;
}

.simulation-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  pointer-events: auto;
}

.simulation-modal {
  width: min(920px, calc(100vw - 40px));
  max-height: min(86vh, 920px);
  background: #f8fbff;
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.28);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.simulation-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.25);
  background: linear-gradient(90deg, #1a365d, #2c5282);
  color: #fff;
}

.simulation-modal-title {
  font-size: 16px;
  font-weight: 700;
}

.simulation-modal-body {
  padding: 18px 20px 10px;
  overflow: auto;
}

.simulation-section {
  margin-bottom: 18px;
  padding: 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  background: #fff;
}

.section-title {
  font-size: 14px;
  font-weight: 700;
  color: #1e3a5f;
  margin-bottom: 10px;
}

.route-select-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.route-select-item {
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 10px;
  padding: 10px 12px;
  background: #f8fafc;
  display: flex;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.route-select-item.selected {
  border-color: #3b82f6;
  background: #eff6ff;
}

.route-select-item.disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.route-select-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.route-select-name {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}

.route-select-meta {
  font-size: 12px;
  color: #64748b;
}

.param-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.param-group {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 10px;
  padding: 12px;
  background: #f8fafc;
}

.param-group-title {
  font-size: 13px;
  font-weight: 700;
  color: #334155;
  margin-bottom: 10px;
}

.param-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.param-grid.single-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.param-grid.single-grid .param-field:last-child {
  grid-column: span 2;
}

.param-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.param-field label {
  font-size: 12px;
  color: #475569;
}

.param-field input,
.param-field select,
.param-field textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  background: #fff;
  color: #0f172a;
  outline: none;
}

.param-field textarea {
  min-height: 84px;
  resize: vertical;
}

.param-tip {
  margin-top: 8px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.6;
}

.simulation-modal-footer {
  padding: 14px 20px 18px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid rgba(148, 163, 184, 0.22);
  background: #fff;
}

.modal-btn {
  min-width: 88px;
  padding: 9px 16px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  font-size: 13px;
}

.modal-btn.secondary {
  background: #fff;
  border-color: #cbd5e1;
  color: #334155;
}

.modal-btn.primary {
  background: #2563eb;
  color: #fff;
}

.route-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  background: transparent;
}

.route-list::-webkit-scrollbar {
  width: 6px;
}

.route-list::-webkit-scrollbar-track {
  background: rgba(237, 242, 247, 0.5);
}

.route-list::-webkit-scrollbar-thumb {
  background: rgba(203, 213, 224, 0.6);
  border-radius: 3px;
}

.empty-list {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--monitor-empty-text);
  font-size: 12px;
}

.empty-list.error {
  color: #ef4444;
}

.route-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px;
  margin-bottom: 6px;
  background: var(--monitor-route-item-bg);
  border-radius: 8px;
  border: 1px solid var(--monitor-route-item-border);
  transition: all 0.2s ease;
}

.route-item:hover {
  background: color-mix(in srgb, var(--monitor-route-item-bg) 78%, white 22%);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.route-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.route-name {
  font-size: 13px;
  color: var(--monitor-route-name);
  font-weight: 500;
}

.route-id {
  font-size: 11px;
  color: var(--monitor-route-meta);
}

.route-grids {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.grid-count {
  font-size: 16px;
  font-weight: bold;
  color: var(--monitor-panel-count);
  font-family: monospace;
}

.grid-label {
  font-size: 10px;
  color: var(--monitor-grid-label);
}

.route-stats-section {
  flex: 1;
  min-height: 80px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  position: relative;
  border-radius: 0;
  margin: 0;
  box-shadow: none;
}

.route-stats-section::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--monitor-route-overlay);
  pointer-events: none;
  z-index: 0;
  border-radius: 0;
}

.route-stats-section > * {
  position: relative;
  z-index: 1;
}

.route-stats-section .stats-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--monitor-panel-title);
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--monitor-panel-divider);
  background: transparent;
}

.route-stats-section .stats-grid {
  flex: 1;
  display: flex;
  gap: 10px;
}

.route-stats-section .stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.35);
  border-radius: 8px;
  padding: 8px 4px;
  border: 1px solid var(--monitor-stat-card-border);
}

.route-stats-section .stat-value {
  font-size: 18px;
  font-weight: bold;
  color: var(--monitor-panel-count);
  font-family: monospace;
}

.route-stats-section .stat-label {
  font-size: 11px;
  color: var(--monitor-stat-label);
  margin-top: 4px;
}

/* 无人机状态卡片 中下1/4 */
.uav-status-section {
  flex: 2;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 0;
  box-shadow: none;
}

.uav-status-section::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--monitor-route-overlay);
  pointer-events: none;
  z-index: 0;
  border-radius: 0;
}

.uav-status-section > * {
  position: relative;
  z-index: 1;
}

.uav-status-card {
  flex: 1;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.uav-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--monitor-panel-divider);
  padding-bottom: 8px;
}

.uav-card-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--monitor-panel-title);
}

.uav-online-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
}

.uav-online-badge.online {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.uav-online-badge.offline {
  background: rgba(239, 68, 68, 0.15);
  color: #dc2626;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.uav-metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.uav-metric-item {
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  border: 1px solid var(--monitor-stat-card-border);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.35);
}

.uav-metric-label {
  font-size: 11px;
  color: #6b7280;
  margin-bottom: 3px;
}

.uav-metric-value {
  font-size: 16px;
  font-weight: 700;
  color: var(--monitor-panel-count);
  font-family: monospace;
}

.uav-metric-unit {
  font-size: 11px;
  color: #9ca3af;
  margin-left: 2px;
}

.uav-position-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--monitor-stat-card-border);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.35);
}

.uav-position-label {
  font-size: 11px;
  color: #6b7280;
  flex-shrink: 0;
}

.uav-position-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--monitor-panel-count);
  font-family: monospace;
}

/* 电量颜色 */
.battery-full { color: #16a34a; }
.battery-mid { color: #ca8a04; }
.battery-low { color: #dc2626; }

/* 信号强度颜色 */
.signal-strong { color: #16a34a; }
.signal-medium { color: #ca8a04; }
.signal-weak { color: #dc2626; }

/* 飞行器列表区域 下1/4 */
.aircraft-list-section {
  flex: 2;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 0;
  box-shadow: none;
}

.aircraft-list-section::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--monitor-route-overlay);
  pointer-events: none;
  z-index: 0;
  border-radius: 0;
}

.aircraft-list-section > * {
  position: relative;
  z-index: 1;
}

.aircraft-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.aircraft-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.35);
  border: 1px solid var(--monitor-stat-card-border);
  border-radius: 6px;
}

.aircraft-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.aircraft-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--monitor-panel-count);
}

.aircraft-model {
  font-size: 11px;
  color: var(--monitor-status-label);
}

.aircraft-sn {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.sn-label {
  font-size: 10px;
  color: var(--monitor-status-label);
}

.sn-value {
  font-size: 11px;
  font-weight: 500;
  color: var(--monitor-title-text);
  font-family: monospace;
}

.refresh-btn {
  font-size: 11px;
  padding: 3px 8px;
}

.loading-spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
