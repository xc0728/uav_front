<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { MapPin } from 'lucide-vue-next'
import ServicePanel from './data-screen/ServicePanel.vue'
import InfoManagementPanel from './data-screen/functions/InfoManagementPanel.vue'
import CesiumMap from './data-screen/CesiumMap.vue'
import MonitoringScreen from './MonitoringScreen.vue'

const now = ref(new Date())
let clockTimer = null

const servicePanelRef = ref(null)
const infoManagementPanelRef = ref(null)
const cesiumMapRef = ref(null)
const monitoringScreenRef = ref(null)

const currentPage = ref('main') // 'main' | 'monitoring' | 'info'

// 存储所有已开启监控的航线数据
const monitoredRoutes = ref({})

// 已监控航线ID列表（计算属性）
const monitoredRouteIds = computed(() => Object.keys(monitoredRoutes.value))

// 监控航线数据
const monitoredRoutesData = computed(() => Object.values(monitoredRoutes.value))

const isOnline = ref(navigator.onLine)
let onlineTimer = null

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

function handleMapPointSelected(payload) {
  if (!payload || !servicePanelRef.value) return
  const { lon, lat, height } = payload
  const panel = servicePanelRef.value
  if (panel && typeof panel.applyMapPointToActiveService === 'function') {
    panel.applyMapPointToActiveService(lon, lat, height)
  }
}

function handleShowPoint(payload) {
  console.log('[DataScreen] 收到 showPoint 事件:', payload)
  if (!cesiumMapRef.value) {
    console.log('[DataScreen] cesiumMapRef 不存在')
    return
  }
  // 如果 payload 为 null 或 undefined，清除中心点
  if (!payload) {
    if (typeof cesiumMapRef.value.clearCenterPoint === 'function') {
      console.log('[DataScreen] 清除中心点')
      cesiumMapRef.value.clearCenterPoint()
    }
    return
  }
  const { longitude, latitude, height } = payload
  if (cesiumMapRef.value && typeof cesiumMapRef.value.flyToPoint === 'function') {
    console.log('[DataScreen] 调用 flyToPoint:', longitude, latitude, height)
    cesiumMapRef.value.flyToPoint(longitude, latitude, height)
  } else {
    console.log('[DataScreen] flyToPoint 方法不存在')
  }
}

function handleShowGrid(payload) {
  console.log('[DataScreen] 收到 showGrid 事件:', payload)
  if (!payload || !cesiumMapRef.value) {
    console.log('[DataScreen] cesiumMapRef 不存在')
    return
  }
  if (cesiumMapRef.value && typeof cesiumMapRef.value.drawGridBoundary === 'function') {
    cesiumMapRef.value.drawGridBoundary(payload)
  } else {
    console.log('[DataScreen] drawGridBoundary 方法不存在')
  }
}

function handleShowLine(payload) {
  if (!cesiumMapRef.value) return
  if (typeof cesiumMapRef.value.drawLinePath === 'function') {
    cesiumMapRef.value.drawLinePath(payload)
  }
}

