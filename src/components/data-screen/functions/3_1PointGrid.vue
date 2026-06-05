<script setup>
import { computed, reactive, ref } from 'vue'
import { Loader2, Trash2 } from 'lucide-vue-next'
import LineGrid from './3_2LineGrid.vue'

const props = defineProps({
  serviceName: {
    type: String,
    default: '立体导航网格剖分计算服务'
  },
  functionName: {
    type: String,
    required: true
  },
  theme: {
    type: String,
    default: 'white'
  }
})

const emit = defineEmits(['close', 'showPoint', 'showGrid', 'show-line'])

const isTechBlueTheme = computed(() => props.theme === 'techBlue')

// 清除已生成的格网和中心点
function clearGrids() {
  emit('showGrid', { cells: [] })
  // 清除中心点
  emit('showPoint', null)
}

const pointGridForm = reactive({
  longitude: 119.97336453966625,
  latitude: 30.51992806843684,
  height: 100,
  level: 14,
  radius: 30,
})

// 高度快选选项
const heightOptions = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]

// 层级选项
const levelOptions = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]

// 半径快选选项
const radiusOptions = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]

function onHeightPresetChange(event) {
  const val = event.target.value
  if (val !== '') {
    pointGridForm.height = Number(val)
  }
  event.target.selectedIndex = 0
}

function onRadiusPresetChange(event) {
  const val = event.target.value
  if (val !== '') {
    pointGridForm.radius = Number(val)
  }
  event.target.selectedIndex = 0
}
const pointGridLoading = ref(false)
const pointGridError = ref('')
const pointGridResult = ref(null)

const lineGridRef = ref(null)

function setPointFromMap(lon, lat, height) {
  if (props.functionName === '三维线网格化' || props.functionName === '线矩形缓冲区（管道）网格化') {
    if (typeof lineGridRef.value?.setPointFromMap === 'function') {
      lineGridRef.value.setPointFromMap(lon, lat, height)
    }
    return
  }
  // 保持高精度以满足计算精度要求
  pointGridForm.longitude = lon
  pointGridForm.latitude = lat
  if (height !== undefined && height !== null) {
    pointGridForm.height = height
  }
}

function resetForm() {
  if (props.functionName === '三维线网格化' || props.functionName === '线矩形缓冲区（管道）网格化') {
    if (typeof lineGridRef.value?.resetForm === 'function') {
      lineGridRef.value.resetForm()
    }
    return
  }
  if (props.functionName === '点网格化' || props.functionName === '点缓冲区（球体）网格化') {
    pointGridError.value = ''
    pointGridResult.value = null
  }
}

defineExpose({ resetForm, setPointFromMap })

