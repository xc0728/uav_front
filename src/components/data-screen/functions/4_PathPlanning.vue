<script setup>
import { reactive, ref, computed } from 'vue'
import { Loader2, Trash2, Search, MapPin, Navigation, Database, X, Check } from 'lucide-vue-next'

const props = defineProps({
  serviceName: {
    type: String,
    default: '立体导航网格路径规划服务'
  },
  functionName: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['close', 'showPoint', 'showGrid', 'showLine'])

// ==================== A* 航路规划 ====================
// 路径点列表（起点 + 中间点 + 终点）
const pathPoints = ref([])

// 表单数据
const astarForm = reactive({
  startTime: Math.floor(Date.now() / 1000), // 默认当前时间戳
  level: 9, // 默认网格层级 9
  planeRadius: 0.75, // 默认无人机半径
  speed: 15.0, // 默认飞行速度
  workHeight: 100, // 默认工作面高度
  useGdConstraint: true, // 默认启用实景三维障碍校验
})

// 加载状态和结果
const astarLoading = ref(false)
const astarError = ref('')
const astarResult = ref(null)

// 统计信息
const pathStats = ref(null)

// 入库相关
const showStoreModal = ref(false)
const storeRouteName = ref('')
const storeLoading = ref(false)
const storeError = ref('')
const storeSuccess = ref(false)

// 层级选项
const levelOptions = [9]

/** 高度快选：10–50 整十 */
const heightPresetOptions = Array.from({ length: 5 }, (_, i) => (i + 1) * 10)

function onHeightPresetChange(event, pointIndex) {
  const val = event.target.value
  if (val !== '') {
    pathPoints.value[pointIndex].height = Number(val)
  }
  event.target.selectedIndex = 0
}

function onConflictHeightPresetChange(event, pointIndex) {
  const val = event.target.value
  if (val !== '') {
    conflictPoints.value[pointIndex].height = Number(val)
  }
  event.target.selectedIndex = 0
}

function onConflictFirstHeightPresetChange(event, pointIndex) {
  const val = event.target.value
  if (val !== '') {
    conflictFirstPoints.value[pointIndex].height = Number(val)
  }
  event.target.selectedIndex = 0
}

// 标准化点数据
function normalizePoint(p) {
  const lon = Number(Number(p.lon).toFixed(10))
  const lat = Number(Number(p.lat).toFixed(10))
  const height = Number(Number(p.height ?? 0).toFixed(1))
  return { lon, lat, height }
}

// 重置表单
function resetForm() {
  if (props.functionName === 'A星航路规划') {
    astarError.value = ''
    astarResult.value = null
    pathStats.value = null
    pathPoints.value = []
    astarForm.startTime = Math.floor(Date.now() / 1000)
    astarForm.level = 9
    astarForm.planeRadius = 0.75
    astarForm.speed = 15.0
    astarForm.workHeight = 100
    astarForm.useGdConstraint = true
    closeStoreModal()
  }

  if (props.functionName === '路径冲突检测（所有冲突）') {
    conflictError.value = ''
    conflictResult.value = null
    conflictStats.value = null
    conflictPoints.value = []
    conflictForm.startTime = Math.floor(Date.now() / 1000)
    conflictForm.level = 9
    conflictForm.planeRadius = 0.75
    conflictForm.speed = 15.0
    conflictForm.workHeight = 100
    conflictForm.useGdConstraint = true
  }

  if (props.functionName === '路径冲突检测（首个冲突）') {
    conflictFirstError.value = ''
    conflictFirstResult.value = null
    conflictFirstPoints.value = []
    conflictFirstForm.startTime = Math.floor(Date.now() / 1000)
    conflictFirstForm.level = 9
    conflictFirstForm.planeRadius = 0.75
    conflictFirstForm.speed = 15.0
    conflictFirstForm.workHeight = 100
    conflictFirstForm.useGdConstraint = true
  }
}

// 从地图添加点
function setPointFromMap(lon, lat, height) {
  // A星航路规划
  if (props.functionName === 'A星航路规划') {
    pathPoints.value.push(normalizePoint({ lon, lat, height }))
    console.log('[A星航路规划] 添加点:', lon, lat, height)
    return
  }

  // 路径冲突检测（所有冲突）
  if (props.functionName === '路径冲突检测（所有冲突）') {
    conflictPoints.value.push(normalizePoint({ lon, lat, height }))
    console.log('[路径冲突检测] 添加点:', lon, lat, height)

    // 当有至少2个点时，显示路径连线
    if (conflictPoints.value.length >= 2) {
      const linePoints = conflictPoints.value.map(p => ({
        lon: p.lon,
        lat: p.lat,
        height: p.height
      }))
      emit('showLine', linePoints)
    }
    return
  }

  // 路径冲突检测（首个冲突）
  if (props.functionName === '路径冲突检测（首个冲突）') {
    conflictFirstPoints.value.push(normalizePoint({ lon, lat, height }))
    console.log('[路径冲突检测-首个] 添加点:', lon, lat, height)

    // 当有至少2个点时，显示路径连线
    if (conflictFirstPoints.value.length >= 2) {
      const linePoints = conflictFirstPoints.value.map(p => ({
        lon: p.lon,
        lat: p.lat,
        height: p.height
      }))
      emit('showLine', linePoints)
    }
    return
  }
}

// 删除点
function removePoint(index) {
  pathPoints.value.splice(index, 1)
}

// 清空所有点
function clearPoints() {
  pathPoints.value = []
}

// 清除路径结果
function clearPath() {
  emit('showGrid', { cells: [] })
  astarResult.value = null
  pathStats.value = null
}

// 入库相关函数
function openStoreModal() {
  storeRouteName.value = ''
  storeError.value = ''
  storeSuccess.value = false
  showStoreModal.value = true
}

function closeStoreModal() {
  showStoreModal.value = false
  storeRouteName.value = ''
  storeError.value = ''
  storeSuccess.value = false
}

async function submitStoreRoute() {
  if (!astarResult.value || !astarResult.value.path) {
    storeError.value = '没有可入库的路径数据'
    return
  }

  if (!storeRouteName.value.trim()) {
    storeError.value = '请输入航线名称'
    return
  }

  storeLoading.value = true
  storeError.value = ''
  storeSuccess.value = false

  try {
    const payload = {
      points: pathPoints.value.map(p => [p.lon, p.lat, p.height]),
      path: astarResult.value.path,
      name: storeRouteName.value.trim()
    }

    console.log('[航路入库] 发送 payload:', payload)

    const resp = await fetch('/api/airRoute/routeManagement/storeRouteData', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await resp.json()
    console.log('[航路入库] 返回数据:', data)

    if (data?.status === 'success') {
      storeSuccess.value = true
      setTimeout(() => {
        closeStoreModal()
      }, 1500)
    } else {
      storeError.value = data?.message || '入库失败'
    }
  } catch (err) {
    console.error('[航路入库] 请求错误:', err)
    storeError.value = err?.message || '入库请求失败'
  } finally {
    storeLoading.value = false
  }
}

// 路径冲突检测（所有冲突）- 表单数据
const conflictForm = reactive({
  startTime: Math.floor(Date.now() / 1000), // 默认当前时间戳
  level: 9, // 默认网格层级 9
  planeRadius: 0.75, // 默认无人机半径
  speed: 15.0, // 默认飞行速度
  workHeight: 100, // 默认工作面高度
  useGdConstraint: true, // 默认启用实景三维障碍校验
})

// 冲突检测点列表
const conflictPoints = ref([])

// 冲突检测状态和结果
const conflictLoading = ref(false)
const conflictError = ref('')
const conflictResult = ref(null)
const conflictStats = ref(null)

// 冲突类型对应的颜色
const conflictColors = {
  'hl': '#22c55e',     // 航路 - 绿色
  'hlz': '#f97316',    // 航路作为障碍物 - 橙色
  'fx': '#ef4444',     // 风险区域 - 红色
  'gd': '#8b5cf6',     // 实景三维障碍 - 紫色
  'dt': '#06b6d4',     // 无人机实时占用 - 青色
  'dz': '#f43f5e',     // 电子围栏 - 玫红
  'za': '#eab308',     // 障碍物 - 黄色
  'dc': '#64748b',     // 电磁环境 - 灰色
  'ad': '#ec4899',     // 空域类型 - 粉色
  'dp': '#14b8a6',     // 实时占用 - 青色
  'wdd': '#a855f7',    // 天气/天 - 紫色
  'wdh': '#6366f1',    // 天气/小时 - 靛蓝
  'default': '#ff0000' // 默认红色
}

// 删除冲突点
function removeConflictPoint(index) {
  conflictPoints.value.splice(index, 1)
  // 更新路径连线
  if (conflictPoints.value.length >= 2) {
    const linePoints = conflictPoints.value.map(p => ({
      lon: p.lon,
      lat: p.lat,
      height: p.height
    }))
    emit('showLine', linePoints)
  } else {
    // 少于2个点时清除连线
    emit('showLine', [])
  }
}

// 清空冲突点
function clearConflictPoints() {
  conflictPoints.value = []
  // 清除路径连线
  emit('showLine', [])
}

// 清除冲突检测结果
function clearConflictResult() {
  emit('showGrid', { cells: [] })
  conflictResult.value = null
  conflictStats.value = null
}

// 获取冲突类型的显示名称
function getConflictTypeName(code) {
  const names = {
    'hl': '航路冲突',
    'hlz': '航路障碍',
    'fx': '风险区域',
    'gd': '实景障碍',
    'dt': '无人机占用',
    'dz': '电子围栏',
    'za': '障碍物',
    'dc': '电磁干扰',
    'ad': '空域限制',
    'dp': '实时占用',
    'wdd': '天气/天限制',
    'wdh': '天气/小时限制',
    'default': '未知冲突'
  }
  return names[code] || code || '未知冲突'
}

// 表单验证 - 冲突检测
const canSubmitConflict = computed(() => {
  if (conflictPoints.value.length < 2) return false
  if (!Number.isFinite(Number(conflictForm.startTime))) return false
  if (!Number.isFinite(Number(conflictForm.level))) return false
  if (!Number.isFinite(Number(conflictForm.workHeight))) return false
  return true
})

// 提交冲突检测
async function submitConflictCheck() {
  conflictError.value = ''
  conflictResult.value = null
  conflictStats.value = null

  // 验证点数
  if (conflictPoints.value.length < 2) {
    conflictError.value = '请至少添加起点和终点（2个点）'
    return
  }

  conflictLoading.value = true

  try {
    // 构建约束条件
    const condition = {}
    // 只有勾选了启用实景三维障碍校验，才传入 gd_9 参数
    if (conflictForm.useGdConstraint) {
      condition.gd_9 = ""
    }

    // 构建请求参数
    const payload = {
      startTime: Number(conflictForm.startTime),
      points: conflictPoints.value.map(p => [p.lon, p.lat, p.height]),
      level: Number(conflictForm.level),
      planeRadius: Number(conflictForm.planeRadius),
      speed: Number(conflictForm.speed),
      workHeight: Number(conflictForm.workHeight),
      condition: condition
    }

    console.log('[路径冲突检测] 发送 payload:', payload)

    const resp = await fetch('/api/airRoute/lineConflict/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await resp.json()
    console.log('[路径冲突检测] 返回数据:', data)

    // 根据状态码处理响应
    if (resp.status === 200) {
      // 无冲突
      conflictResult.value = {
        status: 'no_conflict',
        reason: data.reason || '检测通过，无冲突',
        grids: []
      }
      conflictStats.value = {
        conflictCount: 0,
        gridCount: 0,
        status: 'success'
      }

      // 如果后端返回了路径网格数据，也进行可视化
      if (data.grid && Array.isArray(data.grid) && data.grid.length > 0) {
        const cells = data.grid.map(cell => ({
          bounds: {
            north: cell.maxlat,
            south: cell.minlat,
            east: cell.maxlon,
            west: cell.minlon,
            top: cell.top,
            bottom: cell.bottom,
          },
          level: conflictForm.level,
          color: '#22c55e' // 无冲突用绿色
        }))
        emit('showGrid', { cells })
      }
    } else if (resp.status === 400) {
      // 有冲突
      const grids = data.grid || []
      conflictResult.value = {
        status: 'has_conflict',
        reason: '检测到冲突',
        grids: grids
      }

      // 统计冲突信息
      const conflictCount = grids.length
      conflictStats.value = {
        conflictCount: conflictCount,
        gridCount: grids.length,
        status: 'conflict_detected'
      }

      // 在地图上显示所有返回的网格
      if (grids.length > 0) {
        const cells = grids.map(cell => {
          // 判断是否为冲突网格（有reason字段表示冲突）
          const isConflict = cell.reason && cell.reason.trim() !== ''
          // 冲突网格用红色，无冲突网格用绿色
          let color = '#22c55e' // 默认绿色

          if (isConflict) {
            // 从 reason 字段提取冲突类型，使用对应颜色
            const reasonLower = cell.reason.toLowerCase()
            for (const [key, value] of Object.entries(conflictColors)) {
              if (reasonLower.includes(key)) {
                color = value
                break
              }
            }
            // 如果没有匹配到具体类型，使用默认红色
            if (color === '#22c55e') {
              color = conflictColors['default']
            }
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
            level: conflictForm.level,
            color: color,
            isConflict: isConflict,
            reason: cell.reason || ''
          }
        })
        emit('showGrid', { cells })
      }
    } else {
      throw new Error(`请求失败，状态码 ${resp.status}`)
    }
  } catch (err) {
    console.error('[路径冲突检测] 请求错误:', err)
    conflictError.value = err?.message || '请求失败，请稍后重试'
  } finally {
    conflictLoading.value = false
  }
}

// 路径冲突检测（首个冲突）- 表单数据
const conflictFirstForm = reactive({
  startTime: Math.floor(Date.now() / 1000), // 默认当前时间戳
  level: 9, // 默认网格层级 9
  planeRadius: 0.75, // 默认无人机半径
  speed: 15.0, // 默认飞行速度
  workHeight: 100, // 默认工作面高度
  useGdConstraint: true, // 默认启用实景三维障碍校验
})

// 首个冲突检测点列表
const conflictFirstPoints = ref([])

// 首个冲突检测状态和结果
const conflictFirstLoading = ref(false)
const conflictFirstError = ref('')
const conflictFirstResult = ref(null)

// 删除首个冲突点
function removeConflictFirstPoint(index) {
  conflictFirstPoints.value.splice(index, 1)
  // 更新路径连线
  if (conflictFirstPoints.value.length >= 2) {
    const linePoints = conflictFirstPoints.value.map(p => ({
      lon: p.lon,
      lat: p.lat,
      height: p.height
    }))
    emit('showLine', linePoints)
  } else {
    // 少于2个点时清除连线
    emit('showLine', [])
  }
}

// 清空首个冲突点
function clearConflictFirstPoints() {
  conflictFirstPoints.value = []
  // 清除路径连线
  emit('showLine', [])
}

// 清除首个冲突检测结果
function clearConflictFirstResult() {
  emit('showGrid', { cells: [] })
  conflictFirstResult.value = null
}

// 表单验证 - 首个冲突检测
const canSubmitConflictFirst = computed(() => {
  if (conflictFirstPoints.value.length < 2) return false
  if (!Number.isFinite(Number(conflictFirstForm.startTime))) return false
  if (!Number.isFinite(Number(conflictFirstForm.level))) return false
  if (!Number.isFinite(Number(conflictFirstForm.workHeight))) return false
  return true
})

// 提交首个冲突检测
async function submitConflictFirstCheck() {
  conflictFirstError.value = ''
  conflictFirstResult.value = null

  // 验证点数
  if (conflictFirstPoints.value.length < 2) {
    conflictFirstError.value = '请至少添加起点和终点（2个点）'
    return
  }

  conflictFirstLoading.value = true

  try {
    // 构建约束条件
    const condition = {}
    // 只有勾选了启用实景三维障碍校验，才传入 gd_9 参数
    if (conflictFirstForm.useGdConstraint) {
      condition.gd_9 = ""
    }

    // 构建请求参数
    const payload = {
      startTime: Number(conflictFirstForm.startTime),
      points: conflictFirstPoints.value.map(p => [p.lon, p.lat, p.height]),
      level: Number(conflictFirstForm.level),
      planeRadius: Number(conflictFirstForm.planeRadius),
      speed: Number(conflictFirstForm.speed),
      workHeight: Number(conflictFirstForm.workHeight),
      condition: condition
    }

    console.log('[路径冲突检测-首个] 发送 payload:', payload)

    const resp = await fetch('/api/airRoute/lineConflict/checkFirst', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await resp.json()
    console.log('[路径冲突检测-首个] 返回数据:', data)

    // 根据状态码处理响应
    if (resp.status === 200) {
      // 无冲突
      conflictFirstResult.value = {
        status: 'no_conflict',
        reason: data.reason || '检测通过，无冲突',
        grid: null
      }
    } else if (resp.status === 400) {
      // 有冲突，返回单个冲突网格
      const grid = data.grid
      conflictFirstResult.value = {
        status: 'has_conflict',
        reason: data.reason || '检测到冲突',
        grid: grid
      }

      // 在地图上显示冲突网格
      if (grid) {
        // 从 reason 字段提取冲突类型，使用对应颜色
        let color = conflictColors['default']
        if (data.reason) {
          const reasonLower = data.reason.toLowerCase()
          for (const [key, value] of Object.entries(conflictColors)) {
            if (reasonLower.includes(key)) {
              color = value
              break
            }
          }
        }

        const cells = [{
          bounds: {
            north: grid.maxlat,
            south: grid.minlat,
            east: grid.maxlon,
            west: grid.minlon,
            top: grid.top,
            bottom: grid.bottom,
          },
          level: conflictFirstForm.level,
          color: color,
          reason: data.reason || ''
        }]
        emit('showGrid', { cells })
      }
    } else {
      throw new Error(`请求失败，状态码 ${resp.status}`)
    }
  } catch (err) {
    console.error('[路径冲突检测-首个] 请求错误:', err)
    conflictFirstError.value = err?.message || '请求失败，请稍后重试'
  } finally {
    conflictFirstLoading.value = false
  }
}

defineExpose({ resetForm, setPointFromMap })

// 表单验证
const canSubmit = computed(() => {
  if (pathPoints.value.length < 2) return false // 至少需要起点和终点
  if (!Number.isFinite(Number(astarForm.startTime))) return false
  if (!Number.isFinite(Number(astarForm.level))) return false
  if (!Number.isFinite(Number(astarForm.workHeight))) return false
  return true
})

// 提交 A* 路径规划
async function submitAstarPath() {
  astarError.value = ''
  astarResult.value = null
  pathStats.value = null

  // 验证点数
  if (pathPoints.value.length < 2) {
    astarError.value = '请至少添加起点和终点（2个点）'
    return
  }

  astarLoading.value = true

  try {
    // 构建请求参数
    const condition = {}
    // 只有勾选了启用实景三维障碍校验，才传入 gd_9 参数
    if (astarForm.useGdConstraint) {
      condition.gd_9 = ""
    }

    const payload = {
      startTime: Number(astarForm.startTime),
      points: pathPoints.value.map(p => [p.lon, p.lat, p.height]),
      level: Number(astarForm.level),
      planeRadius: Number(astarForm.planeRadius),
      speed: Number(astarForm.speed),
      workHeight: Number(astarForm.workHeight),
      condition: condition
    }

    console.log('[A星航路规划] 发送 payload:', payload)

    const resp = await fetch('/api/airRoute/Astar/AstarPathPlane', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error('[A星航路规划] 错误响应:', errText)
      throw new Error(`请求失败，状态码 ${resp.status}: ${errText}`)
    }

    const data = await resp.json()
    console.log('[A星航路规划] 返回数据:', data)

    if (data?.results?.success) {
      astarResult.value = data.results

      // 统计路径信息
      const path = data.results.path || []
      pathStats.value = {
        totalPoints: path.length,
        status: 'success'
      }

      // 将路径点显示在地图上
      if (path.length > 0) {
        const cells = path.map(cell => ({
          bounds: {
            north: cell.maxlat,
            south: cell.minlat,
            east: cell.maxlon,
            west: cell.minlon,
            top: cell.top,
            bottom: cell.bottom,
          },
          level: astarForm.level,
          color: '#3b82f6' // 路径使用蓝色
        }))
        emit('showGrid', { cells })
      }
    } else {
      throw new Error(data?.results?.reason || '路径规划失败')
    }
  } catch (err) {
    console.error('[A星航路规划] 请求错误:', err)
    astarError.value = err?.message || '请求失败，请稍后重试'
  } finally {
    astarLoading.value = false
  }
}
</script>

<template>
  <div class="path-planning">
    <!-- A星航路规划 -->
    <template v-if="functionName === 'A星航路规划'">
      <!-- 航路点列表 -->
      <div class="form-group">
        <div class="group-title-row">
          <span class="group-title">航路点列表</span>
          <span class="group-sub">({{ pathPoints.length }}个)</span>
          <button
            type="button"
            class="btn-link-clear"
            @click="clearPoints"
            :disabled="pathPoints.length === 0"
            title="清空所有点"
          >
            清空
          </button>
        </div>

        <div v-if="pathPoints.length === 0" class="empty-hint">
          暂无航路点，请点击地图添加（至少2个点）
        </div>

        <div v-else class="points-list">
          <div v-for="(point, idx) in pathPoints" :key="idx" class="point-card">
            <div class="point-card-header">
              <span class="point-index-badge" :class="{
                'badge-start': idx === 0,
                'badge-end': idx === pathPoints.length - 1 && pathPoints.length > 1,
                'badge-waypoint': idx !== 0 && idx !== pathPoints.length - 1
              }">
                {{ idx === 0 ? '起点' : idx === pathPoints.length - 1 ? '终点' : `途经${idx}` }}
              </span>
              <button type="button" class="btn-point-delete" @click="removePoint(idx)" title="删除此点">
                <Trash2 :size="14" />
              </button>
            </div>
            <div class="point-fields">
              <div class="field">
                <span class="field-label">经度</span>
                <input
                  v-model.number="pathPoints[idx].lon"
                  class="field-input"
                  type="number"
                  step="any"
                  placeholder="经度"
                >
              </div>
              <div class="field">
                <span class="field-label">纬度</span>
                <input
                  v-model.number="pathPoints[idx].lat"
                  class="field-input"
                  type="number"
                  step="any"
                  placeholder="纬度"
                >
              </div>
              <div class="field">
                <span class="field-label">高度(m)</span>
                <div class="field-input-group">
                  <input
                    v-model.number="pathPoints[idx].height"
                    class="field-input"
                    type="number"
                    step="any"
                    placeholder="手动输入"
                  >
                  <select
                    class="field-preset-select"
                    aria-label="高度快选"
                    @change="(e) => onHeightPresetChange(e, idx)"
                  >
                    <option value="">快选</option>
                    <option
                      v-for="h in heightPresetOptions"
                      :key="`astar-${idx}-${h}`"
                      :value="h"
                    >
                      {{ h }}
                    </option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 基础参数 -->
      <div class="form-group">
        <div class="group-title">基础参数</div>
        <div class="param-line">
          <span class="param-label">开始时间</span>
          <input
            v-model.number="astarForm.startTime"
            type="number"
            step="1"
            class="param-input"
            placeholder="北京时间秒级时间戳"
          >
        </div>
        <div class="param-line">
          <span class="param-label">工作高度</span>
          <input
            v-model.number="astarForm.workHeight"
            type="number"
            step="any"
            class="param-input"
            placeholder="无人机作业基准高度"
          >
        </div>
        <div class="param-line">
          <span class="param-label">网格层级</span>
          <select v-model.number="astarForm.level" class="param-select">
            <option v-for="lvl in levelOptions" :key="lvl" :value="lvl">第 {{ lvl }} 级</option>
          </select>
        </div>
        <div class="param-line">
          <span class="param-label">无人机半径</span>
          <input
            v-model.number="astarForm.planeRadius"
            type="number"
            step="0.01"
            class="param-input"
            placeholder="机身半径(米)"
          >
        </div>
        <div class="param-line">
          <span class="param-label">飞行速度</span>
          <input
            v-model.number="astarForm.speed"
            type="number"
            step="0.1"
            class="param-input"
            placeholder="飞行速度(米/秒)"
          >
        </div>
      </div>

      <!-- 约束条件 -->
      <div class="form-group">
        <div class="group-title">约束条件</div>
        <div class="param-line-checkbox">
          <label class="checkbox-label">
            <input
              type="checkbox"
              v-model="astarForm.useGdConstraint"
              class="checkbox-input"
            >
            <span class="checkbox-text">启用实景三维障碍校验</span>
          </label>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="btn-row">
        <button
          type="button"
          class="btn-query"
          @click="submitAstarPath"
          :disabled="astarLoading || !canSubmit"
        >
          <Loader2 v-if="astarLoading" :size="16" class="spin" />
          <Navigation v-else :size="16" />
          {{ astarLoading ? '规划中...' : '开始路径规划' }}
        </button>
        <button
          type="button"
          class="btn-clear"
          @click="clearPath"
          :disabled="!astarResult"
        >
          <span>清除网格</span>
        </button>
      </div>

      <div v-if="astarError" class="error-box">{{ astarError }}</div>

      <!-- 查询结果 -->
      <div v-if="pathStats" class="result-box">
        <div class="result-row">
          <span class="result-label">路径网格数</span>
          <span class="result-num">{{ pathStats.totalPoints }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">状态</span>
          <span class="result-status" :class="pathStats.status === 'success' ? 'success' : ''">
            {{ pathStats.status === 'success' ? '成功' : pathStats.status }}
          </span>
        </div>
      </div>

      <!-- 入库按钮 -->
      <div v-if="astarResult && astarResult.path && astarResult.path.length > 0" class="store-section">
        <button type="button" class="btn-store" @click="openStoreModal">
          <Database :size="14" />
          航路入库
        </button>
      </div>

      <!-- 入库模态框 -->
      <Teleport to="body">
        <div v-if="showStoreModal" class="modal-overlay" @click.self="closeStoreModal">
          <div class="modal-content">
            <div class="modal-header">
              <h3>航路入库</h3>
              <button class="modal-close" @click="closeStoreModal">
                <X :size="18" />
              </button>
            </div>
            <div class="modal-body">
              <div class="store-info">
                <div class="store-info-item">
                  <span class="store-info-label">起点：</span>
                  <span class="store-info-value" v-if="pathPoints.length >= 2">
                    {{ pathPoints[0].lon.toFixed(6) }}, {{ pathPoints[0].lat.toFixed(6) }}, {{ pathPoints[0].height }}m
                  </span>
                </div>
                <div class="store-info-item">
                  <span class="store-info-label">终点：</span>
                  <span class="store-info-value" v-if="pathPoints.length >= 2">
                    {{ pathPoints[pathPoints.length - 1].lon.toFixed(6) }}, {{ pathPoints[pathPoints.length - 1].lat.toFixed(6) }}, {{ pathPoints[pathPoints.length - 1].height }}m
                  </span>
                </div>
                <div class="store-info-item">
                  <span class="store-info-label">路径网格：</span>
                  <span class="store-info-value">{{ astarResult?.path?.length || 0 }} 个</span>
                </div>
              </div>
              <div class="store-form">
                <label class="store-label" for="routeName">航线名称</label>
                <input
                  id="routeName"
                  v-model="storeRouteName"
                  type="text"
                  class="store-input"
                  placeholder="请输入航线名称"
                  @keyup.enter="submitStoreRoute"
                >
              </div>
              <div v-if="storeError" class="store-error">{{ storeError }}</div>
              <div v-if="storeSuccess" class="store-success">
                <Check :size="16" />
                入库成功！
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn-cancel" @click="closeStoreModal" :disabled="storeLoading">
                取消
              </button>
              <button
                class="btn-confirm"
                @click="submitStoreRoute"
                :disabled="storeLoading || storeSuccess"
              >
                <Loader2 v-if="storeLoading" :size="14" class="spin" />
                {{ storeLoading ? '入库中...' : '确认入库' }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>
    </template>

    <!-- 路径冲突检测（所有冲突） -->
    <template v-if="functionName === '路径冲突检测（所有冲突）'">
      <!-- 路径点列表 -->
      <div class="form-group">
        <div class="group-title-row">
          <span class="group-title">路径点列表</span>
          <span class="group-sub">({{ conflictPoints.length }}个)</span>
          <button
            type="button"
            class="btn-link-clear"
            @click="clearConflictPoints"
            :disabled="conflictPoints.length === 0"
            title="清空所有点"
          >
            清空
          </button>
        </div>

        <div v-if="conflictPoints.length === 0" class="empty-hint">
          暂无路径点，请点击地图添加（至少2个点）
        </div>

        <div v-else class="points-list">
          <div v-for="(point, idx) in conflictPoints" :key="idx" class="point-card">
            <div class="point-card-header">
              <span class="point-index-badge" :class="{
                'badge-start': idx === 0,
                'badge-end': idx === conflictPoints.length - 1 && conflictPoints.length > 1,
                'badge-waypoint': idx !== 0 && idx !== conflictPoints.length - 1
              }">
                {{ idx === 0 ? '起点' : idx === conflictPoints.length - 1 ? '终点' : `途经${idx}` }}
              </span>
              <button type="button" class="btn-point-delete" @click="removeConflictPoint(idx)" title="删除此点">
                <Trash2 :size="14" />
              </button>
            </div>
            <div class="point-fields">
              <div class="field">
                <span class="field-label">经度</span>
                <input
                  v-model.number="conflictPoints[idx].lon"
                  class="field-input"
                  type="number"
                  step="any"
                  placeholder="经度"
                >
              </div>
              <div class="field">
                <span class="field-label">纬度</span>
                <input
                  v-model.number="conflictPoints[idx].lat"
                  class="field-input"
                  type="number"
                  step="any"
                  placeholder="纬度"
                >
              </div>
              <div class="field">
                <span class="field-label">高度(m)</span>
                <div class="field-input-group">
                  <input
                    v-model.number="conflictPoints[idx].height"
                    class="field-input"
                    type="number"
                    step="any"
                    placeholder="手动输入"
                  >
                  <select
                    class="field-preset-select"
                    aria-label="高度快选"
                    @change="(e) => onConflictHeightPresetChange(e, idx)"
                  >
                    <option value="">快选</option>
                    <option
                      v-for="h in heightPresetOptions"
                      :key="`conflict-${idx}-${h}`"
                      :value="h"
                    >
                      {{ h }}
                    </option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 基础参数 -->
      <div class="form-group">
        <div class="group-title">基础参数</div>
        <div class="param-line">
          <span class="param-label">开始时间</span>
          <input
            v-model.number="conflictForm.startTime"
            type="number"
            step="1"
            class="param-input"
            placeholder="北京时间秒级时间戳"
          >
        </div>
        <div class="param-line">
          <span class="param-label">工作高度</span>
          <input
            v-model.number="conflictForm.workHeight"
            type="number"
            step="any"
            class="param-input"
            placeholder="无人机作业基准高度"
          >
        </div>
        <div class="param-line">
          <span class="param-label">网格层级</span>
          <select v-model.number="conflictForm.level" class="param-select">
            <option :value="9">第 9 级</option>
          </select>
        </div>
        <div class="param-line">
          <span class="param-label">无人机半径</span>
          <input
            v-model.number="conflictForm.planeRadius"
            type="number"
            step="0.01"
            class="param-input"
            placeholder="机身半径(米)"
          >
        </div>
        <div class="param-line">
          <span class="param-label">飞行速度</span>
          <input
            v-model.number="conflictForm.speed"
            type="number"
            step="0.1"
            class="param-input"
            placeholder="飞行速度(米/秒)"
          >
        </div>
      </div>

      <!-- 约束条件 -->
      <div class="form-group">
        <div class="group-title">约束条件</div>
        <div class="param-line-checkbox">
          <label class="checkbox-label">
            <input
              type="checkbox"
              v-model="conflictForm.useGdConstraint"
              class="checkbox-input"
            >
            <span class="checkbox-text">启用实景三维障碍校验</span>
          </label>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="btn-row">
        <button
          type="button"
          class="btn-query"
          @click="submitConflictCheck"
          :disabled="conflictLoading || !canSubmitConflict"
        >
          <Loader2 v-if="conflictLoading" :size="16" class="spin" />
          <Search v-else :size="16" />
          {{ conflictLoading ? '检测中...' : '开始冲突检测' }}
        </button>
        <button
          type="button"
          class="btn-clear"
          @click="clearConflictResult"
          :disabled="!conflictResult"
        >
          <span>清除网格</span>
        </button>
      </div>

      <div v-if="conflictError" class="error-box">{{ conflictError }}</div>

      <!-- 查询结果 -->
      <div v-if="conflictStats" class="result-box">
        <div class="result-row">
          <span class="result-label">冲突网格数</span>
          <span class="result-num">{{ conflictStats.conflictCount }}</span>
        </div>
        <div class="result-row">
          <span class="result-label">状态</span>
          <span class="result-status" :class="conflictResult?.status === 'no_conflict' ? 'success' : ''">
            {{ conflictResult?.status === 'no_conflict' ? '成功' : '冲突' }}
          </span>
        </div>
      </div>

      <!-- 无冲突提示 -->
      <div v-if="conflictResult?.status === 'no_conflict'" class="empty-box">
        检测通过，无冲突
      </div>

      <!-- 冲突列表 -->
      <div v-if="conflictResult?.status === 'has_conflict' && conflictResult.grids && conflictResult.grids.length > 0" class="conflict-list">
        <div class="conflict-list-title">冲突详情</div>
        <div v-for="(grid, idx) in conflictResult.grids" :key="idx" class="conflict-item">
          <div class="conflict-item-header">
            <span class="conflict-index">#{{ idx + 1 }}</span>
            <span class="conflict-type">{{ getConflictTypeName(grid.code) }}</span>
          </div>
          <div class="conflict-item-details">
            <div class="conflict-detail">
              <span class="detail-label">编码:</span>
              <span class="detail-value">{{ grid.code || 'N/A' }}</span>
            </div>
            <div class="conflict-detail">
              <span class="detail-label">中心:</span>
              <span class="detail-value">
                {{ grid.center ? `${grid.center[0]?.toFixed(6)}, ${grid.center[1]?.toFixed(6)}, ${grid.center[2]?.toFixed(1)}` : 'N/A' }}
              </span>
            </div>
            <div class="conflict-detail">
              <span class="detail-label">范围:</span>
              <span class="detail-value">
                经度 {{ grid.minlon?.toFixed(6) }} ~ {{ grid.maxlon?.toFixed(6) }}<br>
                纬度 {{ grid.minlat?.toFixed(6) }} ~ {{ grid.maxlat?.toFixed(6) }}<br>
                高度 {{ grid.bottom?.toFixed(1) }} ~ {{ grid.top?.toFixed(1) }}m
              </span>
            </div>
            <div v-if="grid.reason" class="conflict-reason">
              <span class="detail-label">原因:</span>
              <span class="detail-value reason-text">{{ grid.reason }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 路径冲突检测（首个冲突） -->
    <template v-if="functionName === '路径冲突检测（首个冲突）'">
      <!-- 路径点列表 -->
      <div class="form-group">
        <div class="group-title-row">
          <span class="group-title">路径点列表</span>
          <span class="group-sub">({{ conflictFirstPoints.length }}个)</span>
          <button
            type="button"
            class="btn-link-clear"
            @click="clearConflictFirstPoints"
            :disabled="conflictFirstPoints.length === 0"
            title="清空所有点"
          >
            清空
          </button>
        </div>

        <div v-if="conflictFirstPoints.length === 0" class="empty-hint">
          暂无路径点，请点击地图添加（至少2个点）
        </div>

        <div v-else class="points-list">
          <div v-for="(point, idx) in conflictFirstPoints" :key="idx" class="point-card">
            <div class="point-card-header">
              <span class="point-index-badge" :class="{
                'badge-start': idx === 0,
                'badge-end': idx === conflictFirstPoints.length - 1 && conflictFirstPoints.length > 1,
                'badge-waypoint': idx !== 0 && idx !== conflictFirstPoints.length - 1
              }">
                {{ idx === 0 ? '起点' : idx === conflictFirstPoints.length - 1 ? '终点' : `途经${idx}` }}
              </span>
              <button type="button" class="btn-point-delete" @click="removeConflictFirstPoint(idx)" title="删除此点">
                <Trash2 :size="14" />
              </button>
            </div>
            <div class="point-fields">
              <div class="field">
                <span class="field-label">经度</span>
                <input
                  v-model.number="conflictFirstPoints[idx].lon"
                  class="field-input"
                  type="number"
                  step="any"
                  placeholder="经度"
                >
              </div>
              <div class="field">
                <span class="field-label">纬度</span>
                <input
                  v-model.number="conflictFirstPoints[idx].lat"
                  class="field-input"
                  type="number"
                  step="any"
                  placeholder="纬度"
                >
              </div>
              <div class="field">
                <span class="field-label">高度(m)</span>
                <div class="field-input-group">
                  <input
                    v-model.number="conflictFirstPoints[idx].height"
                    class="field-input"
                    type="number"
                    step="any"
                    placeholder="手动输入"
                  >
                  <select
                    class="field-preset-select"
                    aria-label="高度快选"
                    @change="(e) => onConflictFirstHeightPresetChange(e, idx)"
                  >
                    <option value="">快选</option>
                    <option
                      v-for="h in heightPresetOptions"
                      :key="`conflictFirst-${idx}-${h}`"
                      :value="h"
                    >
                      {{ h }}
                    </option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 基础参数 -->
      <div class="form-group">
        <div class="group-title">基础参数</div>
        <div class="param-line">
          <span class="param-label">开始时间</span>
          <input
            v-model.number="conflictFirstForm.startTime"
            type="number"
            step="1"
            class="param-input"
            placeholder="北京时间秒级时间戳"
          >
        </div>
        <div class="param-line">
          <span class="param-label">工作高度</span>
          <input
            v-model.number="conflictFirstForm.workHeight"
            type="number"
            step="any"
            class="param-input"
            placeholder="无人机作业基准高度"
          >
        </div>
        <div class="param-line">
          <span class="param-label">网格层级</span>
          <select v-model.number="conflictFirstForm.level" class="param-select">
            <option :value="9">第 9 级</option>
          </select>
        </div>
        <div class="param-line">
          <span class="param-label">无人机半径</span>
          <input
            v-model.number="conflictFirstForm.planeRadius"
            type="number"
            step="0.01"
            class="param-input"
            placeholder="机身半径(米)"
          >
        </div>
        <div class="param-line">
          <span class="param-label">飞行速度</span>
          <input
            v-model.number="conflictFirstForm.speed"
            type="number"
            step="0.1"
            class="param-input"
            placeholder="飞行速度(米/秒)"
          >
        </div>
      </div>

      <!-- 约束条件 -->
      <div class="form-group">
        <div class="group-title">约束条件</div>
        <div class="param-line-checkbox">
          <label class="checkbox-label">
            <input
              type="checkbox"
              v-model="conflictFirstForm.useGdConstraint"
              class="checkbox-input"
            >
            <span class="checkbox-text">启用实景三维障碍校验</span>
          </label>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="btn-row">
        <button
          type="button"
          class="btn-query"
          @click="submitConflictFirstCheck"
          :disabled="conflictFirstLoading || !canSubmitConflictFirst"
        >
          <Loader2 v-if="conflictFirstLoading" :size="16" class="spin" />
          <Search v-else :size="16" />
          {{ conflictFirstLoading ? '检测中...' : '开始冲突检测' }}
        </button>
        <button
          type="button"
          class="btn-clear"
          @click="clearConflictFirstResult"
          :disabled="!conflictFirstResult"
        >
          <span>清除网格</span>
        </button>
      </div>

      <div v-if="conflictFirstError" class="error-box">{{ conflictFirstError }}</div>

      <!-- 检测结果 -->
      <div v-if="conflictFirstResult">
        <!-- 无冲突结果 -->
        <div v-if="conflictFirstResult.status === 'no_conflict'" class="result-success">
          <div class="result-icon">
            <Check :size="24" />
          </div>
          <div class="result-title">检测通过</div>
          <div class="result-message">{{ conflictFirstResult.reason }}</div>
        </div>

        <!-- 有冲突结果 -->
        <div v-if="conflictFirstResult.status === 'has_conflict'" class="conflict-warning">
          <div class="conflict-warning-icon">!</div>
          <div class="conflict-warning-text">检测到首个冲突</div>
        </div>

        <!-- 冲突网格详情 -->
        <div v-if="conflictFirstResult.status === 'has_conflict' && conflictFirstResult.grid" class="conflict-list">
          <div class="conflict-list-title">首个冲突网格</div>
          <div class="conflict-item">
            <div class="conflict-item-header">
              <span class="conflict-index">#1</span>
              <span class="conflict-type">{{ getConflictTypeName('gd') }}</span>
            </div>
            <div class="conflict-item-details">
              <div class="conflict-detail">
                <span class="detail-label">编码:</span>
                <span class="detail-value">{{ conflictFirstResult.grid.code || 'N/A' }}</span>
              </div>
              <div class="conflict-detail">
                <span class="detail-label">中心:</span>
                <span class="detail-value">
                  {{ conflictFirstResult.grid.center ? `${conflictFirstResult.grid.center[0]?.toFixed(6)}, ${conflictFirstResult.grid.center[1]?.toFixed(6)}, ${conflictFirstResult.grid.center[2]?.toFixed(1)}` : 'N/A' }}
                </span>
              </div>
              <div class="conflict-detail">
                <span class="detail-label">范围:</span>
                <span class="detail-value">
                  经度 {{ conflictFirstResult.grid.minlon?.toFixed(6) }} ~ {{ conflictFirstResult.grid.maxlon?.toFixed(6) }}<br>
                  纬度 {{ conflictFirstResult.grid.minlat?.toFixed(6) }} ~ {{ conflictFirstResult.grid.maxlat?.toFixed(6) }}<br>
                  高度 {{ conflictFirstResult.grid.bottom?.toFixed(1) }} ~ {{ conflictFirstResult.grid.top?.toFixed(1) }}m
                </span>
              </div>
              <div v-if="conflictFirstResult.reason" class="conflict-reason">
                <span class="detail-label">原因:</span>
                <span class="detail-value reason-text">{{ conflictFirstResult.reason }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.path-planning {
  padding: 0;
  width: 100%;
  box-sizing: border-box;
  position: relative;
}

/* 提示框 */
.hint-box {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
  background: #f5f3f0;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  color: #475569;
  font-size: 14px;
  line-height: 1.5;
}

.hint-box svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: #64748b;
}

/* 表单组 */
.form-group {
  margin-bottom: 12px;
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

.group-title {
  font-size: 15px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 8px;
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

/* 航路点列表 */
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

.point-index-badge {
  min-width: 28px;
  height: 24px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
}

.badge-start {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.badge-end {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.badge-waypoint {
  background: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
}

.btn-point-delete {
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

.btn-point-delete:hover {
  background: #fee2e2;
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
  height: 32px;
  padding: 0 8px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 13px;
  box-sizing: border-box;
}

.field-input:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 2px rgba(91, 159, 212, 0.12);
}

.field-input-group {
  flex: 1;
  display: flex;
  gap: 4px;
  min-width: 0;
}

.field-input-group .field-input {
  flex: 1;
  min-width: 0;
}

.field-preset-select {
  width: 56px;
  min-width: 56px;
  height: 32px;
  padding: 0 20px 0 6px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 12px;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 4px center;
}

.field-preset-select:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 2px rgba(91, 159, 212, 0.12);
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
  width: 80px;
  font-size: 14px;
  color: #334155;
  text-align: left;
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

.param-input::placeholder {
  color: #94a3b8;
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
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}

.param-select:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
}

.param-line-checkbox {
  margin-bottom: 0;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #334155;
}

.checkbox-input {
  width: 16px;
  height: 16px;
  accent-color: #5b9fd4;
  cursor: pointer;
}

.checkbox-text {
  font-size: 14px;
  color: #334155;
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
  gap: 8px;
  margin-bottom: 10px;
}

.result-row {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid #ddd;
  background: #f9f9f9;
  border-radius: 6px;
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

.result-num.error {
  color: #dc2626;
}

.result-status {
  font-size: 15px;
  font-weight: 600;
  color: #dc2626;
}

.result-status.success {
  color: #059669;
}

/* 空状态 */
.empty-box {
  padding: 16px;
  text-align: center;
  color: #64748b;
  font-size: 14px;
  border: 1px dashed #d4c9b8;
  border-radius: 8px;
  margin-bottom: 10px;
}

/* 入库按钮 */
.store-section {
  margin-bottom: 10px;
  display: flex;
  justify-content: center;
}

.btn-store {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  border-radius: 8px;
  border: 1px solid rgba(168, 85, 247, 0.5);
  background: rgba(126, 34, 206, 0.3);
  color: #e9d5ff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-store:hover {
  background: rgba(126, 34, 206, 0.5);
  border-color: #a855f7;
  color: #fff;
  transform: translateY(-1px);
}

.btn-store :deep(svg) {
  flex-shrink: 0;
}

/* 模态框 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.modal-content {
  background: linear-gradient(145deg, #f5f3f0, #faf8f4);
  border: 1px solid rgba(168, 85, 247, 0.3);
  border-radius: 12px;
  width: 400px;
  max-width: 90vw;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5), 0 0 20px rgba(168, 85, 247, 0.1);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #ebe6df;
  background: #faf8f4;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #334155;
}

.modal-close {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.modal-close:hover {
  color: #f87171;
  background: rgba(239, 68, 68, 0.1);
}

.modal-body {
  padding: 20px;
}

.store-info {
  background: #ffffff;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}

.store-info-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 4px 0;
}

.store-info-label {
  color: #94a3b8;
  flex-shrink: 0;
}

.store-info-value {
  color: #475569;
  font-family: monospace;
}

.store-form {
  margin-bottom: 12px;
}

.store-label {
  display: block;
  font-size: 13px;
  color: #94a3b8;
  margin-bottom: 8px;
}

.store-input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: #ffffff;
  color: #334155;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  transition: all 0.15s ease;
}

.store-input:focus {
  border-color: #7db8e0;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
}

.store-input::placeholder {
  color: #64748b;
}

.store-error {
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
  font-size: 12px;
  margin-bottom: 12px;
}

.store-success {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.3);
  color: #4ade80;
  font-size: 13px;
  font-weight: 500;
}

.modal-footer {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: #ffffff;
}

.btn-cancel,
.btn-confirm {
  flex: 1;
  padding: 10px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn-cancel {
  background: rgba(100, 116, 139, 0.2);
  border: 1px solid rgba(100, 116, 139, 0.3);
  color: #94a3b8;
}

.btn-cancel:hover:not(:disabled) {
  background: rgba(100, 116, 139, 0.3);
  color: #475569;
}

.btn-confirm {
  background: linear-gradient(135deg, #a855f7, #7c3aed);
  border: none;
  color: #fff;
}

.btn-confirm:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(168, 85, 247, 0.4);
}

.btn-cancel:disabled,
.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 冲突列表 */
.conflict-list {
  margin-bottom: 12px;
  border: 1px solid #ebe6df;
  border-radius: 8px;
  overflow: hidden;
}

.conflict-list-title {
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
  color: #dc2626;
  background: #fef2f2;
  border-bottom: 1px solid #fca5a5;
}

.conflict-item {
  padding: 12px 14px;
  border-bottom: 1px solid #ebe6df;
  background: #ffffff;
}

.conflict-item:last-child {
  border-bottom: none;
}

.conflict-item-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.conflict-index {
  font-size: 12px;
  font-weight: 600;
  color: #dc2626;
  background: #fef2f2;
  padding: 2px 8px;
  border-radius: 4px;
}

.conflict-type {
  font-size: 13px;
  font-weight: 500;
  color: #dc2626;
}

.conflict-item-details {
  padding-left: 4px;
}

.conflict-detail {
  display: flex;
  gap: 8px;
  font-size: 12px;
  margin-bottom: 4px;
  line-height: 1.4;
}

.detail-label {
  color: #64748b;
  flex-shrink: 0;
  min-width: 40px;
}

.detail-value {
  color: #334155;
  font-family: 'Monaco', 'Consolas', monospace;
  word-break: break-all;
}

.reason-text {
  color: #dc2626;
  font-family: inherit;
}
</style>
