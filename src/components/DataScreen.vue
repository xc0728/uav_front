<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Layers, MapPin } from 'lucide-vue-next'
import ServicePanel from './data-screen/ServicePanel.vue'
import CesiumMap from './data-screen/CesiumMap.vue'

const now = ref(new Date())
let clockTimer = null

const servicePanelRef = ref(null)
const cesiumMapRef = ref(null)

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
})

onBeforeUnmount(() => {
  if (clockTimer) {
    window.clearInterval(clockTimer)
    clockTimer = null
  }
})
</script>

<template>
  <div class="app-root">
    <CesiumMap ref="cesiumMapRef" @point-selected="handleMapPointSelected" />

    <!-- 顶部导航 -->
    <header class="topbar">
      <div class="topbar-left">
        <div class="logo">
          <div class="logo-icon">
            <Layers :size="20" />
          </div>
          <span class="logo-text">德清低空</span>
          <span class="logo-sub">低空路径规划平台</span>
        </div>
      </div>
      <div class="topbar-right">
        <div class="time-box">
          <MapPin :size="14" />
          <span>{{ timeText }}</span>
        </div>
      </div>
    </header>

    <!-- 主内容区 - 左右布局 -->
    <main class="app-main">
      <!-- 左侧控制面板 -->
      <ServicePanel
        ref="servicePanelRef"
        panel-type="control"
        @show-point="handleShowPoint"
        @show-grid="handleShowGrid"
        @show-line="handleShowLine"
        @show-polygon="handleShowPolygon"
      />
    </main>
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
  padding: 0 24px;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(15, 23, 42, 0.85) 100%);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  z-index: 100;
}

.topbar-left {
  display: flex;
  align-items: center;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #3b82f6 0%, #0ea5e9 100%);
  border-radius: 10px;
  color: #fff;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

.logo-text {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 1px;
}

.logo-sub {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  padding-left: 12px;
  border-left: 1px solid rgba(255, 255, 255, 0.15);
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.time-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.time-box svg {
  color: rgba(255, 255, 255, 0.6);
}

.app-main {
  position: fixed;
  top: 60px;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  pointer-events: none;
  /* 左侧控制面板区域，右侧计算面板由ServicePanel内部管理 */
}
</style>
