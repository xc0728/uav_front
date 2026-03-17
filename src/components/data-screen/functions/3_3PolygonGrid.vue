<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Loader2, Trash2, Plus } from 'lucide-vue-next'

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

// ===== 多边形网格化 =====
const polygonForm = reactive({
  level: 14,
  bottom: 0,
  top: 25,
})

const points = ref([])

const loading = ref(false)
const error = ref('')
const result = ref(null)

const canSubmit = computed(() => {
  if (points.value.length < 3) return false
  if (!Number.isFinite(Number(polygonForm.level))) return false
  if (!Number.isFinite(Number(polygonForm.bottom))) return false
  if (!Number.isFinite(Number(polygonForm.top))) return false
  if (Number(polygonForm.top) <= Number(polygonForm.bottom)) return false
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
  if (props.functionName !== '多边形网格化') return
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
  emitPolygon()
}

function resetForm() {
  if (props.functionName !== '多边形网格化') return
  loading.value = false
  error.value = ''
  result.value = null
  emit('show-polygon', [])
}

watch(
  () => points,
  () => {
    if (props.functionName !== '多边形网格化') return
    emitPolygon()
  },
  { deep: true },
)

// ===== 多边形网格化（带洞）=====
const polygonWithHolesForm = reactive({
  level: 14,
  bottom: 0,
  top: 25,
})

// 外边界点
const outerPolygon = ref([])
// 洞列表：每个洞是一个点数组
const holes = ref([])

// 当前绘制模式：'outer' = 外边界，'hole' = 洞
const drawingMode = ref('outer')
// 当前正在绘制的洞（临时）
const currentHolePoints = ref([])

const loadingHoles = ref(false)
const errorHoles = ref('')
const resultHoles = ref(null)

const canSubmitHoles = computed(() => {
  // 检查是否有未完成的洞
  if (currentHolePoints.value.length >= 3) return false
  if (outerPolygon.value.length < 3) return false
  // 检查每个外边界点的有效性
  for (const p of outerPolygon.value) {
    if (!Number.isFinite(Number(p.lon)) || !Number.isFinite(Number(p.lat))) return false
  }
  // 检查每个洞的点有效性
  for (const hole of holes.value) {
    for (const p of hole) {
      if (!Number.isFinite(Number(p.lon)) || !Number.isFinite(Number(p.lat))) return false
    }
  }
  if (!Number.isFinite(Number(polygonWithHolesForm.level))) return false
  if (!Number.isFinite(Number(polygonWithHolesForm.bottom))) return false
  if (!Number.isFinite(Number(polygonWithHolesForm.top))) return false
  if (Number(polygonWithHolesForm.top) <= Number(polygonWithHolesForm.bottom)) return false
  return true
})

function normalizePointHoles(p) {
  const lon = Number(p?.lon)
  const lat = Number(p?.lat)
  // 如果经纬度无效，返回null
  if (Number.isNaN(lon) || Number.isNaN(lat)) return null
  return { lon, lat }
}

// 切换到绘制外边界模式
function switchToOuter() {
  // 如果当前有未完成的洞，先保存它
  if (currentHolePoints.value.length >= 3) {
    holes.value.push([...currentHolePoints.value])
  }
  currentHolePoints.value = []
  drawingMode.value = 'outer'
  emitPolygonsWithHoles()
}

// 切换到绘制洞模式
function switchToHole() {
  // 如果是从外边界切换过来，保存当前的外边界进度（已完成的不受影响）
  drawingMode.value = 'hole'
  emitPolygonsWithHoles()
}

// 完成当前洞的绘制
function finishCurrentHole() {
  if (currentHolePoints.value.length >= 3) {
    holes.value.push([...currentHolePoints.value])
  }
  currentHolePoints.value = []
  drawingMode.value = 'hole' // 保持在洞模式，可以继续画下一个洞
  emitPolygonsWithHoles()
}

// 删除指定的洞
function removeHole(idx) {
  holes.value.splice(idx, 1)
  emitPolygonsWithHoles()
}

// 添加点到外边界或当前洞
function addPointToHoles(lon, lat, height) {
  if (props.functionName !== '多边形网格化（带洞）') return

  const point = normalizePointHoles({ lon, lat, height })

  if (drawingMode.value === 'outer') {
    // 添加到外边界
    outerPolygon.value.push(point)
  } else {
    // 添加到当前正在绘制的洞
    currentHolePoints.value.push(point)
  }
  emitPolygonsWithHoles()
}

// 发送多边形数据到地图（外边界和洞用不同颜色显示）
function emitPolygonsWithHoles() {
  // 过滤掉无效的点
  const validOuter = outerPolygon.value.map(normalizePointHoles).filter(p => p !== null)
  const validHoles = holes.value.map(h => h.map(normalizePointHoles).filter(p => p !== null))
  const validCurrentHole = currentHolePoints.value.map(normalizePointHoles).filter(p => p !== null)

  // 发送数据结构，包含外边界和洞列表
  // holes 只包含已完成的洞，currentHole 是当前正在绘制的洞
  emit('show-polygon', {
    outer: validOuter,
    holes: validHoles,
    currentHole: validCurrentHole,
    drawingMode: drawingMode.value
  })
}

function removeOuterPoint(idx) {
  outerPolygon.value.splice(idx, 1)
  emitPolygonsWithHoles()
}

function removeHolePoint(holeIdx, pointIdx) {
  holes.value[holeIdx].splice(pointIdx, 1)
  emitPolygonsWithHoles()
}

function removeCurrentHolePoint(pointIdx) {
  currentHolePoints.value.splice(pointIdx, 1)
  emitPolygonsWithHoles()
}

function clearAllHoles() {
  outerPolygon.value = []
  holes.value = []
  currentHolePoints.value = []
  drawingMode.value = 'outer'
  resultHoles.value = null
  errorHoles.value = ''
  emitPolygonsWithHoles()
}

function resetFormHoles() {
  if (props.functionName !== '多边形网格化（带洞）') return
  loadingHoles.value = false
  errorHoles.value = ''
  resultHoles.value = null
  emit('show-polygon', null)
}

function setPointFromMapHoles(lon, lat, height) {
  if (props.functionName === '多边形网格化（带洞）') {
    addPointToHoles(lon, lat, height)
  }
}

// 暴露给父组件
defineExpose({
  resetForm: function() {
    if (props.functionName === '多边形网格化') {
      resetForm()
    } else if (props.functionName === '多边形网格化（带洞）') {
      resetFormHoles()
    } else if (props.functionName === '多边形表面网格化') {
      resetFormSurface()
    }
  },
  setPointFromMap: function(lon, lat, height) {
    if (props.functionName === '多边形网格化') {
      setPointFromMap(lon, lat, height)
    } else if (props.functionName === '多边形网格化（带洞）') {
      setPointFromMapHoles(lon, lat, height)
    } else if (props.functionName === '多边形表面网格化') {
      setPointFromMapSurface(lon, lat, height)
    }
  }
})

// ===== API 调用 =====
async function submitPolygonGrid() {
  error.value = ''
  result.value = null
  loading.value = true

  try {
    const payload = {
      polygon: points.value.map(p => [Number(p.lon), Number(p.lat)]),
      level: Number(polygonForm.level),
      bottom: Number(polygonForm.bottom),
      top: Number(polygonForm.top),
    }

    if (payload.polygon.length < 3) throw new Error('请至少选择 3 个点组成多边形')
    if (Number.isNaN(payload.level)) throw new Error('请填写合法的层级 level')
    if (Number.isNaN(payload.bottom)) throw new Error('请填写合法的底面高度')
    if (Number.isNaN(payload.top)) throw new Error('请填写合法的顶面高度')
    if (payload.top <= payload.bottom) throw new Error('顶面高度必须大于底面高度')

    const resp = await fetch('/api/multiSource/geometricGrid/getGridByPolygonAndHeight', {
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

// 多边形网格化（带洞）API调用
async function submitPolygonGridWithHoles() {
  errorHoles.value = ''
  resultHoles.value = null
  loadingHoles.value = true

  try {
    // 构建polygon数组：第一个是外边界，后续是洞
    const polygon = []

    // 外边界（需要逆时针，根据API说明）
    const outer = outerPolygon.value.map(p => [Number(p.lon), Number(p.lat)])
    polygon.push(outer)

    // 所有已完成的洞（需要顺时针，根据API说明）
    for (const hole of holes.value) {
      const holeCoords = hole.map(p => [Number(p.lon), Number(p.lat)])
      polygon.push(holeCoords)
    }

    const payload = {
      polygon: polygon,
      level: Number(polygonWithHolesForm.level),
      bottom: Number(polygonWithHolesForm.bottom),
      top: Number(polygonWithHolesForm.top),
    }

    // 验证外边界点有效性
    if (payload.polygon[0].length < 3) throw new Error('请至少选择 3 个点组成外边界')
    for (const p of payload.polygon[0]) {
      if (Number.isNaN(p[0]) || Number.isNaN(p[1])) {
        throw new Error('外边界点的经纬度无效，请检查输入')
      }
    }
    // 验证洞的点有效性
    for (let i = 1; i < payload.polygon.length; i++) {
      for (const p of payload.polygon[i]) {
        if (Number.isNaN(p[0]) || Number.isNaN(p[1])) {
          throw new Error(`洞${i}的经纬度无效，请检查输入`)
        }
      }
    }
    if (Number.isNaN(payload.level)) throw new Error('请填写合法的层级 level')
    if (Number.isNaN(payload.bottom)) throw new Error('请填写合法的底面高度')
    if (Number.isNaN(payload.top)) throw new Error('请填写合法的顶面高度')
    if (payload.top <= payload.bottom) throw new Error('顶面高度必须大于底面高度')

    const resp = await fetch('/api/multiSource/geometricGrid/getGridByPolygonWithHoles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!resp.ok) throw new Error(`请求失败，状态码 ${resp.status}`)

    const data = await resp.json()
    resultHoles.value = data

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
    errorHoles.value = err?.message || '请求失败，请稍后重试'
  } finally {
    loadingHoles.value = false
  }
}

// ===== 多边形表面网格化 =====
const surfaceGridForm = reactive({
  level: 14,
  bottom: 0,
  top: 20,
})

const surfacePoints = ref([])

const surfaceLoading = ref(false)
const surfaceError = ref('')
const surfaceResult = ref(null)

const canSubmitSurface = computed(() => {
  if (surfacePoints.value.length < 3) return false
  if (!Number.isFinite(Number(surfaceGridForm.level))) return false
  if (!Number.isFinite(Number(surfaceGridForm.bottom))) return false
  if (!Number.isFinite(Number(surfaceGridForm.top))) return false
  if (Number(surfaceGridForm.top) <= Number(surfaceGridForm.bottom)) return false
  return true
})

function normalizeSurfacePoint(p) {
  const lon = Number(Number(p.lon).toFixed(10))
  const lat = Number(Number(p.lat).toFixed(10))
  return { lon, lat }
}

function emitSurfacePolygon() {
  emit(
    'show-polygon',
    surfacePoints.value.map(normalizeSurfacePoint),
  )
}

function setPointFromMapSurface(lon, lat, height) {
  if (props.functionName !== '多边形表面网格化') return
  surfacePoints.value.push(normalizeSurfacePoint({ lon, lat, height }))
  emitSurfacePolygon()
}

function removeSurfacePoint(idx) {
  surfacePoints.value.splice(idx, 1)
  emitSurfacePolygon()
}

function clearSurfaceAll() {
  surfacePoints.value = []
  surfaceResult.value = null
  surfaceError.value = ''
  emitSurfacePolygon()
}

function resetFormSurface() {
  if (props.functionName !== '多边形表面网格化') return
  surfaceLoading.value = false
  surfaceError.value = ''
  surfaceResult.value = null
  emit('show-polygon', [])
}

// 多边形表面网格化 API调用
async function submitSurfaceGrid() {
  surfaceError.value = ''
  surfaceResult.value = null
  surfaceLoading.value = true

  try {
    const payload = {
      polygon: surfacePoints.value.map(p => [Number(p.lon), Number(p.lat)]),
      level: Number(surfaceGridForm.level),
      bottom: Number(surfaceGridForm.bottom),
      top: Number(surfaceGridForm.top),
    }

    if (payload.polygon.length < 3) throw new Error('请至少选择 3 个点组成闭合多边形')
    if (Number.isNaN(payload.level)) throw new Error('请填写合法的层级 level')
    if (Number.isNaN(payload.bottom)) throw new Error('请填写合法的底面高度')
    if (Number.isNaN(payload.top)) throw new Error('请填写合法的顶面高度')
    if (payload.top <= payload.bottom) throw new Error('顶面高度必须大于底面高度')

    const resp = await fetch('/api/multiSource/geometricGrid/getSurfaceGridByPolygonAndHeight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!resp.ok) throw new Error(`请求失败，状态码 ${resp.status}`)

    const data = await resp.json()
    surfaceResult.value = data

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
    surfaceError.value = err?.message || '请求失败，请稍后重试'
  } finally {
    surfaceLoading.value = false
  }
}

// 多边形表面网格化的 watch
watch(
  () => surfacePoints,
  () => {
    if (props.functionName !== '多边形表面网格化') return
    emitSurfacePolygon()
  },
  { deep: true },
)
</script>

<template>
  <!-- 多边形网格化 -->
  <div v-if="functionName === '多边形网格化'" class="calc-content">

    <form class="form" @submit.prevent="submitPolygonGrid">
      <div class="form-row">
        <label class="form-label" for="poly-level">层级</label>
        <input
          id="poly-level"
          v-model.number="polygonForm.level"
          type="number"
          step="1"
          min="0"
          class="form-input"
          required
        >
      </div>
      <div class="form-row">
        <label class="form-label" for="poly-bottom">底面高(m)</label>
        <input
          id="poly-bottom"
          v-model.number="polygonForm.bottom"
          type="number"
          step="1"
          min="0"
          class="form-input"
          placeholder="底面高度"
          required
        >
      </div>
      <div class="form-row">
        <label class="form-label" for="poly-top">顶面高(m)</label>
        <input
          id="poly-top"
          v-model.number="polygonForm.top"
          type="number"
          step="1"
          min="0"
          class="form-input"
          placeholder="顶面高度"
          required
        >
      </div>

      <div class="tip">
        点击地图添加节点；需至少 3 个点组成闭合多边形；底部高度需小于顶部高度。
      </div>

      <div class="points-head">
        <div class="points-title">多边形节点（{{ points.length }}）</div>
        <div class="points-actions">
          <button type="button" class="btn-danger" @click="clearAll" :disabled="loading">
            <Trash2 :size="14" />
            清空
          </button>
        </div>
      </div>

      <div class="points-table">
        <div v-if="points.length === 0" class="points-empty">请点击地图添加点（至少 3 个）</div>

        <div v-for="(p, idx) in points" :key="idx" class="point-row">
          <div class="point-header">
            <div class="idx">{{ idx + 1 }}</div>
            <button type="button" class="icon-btn" title="删除该点" @click="removePoint(idx)" :disabled="loading">
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

  <!-- 多边形网格化（带洞） -->
  <div v-else-if="functionName === '多边形网格化（带洞）'" class="calc-content">

    <form class="form" @submit.prevent="submitPolygonGridWithHoles">
      <div class="form-row">
        <label class="form-label" for="polyh-level">层级</label>
        <input
          id="polyh-level"
          v-model.number="polygonWithHolesForm.level"
          type="number"
          step="1"
          min="0"
          class="form-input"
          required
        >
      </div>
      <div class="form-row">
        <label class="form-label" for="polyh-bottom">底面高(m)</label>
        <input
          id="polyh-bottom"
          v-model.number="polygonWithHolesForm.bottom"
          type="number"
          step="1"
          min="0"
          class="form-input"
          placeholder="底面高度"
          required
        >
      </div>
      <div class="form-row">
        <label class="form-label" for="polyh-top">顶面高(m)</label>
        <input
          id="polyh-top"
          v-model.number="polygonWithHolesForm.top"
          type="number"
          step="1"
          min="0"
          class="form-input"
          placeholder="顶面高度"
          required
        >
      </div>

      <div class="tip tip-blue">
        点击地图添加外边界点；绘制完外边界后可切换到"绘制洞"模式添加洞；需至少 3 个点组成闭合多边形。
      </div>

      <div class="mode-switch">
        <div class="mode-btn-group">
          <button
            type="button"
            class="mode-btn btn-equal"
            :class="{ active: drawingMode === 'outer' }"
            @click="switchToOuter"
            :disabled="loadingHoles"
          >
            <span class="mode-dot outer-dot"></span>
            外边界 ({{ outerPolygon.length }})
          </button>
          <button
            type="button"
            class="mode-btn btn-equal"
            :class="{ active: drawingMode === 'hole' }"
            @click="switchToHole"
            :disabled="loadingHoles || outerPolygon.length < 3"
          >
            <span class="mode-dot hole-dot"></span>
            绘制洞
          </button>
          <button
            type="button"
            class="mode-btn btn-equal btn-danger"
            @click="clearAllHoles"
            :disabled="loadingHoles"
          >
            <Trash2 :size="12" />
            清空
          </button>
        </div>
        <button
          v-if="drawingMode === 'hole' && currentHolePoints.length >= 3"
          type="button"
          class="mode-btn finish-btn"
          @click="finishCurrentHole"
          :disabled="loadingHoles"
        >
          完成当前洞
        </button>
      </div>

      <div v-if="outerPolygon.length > 0" class="current-hole-points">
        <div class="holes-title">外边界点 ({{ outerPolygon.length }})</div>
        <div v-for="(p, idx) in outerPolygon" :key="'outer-' + idx" class="point-row-mini">
          <span class="point-index">{{ idx + 1 }}</span>
          <div class="point-edit">
            <input
              v-model.number="outerPolygon[idx].lon"
              class="point-input-mini"
              type="number"
              step="any"
              placeholder="经度"
              @input="emitPolygonsWithHoles"
            >
            <input
              v-model.number="outerPolygon[idx].lat"
              class="point-input-mini"
              type="number"
              step="any"
              placeholder="纬度"
              @input="emitPolygonsWithHoles"
            >
          </div>
          <button type="button" class="icon-btn-mini" @click="removeOuterPoint(idx)" :disabled="loadingHoles">
            <Trash2 :size="10" />
          </button>
        </div>
      </div>

      <div v-if="holes.length > 0" class="holes-list">
        <div class="holes-title">已完成的洞 ({{ holes.length }})</div>
        <div v-for="(hole, holeIdx) in holes" :key="holeIdx" class="hole-item-mini">
          <span>洞 {{ holeIdx + 1 }}: {{ hole.length }} 点</span>
          <button type="button" class="icon-btn-small" @click="removeHole(holeIdx)" :disabled="loadingHoles">
            <Trash2 :size="12" />
          </button>
        </div>
        <div v-for="(hole, holeIdx) in holes" :key="'hole-points-' + holeIdx" class="hole-points-mini">
          <div class="hole-points-title">洞 {{ holeIdx + 1 }} 坐标：</div>
          <div v-for="(p, idx) in hole" :key="'hole-' + holeIdx + '-' + idx" class="point-row-mini">
            <span class="point-index">{{ idx + 1 }}</span>
            <div class="point-edit">
              <input
                v-model.number="holes[holeIdx][idx].lon"
                class="point-input-mini"
                type="number"
                step="any"
                placeholder="经度"
                @input="emitPolygonsWithHoles"
              >
              <input
                v-model.number="holes[holeIdx][idx].lat"
                class="point-input-mini"
                type="number"
                step="any"
                placeholder="纬度"
                @input="emitPolygonsWithHoles"
              >
            </div>
            <button type="button" class="icon-btn-mini" @click="removeHolePoint(holeIdx, idx)" :disabled="loadingHoles">
              <Trash2 :size="10" />
            </button>
          </div>
        </div>
      </div>

      <div v-if="drawingMode === 'hole' && currentHolePoints.length > 0" class="current-hole-points">
        <div class="holes-title">当前洞 ({{ currentHolePoints.length }} 点)</div>
        <div v-for="(p, idx) in currentHolePoints" :key="'current-' + idx" class="point-row-mini">
          <span class="point-index">{{ idx + 1 }}</span>
          <div class="point-edit">
            <input
              v-model.number="currentHolePoints[idx].lon"
              class="point-input-mini"
              type="number"
              step="any"
              placeholder="经度"
              @input="emitPolygonsWithHoles"
            >
            <input
              v-model.number="currentHolePoints[idx].lat"
              class="point-input-mini"
              type="number"
              step="any"
              placeholder="纬度"
              @input="emitPolygonsWithHoles"
            >
          </div>
          <button type="button" class="icon-btn-mini" @click="removeCurrentHolePoint(idx)" :disabled="loadingHoles">
            <Trash2 :size="10" />
          </button>
        </div>
      </div>

      <div v-if="currentHolePoints.length >= 3" class="tip tip-warning">
        请点击"完成当前洞"后再进行计算
      </div>
      <div class="form-actions">
        <button
          type="submit"
          class="btn-primary"
          :disabled="loadingHoles || !canSubmitHoles"
        >
          <Loader2 v-if="loadingHoles" :size="14" class="spin" />
          {{ loadingHoles ? '计算中...' : '开始计算' }}
        </button>
      </div>
      <div class="form-actions" style="margin-top: 12px;">
        <button type="button" class="btn-danger" @click="clearGrids">
          <Trash2 :size="14" />
          清除已生成格网
        </button>
      </div>
    </form>

    <div v-if="errorHoles" class="error">{{ errorHoles }}</div>

    <div v-if="resultHoles" class="result">
      <div class="result-row">
        <span class="result-k">网格数量</span>
        <span class="result-v">{{ resultHoles.data?.count }}</span>
      </div>
      <div class="result-row">
        <span class="result-k">状态</span>
        <span class="result-v">{{ resultHoles.status }}</span>
      </div>
      <div v-if="resultHoles.data?.cells?.length" class="result-hint">
        已在地图上绘制返回网格边界
      </div>
    </div>
  </div>

  <!-- 多边形表面网格化 -->
  <div v-else-if="functionName === '多边形表面网格化'" class="calc-content">

    <form class="form" @submit.prevent="submitSurfaceGrid">
      <div class="form-row">
        <label class="form-label" for="surface-level">层级</label>
        <input
          id="surface-level"
          v-model.number="surfaceGridForm.level"
          type="number"
          step="1"
          min="0"
          class="form-input"
          required
        >
      </div>
      <div class="form-row">
        <label class="form-label" for="surface-bottom">底面高(m)</label>
        <input
          id="surface-bottom"
          v-model.number="surfaceGridForm.bottom"
          type="number"
          step="1"
          min="0"
          class="form-input"
          placeholder="底面高度"
          required
        >
      </div>
      <div class="form-row">
        <label class="form-label" for="surface-top">顶面高(m)</label>
        <input
          id="surface-top"
          v-model.number="surfaceGridForm.top"
          type="number"
          step="1"
          min="0"
          class="form-input"
          placeholder="顶面高度"
          required
        >
      </div>

      <div class="tip">
        点击地图添加节点；需至少 3 个点组成闭合多边形；底部高度需小于顶部高度。
      </div>

      <div class="points-head">
        <div class="points-title">多边形节点（{{ surfacePoints.length }}）</div>
        <div class="points-actions">
          <button type="button" class="btn-danger" @click="clearSurfaceAll" :disabled="surfaceLoading">
            <Trash2 :size="14" />
            清空
          </button>
        </div>
      </div>

      <div class="points-table">
        <div v-if="surfacePoints.length === 0" class="points-empty">请点击地图添加点（至少 3 个）</div>

        <div v-for="(p, idx) in surfacePoints" :key="idx" class="point-row">
          <div class="point-header">
            <div class="idx">{{ idx + 1 }}</div>
            <button type="button" class="icon-btn" title="删除该点" @click="removeSurfacePoint(idx)" :disabled="surfaceLoading">
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
          </div>
        </div>
      </div>

      <div class="form-actions">
        <button
          type="submit"
          class="btn-primary"
          :disabled="surfaceLoading || !canSubmitSurface"
        >
          <Loader2 v-if="surfaceLoading" :size="14" class="spin" />
          {{ surfaceLoading ? '计算中...' : '开始计算' }}
        </button>
      </div>
      <div class="form-actions" style="margin-top: 12px;">
        <button type="button" class="btn-danger" @click="clearGrids">
          <Trash2 :size="14" />
          清除已生成格网
        </button>
      </div>
    </form>

    <div v-if="surfaceError" class="error">{{ surfaceError }}</div>

    <div v-if="surfaceResult" class="result">
      <div class="result-row">
        <span class="result-k">网格数量</span>
        <span class="result-v">{{ surfaceResult.data?.count }}</span>
      </div>
      <div class="result-row">
        <span class="result-k">状态</span>
        <span class="result-v">{{ surfaceResult.status }}</span>
      </div>
      <div v-if="surfaceResult.data?.cells?.length" class="result-hint">
        已在地图上绘制返回网格边界
      </div>
    </div>
  </div>

  <!-- 不规则多面体网格化 -->
  <div v-else-if="functionName === '不规则多面体网格化'" class="calc-content">
    <div class="coming-soon">
      <div class="coming-soon-icon">🚧</div>
      <div class="coming-soon-text">功能开发中...</div>
      <div class="coming-soon-desc">API信息暂未提供，敬请期待</div>
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

.tip-blue {
  background: rgba(59, 130, 246, 0.08);
  border-color: rgba(59, 130, 246, 0.18);
  color: #93c5fd;
}

.tip-warning {
  background: rgba(245, 158, 11, 0.08);
  border-color: rgba(245, 158, 11, 0.18);
  color: #fbbf24;
  margin-top: 8px;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.calc-content .form-row,
.form-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.calc-content .form-label,
.form-label {
  width: 72px;
  font-size: 13px;
  color: #94a3b8;
  flex-shrink: 0;
}

.calc-content .form-input,
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
  flex: 0 0 28px;
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
  flex: 0 0 40px;
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

/* 绘制模式切换 */
.mode-switch {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-wrap: wrap;
}

.mode-btn-group {
  display: flex;
  gap: 8px;
  width: 100%;
}

.mode-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
  color: #94a3b8;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

/* 等宽按钮样式：外边界、绘制洞、清空 */
.mode-btn.btn-equal {
  flex: 1;
  min-width: 60px;
  max-width: 100px;
  padding: 8px 8px;
  font-size: 11px;
}

.mode-btn:hover:not(:disabled) {
  border-color: rgba(59, 130, 246, 0.4);
}

.mode-btn.active {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.15);
  color: #93c5fd;
}

.mode-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mode-btn.finish-btn {
  border-color: rgba(34, 197, 94, 0.4);
  background: rgba(34, 197, 94, 0.1);
  color: #86efac;
}

.mode-btn.finish-btn:hover:not(:disabled) {
  background: rgba(34, 197, 94, 0.2);
}

.mode-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.outer-dot {
  background: #f59e0b;
}

.hole-dot {
  background: #ef4444;
}

/* 洞列表 */
.holes-list {
  margin-top: 8px;
  padding: 10px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.15);
  border-radius: 6px;
}

.holes-title {
  font-size: 12px;
  font-weight: 500;
  color: #fca5a5;
  margin-bottom: 8px;
}

.hole-item-mini {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  margin-bottom: 4px;
  font-size: 11px;
  color: #e2e8f0;
}

.hole-item-mini:last-child {
  margin-bottom: 0;
}

.hole-points-mini {
  margin-top: 8px;
  padding: 6px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  margin-bottom: 6px;
}

.hole-points-title {
  font-size: 10px;
  color: #f87171;
  margin-bottom: 4px;
  font-weight: 500;
}

.icon-btn-small {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  border-radius: 4px;
  cursor: pointer;
}

.icon-btn-small:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.3);
}

.icon-btn-small:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 当前绘制的洞的点 */
.current-hole-points {
  margin-top: 8px;
  padding: 10px;
  background: rgba(239, 68, 68, 0.05);
  border: 1px dashed rgba(239, 68, 68, 0.2);
  border-radius: 6px;
}

.point-row-mini {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 11px;
  color: #94a3b8;
}

.point-edit {
  flex: 1;
  display: flex;
  gap: 4px;
  align-items: center;
}

.point-input-mini {
  flex: 1;
  min-width: 50px;
  max-width: 90px;
  height: 24px;
  padding: 0 4px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.3);
  color: #e2e8f0;
  font-size: 10px;
  outline: none;
  overflow: hidden;
  text-overflow: ellipsis;
}

.point-input-mini:focus {
  border-color: rgba(59, 130, 246, 0.6);
}

.point-input-mini.height-input {
  min-width: 50px;
  flex: 0.8;
}

.point-index {
  flex: 0 0 20px;
  color: #fca5a5;
}

.point-coord {
  flex: 1;
  font-family: monospace;
}

.icon-btn-mini {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
}

.icon-btn-mini:hover:not(:disabled) {
  color: #fca5a5;
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

/* 开发中提示 */
.coming-soon {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.coming-soon-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.coming-soon-text {
  font-size: 18px;
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 8px;
}

.coming-soon-desc {
  font-size: 14px;
  color: #64748b;
}
</style>
