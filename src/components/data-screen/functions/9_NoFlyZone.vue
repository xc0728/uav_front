<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Loader2, Trash2 } from 'lucide-vue-next'

const props = defineProps({
  serviceName: {
    type: String,
    default: '禁飞区设置服务'
  },
  functionName: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['close', 'showPoint', 'showGrid', 'show-polygon', 'get-view-bounds'])

const noFlyZoneForm = reactive({
  name: '',
  typeCode: 'electronic_fence',
  level: 14,
  bottom: 0,
  top: 120,
  description: '',
})

const points = ref([])
const loading = ref(false)
const error = ref('')
const result = ref(null)
const hasVisualization = ref(false)

const typeCodeOptions = [
  { value: 'electronic_fence', label: '电子围栏' },
  { value: 'risk_area', label: '风险区域' },
]

const levelOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]
const heightOptions = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]

const canSubmit = computed(() => {
  if (!noFlyZoneForm.name.trim()) return false
  if (!noFlyZoneForm.typeCode) return false
  if (!Number.isFinite(Number(noFlyZoneForm.level))) return false
  if (!Number.isFinite(Number(noFlyZoneForm.bottom))) return false
  if (!Number.isFinite(Number(noFlyZoneForm.top))) return false
  if (Number(noFlyZoneForm.top) <= Number(noFlyZoneForm.bottom)) return false
  if (points.value.length < 3) return false
  return true
})

function normalizePoint(p) {
  const lon = Number(Number(p.lon).toFixed(10))
  const lat = Number(Number(p.lat).toFixed(10))
  const height = Number(Number(p.height ?? 0).toFixed(1))
  return { lon, lat, height }
}

function emitPolygon() {
  emit(
    'show-polygon',
    points.value.map(normalizePoint),
  )
}

function setPointFromMap(lon, lat, height) {
  points.value.push(normalizePoint({ lon, lat, height }))
  emitPolygon()
}

function removePoint(idx) {
  points.value.splice(idx, 1)
  emitPolygon()
}

function clearAll() {
  points.value = []
  result.value = null
  error.value = ''
  hasVisualization.value = false
  emitPolygon()
}

function resetForm() {
  loading.value = false
  error.value = ''
  result.value = null
  hasVisualization.value = false
  noFlyZoneForm.name = ''
  noFlyZoneForm.typeCode = 'electronic_fence'
  noFlyZoneForm.level = 14
  noFlyZoneForm.bottom = 0
  noFlyZoneForm.top = 120
  noFlyZoneForm.description = ''
  points.value = []
  emit('show-polygon', [])
}

function clearVisualization() {
  hasVisualization.value = false
  emit('show-polygon', [])
}

function visualizeNoFlyZone(data) {
  hasVisualization.value = true

  emit('show-polygon', [])

  const boundary = data.boundary || data.data?.boundary
  const bottom = Number(data.bottom ?? data.data?.bottom ?? 0)
  const top = Number(data.top ?? data.data?.top ?? 120)

  if (boundary && Array.isArray(boundary) && boundary.length >= 3) {
    const polygonPoints = boundary.map(coord => ({
      lon: Number(coord[0]),
      lat: Number(coord[1]),
    }))
    emit('show-polygon', {
      type: 'noFlyZone',
      points: polygonPoints,
      bottom: bottom,
      top: top,
      color: '#ef4444',
    })
  }
}

watch(
  () => points,
  () => {
    emitPolygon()
  },
  { deep: true },
)

defineExpose({ resetForm, setPointFromMap })

