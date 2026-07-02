<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Settings, UserRound, X } from 'lucide-vue-next'
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

const currentPage = ref('main') // 'main' | 'info'
const currentTheme = ref('white')
const isThemeDrawerOpen = ref(false)
const showHudStatus = ref(true)

const themeOptions = [
  { value: 'white', label: '天空白' },
  { value: 'techBlue', label: '科技蓝' },
  { value: 'freshGreen', label: '清新绿' },
]

const activeTheme = computed(() => THEME_CONFIG[currentTheme.value] || THEME_CONFIG.white)
function exposedValue(value) {
  if (value && typeof value === 'object' && 'value' in value) return value.value
  return value
}

const layerSwitchState = computed(() => ({
  hud: showHudStatus.value,
  buildings: Boolean(exposedValue(cesiumMapRef.value?.showBuildings)),
  tiles3d: Boolean(exposedValue(cesiumMapRef.value?.show3DTiles)),
}))

// 存储所有已开启监控的航线数据
const monitoredRoutes = ref({})

// 已监控航线ID列表（计算属性）
const monitoredRouteIds = computed(() => Object.keys(monitoredRoutes.value))

// 监控航线数据
const monitoredRoutesData = computed(() => Object.values(monitoredRoutes.value))

const timeText = computed(() => {
  const d = now.value
  const pad = (n) => String(n).padStart(2, '0')
  const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${weekday[d.getDay()]} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())} : ${pad(d.getMinutes())} : ${pad(d.getSeconds())}`
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
})

onBeforeUnmount(() => {
  if (clockTimer) {
    window.clearInterval(clockTimer)
    clockTimer = null
  }
})

function goToGridOperator() {
  currentPage.value = 'main'
}

function goToMonitoring() {
  currentPage.value = 'main'
}

function goToInfoSystem() {
  currentPage.value = 'info'
}

function toggleBackendPage() {
  currentPage.value = currentPage.value === 'info' ? 'main' : 'info'
}

function toggleThemeDrawer() {
  isThemeDrawerOpen.value = !isThemeDrawerOpen.value
}

function closeThemeDrawer() {
  isThemeDrawerOpen.value = false
}

function selectTheme(themeValue) {
  currentTheme.value = themeValue
}

function toggleBuildingLayer() {
  if (cesiumMapRef.value && typeof cesiumMapRef.value.toggleBuildingsOnMap === 'function') {
    cesiumMapRef.value.toggleBuildingsOnMap()
  }
}

function toggle3DTileLayer() {
  if (cesiumMapRef.value && typeof cesiumMapRef.value.toggle3DTiles === 'function') {
    cesiumMapRef.value.toggle3DTiles()
  }
}

function toggleHudStatus() {
  showHudStatus.value = !showHudStatus.value
}

function handleSwitchPage(page) {
  if (page === 'grid') {
    goToGridOperator()
  } else if (page === 'monitoring') {
    goToMonitoring()
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
      goToMonitoring()
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
  } else if (cesiumMapRef.value && typeof cesiumMapRef.value.clearRouteGrid === 'function') {
    cesiumMapRef.value.clearRouteGrid(id)
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
    goToMonitoring()
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
  } else if (cesiumMapRef.value && typeof cesiumMapRef.value.drawPolygon === 'function' && Array.isArray(zone.boundary)) {
    cesiumMapRef.value.drawPolygon({
      type: 'noFlyZone',
      zoneId: zone.zone_id,
      points: zone.boundary.map(coord => ({
        lon: Number(coord[0]),
        lat: Number(coord[1]),
      })),
      bottom: Number(zone.bottom ?? 0),
      top: Number(zone.top ?? 120),
      color: '#ef4444',
    })
  }
}

function handleHideNoFlyZone({ zoneId }) {
  if (!zoneId) return
  const newMap = { ...visibleNoFlyZones.value }
  delete newMap[zoneId]
  visibleNoFlyZones.value = newMap
  if (monitoringScreenRef.value && typeof monitoringScreenRef.value.removeNoFlyZoneVisualization === 'function') {
    monitoringScreenRef.value.removeNoFlyZoneVisualization(zoneId)
  } else if (cesiumMapRef.value && typeof cesiumMapRef.value.removeNoFlyZonePrism === 'function') {
    cesiumMapRef.value.removeNoFlyZonePrism(zoneId)
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
  <div class="app-root" :class="[activeTheme.appClass, { 'info-mode': currentPage === 'info' }]">
    <!-- 顶部导航 - 始终显示 -->
    <header class="topbar">
      <div class="topbar-glow"></div>

      <div class="topbar-left">
        <div class="time-box">
          <span>{{ timeText }}</span>
        </div>
      </div>

      <div v-if="currentPage !== 'info'" class="topbar-center-wrapper">
        <div class="title-frame">
          <h1 class="main-title" data-text="低空路径智绘平台">低空路径智绘平台</h1>
          <img class="title-flash" src="/screen/flash.png" alt="" />
        </div>
      </div>

      <div class="topbar-right">
        <div class="user-info" aria-label="当前用户">
          <UserRound :size="17" :stroke-width="1.8" />
          <span>欢迎您，</span>
          <span>admin</span>
        </div>
        <button class="backend-btn" :class="{ active: currentPage === 'info' }" type="button" @click="toggleBackendPage">
          {{ currentPage === 'info' ? '前台' : '后台' }}
        </button>
        <button class="settings-btn" type="button" aria-label="主题设置" @click="toggleThemeDrawer">
          <Settings :size="20" :stroke-width="1.8" />
        </button>
      </div>
    </header>

    <div v-if="isThemeDrawerOpen" class="theme-drawer-mask" @click.self="closeThemeDrawer">
      <aside class="theme-drawer">
        <div class="theme-drawer-header">
          <div>
            <div class="theme-drawer-kicker">Settings</div>
            <h2>主题颜色</h2>
          </div>
          <button class="drawer-close-btn" type="button" aria-label="关闭主题设置" @click="closeThemeDrawer">
            <X :size="18" :stroke-width="1.8" />
          </button>
        </div>

        <div class="theme-setting-group">
          <div class="theme-setting-title">界面色彩</div>
          <button
            v-for="option in themeOptions"
            :key="option.value"
            class="theme-option"
            :class="[`theme-option-${option.value}`, { active: currentTheme === option.value }]"
            type="button"
            @click="selectTheme(option.value)"
          >
            <span class="theme-swatch"></span>
            <span>{{ option.label }}</span>
          </button>
        </div>

        <div class="theme-setting-group layer-setting-group">
          <div class="theme-setting-title">图层设置</div>
          <button class="drawer-layer-option" type="button" @click="toggleHudStatus">
            <span>HUD坐标</span>
            <span class="drawer-toggle-switch" :class="{ active: layerSwitchState.hud }">
              <span class="drawer-toggle-slider"></span>
            </span>
          </button>
          <button class="drawer-layer-option" type="button" @click="toggleBuildingLayer">
            <span>建筑白膜</span>
            <span class="drawer-toggle-switch" :class="{ active: layerSwitchState.buildings }">
              <span class="drawer-toggle-slider"></span>
            </span>
          </button>
          <button class="drawer-layer-option" type="button" @click="toggle3DTileLayer">
            <span>3D底图</span>
            <span class="drawer-toggle-switch" :class="{ active: layerSwitchState.tiles3d }">
              <span class="drawer-toggle-slider"></span>
            </span>
          </button>
        </div>
      </aside>
    </div>

    <!-- 主地图：网格化管理与实时监控大屏共用 -->
    <template v-if="currentPage !== 'info'">
      <CesiumMap
        ref="cesiumMapRef"
        :show-hud-status="showHudStatus"
        @point-selected="handleMapPointSelected"
        @box-select-start="handleBoxSelectStart"
        @box-select-end="handleBoxSelectEnd"
        @get-view-bounds="handleGetViewBounds"
      />

      <div class="monitoring-layer">
          <MonitoringScreen
            ref="monitoringScreenRef"
            embedded
            :external-cesium-map="cesiumMapRef"
            :route-data="monitoredRoutesData"
            :event-visualization="pendingEventVisualization"
            :visible-no-fly-zones="visibleNoFlyZones"
            :theme="activeTheme.monitoringTheme"
            @switch_page="handleSwitchPage"
            @visualize-event="handleVisualizeEvent"
            @anomaly-triggered="handleAnomalyTriggered"
          />
      </div>

      <ServicePanel
        ref="servicePanelRef"
        display-mode="toolbar"
        panel-type="control"
        :theme="currentTheme"
        @show-point="handleShowPoint"
        @show-grid="handleShowGrid"
        @show-line="handleShowLine"
        @show-polygon="handleShowPolygon"
        @get-view-bounds="handleGetViewBounds"
      />
    </template>

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
@font-face {
  font-family: 'YouSheBiaoTiHei';
  src: url('/fonts/YouSheBiaoTiHei-2.ttf') format('truetype');
  font-display: swap;
}

@font-face {
  font-family: 'MiSans';
  src: url('/fonts/MiSans-Regular.woff') format('woff');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'MiSans';
  src: url('/fonts/MiSans-Semibold.woff') format('woff');
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}

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
}

/* 顶部导航 - 迁移自 ShuntianFE 大屏头部 */
.topbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 76px;
  display: block;
  padding: 0 24px;
  background: linear-gradient(180deg, rgba(4, 18, 42, 0.92) 0%, rgba(5, 23, 54, 0.58) 58%, rgba(5, 23, 54, 0) 100%);
  border-bottom: 0;
  box-shadow: none;
  overflow: visible;
  z-index: 100;
}

.topbar::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(35, 206, 253, 0.65), transparent);
  pointer-events: none;
}

.topbar-glow {
  position: absolute;
  inset: -150px 0 auto;
  height: 220px;
  background-color: rgb(8, 34, 62);
  filter: blur(80px);
  transform: translateY(-70px);
  pointer-events: none;
  z-index: -1;
}

.topbar-left,
.topbar-right {
  position: absolute;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 44px;
  padding-top: 11px;
}

.topbar-left {
  left: clamp(18px, 1.8vw, 34px);
  justify-content: flex-start;
}

.topbar-right {
  right: clamp(18px, 1.8vw, 34px);
  justify-content: flex-end;
  gap: 10px;
  transform: none;
}

.left-nav-buttons {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nav-btn {
  position: relative;
  min-width: 148px;
  height: 38px;
  padding: 0 24px;
  border: 1px solid rgba(35, 206, 253, 0.38);
  border-radius: 2px;
  background:
    linear-gradient(180deg, rgba(5, 34, 74, 0.74), rgba(4, 22, 53, 0.62)),
    linear-gradient(90deg, rgba(35, 206, 253, 0.05), rgba(35, 206, 253, 0.18), rgba(35, 206, 253, 0.05));
  color: rgba(214, 245, 255, 0.88);
  font-family: 'MiSans', 'Microsoft YaHei', 'PingFang SC', sans-serif;
  font-size: 15px;
  font-weight: 600;
  font-style: normal;
  letter-spacing: 0.5px;
  line-height: 36px;
  cursor: pointer;
  transition: color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, opacity 0.2s ease;
  text-align: center;
  text-shadow: 0 0 8px rgba(35, 206, 253, 0.22);
  white-space: nowrap;
  transform-origin: center;
  box-shadow: inset 0 0 16px rgba(35, 206, 253, 0.05);
  overflow: hidden;
}

.nav-btn > span {
  display: inline-block;
  position: relative;
  z-index: 1;
}

.nav-btn-rect {
  transform: none;
}

.nav-btn-rect > span {
  transform: none;
}

.nav-btn-right-edge {
  clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 100%, 0 100%);
  transform: none;
}

.nav-btn-right-edge > span {
  transform: none;
}

.nav-btn-right {
  clip-path: polygon(12px 0, 100% 0, 100% 100%, 0 100%);
  transform: none;
}

.nav-btn-right > span {
  transform: none;
}

.nav-btn:hover {
  border-color: rgba(35, 206, 253, 0.72);
  background:
    linear-gradient(180deg, rgba(7, 48, 96, 0.82), rgba(4, 28, 64, 0.78)),
    linear-gradient(90deg, rgba(35, 206, 253, 0.08), rgba(35, 206, 253, 0.22), rgba(35, 206, 253, 0.08));
  box-shadow: 0 0 12px rgba(35, 206, 253, 0.16), inset 0 0 18px rgba(35, 206, 253, 0.08);
  color: #ffffff;
}

.nav-btn.active {
  border-color: rgba(35, 206, 253, 0.82);
  background:
    linear-gradient(180deg, rgba(8, 58, 112, 0.86), rgba(4, 32, 72, 0.82)),
    linear-gradient(90deg, rgba(35, 206, 253, 0.08), rgba(35, 206, 253, 0.26), rgba(35, 206, 253, 0.08));
  box-shadow: 0 0 14px rgba(35, 206, 253, 0.2), inset 0 0 18px rgba(35, 206, 253, 0.1);
  color: #ffffff;
  font-weight: 600;
}

.topbar-center-wrapper {
  position: absolute;
  left: 50%;
  top: 0;
  z-index: 1;
  display: flex;
  justify-content: center;
  width: min(980px, 58vw);
  padding: 0;
  box-sizing: border-box;
  pointer-events: none;
  transform: translateX(-50%);
}

.title-frame {
  position: relative;
  width: 100%;
  height: clamp(82px, 6.2vw, 112px);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background: url('/screen/top.png') no-repeat center top;
  background-size: 100% 100%;
  overflow: visible;
}

.main-title {
  position: relative;
  z-index: 4;
  display: inline-block;
  margin: 0;
  padding-top: clamp(2px, calc(0.62vw - 3px), 8px);
  font-family: 'YouSheBiaoTiHei', 'Microsoft YaHei', 'PingFang SC', sans-serif;
  font-size: clamp(38px, 2.85vw, 54px);
  font-weight: 400;
  font-style: normal;
  letter-spacing: 5px;
  line-height: 1.25;
  text-align: center;
  color: #f7fbff;
  text-shadow:
    0 1px 1px rgba(1, 21, 38, 0.24),
    0 0 5px rgba(87, 214, 255, 0.18);
  white-space: nowrap;
  filter: none;
}

.main-title::after {
  content: attr(data-text);
  position: absolute;
  inset: 0;
  z-index: 5;
  padding-top: inherit;
  color: transparent;
  background: radial-gradient(
    ellipse 30% 26% at 50% 86%,
    rgba(91, 209, 255, 0.34) 0%,
    rgba(63, 181, 255, 0.2) 34%,
    rgba(63, 181, 255, 0.08) 58%,
    transparent 76%
  );
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: none;
  opacity: 0.58;
  pointer-events: none;
}

.title-flash {
  position: absolute;
  left: 50%;
  bottom: 14px;
  width: min(42%, 420px);
  height: 6px;
  transform: translateX(-50%);
  object-fit: fill;
  opacity: 0.08;
  mix-blend-mode: screen;
  pointer-events: none;
}

.title-nav-btn {
  min-width: 158px;
  margin-left: 8px;
}

.time-box {
  height: 34px;
  width: max-content;
  min-width: 0;
  margin-left: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  border: 0;
  background: transparent;
  color: #23cefd;
  font-size: 15px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  line-height: 34px;
  text-shadow: 0 0 8px rgba(35, 206, 253, 0.35);
  white-space: nowrap;
  transform: none;
}

.user-info {
  height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 4px;
  color: #23cefd;
  font-family: 'MiSans', 'Microsoft YaHei', 'PingFang SC', sans-serif;
  font-size: 14px;
  font-weight: 600;
  text-shadow: 0 0 8px rgba(35, 206, 253, 0.32);
  white-space: nowrap;
}

.backend-btn {
  height: 28px;
  padding: 0 12px;
  border: 1px solid rgba(35, 206, 253, 0.36);
  border-radius: 3px;
  background: rgba(4, 24, 54, 0.48);
  color: #23cefd;
  cursor: pointer;
  font-family: 'MiSans', 'Microsoft YaHei', 'PingFang SC', sans-serif;
  font-size: 13px;
  font-weight: 600;
  line-height: 26px;
  text-shadow: 0 0 8px rgba(35, 206, 253, 0.28);
  transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}

.backend-btn:hover,
.backend-btn.active {
  border-color: rgba(35, 206, 253, 0.72);
  background: rgba(7, 48, 96, 0.72);
  color: #ffffff;
  box-shadow: 0 0 12px rgba(35, 206, 253, 0.16);
}

.settings-btn {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: #23cefd;
  cursor: pointer;
  text-shadow: 0 0 8px rgba(35, 206, 253, 0.35);
  margin-left: 0;
  transform: none;
  transition: color 0.2s ease, transform 0.2s ease, filter 0.2s ease;
}

.settings-btn:hover {
  color: #ffffff;
  filter: drop-shadow(0 0 8px rgba(35, 206, 253, 0.72));
  transform: rotate(18deg);
}

.app-root.info-mode .topbar {
  height: 60px;
  background: transparent;
  box-shadow: none;
}

.app-root.info-mode .topbar-glow {
  display: none;
}

.app-root.info-mode .topbar::after {
  display: none;
}

.app-root.info-mode .topbar-left,
.app-root.info-mode .topbar-right {
  min-height: 42px;
  padding-top: 10px;
}

.theme-drawer-mask {
  position: fixed;
  inset: 0;
  z-index: 140;
  display: flex;
  justify-content: flex-end;
  background: rgba(0, 8, 20, 0.16);
}

.theme-drawer {
  width: 320px;
  height: 100%;
  padding: 24px 22px;
  background:
    linear-gradient(180deg, rgba(5, 31, 72, 0.96), rgba(2, 13, 34, 0.96)),
    radial-gradient(circle at 30% 0%, rgba(35, 206, 253, 0.18), transparent 42%);
  border-left: 1px solid rgba(35, 206, 253, 0.38);
  box-shadow: -18px 0 42px rgba(0, 8, 22, 0.42), inset 1px 0 0 rgba(255, 255, 255, 0.04);
  color: #d6f3ff;
}

.theme-drawer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: 18px;
  border-bottom: 1px solid rgba(35, 206, 253, 0.18);
}

.theme-drawer-kicker {
  margin-bottom: 6px;
  color: rgba(35, 206, 253, 0.72);
  font-size: 11px;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.theme-drawer h2 {
  margin: 0;
  color: #ffffff;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 2px;
  text-shadow: 0 0 14px rgba(35, 206, 253, 0.48);
}

.drawer-close-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(35, 206, 253, 0.22);
  background: rgba(4, 22, 53, 0.55);
  color: #23cefd;
  cursor: pointer;
}

.drawer-close-btn:hover {
  border-color: rgba(35, 206, 253, 0.72);
  color: #ffffff;
}

.theme-setting-group {
  margin-top: 24px;
}

.theme-setting-title {
  margin-bottom: 12px;
  color: rgba(202, 243, 255, 0.72);
  font-size: 13px;
}

.theme-option {
  width: 100%;
  height: 42px;
  margin-bottom: 10px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid rgba(35, 206, 253, 0.18);
  background: rgba(6, 36, 79, 0.5);
  color: rgba(202, 243, 255, 0.9);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.theme-option:hover,
.theme-option.active {
  border-color: rgba(35, 206, 253, 0.76);
  background: rgba(10, 67, 127, 0.78);
  color: #ffffff;
  box-shadow: inset 0 0 18px rgba(35, 206, 253, 0.12);
}

.theme-swatch {
  width: 18px;
  height: 18px;
  border: 1px solid rgba(255, 255, 255, 0.58);
  box-shadow: 0 0 10px rgba(35, 206, 253, 0.24);
}

.theme-option-white .theme-swatch {
  background: linear-gradient(135deg, #edf7ff, #77b8e8);
}

.theme-option-techBlue .theme-swatch {
  background: linear-gradient(135deg, #0a6fc8, #7cecff);
}

.theme-option-freshGreen .theme-swatch {
  background: linear-gradient(135deg, #74bf91, #e8f8ee);
}

.layer-setting-group {
  margin-top: 28px;
}

.drawer-layer-option {
  width: 100%;
  height: 46px;
  margin-bottom: 10px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid rgba(35, 206, 253, 0.18);
  background: rgba(6, 36, 79, 0.5);
  color: rgba(202, 243, 255, 0.94);
  cursor: pointer;
  font-family: 'MiSans', 'Microsoft YaHei', 'PingFang SC', sans-serif;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.drawer-layer-option:hover {
  border-color: rgba(35, 206, 253, 0.62);
  background: rgba(10, 67, 127, 0.72);
  color: #ffffff;
  box-shadow: inset 0 0 18px rgba(35, 206, 253, 0.1);
}

.drawer-toggle-switch {
  position: relative;
  width: 42px;
  height: 24px;
  flex: 0 0 auto;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  background: rgba(101, 116, 139, 0.42);
  transition: background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
}

.drawer-toggle-switch.active {
  border-color: rgba(117, 196, 255, 0.42);
  background: rgba(45, 132, 255, 0.82);
  box-shadow: 0 0 10px rgba(45, 132, 255, 0.24);
}

.drawer-toggle-slider {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: transform 0.25s ease;
}

.drawer-toggle-switch.active .drawer-toggle-slider {
  transform: translateX(18px);
}

@media (max-width: 1420px) {
  .topbar {
    padding: 0 14px;
  }

  .topbar-center-wrapper {
    width: min(900px, 58vw);
  }

  .nav-btn {
    min-width: 124px;
    padding: 0 16px;
    font-size: 14px;
  }

  .time-box {
    min-width: auto;
    font-size: 13px;
  }

  .topbar-right {
    gap: 8px;
    right: 16px;
    transform: none;
  }

  .settings-btn {
    transform: none;
  }

  .settings-btn:hover {
    transform: rotate(18deg);
  }
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

.monitoring-layer {
  position: fixed;
  top: 96px;
  left: 20px;
  right: 20px;
  bottom: 104px;
  z-index: 70;
  pointer-events: none;
}

.monitoring-layer > .app-root {
  width: 100%;
  height: 100%;
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
