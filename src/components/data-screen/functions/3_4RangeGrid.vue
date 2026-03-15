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

const emit = defineEmits(['showGrid', 'show-polygon', 'showPoint'])

// 清除已生成的格网
function clearGrids() {
  emit('showGrid', { cells: [] })
}

// ===== 立方体网格化 =====
const rangeForm = reactive({
  level: 14,
  bottom: 0,
  top: 120,
})

// 矩形两个角点（对角线端点）
const cornerPoints = ref([])

const loading = ref(false)
const error = ref('')
const result = ref(null)

const canSubmit = computed(() => {
  if (cornerPoints.value.length !== 2) return false
  if (!Number.isFinite(Number(rangeForm.level))) return false
  if (!Number.isFinite(Number(rangeForm.bottom))) return false
  if (!Number.isFinite(Number(rangeForm.top))) return false
  if (Number(rangeForm.top) <= Number(rangeForm.bottom)) return false
  return true
})

function normalizePoint(p) {
  const lon = Number(Number(p.lon).toFixed(10))
  const lat = Number(Number(p.lat).toFixed(10))
  const height = Number(Number(p.height ?? 0).toFixed(1))
  return { lon, lat, height }
}

// 计算轴对齐矩形的四个角点
function getRectanglePoints() {
  if (cornerPoints.value.length !== 2) return []

  const p1 = cornerPoints.value[0]
  const p2 = cornerPoints.value[1]

  const minLon = Math.min(p1.lon, p2.lon)
  const maxLon = Math.max(p1.lon, p2.lon)
  const minLat = Math.min(p1.lat, p2.lat)
  const maxLat = Math.max(p1.lat, p2.lat)

  // 返回四个角点（闭合多边形）
  return [
    { lon: minLon, lat: minLat },
    { lon: maxLon, lat: minLat },
    { lon: maxLon, lat: maxLat },
    { lon: minLon, lat: maxLat },
    { lon: minLon, lat: minLat }, // 闭合
  ]
}

function emitRangePolygon() {
  const rectPoints = getRectanglePoints()
  emit('show-polygon', rectPoints)
}

// 接收地图点击添加点
function setPointFromMap(lon, lat, height) {
  if (props.functionName !== '立方体网格化') return

  if (cornerPoints.value.length < 2) {
    cornerPoints.value.push(normalizePoint({ lon, lat, height }))
    emitRangePolygon()
  }
}

// 删除指定点
function removeCornerPoint(idx) {
  cornerPoints.value.splice(idx, 1)
  emitRangePolygon()
}

// 清空所有点
function clearAll() {
  cornerPoints.value = []
  result.value = null
  error.value = ''
  emitRangePolygon()
}

// 重置表单
function resetForm() {
  if (props.functionName !== '立方体网格化') return
  loading.value = false
  error.value = ''
  result.value = null
  emit('show-polygon', [])
}

// 暴露给父组件
defineExpose({ resetForm, setPointFromMap })

// 监听点变化，实时更新地图显示
watch(
  () => cornerPoints.value,
  () => {
    if (props.functionName !== '立方体网格化') return
    emitRangePolygon()
  },
  { deep: true },
)

