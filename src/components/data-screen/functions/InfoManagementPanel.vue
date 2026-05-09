<script setup>
import { ref, onMounted, watch } from 'vue'
import { ChevronLeft, Plane, AlertTriangle, FileCheck, Route, RefreshCw, Loader2, Shield } from 'lucide-vue-next'

const emit = defineEmits(['switch-view', 'route-monitor-start', 'route-monitor-stop'])

// 接收外部传入的监控状态
const props = defineProps({
  monitoredRouteIds: {
    type: Array,
    default: () => []
  }
})

const currentView = ref('list') // 'list' | 'detail'
const activeModuleId = ref('')
const isLoading = ref(false)

// 信息管理系统功能模块
const infoModules = [
  {
    id: 'aircraft-status',
    name: '飞行器状态',
    shortName: '飞行器状态',
    icon: Plane,
    status: 'pending',
  },
  {
    id: 'event-management',
    name: '异常事件管理',
    shortName: '异常事件管理',
    icon: AlertTriangle,
    status: 'pending',
  },
  {
    id: 'qualification-approval',
    name: '飞行资质审批',
    shortName: '飞行资质审批',
    icon: FileCheck,
    status: 'pending',
  },
  {
    id: 'route-info',
    name: '航线信息管理',
    shortName: '航线信息管理',
    icon: Route,
    status: 'developing',
  },
  {
    id: 'fence-info',
    name: '电子围栏管理',
    shortName: '电子围栏管理',
    icon: Shield,
    status: 'developing',
  },
]

// 航线数据
const routeList = ref([])
const routeError = ref('')

// 电子围栏数据
const fenceList = ref([])
const fenceError = ref('')

// 分页
const currentPage = ref(1)
const pageSize = ref(10)
const totalCount = ref(0)

// 详情数据
const selectedRoute = ref(null)
const selectedFence = ref(null)

// 航线监控状态
const monitoredRoutes = ref(new Set())

// 监听 prop 变化，同步到本地状态
watch(() => props.monitoredRouteIds, (newIds) => {
  monitoredRoutes.value = new Set(newIds)
}, { immediate: true })

// 判断航线是否被监控
function isRouteMonitored(routeId) {
  return props.monitoredRouteIds.includes(routeId)
}

// 切换航线监控状态
async function toggleRouteMonitor(route) {
  const routeId = route.id
  const isMonitored = isRouteMonitored(routeId)

  if (isMonitored) {
    emit('route-monitor-stop', { id: routeId })
  } else {
    emit('route-monitor-start', { id: routeId, name: route.name })
  }
}

// 电子围栏分页
const fenceCurrentPage = ref(1)
const fencePageSize = ref(10)
const fenceTotalCount = ref(0)
const fenceTotalPages = ref(1)
const paginatedFences = ref([])

// 返回列表
function goBack() {
  currentView.value = 'list'
  activeModuleId.value = ''
  selectedRoute.value = null
  selectedFence.value = null
}

// 点击模块
function selectModule(module) {
  if (module.status === 'pending') return

  activeModuleId.value = module.id

  if (module.id === 'route-info') {
    currentView.value = 'list'
    fetchRoutes()
  } else if (module.id === 'fence-info') {
    currentView.value = 'list'
    fetchFences()
  }
}

// 获取航线列表
async function fetchRoutes() {
  isLoading.value = true
  routeError.value = ''

  try {
    const resp = await fetch('/api/airRoute/routeManagement/listStoredRoutes', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(`请求失败: ${resp.status}`)
    }

    const data = await resp.json()
    console.log('[航线列表] 返回数据:', data)

    if (data?.status === 'success' && Array.isArray(data?.data)) {
      routeList.value = data.data
      totalCount.value = data.data.length
      updatePagination()
    } else {
      routeList.value = []
      totalCount.value = 0
      updatePagination()
    }
  } catch (err) {
    console.error('[航线列表] 请求错误:', err)
    routeError.value = err?.message || '获取航线列表失败'
  } finally {
    isLoading.value = false
  }
}

// 查看详情
function viewDetail(route) {
  selectedRoute.value = route
  currentView.value = 'detail'
}

