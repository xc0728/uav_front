<script setup>
import { reactive, ref } from 'vue'

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

// 网格层级快选选项
const levelOptions = [
  { value: 9, label: '层级 9' },
]

// osgb网格化（同步入库）的层级选项
const osgbLevelOptions = [
  { value: 9, label: '层级 9' },
  { value: 14, label: '层级 14' },
]

// osgb网格化聚合入库的层级选项
const aggregationLevelOptions = [
  { value: 9, label: '层级 9' },
  { value: 14, label: '层级 14' },
]

// 最小层级选项（0-5级）
const minLevelOptions = [
  { value: 0, label: '层级 0' },
  { value: 1, label: '层级 1' },
  { value: 2, label: '层级 2' },
  { value: 3, label: '层级 3' },
  { value: 4, label: '层级 4' },
  { value: 5, label: '层级 5' },
]

// 倾斜摄影网格查询层级选择
function onLevelQuickSelect(event) {
  const value = Number(event.target.value)
  if (!isNaN(value)) {
    triangleGridForm.level = value
  }
}

// osgb网格化层级选择
function onOsgbLevelSelect(event) {
  const value = Number(event.target.value)
  if (!isNaN(value)) {
    osgbForm.level = value
  }
}

// osgb网格化聚合入库层级选择
function onAggregationLevelSelect(event) {
  const value = Number(event.target.value)
  if (!isNaN(value)) {
    aggregationForm.level = value
  }
}

