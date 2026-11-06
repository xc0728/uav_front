<script setup>
import { reactive, ref, computed, onBeforeUnmount, watch } from 'vue'
import { Loader2, Trash2, Search, MapPin, Navigation, Database, X, Check } from 'lucide-vue-next'
import { errorMessage } from '../../../utils/http'
import ConflictCheckOptions from './ConflictCheckOptions.vue'
import ConflictCheckResult from './ConflictCheckResult.vue'
import { createConflictForm, buildConflictPayload, requestConflictCheck, requestConflictPathCells, conflictDisplayGrids, conflictMapCells } from '../../../utils/conflictCheck.js'

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

const emit = defineEmits(['close', 'showPoint', 'showGrid', 'showLine', 'show-polygon'])

// ==================== A* 航路规划 ====================
// 路径点列表（起点 + 中间点 + 终点）
const pathPoints = ref([])

// 表单数据
const astarForm = reactive({
  startTime: Math.floor(Date.now() / 1000), // 默认当前时间戳
  level: 9, // 默认网格层级 9
  planeRadius: 0.75, // 默认无人机半径
  speed: 15.0, // 默认飞行速度
})

// 规则库开关状态
const astarConstraints = reactive({
  hl: { enabled: false, label: '航路校验', desc: '路径点必须存在于航路' },
  hlz: { enabled: false, label: '航路障碍物', desc: '航路作为障碍物（与航路校验互斥）' },
  fx: { enabled: false, label: '风险区域', desc: '风险区域不可通行' },
  gd: { enabled: true, label: '实景三维障碍', desc: '存在三维障碍即不可通行' },
  dt: { enabled: false, label: '无人机实时占用', desc: '存在占用即不可通行' },
  dz: { enabled: true, label: '禁飞区', desc: '存在禁飞区即不可通行' },
  za: { enabled: false, label: '障碍物', desc: '存在障碍物即不可通行' },
  dc: { enabled: false, label: '电磁环境', desc: '电磁值超过阈值不可通行', value: 10 },
  ad: { enabled: false, label: '空域类型', desc: '指定禁止通行的空域类型', value: 'G' },
  dp: { enabled: false, label: '实时占用', desc: '指定禁止的占用类型', value: '' },
  wdh: {
    enabled: false, label: '气象约束（阈值）', desc: '小时天气阈值校验',
    visibility: 3, tem: -10, humidity: 80, rainPcpn: 0, pressure: 1000, windSpeed: 5.0,
  },
  wdd: {
    enabled: false, label: '气象约束（区间）', desc: '日天气区间校验',
    visibility: 3, humidity: 80, pressure: 5, tem1: 50, tem2: -10,
  },
})

// 天气约束使用的网格层级
const weatherLevel = ref(11)

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

// 层级选项：1~21 级
const levelOptions = Array.from({ length: 21 }, (_, i) => i + 1)
// A星航路规划层级选项：0~21 级（禁飞区层级与之同步，共用同一选项）
const astarLevelOptions = Array.from({ length: 22 }, (_, i) => i)

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

// 标准化点数据 - 经纬度保留6位小数，高度保留1位小数
function normalizePoint(p) {
  const lon = Number(Number(p.lon).toFixed(6))
  const lat = Number(Number(p.lat).toFixed(6))
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
    // 重置规则库开关
    const simpleKeys = ['hl', 'hlz', 'fx', 'gd', 'dt', 'dz', 'za']
    for (const key of simpleKeys) {
      astarConstraints[key].enabled = key === 'gd'
    }
    astarConstraints.dc.enabled = false; astarConstraints.dc.value = 10
    astarConstraints.ad.enabled = false; astarConstraints.ad.value = 'G'
    astarConstraints.dp.enabled = false; astarConstraints.dp.value = ''
    astarConstraints.wdh.enabled = false
    astarConstraints.wdh.visibility = 3; astarConstraints.wdh.tem = -10
    astarConstraints.wdh.humidity = 80; astarConstraints.wdh.rainPcpn = 0
    astarConstraints.wdh.pressure = 1000; astarConstraints.wdh.windSpeed = 5.0
    astarConstraints.wdd.enabled = false
    astarConstraints.wdd.visibility = 3; astarConstraints.wdd.humidity = 80
    astarConstraints.wdd.pressure = 5; astarConstraints.wdd.tem1 = 50; astarConstraints.wdd.tem2 = -10
    weatherLevel.value = 11
    closeStoreModal()
  }

  if (props.functionName === '路径冲突检测（所有冲突）') {
    cancelConflictRequest()
    conflictError.value = ''
    conflictResult.value = null
    conflictPoints.value = []
    Object.assign(conflictForm, createConflictForm())
  }
  if (props.functionName === '路径冲突检测（首个冲突）') {
    cancelConflictRequest()
    conflictFirstError.value = ''
    conflictFirstResult.value = null
    conflictFirstPoints.value = []
    Object.assign(conflictFirstForm, createConflictForm())
  }
}

