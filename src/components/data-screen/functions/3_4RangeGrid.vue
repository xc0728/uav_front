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

// ===== 层级选项 =====
const levelOptions = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]

// ===== 高度快选选项 =====
const heightOptions = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]

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
  <div v-if="functionName === '立方体网格化'" class="range-grid-query">

    <form @submit.prevent="submitRangeGrid">
      <!-- 参数表单 -->
      <div class="form-group">
        <div class="group-title">网格参数</div>
        <div class="param-line">
          <span class="param-label">层级</span>
          <select
            v-model.number="rangeForm.level"
            class="param-select"
            aria-label="层级快选"
          >
            <option v-for="level in levelOptions" :key="level" :value="level">{{ level }}级</option>
          </select>
        </div>
        <div class="param-line">
          <span class="param-label">底面高(m)</span>
          <input
            v-model.number="rangeForm.bottom"
            type="number"
            step="1"
            min="0"
            class="param-input"
            placeholder="底面高度"
            required
          >
          <select
            class="param-select-sm"
            @change="e => { if(e.target.value !== '') rangeForm.bottom = Number(e.target.value); e.target.selectedIndex = 0; }"
            aria-label="底面高快选"
          >
            <option value="">快选</option>
            <option v-for="h in heightOptions" :key="h" :value="h">{{ h }}</option>
          </select>
        </div>
        <div class="param-line">
          <span class="param-label">顶面高(m)</span>
          <input
            v-model.number="rangeForm.top"
            type="number"
            step="1"
            min="0"
            class="param-input"
            placeholder="顶面高度"
            required
          >
          <select
            class="param-select-sm"
            @change="e => { if(e.target.value !== '') rangeForm.top = Number(e.target.value); e.target.selectedIndex = 0; }"
            aria-label="顶面高快选"
          >
            <option value="">快选</option>
            <option v-for="h in heightOptions" :key="h" :value="h">{{ h }}</option>
          </select>
        </div>
      </div>

      <!-- 节点列表 -->
      <div class="form-group">
        <div class="group-title-row">
          <span class="group-title">矩形角点</span>
          <span class="group-sub">({{ cornerPoints.length }}/2)</span>
          <button type="button" class="btn-link-clear" @click="clearAll" :disabled="loading">
            清空
          </button>
        </div>

        <div v-if="cornerPoints.length === 0" class="empty-hint">
          请点击地图绘制矩形（需2个对角点）
        </div>

        <div v-else class="points-list">
          <div v-for="(p, idx) in cornerPoints" :key="idx" class="point-card">
            <div class="point-card-header">
              <span class="point-index">{{ idx === 0 ? '左上' : '右下' }}</span>
              <button type="button" class="btn-point-delete" @click="removeCornerPoint(idx)" title="删除该点" :disabled="loading">
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
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="btn-row">
        <button type="submit" class="btn-query" :disabled="loading || !canSubmit">
          <Loader2 v-if="loading" :size="16" class="spin" />
          {{ loading ? '计算中...' : '开始计算' }}
        </button>
        <button type="button" class="btn-clear" @click="clearGrids">
          <span>清除网格</span>
        </button>
      </div>
    </form>

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
  </div>
</template>

<style scoped>
/* ========== DEM风格样式 ========== */
.range-grid-query {
  padding: 0;
  width: 100%;
  box-sizing: border-box;
  position: relative;
}

/* 表单组 */
.range-grid-query .form-group {
  margin-bottom: 12px;
}

.range-grid-query .group-title {
  font-size: 15px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 8px;
}

.range-grid-query .group-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.range-grid-query .group-title-row .group-title {
  margin-bottom: 0;
}

.range-grid-query .group-sub {
  font-size: 13px;
  color: #64748b;
}

.range-grid-query .btn-link-clear {
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

.range-grid-query .btn-link-clear:hover:not(:disabled) {
  background: #f5f3f0;
  color: #334155;
}

.range-grid-query .btn-link-clear:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 参数行 */
.range-grid-query .param-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.range-grid-query .param-line:last-child {
  margin-bottom: 0;
}

.range-grid-query .param-label {
  width: 70px;
  font-size: 14px;
  color: #334155;
  flex-shrink: 0;
}

.range-grid-query .param-input {
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
  transition: border-color 0.15s ease;
}

.range-grid-query .param-input:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
}

.range-grid-query .param-select {
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

.range-grid-query .param-select:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
}

.range-grid-query .param-select-sm {
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

.range-grid-query .param-select-sm:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
}

/* 空状态 */
.range-grid-query .empty-hint {
  padding: 14px;
  text-align: center;
  color: #64748b;
  font-size: 14px;
  border: 1px dashed #d4c9b8;
  border-radius: 8px;
}

/* 点列表 */
.range-grid-query .points-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
}

.range-grid-query .point-card {
  padding: 8px;
  background: #ffffff;
  border: 1px solid #ebe6df;
  border-radius: 8px;
  transition: border-color 0.15s ease;
}

.range-grid-query .point-card:hover {
  border-color: #d4c9b8;
}

.range-grid-query .point-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.range-grid-query .point-index {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.range-grid-query .btn-point-delete {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: #fef2f2;
  color: #dc2626;
  cursor: pointer;
  transition: background 0.15s ease;
}

.range-grid-query .btn-point-delete:hover:not(:disabled) {
  background: #fee2e2;
}

.range-grid-query .btn-point-delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.range-grid-query .point-fields {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.range-grid-query .field {
  display: flex;
  align-items: center;
  gap: 4px;
}

.range-grid-query .field-label {
  flex: 0 0 44px;
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
}

.range-grid-query .field-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 12px;
  box-sizing: border-box;
}

.range-grid-query .field-input:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 2px rgba(91, 159, 212, 0.12);
}

/* 按钮行 */
.range-grid-query .btn-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.range-grid-query .btn-query {
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
  transition: background 0.15s ease;
}

.range-grid-query .btn-query:hover:not(:disabled) {
  background: linear-gradient(135deg, #6aa8d4, #4a8fc4);
}

.range-grid-query .btn-query:disabled {
  background: #e2e8f0;
  color: #94a3b8;
  cursor: not-allowed;
}

.range-grid-query .btn-clear {
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
  transition: background 0.15s ease;
}

.range-grid-query .btn-clear:hover {
  background: #e8e8e8;
}

/* 错误提示 */
.range-grid-query .error-box {
  padding: 10px 12px;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  background: #fef2f2;
  font-size: 14px;
  color: #dc2626;
  margin-bottom: 10px;
}

/* 结果区 */
.range-grid-query .result-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.range-grid-query .result-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  background: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 6px;
}

.range-grid-query .result-label {
  font-size: 13px;
  color: #64748b;
}

.range-grid-query .result-num {
  font-size: 14px;
  font-weight: 500;
  color: #334155;
}

.range-grid-query .result-status {
  font-size: 14px;
  font-weight: 500;
}

.range-grid-query .result-status.success {
  color: #059669;
}

/* 加载动画 */
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
