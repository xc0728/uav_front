<script setup>
import { reactive, ref } from 'vue'
import { Loader2, Trash2, Search } from 'lucide-vue-next'

const props = defineProps({
  serviceName: {
    type: String,
    default: '倾斜摄影网格化入库服务'
  },
  functionName: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['close', 'showPoint', 'showGrid'])

// ==================== OSGB 网格化 ====================
const osgbForm = reactive({
  osgbFolder: '/app/data/osgbData',
  level: 14,
})
const osgbLoading = ref(false)
const osgbError = ref('')
const osgbResult = ref(null)

// ==================== 倾斜摄影网格查询 ====================
const triangleGridForm = reactive({
  level: 9,
})

const triangleGridLoading = ref(false)
const triangleGridError = ref('')
const triangleGridResult = ref(null)
const queryStats = ref(null)
const gridsData = ref([])

function resetForm() {
  if (props.functionName === 'osgb网格化（同步入库）') {
    osgbError.value = ''
    osgbResult.value = null
  }
  if (props.functionName === '倾斜摄影网格查询') {
    triangleGridError.value = ''
    triangleGridResult.value = null
    queryStats.value = null
    gridsData.value = []
  }
}

function setPointFromMap(lon, lat, height) {
  // 倾斜摄影网格查询暂不支持地图点选
}

defineExpose({ resetForm, setPointFromMap })

// ==================== OSGB 网格化提交 ====================
async function submitOsgbGrid() {
  osgbError.value = ''
  osgbResult.value = null
  osgbLoading.value = true

  try {
    const payload = {
      osgbFolder: String(osgbForm.osgbFolder || '').trim(),
      level: Number(osgbForm.level),
    }
    if (!payload.osgbFolder) throw new Error('请先填写 OSGB 文件目录')
    if (Number.isNaN(payload.level)) throw new Error('请先填写网格层级 level（0-21）')

    const resp = await fetch('/api/multiSource/triangleGrid/osgbToGridJson', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) throw new Error(`请求失败，状态码 ${resp.status}`)

    const data = await resp.json()
    osgbResult.value = data
  } catch (err) {
    osgbError.value = err?.message || '请求失败，请稍后重试'
  } finally {
    osgbLoading.value = false
  }
}

// ==================== 倾斜摄影网格查询提交 ====================
async function submitTriangleGridQuery() {
  triangleGridError.value = ''
  triangleGridResult.value = null
  queryStats.value = null

  if (!triangleGridForm.level || triangleGridForm.level < 0) {
    triangleGridError.value = '请输入有效的层级'
    return
  }

  triangleGridLoading.value = true

  try {
    const payload = {
      level: Number(triangleGridForm.level),
    }

    console.log('[倾斜摄影网格查询] 发送 payload:', payload)

    const resp = await fetch('/api/multiSource/triangleGrid/queryOsgbGrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error('[倾斜摄影网格查询] 错误响应:', errText)
      throw new Error(`请求失败，状态码 ${resp.status}: ${errText}`)
    }

    const data = await resp.json()
    console.log('[倾斜摄影网格查询] 原始返回:', data)
    triangleGridResult.value = data

    // 解析返回数据
    let parsedCount = 0
    if (data?.data) {
      if (Array.isArray(data.data)) {
        console.log('[倾斜摄影网格查询] data.data 是数组，长度:', data.data.length)
        console.log('[倾斜摄影网格查询] 第一个元素:', JSON.stringify(data.data[0]))
        gridsData.value = data.data
        parsedCount = data.data.length
      } else if (typeof data.data === 'object') {
        console.log('[倾斜摄影网格查询] data.data 是对象，keys:', Object.keys(data.data))
        gridsData.value = data.data.grids || data.data.cells || data.data.features || data.data.items || []
        parsedCount = gridsData.value.length
      }
    } else {
      console.log('[倾斜摄影网格查询] data.data 为空或不存在，尝试从其他字段解析')
      // 尝试从整个响应中提取数据
      if (Array.isArray(data.grids)) {
        gridsData.value = data.grids
        parsedCount = gridsData.value.length
      } else if (Array.isArray(data.cells)) {
        gridsData.value = data.cells
        parsedCount = gridsData.value.length
      } else if (Array.isArray(data.features)) {
        gridsData.value = data.features
        parsedCount = gridsData.value.length
      } else if (Array.isArray(data.items)) {
        gridsData.value = data.items
        parsedCount = gridsData.value.length
      }
    }

    console.log('[倾斜摄影网格查询] 最终解析的 gridsData 长度:', parsedCount)

    queryStats.value = {
      total: parsedCount,
      status: data?.status || 'unknown',
    }

    // 如果返回了格网数据，通知地图组件显示
    if (gridsData.value.length > 0) {
      const cells = gridsData.value.map(cell => {
        console.log('[倾斜摄影网格查询] 处理单个 cell:', JSON.stringify(cell).slice(0, 200))
        if (cell.bounds) return cell

        // 后端返回的字段可能是：center, minlat, maxlat, minlon, maxlon, top, bottom
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

      console.log('[倾斜摄影网格查询] 转换后的 cells 前3条:', JSON.stringify(cells.slice(0, 3)))
      emit('showGrid', { cells })
    } else {
      console.log('[倾斜摄影网格查询] gridsData 为空，不发送 showGrid 事件')
    }
  } catch (err) {
    console.error('[倾斜摄影网格查询] 请求错误:', err)
    triangleGridError.value = err?.message || '请求失败，请稍后重试'
  } finally {
    triangleGridLoading.value = false
  }
}

function clearGrids() {
  emit('showGrid', { cells: [] })
  triangleGridResult.value = null
  queryStats.value = null
}
</script>

<template>
  <div class="calc-content">
    <!-- ==================== OSGB 网格化（同步入库） ==================== -->
    <template v-if="functionName === 'osgb网格化（同步入库）'">
      <form class="form" @submit.prevent="submitOsgbGrid">
        <div class="form-row">
          <label class="form-label" for="osgb-folder">OSGB目录</label>
          <input
            id="osgb-folder"
            v-model="osgbForm.osgbFolder"
            type="text"
            class="form-input"
            required
          >
        </div>
        <div class="form-row">
          <label class="form-label" for="osgb-level">层级</label>
          <input
            id="osgb-level"
            v-model.number="osgbForm.level"
            type="number"
            min="0"
            max="21"
            step="1"
            class="form-input"
            required
          >
        </div>
        <div class="form-actions">
          <button
            type="submit"
            class="btn-primary"
            :disabled="osgbLoading"
          >
            <Loader2 v-if="osgbLoading" :size="14" class="spin" />
            {{ osgbLoading ? '网格化中...' : '开始网格化' }}
          </button>
        </div>
      </form>
      <div v-if="osgbError" class="error">{{ osgbError }}</div>
      <div v-if="osgbResult" class="result">
        <div class="result-row">
          <span class="result-k">处理状态</span>
          <span class="result-v">{{ osgbResult.status }}</span>
        </div>
        <div v-if="osgbResult.data?.total_triangles_processed !== undefined" class="result-row">
          <span class="result-k">三角形数</span>
          <span class="result-v">{{ osgbResult.data.total_triangles_processed }}</span>
        </div>
        <div v-if="osgbResult.data?.total_grid_count !== undefined" class="result-row">
          <span class="result-k">网格总数</span>
          <span class="result-v">{{ osgbResult.data.total_grid_count }}</span>
        </div>
      </div>
    </template>

    <!-- ==================== 倾斜摄影网格查询 ==================== -->
    <template v-if="functionName === '倾斜摄影网格查询'">
      <div class="tip">
        根据层级查询倾斜摄影网格信息，返回该层级下的所有格网数据
      </div>

      <form class="form" @submit.prevent="submitTriangleGridQuery">
        <div class="form-row">
          <label class="form-label" for="tgq-level">
            <span class="required">*</span>层级
          </label>
          <input
            id="tgq-level"
            v-model.number="triangleGridForm.level"
            type="number"
            step="1"
            min="0"
            class="form-input"
            placeholder="请输入层级"
            required
          >
        </div>

        <div class="form-actions">
          <button
            type="button"
            class="btn-secondary"
            @click="clearGrids"
            :disabled="!triangleGridResult"
          >
            <Trash2 :size="14" />
            清除显示
          </button>
          <button
            type="submit"
            class="btn-primary"
            :disabled="triangleGridLoading"
          >
            <Loader2 v-if="triangleGridLoading" :size="14" class="spin" />
            <Search v-else :size="14" />
            {{ triangleGridLoading ? '查询中...' : '开始查询' }}
          </button>
        </div>
      </form>

      <div v-if="triangleGridError" class="error">{{ triangleGridError }}</div>

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
      <div v-if="triangleGridResult?.data && gridsData.length === 0" class="no-data">
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

.result {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.result-row {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 10px;
  font-size: 15px;
}

.result-k {
  color: #64748b;
}

.result-v {
  color: #e2e8f0;
  font-variant-numeric: tabular-nums;
  word-break: break-all;
}

.tip {
  padding: 12px 14px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 8px;
  color: #60a5fa;
  font-size: 15px;
  line-height: 1.5;
  margin-bottom: 16px;
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
