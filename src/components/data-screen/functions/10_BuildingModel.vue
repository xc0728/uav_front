<script setup>
import { reactive, ref, onMounted, onUnmounted } from 'vue'
import { Loader2 } from 'lucide-vue-next'

const props = defineProps({
  serviceName: {
    type: String,
    default: '德清建筑白膜可视化服务'
  },
  functionName: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['close'])

const loading = ref(false)
const loaded = ref(false)
const error = ref('')
const summary = ref(null)

const styleConfig = reactive({
  color: '#00ffff',
  opacity: 0.55,
  showLabels: false,
  defaultHeight: 15,
  minHeight: 3,
  maxHeight: 300,
})

function handleBuildingsLoaded(e) {
  loading.value = false
  if (e.detail?.error) {
    error.value = e.detail.error
    loaded.value = false
  } else {
    error.value = ''
    loaded.value = true
    summary.value = e.detail?.summary || null
  }
}

function loadBuildings() {
  if (loaded.value) return
  loading.value = true
  error.value = ''
  window.dispatchEvent(new CustomEvent('cesium-load-buildings'))
}

function toggleBuildings() {
  if (!loaded.value) return
  window.dispatchEvent(new CustomEvent('cesium-toggle-buildings'))
}

function reloadBuildings() {
  if (!loaded.value) return
  loading.value = true
  window.dispatchEvent(new CustomEvent('cesium-reload-buildings', {
    detail: {
      style: {
        color: styleConfig.color,
        opacity: styleConfig.opacity,
        showLabels: styleConfig.showLabels,
        defaultHeight: styleConfig.defaultHeight,
        minHeight: styleConfig.minHeight,
        maxHeight: styleConfig.maxHeight,
      }
    }
  }))
}

function flyToBuildings() {
  if (!loaded.value) return
  window.dispatchEvent(new CustomEvent('cesium-flyto-buildings'))
}

function clearBuildings() {
  if (!loaded.value) return
  window.dispatchEvent(new CustomEvent('cesium-clear-buildings'))
  loaded.value = false
  summary.value = null
}

function exportBuildings() {
  if (!loaded.value) return
  window.dispatchEvent(new CustomEvent('cesium-export-buildings'))
}

function handleReloadDone(e) {
  loading.value = false
  if (!e.detail?.error) {
    loaded.value = true
    summary.value = e.detail?.summary || null
    error.value = ''
  } else {
    error.value = e.detail.error
  }
}

onMounted(() => {
  window.addEventListener('cesium-buildings-loaded', handleBuildingsLoaded)
  window.addEventListener('cesium-buildings-reloaded', handleReloadDone)
})

onUnmounted(() => {
  window.removeEventListener('cesium-buildings-loaded', handleBuildingsLoaded)
  window.removeEventListener('cesium-buildings-reloaded', handleReloadDone)
})
</script>

<template>
  <div class="building-model-panel">
    <div class="panel-title">
      <span>德清建筑白膜</span>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="status-box loading">
      <Loader2 class="spin-icon" size="16" />
      <span>正在加载建筑数据...</span>
    </div>

    <!-- 错误提示 -->
    <div v-else-if="error" class="status-box error">
      <span>{{ error }}</span>
    </div>

    <!-- 加载后摘要 -->
    <div v-else-if="loaded && summary" class="status-box success">
      <span>已加载 {{ summary.totalBuildings }} 个建筑</span>
      <span class="stat-info">
        平均高度 {{ summary.avgHeight?.toFixed(1) }}m |
        范围 {{ summary.minHeight?.toFixed(0) }}~{{ summary.maxHeight?.toFixed(0) }}m
      </span>
    </div>

    <!-- 操作按钮 -->
    <div class="action-section">
      <button
        v-if="!loaded"
        class="action-btn primary"
        @click="loadBuildings"
      >
        加载德清建筑白膜
      </button>

      <template v-else>
        <div class="style-config">
          <div class="config-row">
            <label class="config-label">颜色</label>
            <input type="color" v-model="styleConfig.color" class="color-input" />
          </div>
          <div class="config-row">
            <label class="config-label">透明度</label>
            <input
              type="range"
              v-model.number="styleConfig.opacity"
              min="0.1"
              max="1"
              step="0.05"
              class="range-input"
            />
            <span class="range-value">{{ styleConfig.opacity.toFixed(2) }}</span>
          </div>
          <div class="config-row">
            <label class="config-label">显示标签</label>
            <input type="checkbox" v-model="styleConfig.showLabels" class="checkbox-input" />
          </div>
        </div>

        <div class="btn-group">
          <button class="action-btn" @click="toggleBuildings">显隐切换</button>
          <button class="action-btn" @click="reloadBuildings">应用样式</button>
          <button class="action-btn" @click="flyToBuildings">飞向建筑</button>
        </div>

        <div class="btn-group">
          <button class="action-btn success" @click="exportBuildings">导出 JSON</button>
          <button class="action-btn danger" @click="clearBuildings">清除</button>
        </div>
      </template>
    </div>

    <!-- 提示 -->
    <div class="tip-box">
      <p>从 SHP/DBF 文件加载德清区域建筑白膜数据，生成带高度的建筑物三维模型并叠加到地图上显示。</p>
    </div>
  </div>
</template>

<style scoped>
.building-model-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  overflow-y: auto;
  padding: 12px;
  background: transparent;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
  font-size: 14px;
  font-weight: bold;
  color: #2d3748;
  background: transparent;
}

.status-box {
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-box.loading {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #2563eb;
  align-items: center;
  flex-direction: row;
  gap: 8px;
}

.status-box.error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #dc2626;
}

.status-box.success {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #059669;
}

.stat-info {
  font-size: 11px;
  opacity: 0.8;
}

.action-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.style-config {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: rgba(247, 250, 252, 0.5);
  border: 1px solid rgba(226, 232, 240, 0.4);
  border-radius: 6px;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.config-label {
  font-size: 12px;
  color: #4a5568;
  min-width: 56px;
}

.color-input {
  width: 36px;
  height: 28px;
  border: 1px solid #cbd5e0;
  border-radius: 4px;
  padding: 0;
  cursor: pointer;
}

.range-input {
  flex: 1;
  accent-color: #3182ce;
}

.range-value {
  font-size: 11px;
  color: #718096;
  min-width: 30px;
  text-align: right;
}

.checkbox-input {
  accent-color: #3182ce;
}

.btn-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-btn {
  flex: 1;
  min-width: 80px;
  padding: 8px 12px;
  font-size: 12px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid rgba(203, 213, 224, 0.6);
  background: rgba(255, 255, 255, 0.5);
  color: #2d3748;
  transition: background 0.2s;
}

.action-btn:hover {
  background: rgba(226, 232, 240, 0.6);
}

.action-btn.primary {
  background: #3182ce;
  border-color: #2b6cb0;
  color: #fff;
}

.action-btn.primary:hover {
  background: #2b6cb0;
}

.action-btn.success {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.4);
  color: #059669;
}

.action-btn.success:hover {
  background: rgba(16, 185, 129, 0.25);
}

.action-btn.danger {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
  color: #dc2626;
}

.action-btn.danger:hover {
  background: rgba(239, 68, 68, 0.2);
}

.tip-box {
  padding: 8px 10px;
  background: rgba(237, 242, 247, 0.5);
  border: 1px solid rgba(203, 213, 224, 0.3);
  border-radius: 6px;
}

.tip-box p {
  font-size: 11px;
  color: #718096;
  margin: 0;
  line-height: 1.5;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
