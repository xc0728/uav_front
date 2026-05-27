<script setup>
import { reactive, ref, computed, watch } from 'vue'
import { Loader2, Trash2, MapPin } from 'lucide-vue-next'

const props = defineProps({
  serviceName: {
    type: String,
    default: '立体导航网格聚合服务'
  },
  functionName: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['close', 'showPoint', 'showGrid'])

// ==================== 多粒度混合适网建模 ====================
const polygonForm = reactive({
  level: 8,
  bottom: 0,
  top: 20,
  aggregate: false,
  minLevel: 0,
})

// 存储多边形顶点
const polygonPoints = ref([])

const polygonLoading = ref(false)
const polygonError = ref('')
const polygonResult = ref(null)
const queryStats = ref(null)

// ==================== 倾斜摄影多源聚合网格查询 ====================
const osgbAggGridForm = reactive({
  level: 9,
  minLevel: 0,
})

const GRID_LEVEL_MAX = 21
const gridLevelOptions = Array.from({ length: GRID_LEVEL_MAX + 1 }, (_, i) => i)

/** 高度快选：0–120 整十 */
const heightPresetOptions = Array.from({ length: 13 }, (_, i) => i * 10)

function onBottomPresetChange(event) {
  const val = event.target.value
  if (val !== '') {
    polygonForm.bottom = Number(val)
  }
  event.target.selectedIndex = 0
}

function onTopPresetChange(event) {
  const val = event.target.value
  if (val !== '') {
    polygonForm.top = Number(val)
  }
  event.target.selectedIndex = 0
}

const osgbAggMinLevelOptions = computed(() => {
  const max = Number(osgbAggGridForm.level)
  if (Number.isNaN(max) || max < 0) return [0]
  return Array.from({ length: Math.min(max, GRID_LEVEL_MAX) + 1 }, (_, i) => i)
})

const polygonMinLevelOptions = computed(() => {
  const max = Number(polygonForm.level)
  if (Number.isNaN(max) || max < 0) return [0]
  return Array.from({ length: Math.min(max, GRID_LEVEL_MAX) + 1 }, (_, i) => i)
})

watch(
  () => osgbAggGridForm.level,
  (level) => {
    const max = Number(level)
    if (!Number.isNaN(max) && osgbAggGridForm.minLevel > max) {
      osgbAggGridForm.minLevel = max
    }
  },
)

watch(
  () => polygonForm.level,
  (level) => {
    const max = Number(level)
    if (!Number.isNaN(max) && polygonForm.minLevel > max) {
      polygonForm.minLevel = max
    }
  },
)

const osgbAggLoading = ref(false)
const osgbAggError = ref('')
const osgbAggResult = ref(null)
const osgbAggStats = ref(null)
const osgbAggGridsData = ref([])

// 统一的基础颜色配置（暖色 -> 冷色）
// 索引 0-10 对应层级 4-14（数字越小格子越大 = 越暖）
const baseLevelColors = [
  '#ef4444',  // 0 - 红色（最大格子）
  '#f97316',  // 1 - 橙色
  '#f59e0b',  // 2 - 黄色
  '#65a30d',  // 3 - 深绿
  '#22c55e',  // 4 - 绿色
  '#14b8a6',  // 5 - 青色
  '#06b6d4',  // 6 - 浅青
  '#0ea5e9',  // 7 - 天蓝
  '#3b82f6',  // 8 - 蓝色
  '#8b5cf6',  // 9 - 紫色
  '#ec4899',  // 10 - 粉色（最小格子）
]

// 聚合网格层级颜色映射（与 baseLevelColors 一致，0-21 映射到 0-10）
// 大网格 -> 暖色（红/橙/黄），小网格 -> 冷色（青/蓝/紫）
const aggLevelColors = [
  '#ef4444',  // 0 -> 0 - 红色
  '#f97316',  // 1 -> 1 - 橙色
  '#f59e0b',  // 2 -> 2 - 黄色
  '#65a30d',  // 3 -> 3 - 深绿
  '#22c55e',  // 4 -> 4 - 绿色
  '#14b8a6',  // 5 -> 5 - 青色
  '#06b6d4',  // 6 -> 6 - 浅青
  '#0ea5e9',  // 7 -> 7 - 天蓝
  '#3b82f6',  // 8 -> 8 - 蓝色
  '#8b5cf6',  // 9 -> 9 - 紫色
  '#ec4899',  // 10 -> 10 - 粉色
  '#c084fc',  // 11 -> 淡紫
  '#a78bfa',  // 12 -> 浅紫
  '#818cf8',  // 13 -> 蓝紫
  '#6366f1',  // 14 -> 靛蓝
  '#4f46e5',  // 15 -> 深蓝
  '#4338ca',  // 16 -> 更深蓝
  '#3730a3',  // 17 -> 近靛蓝
  '#312e81',  // 18 -> 深靛蓝
  '#1e1b4b',  // 19 -> 暗蓝
  '#0f172a',  // 20 -> 近黑蓝
  '#020617',  // 21 -> 深黑（最小格子）
]

// 根据网格跨度获取颜色（跨度越大颜色越暖）
function getColorBySpan(lonSpan, latSpan) {
  // 计算平均跨度
  const avgSpan = (lonSpan + latSpan) / 2

  // 使用对数比例将跨度映射到颜色索引
  // 假设跨度范围从 0.00001 度（很小）到 0.1 度（很大）
  const minSpan = 0.00001
  const maxSpan = 0.1

  // 对数比例映射
  const logMin = Math.log10(minSpan)
  const logMax = Math.log10(maxSpan)
  const logSpan = Math.log10(Math.max(minSpan, Math.min(maxSpan, avgSpan)))

  // 归一化到 0-21
  const normalized = (logSpan - logMin) / (logMax - logMin)
  const colorIndex = Math.round(normalized * 21)

  return aggLevelColors[Math.max(0, Math.min(21, colorIndex))]
}

// ==================== 多粒度混合适网建模 变量（已在上方定义） ====================

// 层级到颜色的映射（level 4-14，数字越小格子越大）
// 大网格 -> 暖色（红/橙/黄/深绿），小网格 -> 冷色（青/蓝/紫）
const levelColors = {
  4: '#ef4444',  // 红色（最大格子）
  5: '#f97316',  // 橙色
  6: '#f59e0b',  // 黄色
  7: '#65a30d',  // 深绿
  8: '#22c55e',  // 绿色
  9: '#14b8a6',  // 青色
  10: '#06b6d4', // 浅青
  11: '#0ea5e9', // 天蓝
  12: '#3b82f6', // 蓝色
  13: '#8b5cf6', // 紫色
  14: '#ec4899', // 粉色（最小格子）
}

// 根据网格尺寸估算层级
// 原理：不同层级的网格有不同的经纬度跨度
// 通过分析返回数据中的跨度分布来确定实际层级
function estimateLevel(cell, allCells = []) {
  const lonSpan = Math.abs(cell.maxlon - cell.minlon)
  const latSpan = Math.abs(cell.maxlat - cell.minlat)
  const span = (lonSpan + latSpan) / 2

  if (span <= 0) return 8

  // 如果有所有格网数据，先计算实际的跨度分布
  if (allCells && allCells.length > 0) {
    // 计算所有格网的跨度范围
    const allSpans = allCells.map(c => {
      const ls = Math.abs(c.maxlon - c.minlon)
      const las = Math.abs(c.maxlat - c.minlat)
      return (ls + las) / 2
    })
    const minSpan = Math.min(...allSpans)
    const maxSpan = Math.max(...allSpans)
    const uniqueSpans = new Set(allSpans.map(s => parseFloat(s.toFixed(10))))
    const uniqueSpanCount = uniqueSpans.size

    console.log(`[estimateLevel] 跨度范围: minSpan=${minSpan.toFixed(8)}, maxSpan=${maxSpan.toFixed(8)}, uniqueCount=${uniqueSpanCount}`)

    // 如果所有格网大小相同，返回中间层级（蓝色）
    if (uniqueSpanCount === 1) {
      console.log('[estimateLevel] 所有格网大小相同，返回默认层级8')
      return 8
    }

    // 计算跨度范围
    const spanRange = maxSpan - minSpan

    // 如果跨度范围足够大，进行分级
    if (spanRange > 0.0000001) { // 足够小的阈值避免精度问题
      // 计算当前跨度在分布中的相对位置 (0-1)
      // span 最大 -> 位置 0 (level 4, 红色)
      // span 最小 -> 位置 1 (level 14, 粉色)
      const relativePosition = (maxSpan - span) / spanRange
      // 映射到 4-14 层级
      const estimatedLevel = Math.round(4 + relativePosition * 10)
      const clampedLevel = Math.max(4, Math.min(14, estimatedLevel))
      console.log(`[estimateLevel] relativePosition=${relativePosition.toFixed(3)}, estimatedLevel=${clampedLevel}`)
      return clampedLevel
    }
  }

  // 如果没有所有格网数据，使用对数比例估算
  // level 8 的参考跨度约为 0.001度（约100米）
  const refSpan = 0.001
  // 每增加一个层级，格子大小约减半
  const levelDiff = Math.log2(span / refSpan)
  // 格子越大 level 越小
  const estimated = Math.max(4, Math.min(14, Math.round(8 - levelDiff)))
  console.log(`[estimateLevel] 使用对数估算: span=${span.toFixed(8)}, refSpan=${refSpan}, levelDiff=${levelDiff.toFixed(2)}, estimated=${estimated}`)
  return estimated
}

// 获取跨度大小分类
function getSizeCategory(span) {
  if (span < 0.0001) return 'tiny'
  if (span < 0.001) return 'small'
  if (span < 0.01) return 'medium'
  if (span < 0.1) return 'large'
  return 'huge'
}

// 根据层级获取颜色
function getColorByLevel(level) {
  const roundedLevel = Math.round(level)
  return levelColors[roundedLevel] || levelColors[8]
}

// 验证表单
const canSubmit = computed(() => {
  if (polygonPoints.value.length < 3) return false
  if (!Number.isFinite(Number(polygonForm.level))) return false
  if (!Number.isFinite(Number(polygonForm.bottom))) return false
  if (!Number.isFinite(Number(polygonForm.top))) return false
  return true
})

// 层级分布统计
const levelDistribution = computed(() => {
  if (!polygonResult.value?.data?.cells) return null
  const cells = polygonResult.value.data.cells
  const dist = {}
  cells.forEach(cell => {
    const level = estimateLevel(cell)
    dist[level] = (dist[level] || 0) + 1
  })
  // 按层级排序
  return Object.entries(dist)
    .map(([level, count]) => ({ level: Number(level), count }))
    .sort((a, b) => a.level - b.level)
})

// 标准化点数据
function normalizePoint(p) {
  const lon = Number(Number(p.lon).toFixed(10))
  const lat = Number(Number(p.lat).toFixed(10))
  const height = Number(Number(p.height ?? 0).toFixed(1))
  return { lon, lat, height }
}

function resetForm() {
  if (props.functionName === '多粒度混合格网建模') {
    polygonError.value = ''
    polygonResult.value = null
    queryStats.value = null
    polygonPoints.value = []
  }
  if (props.functionName === '倾斜摄影多源聚合网格查询') {
    osgbAggError.value = ''
    osgbAggResult.value = null
    osgbAggStats.value = null
    osgbAggGridsData.value = []
  }
}

function setPointFromMap(lon, lat, height) {
  if (props.functionName !== '多粒度混合格网建模') return

  polygonPoints.value.push(normalizePoint({ lon, lat, height }))

  console.log('[多粒度混合适网建模] 添加点:', lon, lat, height)
}

function removePoint(index) {
  polygonPoints.value.splice(index, 1)
}

function clearPoints() {
  polygonPoints.value = []
}

// ==================== 倾斜摄影多源聚合网格查询提交 ====================
async function submitOsgbAggGridQuery() {
  osgbAggError.value = ''
  osgbAggResult.value = null
  osgbAggStats.value = null

  const level = Number(osgbAggGridForm.level)
  const minLevel = Number(osgbAggGridForm.minLevel)
  if (Number.isNaN(level) || level < 0 || level > GRID_LEVEL_MAX) {
    osgbAggError.value = '请选择有效的网格层级'
    return
  }
  if (Number.isNaN(minLevel) || minLevel < 0 || minLevel > level) {
    osgbAggError.value = '最小层级不能大于网格层级'
    return
  }

  osgbAggLoading.value = true

  try {
    const payload = {
      level,
      minLevel: minLevel || 0,
    }

    console.log('[倾斜摄影多源聚合网格查询] 发送 payload:', payload)

    const resp = await fetch('/api/multiSource/triangleGrid/queryOsgbGridAggregation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error('[倾斜摄影多源聚合网格查询] 错误响应:', errText)
      throw new Error(`请求失败，状态码 ${resp.status}: ${errText}`)
    }

    const data = await resp.json()
    console.log('[倾斜摄影多源聚合网格查询] 原始返回:', data)
    osgbAggResult.value = data

    // 解析返回数据
    let parsedCount = 0
    if (data?.data) {
      if (Array.isArray(data.data)) {
        console.log('[倾斜摄影多源聚合网格查询] data.data 是数组，长度:', data.data.length)
        osgbAggGridsData.value = data.data
        parsedCount = data.data.length
      } else if (typeof data.data === 'object') {
        console.log('[倾斜摄影多源聚合网格查询] data.data 是对象，keys:', Object.keys(data.data))
        osgbAggGridsData.value = data.data.grids || data.data.cells || data.data.features || data.data.items || []
        parsedCount = osgbAggGridsData.value.length
      }
    }

    console.log('[倾斜摄影多源聚合网格查询] 最终解析的 gridsData 长度:', parsedCount)

    osgbAggStats.value = {
      total: parsedCount,
      status: data?.status || 'unknown',
      level: data?.data?.level,
      minLevel: data?.data?.minLevel,
      tableName: data?.data?.table_name,
    }

    // 如果返回了格网数据，通知地图组件显示
    if (osgbAggGridsData.value.length > 0) {
      // 先计算所有网格的跨度分布，用于确定大小分级
      const spans = osgbAggGridsData.value.map(cell => {
        const lonSpan = Math.abs(cell.maxlon - cell.minlon)
        const latSpan = Math.abs(cell.maxlat - cell.minlat)
        return (lonSpan + latSpan) / 2
      })
      const minSpan = Math.min(...spans)
      const maxSpan = Math.max(...spans)
      console.log(`[倾斜摄影多源聚合网格查询] 跨度范围: min=${minSpan.toFixed(8)}, max=${maxSpan.toFixed(8)}`)

      const cells = osgbAggGridsData.value.map((cell, idx) => {
        if (cell.bounds) return cell

        // 计算网格跨度
        const lonSpan = Math.abs(cell.maxlon - cell.minlon)
        const latSpan = Math.abs(cell.maxlat - cell.minlat)
        const avgSpan = (lonSpan + latSpan) / 2

        // 根据跨度获取颜色
        const color = getColorBySpan(lonSpan, latSpan)

        // 前5个格网输出调试信息
        if (idx < 5) {
          console.log(`[倾斜摄影多源聚合网格查询] 格网${idx + 1}: code=${cell.code}, z=${cell.z}, span=${avgSpan.toFixed(8)}, color=${color}, bounds=(W:${cell.minlon?.toFixed(6)}, S:${cell.minlat?.toFixed(6)}, E:${cell.maxlon?.toFixed(6)}, N:${cell.maxlat?.toFixed(6)})`)
        }

        // 后端返回的字段：center, minlat, maxlat, minlon, maxlon, top, bottom
        // 需要转换为 bounds 格式：north, south, east, west, top, bottom
        return {
          bounds: {
            north: cell.maxlat,
            south: cell.minlat,
            east: cell.maxlon,
            west: cell.minlon,
            top: cell.top !== undefined ? cell.top : (cell.center ? cell.center[2] : 0),
            bottom: cell.bottom !== undefined ? cell.bottom : 0,
          },
          z: cell.z,
          color: color
        }
      })

      // 统计颜色分布（用于验证）
      const colorCount = {}
      cells.forEach(c => {
        colorCount[c.color] = (colorCount[c.color] || 0) + 1
      })
      console.log('[倾斜摄影多源聚合网格查询] 颜色分布:', colorCount)

      console.log('[倾斜摄影多源聚合网格查询] 转换后的 cells 前3条:', JSON.stringify(cells.slice(0, 3)))
      emit('showGrid', { cells })
    } else {
      console.log('[倾斜摄影多源聚合网格查询] gridsData 为空，不发送 showGrid 事件')
    }
  } catch (err) {
    console.error('[倾斜摄影多源聚合网格查询] 请求错误:', err)
    osgbAggError.value = err?.message || '请求失败，请稍后重试'
  } finally {
    osgbAggLoading.value = false
  }
}

function clearOsgbAggGrids() {
  emit('showGrid', { cells: [] })
  osgbAggResult.value = null
  osgbAggStats.value = null
  osgbAggGridsData.value = []
}

defineExpose({ resetForm, setPointFromMap })

async function submitPolygonGrid() {
  polygonError.value = ''
  polygonResult.value = null
  queryStats.value = null

  // 验证多边形
  if (polygonPoints.value.length < 3) {
    polygonError.value = '请至少添加3个点组成多边形'
    return
  }

  const level = Number(polygonForm.level)
  const minLevel = Number(polygonForm.minLevel)
  if (Number.isNaN(level) || level < 0 || level > GRID_LEVEL_MAX) {
    polygonError.value = '请选择有效的网格层级'
    return
  }
  if (polygonForm.aggregate && (Number.isNaN(minLevel) || minLevel < 0 || minLevel > level)) {
    polygonError.value = '最小层级不能大于网格层级'
    return
  }

  if (polygonForm.bottom === undefined || polygonForm.top === undefined) {
    polygonError.value = '请输入底面和顶面高度'
    return
  }

  polygonLoading.value = true

  try {
    // 构建闭合多边形坐标数组 [[lon, lat], ...]
    const polygonCoords = polygonPoints.value.map(p => [p.lon, p.lat])
    // 闭合多边形：首尾点相同
    if (polygonCoords.length > 0) {
      polygonCoords.push([polygonCoords[0][0], polygonCoords[0][1]])
    }

    const payload = {
      polygon: polygonCoords,
      level,
      bottom: Number(polygonForm.bottom),
      top: Number(polygonForm.top),
      aggregate: Boolean(polygonForm.aggregate),
    }

    if (polygonForm.aggregate && minLevel > 0) {
      payload.minLevel = minLevel
    }

    console.log('[多粒度混合适网建模] 发送 payload:', payload)

    const resp = await fetch('/api/multiSource/geometricGrid/getGridByPolygonAndHeight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error('[多粒度混合适网建模] 错误响应:', errText)
      throw new Error(`请求失败，状态码 ${resp.status}: ${errText}`)
    }

    const data = await resp.json()
    console.log('[多粒度混合适网建模] 原始返回:', data)
    polygonResult.value = data

    // 解析返回数据
    const cells = data?.data?.cells || []
    const count = data?.data?.count || 0

    queryStats.value = {
      total: count,
      status: data?.status || 'unknown',
      aggregated: data?.data?.aggregated || false,
    }

    // 转换为 CesiumMap 期望的格式，并估算每个网格的层级
    if (cells.length > 0) {
      // 先计算所有格网的跨度分布，用于更准确地估算层级
      const allSpans = cells.map(c => {
        const ls = Math.abs(c.maxlon - c.minlon)
        const las = Math.abs(c.maxlat - c.minlat)
        return (ls + las) / 2
      })
      const minSpan = Math.min(...allSpans)
      const maxSpan = Math.max(...allSpans)
      const uniqueSpanCount = new Set(allSpans.map(s => s.toFixed(8))).size

      console.log(`[多粒度混合适网建模] 跨度统计: 最小=${minSpan.toFixed(6)}, 最大=${maxSpan.toFixed(6)}, 不同跨度数=${uniqueSpanCount}`)

      const convertedCells = cells.map((cell, idx) => {
        const level = estimateLevel(cell, cells)
        const color = getColorByLevel(level)

        // 输出前几个格网的调试信息
        if (idx < 5) {
          const span = (Math.abs(cell.maxlon - cell.minlon) + Math.abs(cell.maxlat - cell.minlat)) / 2
          console.log(`[多粒度混合适网建模] 格网${idx + 1}: 跨度=${span.toFixed(6)} -> level=${level} -> 颜色=${color}`)
        }
        return {
          bounds: {
            north: cell.maxlat,
            south: cell.minlat,
            east: cell.maxlon,
            west: cell.minlon,
            top: cell.top,
            bottom: cell.bottom,
          },
          level: level,
          color: color
        }
      })

      // 输出层级分布统计
      const levelCount = {}
      convertedCells.forEach(c => {
        levelCount[c.level] = (levelCount[c.level] || 0) + 1
      })
      console.log('[多粒度混合适网建模] 层级分布:', levelCount)

      emit('showGrid', { cells: convertedCells })
    }
  } catch (err) {
    console.error('[多粒度混合适网建模] 请求错误:', err)
    polygonError.value = err?.message || '请求失败，请稍后重试'
  } finally {
    polygonLoading.value = false
  }
}

function clearGrids() {
  emit('showGrid', { cells: [] })
  polygonResult.value = null
  queryStats.value = null
}
</script>

<template>
  <div class="calc-content">
    <div v-if="functionName === '多粒度混合格网建模'" class="hybrid-grid-query">
      <div class="hint-box">
        <MapPin :size="14" />
        <span>点击地图添加多边形顶点（至少 3 个点组成闭合多边形）</span>
      </div>

      <div class="form-group">
        <div class="group-title-row">
          <span class="group-title">多边形顶点</span>
          <span class="group-sub">({{ polygonPoints.length }} 个)</span>
          <button
            type="button"
            class="btn-link-clear"
            :disabled="polygonPoints.length === 0"
            @click="clearPoints"
          >
            清空
          </button>
        </div>

        <div v-if="polygonPoints.length === 0" class="empty-hint">
          暂无顶点，请点击地图添加
        </div>

        <div v-else class="points-list">
          <div v-for="(point, idx) in polygonPoints" :key="idx" class="point-card">
            <div class="point-card-header">
              <span class="point-index-badge">{{ idx + 1 }}</span>
              <button
                type="button"
                class="btn-point-delete"
                title="删除此点"
                @click="removePoint(idx)"
              >
                <Trash2 :size="14" />
              </button>
            </div>
            <div class="point-fields">
              <div class="field">
                <span class="field-label">经度</span>
                <input
                  v-model.number="polygonPoints[idx].lon"
                  class="field-input"
                  type="number"
                  step="any"
                  placeholder="经度"
                >
              </div>
              <div class="field">
                <span class="field-label">纬度</span>
                <input
                  v-model.number="polygonPoints[idx].lat"
                  class="field-input"
                  type="number"
                  step="any"
                  placeholder="纬度"
                >
              </div>
              <div class="field">
                <span class="field-label">高度(m)</span>
                <input
                  v-model.number="polygonPoints[idx].height"
                  class="field-input"
                  type="number"
                  step="any"
                  placeholder="高度"
                >
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="form-group">
        <div class="group-title">高度范围</div>
        <div class="param-line">
          <span class="param-label">底面高</span>
          <div class="param-input-combo">
            <input
              id="pg-bottom"
              v-model.number="polygonForm.bottom"
              type="number"
              step="any"
              class="param-input"
              placeholder="手动输入"
            >
            <select
              class="param-preset-select"
              aria-label="底面高度快选"
              @change="onBottomPresetChange"
            >
              <option value="">快选</option>
              <option
                v-for="h in heightPresetOptions"
                :key="`bottom-${h}`"
                :value="h"
              >
                {{ h }}
              </option>
            </select>
          </div>
        </div>
        <div class="param-line">
          <span class="param-label">顶面高</span>
          <div class="param-input-combo">
            <input
              id="pg-top"
              v-model.number="polygonForm.top"
              type="number"
              step="any"
              class="param-input"
              placeholder="手动输入"
            >
            <select
              class="param-preset-select"
              aria-label="顶面高度快选"
              @change="onTopPresetChange"
            >
              <option value="">快选</option>
              <option
                v-for="h in heightPresetOptions"
                :key="`top-${h}`"
                :value="h"
              >
                {{ h }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <div class="form-group">
        <div class="group-title">网格参数</div>
        <div class="param-line">
          <span class="param-label">层级</span>
          <select
            id="pg-level"
            v-model.number="polygonForm.level"
            class="param-select"
          >
            <option
              v-for="lv in gridLevelOptions"
              :key="`pg-level-${lv}`"
              :value="lv"
            >
              层级 {{ lv }}
            </option>
          </select>
        </div>
        <div class="param-line param-line-checkbox">
          <label class="checkbox-label">
            <input
              v-model="polygonForm.aggregate"
              type="checkbox"
              class="checkbox-input"
            >
            <span class="checkbox-text">开启聚合</span>
          </label>
        </div>
        <div v-if="polygonForm.aggregate" class="param-line">
          <span class="param-label">最小层级</span>
          <select
            id="pg-minLevel"
            v-model.number="polygonForm.minLevel"
            class="param-select"
          >
            <option
              v-for="lv in polygonMinLevelOptions"
              :key="`pg-min-${lv}`"
              :value="lv"
            >
              层级 {{ lv }}
            </option>
          </select>
        </div>
      </div>

      <div class="btn-row">
        <button
          type="button"
          class="btn-query"
          :disabled="polygonLoading || !canSubmit"
          @click="submitPolygonGrid"
        >
          <Loader2 v-if="polygonLoading" :size="16" class="spin" />
          <span>{{ polygonLoading ? '计算中...' : '计算' }}</span>
        </button>
        <button
          type="button"
          class="btn-clear"
          :disabled="!polygonResult"
          @click="clearGrids"
        >
          <span>清除网格</span>
        </button>
      </div>

      <div v-if="polygonError" class="error-box">{{ polygonError }}</div>

      <div v-if="queryStats" class="result-box">
        <div class="result-row">
          <span class="result-label">网格数量</span>
          <span class="result-num">{{ queryStats.total }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">状态</span>
          <span
            class="result-status"
            :class="{ success: queryStats.status === 'success' }"
          >
            {{ queryStats.status === 'success' ? '成功' : queryStats.status }}
          </span>
        </div>
        <div v-if="queryStats.aggregated" class="result-row">
          <span class="result-label">聚合</span>
          <span class="result-status success">已聚合</span>
        </div>
      </div>
    </div>

    <!-- ==================== 倾斜摄影多源聚合网格查询 ==================== -->
    <div v-if="functionName === '倾斜摄影多源聚合网格查询'" class="osgb-agg-query">
      <div class="form-group">
        <div class="group-title">查询参数</div>
        <div class="param-line">
          <span class="param-label">层级</span>
          <select
            id="oag-level"
            v-model.number="osgbAggGridForm.level"
            class="param-select"
          >
            <option
              v-for="lv in gridLevelOptions"
              :key="`level-${lv}`"
              :value="lv"
            >
              层级 {{ lv }}
            </option>
          </select>
        </div>
        <div class="param-line">
          <span class="param-label">最小层级</span>
          <select
            id="oag-minLevel"
            v-model.number="osgbAggGridForm.minLevel"
            class="param-select"
          >
            <option
              v-for="lv in osgbAggMinLevelOptions"
              :key="`min-${lv}`"
              :value="lv"
            >
              层级 {{ lv }}
            </option>
          </select>
        </div>
      </div>

      <div class="btn-row">
        <button
          type="button"
          class="btn-query"
          :disabled="osgbAggLoading"
          @click="submitOsgbAggGridQuery"
        >
          <Loader2 v-if="osgbAggLoading" :size="16" class="spin" />
          <span>{{ osgbAggLoading ? '查询中...' : '查询' }}</span>
        </button>
        <button
          type="button"
          class="btn-clear"
          :disabled="!osgbAggResult"
          @click="clearOsgbAggGrids"
        >
          <span>清除网格</span>
        </button>
      </div>

      <div v-if="osgbAggError" class="error-box">{{ osgbAggError }}</div>

      <div v-if="osgbAggStats" class="result-box">
        <div class="result-row">
          <span class="result-label">网格数量</span>
          <span class="result-num">{{ osgbAggStats.total }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">状态</span>
          <span
            class="result-status"
            :class="{ success: osgbAggStats.status === 'success' }"
          >
            {{ osgbAggStats.status === 'success' ? '成功' : osgbAggStats.status }}
          </span>
        </div>
        <div v-if="osgbAggStats.level !== undefined" class="result-row">
          <span class="result-label">网格层级</span>
          <span class="result-num">{{ osgbAggStats.level }}</span>
        </div>
        <div v-if="osgbAggStats.minLevel !== undefined" class="result-row">
          <span class="result-label">最小聚合层级</span>
          <span class="result-num">{{ osgbAggStats.minLevel }}</span>
        </div>
      </div>

      <div v-if="osgbAggResult?.data && osgbAggGridsData.length === 0" class="empty-box">
        未查询到聚合网格数据
      </div>
    </div>
  </div>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #eef6fc;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  color: #4a7eb0;
  font-size: 13px;
}

/* 顶点列表区域 */
.points-section {
  background: #f5f3f0;
  border-radius: 8px;
  border: 1px solid #ebe6df;
  padding: 10px 10px 10px 12px;
  overflow-x: hidden;
}

.points-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #4a7eb0;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #e8e4df;
}

.points-count {
  font-weight: 400;
  color: #94a3b8;
  font-size: 12px;
}

.clear-btn {
  margin-left: auto;
}

.empty-hint {
  padding: 16px;
  text-align: center;
  color: #64748b;
  font-size: 12px;
}

.points-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow-y: auto;
  overflow-x: hidden;
}

/* 单个顶点卡片：顶部左序号、右删除，下方为经纬高输入（与多边形网格化一致） */
.point-card {
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 11px;
  color: #94a3b8;
}

.point-card:last-child {
  border-bottom: none;
}

.point-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.point-index-badge {
  flex: 0 0 28px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(59, 130, 246, 0.2);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #93c5fd;
}

.point-fields {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.field {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.field-label {
  flex: 0 0 52px;
  font-size: 11px;
  color: #64748b;
}

.point-input-mini {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #475569;
  font-size: 11px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}

.point-input-mini:focus {
  border-color: #7db8e0;
  box-shadow: 0 0 0 2px rgba(91, 159, 212, 0.12);
}

.icon-btn-mini {
  flex: 0 0 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  cursor: pointer;
  border-radius: 4px;
}

.icon-btn-mini:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.3);
}

.icon-btn-mini:disabled {
  opacity: 0.3;
  cursor: default;
}

.clear-btn {
  background: rgba(100, 116, 139, 0.1);
  color: #64748b;
}

.clear-btn:hover:not(:disabled) {
  background: rgba(100, 116, 139, 0.2);
  color: #94a3b8;
}

/* 表单行 */
.form-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.form-label {
  width: 70px;
  font-size: 12px;
  color: #94a3b8;
  flex-shrink: 0;
}

.required {
  color: #ef4444;
  margin-right: 2px;
}

.form-input {
  flex: 1;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #334155;
  font-size: 13px;
  outline: none;
  transition: all 0.15s ease;
}

.form-input:focus {
  border-color: #7db8e0;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.12);
}

.form-input::placeholder {
  color: #475569;
}

.checkbox-row {
  margin-top: 4px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-input {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #5b9fd4;
}

.checkbox-text {
  font-size: 13px;
  color: #475569;
}

.form-actions-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}

.form-actions {
  display: flex;
  gap: 10px;
}

.form-actions-primary {
  width: 100%;
}

.form-actions-primary .btn-primary-block {
  width: 100%;
  justify-content: center;
  padding: 10px 20px;
  border-radius: 10px;
}

.form-actions-clear-grid {
  width: 100%;
  justify-content: flex-end;
}

/* 与示意图一致：深酒红底、珊瑚色描边与文字/图标、大圆角 */
.btn-clear-generated-grid {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 55%;
  max-width: 100%;
  box-sizing: border-box;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid rgba(248, 113, 113, 0.65);
  background: rgba(127, 29, 29, 0.35);
  color: #fecaca;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  white-space: nowrap;
}

.btn-clear-generated-grid :deep(svg) {
  flex-shrink: 0;
}

.btn-clear-generated-grid:hover:not(:disabled) {
  background: rgba(153, 27, 27, 0.45);
  border-color: #f87171;
  color: #fff;
}

.btn-clear-generated-grid:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 6px;
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
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.1);
  font-size: 13px;
  color: #fca5a5;
}