// 提交计算
async function submitRangeGrid() {
  error.value = ''
  result.value = null
  loading.value = true

  try {
    // 构建矩形范围（4个角点，闭合多边形）
    const rectPoints = getRectanglePoints()
    const range = rectPoints.slice(0, 4).map(p => [Number(p.lon), Number(p.lat)])

    const payload = {
      range: range,
      level: Number(rangeForm.level),
      bottom: Number(rangeForm.bottom),
      top: Number(rangeForm.top),
    }

    if (payload.range.length !== 4) throw new Error('请绘制矩形范围（2个角点）')
    if (Number.isNaN(payload.level)) throw new Error('请填写合法的层级 level')
    if (Number.isNaN(payload.bottom)) throw new Error('请填写合法的底面高度')
    if (Number.isNaN(payload.top)) throw new Error('请填写合法的顶面高度')
    if (payload.top <= payload.bottom) throw new Error('顶面高度必须大于底面高度')

    const resp = await fetch('/api/multiSource/basicGrid/cubeRegionToGridcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!resp.ok) throw new Error(`请求失败，状态码 ${resp.status}`)

    const data = await resp.json()
    result.value = data

    const MAX_CELLS = 10000
    if (data?.data?.cells?.length) {
      emit('show-polygon', null)
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
  <div v-if="functionName === '立方体网格化'" class="calc-content">
    <div class="tip">
      点击地图绘制矩形范围（2个对角点，自动生成轴对齐矩形）；底部高度需小于顶部高度。
    </div>

    <form class="form" @submit.prevent="submitRangeGrid">
      <div class="form-row">
        <label class="form-label" for="range-level">层级</label>
        <input
          id="range-level"
          v-model.number="rangeForm.level"
          type="number"
          step="1"
          min="0"
          class="form-input"
          required
        >
      </div>
      <div class="form-row">
        <label class="form-label" for="range-bottom">底面高(m)</label>
        <input
          id="range-bottom"
          v-model.number="rangeForm.bottom"
          type="number"
          step="1"
          min="0"
          class="form-input"
          placeholder="底面高度"
          required
        >
      </div>
      <div class="form-row">
        <label class="form-label" for="range-top">顶面高(m)</label>
        <input
          id="range-top"
          v-model.number="rangeForm.top"
          type="number"
          step="1"
          min="0"
          class="form-input"
          placeholder="顶面高度"
          required
        >
      </div>

      <div class="points-head">
        <div class="points-title">矩形角点（{{ cornerPoints.length }}/2）</div>
        <div class="points-actions">
          <button type="button" class="btn-danger" @click="clearAll" :disabled="loading">
            <Trash2 :size="14" />
            清空
          </button>
        </div>
      </div>

      <div class="points-table">
        <div v-if="cornerPoints.length === 0" class="points-empty">请点击地图绘制矩形（需2个对角点）</div>

        <div v-for="(p, idx) in cornerPoints" :key="idx" class="point-row">
          <div class="point-header">
            <div class="idx">{{ idx === 0 ? '左上' : '右下' }}</div>
            <button type="button" class="icon-btn" title="删除该点" @click="removeCornerPoint(idx)" :disabled="loading">
              <Trash2 :size="14" />
            </button>
          </div>
          <div class="point-fields">
            <div class="field">
              <label class="field-label">经度</label>
              <input v-model.number="p.lon" class="point-input" type="number" step="0.0000000001" required>
            </div>
            <div class="field">
              <label class="field-label">纬度</label>
              <input v-model.number="p.lat" class="point-input" type="number" step="0.0000000001" required>
            </div>
            <div class="field">
              <label class="field-label">高度(m)</label>
              <input v-model.number="p.height" class="point-input" type="number" step="0.01" required>
            </div>
          </div>
        </div>
      </div>

      <div class="form-actions">
        <button
          type="submit"
          class="btn-primary"
          :disabled="loading || !canSubmit"
        >
          <Loader2 v-if="loading" :size="14" class="spin" />
          {{ loading ? '计算中...' : '开始计算' }}
        </button>
      </div>
      <!-- 清除格网按钮放在表单内部，始终可见 -->
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

.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.form-label {
  flex: 0 0 80px;
  font-size: 13px;
  color: #94a3b8;
}

.form-input {
  flex: 1;
  height: 32px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
  color: #f1f5f9;
  font-size: 13px;
  outline: none;
}

.form-input:focus {
  border-color: rgba(59, 130, 246, 0.55);
}

.points-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
}

.points-title {
  font-size: 13px;
  font-weight: 500;
  color: #e2e8f0;
}

.points-actions {
  display: flex;
  gap: 8px;
}

.points-table {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
}

.points-empty {
  padding: 20px;
  text-align: center;
  color: #64748b;
  font-size: 13px;
  background: rgba(0, 0, 0, 0.2);
}

.point-row {
  padding: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.15);
}

.point-row:last-child {
  border-bottom: none;
}

.point-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.idx {
  flex: 0 0 40px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(59, 130, 246, 0.2);
  border-radius: 4px;
  font-size: 12px;
  color: #93c5fd;
}

.point-fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.field-label {
  flex: 0 0 50px;
  font-size: 12px;
  color: #64748b;
}

.point-input {
  flex: 1;
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
  color: #f1f5f9;
  font-size: 12px;
  outline: none;
}

.point-input:focus {
  border-color: rgba(59, 130, 246, 0.55);
}

.icon-btn {
  flex: 0 0 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  border-radius: 4px;
  cursor: pointer;
}

.icon-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.3);
}

.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
  justify-content: center;
  gap: 6px;
  padding: 10px 20px;
  border: none;
  background: linear-gradient(135deg, #3b82f6, #0ea5e9);
  color: #fff;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.4);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.error {
  margin-top: 12px;
  padding: 10px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: #fca5a5;
  font-size: 13px;
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
