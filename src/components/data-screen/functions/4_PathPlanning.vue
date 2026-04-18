<script setup>
import { reactive, ref, computed } from 'vue'
import { Loader2, Trash2, Search, MapPin, Navigation } from 'lucide-vue-next'

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

const emit = defineEmits(['close', 'showPoint', 'showGrid'])

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

// 层级选项
const levelOptions = [9]

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
  }
}

// 从地图添加点
function setPointFromMap(lon, lat, height) {
  if (props.functionName !== 'A星航路规划') return

  pathPoints.value.push(normalizePoint({ lon, lat, height }))

  console.log('[A星航路规划] 添加点:', lon, lat, height)
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
  <div class="calc-content">
    <template v-if="functionName === 'A星航路规划'">
      <div class="tip">
        <MapPin :size="14" />
        <span>点击地图添加航路点（至少2个点：起点 + 终点，可添加多个途经点）</span>
      </div>

      <form class="form" @submit.prevent="submitAstarPath">
        <!-- 航路点列表 -->
        <div class="points-section">
          <div class="points-title">
            <span>航路点列表</span>
            <span class="points-count">({{ pathPoints.length }}个)</span>
            <button type="button" class="icon-btn-mini clear-btn" @click="clearPoints" :disabled="pathPoints.length === 0" title="清空所有点">
              <Trash2 :size="11" />
            </button>
          </div>

          <div v-if="pathPoints.length === 0" class="empty-hint">
            暂无航路点，请点击地图添加（至少2个点）
          </div>

          <div v-else class="points-list">
            <div v-for="(point, idx) in pathPoints" :key="idx" class="point-card">
              <div class="point-card-header">
                <div class="point-index-badge" :class="{
                  'badge-start': idx === 0,
                  'badge-end': idx === pathPoints.length - 1 && pathPoints.length > 1,
                  'badge-waypoint': idx !== 0 && idx !== pathPoints.length - 1
                }">
                  {{ idx === 0 ? '起点' : idx === pathPoints.length - 1 ? '终点' : `途经${idx}` }}
                </div>
                <button type="button" class="icon-btn-mini" @click="removePoint(idx)" title="删除此点">
                  <Trash2 :size="14" />
                </button>
              </div>
              <div class="point-fields">
                <div class="field">
                  <label class="field-label">经度</label>
                  <input
                    v-model.number="pathPoints[idx].lon"
                    class="point-input-mini"
                    type="number"
                    step="any"
                    placeholder="经度"
                  >
                </div>
                <div class="field">
                  <label class="field-label">纬度</label>
                  <input
                    v-model.number="pathPoints[idx].lat"
                    class="point-input-mini"
                    type="number"
                    step="any"
                    placeholder="纬度"
                  >
                </div>
                <div class="field">
                  <label class="field-label">高度(m)</label>
                  <input
                    v-model.number="pathPoints[idx].height"
                    class="point-input-mini"
                    type="number"
                    step="any"
                    placeholder="高度"
                  >
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 基础参数 -->
        <div class="form-row">
          <label class="form-label" for="startTime">开始时间</label>
          <input
            id="startTime"
            v-model.number="astarForm.startTime"
            type="number"
            step="1"
            class="form-input"
            placeholder="北京时间秒级时间戳"
          >
        </div>

        <div class="form-row">
          <label class="form-label" for="workHeight">工作面高度</label>
          <input
            id="workHeight"
            v-model.number="astarForm.workHeight"
            type="number"
            step="any"
            class="form-input"
            placeholder="无人机作业基准高度"
          >
        </div>

        <!-- 网格设置 -->
        <div class="form-row">
          <label class="form-label" for="level">网格层级</label>
          <select
            id="level"
            v-model.number="astarForm.level"
            class="form-select"
            required
          >
            <option v-for="lvl in levelOptions" :key="lvl" :value="lvl">
              第 {{ lvl }} 级
            </option>
          </select>
          <span class="form-hint">当前仅支持 9 级网格</span>
        </div>

        <div class="form-row">
          <label class="form-label" for="planeRadius">无人机半径</label>
          <input
            id="planeRadius"
            v-model.number="astarForm.planeRadius"
            type="number"
            step="0.01"
            class="form-input"
            placeholder="无人机机身半径(米)"
          >
        </div>

        <div class="form-row">
          <label class="form-label" for="speed">飞行速度</label>
          <input
            id="speed"
            v-model.number="astarForm.speed"
            type="number"
            step="0.1"
            class="form-input"
            placeholder="飞行速度(米/秒)"
          >
        </div>

        <!-- 约束条件 -->
        <div class="constraint-section">
          <div class="constraint-title">约束条件</div>
          <div class="form-row">
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

        <div class="form-actions-stack">
          <div class="form-actions form-actions-primary">
            <button
              type="submit"
              class="btn-primary btn-primary-block"
              :disabled="astarLoading || !canSubmit"
            >
              <Loader2 v-if="astarLoading" :size="13" class="spin" />
              <Navigation v-else :size="13" />
              {{ astarLoading ? '规划中...' : '开始路径规划' }}
            </button>
          </div>
          <div class="form-actions form-actions-clear-grid">
            <button
              type="button"
              class="btn-clear-generated-grid"
              @click="clearPath"
              :disabled="!astarResult"
            >
              <Trash2 :size="14" />
              清除已生成路径
            </button>
          </div>
        </div>
      </form>

      <div v-if="astarError" class="error">{{ astarError }}</div>

      <!-- 查询结果统计 -->
      <div v-if="pathStats" class="result-stats">
        <div class="stat-card">
          <div class="stat-value">{{ pathStats.totalPoints }}</div>
          <div class="stat-label">路径网格数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value success">{{ pathStats.status }}</div>
          <div class="stat-label">规划状态</div>
        </div>
      </div>
    </template>
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
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 6px;
  color: #60a5fa;
  font-size: 13px;
}