// ==================== 禁飞区集成 ====================
const noFlyMode = ref(false)              // 是否处于禁飞区绘制模式
const noFlyPoints = ref([])               // 禁飞区顶点
const noFlyForm = reactive({
  name: '',
  typeCode: 'unit_organization',
  level: 14,
  bottom: 0,
  top: 120,
})
const showNoFlyModal = ref(false)         // 禁飞区信息弹窗
const noFlyRuntime = ref(0)              // 保存+同步耗时(ms)
const noFlySaving = ref(false)

const noFlyTypeOptions = [
  { value: 'unit_organization', label: '单位机构' },
  { value: 'airport_airspace', label: '机场空域' },
  { value: 'transportation_hub', label: '交通枢纽' },
  { value: 'hazardous_materials', label: '危险品' },
  { value: 'major_event', label: '重要活动' },
  { value: 'other_no_fly_zone', label: '其他禁飞区' },
]

function enterNoFlyMode() {
  noFlyMode.value = true
  noFlyPoints.value = []
}

function exitNoFlyMode() {
  noFlyMode.value = false
  noFlyPoints.value = []
  emit('show-polygon', [])  // 清除预览
}

function removeNoFlyPoint(idx) {
  noFlyPoints.value.splice(idx, 1)
  if (noFlyPoints.value.length >= 3) {
    emit('show-polygon', {
      type: 'noFlyZone',
      points: noFlyPoints.value.map(p => ({ lon: p.lon, lat: p.lat })),
      bottom: Number(noFlyForm.bottom),
      top: Number(noFlyForm.top),
      color: '#ef4444',
    })
  } else {
    emit('show-polygon', [])
  }
}

// 应用禁飞区：先保存禁飞区 → 再同步到 Redis（sync 依赖 save 的 DB 记录，必须串行）→ 弹窗
async function applyNoFlyZone() {
  if (noFlyPoints.value.length < 3) return
  noFlySaving.value = true
  const t0 = performance.now()

  try {
    // ① 保存禁飞区（必须先完成，sync 接口要查这条 DB 记录）
    const savePayload = {
      name: noFlyForm.name.trim() || `禁飞区_${Date.now()}`,
      typeCode: noFlyForm.typeCode,
      level: Number(astarForm.level),  // 直接用基础参数的网格层级，与规划路径同层级
      bottom: parseFloat(Number(noFlyForm.bottom).toFixed(1)),
      top: parseFloat(Number(noFlyForm.top).toFixed(1)),
      boundary: noFlyPoints.value.map(p => [Number(p.lon), Number(p.lat)]),
    }
    console.log('[禁飞区] ① 保存 payload:', savePayload)

    const saveResp = await fetch('/api/multiSource/airSpace/noFlyZone/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(savePayload),
    })
    if (!saveResp.ok) {
      throw new Error(await errorMessage(saveResp, `保存失败(${saveResp.status})`))
    }
    const saveData = await saveResp.json()
    console.log('[禁飞区] ① 保存返回:', saveData)
    if (saveData?.status && saveData.status !== 'success') {
      throw new Error(`保存接口返回失败: ${saveData?.message || JSON.stringify(saveData)}`)
    }

    // ② 同步到 Redis（查询已保存的禁飞区记录 → 栅格化 → 批量写 Redis）
    const syncPayload = {
      typeCode: noFlyForm.typeCode,
      level: Number(astarForm.level),
    }
    console.log('[禁飞区] ② 同步 Redis payload:', syncPayload)

    const syncResp = await fetch('/api/multiSource/redisSync/syncNoFlyZoneToRedis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(syncPayload),
    })
    if (!syncResp.ok) {
      throw new Error(await errorMessage(syncResp, `障碍同步失败(${syncResp.status})`))
    }
    const syncData = await syncResp.json()
    console.log('[禁飞区] ② 同步返回:', syncData)
    if (syncData?.status && syncData.status !== 'success') {
      throw new Error(`同步接口返回失败: ${syncData?.message || JSON.stringify(syncData)}`)
    }

    noFlyRuntime.value = Math.round(performance.now() - t0)
    console.log(`[禁飞区] 串行总耗时: ${noFlyRuntime.value}ms`)
    showNoFlyModal.value = true
  } catch (err) {
    console.error('[禁飞区] 保存/同步失败:', err)
    astarError.value = `禁飞区保存失败: ${err?.message || '请求失败'}`
  } finally {
    noFlySaving.value = false
  }
}