async function submitPointGrid() {
  pointGridError.value = ''
  pointGridResult.value = null
  pointGridLoading.value = true

  try {
    const payload = {
      longitude: Number(pointGridForm.longitude),
      latitude: Number(pointGridForm.latitude),
      height: Number(pointGridForm.height),
      level: Number(pointGridForm.level),
    }

    const resp = await fetch('/api/multiSource/basicGrid/getGridByPoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) throw new Error(`请求失败，状态码 ${resp.status}`)

    const data = await resp.json()
    pointGridResult.value = data

    // 计算成功后，在地图上显示中心点和网格范围
    if (data.data) {
      const gridData = data.data
      const center = gridData.center

      // 发送中心点事件
      if (center && center.length >= 3) {
        emit('showPoint', {
          longitude: center[0],
          latitude: center[1],
          height: center[2],
        })
      }

      // 发送网格边界事件
      emit('showGrid', {
        center: center ? {
          longitude: center[0],
          latitude: center[1],
          height: center[2] || 0,
        } : null,
        bounds: {
          north: gridData.maxlat,
          south: gridData.minlat,
          east: gridData.maxlon,
          west: gridData.minlon,
          top: gridData.top,
          bottom: gridData.bottom,
        },
      })
    }
  } catch (err) {
    pointGridError.value = err?.message || '请求失败，请稍后重试'
  } finally {
    pointGridLoading.value = false
  }
}

async function submitPointBufferGrid() {
  pointGridError.value = ''
  pointGridResult.value = null

  // 验证：半径必须小于等于高度，否则会有网格位于地平线以下导致计算错误
  if (pointGridForm.radius > pointGridForm.height) {
    pointGridError.value = `半径（${pointGridForm.radius}m）不能大于高度（${pointGridForm.height}m），否则会有网格位于地平线以下导致计算错误`
    return
  }

  pointGridLoading.value = true

  try {
    const payload = {
      lon: Number(pointGridForm.longitude),
      lat: Number(pointGridForm.latitude),
      height: Number(pointGridForm.height),
      radius: Number(pointGridForm.radius),
      level: Number(pointGridForm.level),
    }

    const resp = await fetch('/api/multiSource/geometricGrid/getGridByPointAndRadius', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) throw new Error(`请求失败，状态码 ${resp.status}`)

    const data = await resp.json()
    pointGridResult.value = data

    // 计算成功后，在地图上显示所有网格边界
    if (data.data && data.data.cells && data.data.cells.length > 0) {
      const MAX_CELLS = 10000
      const cells = data.data.cells.slice(0, MAX_CELLS)

      // 发送网格边界事件（包含多个网格）
      emit('showGrid', {
        cells: cells.map(cell => ({
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
    pointGridError.value = err?.message || '请求失败，请稍后重试'
  } finally {
    pointGridLoading.value = false
  }
}
</script>

<template>
  <div class="point-grid-query techblue-aware" :class="{ 'theme-tech-blue': isTechBlueTheme }">
    <!-- 点网格化 -->
    <template v-if="functionName === '点网格化'">
      <div class="hint-box">
        <span>点击地图可自动填充经纬度和高度</span>
      </div>

      <!-- 参数表单 -->
      <div class="form-group">
        <div class="group-title">网格参数</div>
        <div class="param-line">
          <span class="param-label">经度</span>
          <input
            v-model.number="pointGridForm.longitude"
            type="number"
            step="0.0000000001"
            class="param-input"
          >
        </div>
        <div class="param-line">
          <span class="param-label">纬度</span>
          <input
            v-model.number="pointGridForm.latitude"
            type="number"
            step="0.0000000001"
            class="param-input"
          >
        </div>
        <div class="param-line">
          <span class="param-label">高度(m)</span>
          <input
            v-model.number="pointGridForm.height"
            type="number"
            step="0.01"
            class="param-input"
          >
          <select
            class="field-preset-select"
            aria-label="高度快选"
            @change="onHeightPresetChange"
          >
            <option value="">快选</option>
            <option v-for="h in heightOptions" :key="h" :value="h">
              {{ h }}
            </option>
          </select>
        </div>
        <div class="param-line">
          <span class="param-label">层级</span>
          <select v-model.number="pointGridForm.level" class="param-select">
            <option v-for="lvl in levelOptions" :key="lvl" :value="lvl">第 {{ lvl }} 级</option>
          </select>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="btn-row">
        <button class="btn-query" @click="submitPointGrid" :disabled="pointGridLoading">
          <Loader2 v-if="pointGridLoading" :size="16" class="spin" />
          {{ pointGridLoading ? '计算中...' : '开始计算' }}
        </button>
        <button class="btn-clear" @click="clearGrids">
          <span>清除网格</span>
        </button>
      </div>

      <!-- 错误提示 -->
      <div v-if="pointGridError" class="error-box">{{ pointGridError }}</div>

      <!-- 查询结果 -->
      <div v-if="pointGridResult" class="result-box">
        <div class="result-row">
          <span class="result-label">网格编码</span>
          <span class="result-num code">{{ pointGridResult.data?.code }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">中心点</span>
          <span class="result-num">
            {{ pointGridResult.data?.center?.[0]?.toFixed(6) }}, 
            {{ pointGridResult.data?.center?.[1]?.toFixed(6) }}, 
            {{ pointGridResult.data?.center?.[2]?.toFixed(1) }}
          </span>
        </div>
        <div class="result-row">
          <span class="result-label">边界范围</span>
          <span class="result-num">
            经度 {{ pointGridResult.data?.minlon?.toFixed(6) }} ~ {{ pointGridResult.data?.maxlon?.toFixed(6) }}<br>
            纬度 {{ pointGridResult.data?.minlat?.toFixed(6) }} ~ {{ pointGridResult.data?.maxlat?.toFixed(6) }}<br>
            高度 {{ pointGridResult.data?.bottom?.toFixed(1) }} ~ {{ pointGridResult.data?.top?.toFixed(1) }}m
          </span>
        </div>
        <div class="result-row">
          <span class="result-label">状态</span>
          <span class="result-status success">{{ pointGridResult.status }}</span>
        </div>
      </div>
    </template>

    <!-- 点缓冲区（球体）网格化 -->
    <template v-if="functionName === '点缓冲区（球体）网格化'">
      <div class="hint-box">
        <span>点击地图可自动填充经纬度和高度</span>
      </div>

      <!-- 参数表单 -->
      <div class="form-group">
        <div class="group-title">网格参数</div>
        <div class="param-line">
          <span class="param-label">经度</span>
          <input
            v-model.number="pointGridForm.longitude"
            type="number"
            step="0.0000000001"
            class="param-input"
          >
        </div>
        <div class="param-line">
          <span class="param-label">纬度</span>
          <input
            v-model.number="pointGridForm.latitude"
            type="number"
            step="0.0000000001"
            class="param-input"
          >
        </div>
        <div class="param-line">
          <span class="param-label">高度(m)</span>
          <input
            v-model.number="pointGridForm.height"
            type="number"
            step="0.01"
            class="param-input"
          >
          <select
            class="field-preset-select"
            aria-label="高度快选"
            @change="onHeightPresetChange"
          >
            <option value="">快选</option>
            <option v-for="h in heightOptions" :key="h" :value="h">
              {{ h }}
            </option>
          </select>
        </div>
        <div v-if="pointGridForm.radius > pointGridForm.height" class="radius-error-tip">
          半径（{{ pointGridForm.radius }}m）不能大于高度（{{ pointGridForm.height }}m）
        </div>
        <div class="param-line">
          <span class="param-label">半径(m)</span>
          <input
            v-model.number="pointGridForm.radius"
            type="number"
            step="1"
            min="1"
            class="param-input"
          >
          <select
            class="field-preset-select"
            aria-label="半径快选"
            @change="onRadiusPresetChange"
          >
            <option value="">快选</option>
            <option v-for="r in radiusOptions" :key="r" :value="r">
              {{ r }}
            </option>
          </select>
        </div>
        <div class="param-line">
          <span class="param-label">层级</span>
          <select v-model.number="pointGridForm.level" class="param-select">
            <option v-for="lvl in levelOptions" :key="lvl" :value="lvl">第 {{ lvl }} 级</option>
          </select>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="btn-row">
        <button 
          class="btn-query" 
          @click="submitPointBufferGrid" 
          :disabled="pointGridLoading || pointGridForm.radius > pointGridForm.height"
        >
          <Loader2 v-if="pointGridLoading" :size="16" class="spin" />
          {{ pointGridLoading ? '计算中...' : '开始计算' }}
        </button>
        <button class="btn-clear" @click="clearGrids">
          <span>清除网格</span>
        </button>
      </div>

      <!-- 错误提示 -->
      <div v-if="pointGridError" class="error-box">{{ pointGridError }}</div>

      <!-- 查询结果 -->
      <div v-if="pointGridResult" class="result-box">
        <div class="result-row">
          <span class="result-label">网格数量</span>
          <span class="result-num">{{ pointGridResult.data?.cells?.length || 0 }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">状态</span>
          <span class="result-status success">{{ pointGridResult.status }}</span>
        </div>
      </div>
    </template>

    <LineGrid
      v-else-if="functionName === '三维线网格化' || functionName === '线矩形缓冲区（管道）网格化'"
      ref="lineGridRef"
      :service-name="serviceName"
      :function-name="functionName"
      @show-grid="(v) => emit('showGrid', v)"
      @show-line="(v) => emit('show-line', v)"
    />
  </div>
</template>

<style scoped>
.point-grid-query {
  padding: 0;
  width: 100%;
  box-sizing: border-box;
  position: relative;
}

/* 科技蓝主题下的参数标题增强 */
.point-grid-query.theme-tech-blue .group-title,
.point-grid-query.theme-tech-blue .param-label {
  color: #ecfbff;
  text-shadow: 0 0 10px rgba(184, 246, 255, 0.18);
}

.point-grid-query.theme-tech-blue .group-title {
  font-weight: 700;
}

.point-grid-query.theme-tech-blue .hint-box {
  color: #d7f5ff;
  background: rgba(10, 48, 92, 0.82);
  border-color: rgba(97, 218, 251, 0.26);
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

.field-preset-select {
  width: 70px;
  min-width: 70px;
  height: 34px;
  padding: 0 24px 0 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 14px;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
}

.field-preset-select:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
}

.param-select {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 24px 0 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 14px;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}

.param-select:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
}

/* 错误提示 */
.radius-error-tip {
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
  word-break: break-all;
}

.result-num.code {
  font-family: 'Monaco', 'Consolas', monospace;
}

.result-status {
  font-size: 14px;
  font-weight: 500;
}

.result-status.success {
  color: #059669;
}

/* 以下是旧样式，保留兼容 */
.tip {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 14px;
  padding: 8px 12px;
  background: #eef6fc;
  border-radius: 6px;
  border: 1px solid #bfdbfe;
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
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #334155;
  font-size: 14px;
  outline: none;
  transition: all 0.15s ease;
}

.form-input:focus {
  border-color: #7db8e0;
  background: #ffffff;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 6px;
}

.btn-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 22px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, #7db8e0, #5b9fd4);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(91, 159, 212, 0.25);
}

.btn-primary:disabled {
  opacity: 0.7;
  cursor: default;
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

.success-tip {
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(34, 197, 94, 0.1);
  font-size: 12px;
  color: #4ade80;
}

.result--green {
  margin-top: 16px;
  padding: 14px;
  background: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(34, 197, 94, 0.2);
  border-radius: 8px;
}

.result--green .result-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 13px;
}

.result--green .result-k {
  color: #64748b;
}

.result--green .result-v {
  color: #86efac;
  font-weight: 500;
}

.result--green .result-hint {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(34, 197, 94, 0.2);
  font-size: 12px;
  color: #86efac;
  text-align: center;
}

.result {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.result-header {
  font-size: 14px;
  font-weight: 600;
  color: #475569;
  margin: 12px 0 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.result-cell {
  padding: 10px;
  margin-bottom: 10px;
  background: #ffffff;
  border-radius: 8px;
  border: 1px solid #bfdbfe;
}

.result-cell-title {
  font-size: 13px;
  font-weight: 600;
  color: #93c5fd;
  margin-bottom: 8px;
}

.btn-danger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #475569;
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
</style>