// 获取电子围栏列表
async function fetchFences() {
  isLoading.value = true
  fenceError.value = ''

  try {
    const resp = await fetch('/api/airRoute/fenceManagement/listFences', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(`请求失败: ${resp.status}`)
    }

    const data = await resp.json()
    console.log('[电子围栏列表] 返回数据:', data)

    if (data?.status === 'success' && Array.isArray(data?.data)) {
      fenceList.value = data.data
      fenceTotalCount.value = data.data.length
      updateFencePagination()
    } else {
      fenceList.value = []
      fenceTotalCount.value = 0
      updateFencePagination()
    }
  } catch (err) {
    console.error('[电子围栏列表] 请求错误:', err)
    fenceError.value = err?.message || '获取电子围栏列表失败'
  } finally {
    isLoading.value = false
  }
}

// 查看电子围栏详情
function viewFenceDetail(fence) {
  selectedFence.value = fence
  currentView.value = 'fence-detail'
}

// 电子围栏分页
function updateFencePagination() {
  fenceTotalPages.value = Math.max(1, Math.ceil(fenceTotalCount.value / fencePageSize.value))
  const start = (fenceCurrentPage.value - 1) * fencePageSize.value
  paginatedFences.value = fenceList.value.slice(start, start + fencePageSize.value)
}

function prevFencePage() {
  if (fenceCurrentPage.value > 1) {
    fenceCurrentPage.value--
    updateFencePagination()
  }
}

function nextFencePage() {
  if (fenceCurrentPage.value < fenceTotalPages.value) {
    fenceCurrentPage.value++
    updateFencePagination()
  }
}

// 格式化坐标
function formatCoord(point) {
  if (!point || point.length < 3) return '-'
  return `${point[0].toFixed(6)}, ${point[1].toFixed(6)}, ${point[2]}m`
}

// 获取当前模块名称
function getModuleName() {
  const module = infoModules.find(m => m.id === activeModuleId.value)
  return module?.name || ''
}

// 计算分页
const totalPages = ref(1)
const paginatedRoutes = ref([])

function updatePagination() {
  totalPages.value = Math.max(1, Math.ceil(totalCount.value / pageSize.value))
  const start = (currentPage.value - 1) * pageSize.value
  paginatedRoutes.value = routeList.value.slice(start, start + pageSize.value)
}

function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value--
    updatePagination()
  }
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
    updatePagination()
  }
}

onMounted(() => {
  // 默认进入航线信息管理
  selectModule(infoModules.find(m => m.id === 'route-info'))
})

defineExpose({
  goBack
})
</script>