// 确认弹窗 → 退出绘制模式 + 重新规划 + 保留禁飞区棱柱
async function confirmNoFlyAndReplan() {
  showNoFlyModal.value = false
  noFlyMode.value = false
  await submitAstarPath()
  // 重新规划后，确保禁飞区棱柱仍显示在地图上（与新蓝色航路叠加）
  if (noFlyPoints.value.length >= 3) {
    emit('show-polygon', {
      type: 'noFlyZone',
      points: noFlyPoints.value.map(p => ({ lon: p.lon, lat: p.lat })),
      bottom: Number(noFlyForm.bottom),
      top: Number(noFlyForm.top),
      color: '#ef4444',
    })
  }
}

// 从地图添加点
function setPointFromMap(lon, lat, height) {
  // A星航路规划
  if (props.functionName === 'A星航路规划') {
    if (noFlyMode.value) {
      noFlyPoints.value.push({ lon: Number(lon), lat: Number(lat), height: Number(height) || 0 })
      if (noFlyPoints.value.length >= 3) {
        emit('show-polygon', {
          type: 'noFlyZone',
          points: noFlyPoints.value.map(point => ({ lon: point.lon, lat: point.lat })),
          bottom: Number(noFlyForm.bottom),
          top: Number(noFlyForm.top),
          color: '#ef4444',
        })
      }
      return
    }
    pathPoints.value.push(normalizePoint({ lon, lat, height }))
    return
  }

  // 两种冲突模式分别接收各自的航点，目录加载不影响地图选点。
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
const conflictForm = reactive(createConflictForm())

// 冲突检测点列表
const conflictPoints = ref([])

// 冲突检测状态和结果
const conflictLoading = ref(false)
const conflictError = ref('')
const conflictResult = ref(null)

// 删除冲突点
function removeConflictPoint(index) {
  cancelConflictRequest()
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
  cancelConflictRequest()
  conflictPoints.value = []
  // 清除路径连线
  emit('showLine', [])
}

// 清除冲突检测结果
function clearConflictResult() {
  cancelConflictRequest()
  emit('showGrid', { cells: [] })
  conflictResult.value = null
}

// 两种模式共享请求与渲染逻辑；基础设施错误只展示错误，不转换成“无冲突”。
let conflictController
function cancelConflictRequest() {
  conflictController?.abort()
  conflictLoading.value = false
  conflictFirstLoading.value = false
}
onBeforeUnmount(cancelConflictRequest)
const canSubmitConflict = computed(() => conflictPoints.value.length >= 2 && Boolean(conflictForm.datasetId) && conflictForm.catalogLoaded)
async function runConflictCheck(form, points, mode, loading, error, result) {
  cancelConflictRequest()
  const current = new AbortController()
  conflictController = current
  error.value = ''
  result.value = null
  emit('showGrid', { cells: [] })
  loading.value = true
  try {
    const payload = buildConflictPayload(form, points, mode)
    const startedAt = performance.now()
    const data = await requestConflictCheck(payload, { signal: current.signal })
    if (current.signal.aborted) return
    result.value = { data, mode, grids: conflictDisplayGrids(data, []) }
    try {
      const pathCells = await requestConflictPathCells(payload.points, { signal: current.signal })
      if (current.signal.aborted) return
      const cells = conflictMapCells(data, pathCells, mode)
      if (!cells.length) throw new Error('未取得可显示的航迹网格')
      result.value.grids = conflictDisplayGrids(data, pathCells)
      emit('showGrid', { cells, level: 17, runtime: performance.now() - startedAt })
    } catch (displayError) {
      if (!current.signal.aborted) result.value.visualizationWarning = `检测结果已取得，路径网格显示失败：${displayError.message}`
    }
  } catch (requestError) {
    if (!current.signal.aborted) error.value = requestError?.message || '检测失败，请重试'
  } finally {
    if (conflictController === current) loading.value = false
  }
}
function submitConflictCheck() {
  return runConflictCheck(conflictForm, conflictPoints.value, 'ALL', conflictLoading, conflictError, conflictResult)
}

// 路径冲突检测（首个冲突）- 表单数据
const conflictFirstForm = reactive(createConflictForm())

// 首个冲突检测点列表
const conflictFirstPoints = ref([])

// 首个冲突检测状态和结果
const conflictFirstLoading = ref(false)
const conflictFirstError = ref('')
const conflictFirstResult = ref(null)

// 删除首个冲突点
function removeConflictFirstPoint(index) {
  cancelConflictRequest()
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
  cancelConflictRequest()
  conflictFirstPoints.value = []
  // 清除路径连线
  emit('showLine', [])
}

// 清除首个冲突检测结果
function clearConflictFirstResult() {
  cancelConflictRequest()
  emit('showGrid', { cells: [] })
  conflictFirstResult.value = null
}

// 修改航点后废弃旧检测，取消在途查询，避免旧航迹结果覆盖新输入。
watch([conflictPoints, conflictFirstPoints], () => {
  cancelConflictRequest()
  conflictResult.value = null
  conflictFirstResult.value = null
  emit('showGrid', { cells: [] })
}, { deep: true })

const canSubmitConflictFirst = computed(() => conflictFirstPoints.value.length >= 2 && Boolean(conflictFirstForm.datasetId) && conflictFirstForm.catalogLoaded)
function submitConflictFirstCheck() {
  return runConflictCheck(conflictFirstForm, conflictFirstPoints.value, 'FIRST', conflictFirstLoading, conflictFirstError, conflictFirstResult)
}

defineExpose({ resetForm, setPointFromMap })

// 表单验证
const canSubmit = computed(() => {
  if (pathPoints.value.length < 2) return false // 至少需要起点和终点
  if (!Number.isFinite(Number(astarForm.startTime))) return false
  if (!Number.isFinite(Number(astarForm.level))) return false
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
    // 构建约束条件
    const condition = {}
    const level = Number(astarForm.level)
    const wLevel = Number(weatherLevel.value)

    // 简单开关型约束（值为空字符串）
    const simpleKeys = ['hl', 'hlz', 'fx', 'gd', 'dt', 'dz', 'za']
    for (const key of simpleKeys) {
      if (astarConstraints[key].enabled) {
        condition[`${key}_${level}`] = ""
      }
    }

    // 电磁环境（数值阈值）
    if (astarConstraints.dc.enabled) {
      condition[`dc_${level}`] = Number(astarConstraints.dc.value) || 10
    }

    // 空域类型（字符串）
    if (astarConstraints.ad.enabled) {
      condition[`ad_${level}`] = String(astarConstraints.ad.value || 'G')
    }

    // 实时占用（字符串）
    if (astarConstraints.dp.enabled) {
      condition[`dp_${level}`] = String(astarConstraints.dp.value || '')
    }

    // 气象约束-阈值型
    if (astarConstraints.wdh.enabled) {
      condition[`wdh_${wLevel}`] = {
        visibility: Number(astarConstraints.wdh.visibility) || 3,
        tem: Number(astarConstraints.wdh.tem) || -10,
        humidity: Number(astarConstraints.wdh.humidity) || 80,
        rainPcpn: Number(astarConstraints.wdh.rainPcpn) || 0,
        pressure: Number(astarConstraints.wdh.pressure) || 1000,
        windSpeed: Number(astarConstraints.wdh.windSpeed) || 5.0,
      }
    }

    // 气象约束-区间型
    if (astarConstraints.wdd.enabled) {
      condition[`wdd_${wLevel}`] = {
        visibility: Number(astarConstraints.wdd.visibility) || 3,
        humidity: Number(astarConstraints.wdd.humidity) || 80,
        pressure: Number(astarConstraints.wdd.pressure) || 5,
        tem1: Number(astarConstraints.wdd.tem1) || 50,
        tem2: Number(astarConstraints.wdd.tem2) || -10,
      }
    }

    const payload = {
      startTime: Number(astarForm.startTime),
      points: pathPoints.value.map(p => [p.lon, p.lat, p.height]),
      level: Number(astarForm.level),
      planeRadius: Number(astarForm.planeRadius),
      speed: Number(astarForm.speed),
      condition: condition
    }

    console.log('[A星航路规划] 发送 payload:', payload)

    const t0 = performance.now()
    const resp = await fetch('/api/airRoute/Astar/AstarPathPlane', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) {
      throw new Error(await errorMessage(resp, `请求失败，状态码 ${resp.status}`))
    }

    const data = await resp.json()
    const runtime = performance.now() - t0
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
        emit('showGrid', { cells, level: Number(astarForm.level), runtime })
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
          <span class="param-label">网格层级</span>
          <select v-model.number="astarForm.level" class="param-select">
            <option v-for="lvl in astarLevelOptions" :key="lvl" :value="lvl">第 {{ lvl }} 级</option>
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

      <!-- 约束条件（规则库开关） -->
      <div class="form-group">
        <div class="group-title">约束条件</div>

        <!-- 简单开关型 -->
        <div class="rule-row" v-for="key in ['gd', 'dz']" :key="key">
          <div class="rule-info">
            <span class="rule-label">{{ astarConstraints[key].label }}</span>
            <span class="rule-desc">{{ astarConstraints[key].desc }}</span>
          </div>
          <label class="toggle-switch">
            <input
              type="checkbox"
              :checked="astarConstraints[key].enabled"
              @change="astarConstraints[key].enabled = $event.target.checked"
            />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <!-- 添加禁飞区入口（dz 开关下方） -->
        <div class="nofly-entry">
          <button v-if="!noFlyMode" type="button" class="btn-nofly-add" @click="enterNoFlyMode">
            <MapPin :size="14" /> 添加禁飞区
          </button>

          <!-- 禁飞区绘制模式（内嵌，不切换面板） -->
          <div v-else class="nofly-drawing">
            <div class="nofly-hint">点击地图添加顶点（{{ noFlyPoints.length }}/3+）</div>

            <!-- 顶点列表 -->
            <div v-if="noFlyPoints.length > 0" class="nofly-points">
              <div v-for="(p, idx) in noFlyPoints" :key="idx" class="nofly-point-item">
                <span class="nofly-point-idx">{{ idx + 1 }}</span>
                <span class="nofly-point-coord">{{ p.lon.toFixed(4) }}, {{ p.lat.toFixed(4) }}</span>
                <button type="button" class="btn-point-del" @click="removeNoFlyPoint(idx)" :disabled="noFlySaving">
                  <Trash2 :size="12" />
                </button>
              </div>
            </div>

            <!-- 紧凑参数表单 -->
            <div class="nofly-form-compact">
              <select v-model="noFlyForm.typeCode" class="param-select-sm" aria-label="禁飞区类型">
                <option v-for="opt in noFlyTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
              <!-- 网格层级：直接绑定 astarForm.level，与路径规划同层级 -->
              <div class="nofly-level-row">
                <span class="nofly-level-label">网格层级</span>
                <select v-model.number="astarForm.level" class="param-select-sm" aria-label="禁飞区网格层级（同步基础参数）">
                  <option v-for="lvl in astarLevelOptions" :key="lvl" :value="lvl">第 {{ lvl }} 级</option>
                </select>
                <span class="nofly-level-tip">与规划路径同步</span>
              </div>
              <div class="nofly-height-row">
                <input v-model.number="noFlyForm.bottom" type="number" step="any" min="0" class="param-input-sm" placeholder="底高" aria-label="底面高度">
                <span class="nofly-sep">~</span>
                <input v-model.number="noFlyForm.top" type="number" step="any" min="0" class="param-input-sm" placeholder="顶高" aria-label="顶面高度">
              </div>
            </div>

            <div class="btn-row">
              <button type="button" class="btn-query btn-nofly-apply" @click="applyNoFlyZone"
                :disabled="noFlyPoints.length < 3 || noFlySaving">
                <Loader2 v-if="noFlySaving" :size="14" class="spin" />
                {{ noFlySaving ? '保存中...' : '应用' }}
              </button>
              <button type="button" class="btn-clear" @click="exitNoFlyMode" :disabled="noFlySaving">取消</button>
            </div>
          </div>
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
                    {{ pathPoints[0].lon.toFixed(6) }}, {{ pathPoints[0].lat.toFixed(6) }}, {{ pathPoints[0].height.toFixed(1) }}m
                  </span>
                </div>
                <div class="store-info-item">
                  <span class="store-info-label">终点：</span>
                  <span class="store-info-value" v-if="pathPoints.length >= 2">
                    {{ pathPoints[pathPoints.length - 1].lon.toFixed(6) }}, {{ pathPoints[pathPoints.length - 1].lat.toFixed(6) }}, {{ pathPoints[pathPoints.length - 1].height.toFixed(1) }}m
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

      <!-- 禁飞区信息弹窗 -->
      <Teleport to="body">
        <div v-if="showNoFlyModal" class="modal-overlay" @click.self="showNoFlyModal = false">
          <div class="modal-content modal-nofly">
            <div class="modal-header">
              <h3>禁飞区已生成</h3>
              <button class="modal-close" @click="showNoFlyModal = false">
                <X :size="18" />
              </button>
            </div>
            <div class="modal-body">
              <div class="nofly-modal-summary">
                <div class="modal-row">
                  <span class="modal-row-label">高度范围</span>
                  <span class="modal-row-value">{{ noFlyForm.bottom }}m - {{ noFlyForm.top }}m</span>
                </div>
                <div class="modal-row highlight">
                  <span class="modal-row-label">生成耗时</span>
                  <span class="modal-row-value runtime-value">{{ noFlyRuntime }} ms</span>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn-confirm" @click="confirmNoFlyAndReplan">
                确定（重新规划）
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

      <ConflictCheckOptions :form="conflictForm" :disabled="conflictLoading" />

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

      <ConflictCheckResult v-if="conflictResult" :result="conflictResult" />
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

      <ConflictCheckOptions :form="conflictFirstForm" :disabled="conflictFirstLoading" />

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

      <ConflictCheckResult v-if="conflictFirstResult" :result="conflictFirstResult" />
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

/* 规则库开关 */
.rule-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #f1f0ed;
}

.rule-row:last-of-type {
  border-bottom: none;
}

.rule-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.rule-label {
  font-size: 14px;
  font-weight: 500;
  color: #334155;
}

.rule-desc {
  font-size: 12px;
  color: #94a3b8;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
  flex-shrink: 0;
  margin-left: 8px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #cbd5e1;
  border-radius: 22px;
  transition: 0.2s;
}

.toggle-slider::before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  border-radius: 50%;
  transition: 0.2s;
}

.toggle-switch input:checked + .toggle-slider {
  background-color: #5b9fd4;
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(18px);
}

.rule-expand {
  padding: 8px 0 8px 12px;
  border-bottom: 1px solid #f1f0ed;
  background: #faf8f5;
  border-radius: 0 0 6px 6px;
}

.rule-param-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.rule-param-line:last-child {
  margin-bottom: 0;
}

.rule-param-label {
  width: 64px;
  font-size: 13px;
  color: #64748b;
  flex-shrink: 0;
}

.rule-param-input {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  font-size: 13px;
  box-sizing: border-box;
}

.rule-param-input:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 2px rgba(91, 159, 212, 0.12);
}

