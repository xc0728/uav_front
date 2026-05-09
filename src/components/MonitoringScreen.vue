<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { MapPin } from 'lucide-vue-next'
import CesiumMap from './data-screen/CesiumMap.vue'
import ElectronicFence from './data-screen/functions/8_ElectronicFence.vue'

const now = ref(new Date())
let clockTimer = null

const isOnline = ref(navigator.onLine)
const cesiumMapRef = ref(null)
const fencePanelRef = ref(null)

// 接收外部传入的航线数据
const props = defineProps({
  routeData: {
    type: Array,
    default: () => []
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
})

onBeforeUnmount(() => {
  if (clockTimer) {
    window.clearInterval(clockTimer)
    clockTimer = null
  }
  window.removeEventListener('online', handleOnline)
  window.removeEventListener('offline', handleOffline)
})

// 监听地图就绪后绘制航线
watch(() => cesiumMapRef.value?.isMapReady, (ready) => {
  if (ready) {
    console.log('[MonitoringScreen] CesiumMap 就绪')
    drawAllRoutes()
  }
})

// 监听航线数据变化
watch(() => props.routeData, () => {
  drawAllRoutes()
}, { deep: true })

// 绘制所有航线
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

// 清除指定航线
function clearRouteGrid(routeId) {
  if (cesiumMapRef.value && typeof cesiumMapRef.value.clearRouteGrid === 'function') {
    cesiumMapRef.value.clearRouteGrid(routeId)
  }
}

// 监控航线统计数据
const routeStats = computed(() => {
  const routes = props.routeData || []
  return {
    total: routes.length,
    totalGrids: routes.reduce((sum, r) => sum + (r.path?.length || 0), 0)
  }
})

// 电子围栏事件处理
function handleDrawSphereFence(params) {
  if (cesiumMapRef.value && typeof cesiumMapRef.value.startDrawSphereFence === 'function') {
    cesiumMapRef.value.startDrawSphereFence(params, () => {
      // 绘制开始时不做处理，等待点击"完成绘制"
    })
  }
}

function handleDrawLineFence(params) {
  if (cesiumMapRef.value && typeof cesiumMapRef.value.startDrawLineFence === 'function') {
    cesiumMapRef.value.startDrawLineFence(params, () => {
      // 绘制开始时不做处理
    })
  }
}

function handleCompleteSphereFence(fenceData) {
  if (cesiumMapRef.value && typeof cesiumMapRef.value.completeSphereFence === 'function') {
    cesiumMapRef.value.completeSphereFence(fenceData, (data) => {
      // 将围栏添加到面板列表
      fencePanelRef.value?.confirmFenceDraw(data)
    })
  }
}

function handleCompleteLineFence(fenceData) {
  if (cesiumMapRef.value && typeof cesiumMapRef.value.completeLineFence === 'function') {
    cesiumMapRef.value.completeLineFence(fenceData, (data) => {
      // 将围栏添加到面板列表
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

// 电子围栏统计数据
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
    <CesiumMap ref="cesiumMapRef" />

    <!-- 顶部导航 -->
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
        <div class="nav-btn" @click="$emit('switch_page', 'grid')">网格化算子</div>
        <div class="nav-btn active">实时监控大屏</div>
        <div class="nav-btn" @click="$emit('switch_page', 'info')">信息管理系统</div>
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
            <div class="stat-item total">
              <div class="stat-value">{{ fenceStats.total }}</div>
              <div class="stat-label">已存储</div>
            </div>
            <div class="stat-item applied">
              <div class="stat-value">{{ fenceStats.applied }}</div>
              <div class="stat-label">已应用</div>
            </div>
            <div class="stat-item unapplied">
              <div class="stat-value">{{ fenceStats.unapplied }}</div>
              <div class="stat-label">未应用</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧监控航线面板 -->
      <div class="control-panel-route">
        <!-- 航线列表区域（2/3） -->
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

        <!-- 航线统计区域（1/3） -->
        <div class="route-stats-section">
          <div class="stats-title">航线统计</div>
          <div class="stats-grid">
            <div class="stat-item total">
              <div class="stat-value">{{ routeStats.total }}</div>
              <div class="stat-label">监控航线</div>
            </div>
            <div class="stat-item applied">
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

/* 顶部导航 - 左侧系统状态 */
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

/* 角框装饰 */
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

/* 导航按钮 */
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

.main-title {
  font-size: 20px;
  font-weight: 600;
  color: #fff;
  letter-spacing: 4px;
  text-shadow: 0 0 20px rgba(59, 130, 246, 0.5);
  margin: 0;
  white-space: nowrap;
}

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

/* 右侧时间 */
.topbar-side {
  width: 160px;
  display: flex;
  align-items: center;
}

.topbar-side.right {
  position: absolute;
  right: 0;
  justify-content: flex-end;
  gap: 10px;
}

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

/* 监控内容区域 */
.monitoring-content {
  position: fixed;
  top: 60px;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  pointer-events: none;
  display: flex;
}

.monitoring-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.3);
  font-size: 24px;
}

/* 电子围栏控制面板 */
.control-panel-fence {
  width: 380px;
  height: 100%;
  background: transparent;
  pointer-events: auto;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 电子围栏面板（占2/3高度） - 从左往右透明度递增 */
.fence-panel-wrapper {
  height: 66.67%;
  overflow: hidden;
  position: relative;
}

.fence-panel-wrapper::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    to right,
    rgba(15, 23, 42, 0.85) 0%,
    rgba(15, 23, 42, 0.75) 30%,
    rgba(15, 23, 42, 0.55) 60%,
    rgba(15, 23, 42, 0.35) 85%,
    rgba(15, 23, 42, 0.15) 100%
  );
  pointer-events: none;
  z-index: 0;
}

.fence-panel-wrapper > * {
  position: relative;
  z-index: 1;
}

/* 电子围栏统计信息面板 - 从左往右透明度递增 */
.fence-stats {
  height: 33.33%;
  min-height: 120px;
  position: relative;
  border-top: 1px solid rgba(59, 130, 246, 0.2);
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
}

.fence-stats::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    to right,
    rgba(15, 23, 42, 0.9) 0%,
    rgba(15, 23, 42, 0.8) 30%,
    rgba(15, 23, 42, 0.6) 60%,
    rgba(15, 23, 42, 0.4) 85%,
    rgba(15, 23, 42, 0.2) 100%
  );
  pointer-events: none;
  z-index: 0;
}