/* 航路点列表区域 */
.points-section {
  background: rgba(30, 41, 59, 0.4);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  padding: 10px 10px 10px 12px;
  overflow-x: hidden;
}

.points-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #60a5fa;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(96, 165, 250, 0.15);
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

/* 单个航路点卡片 */
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
  flex: 0 0 auto;
  height: 24px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.badge-start {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
}

.badge-end {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.badge-waypoint {
  background: rgba(59, 130, 246, 0.2);
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
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.3);
  color: #e2e8f0;
  font-size: 11px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}

.point-input-mini:focus {
  border-color: rgba(59, 130, 246, 0.6);
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
  width: 90px;
  font-size: 12px;
  color: #94a3b8;
  flex-shrink: 0;
}

.form-hint {
  font-size: 11px;
  color: #64748b;
  margin-left: 8px;
}

.form-input {
  flex: 1;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
  color: #f1f5f9;
  font-size: 13px;
  outline: none;
  transition: all 0.15s ease;
}

.form-input:focus {
  border-color: #3b82f6;
  background: rgba(99, 102, 241, 0.1);
}

.form-input::placeholder {
  color: #475569;
}

.form-select {
  flex: 1;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
  color: #f1f5f9;
  font-size: 13px;
  outline: none;
  cursor: pointer;
  transition: all 0.15s ease;
}

.form-select:focus {
  border-color: #3b82f6;
  background: rgba(99, 102, 241, 0.1);
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
  accent-color: #3b82f6;
}

.checkbox-text {
  font-size: 13px;
  color: #e2e8f0;
}

/* 约束条件区域 */
.constraint-section {
  background: rgba(30, 41, 59, 0.3);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  padding: 10px 12px;
  margin-top: 4px;
}

.constraint-title {
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  margin-bottom: 8px;
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

/* 清除按钮样式：深酒红底、珊瑚色描边与文字/图标、大圆角 */
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
  background: linear-gradient(135deg, #3b82f6, #0ea5e9);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
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

.result-stats {
  margin-top: 14px;
  display: flex;
  gap: 10px;
}

.stat-card {
  flex: 1;
  padding: 12px 14px;
  border-radius: 8px;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.06);
  text-align: center;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #60a5fa;
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

.stat-label {
  font-size: 11px;
  color: #64748b;
  margin-top: 4px;
}
</style>
