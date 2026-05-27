<script setup>
import { reactive, ref, defineProps, defineExpose } from 'vue'
import { Loader2, Trash2, Search, Square } from 'lucide-vue-next'

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
}

function setPointFromMap(lon, lat, height) {
  // DEM网格查询暂不支持地图点选
}

function requestViewBounds() {
  emit('get-view-bounds')
}

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

  if (demGridForm.minLon === null || demGridForm.maxLon === null ||
      demGridForm.minLat === null || demGridForm.maxLat === null) {
    error.value = '请先获取视图边界或手动输入边界参数'
    return
  }

  const minLon = Number(demGridForm.minLon)
  const maxLon = Number(demGridForm.maxLon)
  const minLat = Number(demGridForm.minLat)
  const maxLat = Number(demGridForm.maxLat)

  if (minLon >= maxLon || minLat >= maxLat) {
    error.value = '边界参数不合法'
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

    let rawGrids = null
    if (data?.data?.grids && data.data.grids.length > 0) {
      rawGrids = data.data.grids
    } else if (data?.data?.cells && data.data.cells.length > 0) {
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
      status: data?.status || 'success',
    }

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
    if (err.message.includes('边界参数不合法')) {
      error.value = '边界参数不合法'
    } else if (err.message.includes('坐标超出')) {
      error.value = '坐标超出合法范围'
    } else {
      error.value = err?.message || '请求失败'
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
  <div class="dem-grid-query">
    <template v-if="functionName === 'DEM网格查询'">
      <!-- 查询区域 -->
      <div class="form-group">
        <div class="group-title">查询边界</div>
        <div class="coord-grid">
          <div class="coord-line">
            <span class="coord-label">西</span>
            <input
              v-model.number="demGridForm.minLon"
              type="number"
              step="0.0001"
              placeholder="经度"
            >
            <span class="coord-label">东</span>
            <input
              v-model.number="demGridForm.maxLon"
              type="number"
              step="0.0001"
              placeholder="经度"
            >
          </div>
          <div class="coord-line">
            <span class="coord-label">南</span>
            <input
              v-model.number="demGridForm.minLat"
              type="number"
              step="0.0001"
              placeholder="纬度"
            >
            <span class="coord-label">北</span>
            <input
              v-model.number="demGridForm.maxLat"
              type="number"
              step="0.0001"
              placeholder="纬度"
            >
          </div>
        </div>
        <button class="btn-view" @click="requestViewBounds" :disabled="loading">
          获取当前视图
        </button>
      </div>

      <!-- 操作按钮 -->
      <div class="btn-row">
        <button class="btn-query" @click="submitDemGridQuery" :disabled="loading">
          <span>{{ loading ? '查询中...' : '查询' }}</span>
        </button>
        <button class="btn-clear" @click="clearGrids" :disabled="!result">
          <span>清除网格</span>
        </button>
      </div>

      <!-- 错误提示 -->
      <div v-if="error" class="error-box">{{ error }}</div>

      <!-- 查询结果 -->
      <div v-if="queryStats" class="result-box">
        <div class="result-row">
          <span class="result-label">网格数量</span>
          <span class="result-num">{{ queryStats.total }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">分页</span>
          <span class="result-num">{{ queryStats.page }}/{{ Math.ceil(queryStats.total / queryStats.pageSize) || 1 }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">状态</span>
          <span class="result-status" :class="queryStats.status">
            {{ queryStats.status === 'success' ? '成功' : queryStats.status }}
          </span>
        </div>
      </div>

      <!-- 无数据 -->
      <div v-if="result?.data && gridsData.length === 0" class="empty-box">
        该区域未查询到网格数据
      </div>
    </template>
  </div>
</template>

<style scoped>
.dem-grid-query {
  padding: 0;
  width: 100%;
  box-sizing: border-box;
  position: relative;
}

/* 表单组 */
.form-group {
  margin-bottom: 12px;
}

.group-title {
  font-size: 15px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 8px;
}

.coord-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.coord-line {
  display: flex;
  align-items: center;
  gap: 4px;
}

.coord-label {
  width: 22px;
  font-size: 14px;
  color: #334155;
  text-align: center;
  flex-shrink: 0;
}

.coord-line input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 14px;
}

.coord-line input::placeholder {
  color: #999;
}

.btn-view {
  width: 100%;
  height: 36px;
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f5f3f0;
  color: #334155;
  font-size: 14px;
  cursor: pointer;
}

.btn-view:hover:not(:disabled) {
  background: #e8e8e8;
}

.btn-view:disabled {
  color: #999;
  cursor: not-allowed;
}

/* 按钮行 */
.btn-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.btn-query {
  flex: 1;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: linear-gradient(135deg, #7db8e0, #5b9fd4);
  border: none;
  color: #fff;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
}

.btn-query:hover:not(:disabled) {
  background: linear-gradient(135deg, #6aa8d4, #4a8fc4);
}

.btn-query:disabled {
  background: #e2e8f0;
  color: #94a3b8;
  cursor: not-allowed;
}

.btn-clear {
  width: 88px;
  white-space: nowrap;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  color: #475569;
  font-size: 15px;
  cursor: pointer;
}

.btn-clear:hover:not(:disabled) {
  background: #e8e8e8;
}

.btn-clear:disabled {
  color: #999;
  cursor: not-allowed;
}

/* 错误提示 */
.error-box {
  padding: 10px 12px;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  background: #fef2f2;
  font-size: 14px;
  color: #dc2626;
  margin-bottom: 10px;
}

/* 结果区 */
.result-box {
  display: flex;
  gap: 8px;
}

.result-row {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid #ddd;
  background: #f9f9f9;
}

.result-label {
  font-size: 13px;
  color: #64748b;
}

.result-num {
  font-size: 18px;
  font-weight: 600;
  color: #334155;
}

.result-status {
  font-size: 15px;
  font-weight: 600;
}

.result-status.success {
  color: #060;
}

.result-status:not(.success) {
  color: #c00;
}

/* 空状态 */
.empty-box {
  padding: 16px;
  text-align: center;
  color: #64748b;
  font-size: 14px;
  border: 1px dashed #d4c9b8;
  border-radius: 8px;
}
</style>