.fence-stats > * {
  position: relative;
  z-index: 1;
}

.stats-title {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(59, 130, 246, 0.15);
}

.stats-grid {
  display: flex;
  flex: 1;
  gap: 8px;
  align-items: stretch;
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(30, 41, 59, 0.6);
  border-radius: 8px;
  padding: 8px 4px;
  border: 1px solid rgba(59, 130, 246, 0.15);
  transition: all 0.3s ease;
}

.stat-item:hover {
  background: rgba(30, 41, 59, 0.8);
  border-color: rgba(59, 130, 246, 0.3);
  transform: translateY(-2px);
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  font-family: 'SF Mono', 'Monaco', monospace;
  line-height: 1.2;
}

.stat-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 4px;
}

.stat-item.total .stat-value {
  color: #3b82f6;
}

.stat-item.applied .stat-value {
  color: #10b981;
}

.stat-item.unapplied .stat-value {
  color: #f59e0b;
}

/* 右侧监控航线面板 - 与左侧电子围栏面板对称 */
.control-panel-route {
  position: absolute;
  right: 0;
  top: 0;
  width: 380px;
  height: 100%;
  background: transparent;
  pointer-events: auto;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 航线列表区域（2/3） - 从右往左透明度递增 */
.route-list-section {
  height: 66.67%;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}

.route-list-section::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    to left,
    rgba(15, 23, 42, 0.85) 0%,
    rgba(15, 23, 42, 0.75) 30%,
    rgba(15, 23, 42, 0.55) 60%,
    rgba(15, 23, 42, 0.35) 85%,
    rgba(15, 23, 42, 0.15) 100%
  );
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
  padding: 16px 16px 12px;
  border-bottom: 1px solid rgba(59, 130, 246, 0.15);
}

.panel-title {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.85);
  font-weight: 500;
}

.panel-count {
  font-size: 18px;
  font-weight: 700;
  color: #10b981;
  font-family: 'SF Mono', 'Monaco', monospace;
}

.route-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}

.route-list::-webkit-scrollbar {
  width: 4px;
}

.route-list::-webkit-scrollbar-track {
  background: rgba(59, 130, 246, 0.05);
}

.route-list::-webkit-scrollbar-thumb {
  background: rgba(59, 130, 246, 0.2);
  border-radius: 2px;
}

.empty-list {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
}

.route-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  margin-bottom: 6px;
  background: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(59, 130, 246, 0.15);
  border-radius: 8px;
  transition: all 0.3s ease;
}

.route-item:hover {
  background: rgba(30, 41, 59, 0.75);
  border-color: rgba(59, 130, 246, 0.3);
}

.route-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.route-name {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
  font-weight: 500;
}

.route-id {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.route-grids {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.grid-count {
  font-size: 18px;
  font-weight: 700;
  color: #10b981;
  font-family: 'SF Mono', 'Monaco', monospace;
}

.grid-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
}

/* 航线统计区域（1/3） - 从右往左透明度递增 */
.route-stats-section {
  height: 33.33%;
  min-height: 120px;
  position: relative;
  border-top: 1px solid rgba(59, 130, 246, 0.2);
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
}

.route-stats-section::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    to left,
    rgba(15, 23, 42, 0.9) 0%,
    rgba(15, 23, 42, 0.8) 30%,
    rgba(15, 23, 42, 0.6) 60%,
    rgba(15, 23, 42, 0.4) 85%,
    rgba(15, 23, 42, 0.2) 100%
  );
  pointer-events: none;
  z-index: 0;
}

.route-stats-section > * {
  position: relative;
  z-index: 1;
}

.route-stats-section .stats-title {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(59, 130, 246, 0.15);
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
  background: rgba(30, 41, 59, 0.6);
  border-radius: 8px;
  padding: 10px 8px;
  border: 1px solid rgba(59, 130, 246, 0.15);
}

.route-stats-section .stat-value {
  font-size: 22px;
  font-weight: 700;
  color: #10b981;
  font-family: 'SF Mono', 'Monaco', monospace;
}

.route-stats-section .stat-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 4px;
}
</style>