.rule-param-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.rule-param-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.rule-param-sm-label {
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
  min-width: 48px;
}

.rule-param-sm-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 6px;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  background: #fff;
  color: #334155;
  font-size: 12px;
  box-sizing: border-box;
}

.rule-param-sm-input:focus {
  outline: none;
  border-color: #7db8e0;
  box-shadow: 0 0 0 2px rgba(91, 159, 212, 0.12);
}

/* ============ 添加禁飞区 ============ */
.nofly-entry {
  margin-top: 8px;
}

.btn-nofly-add {
  width: 100%;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px dashed rgba(239, 68, 68, 0.5);
  color: #dc2626;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-nofly-add:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: #ef4444;
  border-style: solid;
}

.btn-nofly-add :deep(svg) {
  flex-shrink: 0;
}

/* 禁飞区绘制模式（内嵌） */
.nofly-drawing {
  padding: 10px;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.05);
  border: 1px solid rgba(239, 68, 68, 0.25);
}

.nofly-hint {
  font-size: 12px;
  color: #b91c1c;
  margin-bottom: 8px;
  font-weight: 500;
}

.nofly-points {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
  max-height: 120px;
  overflow-y: auto;
}

.nofly-point-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 4px;
  background: #ffffff;
  border: 1px solid #fecaca;
  font-size: 11px;
}

