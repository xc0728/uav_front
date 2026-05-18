<script setup>
import { reactive, ref, defineProps, defineExpose } from 'vue'
import { Loader2, Trash2, Search, MapPin, Square, MousePointer2 } from 'lucide-vue-next'

const props = defineProps({
  serviceName: {
    type: String,
    default: 'DEM网格查询服务'
  },
  functionName: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['close', 'showPoint', 'showGrid', 'get-view-bounds'])

const demGridForm = reactive({
  minLon: null,
  maxLon: null,
  minLat: null,
  maxLat: null,
})

const loading = ref(false)
const error = ref('')
const result = ref(null)
const queryStats = ref(null)
const gridsData = ref([])
let totalCount = 0

function resetForm() {
  loading.value = false
  error.value = ''
  result.value = null
  queryStats.value = null
  gridsData.value = []
  isSelectingArea.value = false
}

function setPointFromMap(lon, lat, height) {
  // DEM网格查询暂不支持地图点选
}

// 获取视图边界
function requestViewBounds() {
  emit('get-view-bounds')
}

// 设置视图边界
function setViewBounds(bounds) {
  demGridForm.minLon = Number(bounds.west.toFixed(4))
  demGridForm.maxLon = Number(bounds.east.toFixed(4))
  demGridForm.minLat = Number(bounds.south.toFixed(4))
  demGridForm.maxLat = Number(bounds.north.toFixed(4))
}

defineExpose({ setViewBounds })

async function submitDemGridQuery() {
  error.value = ''
  result.value = null
  queryStats.value = null

  // 如果没有传入边界参数，提示用户
  if (demGridForm.minLon === null || demGridForm.maxLon === null ||
      demGridForm.minLat === null || demGridForm.maxLat === null) {
    error.value = '请先在地图上框选查询区域，或手动输入边界参数'
    return
  }

  const minLon = Number(demGridForm.minLon)
  const maxLon = Number(demGridForm.maxLon)
  const minLat = Number(demGridForm.minLat)
  const maxLat = Number(demGridForm.maxLat)

  if (minLon >= maxLon || minLat >= maxLat) {
    error.value = '边界参数不合法：minLon < maxLon, minLat < maxLat'
    return
  }

  loading.value = true

  try {
    const payload = {
      minLon: minLon,
      maxLon: maxLon,
      minLat: minLat,
      maxLat: maxLat,
    }

    console.log('[DEM网格查询] 发送 payload:', payload)

    const resp = await fetch('/api/multiSource/queryDemGridByBounds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error('[DEM网格查询] 错误响应:', errText)
      throw new Error(`请求失败，状态码 ${resp.status}: ${errText}`)
    }

    const data = await resp.json()
    result.value = data
    console.log('[DEM网格查询] 原始返回:', data)

    // 新格式：data.grids
    let rawGrids = null
    if (data?.data?.grids && data.data.grids.length > 0) {
      rawGrids = data.data.grids
    } else if (data?.data?.cells && data.data.cells.length > 0) {
      // 兼容旧格式：data.cells
      rawGrids = data.data.cells
    }

    if (!rawGrids || rawGrids.length === 0) {
      error.value = '未查询到DEM网格数据'
      loading.value = false
      return
    }

    gridsData.value = rawGrids
    totalCount = rawGrids.length

    queryStats.value = {
      total: data?.data?.pagination?.total || totalCount,
      page: data?.data?.pagination?.page || 1,
      pageSize: data?.data?.pagination?.pageSize || 100,
      status: data?.status || 'unknown',
    }

    // 如果返回了格网数据，通知地图组件显示
    if (gridsData.value.length > 0) {
      const cells = gridsData.value.map(cell => {
        return {
          bounds: {
            north: cell.maxlat,
            south: cell.minlat,
            east: cell.maxlon,
            west: cell.minlon,
            top: cell.top !== undefined ? cell.top : (cell.center ? cell.center[2] : 0),
            bottom: cell.bottom !== undefined ? cell.bottom : 0,
          },
          code: String(cell.code),
          center: cell.center,
        }
      })

      console.log('[DEM网格查询] 转换后的 cells 前3条:', JSON.stringify(cells.slice(0, 3)))
      emit('showGrid', { cells })
    }
  } catch (err) {
    // 处理错误响应
    if (err.message.includes('边界参数不合法')) {
      error.value = '边界参数不合法：minLon < maxLon, minLat < maxLat'
    } else if (err.message.includes('坐标超出')) {
      error.value = '坐标超出合法范围'
    } else {
      error.value = err?.message || '请求失败，请稍后重试'
    }
    console.error('[DEM网格查询] 请求错误:', err)
  } finally {
    loading.value = false
  }
}

function clearGrids() {
  emit('showGrid', { cells: [] })
  result.value = null
  queryStats.value = null
  gridsData.value = []
}
</script>

<template>
  <div class="calc-content">
    <template v-if="functionName === 'DEM网格查询'">
      <div class="tip">
        根据区域边界查询DEM网格数据，返回网格的高程范围信息。支持通过地图框选或手动输入边界参数进行查询。
      </div>

      <form class="form" @submit.prevent="submitDemGridQuery">
        <div class="bounds-section">
          <div class="bounds-title">
            <MapPin :size="14" />
            查询边界参数
          </div>
          <div class="bounds-grid">
            <div class="bounds-row">
              <div class="form-row">
                <label class="form-label" for="dem-minlon">最小经度</label>
                <input
                  id="dem-minlon"
                  v-model.number="demGridForm.minLon"
                  type="number"
                  step="0.0001"
                  class="form-input"
                  placeholder="西边界"
                >
              </div>
              <div class="form-row">
                <label class="form-label" for="dem-maxlon">最大经度</label>
                <input
                  id="dem-maxlon"
                  v-model.number="demGridForm.maxLon"
                  type="number"
                  step="0.0001"
                  class="form-input"
                  placeholder="东边界"
                >
              </div>
            </div>
            <div class="bounds-row">
              <div class="form-row">
                <label class="form-label" for="dem-minlat">最小纬度</label>
                <input
                  id="dem-minlat"
                  v-model.number="demGridForm.minLat"
                  type="number"
                  step="0.0001"
                  class="form-input"
                  placeholder="南边界"
                >
              </div>
              <div class="form-row">
                <label class="form-label" for="dem-maxlat">最大纬度</label>
                <input
                  id="dem-maxlat"
                  v-model.number="demGridForm.maxLat"
                  type="number"
                  step="0.0001"
                  class="form-input"
                  placeholder="北边界"
                >
              </div>
            </div>
          </div>
        </div>

        <div class="form-actions-stack">
          <div class="form-actions form-actions-primary">
            <button
              type="submit"
              class="btn-primary btn-primary-block"
              :disabled="loading"
            >
              <Loader2 v-if="loading" :size="14" class="spin" />
              <Search v-else :size="14" />
              {{ loading ? '查询中...' : '开始查询' }}
            </button>
          </div>
          <div class="form-actions form-actions-selection">
            <button
              type="button"
              class="btn-box-select"
              @click="requestViewBounds"
              :disabled="loading"
            >
              <Square :size="14" />
              获取视图边界
            </button>
          </div>
          <div class="form-actions form-actions-clear-grid">
            <button
              type="button"
              class="btn-clear-generated-grid"
              @click="clearGrids"
              :disabled="!result"
            >
              <Trash2 :size="14" />
              清除已生成网格
            </button>
          </div>
        </div>
      </form>

      <div v-if="error" class="error">{{ error }}</div>

      <!-- 查询结果统计 -->
      <div v-if="queryStats" class="result-stats">
        <div class="stat-card">
          <div class="stat-value">{{ queryStats.total }}</div>
          <div class="stat-label">网格数量</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ queryStats.page }}/{{ Math.ceil(queryStats.total / queryStats.pageSize) || 1 }}</div>
          <div class="stat-label">当前页/总页数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" :class="{ 'success': queryStats.status === 'success', 'error': queryStats.status !== 'success' }">
            {{ queryStats.status }}
          </div>
          <div class="stat-label">查询状态</div>
        </div>
      </div>

      <!-- 无数据提示 -->
      <div v-if="result?.data && gridsData.length === 0" class="no-data">
        <span>未查询到网格数据</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.tip {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 16px;
  padding: 10px 12px;
  background: rgba(59, 130, 246, 0.08);
  border-radius: 8px;
  border: 1px solid rgba(59, 130, 246, 0.18);
  line-height: 1.5;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.bounds-section {
  padding: 14px;
  background: rgba(30, 41, 59, 0.5);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.bounds-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #60a5fa;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(96, 165, 250, 0.2);
}

.bounds-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bounds-row {
  display: flex;
  gap: 10px;
}

.bounds-row .form-row {
  flex: 1;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-label {
  width: 70px;
  font-size: 12px;
  color: #94a3b8;
  flex-shrink: 0;
}

.form-input {
  width: 100%;
  min-width: 0;
  flex: 1;
  height: 36px;
  line-height: 1.2;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
  color: #f1f5f9;
  font-size: 13px;
  outline: none;
  transition: all 0.15s ease;
  box-sizing: border-box;
}

.form-input:focus {
  border-color: #3b82f6;
  background: rgba(99, 102, 241, 0.1);
}

.form-input::placeholder {
  color: #475569;
}

.form-actions-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 6px;
}

.form-actions {
  display: flex;
  gap: 10px;
}

.form-actions-primary {
  width: 100%;
}

.form-actions-primary .btn-primary-block {
  width: 100%;
  justify-content: center;
  padding: 10px 20px;
  border-radius: 8px;
}

.form-actions-selection {
  width: 100%;
  justify-content: center;
}

.form-actions-selection .btn-box-select {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid rgba(59, 130, 246, 0.4);
  background: rgba(59, 130, 246, 0.1);
  color: #93c5fd;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.form-actions-selection .btn-box-select:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.2);
  border-color: #3b82f6;
}

.form-actions-selection .btn-box-select.active {
  background: rgba(59, 130, 246, 0.3);
  border-color: #60a5fa;
  color: #fff;
  animation: pulse-border 1.5s ease-in-out infinite;
}

.form-actions-selection .btn-box-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@keyframes pulse-border {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0);
  }
}

