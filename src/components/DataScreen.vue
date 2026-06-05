<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { MapPin } from 'lucide-vue-next'
import ServicePanel from './data-screen/ServicePanel.vue'
import InfoManagementPanel from './data-screen/functions/InfoManagementPanel.vue'
import CesiumMap from './data-screen/CesiumMap.vue'
import MonitoringScreen from './MonitoringScreen.vue'

const THEME_CONFIG = {
  white: {
    appClass: 'theme-white',
    monitoringTheme: 'white',
  },
  techBlue: {
    appClass: 'theme-tech-blue',
    monitoringTheme: 'tech-blue',
  },
  freshGreen: {
    appClass: 'theme-fresh-green',
    monitoringTheme: 'fresh-green',
  },
}

const now = ref(new Date())
let clockTimer = null

const servicePanelRef = ref(null)
const infoManagementPanelRef = ref(null)
const cesiumMapRef = ref(null)
const monitoringScreenRef = ref(null)
const pendingEventVisualization = ref(null)
const pendingAnomalyEvents = ref([])
const visibleNoFlyZones = ref({})

const currentPage = ref('main') // 'main' | 'monitoring' | 'info'
const currentTheme = ref('white')
const isThemeMenuOpen = ref(false)

const themeOptions = [
  { value: 'white', label: '天空白' },
  { value: 'techBlue', label: '科技蓝' },
  { value: 'freshGreen', label: '清新绿' },
]

const activeTheme = computed(() => THEME_CONFIG[currentTheme.value] || THEME_CONFIG.white)

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

function toggleThemeMenu() {
  isThemeMenuOpen.value = !isThemeMenuOpen.value
}