.result-stats-wrapper {
  margin-top: 14px;
}

.result-stats-row {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.result-stats-row:last-child {
  margin-bottom: 0;
}

.result-stats-row .stat-card {
  flex: 1;
}

.stat-card {
  flex: 1;
  padding: 12px 14px;
  border-radius: 8px;
  background: #f5f3f0;
  border: 1px solid #ebe6df;
  text-align: center;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #4a7eb0;
  font-variant-numeric: tabular-nums;
}

.stat-value.success {
  color: #34d399;
  font-size: 13px;
  text-transform: uppercase;
}

.stat-value.error {
  color: #f87171;
  font-size: 13px;
  text-transform: uppercase;
}

.stat-value.aggregated {
  color: #a78bfa;
  font-size: 13px;
}

.stat-label {
  font-size: 11px;
  color: #64748b;
  margin-top: 4px;
}

.no-data {
  margin-top: 20px;
  padding: 30px;
  text-align: center;
  color: #64748b;
  background: #f5f3f0;
  border-radius: 10px;
  border: 1px dashed rgba(255, 255, 255, 0.1);
}

/* 聚合类计算窗口 — 对齐 DEM 计算窗口样式 */
.osgb-agg-query,
.hybrid-grid-query {
  padding: 0;
  width: 100%;
  box-sizing: border-box;
}

.osgb-agg-query .form-group,
.hybrid-grid-query .form-group {
  margin-bottom: 12px;
}

.osgb-agg-query .group-title,
.hybrid-grid-query .group-title {
  font-size: 15px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 8px;
}

.osgb-agg-query .param-line,
.hybrid-grid-query .param-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.osgb-agg-query .param-line:last-child,
.hybrid-grid-query .param-line:last-child {
  margin-bottom: 0;
}

.osgb-agg-query .param-label,
.hybrid-grid-query .param-label {
  width: 72px;
  font-size: 14px;
  color: #334155;
  text-align: left;
  flex-shrink: 0;
}

.osgb-agg-query .param-line input,
.hybrid-grid-query .param-line input,
.hybrid-grid-query .param-input {
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

.osgb-agg-query .param-line input::placeholder,
.hybrid-grid-query .param-line input::placeholder,
.hybrid-grid-query .param-input::placeholder {
  color: #94a3b8;
}

.osgb-agg-query .param-line input:focus,
.hybrid-grid-query .param-line input:focus,
.hybrid-grid-query .param-input:focus,
.osgb-agg-query .param-select:focus,
.hybrid-grid-query .param-select:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
}

.osgb-agg-query .param-select,
.hybrid-grid-query .param-select {
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
  appearance: auto;
}

.osgb-agg-query .btn-row,
.hybrid-grid-query .btn-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.osgb-agg-query .btn-query,
.hybrid-grid-query .btn-query {
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

.osgb-agg-query .btn-query:hover:not(:disabled),
.hybrid-grid-query .btn-query:hover:not(:disabled) {
  background: linear-gradient(135deg, #6aa8d4, #4a8fc4);
}

.osgb-agg-query .btn-query:disabled,
.hybrid-grid-query .btn-query:disabled {
  background: #e2e8f0;
  color: #94a3b8;
  cursor: not-allowed;
}

.osgb-agg-query .btn-clear,
.hybrid-grid-query .btn-clear {
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

.osgb-agg-query .btn-clear:hover:not(:disabled),
.hybrid-grid-query .btn-clear:hover:not(:disabled) {
  background: #f5f3f0;
  border-color: #d4c9b8;
}

.osgb-agg-query .btn-clear:disabled,
.hybrid-grid-query .btn-clear:disabled {
  color: #94a3b8;
  cursor: not-allowed;
}

.osgb-agg-query .error-box,
.hybrid-grid-query .error-box {
  padding: 10px 12px;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  background: #fef2f2;
  font-size: 14px;
  color: #dc2626;
  margin-bottom: 10px;
}

.osgb-agg-query .result-box,
.hybrid-grid-query .result-box {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.osgb-agg-query .result-row,
.hybrid-grid-query .result-row {
  flex: 1 1 calc(50% - 4px);
  min-width: 140px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid #ebe6df;
  border-radius: 8px;
  background: #ffffff;
  box-sizing: border-box;
}

.osgb-agg-query .result-label,
.hybrid-grid-query .result-label {
  font-size: 13px;
  color: #64748b;
}

.osgb-agg-query .result-num,
.hybrid-grid-query .result-num {
  font-size: 18px;
  font-weight: 600;
  color: #334155;
}

.osgb-agg-query .result-status,
.hybrid-grid-query .result-status {
  font-size: 15px;
  font-weight: 600;
  color: #dc2626;
}

.osgb-agg-query .result-status.success,
.hybrid-grid-query .result-status.success {
  color: #059669;
}

.osgb-agg-query .empty-box,
.hybrid-grid-query .empty-box {
  padding: 16px;
  text-align: center;
  color: #64748b;
  font-size: 14px;
  border: 1px dashed #d4c9b8;
  border-radius: 8px;
  background: #faf8f4;
}

.osgb-agg-query .spin,
.hybrid-grid-query .spin {
  animation: spin 1s linear infinite;
}

/* 多粒度混合格网建模 — 顶点与提示 */
.hybrid-grid-query .hint-box {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
  background: #eef6fc;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  color: #2563eb;
  font-size: 14px;
  line-height: 1.5;
}

.hybrid-grid-query .hint-box svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.hybrid-grid-query .group-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.hybrid-grid-query .group-title-row .group-title {
  margin-bottom: 0;
}

.hybrid-grid-query .group-sub {
  font-size: 13px;
  color: #64748b;
}

.hybrid-grid-query .btn-link-clear {
  margin-left: auto;
  padding: 4px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #64748b;
  font-size: 13px;
  cursor: pointer;
}

.hybrid-grid-query .btn-link-clear:hover:not(:disabled) {
  background: #f5f3f0;
  color: #334155;
}

.hybrid-grid-query .btn-link-clear:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hybrid-grid-query .empty-hint {
  padding: 14px;
  text-align: center;
  color: #64748b;
  font-size: 14px;
  background: #faf8f4;
  border: 1px dashed #d4c9b8;
  border-radius: 8px;
}

.hybrid-grid-query .points-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
}

.hybrid-grid-query .point-card {
  padding: 10px;
  background: #ffffff;
  border: 1px solid #ebe6df;
  border-radius: 8px;
}

.hybrid-grid-query .point-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.hybrid-grid-query .point-index-badge {
  min-width: 28px;
  height: 24px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #eef6fc;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #5b9fd4;
}

.hybrid-grid-query .btn-point-delete {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: #fef2f2;
  color: #dc2626;
  cursor: pointer;
}

.hybrid-grid-query .btn-point-delete:hover {
  background: #fee2e2;
}

.hybrid-grid-query .point-fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hybrid-grid-query .field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hybrid-grid-query .field-label {
  flex: 0 0 52px;
  font-size: 13px;
  color: #64748b;
}

.hybrid-grid-query .field-input {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 8px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 13px;
  box-sizing: border-box;
}

.hybrid-grid-query .field-input:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 2px rgba(91, 159, 212, 0.12);
}

.hybrid-grid-query .param-input-combo {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.hybrid-grid-query .param-input-combo .param-input {
  flex: 1;
  min-width: 0;
}

.hybrid-grid-query .param-preset-select {
  flex: 0 0 64px;
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

.hybrid-grid-query .param-preset-select:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
}

.hybrid-grid-query .param-line-checkbox {
  margin-bottom: 4px;
}

.hybrid-grid-query .checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #334155;
}

.hybrid-grid-query .checkbox-input {
  width: 16px;
  height: 16px;
  accent-color: #5b9fd4;
  cursor: pointer;
}
</style>