.nofly-point-idx {
  flex-shrink: 0;
  min-width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #ef4444;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
}

.nofly-point-coord {
  flex: 1;
  color: #475569;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-point-del {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-point-del:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.15);
  color: #dc2626;
}

.btn-point-del:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 紧凑参数表单 */
.nofly-form-compact {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}

.param-select-sm {
  height: 28px;
  padding: 0 6px;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  background: #fff;
  color: #334155;
  font-size: 12px;
  box-sizing: border-box;
  outline: none;
}

.param-select-sm:focus {
  border-color: #7db8e0;
  box-shadow: 0 0 0 2px rgba(91, 159, 212, 0.12);
}

.nofly-height-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 网格层级行（同步基础参数） */
.nofly-level-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 5px;
  background: rgba(91, 159, 212, 0.08);
  border: 1px solid rgba(91, 159, 212, 0.25);
}

.nofly-level-label {
  flex-shrink: 0;
  font-size: 12px;
  color: #475569;
  font-weight: 500;
}

.nofly-level-row .param-select-sm {
  flex: 1;
}

.nofly-level-tip {
  flex-shrink: 0;
  font-size: 10px;
  color: #5b9fd4;
  font-weight: 500;
}

.nofly-level-value {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: #1e3a5f;
  font-weight: 600;
}