.form-actions-clear-grid {
  width: 100%;
  justify-content: flex-end;
}

.btn-clear-generated-grid {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: auto;
  max-width: 100%;
  box-sizing: border-box;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid rgba(248, 113, 113, 0.65);
  background: rgba(127, 29, 29, 0.35);
  color: #fecaca;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  white-space: nowrap;
}

.btn-clear-generated-grid :deep(svg) {
  flex-shrink: 0;
}

.btn-clear-generated-grid:hover:not(:disabled) {
  background: rgba(153, 27, 27, 0.45);
  border-color: #f87171;
  color: #fff;
}

.btn-clear-generated-grid:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 22px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, #3b82f6, #0ea5e9);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
}

.btn-primary:disabled {
  opacity: 0.7;
  cursor: default;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.error {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.1);
  font-size: 13px;
  color: #fca5a5;
}

.result-stats {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.stat-card {
  flex: 1;
  padding: 12px 10px;
  border-radius: 10px;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.06);
  text-align: center;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #60a5fa;
  font-variant-numeric: tabular-nums;
}

.stat-value.success {
  color: #34d399;
  font-size: 12px;
  text-transform: uppercase;
}

.stat-value.error {
  color: #f87171;
  font-size: 12px;
  text-transform: uppercase;
}

.stat-label {
  font-size: 11px;
  color: #64748b;
  margin-top: 4px;
}

.no-data {
  margin-top: 20px;
  padding: 30px;
  text-align: center;
  color: #64748b;
  background: rgba(30, 41, 59, 0.5);
  border-radius: 10px;
  border: 1px dashed rgba(255, 255, 255, 0.1);
}
</style>
