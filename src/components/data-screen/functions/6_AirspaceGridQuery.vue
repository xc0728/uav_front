<script setup>
import { reactive, ref } from 'vue'
import { Loader2, Trash2, Search } from 'lucide-vue-next'

const props = defineProps({
  serviceName: {
    type: String,
    default: '空域网格化入库/查询服务'
  },
  functionName: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['close', 'showPoint', 'showGrid'])

const airspaceGridForm = reactive({
  level: 7,
  airspaceId: 'airspace_osgb',
})

const airspaceGridLoading = ref(false)
const airspaceGridError = ref('')
const airspaceGridResult = ref(null)
const queryStats = ref(null)
const gridsData = ref([])
let totalCount = 0

function resetForm() {
  airspaceGridError.value = ''
  airspaceGridResult.value = null
  queryStats.value = null
  gridsData.value = []
}

function setPointFromMap(lon, lat, height) {
  // 空域网格查询暂不支持地图点选
}

defineExpose({ resetForm, setPointFromMap })

async function submitAirspaceGridQuery() {
  airspaceGridError.value = ''
  airspaceGridResult.value = null
  queryStats.value = null

  if (!airspaceGridForm.level || airspaceGridForm.level < 0) {
    airspaceGridError.value = '请输入有效的层级'
    return
  }

  airspaceGridLoading.value = true

  try {
    const payload = {
      level: Number(airspaceGridForm.level),
    }

    if (airspaceGridForm.airspaceId && airspaceGridForm.airspaceId.trim()) {
      payload.airspaceId = airspaceGridForm.airspaceId.trim()
    }

    console.log('[空域网格查询] 发送 payload:', payload)

    const resp = await fetch('/api/multiSource/airSpace/queryAirspaceGrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error('[空域网格查询] 错误响应:', errText)
      throw new Error(`请求失败，状态码 ${resp.status}: ${errText}`)
    }

    const data = await resp.json()
    console.log('[空域网格查询] 原始返回:', data)
    console.log('[空域网格查询] data.data 类型:', typeof data.data, Array.isArray(data.data))
    if (data?.data) {
      if (Array.isArray(data.data)) {
        console.log('[空域网格查询] data.data 是数组，长度:', data.data.length)
        console.log('[空域网格查询] 第一个元素:', JSON.stringify(data.data[0]))
        gridsData.value = data.data
        totalCount = gridsData.value.length
      } else if (typeof data.data === 'object') {
        console.log('[空域网格查询] data.data 是对象，keys:', Object.keys(data.data))
        console.log('[空域网格查询] data.data 第一个子元素:', JSON.stringify(Object.values(data.data)[0]))
        gridsData.value = data.data.grids || data.data.cells || data.data.features || data.data.items || []
        totalCount = gridsData.value.length
      }
    } else {
      console.log('[空域网格查询] data.data 为空或不存在')
    }

    queryStats.value = {
      total: totalCount,
      status: data?.status || 'unknown',
    }

    // 如果返回了格网数据，通知地图组件显示
    if (gridsData.value.length > 0) {
      // 转换数据格式以匹配 CesiumMap 期望的格式
      // CesiumMap 期望: { cells: [{ bounds: { north, south, east, west, top, bottom } }, ...] }
      const cells = gridsData.value.map(cell => {
        // 如果已经是正确格式（bounds），直接返回
        if (cell.bounds) return cell

        // 后端返回的字段：center, minlat, maxlat, minlon, maxlon, top, bottom
        // 需要转换为 bounds 格式：north, south, east, west, top, bottom
        return {
          bounds: {
            north: cell.maxlat,
            south: cell.minlat,
            east: cell.maxlon,
            west: cell.minlon,
            top: cell.top !== undefined ? cell.top : (cell.center ? cell.center[2] : 0),
            bottom: cell.bottom !== undefined ? cell.bottom : 0,
          }
        }
      })

      console.log('[空域网格查询] 转换后的 cells 前3条:', JSON.stringify(cells.slice(0, 3)))
      emit('showGrid', { cells })
    }
  } catch (err) {
    console.error('[空域网格查询] 请求错误:', err)
    airspaceGridError.value = err?.message || '请求失败，请稍后重试'
  } finally {
    airspaceGridLoading.value = false
  }
}

function clearGrids() {
  emit('showGrid', { cells: [] })
  airspaceGridResult.value = null
  queryStats.value = null
}
</script>

<template>
  <div class="calc-content">
    <template v-if="functionName === '空域网格查询'">
      <div class="tip">
        根据层级查询空域网格信息，返回该层级下的所有格网数据
      </div>

      <form class="form" @submit.prevent="submitAirspaceGridQuery">
        <div class="form-row">
          <label class="form-label" for="agq-level">
            <span class="required">*</span>层级
          </label>
          <input
            id="agq-level"
            v-model.number="airspaceGridForm.level"
            type="number"
            step="1"
            min="0"
            class="form-input"
            placeholder="请输入层级"
            required
          >
        </div>

        <div class="form-row">
          <label class="form-label" for="agq-airspaceId">空域ID</label>
          <input
            id="agq-airspaceId"
            v-model="airspaceGridForm.airspaceId"
            type="text"
            class="form-input"
            placeholder="选填，用于筛选特定空域"
          >
        </div>

        <div class="form-actions">
          <button
            type="button"
            class="btn-secondary"
            @click="clearGrids"
            :disabled="!airspaceGridResult"
          >
            <Trash2 :size="14" />
            清除显示
          </button>
          <button
            type="submit"
            class="btn-primary"
            :disabled="airspaceGridLoading"
          >
            <Loader2 v-if="airspaceGridLoading" :size="14" class="spin" />
            <Search v-else :size="14" />
            {{ airspaceGridLoading ? '查询中...' : '开始查询' }}
          </button>
        </div>
      </form>

      <div v-if="airspaceGridError" class="error">{{ airspaceGridError }}</div>

      <!-- 查询结果统计 -->
      <div v-if="queryStats" class="result-stats">
        <div class="stat-card">
          <div class="stat-value">{{ queryStats.total }}</div>
          <div class="stat-label">网格数量</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" :class="{ 'success': queryStats.status === 'success', 'error': queryStats.status !== 'success' }">
            {{ queryStats.status }}
          </div>
          <div class="stat-label">查询状态</div>
        </div>
      </div>

      <!-- 无数据提示 -->
      <div v-if="airspaceGridResult?.data && gridsData.length === 0" class="no-data">
        <span>未查询到网格数据</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.form-label {
  width: 80px;
  font-size: 13px;
  color: #94a3b8;
  flex-shrink: 0;
}

.required {
  color: #ef4444;
  margin-right: 2px;
}

.form-input {
  flex: 1;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
  color: #f1f5f9;
  font-size: 14px;
  outline: none;
  transition: all 0.15s ease;
}

.form-input:focus {
  border-color: #3b82f6;
  background: rgba(99, 102, 241, 0.1);
}

.form-input::placeholder {
  color: #475569;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 6px;
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

.btn-secondary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: #94a3b8;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
  color: #f1f5f9;
}

.btn-secondary:disabled {
  opacity: 0.5;
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
  gap: 12px;
  margin-top: 16px;
}

.stat-card {
  flex: 1;
  padding: 14px 16px;
  border-radius: 10px;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.06);
  text-align: center;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #60a5fa;
  font-variant-numeric: tabular-nums;
}

.stat-value.success {
  color: #34d399;
  font-size: 14px;
  text-transform: uppercase;
}

.stat-value.error {
  color: #f87171;
  font-size: 14px;
  text-transform: uppercase;
}

.stat-label {
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
}

.result-section {
  margin-top: 20px;
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