function handleShowPolygon(payload) {
  if (!cesiumMapRef.value) return
  if (typeof cesiumMapRef.value.drawPolygon === 'function') {
    cesiumMapRef.value.drawPolygon(payload)
  }
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

function handleOnline() {
  isOnline.value = true
}

function handleOffline() {
  isOnline.value = false
}

function goToGridOperator() {
  currentPage.value = 'main'
}

function goToMonitoring() {
  currentPage.value = 'monitoring'
}

function goToInfoSystem() {
  currentPage.value = 'info'
}

function handleSwitchPage(page) {
  if (page === 'grid') {
    currentPage.value = 'main'
  } else if (page === 'monitoring') {
    currentPage.value = 'monitoring'
  } else if (page === 'info') {
    currentPage.value = 'info'
  }
}

// 开启监控 - 调用后端获取路径，在监控大屏上显示
async function handleRouteMonitorStart(payload) {
  console.log('[DataScreen] 开启监控:', payload)
  const { id, name } = payload

  try {
    const resp = await fetch(`/api/airRoute/routeManagement/getRouteRecordById?id=${id}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!resp.ok) {
      throw new Error(`请求失败: ${resp.status}`)
    }

    const data = await resp.json()
    console.log('[DataScreen] 航线详情返回:', data)

    if (data?.status === 'success' && data?.results?.path) {
      // 存储到已监控列表
      monitoredRoutes.value[id] = { id, name, path: data.results.path }
    } else {
      console.warn('[DataScreen] 航线数据格式不正确')
    }
  } catch (err) {
    console.error('[DataScreen] 加载航线路径失败:', err)
  }
}

// 关闭监控 - 清除监控大屏上的路径
function handleRouteMonitorStop(payload) {
  console.log('[DataScreen] 关闭监控:', payload)
  const { id } = payload

  // 先清除地图上的航线
  if (monitoringScreenRef.value && typeof monitoringScreenRef.value.clearRouteGrid === 'function') {
    monitoringScreenRef.value.clearRouteGrid(id)
  }

  // 从已监控列表移除
  delete monitoredRoutes.value[id]
}

// 信息管理系统事件处理
function handleInfoShowPoint(payload) {
  console.log('[DataScreen] 收到 info showPoint 事件:', payload)
  if (!payload || !cesiumMapRef.value) return
  const { lon, lat, height } = payload
  if (cesiumMapRef.value && typeof cesiumMapRef.value.flyToPoint === 'function') {
    cesiumMapRef.value.flyToPoint(lon, lat, height)
  }
}

function handleInfoShowGrid(payload) {
  console.log('[DataScreen] 收到 info showGrid 事件:', payload)
  if (!payload || !cesiumMapRef.value) return
  if (cesiumMapRef.value && typeof cesiumMapRef.value.drawGridBoundary === 'function') {
    cesiumMapRef.value.drawGridBoundary(payload)
  }
}

// 处理地图框选开始
function handleBoxSelectStart() {
  console.log('[DataScreen] 地图框选开始')
  if (cesiumMapRef.value && typeof cesiumMapRef.value.startBoxSelection === 'function') {
    cesiumMapRef.value.startBoxSelection()
  }
}

// 处理地图框选结束
function handleBoxSelectEnd(bounds) {
  console.log('[DataScreen] 地图框选结束，边界:', bounds)
  if (cesiumMapRef.value && typeof cesiumMapRef.value.stopBoxSelection === 'function') {
    cesiumMapRef.value.stopBoxSelection()
  }

  if (!bounds || !servicePanelRef.value) return

  // 将边界信息传递给当前激活的服务
  const panel = servicePanelRef.value
  if (panel && typeof panel.applyBoundsToActiveService === 'function') {
    panel.applyBoundsToActiveService(bounds)
  }
}

// 处理获取视图边界请求
function handleGetViewBounds() {
  console.log('[DataScreen] 收到获取视图边界请求')
  if (!cesiumMapRef.value || !servicePanelRef.value) return

  const bounds = cesiumMapRef.value.getViewBounds()
  if (!bounds) {
    console.log('[DataScreen] 无法获取视图边界')
    return
  }

  // 将边界信息传递给当前激活的服务
  const panel = servicePanelRef.value
  if (panel && typeof panel.setViewBoundsToActiveService === 'function') {
    panel.setViewBoundsToActiveService(bounds)
  }
}
</script>

<template>
  <div class="app-root">
    <!-- 顶部导航 - 始终显示 -->
    <header class="topbar">
      <!-- 左侧系统状态 -->
      <div class="system-status">
        <span class="side-label">系统状态</span>
        <div class="side-value-group">
          <span :class="['side-value', networkStatusClass]">{{ networkStatus }}</span>
        </div>
      </div>

      <!-- 左侧角框装饰 -->
      <div class="header-corner left">
        <div class="corner-bracket top-left"></div>
        <div class="corner-bracket bottom-left"></div>
      </div>

      <!-- 左侧子页面导航按钮 -->
      <div class="left-nav-buttons">
        <div class="nav-btn" :class="{ active: currentPage === 'main' }" @click="goToGridOperator">网格化算子</div>
        <div class="nav-btn" :class="{ active: currentPage === 'monitoring' }" @click="goToMonitoring">实时监控大屏</div>
        <div class="nav-btn" :class="{ active: currentPage === 'info' }" @click="goToInfoSystem">信息管理系统</div>
      </div>

      <!-- 中间标题 -->
      <div class="topbar-center">
        <!-- 左侧装饰线 - 与梯形斜边平行 -->
        <div class="title-side-lines left">
          <span class="side-line line-long"></span>
          <span class="side-line line-short"></span>
        </div>

        <!-- 标题外框 - 梯形 -->
        <div class="title-frame">
          <div class="title-frame-inner">
            <h1 class="main-title">低空路径智绘平台</h1>
          </div>
          <!-- 标题下方装饰线 -->
          <div class="title-underline">
            <span class="underline-line"></span>
            <span class="underline-dot"></span>
            <span class="underline-line"></span>
          </div>
        </div>

        <!-- 右侧装饰线 - 与梯形斜边平行 -->
        <div class="title-side-lines right">
          <span class="side-line line-long"></span>
          <span class="side-line line-short"></span>
        </div>
      </div>

      <!-- 右侧英文标题 -->
      <div class="header-english-title">
        <span class="english-main">Grid-based</span>
        <span class="english-sub">Low-altitude Path Planning Platform</span>
      </div>

      <!-- 右侧角框装饰 -->
      <div class="header-corner right">
        <div class="corner-bracket top-right"></div>
        <div class="corner-bracket bottom-right"></div>
      </div>

      <!-- 右侧时间 -->
      <div class="topbar-side right">
        <div class="time-box">
          <MapPin :size="14" />
          <span>{{ timeText }}</span>
        </div>
      </div>
    </header>

    <!-- 主页面 - 网格化算子 -->
    <template v-if="currentPage === 'main'">
      <CesiumMap
        ref="cesiumMapRef"
        @point-selected="handleMapPointSelected"
        @box-select-start="handleBoxSelectStart"
        @box-select-end="handleBoxSelectEnd"
        @get-view-bounds="handleGetViewBounds"
      />
      <main class="app-main">
        <ServicePanel
          ref="servicePanelRef"
          panel-type="control"
          @show-point="handleShowPoint"
          @show-grid="handleShowGrid"
          @show-line="handleShowLine"
          @show-polygon="handleShowPolygon"
          @get-view-bounds="handleGetViewBounds"
        />
      </main>
    </template>

    <!-- 实时监控大屏 - 始终渲染，使用 v-show -->
    <div v-show="currentPage === 'monitoring'" class="monitoring-wrapper">
      <MonitoringScreen
        ref="monitoringScreenRef"
        :route-data="monitoredRoutesData"
        @switch_page="handleSwitchPage"
      />
    </div>

    <!-- 信息管理系统 - 始终渲染，使用 v-show 保持状态 -->
    <div v-show="currentPage === 'info'" class="info-page-wrapper">
      <InfoManagementPanel
        ref="infoManagementPanelRef"
        :monitored-route-ids="monitoredRouteIds"
        @route-monitor-start="handleRouteMonitorStart"
        @route-monitor-stop="handleRouteMonitorStop"
      />
    </div>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

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
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  background: linear-gradient(180deg, rgba(10, 15, 30, 0.98) 0%, rgba(15, 23, 42, 0.95) 100%);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(59, 130, 246, 0.15);
  z-index: 100;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.3);
}

.topbar::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 50%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.5), rgba(14, 165, 233, 0.5), rgba(59, 130, 246, 0.5), transparent);
}

/* 两侧区域 */
.topbar-side {
  width: 160px;
  display: flex;
  align-items: center;
}

.topbar-side.left {
  gap: 10px;
  justify-content: flex-end;
}

.topbar-side.right {
  position: absolute;
  right: 0;
  justify-content: flex-end;
  gap: 10px;
}

/* 标题左右角框装饰 */
.header-corner {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header-corner.left {
  left: 120px;
}

.header-corner.right {
  right: 180px;
}

/* 右侧英文标题 */
.header-english-title {
  position: absolute;
  right: 250px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 8px;
}

.header-english-title .english-main {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.85);
  font-family: 'Georgia', 'Times New Roman', serif;
  font-style: italic;
  font-weight: 600;
  letter-spacing: 2px;
}

.header-english-title .english-sub {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.6);
  font-family: 'Georgia', 'Times New Roman', serif;
  font-style: italic;
  letter-spacing: 1px;
}

/* 左侧子页面导航按钮 */
.left-nav-buttons {
  position: absolute;
  left: 150px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 32px;
  z-index: 10;
}

.nav-btn {
  padding: 8px 20px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(14, 165, 233, 0.08) 100%);
  border: 1px solid rgba(59, 130, 246, 0.25);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s ease;
  text-align: center;
  white-space: nowrap;
}

.nav-btn:hover {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(14, 165, 233, 0.2) 100%);
  border-color: rgba(59, 130, 246, 0.5);
  color: #fff;
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.2);
  transform: translateY(-2px);
}

.nav-btn.active {
  background: linear-gradient(135deg, rgba(249, 115, 22, 0.25) 0%, rgba(234, 88, 12, 0.15) 100%);
  border-color: rgba(249, 115, 22, 0.5);
  color: #fb923c;
  box-shadow: 0 0 15px rgba(249, 115, 22, 0.25);
}

/* 系统状态 - 独立定位 */
.system-status {
  position: absolute;
  left: 40px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.side-label {
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
}

.side-value-group {
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 角落装饰 */
.side-decoration {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.corner-bracket {
  width: 14px;
  height: 14px;
  position: relative;
}

.corner-bracket::before,
.corner-bracket::after {
  content: '';
  position: absolute;
  background: rgba(59, 130, 246, 0.5);
}

.corner-bracket.top-left::before {
  width: 10px;
  height: 2px;
  top: 0;
  left: 0;
}

.corner-bracket.top-left::after {
  width: 2px;
  height: 10px;
  top: 0;
  left: 0;
}

.corner-bracket.bottom-left::before {
  width: 10px;
  height: 2px;
  bottom: 0;
  left: 0;
}

.corner-bracket.bottom-left::after {
  width: 2px;
  height: 10px;
  bottom: 0;
  left: 0;
}

.corner-bracket.top-right::before {
  width: 10px;
  height: 2px;
  top: 0;
  right: 0;
}

.corner-bracket.top-right::after {
  width: 2px;
  height: 10px;
  top: 0;
  right: 0;
}

.corner-bracket.bottom-right::before {
  width: 10px;
  height: 2px;
  bottom: 0;
  right: 0;
}

.corner-bracket.bottom-right::after {
  width: 2px;
  height: 10px;
  bottom: 0;
  right: 0;
}

/* 侧边文字 */
.side-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.side-label {
  font-size: 9px;
  color: rgba(148, 163, 184, 0.6);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.side-value {
  font-size: 13px;
  font-weight: 600;
}

.side-value.online {
  color: #10b981;
}

.side-value.online::before {
  content: '';
  display: inline-block;
  width: 5px;
  height: 5px;
  background: #10b981;
  border-radius: 50%;
  margin-right: 5px;
  animation: pulse-dot 2s infinite;
}

.side-value.offline {
  color: #ef4444;
}

.side-value.offline::before {
  content: '';
  display: inline-block;
  width: 5px;
  height: 5px;
  background: #ef4444;
  border-radius: 50%;
  margin-right: 5px;
  animation: pulse-dot 2s infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* 中间标题区域 */
.topbar-center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 20px;
}

/* 标题两侧装饰线 */
.title-side-lines {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title-side-lines.left {
  align-items: flex-end;
}

.title-side-lines.right {
  align-items: flex-start;
}

.side-line {
  display: block;
  background: linear-gradient(90deg, transparent 0%, rgba(59, 130, 246, 0.6) 100%);
}

.title-side-lines.left .side-line {
  background: linear-gradient(270deg, transparent 0%, rgba(59, 130, 246, 0.6) 100%);
}

.line-long {
  width: 60px;
  height: 1px;
}

.line-short {
  width: 30px;
  height: 1px;
}

/* 标题框架 - 梯形 */
.title-frame {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.title-frame::before {
  content: '';
  position: absolute;
  top: -8px;
  left: -40px;
  right: -40px;
  bottom: -8px;
  background: linear-gradient(180deg, rgba(20, 35, 70, 0.9) 0%, rgba(10, 18, 40, 0.7) 100%);
  clip-path: polygon(8% 0%, 92% 0%, 100% 100%, 0% 100%);
  z-index: -1;
}

.title-frame::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border: 1px solid rgba(59, 130, 246, 0.3);
  clip-path: polygon(8% 0%, 92% 0%, 100% 100%, 0% 100%);
  z-index: -1;
}

.title-frame-inner {
  padding: 6px 50px 4px;
}

/* 主标题 */
.main-title {
  font-size: 20px;
  font-weight: 600;
  color: #fff;
  letter-spacing: 4px;
  text-shadow: 0 0 20px rgba(59, 130, 246, 0.5);
  margin: 0;
  white-space: nowrap;
}

/* 标题下划线装饰 */
.title-underline {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 2px;
}

.underline-line {
  width: 80px;
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, rgba(59, 130, 246, 0.6) 50%, transparent 100%);
}

.underline-line:last-child {
  background: linear-gradient(270deg, transparent 0%, rgba(59, 130, 246, 0.6) 50%, transparent 100%);
}

.underline-dot {
  width: 6px;
  height: 6px;
  background: rgba(59, 130, 246, 0.8);
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.8);
}

/* 右侧时间盒子 */
.time-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: rgba(59, 130, 246, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.15);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  backdrop-filter: blur(8px);
  transition: all 0.3s ease;
}

.time-box:hover {
  background: rgba(59, 130, 246, 0.12);
  border-color: rgba(59, 130, 246, 0.25);
  box-shadow: 0 0 15px rgba(59, 130, 246, 0.1);
}

.time-box svg {
  color: rgba(59, 130, 246, 0.7);
}

.app-main {
  position: fixed;
  top: 60px;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  pointer-events: none;
}

/* 信息管理系统全屏内容区 */
.info-main {
  position: fixed;
  top: 60px;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  background: #f8fafc;
}

/* 信息管理系统页面包装器 - 覆盖在主内容区之上 */
.info-page-wrapper {
  position: fixed;
  top: 60px;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 60;
  background: #ffffff;
  overflow: auto;
}

/* 监控大屏页面包装器 */
.monitoring-wrapper {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
}
</style>