.conflict-nofly-airspace {
  width: 100%;
  flex: none;
}

.param-input-sm {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 6px;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  background: #fff;
  color: #334155;
  font-size: 12px;
  box-sizing: border-box;
  outline: none;
}

.param-input-sm:focus {
  border-color: #7db8e0;
  box-shadow: 0 0 0 2px rgba(91, 159, 212, 0.12);
}

.param-input-sm::placeholder {
  color: #94a3b8;
}

.nofly-sep {
  color: #94a3b8;
  font-size: 12px;
}

.btn-nofly-apply {
  background: linear-gradient(135deg, #ef4444, #dc2626) !important;
}

.btn-nofly-apply:hover:not(:disabled) {
  background: linear-gradient(135deg, #f87171, #ef4444) !important;
}

/* ============ 禁飞区信息弹窗 ============ */
.modal-nofly {
  width: 340px;
}

.nofly-modal-summary {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.modal-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 6px;
  background: #ffffff;
  border: 1px solid #ebe6df;
}

.modal-row.highlight {
  background: rgba(168, 85, 247, 0.06);
  border-color: rgba(168, 85, 247, 0.25);
}

.modal-row-label {
  font-size: 13px;
  color: #94a3b8;
}

.modal-row-value {
  font-size: 13px;
  color: #334155;
  font-family: monospace;
  font-weight: 600;
}

.modal-row.highlight .modal-row-value {
  color: #a855f7;
}

.runtime-value {
  font-size: 16px;
  font-weight: 700;
}

.warn-text {
  color: #dc2626 !important;
  font-weight: 700;
}

.nofly-modal-warn {
  margin-top: 10px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: #b45309;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 6px;
}

.nofly-force-row {
  margin-top: 6px;
}

.nofly-status-box {
  margin-top: 10px;
  padding: 8px 10px;
  background: #f9fafb;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.nofly-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 0;
}

.nofly-status-label {
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
}

.nofly-status-value {
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  word-break: break-all;
  text-align: right;
}

.nofly-attach-msg {
  margin-top: 6px;
  padding: 6px 8px;
  font-size: 12px;
  line-height: 1.5;
  color: #b45309;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 6px;
}

.nofly-status-actions {
  margin: 8px 0 0;
}
</style>