function selectTheme(themeValue) {
  currentTheme.value = themeValue
  isThemeMenuOpen.value = false
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

function handleVisualizeEvent(payload) {
  console.log('[DataScreen] 收到异常事件可视化请求:', payload)
  pendingEventVisualization.value = payload || null
  if (payload) {
    currentPage.value = 'monitoring'
  }
}

function handleAnomalyTriggered(payload) {
  if (!payload) return
  pendingAnomalyEvents.value = [...pendingAnomalyEvents.value, payload]
  if (infoManagementPanelRef.value && typeof infoManagementPanelRef.value.addAnomalyEvent === 'function') {
    infoManagementPanelRef.value.addAnomalyEvent(payload)
  }
}

function handleShowNoFlyZone(zone) {
  if (!zone?.zone_id) return
  visibleNoFlyZones.value = { ...visibleNoFlyZones.value, [zone.zone_id]: zone }
  if (monitoringScreenRef.value && typeof monitoringScreenRef.value.addNoFlyZoneVisualization === 'function') {
    monitoringScreenRef.value.addNoFlyZoneVisualization(zone)
  }
}

function handleHideNoFlyZone({ zoneId }) {
  if (!zoneId) return
  const newMap = { ...visibleNoFlyZones.value }
  delete newMap[zoneId]
  visibleNoFlyZones.value = newMap
  if (monitoringScreenRef.value && typeof monitoringScreenRef.value.removeNoFlyZoneVisualization === 'function') {
    monitoringScreenRef.value.removeNoFlyZoneVisualization(zoneId)
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
  <div class="app-root" :class="activeTheme.appClass">
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
        <div class="nav-btn" :class="{ active: currentPage === 'info' }" @click="goToInfoSystem">信息管理系统</div>
      </div>

      <!-- 中间标题 -->
      <div class="topbar-center-wrapper">
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

        <div class="title-action-buttons">
          <div class="nav-btn title-nav-btn" :class="{ active: currentPage === 'monitoring' }" @click="goToMonitoring">实时监控大屏</div>
          <div class="theme-dropdown" :class="{ open: isThemeMenuOpen }">
            <button class="nav-btn theme-dropdown-trigger" type="button" @click="toggleThemeMenu">
              <span>主题颜色</span>
            </button>
            <div v-if="isThemeMenuOpen" class="theme-dropdown-menu">
              <button
                v-for="option in themeOptions"
                :key="option.value"
                class="theme-dropdown-item"
                :class="{ active: currentTheme === option.value }"
                type="button"
                @click="selectTheme(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
        </div>
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
          :theme="currentTheme"
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
    :event-visualization="pendingEventVisualization"
    :visible-no-fly-zones="visibleNoFlyZones"
    :theme="activeTheme.monitoringTheme"
    @switch_page="handleSwitchPage"
    @visualize-event="handleVisualizeEvent"
    @anomaly-triggered="handleAnomalyTriggered"
  />
    </div>

    <!-- 信息管理系统 - 始终渲染，使用 v-show 保持状态 -->
    <div v-show="currentPage === 'info'" class="info-page-wrapper">
      <InfoManagementPanel
    ref="infoManagementPanelRef"
    :monitored-route-ids="monitoredRouteIds"
    @route-monitor-start="handleRouteMonitorStart"
    @route-monitor-stop="handleRouteMonitorStop"
    @visualize-event="handleVisualizeEvent"
    @show-no-fly-zone="handleShowNoFlyZone"
    @hide-no-fly-zone="handleHideNoFlyZone"
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
  --theme-topbar-bg: linear-gradient(180deg, #d0e8f5 0%, #c0ddf0 100%);
  --theme-topbar-border: rgba(90, 150, 200, 0.6);
  --theme-topbar-shadow: 0 2px 16px rgba(60, 120, 180, 0.18);
  --theme-topbar-highlight: linear-gradient(90deg, transparent, rgba(70, 140, 200, 0.5), rgba(100, 170, 220, 0.7), rgba(70, 140, 200, 0.5), transparent);
  --theme-nav-bg: rgba(255, 255, 255, 0.85);
  --theme-nav-border: rgba(90, 150, 200, 0.6);
  --theme-nav-text: #1e4a6e;
  --theme-nav-hover-bg: #ffffff;
  --theme-nav-hover-border: #5b9fd4;
  --theme-nav-hover-shadow: 0 2px 8px rgba(60, 120, 180, 0.25);
  --theme-nav-active-bg: #ffffff;
  --theme-nav-active-border: #4a90c2;
  --theme-nav-active-text: #1e6ba8;
  --theme-nav-active-shadow: 0 2px 10px rgba(60, 120, 180, 0.3);
  --theme-side-label: rgba(30, 74, 110, 0.65);
  --theme-side-label-secondary: rgba(30, 74, 110, 0.55);
  --theme-corner: rgba(70, 130, 180, 0.7);
  --theme-title-text: #1e4a6e;
  --theme-title-frame-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(235, 245, 252, 0.82));
  --theme-title-frame-border: rgba(90, 150, 200, 0.55);
  --theme-title-shadow: 0 8px 24px rgba(60, 120, 180, 0.16);
  --theme-title-side-line: rgba(82, 146, 194, 0.9);
  --theme-title-side-line-soft: rgba(82, 146, 194, 0.45);
  --theme-underline-line: linear-gradient(90deg, rgba(67, 128, 179, 0), rgba(67, 128, 179, 0.75), rgba(67, 128, 179, 0));
  --theme-underline-dot: #4f93c8;
  --theme-time-bg: rgba(255, 255, 255, 0.9);
  --theme-time-border: rgba(90, 150, 200, 0.45);
  --theme-time-text: #1e4a6e;
  --theme-dropdown-bg: rgba(255, 255, 255, 0.96);
  --theme-dropdown-border: rgba(90, 150, 200, 0.35);
  --theme-dropdown-shadow: 0 10px 30px rgba(60, 120, 180, 0.18);
  --theme-dropdown-item-bg: rgba(242, 248, 253, 0.92);
  --theme-dropdown-item-text: #245277;
  --theme-dropdown-item-hover-bg: #ffffff;
  --theme-dropdown-item-hover-border: rgba(90, 150, 200, 0.45);
  --theme-dropdown-item-hover-text: #1d628f;
}

.app-root.theme-tech-blue {
  --theme-topbar-bg: linear-gradient(180deg, rgba(6, 26, 56, 0.96) 0%, rgba(7, 45, 92, 0.94) 55%, rgba(5, 67, 130, 0.9) 100%);
  --theme-topbar-border: rgba(76, 178, 255, 0.42);
  --theme-topbar-shadow: 0 10px 32px rgba(4, 22, 48, 0.42);
  --theme-topbar-highlight: linear-gradient(90deg, transparent, rgba(80, 180, 255, 0.08), rgba(103, 216, 255, 0.88), rgba(80, 180, 255, 0.08), transparent);
  --theme-nav-bg: linear-gradient(180deg, rgba(10, 45, 90, 0.84), rgba(8, 31, 70, 0.9));
  --theme-nav-border: rgba(73, 182, 255, 0.58);
  --theme-nav-text: #d6f3ff;
  --theme-nav-hover-bg: linear-gradient(180deg, rgba(16, 70, 132, 0.92), rgba(10, 44, 89, 0.96));
  --theme-nav-hover-border: rgba(111, 223, 255, 0.78);
  --theme-nav-hover-shadow: 0 6px 20px rgba(19, 97, 184, 0.34);
  --theme-nav-active-bg: linear-gradient(180deg, rgba(18, 110, 189, 0.98), rgba(10, 67, 128, 0.96));
  --theme-nav-active-border: rgba(128, 240, 255, 0.9);
  --theme-nav-active-text: #f1fdff;
  --theme-nav-active-shadow: 0 8px 24px rgba(12, 111, 196, 0.42);
  --theme-side-label: rgba(190, 228, 255, 0.8);
  --theme-side-label-secondary: rgba(190, 228, 255, 0.68);
  --theme-corner: rgba(102, 219, 255, 0.9);
  --theme-title-text: #ecfbff;
  --theme-title-frame-bg: linear-gradient(180deg, rgba(9, 43, 84, 0.88), rgba(4, 24, 52, 0.94));
  --theme-title-frame-border: rgba(99, 212, 255, 0.7);
  --theme-title-shadow: 0 14px 34px rgba(2, 11, 24, 0.38);
  --theme-title-side-line: rgba(102, 227, 255, 0.98);
  --theme-title-side-line-soft: rgba(102, 227, 255, 0.38);
  --theme-underline-line: linear-gradient(90deg, rgba(74, 204, 255, 0), rgba(116, 236, 255, 0.92), rgba(74, 204, 255, 0));
  --theme-underline-dot: #7cecff;
  --theme-time-bg: linear-gradient(180deg, rgba(8, 36, 74, 0.88), rgba(5, 23, 48, 0.94));
  --theme-time-border: rgba(91, 205, 255, 0.52);
  --theme-time-text: #dff8ff;
  --theme-dropdown-bg: rgba(5, 25, 53, 0.96);
  --theme-dropdown-border: rgba(76, 191, 255, 0.42);
  --theme-dropdown-shadow: 0 16px 40px rgba(2, 15, 33, 0.42);
  --theme-dropdown-item-bg: rgba(10, 41, 82, 0.78);
  --theme-dropdown-item-text: #c9f4ff;
  --theme-dropdown-item-hover-bg: rgba(17, 87, 156, 0.9);
  --theme-dropdown-item-hover-border: rgba(111, 223, 255, 0.72);
  --theme-dropdown-item-hover-text: #f6feff;
}

.app-root.theme-fresh-green {
  --theme-topbar-bg: linear-gradient(180deg, rgba(232, 248, 238, 0.96) 0%, rgba(214, 242, 225, 0.94) 55%, rgba(201, 236, 214, 0.9) 100%);
  --theme-topbar-border: rgba(106, 181, 136, 0.42);
  --theme-topbar-shadow: 0 10px 32px rgba(106, 181, 136, 0.16);
  --theme-topbar-highlight: linear-gradient(90deg, transparent, rgba(144, 214, 171, 0.08), rgba(167, 235, 191, 0.82), rgba(144, 214, 171, 0.08), transparent);
  --theme-nav-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(240, 250, 244, 0.92));
  --theme-nav-border: rgba(120, 196, 149, 0.52);
  --theme-nav-text: #35624a;
  --theme-nav-hover-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(232, 248, 238, 0.96));
  --theme-nav-hover-border: rgba(106, 181, 136, 0.72);
  --theme-nav-hover-shadow: 0 6px 20px rgba(106, 181, 136, 0.18);
  --theme-nav-active-bg: linear-gradient(180deg, rgba(244, 253, 247, 1), rgba(225, 246, 233, 0.98));
  --theme-nav-active-border: rgba(94, 172, 125, 0.86);
  --theme-nav-active-text: #2f6a49;
  --theme-nav-active-shadow: 0 8px 24px rgba(106, 181, 136, 0.2);
  --theme-side-label: rgba(53, 98, 74, 0.72);
  --theme-side-label-secondary: rgba(53, 98, 74, 0.58);
  --theme-corner: rgba(116, 191, 145, 0.86);
  --theme-title-text: #315d46;
  --theme-title-frame-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(233, 248, 239, 0.84));
  --theme-title-frame-border: rgba(122, 197, 150, 0.58);
  --theme-title-shadow: 0 12px 28px rgba(106, 181, 136, 0.14);
  --theme-title-side-line: rgba(122, 197, 150, 0.92);
  --theme-title-side-line-soft: rgba(122, 197, 150, 0.38);
  --theme-underline-line: linear-gradient(90deg, rgba(122, 197, 150, 0), rgba(122, 197, 150, 0.88), rgba(122, 197, 150, 0));
  --theme-underline-dot: #74bf91;
  --theme-time-bg: rgba(255, 255, 255, 0.88);
  --theme-time-border: rgba(122, 197, 150, 0.44);
  --theme-time-text: #3c6d53;
  --theme-dropdown-bg: rgba(248, 253, 250, 0.97);
  --theme-dropdown-border: rgba(122, 197, 150, 0.36);
  --theme-dropdown-shadow: 0 16px 40px rgba(106, 181, 136, 0.18);
  --theme-dropdown-item-bg: rgba(240, 250, 244, 0.92);
  --theme-dropdown-item-text: #3b6a50;
  --theme-dropdown-item-hover-bg: #ffffff;
  --theme-dropdown-item-hover-border: rgba(122, 197, 150, 0.48);
  --theme-dropdown-item-hover-text: #2f6a49;
}

