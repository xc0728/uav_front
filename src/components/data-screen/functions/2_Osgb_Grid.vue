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

// ==================== OSGB 网格化聚合入库 ====================
const aggregationForm = reactive({
  osgbFolder: '/app/data/osgbData',
  level: 9,
  minLevel: 0,
})
const aggregationLoading = ref(false)
const aggregationError = ref('')
const aggregationResult = ref(null)

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
  if (props.functionName === 'osgb网格化聚合入库') {
    aggregationError.value = ''
    aggregationResult.value = null
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

// ==================== OSGB 网格化聚合入库提交 ====================
async function submitAggregation() {
  aggregationError.value = ''
  aggregationResult.value = null
  aggregationLoading.value = true

  try {
    if (!aggregationForm.osgbFolder || !aggregationForm.osgbFolder.trim()) {
      throw new Error('请先填写 OSGB 文件目录')
    }
    if (!aggregationForm.level || aggregationForm.level < 0) {
      throw new Error('请输入有效的网格层级')
    }

    const payload = {
      osgbFolder: String(aggregationForm.osgbFolder || '').trim(),
      level: Number(aggregationForm.level),
      minLevel: Number(aggregationForm.minLevel) || 0,
    }

    console.log('[osgb网格化聚合入库] 发送 payload:', payload)

    const resp = await fetch('/api/multiSource/triangleGrid/osgbToGridAggregation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error('[osgb网格化聚合入库] 错误响应:', errText)
      throw new Error(`请求失败，状态码 ${resp.status}: ${errText}`)
    }

    const data = await resp.json()
    console.log('[osgb网格化聚合入库] 原始返回:', data)
    aggregationResult.value = data
  } catch (err) {
    console.error('[osgb网格化聚合入库] 请求错误:', err)
    aggregationError.value = err?.message || '请求失败，请稍后重试'
  } finally {
    aggregationLoading.value = false
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

    <!-- ==================== osgb网格化聚合入库 ==================== -->
    <template v-if="functionName === 'osgb网格化聚合入库'">
      <div class="tip">
        将倾斜摄影OSGB数据转换为聚合网格并存入数据库，支持多层级聚合优化
      </div>

      <form class="form" @submit.prevent="submitAggregation">
        <div class="form-row">
          <label class="form-label" for="agg-folder">
            <span class="required">*</span>OSGB目录
          </label>
          <input
            id="agg-folder"
            v-model="aggregationForm.osgbFolder"
            type="text"
            class="form-input"
            placeholder="/app/data/osgbData"
            required
          >
        </div>

        <div class="form-row">
          <label class="form-label" for="agg-level">
            <span class="required">*</span>网格层级
          </label>
          <input
            id="agg-level"
            v-model.number="aggregationForm.level"
            type="number"
            step="1"
            min="0"
            class="form-input"
            placeholder="请输入网格层级"
            required
          >
        </div>

        <div class="form-row">
          <label class="form-label" for="agg-minLevel">最小层级</label>
          <input
            id="agg-minLevel"
            v-model.number="aggregationForm.minLevel"
            type="number"
            step="1"
            min="0"
            class="form-input"
            placeholder="默认为0"
          >
        </div>

        <div class="form-actions-stack">
          <div class="form-actions form-actions-primary">
            <button
              type="submit"
              class="btn-primary btn-primary-block"
              :disabled="aggregationLoading"
            >
              <Loader2 v-if="aggregationLoading" :size="14" class="spin" />
              {{ aggregationLoading ? '聚合入库中...' : '开始聚合入库' }}
            </button>
          </div>
        </div>
      </form>

      <div v-if="aggregationError" class="error">{{ aggregationError }}</div>

      <!-- 聚合入库结果统计 -->
      <div v-if="aggregationResult" class="result-stats">
        <div class="stat-card">
          <div class="stat-value" :class="{ 'success': aggregationResult.status === 'success', 'error': aggregationResult.status !== 'success' }">
            {{ aggregationResult.status === 'success' ? '成功' : aggregationResult.status }}
          </div>
          <div class="stat-label">处理状态</div>
        </div>
        <div v-if="aggregationResult.data?.total_triangles_processed !== undefined" class="stat-card">
          <div class="stat-value">{{ aggregationResult.data.total_triangles_processed }}</div>
          <div class="stat-label">处理三角形数</div>
        </div>
        <div v-if="aggregationResult.data?.total_grid_count_before !== undefined" class="stat-card">
          <div class="stat-value">{{ aggregationResult.data.total_grid_count_before }}</div>
          <div class="stat-label">聚合前网格数</div>
        </div>
        <div v-if="aggregationResult.data?.total_grid_count_after !== undefined" class="stat-card">
          <div class="stat-value">{{ aggregationResult.data.total_grid_count_after }}</div>
          <div class="stat-label">聚合后网格数</div>
        </div>
        <div v-if="aggregationResult.data?.level !== undefined" class="stat-card">
          <div class="stat-value">{{ aggregationResult.data.level }}</div>
          <div class="stat-label">网格层级</div>
        </div>
        <div v-if="aggregationResult.data?.minLevel !== undefined" class="stat-card">
          <div class="stat-value">{{ aggregationResult.data.minLevel }}</div>
          <div class="stat-label">最小聚合层级</div>
        </div>
      </div>

      <!-- 聚合效果说明 -->
      <div v-if="aggregationResult?.data?.total_grid_count_before && aggregationResult?.data?.total_grid_count_after" class="aggregation-effect">
        <div class="effect-title">聚合效果</div>
        <div class="effect-detail">
          网格数量从 <strong>{{ aggregationResult.data.total_grid_count_before }}</strong> 减少到
          <strong>{{ aggregationResult.data.total_grid_count_after }}</strong>，
          减少了 <strong>{{ aggregationResult.data.total_grid_count_before - aggregationResult.data.total_grid_count_after }}</strong> 个网格
          （约 {{ Math.round((1 - aggregationResult.data.total_grid_count_after / aggregationResult.data.total_grid_count_before) * 100) }}%）
        </div>
      </div>

      <div v-if="aggregationResult?.data?.message" class="result-message">
        {{ aggregationResult.data.message }}
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

        <div class="form-actions-stack">
          <div class="form-actions form-actions-primary">
            <button
              type="submit"
              class="btn-primary btn-primary-block"
              :disabled="triangleGridLoading"
            >
              <Loader2 v-if="triangleGridLoading" :size="14" class="spin" />
              <Search v-else :size="14" />
              {{ triangleGridLoading ? '查询中...' : '开始查询' }}
            </button>
          </div>
          <div class="form-actions form-actions-clear-grid">
            <button
              type="button"
              class="btn-clear-generated-grid"
              @click="clearGrids"
              :disabled="!triangleGridResult"
            >
              <Trash2 :size="14" />
              清除已生成网格
            </button>
          </div>
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
  border-radius: 10px;
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
  padding: 10px 14px;
  border-radius: 12px;
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

/* 聚合入库结果样式 - 使用 flex-wrap 支持多列显示 */
.result-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.result-stats .stat-card {
  flex: 1;
  min-width: calc(33.33% - 8px);
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.06);
  text-align: center;
}

.result-stats .stat-value {
  font-size: 22px;
  font-weight: 700;
  color: #60a5fa;
  font-variant-numeric: tabular-nums;
}

.result-stats .stat-value.success {
  color: #34d399;
  font-size: 14px;
  text-transform: uppercase;
}

.result-stats .stat-value.error {
  color: #f87171;
  font-size: 14px;
  text-transform: uppercase;
}

.result-stats .stat-label {
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

/* 聚合效果说明 */
.aggregation-effect {
  margin-top: 14px;
  padding: 12px 14px;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 8px;
}

.effect-title {
  font-size: 13px;
  font-weight: 600;
  color: #6ee7b7;
  margin-bottom: 8px;
}

.effect-detail {
  font-size: 13px;
  color: #a7f3d0;
  line-height: 1.5;
}

.effect-detail strong {
  color: #34d399;
  font-weight: 600;
}

/* 结果消息 */
.result-message {
  margin-top: 14px;
  padding: 12px 14px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 8px;
  color: #60a5fa;
  font-size: 13px;
  line-height: 1.5;
}
</style>
