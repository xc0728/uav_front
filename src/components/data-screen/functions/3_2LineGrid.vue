<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Loader2, Trash2 } from 'lucide-vue-next'

const props = defineProps({
  serviceName: {
    type: String,
    default: '立体导航网格剖分计算服务',
  },
  functionName: {
    type: String,
    required: true,
  },
})

const emit = defineEmits(['showGrid', 'show-line'])

// 清除已生成的格网
function clearGrids() {
  emit('showGrid', { cells: [] })
}

// ===== 三维线网格化 =====
const lineForm = reactive({
  level: 14,
})

const points = ref([])

// 层级选项
const levelOptions = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]

// 高度快选选项
const heightOptions = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]

// 半宽/半高快选选项
const halfOptions = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]

const loading = ref(false)
const error = ref('')
const result = ref(null)

const canSubmit = computed(() => points.value.length >= 2 && Number.isFinite(Number(lineForm.level)))

function normalizePoint(p) {
  const lon = Number(Number(p.lon).toFixed(10))
  const lat = Number(Number(p.lat).toFixed(10))
  // 确保高度有效：只有当高度为 undefined、NaN 或 0 时才使用默认值 100
  // 地形高度不可能为0，如果是0说明没有获取到地形高度，需要使用默认值
  let height = Number(p.height)
  if (!Number.isFinite(height) || height <= 0) {
    height = 100
  }
  height = Number(height.toFixed(2))
  return { lon, lat, height }
}

function emitLine() {
  emit(
    'show-line',
    points.value.map(normalizePoint),
  )
}

function setPointFromMap(lon, lat, height) {
  if (props.functionName !== '三维线网格化' && props.functionName !== '线矩形缓冲区（管道）网格化') return
  points.value.push(normalizePoint({ lon, lat, height }))
  emitLine()
}

function removePoint(idx) {
  points.value.splice(idx, 1)
  emitLine()
}

function clearAll() {
  points.value = []
  result.value = null
  error.value = ''
  emitLine()
}

function resetForm() {
  if (props.functionName !== '三维线网格化' && props.functionName !== '线矩形缓冲区（管道）网格化') return
  loading.value = false
  error.value = ''
  result.value = null
  emit('show-line', [])
}

defineExpose({ resetForm, setPointFromMap })

watch(
  points,
  () => {
    if (props.functionName !== '三维线网格化' && props.functionName !== '线矩形缓冲区（管道）网格化') return
    emitLine()
  },
  { deep: true },
)

// ===== 线矩形缓冲区（管道）网格化 =====
const pipeForm = reactive({
  level: 14,
  halfWidth: 15,
  halfHeight: 15,
})

const canSubmitPipe = computed(() => points.value.length >= 2 &&
  Number.isFinite(Number(pipeForm.level)) &&
  Number.isFinite(Number(pipeForm.halfWidth)) &&
  Number.isFinite(Number(pipeForm.halfHeight)) &&
  // 半高必须小于所有输入点的高度
  pipeForm.halfHeight <= Math.min(...points.value.map(p => p.height)))

const pipeHalfHeightError = ref(null)

// 监听半高和输入点高度的变化，更新错误提示
watch(
  () => [pipeForm.halfHeight, points.value],
  () => {
    if (points.value.length === 0) {
      pipeHalfHeightError.value = null
      return
    }
    const minHeight = Math.min(...points.value.map(p => p.height))
    // 半高必须小于所有输入点的高度，否则会有网格位于地平线以下
    if (pipeForm.halfHeight > minHeight) {
      const idx = points.value.findIndex(p => p.height === minHeight)
      pipeHalfHeightError.value = {
        halfHeight: pipeForm.halfHeight,
        pointHeight: minHeight,
        pointIdx: idx + 1
      }
    } else {
      pipeHalfHeightError.value = null
    }
  },
  { deep: true }
)

