<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CesiumMap from './data-screen/CesiumMap.vue'
import ElectronicFence from './data-screen/functions/8_ElectronicFence.vue'

const now = ref(new Date())
let clockTimer = null

const isOnline = ref(navigator.onLine)
const cesiumMapRef = ref(null)
const fencePanelRef = ref(null)

const props = defineProps({
  routeData: {
    type: Array,
    default: () => []
  },
  eventVisualization: {
    type: Object,
    default: null,
  },
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
})

onBeforeUnmount(() => {
  if (clockTimer) {
    window.clearInterval(clockTimer)
    clockTimer = null
  }
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

async function fetchGridBoundaryByCode(gridCode) {
  if (!gridCode) return null
  const headers = new Headers()
  headers.append('X-API-Key', import.meta.env.VITE_API_KEY || '')
  headers.append('Content-Type', 'application/json')
  const resp = await fetch('/api/multiSource/basicGrid/getGridBoundaryByCode', {
    method: 'POST',
    headers,
    body: JSON.stringify({ gridCode }),
  })
  const data = await resp.json().catch(() => null)
  if (!resp.ok || data?.status !== 'success' || !data?.data) return null
  return data.data
}

function normalizeGridBoundary(grid) {
  if (!grid) return null
  return {
    code: grid.code || grid.gridCode || '',
    center: grid.center || null,
    bounds: {
      west: grid.west,
      east: grid.east,
      south: grid.south,
      north: grid.north,
      top: grid.top ?? 0,
      bottom: grid.bottom ?? 0,
    },
  }
}

async function drawWarningSampleGrids(warningArea) {
  const codes = Array.isArray(warningArea?.sampleGrids) ? warningArea.sampleGrids : []
  const limit = Number(warningArea?.sampleGridCount) || codes.length
  const sampleCells = []

  for (const code of codes.slice(0, limit)) {
    const cell = await fetchGridBoundaryByCode(code)
    const normalized = normalizeGridBoundary(cell)
    if (normalized) sampleCells.push(normalized)
  }

  if (sampleCells.length > 0 && cesiumMapRef.value && typeof cesiumMapRef.value.drawGridBoundary === 'function') {
    cesiumMapRef.value.drawGridBoundary({
      cells: sampleCells.map(cell => ({
        code: cell.code,
        center: cell.center,
        bounds: cell.bounds,
        color: '#f59e0b',
        level: warningArea?.gridLevel,
      }))
    })
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
  return {
    total: fences.length,
    applied: applied,
    unapplied: fences.length - applied
  }
})

</script>

<template>
  <div class="app-root">
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
      <!-- 左侧电子围栏面板 -->
      <div class="control-panel-fence">
        <div class="fence-panel-wrapper">
          <ElectronicFence
            ref="fencePanelRef"
            :map-ready="!!cesiumMapRef"
            @draw-sphere-fence="handleDrawSphereFence"
            @draw-line-fence="handleDrawLineFence"
            @complete-sphere-fence="handleCompleteSphereFence"
            @complete-line-fence="handleCompleteLineFence"
            @clear-fence="handleClearFence"
            @toggle-fence="handleToggleFence"
            @delete-fence="handleDeleteFence"
            @save-fence="handleSaveFence"
            @draw-fence="handleDrawFence"
          />
        </div>

        <!-- 电子围栏统计信息 -->
        <div class="fence-stats">
          <div class="stats-title">电子围栏统计</div>
          <div class="stats-grid">
            <div class="stat-item">
              <div class="stat-value">{{ fenceStats.total }}</div>
              <div class="stat-label">已存储</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ fenceStats.applied }}</div>
              <div class="stat-label">已应用</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ fenceStats.unapplied }}</div>
              <div class="stat-label">未应用</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧监控航线面板 -->
      <div class="control-panel-route">
        <!-- 航线列表区域 -->
        <div class="route-list-section">
          <div class="panel-header">
            <span class="panel-title">已展示航线</span>
            <span class="panel-count">{{ routeStats.total }}</span>
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

        <!-- 航线统计区域 -->
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
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-root {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
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
  background: #1a365d;
  border-bottom: 2px solid #2c5282;
  z-index: 100;
}