async function submitSaveNoFlyZone() {
  error.value = ''
  result.value = null
  loading.value = true

  try {
    const boundary = points.value.map(p => [Number(p.lon), Number(p.lat)])

    if (boundary.length < 3) throw new Error('请至少选择 3 个点组成多边形边界')

    const payload = {
      name: noFlyZoneForm.name.trim(),
      typeCode: noFlyZoneForm.typeCode,
      level: Number(noFlyZoneForm.level),
      bottom: parseFloat(Number(noFlyZoneForm.bottom).toFixed(1)),
      top: parseFloat(Number(noFlyZoneForm.top).toFixed(1)),
      boundary: boundary,
    }

    if (noFlyZoneForm.description.trim()) {
      payload.description = noFlyZoneForm.description.trim()
    }

    console.log('[保存禁飞区] 发送 payload:', payload)

    const resp = await fetch('/api/multiSource/airSpace/noFlyZone/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error('[保存禁飞区] 错误响应:', errText)
      throw new Error(`请求失败，状态码 ${resp.status}: ${errText}`)
    }

    const data = await resp.json()
    result.value = data
    console.log('[保存禁飞区] 返回:', data)

    if (data?.status === 'success') {
      visualizeNoFlyZone(data.data || data)
    }
  } catch (err) {
    console.error('[保存禁飞区] 请求错误:', err)
    error.value = err?.message || '请求失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="no-fly-zone polygon-grid-query">
    <form @submit.prevent="submitSaveNoFlyZone">
      <div class="form-group">
        <div class="group-title">基本信息</div>
        <div class="param-line">
          <span class="param-label">名称</span>
          <input
            v-model="noFlyZoneForm.name"
            type="text"
            class="param-input"
            placeholder="请输入禁飞区名称"
            required
          >
        </div>
        <div class="param-line">
          <span class="param-label">类型</span>
          <select
            v-model="noFlyZoneForm.typeCode"
            class="param-select"
            aria-label="禁飞区类型"
          >
            <option v-for="opt in typeCodeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
        <div class="param-line">
          <span class="param-label">描述</span>
          <input
            v-model="noFlyZoneForm.description"
            type="text"
            class="param-input"
            placeholder="可选，禁飞区描述"
          >
        </div>
      </div>

      <div class="form-group">
        <div class="group-title">网格参数</div>
        <div class="param-line">
          <span class="param-label">层级</span>
          <select
            v-model.number="noFlyZoneForm.level"
            class="param-select"
            aria-label="层级选择"
          >
            <option v-for="level in levelOptions" :key="level" :value="level">{{ level }}级</option>
          </select>
        </div>
        <div class="param-line">
          <span class="param-label">底面高(m)</span>
          <input
            v-model.number="noFlyZoneForm.bottom"
            type="number"
            step="any"
            min="0"
            class="param-input"
            placeholder="底面高度"
            required
          >
          <select
            class="param-select-sm"
            @change="e => { if(e.target.value !== '') noFlyZoneForm.bottom = Number(e.target.value); e.target.selectedIndex = 0; }"
            aria-label="底面高快选"
          >
            <option value="">快选</option>
            <option v-for="h in heightOptions" :key="h" :value="h">{{ h }}</option>
          </select>
        </div>
        <div class="param-line">
          <span class="param-label">顶面高(m)</span>
          <input
            v-model.number="noFlyZoneForm.top"
            type="number"
            step="any"
            min="0"
            class="param-input"
            placeholder="顶面高度"
            required
          >
          <select
            class="param-select-sm"
            @change="e => { if(e.target.value !== '') noFlyZoneForm.top = Number(e.target.value); e.target.selectedIndex = 0; }"
            aria-label="顶面高快选"
          >
            <option value="">快选</option>
            <option v-for="h in heightOptions" :key="h" :value="h">{{ h }}</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <div class="group-title-row">
          <span class="group-title">边界节点</span>
          <span class="group-sub">({{ points.length }})</span>
          <button type="button" class="btn-link-clear" @click="clearAll" :disabled="loading">
            清空
          </button>
        </div>

        <div v-if="points.length === 0" class="empty-hint">
          请点击地图添加点（至少 3 个）
        </div>

        <div v-else class="points-list">
          <div v-for="(p, idx) in points" :key="idx" class="point-card">
            <div class="point-card-header">
              <span class="point-index">{{ idx + 1 }}</span>
              <button type="button" class="btn-point-delete" @click="removePoint(idx)" title="删除该点" :disabled="loading">
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
            </div>
          </div>
        </div>
      </div>

      <div class="btn-row">
        <button type="submit" class="btn-query" :disabled="loading || !canSubmit">
          <Loader2 v-if="loading" :size="16" class="spin" />
          {{ loading ? '保存中...' : '保存' }}
        </button>
        <button type="button" class="btn-clear" @click="clearVisualization" :disabled="!hasVisualization">
          清除
        </button>
      </div>
    </form>

    <div v-if="error" class="error-box">{{ error }}</div>

    <div v-if="result" class="result-box">
      <div class="result-row">
        <span class="result-label">状态</span>
        <span class="result-status" :class="result?.status === 'success' ? 'success' : ''">
          {{ result?.status === 'success' ? '保存成功' : result?.status || '完成' }}
        </span>
      </div>
      <div v-if="result?.zone_id" class="result-row">
        <span class="result-label">区域ID</span>
        <span class="result-num">{{ result.zone_id }}</span>
      </div>
      <div v-if="result?.name" class="result-row">
        <span class="result-label">名称</span>
        <span class="result-num">{{ result.name }}</span>
      </div>
      <div v-if="result?.type_name" class="result-row">
        <span class="result-label">类型</span>
        <span class="result-num">{{ result.type_name }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.no-fly-zone {
  padding: 0;
  width: 100%;
  box-sizing: border-box;
  position: relative;
}

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
  transition: border-color 0.15s ease;
}

.param-input:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
}

.param-input::placeholder {
  color: #999;
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

.empty-hint {
  padding: 14px;
  text-align: center;
  color: #64748b;
  font-size: 14px;
  border: 1px dashed #d4c9b8;
  border-radius: 8px;
}

.points-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
}

.point-card {
  padding: 8px;
  background: #ffffff;
  border: 1px solid #ebe6df;
  border-radius: 8px;
  transition: border-color 0.15s ease;
}

.point-card:hover {
  border-color: #d4c9b8;
}

.point-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.point-index {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.btn-point-delete {
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

.btn-point-delete:hover:not(:disabled) {
  background: #fee2e2;
}

.btn-point-delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.point-fields {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field {
  display: flex;
  align-items: center;
  gap: 4px;
}

.field-label {
  flex: 0 0 44px;
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
}

.field-input {
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

.field-input:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 2px rgba(91, 159, 212, 0.12);
}

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
  transition: background 0.15s ease;
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
  transition: background 0.15s ease;
}

.btn-clear:hover:not(:disabled) {
  background: #e8e8e8;
}

.btn-clear:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
