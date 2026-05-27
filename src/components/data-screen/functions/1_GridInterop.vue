<script setup>
import { reactive, ref } from 'vue'

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

// 高度快选选项（0-120m整十数）
const heightOptions = [
  { value: 0, label: '0m' },
  { value: 10, label: '10m' },
  { value: 20, label: '20m' },
  { value: 30, label: '30m' },
  { value: 40, label: '40m' },
  { value: 50, label: '50m' },
  { value: 60, label: '60m' },
  { value: 70, label: '70m' },
  { value: 80, label: '80m' },
  { value: 90, label: '90m' },
  { value: 100, label: '100m' },
  { value: 110, label: '110m' },
  { value: 120, label: '120m' },
]

// 层级下拉选项（4-14级）
const levelOptions = [
  { value: 4, label: '层级 4' },
  { value: 5, label: '层级 5' },
  { value: 6, label: '层级 6' },
  { value: 7, label: '层级 7' },
  { value: 8, label: '层级 8' },
  { value: 9, label: '层级 9' },
  { value: 10, label: '层级 10' },
  { value: 11, label: '层级 11' },
  { value: 12, label: '层级 12' },
  { value: 13, label: '层级 13' },
  { value: 14, label: '层级 14' },
]

// 高度快选
function onHeightQuickSelect(event) {
  const value = Number(event.target.value)
  if (!isNaN(value)) {
    pointToGridForm.height = value
  }
}

// 层级下拉选择
function onLevelSelect(event) {
  const value = Number(event.target.value)
  if (!isNaN(value)) {
    pointToGridForm.level = value
  }
}

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

// 父网格层级下拉选项（4-14级）
const parentLevelOptions = [
  { value: 4, label: '层级 4' },
  { value: 5, label: '层级 5' },
  { value: 6, label: '层级 6' },
  { value: 7, label: '层级 7' },
  { value: 8, label: '层级 8' },
  { value: 9, label: '层级 9' },
  { value: 10, label: '层级 10' },
  { value: 11, label: '层级 11' },
  { value: 12, label: '层级 12' },
  { value: 13, label: '层级 13' },
  { value: 14, label: '层级 14' },
]