<template>
  <div class="info-management-page">
    <!-- 左侧导航栏 -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <h2>信息管理</h2>
      </div>
      <nav class="sidebar-nav">
        <button
          v-for="module in infoModules"
          :key="module.id"
          class="nav-item"
          :class="{ active: activeModuleId === module.id, disabled: module.status === 'pending' }"
          @click="selectModule(module)"
        >
          <component :is="module.icon" :size="18" class="nav-icon" />
          <span class="nav-text">{{ module.shortName }}</span>
          <span v-if="module.status === 'pending'" class="nav-badge">待开发</span>
        </button>
      </nav>
    </aside>

    <!-- 主内容区 -->
    <main class="main-content">
      <!-- 航线信息管理视图 -->
      <template v-if="activeModuleId === 'route-info'">
        <!-- 面包屑导航 -->
        <div class="breadcrumb">
          <span class="breadcrumb-item">智绘平台</span>
          <span class="breadcrumb-separator">/</span>
          <span class="breadcrumb-item">信息管理系统</span>
          <span class="breadcrumb-separator">/</span>
          <span class="breadcrumb-item current">航线信息管理</span>
        </div>

        <!-- 航线列表视图 -->
        <div v-if="currentView === 'list'" class="route-list-view">
          <div class="view-header">
            <h3>航线列表</h3>
            <button class="btn-refresh" @click="fetchRoutes" :disabled="isLoading">
              <Loader2 v-if="isLoading" :size="14" class="spin" />
              <RefreshCw v-else :size="14" />
              刷新
            </button>
          </div>

          <!-- 加载状态 -->
          <div v-if="isLoading && routeList.length === 0" class="loading-state">
            <Loader2 :size="32" class="spin" />
            <span>加载中...</span>
          </div>

          <!-- 错误提示 -->
          <div v-else-if="routeError" class="error-state">
            {{ routeError }}
          </div>

          <!-- 空状态 -->
          <div v-else-if="routeList.length === 0" class="empty-state">
            <Route :size="48" class="empty-icon" />
            <p>暂无航线数据</p>
          </div>

          <!-- 数据表格 -->
          <div v-else class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>序号</th>
                  <th>航线ID</th>
                  <th>航线名称</th>
                  <th>起点坐标</th>
                  <th>终点坐标</th>
                  <th>监控</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(route, index) in paginatedRoutes" :key="route.id">
                  <td class="col-index">{{ (currentPage - 1) * pageSize + index + 1 }}</td>
                  <td class="col-id">{{ route.id }}</td>
                  <td class="col-name">{{ route.name || '-' }}</td>
                  <td class="col-coord">{{ formatCoord(route.startPoint) }}</td>
                  <td class="col-coord">{{ formatCoord(route.endPoint) }}</td>
                  <td class="col-actions">
                    <label class="switch">
                      <input
                        type="checkbox"
                        :checked="isRouteMonitored(route.id)"
                        @change="toggleRouteMonitor(route)"
                      />
                      <span class="slider"></span>
                    </label>
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- 分页 -->
            <div class="pagination">
              <span class="page-info">
                共 {{ totalCount }} 条记录，第 {{ currentPage }} / {{ totalPages }} 页
              </span>
              <div class="page-buttons">
                <button class="btn-page" @click="prevPage" :disabled="currentPage <= 1">上一页</button>
                <button class="btn-page" @click="nextPage" :disabled="currentPage >= totalPages">下一页</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 航线详情视图 -->
        <div v-else-if="currentView === 'detail' && selectedRoute" class="route-detail-view">
          <div class="view-header">
            <button class="btn-back" @click="goBack">
              <ChevronLeft :size="18" />
              返回列表
            </button>
            <h3>航线详情</h3>
          </div>

          <div class="detail-content">
            <div class="detail-section">
              <h4>基本信息</h4>
              <div class="detail-grid">
                <div class="detail-item">
                  <label>航线ID</label>
                  <span>{{ selectedRoute.id }}</span>
                </div>
                <div class="detail-item">
                  <label>航线名称</label>
                  <span>{{ selectedRoute.name || '未命名' }}</span>
                </div>
              </div>
            </div>

            <div class="detail-section">
              <h4>航线坐标</h4>
              <div class="coord-info">
                <div class="coord-item">
                  <span class="coord-label">起点</span>
                  <span class="coord-value">{{ formatCoord(selectedRoute.startPoint) }}</span>
                </div>
                <div class="coord-item">
                  <span class="coord-label">终点</span>
                  <span class="coord-value">{{ formatCoord(selectedRoute.endPoint) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 电子围栏管理视图 -->
        <template v-else-if="activeModuleId === 'fence-info'">
          <!-- 面包屑导航 -->
          <div class="breadcrumb">
            <span class="breadcrumb-item">智绘平台</span>
            <span class="breadcrumb-separator">/</span>
            <span class="breadcrumb-item">信息管理系统</span>
            <span class="breadcrumb-separator">/</span>
            <span class="breadcrumb-item current">电子围栏管理</span>
          </div>

          <!-- 电子围栏列表视图 -->
          <div v-if="currentView === 'list'" class="fence-list-view">
            <div class="view-header">
              <h3>电子围栏列表</h3>
              <button class="btn-refresh" @click="fetchFences" :disabled="isLoading">
                <Loader2 v-if="isLoading" :size="14" class="spin" />
                <RefreshCw v-else :size="14" />
                刷新
              </button>
            </div>

            <!-- 加载状态 -->
            <div v-if="isLoading && fenceList.length === 0" class="loading-state">
              <Loader2 :size="32" class="spin" />
              <span>加载中...</span>
            </div>

            <!-- 错误提示 -->
            <div v-else-if="fenceError" class="error-state">
              {{ fenceError }}
            </div>

            <!-- 空状态 -->
            <div v-else-if="fenceList.length === 0" class="empty-state">
              <Shield :size="48" class="empty-icon" />
              <p>暂无电子围栏数据</p>
            </div>

            <!-- 数据表格 -->
            <div v-else class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>序号</th>
                    <th>围栏ID</th>
                    <th>围栏名称</th>
                    <th>围栏类型</th>
                    <th>中心坐标</th>
                    <th>半径/范围</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(fence, index) in paginatedFences" :key="fence.id">
                    <td class="col-index">{{ (fenceCurrentPage - 1) * fencePageSize + index + 1 }}</td>
                    <td class="col-id">{{ fence.id }}</td>
                    <td class="col-name">{{ fence.name || '-' }}</td>
                    <td class="col-type">
                      <span class="type-badge" :class="fence.type === 'circle' ? 'type-circle' : 'type-polygon'">
                        {{ fence.type === 'circle' ? '圆形' : '多边形' }}
                      </span>
                    </td>
                    <td class="col-coord">{{ fence.center ? `${fence.center[0].toFixed(6)}, ${fence.center[1].toFixed(6)}` : '-' }}</td>
                    <td class="col-radius">
                      {{ fence.type === 'circle' ? `${fence.radius || 0}m` : fence.points?.length ? `${fence.points.length}个点` : '-' }}
                    </td>
                    <td class="col-actions">
                      <button class="btn-action view" @click="viewFenceDetail(fence)">查看</button>
                    </td>
                  </tr>
                </tbody>
              </table>

              <!-- 分页 -->
              <div class="pagination">
                <span class="page-info">
                  共 {{ fenceTotalCount }} 条记录，第 {{ fenceCurrentPage }} / {{ fenceTotalPages }} 页
                </span>
                <div class="page-buttons">
                  <button class="btn-page" @click="prevFencePage" :disabled="fenceCurrentPage <= 1">上一页</button>
                  <button class="btn-page" @click="nextFencePage" :disabled="fenceCurrentPage >= fenceTotalPages">下一页</button>
                </div>
              </div>
            </div>
          </div>

          <!-- 电子围栏详情视图 -->
          <div v-else-if="currentView === 'fence-detail' && selectedFence" class="fence-detail-view">
            <div class="view-header">
              <button class="btn-back" @click="goBack">
                <ChevronLeft :size="18" />
                返回列表
              </button>
              <h3>电子围栏详情</h3>
            </div>

            <div class="detail-content">
              <div class="detail-section">
                <h4>基本信息</h4>
                <div class="detail-grid">
                  <div class="detail-item">
                    <label>围栏ID</label>
                    <span>{{ selectedFence.id }}</span>
                  </div>
                  <div class="detail-item">
                    <label>围栏名称</label>
                    <span>{{ selectedFence.name || '未命名' }}</span>
                  </div>
                  <div class="detail-item">
                    <label>围栏类型</label>
                    <span>
                      <span class="type-badge" :class="selectedFence.type === 'circle' ? 'type-circle' : 'type-polygon'">
                        {{ selectedFence.type === 'circle' ? '圆形' : '多边形' }}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              <div class="detail-section" v-if="selectedFence.type === 'circle'">
                <h4>圆形围栏参数</h4>
                <div class="detail-grid">
                  <div class="detail-item">
                    <label>中心经度</label>
                    <span>{{ selectedFence.center?.[0]?.toFixed(6) || '-' }}</span>
                  </div>
                  <div class="detail-item">
                    <label>中心纬度</label>
                    <span>{{ selectedFence.center?.[1]?.toFixed(6) || '-' }}</span>
                  </div>
                  <div class="detail-item">
                    <label>半径</label>
                    <span>{{ selectedFence.radius || 0 }} 米</span>
                  </div>
                </div>
              </div>

              <div class="detail-section" v-else>
                <h4>多边形围栏坐标</h4>
                <div class="polygon-points">
                  <div class="point-item" v-for="(point, idx) in selectedFence.points" :key="idx">
                    <span class="point-index">{{ idx + 1 }}</span>
                    <span class="point-coord">{{ point[0].toFixed(6) }}, {{ point[1].toFixed(6) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </template>

      <!-- 其他模块 -->
      <template v-else>
        <div class="coming-soon">
          <h3>{{ getModuleName() }}</h3>
          <p>该模块正在开发中，敬请期待...</p>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.info-management-page {
  display: flex;
  width: 100%;
  height: 100%;
  background: #f8fafc;
}

/* 左侧导航栏 */
.sidebar {
  width: 240px;
  min-width: 240px;
  background: #ffffff;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 20px 16px;
  border-bottom: 1px solid #e2e8f0;
}

.sidebar-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.sidebar-nav {
  flex: 1;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #64748b;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}

.nav-item:hover:not(.disabled) {
  background: #f1f5f9;
  color: #1e293b;
}

.nav-item.active {
  background: #eff6ff;
  color: #3b82f6;
}

.nav-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.nav-icon {
  flex-shrink: 0;
}

.nav-text {
  flex: 1;
}

.nav-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #f1f5f9;
  color: #94a3b8;
}

/* 主内容区 */
.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
}

/* 面包屑 */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
  font-size: 14px;
}

.breadcrumb-item {
  color: #64748b;
}

.breadcrumb-item.current {
  color: #1e293b;
  font-weight: 500;
}

.breadcrumb-separator {
  color: #cbd5e1;
}

/* 视图头部 */
.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.view-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
}

.btn-refresh {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
  color: #64748b;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-refresh:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.btn-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 开关样式 */
.switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #cbd5e1;
  transition: 0.3s;
  border-radius: 24px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
}

.switch input:checked + .slider {
  background-color: #10b981;
}

.switch input:checked + .slider:before {
  transform: translateX(20px);
}

.btn-back {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
  color: #64748b;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-back:hover {
  background: #f8fafc;
  color: #1e293b;
}

/* 状态显示 */
.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px;
  color: #64748b;
  font-size: 14px;
  gap: 12px;
}