/* 顶部导航 - 清新绿 */
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
  background: var(--theme-topbar-bg);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--theme-topbar-border);
  z-index: 100;
  box-shadow: var(--theme-topbar-shadow);
}

.topbar::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 50%;
  height: 1px;
  background: var(--theme-topbar-highlight);
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

/* 左侧子页面导航按钮 */
.left-nav-buttons {
  position: absolute;
  left: 230px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 80px;
  z-index: 10;
}

.nav-btn {
  min-width: 132px;
  padding: 8px 20px;
  background: var(--theme-nav-bg);
  border: 1px solid var(--theme-nav-border);
  border-radius: 6px;
  color: var(--theme-nav-text);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.25s ease;
  text-align: center;
  white-space: nowrap;
}

.nav-btn:hover {
  background: var(--theme-nav-hover-bg);
  border-color: var(--theme-nav-hover-border);
  color: var(--theme-nav-text);
  box-shadow: var(--theme-nav-hover-shadow);
  transform: translateY(-1px);
}

.nav-btn.active {
  background: var(--theme-nav-active-bg);
  border-color: var(--theme-nav-active-border);
  color: var(--theme-nav-active-text);
  box-shadow: var(--theme-nav-active-shadow);
  font-weight: 600;
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
  color: var(--theme-side-label);
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
  background: var(--theme-corner);
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
  color: var(--theme-side-label-secondary);
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
.topbar-center-wrapper {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
}

.topbar-center {
  display: flex;
  align-items: center;
  gap: 20px;
}

.title-action-buttons {
  position: absolute;
  left: calc(100% + 42px);
  display: flex;
  align-items: center;
  gap: 14px;
}

.title-nav-btn {
  white-space: nowrap;
}

.theme-dropdown {
  position: relative;
  margin-left: 48px;
}

.theme-dropdown-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.theme-dropdown-menu {
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  min-width: 100%;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--theme-dropdown-bg);
  border: 1px solid var(--theme-dropdown-border);
  border-radius: 10px;
  box-shadow: var(--theme-dropdown-shadow);
  backdrop-filter: blur(12px);
  z-index: 20;
}

