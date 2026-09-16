<script setup>
import { reactive, ref } from 'vue'
import { ZoomIn, Loader2 } from 'lucide-vue-next'

const props = defineProps({
  serviceName: {
    type: String,
    default: '空域网格化入库/查询服务'
  },
  functionName: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['close', 'showPoint', 'showGrid', 'get-view-bounds'])

/** 高度快选：100, 200, 300, 400, 500, 600 */
const heightPresetOptions = [100, 200, 300, 400, 500, 600]

function onBottomPresetChange(event) {
  const val = event.target.value
  if (val !== '') {
    airspaceGridForm.bottom = Number(val)
  }
  event.target.selectedIndex = 0
}

function onTopPresetChange(event) {
  const val = event.target.value
  if (val !== '') {
    airspaceGridForm.top = Number(val)
  }
  event.target.selectedIndex = 0
}

const airspaceGridForm = reactive({
  level: 12,
  minLon: null,
  maxLon: null,
  minLat: null,
  maxLat: null,
  top: 600,
  bottom: 0,
  airspaceId: 'Deqing_Airspace',
})

const loading = ref(false)
const error = ref('')
const result = ref(null)
const queryStats = ref(null)
const gridsData = ref([])
let totalCount = 0

// ====== 动态缩放模式 ======
const dynamicZoomEnabled = ref(false)   // 动态缩放开关
const dynamicRuntime = ref(0)            // 动态缩放最近一次耗时(ms)
const dynamicLoading = ref(false)        // 动态缩放加载状态
let abortController = null               // 动态缩放：取消上一次未完成的请求
let manualAbortController = null         // 手动查询：取消当前请求
let manualTimeoutId = null               // 手动查询：超时定时器
let manualTimedOut = false               // 手动查询：是否因超时而中止

/**
 * 核心：视图边界变化时（由 CesiumMap 400ms debounce 后触发）
 * 只在 dynamicZoomEnabled=true 时自动查询
 * 使用用户手动设置的 level，不做自动映射（避免用户设 level=10 被覆盖成 17）
 */
async function onViewBoundsChanged(bounds) {
  if (!dynamicZoomEnabled.value) return
  if (!bounds) return

  // 1. 取消上一次未完成的请求（避免旧响应覆盖新响应）
  if (abortController) {
    abortController.abort()
    abortController = null
  }
  const controller = new AbortController()
  abortController = controller

  // 2. 使用用户手动设置的层级（不做自动映射，尊重用户选择）
  const queryLevel = Number(airspaceGridForm.level) || 12

  dynamicLoading.value = true
  error.value = ''

  try {
    const minLon = Number(bounds.west)
    const maxLon = Number(bounds.east)
    const minLat = Number(bounds.south)
    const maxLat = Number(bounds.north)

    const polygon = [
      [minLon, minLat],
      [maxLon, minLat],
      [maxLon, maxLat],
      [minLon, maxLat],
      [minLon, minLat],
    ]

    // 动态缩放模式用较小 maxCells 防止大范围查询卡死
    const payload = {
      airspaceId: airspaceGridForm.airspaceId.trim(),
      polygon,
      bottom: Number(airspaceGridForm.bottom) || 0,
      top: Number(airspaceGridForm.top) || 600,
      level: queryLevel,
      maxCells: 50000,
    }

    const t0 = performance.now()
    const resp = await fetch('/api/multiSource/airSpaceDB/grid/region', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(`状态码 ${resp.status}: ${errText}`)
    }

    const data = await resp.json()
    const runtime = Math.round(performance.now() - t0)

    // 如果 controller 已被取消，说明有更新的请求在路上了，直接丢弃本次结果
    if (controller.signal.aborted) return

    dynamicRuntime.value = runtime

    // 解析 cells
    let rawGrids = null
    if (data?.data?.cells && data.data.cells.length > 0) rawGrids = data.data.cells
    else if (data?.data?.grids && data.data.grids.length > 0) rawGrids = data.data.grids

    if (rawGrids && rawGrids.length > 0) {
      const cells = rawGrids.map(cell => {
        const g = cell?.data?.grid || cell
        const b = g.bounds
        const north = g.maxlat ?? b?.max_latitude ?? b?.north
        const south = g.minlat ?? b?.min_latitude ?? b?.south
        const east = g.maxlon ?? b?.max_longitude ?? b?.east
        const west = g.minlon ?? b?.min_longitude ?? b?.west
        const top = g.top ?? b?.top ?? 0
        const bottom = g.bottom ?? b?.bottom ?? 0
        const center = g.center_point || g.center
        return {
          code: String(g.code || cell.code || ''),
          level: g.level,
          z: g.level,
          bounds: { north, south, east, west, top, bottom },
          center,
        }
      })

      gridsData.value = rawGrids
      totalCount = rawGrids.length
      queryStats.value = {
        total: totalCount,
        status: data?.success === true ? 'success' : (data?.status || 'unknown'),
      }
      emit('showGrid', { cells, level: queryLevel, runtime, skipFlyTo: true })
    } else {
      gridsData.value = []
      totalCount = 0
      queryStats.value = { total: 0, status: 'empty' }
      emit('showGrid', { cells: [], level: queryLevel, runtime, skipFlyTo: true })
    }
  } catch (err) {
    if (err?.name === 'AbortError') return // 被取消的请求静默忽略
    console.warn('[空域网格查询] 动态缩放请求失败:', err?.message)
    // 动态缩放失败不弹窗打扰用户，只在控制台提示
  } finally {
    if (controller.signal.aborted) return
    dynamicLoading.value = false
  }
}

function toggleDynamicZoom() {
  dynamicZoomEnabled.value = !dynamicZoomEnabled.value
  if (dynamicZoomEnabled.value) {
    // 开启时立即触发一次查询
    emit('get-view-bounds')
  } else {
    // 关闭时取消未完成的请求
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }
}

function resetForm() {
  cancelManualQuery()
  loading.value = false
  error.value = ''
  result.value = null
  queryStats.value = null
  gridsData.value = []
  dynamicZoomEnabled.value = false
  dynamicRuntime.value = 0
  if (abortController) {
    abortController.abort()
    abortController = null
  }
}

function setPointFromMap(lon, lat, height) {
  // 空域网格查询暂不支持地图点选
}

// 获取视图边界
function requestViewBounds() {
  emit('get-view-bounds')
}

/**
 * 估算查询区域在指定层级下的格网数量（用于提前预警）
 * GeoSOT level n 格子边长 ≈ 360° / 2^n
 */
function estimateCellCount(minLon, maxLon, minLat, maxLat, level) {
  const cellSize = 360 / Math.pow(2, level) // 度
  const lonCells = Math.ceil((maxLon - minLon) / cellSize)
  const latCells = Math.ceil((maxLat - minLat) / cellSize)
  return lonCells * latCells
}

/**
 * 取消当前手动查询请求
 */
function cancelManualQuery() {
  manualTimedOut = false
  if (manualAbortController) {
    manualAbortController.abort()
    manualAbortController = null
  }
  if (manualTimeoutId) {
    clearTimeout(manualTimeoutId)
    manualTimeoutId = null
  }
  loading.value = false
}

// 设置视图边界
function setViewBounds(bounds) {
  airspaceGridForm.minLon = Number(bounds.west.toFixed(4))
  airspaceGridForm.maxLon = Number(bounds.east.toFixed(4))
  airspaceGridForm.minLat = Number(bounds.south.toFixed(4))
  airspaceGridForm.maxLat = Number(bounds.north.toFixed(4))
}

defineExpose({ resetForm, setPointFromMap, setViewBounds, onViewBoundsChanged })

async function submitAirspaceGridQuery() {
  error.value = ''
  result.value = null
  queryStats.value = null

  // 验证层级
  if (!airspaceGridForm.level || airspaceGridForm.level < 0) {
    error.value = '请输入有效的层级'
    return
  }

  // 验证边界参数
  if (airspaceGridForm.minLon === null || airspaceGridForm.maxLon === null ||
      airspaceGridForm.minLat === null || airspaceGridForm.maxLat === null) {
    error.value = '请先在地图上框选查询区域，或手动输入边界参数'
    return
  }

  // 验证空域ID
  if (!airspaceGridForm.airspaceId || airspaceGridForm.airspaceId.trim() === '') {
    error.value = '请输入空域ID'
    return
  }

  const minLon = Number(airspaceGridForm.minLon)
  const maxLon = Number(airspaceGridForm.maxLon)
  const minLat = Number(airspaceGridForm.minLat)
  const maxLat = Number(airspaceGridForm.maxLat)

  if (minLon >= maxLon || minLat >= maxLat) {
    error.value = '边界参数不合法：minLon < maxLon, minLat < maxLat'
    return
  }

  // 估算格网数量，超过阈值时预警
  const queryLevel = Number(airspaceGridForm.level)
  const estimatedCells = estimateCellCount(minLon, maxLon, minLat, maxLat, queryLevel)
  const WARN_THRESHOLD = 50000
  if (estimatedCells > WARN_THRESHOLD) {
    const ok = window.confirm(
      `当前区域在 level ${queryLevel} 下预估约 ${estimatedCells.toLocaleString()} 个格网，` +
      `查询可能较慢。是否继续？\n\n（建议缩小区域或降低层级）`
    )
    if (!ok) return
  }

  // 取消上一次未完成的手动查询
  cancelManualQuery()

  loading.value = true

  try {
    // 构建 polygon：顺时针闭合多边形顶点数组 [lon, lat]
    const polygon = [
      [minLon, minLat],
      [maxLon, minLat],
      [maxLon, maxLat],
      [minLon, maxLat],
      [minLon, minLat],
    ]

    // 手动查询也限制 maxCells，防止后端全量计算卡死
    const payload = {
      airspaceId: airspaceGridForm.airspaceId.trim(),
      polygon: polygon,
      bottom: Number(airspaceGridForm.bottom) || 0,
      top: Number(airspaceGridForm.top) || 600,
      level: queryLevel,
      maxCells: 50000,
    }

    console.log('[空域网格查询] 发送 payload:', payload, `预估格网约 ${estimatedCells} 个`)

    // 创建 AbortController 支持取消
    const controller = new AbortController()
    manualAbortController = controller

    // 60s 超时保护：后端不支持取消，超时后前端放弃等待
    manualTimedOut = false
    const timeoutMs = 60000
    manualTimeoutId = setTimeout(() => {
      manualTimedOut = true
      controller.abort()
      console.warn('[空域网格查询] 请求超时（60s），已取消前端等待')
    }, timeoutMs)

    const t0 = performance.now()
    const resp = await fetch('/api/multiSource/airSpaceDB/grid/region', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error('[空域网格查询] 错误响应:', errText)
      throw new Error(`请求失败，状态码 ${resp.status}: ${errText}`)
    }

    const data = await resp.json()
    const runtime = performance.now() - t0
    result.value = data
    console.log('[空域网格查询] 原始返回:', data)

    // 解析返回数据
    let rawGrids = null
    if (data?.data?.grids && data.data.grids.length > 0) {
      rawGrids = data.data.grids
    } else if (data?.data?.cells && data.data.cells.length > 0) {
      rawGrids = data.data.cells
    } else if (data?.data?.features && data.data.features.length > 0) {
      rawGrids = data.data.features
    } else if (data?.data?.airspace && Array.isArray(data.data.airspace) && data.data.airspace.length > 0) {
      // 新接口返回格式：data.data.airspace[]
      rawGrids = data.data.airspace
    } else if (Array.isArray(data?.data)) {
      rawGrids = data.data
    } else if (data?.airspace && Array.isArray(data.airspace)) {
      // 备用格式：data.airspace[]
      rawGrids = data.airspace
    }

    if (!rawGrids || rawGrids.length === 0) {
      error.value = '未查询到空域网格数据'
      totalCount = 0
    } else {
      gridsData.value = rawGrids
      totalCount = rawGrids.length
    }

    queryStats.value = {
      total: totalCount,
      status: data?.success === true ? 'success' : (data?.status || 'unknown'),
    }

    // 如果返回了格网数据，通知地图组件显示
    if (gridsData.value.length > 0) {
      const cells = gridsData.value.map(cell => {
        // 新接口格式：cell.data.grid 包含网格元数据
        const g = cell?.data?.grid || cell
        // 优先从 bounds 取（兼容 snake_case max_latitude / camelCase maxlat）
        const b = g.bounds
        const north = g.maxlat ?? b?.max_latitude ?? b?.north
        const south = g.minlat ?? b?.min_latitude ?? b?.south
        const east = g.maxlon ?? b?.max_longitude ?? b?.east
        const west = g.minlon ?? b?.min_longitude ?? b?.west
        const top = g.top ?? b?.top ?? 0
        const bottom = g.bottom ?? b?.bottom ?? 0
        const center = g.center_point || g.center

        return {
          code: String(g.code || cell.code || ''),
          level: g.level,
          z: g.level,
          bounds: { north, south, east, west, top, bottom },
          center,
        }
      })

      console.log('[空域网格查询] 转换后的 cells 前3条:', JSON.stringify(cells.slice(0, 3)))
      emit('showGrid', { cells, level: queryLevel, runtime })
    }
  } catch (err) {
    if (err?.name === 'AbortError') {
      error.value = manualTimedOut
        ? '请求超时（60s），后端可能正在处理大量格网，请缩小区域或降低层级后重试'
        : '查询已取消'
      console.warn('[空域网格查询] 请求被中止:', manualTimedOut ? '超时' : '用户取消')
    } else {
      console.error('[空域网格查询] 请求错误:', err)
      error.value = err?.message || '请求失败，请稍后重试'
    }
  } finally {
    // 清理超时定时器和 controller 引用
    if (manualTimeoutId) {
      clearTimeout(manualTimeoutId)
      manualTimeoutId = null
    }
    manualAbortController = null
    loading.value = false
  }
}

function clearGrids() {
  emit('showGrid', { cells: [] })
  result.value = null
  queryStats.value = null
  gridsData.value = []
}
</script>

<template>
  <div class="airspace-grid-query">
    <template v-if="functionName === '空域网格查询'">
      <!-- 层级设置 -->
      <div class="form-group">
        <div class="group-title">层级设置</div>
        <div class="level-row">
          <select
            id="agq-level"
            v-model.number="airspaceGridForm.level"
            class="level-select"
          >
            <option :value="null" disabled>选择层级</option>
            <option v-for="lvl in 22" :key="lvl - 1" :value="lvl - 1">{{ lvl - 1 }}</option>
          </select>
        </div>
      </div>

      <!-- 空域ID -->
      <div class="form-group">
        <div class="group-title">空域ID</div>
        <input
          v-model="airspaceGridForm.airspaceId"
          type="text"
          class="airspace-id-input"
          placeholder="请输入空域ID"
        >
      </div>

      <!-- 查询边界 -->
      <div class="form-group">
        <div class="group-title">查询边界</div>
        <div class="coord-grid">
          <div class="coord-line">
            <span class="coord-label">西</span>
            <input
              v-model.number="airspaceGridForm.minLon"
              type="number"
              step="0.0001"
              placeholder="经度"
            >
            <span class="coord-label">东</span>
            <input
              v-model.number="airspaceGridForm.maxLon"
              type="number"
              step="0.0001"
              placeholder="经度"
            >
          </div>
          <div class="coord-line">
            <span class="coord-label">南</span>
            <input
              v-model.number="airspaceGridForm.minLat"
              type="number"
              step="0.0001"
              placeholder="纬度"
            >
            <span class="coord-label">北</span>
            <input
              v-model.number="airspaceGridForm.maxLat"
              type="number"
              step="0.0001"
              placeholder="纬度"
            >
          </div>
        </div>
        <button class="btn-view" @click="requestViewBounds" :disabled="loading">
          获取当前视图
        </button>
        <!-- 动态缩放开关 -->
        <button
          class="btn-dynamic-zoom"
          :class="{ active: dynamicZoomEnabled }"
          @click="toggleDynamicZoom"
          :disabled="loading"
          type="button"
        >
          <ZoomIn :size="14" />
          <span>{{ dynamicZoomEnabled ? '关闭动态缩放' : '开启动态缩放' }}</span>
          <Loader2 v-if="dynamicLoading" :size="12" class="spin" />
        </button>
      </div>

      <!-- 高程参数 -->
      <div class="form-group">
        <div class="group-title">高程参数</div>
        <div class="height-grid">
          <div class="coord-line">
            <span class="coord-label">底</span>
            <div class="param-input-combo">
              <input
                v-model.number="airspaceGridForm.bottom"
                type="number"
                step="10"
                min="0"
                max="120"
                class="height-input"
                placeholder="输入值"
              >
              <select
                class="param-preset-select"
                @change="onBottomPresetChange"
              >
                <option value="">快选</option>
                <option v-for="h in heightPresetOptions" :key="`bottom-${h}`" :value="h">{{ h }}</option>
              </select>
            </div>
          </div>
          <div class="coord-line">
            <span class="coord-label">顶</span>
            <div class="param-input-combo">
              <input
                v-model.number="airspaceGridForm.top"
                type="number"
                step="10"
                min="0"
                max="120"
                class="height-input"
                placeholder="输入值"
              >
              <select
                class="param-preset-select"
                @change="onTopPresetChange"
              >
                <option value="">快选</option>
                <option v-for="h in heightPresetOptions" :key="`top-${h}`" :value="h">{{ h }}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="btn-row">
        <button class="btn-query" @click="submitAirspaceGridQuery" :disabled="loading">
          <span>{{ loading ? '查询中...' : '查询' }}</span>
        </button>
        <button v-if="loading" class="btn-cancel" @click="cancelManualQuery" type="button">
          <span>取消</span>
        </button>
        <button v-else class="btn-clear" @click="clearGrids" :disabled="!result">
          <span>清除网格</span>
        </button>
      </div>

      <!-- 错误提示 -->
      <div v-if="error" class="error-box">{{ error }}</div>

      <!-- 查询结果 -->
      <div v-if="queryStats" class="result-box">
        <div class="result-row">
          <span class="result-label">网格数量</span>
          <span class="result-num">{{ queryStats.total }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">状态</span>
          <span class="result-status" :class="queryStats.status === 'success' ? 'success' : ''">
            {{ queryStats.status === 'success' ? '成功' : queryStats.status }}
          </span>
        </div>
        <!-- 动态缩放耗时 -->
        <div v-if="dynamicZoomEnabled && dynamicRuntime > 0" class="result-row runtime-row">
          <span class="result-label">缩放耗时</span>
          <span class="result-num runtime-num" :class="{ slow: dynamicRuntime > 1000 }">{{ dynamicRuntime }} ms</span>
        </div>
      </div>

      <!-- 动态缩放提示 -->
      <div v-if="dynamicZoomEnabled" class="dynamic-zoom-hint">
        <Loader2 v-if="dynamicLoading" :size="12" class="spin" />
        <span>{{ dynamicLoading ? '正在根据视图加载格网...' : '移动/缩放地图即可自动刷新格网' }}</span>
      </div>

      <!-- 无数据 -->
      <div v-if="result?.data && gridsData.length === 0" class="empty-box">
        该区域未查询到网格数据
      </div>
    </template>
  </div>
</template>

<style scoped>
.airspace-grid-query {
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

/* 层级选择 */
.level-row {
  display: flex;
  align-items: center;
}

.level-select {
  flex: 1;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 14px;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}

.level-select:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
}

/* 空域ID输入 */
.airspace-id-input {
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

.airspace-id-input::placeholder {
  color: #999;
}

.airspace-id-input:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
}

/* 坐标网格 */
.coord-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.coord-line {
  display: flex;
  align-items: center;
  gap: 4px;
}

.coord-label {
  width: 22px;
  font-size: 14px;
  color: #334155;
  text-align: center;
  flex-shrink: 0;
}

.coord-line input {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 14px;
}

.coord-line input::placeholder {
  color: #999;
}

.coord-line input:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
}

/* 高程参数 */
.height-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.param-input-combo {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.height-input {
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

.height-input:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
}

.height-input::placeholder {
  color: #999;
}

.param-preset-select {
  flex: 0 0 56px;
  height: 34px;
  padding: 0 6px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #f5f3f0;
  color: #475569;
  font-size: 13px;
  cursor: pointer;
  box-sizing: border-box;
}

.param-preset-select:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
}

/* 获取视图按钮 */
.btn-view {
  width: 100%;
  height: 36px;
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f5f3f0;
  color: #334155;
  font-size: 14px;
  cursor: pointer;
}

.btn-view:hover:not(:disabled) {
  background: #e8e8e8;
}

.btn-view:disabled {
  color: #999;
  cursor: not-allowed;
}

/* 动态缩放按钮 */
.btn-dynamic-zoom {
  width: 100%;
  height: 36px;
  margin-top: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f5f3f0;
  color: #334155;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-dynamic-zoom:hover:not(:disabled) {
  background: #e8f0fe;
  border-color: #7db8e0;
}

.btn-dynamic-zoom.active {
  background: linear-gradient(135deg, #7db8e0, #5b9fd4);
  border-color: #5b9fd4;
  color: #fff;
}

.btn-dynamic-zoom.active:hover {
  background: linear-gradient(135deg, #6aa8d4, #4a8fc4);
}

.btn-dynamic-zoom:disabled {
  color: #999;
  cursor: not-allowed;
}

/* 动态缩放耗时 */
.result-row.runtime-row {
  flex: 0 0 auto;
  min-width: 100px;
}

.runtime-num {
  font-variant-numeric: tabular-nums;
  color: #059669;
}

.runtime-num.slow {
  color: #dc2626;
}

/* 动态缩放提示 */
.dynamic-zoom-hint {
  margin-top: 8px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #5b9fd4;
  background: #eef6fc;
  border: 1px solid #cfe3f4;
  border-radius: 6px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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

/* 取消按钮 */
.btn-cancel {
  width: 88px;
  white-space: nowrap;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #fca5a5;
  color: #dc2626;
  font-size: 15px;
  cursor: pointer;
}

.btn-cancel:hover {
  background: #fef2f2;
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
  gap: 8px;
}

.result-row {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid #ddd;
  background: #f9f9f9;
}

.result-label {
  font-size: 13px;
  color: #64748b;
}

.result-num {
  font-size: 18px;
  font-weight: 600;
  color: #334155;
}

.result-status {
  font-size: 15px;
  font-weight: 600;
  color: #c00;
}

.result-status.success {
  color: #060;
}

/* 空状态 */
.empty-box {
  padding: 16px;
  text-align: center;
  color: #64748b;
  font-size: 14px;
  border: 1px dashed #d4c9b8;
  border-radius: 8px;
}
</style>