/* 导航按钮 */
.left-nav-buttons {
  display: flex;
  gap: 4px;
}

.nav-btn {
  padding: 6px 16px;
  background: #2c5282;
  border: 1px solid #3182ce;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}

.nav-btn:hover {
  background: #3182ce;
}

.nav-btn.active {
  background: #c05621;
  border-color: #dd6b20;
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
  color: #fff;
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
  color: #a0aec0;
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
  background: #2d3748;
  border: 1px solid #4a5568;
  color: #e2e8f0;
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

/* 电子围栏控制面板 */
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

.fence-panel-wrapper {
  flex: 3;
  overflow: hidden;
  position: relative;
  border-radius: 0;
  box-shadow: none;
}

.fence-panel-wrapper::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(to right, rgba(180, 200, 220, 0.92) 0%, rgba(255, 255, 255, 0.5) 50%, rgba(255, 255, 255, 0.25) 100%);
  border-radius: 0;
  pointer-events: none;
  z-index: 0;
}

.fence-panel-wrapper > * {
  position: relative;
  z-index: 1;
}

.fence-stats {
  flex: 1;
  min-height: 80px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  position: relative;
  background: linear-gradient(to right, rgba(180, 200, 220, 0.92) 0%, rgba(255, 255, 255, 0.5) 50%);
  border-radius: 0;
  margin: 0;
  box-shadow: none;
}

.fence-stats > * {
  position: relative;
  z-index: 1;
}

.stats-title {
  font-size: 13px;
  font-weight: 600;
  color: #2d3748;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
}

.stats-grid {
  display: flex;
  flex: 1;
  gap: 8px;
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(247, 250, 252, 0.3);
  border-radius: 8px;
  padding: 8px 4px;
  border: 1px solid rgba(226, 232, 240, 0.4);
}

.stat-value {
  font-size: 20px;
  font-weight: bold;
  color: #2d3748;
  font-family: monospace;
}

.stat-label {
  font-size: 11px;
  color: #718096;
  margin-top: 4px;
}

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
  background: linear-gradient(to left, rgba(180, 200, 220, 0.92) 0%, rgba(255, 255, 255, 0.5) 50%, rgba(255, 255, 255, 0.25) 100%);
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
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
  background: transparent;
  border-radius: 0;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #2d3748;
}

.panel-count {
  font-size: 16px;
  font-weight: bold;
  color: #2b6cb0;
  font-family: monospace;
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
  color: #a0aec0;
  font-size: 12px;
}

.route-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px;
  margin-bottom: 6px;
  background: rgba(247, 250, 252, 0.3);
  border-radius: 8px;
  border: 1px solid rgba(226, 232, 240, 0.4);
  transition: all 0.2s ease;
}

.route-item:hover {
  background: rgba(247, 250, 252, 0.5);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.route-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.route-name {
  font-size: 13px;
  color: #2d3748;
  font-weight: 500;
}

.route-id {
  font-size: 11px;
  color: #718096;
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
  color: #2b6cb0;
  font-family: monospace;
}

.grid-label {
  font-size: 10px;
  color: #718096;
}

.route-stats-section {
  flex: 1;
  min-height: 80px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  position: relative;
  background: linear-gradient(to left, rgba(180, 200, 220, 0.92) 0%, rgba(255, 255, 255, 0.5) 50%);
  border-radius: 0;
  margin: 0;
  box-shadow: none;
}

.route-stats-section > * {
  position: relative;
  z-index: 1;
}

.route-stats-section .stats-title {
  font-size: 13px;
  font-weight: 600;
  color: #2d3748;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
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
  background: rgba(247, 250, 252, 0.3);
  border-radius: 8px;
  padding: 8px 4px;
  border: 1px solid rgba(226, 232, 240, 0.4);
}

.route-stats-section .stat-value {
  font-size: 18px;
  font-weight: bold;
  color: #2b6cb0;
  font-family: monospace;
}

.route-stats-section .stat-label {
  font-size: 11px;
  color: #718096;
  margin-top: 4px;
}
</style>