.theme-dropdown-item {
  padding: 8px 14px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: var(--theme-dropdown-item-bg);
  color: var(--theme-dropdown-item-text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

.theme-dropdown-item:hover,
.theme-dropdown-item.active {
  background: var(--theme-dropdown-item-hover-bg);
  border-color: var(--theme-dropdown-item-hover-border);
  color: var(--theme-dropdown-item-hover-text);
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
  background: linear-gradient(90deg, transparent 0%, var(--theme-title-side-line) 100%);
}

.title-side-lines.left .side-line {
  background: linear-gradient(270deg, transparent 0%, var(--theme-title-side-line) 100%);
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
  background: linear-gradient(180deg, color-mix(in srgb, var(--theme-title-frame-bg) 88%, white 12%), color-mix(in srgb, var(--theme-title-frame-bg) 72%, transparent 28%));
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
  border: 1px solid var(--theme-title-frame-border);
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
  color: var(--theme-title-text);
  letter-spacing: 4px;
  text-shadow: none;
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
  background: var(--theme-underline-line);
}

.underline-line:last-child {
  background: linear-gradient(270deg, transparent 0%, var(--theme-title-side-line) 50%, transparent 100%);
}

.underline-dot {
  width: 6px;
  height: 6px;
  background: var(--theme-underline-dot);
  border-radius: 50%;
  box-shadow: 0 0 6px color-mix(in srgb, var(--theme-underline-dot) 60%, transparent 40%);
}

/* 右侧时间盒子 */
.time-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: var(--theme-time-bg);
  border: 1px solid var(--theme-time-border);
  border-radius: 6px;
  color: var(--theme-time-text);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  backdrop-filter: blur(8px);
  transition: all 0.25s ease;
}

.time-box:hover {
  background: var(--theme-nav-hover-bg);
  border-color: var(--theme-nav-hover-border);
  box-shadow: var(--theme-nav-hover-shadow);
}

.time-box svg {
  color: var(--theme-nav-hover-border);
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