// 父网格层级选择
function onParentLevelSelect(event) {
  const value = Number(event.target.value)
  if (!isNaN(value)) {
    parentGridForm.level = value
  }
}

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
  <div class="dem-grid-query">
    <!-- 经纬度高转网格编码 -->
    <template v-if="functionName === '经纬度高转网格编码'">
      <div class="form-group">
        <div class="group-title">经度</div>
        <input
          v-model.number="pointToGridForm.longitude"
          type="number"
          step="0.0000000001"
          class="full-input"
          placeholder="请输入经度"
        >
      </div>
      <div class="form-group">
        <div class="group-title">纬度</div>
        <input
          v-model.number="pointToGridForm.latitude"
          type="number"
          step="0.0000000001"
          class="full-input"
          placeholder="请输入纬度"
        >
      </div>
      <div class="form-group">
        <div class="group-title">高度(m)</div>
        <div class="height-input-row">
          <input
            v-model.number="pointToGridForm.height"
            type="number"
            step="0.01"
            class="height-input"
            placeholder="请输入高度"
          >
          <select
            class="height-select"
            :value="pointToGridForm.height"
            @change="onHeightQuickSelect"
          >
            <option
              v-for="opt in heightOptions"
              :key="opt.value"
              :value="opt.value"
            >{{ opt.label }}</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <div class="group-title">层级</div>
        <select
          class="level-select full-input"
          :value="pointToGridForm.level"
          @change="onLevelSelect"
        >
          <option
            v-for="opt in levelOptions"
            :key="opt.value"
            :value="opt.value"
          >{{ opt.label }}</option>
        </select>
      </div>

      <div class="btn-row">
        <button class="btn-query" @click="submitPointToGrid" :disabled="pointToGridLoading">
          {{ pointToGridLoading ? '计算中...' : '开始计算' }}
        </button>
      </div>

      <div v-if="pointToGridError" class="error-box">{{ pointToGridError }}</div>

      <div v-if="pointToGridResult" class="result-box">
        <div class="result-row">
          <span class="result-label">网格编码</span>
          <span class="result-v code">{{ pointToGridResult.code }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">状态</span>
          <span class="result-status" :class="pointToGridResult.status">
            {{ pointToGridResult.status === 'success' ? '成功' : pointToGridResult.status }}
          </span>
        </div>
      </div>
    </template>

    <!-- 网格编码转网格中心 -->
    <template v-else-if="functionName === '网格编码转网格中心'">
      <div class="form-group">
        <div class="group-title">网格编码</div>
        <input
          v-model="gridCenterForm.gridCode"
          type="text"
          class="full-input"
          placeholder="请输入网格编码"
        >
      </div>

      <div class="btn-row">
        <button class="btn-query" @click="submitGridCenter" :disabled="gridCenterLoading">
          {{ gridCenterLoading ? '计算中...' : '开始计算' }}
        </button>
      </div>

      <div v-if="gridCenterError" class="error-box">{{ gridCenterError }}</div>

      <div v-if="gridCenterResult" class="result-box">
        <div class="result-row">
          <span class="result-label">网格编码</span>
          <span class="result-v code">{{ gridCenterResult.data?.gridCode }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">经度</span>
          <span class="result-num">{{ gridCenterResult.data?.longitude }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">纬度</span>
          <span class="result-num">{{ gridCenterResult.data?.latitude }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">高度(m)</span>
          <span class="result-num">{{ gridCenterResult.data?.height }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">层级</span>
          <span class="result-num">{{ gridCenterResult.data?.level }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">状态</span>
          <span class="result-status" :class="gridCenterResult.status">
            {{ gridCenterResult.status === 'success' ? '成功' : gridCenterResult.status }}
          </span>
        </div>
      </div>
    </template>

    <!-- 网格编码计算子网格 -->
    <template v-else-if="functionName === '网格编码计算子网格'">
      <div class="form-group">
        <div class="group-title">网格编码</div>
        <input
          v-model="childGridForm.gridCode"
          type="text"
          class="full-input"
          placeholder="请输入网格编码"
        >
      </div>

      <div class="btn-row">
        <button class="btn-query" @click="submitChildGrid" :disabled="childGridLoading">
          {{ childGridLoading ? '计算中...' : '开始计算' }}
        </button>
      </div>

      <div v-if="childGridError" class="error-box">{{ childGridError }}</div>

      <div v-if="childGridResult" class="result-box">
        <div class="result-row">
          <span class="result-label">父网格编码</span>
          <span class="result-v code">{{ childGridResult.data?.gridCode }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">状态</span>
          <span class="result-status" :class="childGridResult.status">
            {{ childGridResult.status === 'success' ? '成功' : childGridResult.status }}
          </span>
        </div>
        <div class="result-row">
          <span class="result-label">子网格数量</span>
          <span class="result-num">{{ childGridResult.data?.childcode?.length ?? 0 }}</span>
        </div>
        <div v-if="childGridResult.data?.childcode?.length" class="result-row">
          <span class="result-label">子网格编码</span>
          <div class="result-v">
            <span
              v-for="code in childGridResult.data.childcode"
              :key="code"
              class="chip"
            >{{ code }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 网格编码求指定层级父网格 -->
    <template v-else-if="functionName === '网格编码求指定层级父网格'">
      <div class="form-group">
        <div class="group-title">网格编码</div>
        <input
          v-model="parentGridForm.gridCode"
          type="text"
          class="full-input"
          placeholder="请输入网格编码"
        >
      </div>
      <div class="form-group">
        <div class="group-title">层级</div>
        <select
          class="level-select full-input"
          :value="parentGridForm.level"
          @change="onParentLevelSelect"
        >
          <option
            v-for="opt in parentLevelOptions"
            :key="opt.value"
            :value="opt.value"
          >{{ opt.label }}</option>
        </select>
      </div>

      <div class="btn-row">
        <button class="btn-query" @click="submitParentGrid" :disabled="parentGridLoading">
          {{ parentGridLoading ? '计算中...' : '开始计算' }}
        </button>
      </div>

      <div v-if="parentGridError" class="error-box">{{ parentGridError }}</div>

      <div v-if="parentGridResult" class="result-box">
        <div class="result-row">
          <span class="result-label">原始网格编码</span>
          <span class="result-v code">{{ parentGridResult.data?.gridCode }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">指定层级</span>
          <span class="result-num">{{ parentGridResult.data?.level }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">父网格编码</span>
          <span class="result-v code">{{ parentGridResult.data?.parentCode }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">状态</span>
          <span class="result-status" :class="parentGridResult.status">
            {{ parentGridResult.status === 'success' ? '成功' : parentGridResult.status }}
          </span>
        </div>
      </div>
    </template>

    <!-- 局部网格编码转全局网格编码 -->
    <template v-else-if="functionName === '局部网格编码转全局网格编码'">
      <div class="form-group">
        <div class="group-title">局部编码</div>
        <input
          v-model="localToGlobalForm.localCode"
          type="text"
          class="full-input"
          placeholder="请输入局部编码"
        >
      </div>

      <div class="btn-row">
        <button class="btn-query" @click="submitLocalToGlobal" :disabled="localToGlobalLoading">
          {{ localToGlobalLoading ? '计算中...' : '开始计算' }}
        </button>
      </div>

      <div v-if="localToGlobalError" class="error-box">{{ localToGlobalError }}</div>

      <div v-if="localToGlobalResult" class="result-box">
        <div class="result-row">
          <span class="result-label">局部网格编码</span>
          <span class="result-v code">{{ localToGlobalResult.data?.localCode }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">全局网格编码</span>
          <span class="result-v code">{{ localToGlobalResult.data?.globalCode }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">状态</span>
          <span class="result-status" :class="localToGlobalResult.status">
            {{ localToGlobalResult.status === 'success' ? '成功' : localToGlobalResult.status }}
          </span>
        </div>
      </div>
    </template>

    <!-- 网格编码获取网格信息 -->
    <template v-else-if="functionName === '网格编码获取网格信息'">
      <div class="form-group">
        <div class="group-title">网格编码</div>
        <input
          v-model="gridInfoForm.gridCode"
          type="text"
          class="full-input"
          placeholder="请输入网格编码"
        >
      </div>

      <div class="btn-row">
        <button class="btn-query" @click="submitGridInfo" :disabled="gridInfoLoading">
          {{ gridInfoLoading ? '计算中...' : '开始计算' }}
        </button>
        <button class="btn-clear" @click="clearGrids" :disabled="!gridInfoResult">
          <span>清除格网</span>
        </button>
      </div>

      <div v-if="gridInfoError" class="error-box">{{ gridInfoError }}</div>

      <div v-if="gridInfoResult" class="result-box">
        <div class="result-row">
          <span class="result-label">网格编码</span>
          <span class="result-v code">{{ gridInfoResult.data?.code }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">层级</span>
          <span class="result-num">{{ gridInfoResult.data?.level }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">层号</span>
          <span class="result-num">{{ gridInfoResult.data?.layer }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">行号</span>
          <span class="result-num">{{ gridInfoResult.data?.row }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">列号</span>
          <span class="result-num">{{ gridInfoResult.data?.column }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">八分体编号</span>
          <span class="result-num">{{ gridInfoResult.data?.octNum }}</span>
        </div>

        <div class="result-section-title">中心点</div>
        <div class="result-row">
          <span class="result-label">经度</span>
          <span class="result-num">{{ gridInfoResult.data?.center?.longitude }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">纬度</span>
          <span class="result-num">{{ gridInfoResult.data?.center?.latitude }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">高程</span>
          <span class="result-num">{{ gridInfoResult.data?.center?.height }}</span>
        </div>

        <div class="result-section-title">边界</div>
        <div class="result-row">
          <span class="result-label">北界</span>
          <span class="result-num">{{ gridInfoResult.data?.north }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">南界</span>
          <span class="result-num">{{ gridInfoResult.data?.south }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">东界</span>
          <span class="result-num">{{ gridInfoResult.data?.east }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">西界</span>
          <span class="result-num">{{ gridInfoResult.data?.west }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">上边界</span>
          <span class="result-num">{{ gridInfoResult.data?.top }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">下边界</span>
          <span class="result-num">{{ gridInfoResult.data?.bottom }}</span>
        </div>

        <div class="result-row">
          <span class="result-label">状态</span>
          <span class="result-status" :class="gridInfoResult.status">
            {{ gridInfoResult.status === 'success' ? '成功' : gridInfoResult.status }}
          </span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dem-grid-query {
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

/* 高度输入行（输入框 + 快选下拉） */
.height-input-row {
  display: flex;
  gap: 8px;
}

.height-input {
  flex: 1;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 14px;
  box-sizing: border-box;
}

.height-input::placeholder {
  color: #999;
}

.height-select {
  width: 90px;
  height: 34px;
  padding: 0 8px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 14px;
  cursor: pointer;
  box-sizing: border-box;
}

.height-select:focus {
  outline: none;
  border-color: #5b9fd4;
  box-shadow: 0 0 0 2px rgba(91, 159, 212, 0.2);
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
  align-items: flex-start;
}

.result-label {
  font-size: 14px;
  color: #64748b;
  flex-shrink: 0;
}

.result-num {
  font-size: 14px;
  font-weight: 600;
  color: #334155;
  text-align: right;
}

.result-v {
  font-size: 14px;
  color: #475569;
  text-align: right;
  word-break: break-all;
}

.result-v.code {
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  color: #5b9fd4;
  font-size: 13px;
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

.result-section-title {
  font-size: 14px;
  font-weight: 600;
  color: #3b82f6;
  padding: 8px 0 4px;
  margin-top: 4px;
  border-bottom: 1px solid rgba(59, 130, 246, 0.2);
}

/* 子网格编码标签 */
.chip {
  display: inline-block;
  margin: 2px;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  font-size: 12px;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  color: #3b82f6;
}
</style>