.error-state {
  color: #ef4444;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 16px;
}

.empty-icon {
  color: #cbd5e1;
}

/* 数据表格 */
.table-container {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid #f1f5f9;
}

.data-table th {
  background: #f8fafc;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  border-bottom: 1px solid #e2e8f0;
}

.data-table td {
  font-size: 13px;
  color: #334155;
}

.data-table tbody tr:hover {
  background: #f8fafc;
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.col-index {
  width: 60px;
  color: #94a3b8 !important;
}

.col-id {
  font-family: monospace;
}

.col-name {
  font-weight: 500;
}

.col-coord {
  font-family: monospace;
  font-size: 12px !important;
  color: #64748b !important;
}

.col-actions {
  width: 80px;
}

.btn-action {
  padding: 4px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  background: #ffffff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-action.view {
  color: #3b82f6;
  border-color: #bfdbfe;
  background: #eff6ff;
}

.btn-action.view:hover {
  background: #dbeafe;
  border-color: #93c5fd;
}

/* 分页 */
.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid #f1f5f9;
  background: #f8fafc;
}

.page-info {
  font-size: 13px;
  color: #64748b;
}

.page-buttons {
  display: flex;
  gap: 8px;
}

.btn-page {
  padding: 6px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  background: #ffffff;
  color: #64748b;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-page:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #cbd5e1;
  color: #1e293b;
}

