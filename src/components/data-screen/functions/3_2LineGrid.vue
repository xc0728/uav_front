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
  <div v-if="functionName === '三维线网格化' || functionName === '线矩形缓冲区（管道）网格化'" class="calc-content">
    <form class="form" @submit.prevent="functionName === '线矩形缓冲区（管道）网格化' ? submitLinePipeGrid() : submit()">
      <!-- 三维线网格化表单 -->
      <template v-if="functionName === '三维线网格化'">
        <div class="form-row">
          <label class="form-label" for="lg-level">层级</label>
          <input
            id="lg-level"
            v-model.number="lineForm.level"
            type="number"
            step="1"
            min="0"
            class="form-input"
            required
          >
        </div>
      </template>

      <!-- 线矩形缓冲区（管道）网格化表单 -->
      <template v-if="functionName === '线矩形缓冲区（管道）网格化'">
        <div class="form-row">
          <label class="form-label" for="pipe-level">层级</label>
          <input
            id="pipe-level"
            v-model.number="pipeForm.level"
            type="number"
            step="1"
            min="14"
            max="32"
            class="form-input"
            placeholder="建议 20-25"
            required
          >
        </div>
        <div class="form-row">
          <label class="form-label" for="pipe-halfWidth">半宽(m)</label>
          <input
            id="pipe-halfWidth"
            v-model.number="pipeForm.halfWidth"
            type="number"
            step="1"
            min="1"
            class="form-input"
            placeholder="矩形截面半宽"
            required
          >
        </div>
        <div class="form-row">
          <label class="form-label" for="pipe-halfHeight">半高(m)</label>
          <input
            id="pipe-halfHeight"
            v-model.number="pipeForm.halfHeight"
            type="number"
            step="1"
            min="1"
            class="form-input"
            placeholder="矩形截面半高"
            required
          >
        </div>
        <div v-if="pipeHalfHeightError" class="radius-error-tip">
          半高（{{ pipeHalfHeightError.halfHeight }}m）不能大于第{{ pipeHalfHeightError.pointIdx }}个输入点的高度（{{ pipeHalfHeightError.pointHeight }}m）
        </div>
      </template>

      <div class="tip">
        点击地图添加节点；下方可改/删（至少 2 点）。
      </div>

      <div class="points-head">
        <div class="points-title">线节点（{{ points.length }}）</div>
        <div class="points-actions">
          <button type="button" class="btn-danger" @click="clearAll" :disabled="loading">
            <Trash2 :size="14" />
            清空
          </button>
        </div>
      </div>

      <div class="points-table">
        <div v-if="points.length === 0" class="points-empty">请点击地图添加点（至少 2 个）</div>

        <div v-for="(p, idx) in points" :key="idx" class="point-row">
          <div class="idx">{{ idx + 1 }}</div>
          <div class="point-fields">
            <div class="field">
              <div class="field-label">经度</div>
              <input v-model.number="p.lon" class="point-input" type="number" step="0.0000000001" required>
            </div>
            <div class="field">
              <div class="field-label">纬度</div>
              <input v-model.number="p.lat" class="point-input" type="number" step="0.0000000001" required>
            </div>
            <div class="field field-height">
              <div class="field-label">高度</div>
              <div class="height-row">
                <input v-model.number="p.height" class="point-input" type="number" step="0.01" required>
                <span class="unit">m</span>
                <button type="button" class="icon-btn" title="删除该点" @click="removePoint(idx)" :disabled="loading">
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="form-actions">
        <button
          type="submit"
          class="btn-primary"
          :disabled="loading || (functionName === '线矩形缓冲区（管道）网格化' ? !canSubmitPipe : !canSubmit) || (functionName === '线矩形缓冲区（管道）网格化' && !!pipeHalfHeightError)"
        >
          <Loader2 v-if="loading" :size="14" class="spin" />
          {{ loading ? '计算中...' : '开始计算' }}
        </button>
      </div>

      <!-- 清除格网按钮放在表单底部，始终可见 -->
      <div class="form-actions" style="margin-top: 12px;">
        <button type="button" class="btn-danger" @click="clearGrids">
          <Trash2 :size="14" />
          清除已生成格网
        </button>
      </div>
    </form>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="result" class="result">
      <div class="result-row">
        <span class="result-k">网格数量</span>
        <span class="result-v">{{ result.data?.count }}</span>
      </div>
      <div class="result-row">
        <span class="result-k">状态</span>
        <span class="result-v">{{ result.status }}</span>
      </div>
      <div v-if="result.data?.cells?.length" class="result-hint">
        已在地图上绘制返回网格边界
      </div>
    </div>

    <!-- 清除格网按钮已移至表单内部，始终可见 -->
  </div>
</template>

<style scoped>
.tip {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 14px;
  padding: 8px 12px;
  background: rgba(34, 197, 94, 0.08);
  border-radius: 6px;
  border: 1px solid rgba(34, 197, 94, 0.18);
}

.radius-error-tip {
  font-size: 12px;
  color: #fca5a5;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 6px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  margin-bottom: 8px;
}

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
  width: 72px;
  font-size: 13px;
  color: #94a3b8;
  flex-shrink: 0;
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
  border-color: #22c55e;
  background: rgba(34, 197, 94, 0.06);
}

.points-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 4px;
}

.points-title {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
}

.points-actions {
  display: flex;
  gap: 8px;
}

.btn-danger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #e2e8f0;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-danger:hover:not(:disabled) {
  border-color: rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.14);
  color: #fecaca;
}

.btn-danger:disabled {
  opacity: 0.6;
  cursor: default;
}

.points-table {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  overflow: hidden;
  max-height: 340px;
  overflow-y: auto;
}

.points-table::-webkit-scrollbar {
  width: 4px;
}

.points-table::-webkit-scrollbar-track {
  background: transparent;
}

.points-table::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 2px;
}

.points-empty {
  padding: 12px;
  font-size: 12px;
  color: #64748b;
  background: rgba(0, 0, 0, 0.15);
}

.point-row {
  display: grid;
  grid-template-columns: 30px 1fr;
  gap: 10px;
  padding: 10px;
  align-items: start;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.18);
}

.point-row:first-child {
  border-top: none;
}

.idx {
  font-size: 12px;
  color: #64748b;
  text-align: center;
  font-variant-numeric: tabular-nums;
  padding-top: 4px;
}

.point-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.field {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.field-label {
  width: 46px;
  font-size: 12px;
  color: rgba(148, 163, 184, 0.9);
  flex-shrink: 0;
}

.height-row {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr auto 34px;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.unit {
  font-size: 12px;
  color: rgba(148, 163, 184, 0.85);
  flex-shrink: 0;
}

.point-input {
  flex: 1;
  width: auto;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
  color: #f1f5f9;
  font-size: 13px;
  outline: none;
}

.point-input:focus {
  border-color: rgba(34, 197, 94, 0.55);
}

.icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: #94a3b8;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.icon-btn:hover:not(:disabled) {
  border-color: rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.12);
  color: #fecaca;
}

.icon-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 6px;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 22px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(34, 197, 94, 0.35);
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
  margin-top: 16px;
  padding: 14px;
  background: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(34, 197, 94, 0.2);
  border-radius: 8px;
}

.result-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 13px;
}

.result-k {
  color: #64748b;
}

.result-v {
  color: #86efac;
  font-weight: 500;
}

.result-hint {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(34, 197, 94, 0.2);
  font-size: 12px;
  color: #86efac;
  text-align: center;
}
</style>