// osgb网格化聚合入库最小层级选择
function onAggregationMinLevelSelect(event) {
  const value = Number(event.target.value)
  if (!isNaN(value)) {
    aggregationForm.minLevel = value
  }
}

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
  <div class="tilt-photogrammetry">
    <!-- ==================== OSGB 网格化（同步入库） ==================== -->
    <template v-if="functionName === 'osgb网格化（同步入库）'">
      <!-- OSGB目录 -->
      <div class="form-group">
        <div class="group-title">OSGB目录</div>
        <input
          v-model="osgbForm.osgbFolder"
          type="text"
          class="full-input"
          placeholder="/app/data/osgbData"
        >
      </div>

      <!-- 层级 -->
      <div class="form-group">
        <div class="group-title">网格层级</div>
        <select
          class="level-select full-input"
          :value="osgbForm.level"
          @change="onOsgbLevelSelect"
        >
          <option
            v-for="opt in osgbLevelOptions"
            :key="opt.value"
            :value="opt.value"
          >{{ opt.label }}</option>
        </select>
      </div>

      <!-- 操作按钮 -->
      <div class="btn-row">
        <button class="btn-query" @click="submitOsgbGrid" :disabled="osgbLoading">
          <span>{{ osgbLoading ? '网格化中...' : '开始网格化' }}</span>
        </button>
      </div>

      <!-- 错误提示 -->
      <div v-if="osgbError" class="error-box">{{ osgbError }}</div>

      <!-- 查询结果 -->
      <div v-if="osgbResult" class="result-box">
        <div class="result-row">
          <span class="result-label">处理状态</span>
          <span class="result-status" :class="osgbResult.status">
            {{ osgbResult.status === 'success' ? '成功' : osgbResult.status }}
          </span>
        </div>
        <div v-if="osgbResult.data?.total_triangles_processed !== undefined" class="result-row">
          <span class="result-label">三角形数</span>
          <span class="result-num">{{ osgbResult.data.total_triangles_processed }}</span>
        </div>
        <div v-if="osgbResult.data?.total_grid_count !== undefined" class="result-row">
          <span class="result-label">网格总数</span>
          <span class="result-num">{{ osgbResult.data.total_grid_count }}</span>
        </div>
      </div>
    </template>

    <!-- ==================== osgb网格化聚合入库 ==================== -->
    <template v-if="functionName === 'osgb网格化聚合入库'">
      <!-- OSGB目录 -->
      <div class="form-group">
        <div class="group-title">OSGB目录</div>
        <input
          v-model="aggregationForm.osgbFolder"
          type="text"
          class="full-input"
          placeholder="/app/data/osgbData"
        >
      </div>

      <!-- 网格层级 -->
      <div class="form-group">
        <div class="group-title">网格层级</div>
        <select
          class="level-select full-input"
          :value="aggregationForm.level"
          @change="onAggregationLevelSelect"
        >
          <option
            v-for="opt in aggregationLevelOptions"
            :key="opt.value"
            :value="opt.value"
          >{{ opt.label }}</option>
        </select>
      </div>

      <!-- 最小层级 -->
      <div class="form-group">
        <div class="group-title">最小层级</div>
        <select
          class="level-select full-input"
          :value="aggregationForm.minLevel"
          @change="onAggregationMinLevelSelect"
        >
          <option
            v-for="opt in minLevelOptions"
            :key="opt.value"
            :value="opt.value"
          >{{ opt.label }}</option>
        </select>
      </div>

      <!-- 操作按钮 -->
      <div class="btn-row">
        <button class="btn-query" @click="submitAggregation" :disabled="aggregationLoading">
          <span>{{ aggregationLoading ? '聚合入库中...' : '开始聚合入库' }}</span>
        </button>
      </div>

      <!-- 错误提示 -->
      <div v-if="aggregationError" class="error-box">{{ aggregationError }}</div>

      <!-- 聚合入库结果统计 -->
      <div v-if="aggregationResult" class="result-box">
        <div class="result-row">
          <span class="result-label">处理状态</span>
          <span class="result-status" :class="aggregationResult.status">
            {{ aggregationResult.status === 'success' ? '成功' : aggregationResult.status }}
          </span>
        </div>
        <div v-if="aggregationResult.data?.total_triangles_processed !== undefined" class="result-row">
          <span class="result-label">三角形数</span>
          <span class="result-num">{{ aggregationResult.data.total_triangles_processed }}</span>
        </div>
        <div v-if="aggregationResult.data?.total_grid_count_before !== undefined" class="result-row">
          <span class="result-label">聚合前网格</span>
          <span class="result-num">{{ aggregationResult.data.total_grid_count_before }}</span>
        </div>
        <div v-if="aggregationResult.data?.total_grid_count_after !== undefined" class="result-row">
          <span class="result-label">聚合后网格</span>
          <span class="result-num">{{ aggregationResult.data.total_grid_count_after }}</span>
        </div>
      </div>

      <!-- 聚合效果说明 -->
      <div v-if="aggregationResult?.data?.total_grid_count_before && aggregationResult?.data?.total_grid_count_after" class="aggregation-effect">
        <div class="effect-title">聚合效果</div>
        <div class="effect-detail">
          网格从 <strong>{{ aggregationResult.data.total_grid_count_before }}</strong> 减少到
          <strong>{{ aggregationResult.data.total_grid_count_after }}</strong>，
          减少 <strong>{{ aggregationResult.data.total_grid_count_before - aggregationResult.data.total_grid_count_after }}</strong> 个
          （约 {{ Math.round((1 - aggregationResult.data.total_grid_count_after / aggregationResult.data.total_grid_count_before) * 100) }}%）
        </div>
      </div>
    </template>

    <!-- ==================== 倾斜摄影网格查询 ==================== -->
    <template v-if="functionName === '倾斜摄影网格查询'">
      <!-- 层级 -->
      <div class="form-group">
        <div class="group-title">网格层级</div>
        <select
          class="level-select full-input"
          :value="triangleGridForm.level"
          @change="onLevelQuickSelect"
        >
          <option
            v-for="opt in levelOptions"
            :key="opt.value"
            :value="opt.value"
          >{{ opt.label }}</option>
        </select>
      </div>

      <!-- 操作按钮 -->
      <div class="btn-row">
        <button class="btn-query" @click="submitTriangleGridQuery" :disabled="triangleGridLoading">
          <span>{{ triangleGridLoading ? '查询中...' : '开始查询' }}</span>
        </button>
        <button class="btn-clear" @click="clearGrids" :disabled="!triangleGridResult">
          <span>清除结果</span>
        </button>
      </div>

      <!-- 错误提示 -->
      <div v-if="triangleGridError" class="error-box">{{ triangleGridError }}</div>

      <!-- 查询结果统计 -->
      <div v-if="queryStats" class="result-box">
        <div class="result-row">
          <span class="result-label">网格数量</span>
          <span class="result-num">{{ queryStats.total }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">查询状态</span>
          <span class="result-status" :class="queryStats.status">
            {{ queryStats.status === 'success' ? '成功' : queryStats.status }}
          </span>
        </div>
      </div>

      <!-- 无数据提示 -->
      <div v-if="triangleGridResult?.data && gridsData.length === 0" class="empty-box">
        未查询到网格数据
      </div>
    </template>
  </div>
</template>

<style scoped>
.tilt-photogrammetry {
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

.full-input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 14px;
  box-sizing: border-box;
}

.full-input::placeholder {
  color: #999;
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
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border: 1px solid #ddd;
  background: #f9f9f9;
  border-radius: 8px;
}

.result-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.result-label {
  font-size: 14px;
  color: #64748b;
}

.result-num {
  font-size: 16px;
  font-weight: 600;
  color: #334155;
}

.result-status {
  font-size: 14px;
  font-weight: 600;
}

.result-status.success {
  color: #060;
}

.result-status:not(.success) {
  color: #c00;
}

/* 聚合效果说明 */
.aggregation-effect {
  margin-top: 10px;
  padding: 12px;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  background: #f0fdf4;
}

.effect-title {
  font-size: 14px;
  font-weight: 600;
  color: #166534;
  margin-bottom: 6px;
}

.effect-detail {
  font-size: 13px;
  color: #334155;
  line-height: 1.5;
}

.effect-detail strong {
  color: #166534;
  font-weight: 600;
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

/* 层级下拉选择 */
.level-select {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 14px;
  cursor: pointer;
  box-sizing: border-box;
}

.level-select:focus {
  outline: none;
  border-color: #5b9fd4;
  box-shadow: 0 0 0 2px rgba(91, 159, 212, 0.2);
}
</style>
