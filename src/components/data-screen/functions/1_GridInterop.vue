<script setup>
import { reactive, ref } from 'vue'
import { Loader2, Trash2 } from 'lucide-vue-next'

const props = defineProps({
  serviceName: {
    type: String,
    default: '立体导航网格互操作数据融合服务'
  },
  functionName: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['close', 'showPoint', 'showGrid'])

// 清除已生成的格网
function clearGrids() {
  emit('showGrid', { cells: [] })
}

// 经纬度高转网格编码
const pointToGridForm = reactive({
  longitude: 119.97336453966625,
  latitude: 30.51992806843684,
  height: 100,
  level: 14,
})
const pointToGridLoading = ref(false)
const pointToGridError = ref('')
const pointToGridResult = ref(null)

// 网格编码转网格中心
const gridCenterForm = reactive({
  gridCode: '30122030411',
})
const gridCenterLoading = ref(false)
const gridCenterError = ref('')
const gridCenterResult = ref(null)

// 网格编码计算子网格
const childGridForm = reactive({
  gridCode: '30122000151530',
})
const childGridLoading = ref(false)
const childGridError = ref('')
const childGridResult = ref(null)

// 网格编码求指定层级父网格
const parentGridForm = reactive({
  gridCode: '121212130121113623105',
  level: 14,
})
const parentGridLoading = ref(false)
const parentGridError = ref('')
const parentGridResult = ref(null)

// 局部网格编码转全局网格编码
const localToGlobalForm = reactive({
  localCode: '30121113623105',
})
const localToGlobalLoading = ref(false)
const localToGlobalError = ref('')
const localToGlobalResult = ref(null)

// 网格编码获取网格信息
const gridInfoForm = reactive({
  gridCode: '30122000151530',
})
const gridInfoLoading = ref(false)
const gridInfoError = ref('')
const gridInfoResult = ref(null)

function resetForm() {
  if (props.functionName === '经纬度高转网格编码') {
    pointToGridError.value = ''
    pointToGridResult.value = null
  } else if (props.functionName === '网格编码转网格中心') {
    gridCenterError.value = ''
    gridCenterResult.value = null
  } else if (props.functionName === '网格编码计算子网格') {
    childGridError.value = ''
    childGridResult.value = null
  } else if (props.functionName === '网格编码求指定层级父网格') {
    parentGridError.value = ''
    parentGridResult.value = null
  } else if (props.functionName === '局部网格编码转全局网格编码') {
    localToGlobalError.value = ''
    localToGlobalResult.value = null
  } else if (props.functionName === '网格编码获取网格信息') {
    gridInfoError.value = ''
    gridInfoResult.value = null
  }
}

function setPointFromMap(lon, lat, height) {
  if (props.functionName !== '经纬度高转网格编码') return
  // 经纬度保留 10 位小数，避免精度过高导致后端计算异常
  if (lon !== undefined && lon !== null) {
    pointToGridForm.longitude = Number(Number(lon).toFixed(10))
  }
  if (lat !== undefined && lat !== null) {
    pointToGridForm.latitude = Number(Number(lat).toFixed(10))
  }
  if (height !== undefined && height !== null && height > 0) {
    // 高度保留 2 位小数
    pointToGridForm.height = Number(Number(height).toFixed(2))
  }
}

defineExpose({ resetForm, setPointFromMap })

async function submitPointToGrid() {
  pointToGridError.value = ''
  pointToGridResult.value = null
  pointToGridLoading.value = true

  try {
    const payload = {
      longitude: Number(pointToGridForm.longitude),
      latitude: Number(pointToGridForm.latitude),
      height: Number(pointToGridForm.height),
      level: Number(pointToGridForm.level),
    }
    console.log('[经纬度高转网格编码] 发送 payload:', payload)
    console.log('[经纬度高转网格编码] 各字段类型:', {
      longitude: typeof payload.longitude,
      latitude: typeof payload.latitude,
      height: typeof payload.height,
      level: typeof payload.level,
    })

    const resp = await fetch('/api/multiSource/basicGrid/getGridCodeByPoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error('[经纬度高转网格编码] 错误响应:', errText)
      throw new Error(`请求失败，状态码 ${resp.status}: ${errText}`)
    }

    const data = await resp.json()
    pointToGridResult.value = data
  } catch (err) {
    console.error('[经纬度高转网格编码] 请求错误:', err)
    pointToGridError.value = err?.message || '请求失败，请稍后重试'
  } finally {
    pointToGridLoading.value = false
  }
}

async function submitGridCenter() {
  gridCenterError.value = ''
  gridCenterResult.value = null
  gridCenterLoading.value = true

  try {
    const payload = { gridCode: String(gridCenterForm.gridCode || '').trim() }
    if (!payload.gridCode) throw new Error('请先填写网格编码')

    const resp = await fetch('/api/multiSource/basicGrid/getCenterByGrid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) throw new Error(`请求失败，状态码 ${resp.status}`)

    const data = await resp.json()
    console.log('[网格中心计算] 原始返回:', data)
    gridCenterResult.value = data

    // 计算成功后，通知父组件在地图上显示该中心点
    // 后端返回结构: { status: "success", data: { longitude, latitude, height, ... } }
    if (data?.data) {
      const center = data.data
      console.log('[网格中心计算] 准备发送 showPoint 事件:', center)
      emit('showPoint', {
        longitude: center.longitude,
        latitude: center.latitude,
        height: center.height || 0,
      })
    }
  } catch (err) {
    gridCenterError.value = err?.message || '请求失败，请稍后重试'
  } finally {
    gridCenterLoading.value = false
  }
}

async function submitChildGrid() {
  childGridError.value = ''
  childGridResult.value = null
  childGridLoading.value = true

  try {
    const payload = { gridCode: String(childGridForm.gridCode || '').trim() }
    if (!payload.gridCode) throw new Error('请先填写网格编码')

    const resp = await fetch('/api/multiSource/basicGrid/getChildCode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) throw new Error(`请求失败，状态码 ${resp.status}`)

    const data = await resp.json()
    childGridResult.value = data
  } catch (err) {
    childGridError.value = err?.message || '请求失败，请稍后重试'
  } finally {
    childGridLoading.value = false
  }
}

async function submitParentGrid() {
  parentGridError.value = ''
  parentGridResult.value = null
  parentGridLoading.value = true

  try {
    const payload = {
      gridCode: String(parentGridForm.gridCode || '').trim(),
      level: Number(parentGridForm.level),
    }
    if (!payload.gridCode) throw new Error('请先填写网格编码')
    if (Number.isNaN(payload.level)) throw new Error('请先填写层级(level)')

    const resp = await fetch('/api/multiSource/basicGrid/getLevelFatherCode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) throw new Error(`请求失败，状态码 ${resp.status}`)

    const data = await resp.json()
    parentGridResult.value = data
  } catch (err) {
    parentGridError.value = err?.message || '请求失败，请稍后重试'
  } finally {
    parentGridLoading.value = false
  }
}

async function submitLocalToGlobal() {
  localToGlobalError.value = ''
  localToGlobalResult.value = null
  localToGlobalLoading.value = true

  try {
    const payload = { localCode: String(localToGlobalForm.localCode || '').trim() }
    if (!payload.localCode) throw new Error('请先填写局部网格编码')

    const resp = await fetch('/api/multiSource/basicGrid/getLocalToGlobal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) throw new Error(`请求失败，状态码 ${resp.status}`)

    const data = await resp.json()
    localToGlobalResult.value = data
  } catch (err) {
    localToGlobalError.value = err?.message || '请求失败，请稍后重试'
  } finally {
    localToGlobalLoading.value = false
  }
}

async function submitGridInfo() {
  gridInfoError.value = ''
  gridInfoResult.value = null
  gridInfoLoading.value = true

  try {
    const payload = { gridCode: String(gridInfoForm.gridCode || '').trim() }
    if (!payload.gridCode) throw new Error('请先填写网格编码')

    const resp = await fetch('/api/multiSource/basicGrid/getGridBoundaryByCode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) throw new Error(`请求失败，状态码 ${resp.status}`)

    const data = await resp.json()
    gridInfoResult.value = data

    // 计算成功后，通知父组件在地图上显示网格和中心点
    // 后端返回结构: { status: "success", data: { center: { longitude, latitude, height }, north, south, east, west, top, bottom, ... } }
    if (data?.data) {
      const gridData = data.data
      const center = gridData.center
      emit('showGrid', {
        center: center ? {
          longitude: center.longitude,
          latitude: center.latitude,
          height: center.height || 0,
        } : null,
        bounds: {
          north: gridData.north,
          south: gridData.south,
          east: gridData.east,
          west: gridData.west,
          top: gridData.top,
          bottom: gridData.bottom,
        },
      })
    }
  } catch (err) {
    gridInfoError.value = err?.message || '请求失败，请稍后重试'
  } finally {
    gridInfoLoading.value = false
  }
}
</script>

<template>
  <div class="calc-content">
    <div class="form-actions" style="margin-bottom: 16px;">
      <button type="button" class="btn-danger" @click="clearGrids">
        <Trash2 :size="14" />
        清除已生成格网
      </button>
    </div>

    <!-- 经纬度高转网格编码 -->
    <template v-if="functionName === '经纬度高转网格编码'">
      <form class="form" @submit.prevent="submitPointToGrid">
        <div class="form-row">
          <label class="form-label" for="ptg-lon">经度</label>
          <input
            id="ptg-lon"
            v-model.number="pointToGridForm.longitude"
            type="number"
            step="0.0000000001"
            class="form-input"
            required
          >
        </div>
        <div class="form-row">
          <label class="form-label" for="ptg-lat">纬度</label>
          <input
            id="ptg-lat"
            v-model.number="pointToGridForm.latitude"
            type="number"
            step="0.0000000001"
            class="form-input"
            required
          >
        </div>
        <div class="form-row">
          <label class="form-label" for="ptg-height">高度(m)</label>
          <input
            id="ptg-height"
            v-model.number="pointToGridForm.height"
            type="number"
            step="0.01"
            class="form-input"
            required
          >
        </div>
        <div class="form-row">
          <label class="form-label" for="ptg-level">层级</label>
          <input
            id="ptg-level"
            v-model.number="pointToGridForm.level"
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
            :disabled="pointToGridLoading"
          >
            <Loader2 v-if="pointToGridLoading" :size="14" class="spin" />
            {{ pointToGridLoading ? '计算中...' : '开始计算' }}
          </button>
        </div>
      </form>
      <div v-if="pointToGridError" class="error">{{ pointToGridError }}</div>
      <div v-if="pointToGridResult" class="result">
        <div class="result-row">
          <span class="result-k">网格编码</span>
          <span class="result-v code">{{ pointToGridResult.code }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">状态</span>
          <span class="result-v">{{ pointToGridResult.status }}</span>
        </div>
      </div>
    </template>

    <!-- 网格编码转网格中心 -->
    <template v-else-if="functionName === '网格编码转网格中心'">
      <form class="form" @submit.prevent="submitGridCenter">
        <div class="form-row">
          <label class="form-label" for="gc-code">网格编码</label>
          <input
            id="gc-code"
            v-model="gridCenterForm.gridCode"
            type="text"
            class="form-input"
            required
          >
        </div>
        <div class="form-actions">
          <button
            type="submit"
            class="btn-primary"
            :disabled="gridCenterLoading"
          >
            <Loader2 v-if="gridCenterLoading" :size="14" class="spin" />
            {{ gridCenterLoading ? '计算中...' : '开始计算' }}
          </button>
        </div>
      </form>
      <div v-if="gridCenterError" class="error">{{ gridCenterError }}</div>
      <div v-if="gridCenterResult" class="result">
        <div class="result-row">
          <span class="result-k">网格编码</span>
          <span class="result-v code">{{ gridCenterResult.data?.gridCode }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">经度</span>
          <span class="result-v">{{ gridCenterResult.data?.longitude }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">纬度</span>
          <span class="result-v">{{ gridCenterResult.data?.latitude }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">高度(m)</span>
          <span class="result-v">{{ gridCenterResult.data?.height }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">层级</span>
          <span class="result-v">{{ gridCenterResult.data?.level }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">状态</span>
          <span class="result-v">{{ gridCenterResult.status }}</span>
        </div>
      </div>
    </template>

    <!-- 网格编码计算子网格 -->
    <template v-else-if="functionName === '网格编码计算子网格'">
      <form class="form" @submit.prevent="submitChildGrid">
        <div class="form-row">
          <label class="form-label" for="cg-code">网格编码</label>
          <input
            id="cg-code"
            v-model="childGridForm.gridCode"
            type="text"
            class="form-input"
            required
          >
        </div>
        <div class="form-actions">
          <button
            type="submit"
            class="btn-primary"
            :disabled="childGridLoading"
          >
            <Loader2 v-if="childGridLoading" :size="14" class="spin" />
            {{ childGridLoading ? '计算中...' : '开始计算' }}
          </button>
        </div>
      </form>
      <div v-if="childGridError" class="error">{{ childGridError }}</div>
      <div v-if="childGridResult" class="result">
        <div class="result-row">
          <span class="result-k">父网格编码</span>
          <span class="result-v code">{{ childGridResult.data?.gridCode }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">状态</span>
          <span class="result-v">{{ childGridResult.status }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">子网格数量</span>
          <span class="result-v">{{ childGridResult.data?.childcode?.length ?? 0 }}</span>
        </div>
        <div v-if="childGridResult.data?.childcode?.length" class="result-row child-codes-row">
          <span class="result-k">子网格编码</span>
          <span class="result-v">
            <span
              v-for="code in childGridResult.data.childcode"
              :key="code"
              class="chip"
            >{{ code }}</span>
          </span>
        </div>
      </div>
    </template>

    <!-- 网格编码求指定层级父网格 -->
    <template v-else-if="functionName === '网格编码求指定层级父网格'">
      <form class="form" @submit.prevent="submitParentGrid">
        <div class="form-row">
          <label class="form-label" for="pg-code">网格编码</label>
          <input
            id="pg-code"
            v-model="parentGridForm.gridCode"
            type="text"
            class="form-input"
            required
          >
        </div>
        <div class="form-row">
          <label class="form-label" for="pg-level">层级</label>
          <input
            id="pg-level"
            v-model.number="parentGridForm.level"
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
            :disabled="parentGridLoading"
          >
            <Loader2 v-if="parentGridLoading" :size="14" class="spin" />
            {{ parentGridLoading ? '计算中...' : '开始计算' }}
          </button>
        </div>
      </form>
      <div v-if="parentGridError" class="error">{{ parentGridError }}</div>
      <div v-if="parentGridResult" class="result">
        <div class="result-row">
          <span class="result-k">原始网格编码</span>
          <span class="result-v code">{{ parentGridResult.data?.gridCode }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">指定层级</span>
          <span class="result-v">{{ parentGridResult.data?.level }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">父网格编码</span>
          <span class="result-v code">{{ parentGridResult.data?.parentCode }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">状态</span>
          <span class="result-v">{{ parentGridResult.status }}</span>
        </div>
      </div>
    </template>

    <!-- 局部网格编码转全局网格编码 -->
    <template v-else-if="functionName === '局部网格编码转全局网格编码'">
      <form class="form" @submit.prevent="submitLocalToGlobal">
        <div class="form-row">
          <label class="form-label" for="ltg-local">局部编码</label>
          <input
            id="ltg-local"
            v-model="localToGlobalForm.localCode"
            type="text"
            class="form-input"
            required
          >
        </div>
        <div class="form-actions">
          <button
            type="submit"
            class="btn-primary"
            :disabled="localToGlobalLoading"
          >
            <Loader2 v-if="localToGlobalLoading" :size="14" class="spin" />
            {{ localToGlobalLoading ? '计算中...' : '开始计算' }}
          </button>
        </div>
      </form>
      <div v-if="localToGlobalError" class="error">{{ localToGlobalError }}</div>
      <div v-if="localToGlobalResult" class="result">
        <div class="result-row">
          <span class="result-k">局部网格编码</span>
          <span class="result-v code">{{ localToGlobalResult.data?.localCode }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">全局网格编码</span>
          <span class="result-v code">{{ localToGlobalResult.data?.globalCode }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">状态</span>
          <span class="result-v">{{ localToGlobalResult.status }}</span>
        </div>
      </div>
    </template>

    <!-- 网格编码获取网格信息 -->
    <template v-else-if="functionName === '网格编码获取网格信息'">
      <form class="form" @submit.prevent="submitGridInfo">
        <div class="form-row">
          <label class="form-label" for="gi-code">网格编码</label>
          <input
            id="gi-code"
            v-model="gridInfoForm.gridCode"
            type="text"
            class="form-input"
            required
          >
        </div>
        <div class="form-actions">
          <button
            type="submit"
            class="btn-primary"
            :disabled="gridInfoLoading"
          >
            <Loader2 v-if="gridInfoLoading" :size="14" class="spin" />
            {{ gridInfoLoading ? '计算中...' : '开始计算' }}
          </button>
        </div>
      </form>
      <div v-if="gridInfoError" class="error">{{ gridInfoError }}</div>
      <div v-if="gridInfoResult" class="result result-grid-info">
        <div class="result-row">
          <span class="result-k">网格编码</span>
          <span class="result-v code">{{ gridInfoResult.data?.code }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">层级</span>
          <span class="result-v">{{ gridInfoResult.data?.level }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">层号</span>
          <span class="result-v">{{ gridInfoResult.data?.layer }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">行号</span>
          <span class="result-v">{{ gridInfoResult.data?.row }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">列号</span>
          <span class="result-v">{{ gridInfoResult.data?.column }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">八分体编号</span>
          <span class="result-v">{{ gridInfoResult.data?.octNum }}</span>
        </div>
        <div class="result-section-title">中心点</div>
        <div class="result-row">
          <span class="result-k">经度</span>
          <span class="result-v">{{ gridInfoResult.data?.center?.longitude }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">纬度</span>
          <span class="result-v">{{ gridInfoResult.data?.center?.latitude }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">高程</span>
          <span class="result-v">{{ gridInfoResult.data?.center?.height }}</span>
        </div>
        <div class="result-section-title">边界</div>
        <div class="result-row">
          <span class="result-k">北界</span>
          <span class="result-v">{{ gridInfoResult.data?.north }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">南界</span>
          <span class="result-v">{{ gridInfoResult.data?.south }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">东界</span>
          <span class="result-v">{{ gridInfoResult.data?.east }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">西界</span>
          <span class="result-v">{{ gridInfoResult.data?.west }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">上边界</span>
          <span class="result-v">{{ gridInfoResult.data?.top }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">下边界</span>
          <span class="result-v">{{ gridInfoResult.data?.bottom }}</span>
        </div>
        <div class="result-row">
          <span class="result-k">状态</span>
          <span class="result-v">{{ gridInfoResult.status }}</span>
        </div>
      </div>
    </template>

    <!-- 清除格网按钮放在底部 -->
    <div class="form-actions" style="margin-top: 16px;">
      <button type="button" class="btn-danger" @click="clearGrids">
        <Trash2 :size="14" />
        清除已生成格网
      </button>
    </div>
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

.child-codes-row .result-v {
  max-height: 150px;
  overflow-y: auto;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 6px;
}

.result-k {
  color: #64748b;
}

.result-v {
  color: #e2e8f0;
  font-variant-numeric: tabular-nums;
  word-break: break-all;
  overflow-x: auto;
}

.result-v.code {
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  color: #93c5fd;
  font-size: 14px;
}

.result-section-title {
  font-size: 14px;
  font-weight: 600;
  color: #3b82f6;
  padding: 8px 0 4px;
  margin-top: 6px;
  border-bottom: 1px solid rgba(59, 130, 246, 0.2);
}

.chip {
  display: inline-block;
  margin: 2px 4px 2px 0;
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid rgba(147, 197, 253, 0.3);
  background: rgba(59, 130, 246, 0.1);
  font-size: 13px;
  font-family: 'SF Mono', 'Monaco', monospace;
  color: #93c5fd;
}

.child-codes-row .result-v::-webkit-scrollbar {
  width: 4px;
}

.child-codes-row .result-v::-webkit-scrollbar-track {
  background: transparent;
}

.child-codes-row .result-v::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
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
</style>