.btn-page:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 详情视图 */
.route-detail-view {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.detail-content {
  padding: 20px;
}

.detail-section {
  margin-bottom: 24px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.detail-section h4 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  padding-bottom: 8px;
  border-bottom: 1px solid #f1f5f9;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-item label {
  font-size: 12px;
  color: #64748b;
}

.detail-item span {
  font-size: 14px;
  color: #1e293b;
  font-weight: 500;
}

.coord-info {
  display: flex;
  gap: 32px;
}

.coord-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.coord-label {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  background: #eff6ff;
  color: #3b82f6;
}

.coord-value {
  font-family: monospace;
  font-size: 13px;
  color: #334155;
}

/* 电子围栏类型标签 */
.col-type {
  width: 90px;
}

.type-badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.type-circle {
  background: #fef3c7;
  color: #d97706;
}

.type-polygon {
  background: #dbeafe;
  color: #2563eb;
}

.col-radius {
  font-family: monospace;
  font-size: 12px !important;
  color: #64748b !important;
}

/* 电子围栏详情视图 */
.fence-detail-view {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.polygon-points {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.point-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 6px;
}

.point-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #e2e8f0;
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
}

.point-coord {
  font-family: monospace;
  font-size: 13px;
  color: #334155;
}

/* 监控勾选框 */
.monitor-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.monitor-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #3b82f6;
}

.checkbox-label {
  font-size: 13px;
  color: #64748b;
  user-select: none;
}

.monitor-checkbox input[type="checkbox"]:checked + .checkbox-label {
  color: #3b82f6;
  font-weight: 500;
}

/* 待开发视图 */
.coming-soon {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px;
  text-align: center;
}

.coming-soon h3 {
  margin: 0 0 12px;
  font-size: 20px;
  color: #1e293b;
}

.coming-soon p {
  margin: 0;
  color: #64748b;
  font-size: 14px;
}

/* 动画 */
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