async function submitLinePipeGrid() {
  error.value = ''
  result.value = null

  // 验证：半高必须小于等于所有输入点的高度
  const minHeight = Math.min(...points.value.map(p => p.height))
  if (pipeForm.halfHeight > minHeight) {
    error.value = `半高（${pipeForm.halfHeight}m）不能大于输入点的高度（${minHeight}m），否则会有网格位于地平线以下导致计算错误`
    return
  }

  loading.value = true

  try {
    const payload = {
      line: points.value.map(p => [Number(p.lon), Number(p.lat), Number(p.height)]),
      level: Number(pipeForm.level),
      halfWidth: Number(pipeForm.halfWidth),
      halfHeight: Number(pipeForm.halfHeight),
    }
    if (payload.line.length < 2) throw new Error('请至少选择 2 个点组成线')
    if (Number.isNaN(payload.level)) throw new Error('请填写合法的层级 level')
    if (Number.isNaN(payload.halfWidth) || payload.halfWidth <= 0) throw new Error('请填写合法的半宽')
    if (Number.isNaN(payload.halfHeight) || payload.halfHeight <= 0) throw new Error('请填写合法的半高')

    const resp = await fetch('/api/multiSource/geometricGrid/getGridByPolylineAndRect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) {
      let errMsg = `请求失败，状态码 ${resp.status}`
      try {
        const errData = await resp.json()
        errMsg = errData.message || errData.msg || JSON.stringify(errData)
      } catch {}
      throw new Error(errMsg)
    }

    const data = await resp.json()
    result.value = data

    const MAX_CELLS = 10000
    if (data?.data?.cells?.length) {
      // 计算后仅展示格网：清除绘制的线
      emit('show-line', [])
      emit('showGrid', {
        cells: data.data.cells.slice(0, MAX_CELLS).map(cell => ({
          bounds: {
            north: cell.maxlat,
            south: cell.minlat,
            east: cell.maxlon,
            west: cell.minlon,
            top: cell.top,
            bottom: cell.bottom,
          },
          code: cell.code,
          center: cell.center,
        })),
      })
    }
  } catch (err) {
    error.value = err?.message || '请求失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

// 兼容旧的三维线网格化
async function submit() {
  error.value = ''
  result.value = null
  loading.value = true

  try {
    const payload = {
      line: points.value.map(p => [Number(p.lon), Number(p.lat), Number(p.height)]),
      level: Number(lineForm.level),
    }
    if (payload.line.length < 2) throw new Error('请至少选择 2 个点组成线')
    if (Number.isNaN(payload.level)) throw new Error('请填写合法的层级 level')

    const resp = await fetch('/api/multiSource/geometricGrid/getGridByLine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) {
      let errMsg = `请求失败，状态码 ${resp.status}`
      try {
        const errData = await resp.json()
        errMsg = errData.message || errData.msg || JSON.stringify(errData)
      } catch {}
      throw new Error(errMsg)
    }

    const data = await resp.json()
    result.value = data

    const MAX_CELLS = 10000
    if (data?.data?.cells?.length) {
      // 计算后仅展示格网：清除绘制的线
      emit('show-line', [])
      emit('showGrid', {
        cells: data.data.cells.slice(0, MAX_CELLS).map(cell => ({
          bounds: {
            north: cell.maxlat,
            south: cell.minlat,
            east: cell.maxlon,
            west: cell.minlon,
            top: cell.top,
            bottom: cell.bottom,
          },
          code: cell.code,
          center: cell.center,
        })),
      })
    }
  } catch (err) {
    error.value = err?.message || '请求失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div v-if="functionName === '三维线网格化' || functionName === '线矩形缓冲区（管道）网格化'" class="line-grid-query">
    <!-- 三维线网格化 -->
    <template v-if="functionName === '三维线网格化'">
      <!-- 参数表单 -->
      <div class="form-group">
        <div class="group-title">网格参数</div>
        <div class="param-line">
          <span class="param-label">层级</span>
          <select
            v-model.number="lineForm.level"
            class="param-select"
            aria-label="层级快选"
          >
            <option v-for="level in levelOptions" :key="level" :value="level">{{ level }}级</option>
          </select>
        </div>
      </div>

      <!-- 线节点列表 -->
      <div class="form-group">
        <div class="group-title-row">
          <span class="group-title">线节点</span>
          <span class="group-sub">({{ points.length }}个)</span>
          <button type="button" class="btn-link-clear" @click="clearAll" :disabled="loading">
            清空
          </button>
        </div>

        <div v-if="points.length === 0" class="empty-hint">
          请点击地图添加点（至少 2 个）
        </div>

        <div v-else class="points-list">
          <div v-for="(p, idx) in points" :key="idx" class="point-card">
            <div class="point-card-header">
              <span class="point-index">#{{ idx + 1 }}</span>
              <button type="button" class="btn-point-delete" @click="removePoint(idx)" title="删除该点">
                <Trash2 :size="14" />
              </button>
            </div>
            <div class="point-fields">
              <div class="field">
                <span class="field-label">经度</span>
                <input v-model.number="p.lon" class="field-input" type="number" step="any">
              </div>
              <div class="field">
                <span class="field-label">纬度</span>
                <input v-model.number="p.lat" class="field-input" type="number" step="any">
              </div>
              <div class="field">
                <span class="field-label">高度(m)</span>
                <input v-model.number="p.height" class="field-input" type="number" step="any">
                <select
                  class="field-select"
                  @change="e => { if(e.target.value !== '') p.height = Number(e.target.value); e.target.selectedIndex = 0; }"
                  aria-label="高度快选"
                >
                  <option value="">快选</option>
                  <option v-for="h in heightOptions" :key="h" :value="h">{{ h }}</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="btn-row">
        <button class="btn-query" @click="submit" :disabled="loading || !canSubmit">
          <Loader2 v-if="loading" :size="16" class="spin" />
          {{ loading ? '计算中...' : '开始计算' }}
        </button>
        <button class="btn-clear" @click="clearGrids">
          <span>清除网格</span>
        </button>
      </div>

      <div v-if="error" class="error-box">{{ error }}</div>

      <div v-if="result" class="result-box">
        <div class="result-row">
          <span class="result-label">网格数量</span>
          <span class="result-num">{{ result.data?.count }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">状态</span>
          <span class="result-status success">{{ result.status }}</span>
        </div>
      </div>
    </template>

    <!-- 线矩形缓冲区（管道）网格化 -->
    <template v-if="functionName === '线矩形缓冲区（管道）网格化'">
      <!-- 参数表单 -->
      <div class="form-group">
        <div class="group-title">网格参数</div>
        <div class="param-line">
          <span class="param-label">层级</span>
          <select
            v-model.number="pipeForm.level"
            class="param-select"
            aria-label="层级快选"
          >
            <option v-for="level in levelOptions" :key="level" :value="level">{{ level }}级</option>
          </select>
        </div>
        <div class="param-line">
          <span class="param-label">半宽(m)</span>
          <input
            v-model.number="pipeForm.halfWidth"
            type="number"
            step="1"
            min="1"
            class="param-input"
          >
          <select
            class="param-select-sm"
            @change="e => { if(e.target.value !== '') pipeForm.halfWidth = Number(e.target.value); e.target.selectedIndex = 0; }"
            aria-label="半宽快选"
          >
            <option value="">快选</option>
            <option v-for="h in halfOptions" :key="h" :value="h">{{ h }}</option>
          </select>
        </div>
        <div class="param-line">
          <span class="param-label">半高(m)</span>
          <input
            v-model.number="pipeForm.halfHeight"
            type="number"
            step="1"
            min="1"
            class="param-input"
          >
          <select
            class="param-select-sm"
            @change="e => { if(e.target.value !== '') pipeForm.halfHeight = Number(e.target.value); e.target.selectedIndex = 0; }"
            aria-label="半高快选"
          >
            <option value="">快选</option>
            <option v-for="h in halfOptions" :key="h" :value="h">{{ h }}</option>
          </select>
        </div>
        <div v-if="pipeHalfHeightError" class="param-error">
          半高（{{ pipeHalfHeightError.halfHeight }}m）不能大于第{{ pipeHalfHeightError.pointIdx }}个输入点的高度（{{ pipeHalfHeightError.pointHeight }}m）
        </div>
      </div>

      <!-- 线节点列表 -->
      <div class="form-group">
        <div class="group-title-row">
          <span class="group-title">线节点</span>
          <span class="group-sub">({{ points.length }}个)</span>
          <button type="button" class="btn-link-clear" @click="clearAll" :disabled="loading">
            清空
          </button>
        </div>

        <div v-if="points.length === 0" class="empty-hint">
          请点击地图添加点（至少 2 个）
        </div>

        <div v-else class="points-list">
          <div v-for="(p, idx) in points" :key="idx" class="point-card">
            <div class="point-card-header">
              <span class="point-index">#{{ idx + 1 }}</span>
              <button type="button" class="btn-point-delete" @click="removePoint(idx)" title="删除该点">
                <Trash2 :size="14" />
              </button>
            </div>
            <div class="point-fields">
              <div class="field">
                <span class="field-label">经度</span>
                <input v-model.number="p.lon" class="field-input" type="number" step="any">
              </div>
              <div class="field">
                <span class="field-label">纬度</span>
                <input v-model.number="p.lat" class="field-input" type="number" step="any">
              </div>
              <div class="field">
                <span class="field-label">高度(m)</span>
                <input v-model.number="p.height" class="field-input" type="number" step="any">
                <select
                  class="field-select"
                  @change="e => { if(e.target.value !== '') p.height = Number(e.target.value); e.target.selectedIndex = 0; }"
                  aria-label="高度快选"
                >
                  <option value="">快选</option>
                  <option v-for="h in heightOptions" :key="h" :value="h">{{ h }}</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="btn-row">
        <button 
          class="btn-query" 
          @click="submitLinePipeGrid" 
          :disabled="loading || !canSubmitPipe || !!pipeHalfHeightError"
        >
          <Loader2 v-if="loading" :size="16" class="spin" />
          {{ loading ? '计算中...' : '开始计算' }}
        </button>
        <button class="btn-clear" @click="clearGrids">
          <span>清除网格</span>
        </button>
      </div>

      <div v-if="error" class="error-box">{{ error }}</div>

      <div v-if="result" class="result-box">
        <div class="result-row">
          <span class="result-label">网格数量</span>
          <span class="result-num">{{ result.data?.count }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">状态</span>
          <span class="result-status success">{{ result.status }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.line-grid-query {
  padding: 0;
  width: 100%;
  box-sizing: border-box;
  position: relative;
}

/* 提示框 */
.hint-box {
  padding: 10px 12px;
  margin-bottom: 12px;
  background: #f5f3f0;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  color: #475569;
  font-size: 14px;
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

.group-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.group-title-row .group-title {
  margin-bottom: 0;
}

.group-sub {
  font-size: 13px;
  color: #64748b;
}

.btn-link-clear {
  margin-left: auto;
  padding: 4px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
  color: #64748b;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-link-clear:hover:not(:disabled) {
  background: #f5f3f0;
  color: #334155;
}

.btn-link-clear:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 空状态 */
.empty-hint {
  padding: 14px;
  text-align: center;
  color: #64748b;
  font-size: 14px;
  border: 1px dashed #d4c9b8;
  border-radius: 8px;
}

/* 参数行 */
.param-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.param-line:last-child {
  margin-bottom: 0;
}

.param-label {
  width: 70px;
  font-size: 14px;
  color: #334155;
  flex-shrink: 0;
}

.param-input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 14px;
  box-sizing: border-box;
}

.param-input:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
}

.param-select {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 14px;
  box-sizing: border-box;
  cursor: pointer;
}

.param-select:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
}

.param-select-sm {
  width: 70px;
  height: 34px;
  padding: 0 6px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 13px;
  box-sizing: border-box;
  cursor: pointer;
}

.param-select-sm:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
}

/* 错误提示 */
.param-error {
  font-size: 13px;
  color: #dc2626;
  padding: 8px 12px;
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 6px;
  margin-bottom: 8px;
}

.error-box {
  padding: 10px 12px;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  background: #fef2f2;
  font-size: 14px;
  color: #dc2626;
  margin-bottom: 10px;
}

/* 点列表 */
.points-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
}

.point-card {
  padding: 10px;
  background: #ffffff;
  border: 1px solid #ebe6df;
  border-radius: 8px;
}

.point-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.point-index {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.btn-point-delete {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: #fef2f2;
  color: #dc2626;
  cursor: pointer;
}

.btn-point-delete:hover {
  background: #fee2e2;
}

.point-fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.field-label {
  width: 50px;
  font-size: 13px;
  color: #64748b;
  flex-shrink: 0;
}

.field-input {
  flex: 1;
  min-width: 60px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 13px;
  box-sizing: border-box;
}

.field-select {
  width: 80px;
  height: 32px;
  padding: 0 6px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 13px;
  cursor: pointer;
  box-sizing: border-box;
}

.field-select:focus {
  outline: none;
  border-color: #7db8e0;
}

.field-input:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 2px rgba(91, 159, 212, 0.12);
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
  gap: 6px;
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

.btn-clear:hover {
  background: #e8e8e8;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 结果区 */
.result-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  background: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 6px;
}

.result-label {
  font-size: 13px;
  color: #64748b;
}

.result-num {
  font-size: 14px;
  font-weight: 500;
  color: #334155;
}

.result-status {
  font-size: 14px;
  font-weight: 500;
}

.result-status.success {
  color: #059669;
}
</style>

