<script setup>
import { reactive, ref } from 'vue'
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
  }
})

const emit = defineEmits(['close', 'showPoint', 'showGrid', 'show-line'])

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
  <div class="calc-content">
    <template v-if="functionName === '点网格化'">
      <div class="tip">
        点击地图可自动填充经纬度和高度
      </div>
      <form class="form" @submit.prevent="submitPointGrid">
        <div class="form-row">
          <label class="form-label" for="pgp-lon">经度</label>
          <input
            id="pgp-lon"
            v-model.number="pointGridForm.longitude"
            type="number"
            step="0.0000000001"
            class="form-input"
            required
          >
        </div>
        <div class="form-row">
          <label class="form-label" for="pgp-lat">纬度</label>
          <input
            id="pgp-lat"
            v-model.number="pointGridForm.latitude"
            type="number"
            step="0.0000000001"
            class="form-input"
            required
          >
        </div>
        <div class="form-row">
          <label class="form-label" for="pgp-height">高度(m)</label>
          <input
            id="pgp-height"
            v-model.number="pointGridForm.height"
            type="number"
            step="0.01"
            class="form-input"
            required
          >
        </div>
        <div class="form-row">
          <label class="form-label" for="pgp-level">层级</label>
          <input
            id="pgp-level"
            v-model.number="pointGridForm.level"
            type="number"
            step="1"
            min="0"
            class="form-input"
            required
          >
        </div>
        <div class="form-actions">
          <button
            type="submit"
            class="btn-primary"
            :disabled="pointGridLoading"
          >
            <Loader2 v-if="pointGridLoading" :size="14" class="spin" />
            {{ pointGridLoading ? '计算中...' : '开始计算' }}
          </button>
        </div>
      </form>
      <div v-if="pointGridError" class="error">{{ pointGridError }}</div>
      <div class="form-actions" style="margin: 12px 0 0; justify-content: flex-end;">
        <button type="button" class="btn-danger" @click="clearGrids">
          <Trash2 :size="14" />
          清除已生成格网
        </button>
      </div>
      <div v-if="pointGridResult" class="result">
        <div class="result-row">
          <span class="result-k">网格编码</span>
          <span class="result-v code">{{ pointGridResult.data?.code }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">中心点</span>
          <span class="result-v">{{ pointGridResult.data?.center?.[0] }}, {{ pointGridResult.data?.center?.[1] }}, {{ pointGridResult.data?.center?.[2] }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">最大纬度</span>
          <span class="result-v">{{ pointGridResult.data?.maxlat }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">最小纬度</span>
          <span class="result-v">{{ pointGridResult.data?.minlat }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">最大经度</span>
          <span class="result-v">{{ pointGridResult.data?.maxlon }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">最小经度</span>
          <span class="result-v">{{ pointGridResult.data?.minlon }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">上边界</span>
          <span class="result-v">{{ pointGridResult.data?.top }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">下边界</span>
          <span class="result-v">{{ pointGridResult.data?.bottom }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">状态</span>
          <span class="result-v">{{ pointGridResult.status }}</span>
        </div>
      </div>
    </template>

    <template v-if="functionName === '点缓冲区（球体）网格化'">
      <div class="tip">
        点击地图可自动填充经纬度和高度
      </div>
      <form class="form" @submit.prevent="submitPointBufferGrid">
        <div class="form-row">
          <label class="form-label" for="pgp-lon2">经度</label>
          <input
            id="pgp-lon2"
            v-model.number="pointGridForm.longitude"
            type="number"
            step="0.0000000001"
            class="form-input"
            required
          >
        </div>
        <div class="form-row">
          <label class="form-label" for="pgp-lat2">纬度</label>
          <input
            id="pgp-lat2"
            v-model.number="pointGridForm.latitude"
            type="number"
            step="0.0000000001"
            class="form-input"
            required
          >
        </div>
        <div class="form-row">
          <label class="form-label" for="pgp-height2">高度(m)</label>
          <input
            id="pgp-height2"
            v-model.number="pointGridForm.height"
            type="number"
            step="0.01"
            class="form-input"
            required
          >
        </div>
        <div class="form-row">
          <label class="form-label" for="pgp-radius">半径(m)</label>
          <input
            id="pgp-radius"
            v-model.number="pointGridForm.radius"
            type="number"
            step="1"
            min="1"
            class="form-input"
            required
          >
        </div>
        <div class="form-row">
          <label class="form-label" for="pgp-level2">层级</label>
          <input
            id="pgp-level2"
            v-model.number="pointGridForm.level"
            type="number"
            step="1"
            min="0"
            class="form-input"
            required
          >
        </div>
        <div class="form-actions">
          <button
            type="submit"
            class="btn-primary"
            :disabled="pointGridLoading"
          >
            <Loader2 v-if="pointGridLoading" :size="14" class="spin" />
            {{ pointGridLoading ? '计算中...' : '开始计算' }}
          </button>
        </div>
        <div class="form-actions" style="margin-top: 12px; justify-content: flex-end;">
          <button type="button" class="btn-danger" @click="clearGrids">
            <Trash2 :size="14" />
            清除已生成格网
          </button>
        </div>
      </form>
      <div v-if="pointGridError" class="error">{{ pointGridError }}</div>
      <div v-if="pointGridResult" class="result result--green">
        <div class="result-row">
          <span class="result-k">网格数量</span>
          <span class="result-v">{{ pointGridResult.data?.cells?.length || 0 }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">状态</span>
          <span class="result-v">{{ pointGridResult.status }}</span>
        </div>
        <div class="result-hint">
          已在地图上绘制返回网格边界
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

    <!-- 清除格网按钮已移至表单内部，始终可见 -->
  </div>
</template>

<style scoped>
.tip {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 14px;
  padding: 8px 12px;
  background: rgba(59, 130, 246, 0.1);
  border-radius: 6px;
  border: 1px solid rgba(59, 130, 246, 0.2);
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
  border-color: #3b82f6;
  background: rgba(99, 102, 241, 0.1);
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

.success-tip {
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(34, 197, 94, 0.1);
  font-size: 12px;
  color: #4ade80;
}

/* 点缓冲区（球体）网格化：绿色底边和绿色字体，与 PolygonGrid 一致 */
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

.result-v.code {
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  color: #93c5fd;
  font-size: 14px;
}

.result-header {
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
  margin: 12px 0 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.result-cell {
  padding: 10px;
  margin-bottom: 10px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  border: 1px solid rgba(59, 130, 246, 0.2);
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
</style>
