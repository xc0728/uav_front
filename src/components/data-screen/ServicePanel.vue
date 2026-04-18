<script setup>
import { ref, computed, defineProps } from 'vue'
import { ChevronRight, ChevronLeft, ChevronDown, X, Grid3X3, Navigation, Map, Calculator, Box, Boxes, Settings2, Database } from 'lucide-vue-next'
import InteropFusion from './functions/1_GridInterop.vue'
import TiltPhotogrammetry from './functions/2_Osgb_Grid.vue'
import GridSplit from './functions/3_1PointGrid.vue'
import LineGrid from './functions/3_2LineGrid.vue'
import PolygonGrid from './functions/3_3PolygonGrid.vue'
import RangeGrid from './functions/3_4RangeGrid.vue'
import PathPlanning from './functions/4_PathPlanning.vue'
import SpatialRelation from './functions/5_SpatialRelation.vue'
import AirspaceGridQuery from './functions/6_AirspaceGridQuery.vue'
import GridAggregation from './functions/7_Aggregation.vue'

const props = defineProps({
  panelType: {
    type: String,
    default: 'both'
  }
})

const emit = defineEmits(['showPoint', 'showGrid', 'show-line', 'show-polygon'])

const services = [
  {
    id: 'interop-fusion',
    name: '立体导航网格互操作数据融合服务',
    shortName: '网格互操作',
    icon: Grid3X3,
    component: InteropFusion,
    functions: [
      '经纬度高转网格编码',
      '网格编码转网格中心',
      '网格编码计算子网格',
      '网格编码求指定层级父网格',
      '局部网格编码转全局网格编码',
      '网格编码获取网格信息',
    ],
  },
  {
    id: 'tilt-photogrammetry',
    name: '倾斜摄影网格化入库服务',
    shortName: '倾斜摄影入库',
    icon: Map,
    component: TiltPhotogrammetry,
    functions: ['osgb网格化（同步入库）', '倾斜摄影网格查询', 'osgb网格化聚合入库'],
  },
  {
    id: 'grid-split',
    name: '立体导航网格剖分计算服务',
    shortName: '网格剖分计算',
    icon: Calculator,
    component: GridSplit,
    functions: [
      '点网格化',
      '点缓冲区（球体）网格化',
      '三维线网格化',
      '线矩形缓冲区（管道）网格化',
      '多边形网格化',
      '多边形网格化（带洞）',
      '多边形表面网格化',
      '不规则多面体网格化',
      '立方体网格化',
    ],
  },
  {
    id: 'path-planning',
    name: '立体导航网格路径规划服务',
    shortName: '路径规划',
    icon: Navigation,
    component: PathPlanning,
    functions: [
      '路径冲突检测（所有冲突）',
      '路径冲突检测（首个冲突）',
      'A星航路规划',
    ],
  },
  {
    id: 'spatial-relation',
    name: '立体导航网格空间关系计算服务',
    shortName: '空间关系',
    icon: Box,
    component: SpatialRelation,
    functions: [
      '点缓冲区网格冲突检测',
      '航路平滑处理控件',
    ],
  },
  {
    id: 'airspace-grid-query',
    name: '空域网格化入库/查询服务',
    shortName: '空域网格化入库/查询',
    icon: Database,
    component: AirspaceGridQuery,
    functions: [
      '空域网格查询',
    ],
  },
  {
    id: 'grid-aggregation',
    name: '立体导航网格聚合服务',
    shortName: '网格聚合',
    icon: Boxes,
    component: GridAggregation,
    functions: [
      '多粒度混合格网建模',
      '倾斜摄影多源聚合网格查询',
    ],
  },
]

// 控制面板状态
const isControlPanelCollapsed = ref(false)
const openServiceId = ref(null)

// 当前面板模式: 'list' | 'calc'
const panelMode = ref('list')
const activeServiceName = ref('')
const activeServiceIcon = ref(null)
const activeFunctionName = ref('')
const activeServiceId = ref('')
const activeComponentRef = ref(null)

// 切换控制面板折叠/展开
function toggleControlPanelCollapse() {
  isControlPanelCollapsed.value = !isControlPanelCollapsed.value
}

// 切换服务下拉菜单
function toggleServiceDropdown(id) {
  openServiceId.value = openServiceId.value === id ? null : id
}

// 展开面板并打开指定服务的下拉菜单
function expandAndOpenDropdown(serviceId) {
  isControlPanelCollapsed.value = false
  openServiceId.value = serviceId
}

// 打开计算面板
function openCalcPanel(service, funcName) {
  activeServiceName.value = service.name
  activeServiceIcon.value = service.icon
  activeFunctionName.value = funcName
  activeServiceId.value = service.id
  panelMode.value = 'calc'
}

// 关闭计算面板，返回到服务列表（并重置表单）
function closeCalcPanel() {
  // 先重置表单
  if (activeComponentRef.value?.resetForm) {
    activeComponentRef.value.resetForm()
  }
  panelMode.value = 'list'
  activeServiceId.value = ''
  activeFunctionName.value = ''
}

// 事件处理
function handleShowPoint(point) {
  emit('showPoint', point)
}

function handleShowGrid(gridInfo) {
  emit('showGrid', gridInfo)
}

function handleShowLine(linePoints) {
  emit('show-line', linePoints)
}

function handleShowPolygon(polygonPoints) {
  emit('show-polygon', polygonPoints)
}

const activeService = computed(() => {
  return services.find(s => s.id === activeServiceId.value)
})

const activeComponent = computed(() => {
  if (activeServiceId.value === 'grid-split') {
    const fn = activeFunctionName.value
    if (fn === '点网格化' || fn === '点缓冲区（球体）网格化') {
      return GridSplit
    }
    if (fn === '三维线网格化' || fn === '线矩形缓冲区（管道）网格化') {
      return LineGrid
    }
    if (fn === '多边形网格化' || fn === '多边形网格化（带洞）' || fn === '多边形表面网格化' || fn === '不规则多面体网格化') {
      return PolygonGrid
    }
    if (fn === '立方体网格化') {
      return RangeGrid
    }
  }
  if (activeServiceId.value === 'tilt-photogrammetry') {
    return TiltPhotogrammetry
  }
  if (activeServiceId.value === 'airspace-grid-query') {
    return AirspaceGridQuery
  }
  if (activeServiceId.value === 'grid-aggregation') {
    return GridAggregation
  }
  return activeService.value?.component
})

function applyMapPointToActiveService(lon, lat, height) {
  if (!activeComponentRef.value) return

  if (activeServiceId.value === 'interop-fusion' && activeFunctionName.value === '经纬度高转网格编码') {
    if (typeof activeComponentRef.value.setPointFromMap === 'function') {
      activeComponentRef.value.setPointFromMap(lon, lat, height)
    }
  }

  if (
    activeServiceId.value === 'grid-split'
    && (activeFunctionName.value === '点网格化'
      || activeFunctionName.value === '点缓冲区（球体）网格化'
      || activeFunctionName.value === '三维线网格化'
      || activeFunctionName.value === '线矩形缓冲区（管道）网格化'
      || activeFunctionName.value === '多边形网格化'
      || activeFunctionName.value === '多边形网格化（带洞）'
      || activeFunctionName.value === '多边形表面网格化'
      || activeFunctionName.value === '不规则多面体网格化'
      || activeFunctionName.value === '立方体网格化')
  ) {
    if (typeof activeComponentRef.value.setPointFromMap === 'function') {
      activeComponentRef.value.setPointFromMap(lon, lat, height)
    }
  }

  if (activeServiceId.value === 'airspace-grid-query') {
    if (typeof activeComponentRef.value.setPointFromMap === 'function') {
      activeComponentRef.value.setPointFromMap(lon, lat, height)
    }
  }

  if (activeServiceId.value === 'grid-aggregation') {
    if (typeof activeComponentRef.value.setPointFromMap === 'function') {
      activeComponentRef.value.setPointFromMap(lon, lat, height)
    }
  }

  if (activeServiceId.value === 'path-planning' && activeFunctionName.value === 'A星航路规划') {
    if (typeof activeComponentRef.value.setPointFromMap === 'function') {
      activeComponentRef.value.setPointFromMap(lon, lat, height)
    }
  }
}

defineExpose({
  applyMapPointToActiveService,
})
</script>

<template>
  <div class="service-panel-container">
    <!-- 左侧控制面板 -->
    <div class="control-panel" :class="{ collapsed: isControlPanelCollapsed }">
        <!-- 面板头部 -->
        <div class="panel-header">
          <div class="header-left">
            <!-- 列表模式：显示功能选择标题 -->
            <template v-if="panelMode === 'list'">
              <template v-if="!isControlPanelCollapsed">
                <Settings2 :size="20" class="header-icon" />
                <span class="panel-title">功能选择</span>
              </template>
            </template>
            <!-- 计算模式：显示服务信息 -->
            <template v-else>
              <div v-if="!isControlPanelCollapsed" class="header-service-info">
                <span class="header-function-name">{{ activeFunctionName }}</span>
              </div>
            </template>
          </div>
          <div class="header-actions">
            <!-- 收起/展开按钮 - 列表模式下始终显示 -->
            <button
              v-if="panelMode === 'list'"
              type="button"
              class="icon-btn"
              @click="toggleControlPanelCollapse"
              :title="isControlPanelCollapsed ? '展开面板' : '折叠面板'"
            >
              <ChevronLeft v-if="!isControlPanelCollapsed" :size="18" />
              <ChevronRight v-else :size="18" />
            </button>
            <!-- 控制面板收起/展开按钮 - 计算模式下始终显示 -->
            <button
              v-if="panelMode === 'calc'"
              type="button"
              class="icon-btn"
              @click="toggleControlPanelCollapse"
              :title="isControlPanelCollapsed ? '展开面板' : '折叠面板'"
            >
              <ChevronLeft v-if="!isControlPanelCollapsed" :size="18" />
              <ChevronRight v-else :size="18" />
            </button>
            <!-- 关闭按钮 - 仅在计算模式下展开时显示 -->
            <button
              v-if="panelMode === 'calc' && !isControlPanelCollapsed"
              type="button"
              class="icon-btn close-btn"
              @click="closeCalcPanel"
              title="关闭"
            >
              <X :size="18" />
            </button>
          </div>
        </div>

        <!-- 计算窗口收起时：在展开按钮正下方垂直显示窗口名称，单字均匀分布填满整条 -->
        <div
          v-if="isControlPanelCollapsed && panelMode === 'calc'"
          class="collapsed-calc-title-wrap"
          @click="toggleControlPanelCollapse"
          title="展开面板"
        >
          <div class="collapsed-calc-title">
            <span
              v-for="(char, i) in activeFunctionName"
              :key="i"
              class="collapsed-calc-char"
              :class="{ 'collapsed-calc-paren': char === '（' || char === '）' }"
            >{{ char === '（' ? '︵' : char === '）' ? '︶' : char }}</span>
          </div>
        </div>

        <!-- 面板内容 - 列表模式 -->
        <div v-if="!isControlPanelCollapsed && panelMode === 'list'" class="panel-content">
          <!-- 列表模式：显示服务列表 -->
          <div class="service-list">
            <div
              v-for="s in services"
              :key="s.id"
              class="service-item"
            >
              <button
                type="button"
                class="service-btn"
                @click="toggleServiceDropdown(s.id)"
              >
                <div class="service-icon">
                  <component :is="s.icon" :size="18" />
                </div>
                <span class="service-name">{{ s.shortName }}</span>
                <ChevronRight
                  :size="16"
                  class="service-arrow"
                  :class="{ active: openServiceId === s.id }"
                />
              </button>

              <!-- 下拉菜单 -->
              <Transition name="dropdown">
                <div
                  v-if="s.functions && s.functions.length && openServiceId === s.id"
                  class="service-dropdown"
                >
                  <button
                    v-for="fn in s.functions"
                    :key="fn"
                    type="button"
                    class="service-dropdown-item"
                    @click="openCalcPanel(s, fn)"
                  >
                    <span class="dot"></span>
                    {{ fn }}
                  </button>
                </div>
              </Transition>
            </div>
          </div>
        </div>

        <!-- 面板内容 - 计算模式，使用 v-show 保持组件状态 -->
        <div v-show="!isControlPanelCollapsed && panelMode === 'calc'" class="panel-content">
          <!-- 计算模式：显示计算组件 -->
          <div class="calc-view">
            <component
              :is="activeComponent"
              ref="activeComponentRef"
              :service-name="activeServiceName"
              :function-name="activeFunctionName"
              @close="closeCalcPanel"
              @show-point="handleShowPoint"
              @show-grid="handleShowGrid"
              @show-line="handleShowLine"
              @show-polygon="handleShowPolygon"
            />
          </div>
        </div>

        <!-- 折叠时仅显示图标（仅列表模式；计算模式用上方 collapsed-calc-title-wrap 占满整条） -->
        <div v-if="isControlPanelCollapsed && panelMode === 'list'" class="panel-collapsed-content">
          <!-- 列表模式折叠时 -->
          <template v-if="panelMode === 'list'">
            <button
              v-for="s in services"
              :key="s.id"
              type="button"
              class="collapsed-item"
              @click="expandAndOpenDropdown(s.id)"
              :title="s.shortName"
            >
              <component :is="s.icon" :size="20" />
            </button>
          </template>
        </div>
      </div>
  </div>
</template>

<style scoped>
.service-panel-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
}

/* 所有子元素启用 pointer-events */
.service-panel-container > * {
  pointer-events: auto;
}

/* ==================== 左侧控制面板 ==================== */
.control-panel {
  width: 360px;
  max-width: 360px;
  height: 100%;
  background: rgba(15, 23, 42, 0.95);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: all 0.3s ease;
}

.control-panel.collapsed {
  width: 60px;
  max-width: 60px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(180deg, rgba(30, 41, 59, 0.8) 0%, transparent 100%);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-icon {
  color: #60a5fa;
}

/* 返回按钮 */
.back-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.back-btn:hover {
  background: rgba(59, 130, 246, 0.25);
  border-color: #3b82f6;
}

/* 服务信息标题 */
.header-service-info {
  display: flex;
  flex-direction: column;
}

.header-function-name {
  font-size: 17px;
  font-weight: 600;
  color: #f1f5f9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
}

.panel-title {
  font-size: 18px;
  font-weight: 600;
  color: #f1f5f9;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.icon-btn:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: #3b82f6;
  color: #60a5fa;
}

.icon-btn.close-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: #ef4444;
  color: #ef4444;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.panel-content::-webkit-scrollbar {
  width: 4px;
}

.panel-content::-webkit-scrollbar-track {
  background: transparent;
}

.panel-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

/* 服务列表 */
.service-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.service-item {
  position: relative;
}

.service-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
  color: #cbd5e1;
  font-size: 16px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

.service-btn:hover {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.4);
  color: #f1f5f9;
}

.service-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(59, 130, 246, 0.2);
  border-radius: 10px;
  color: #60a5fa;
  flex-shrink: 0;
}

.service-name {
  flex: 1;
  font-weight: 500;
}

.service-arrow {
  color: #64748b;
  transition: transform 0.2s ease;
}

.service-arrow.active {
  transform: rotate(90deg);
  color: #60a5fa;
}

/* 下拉菜单 */
.service-dropdown {
  position: relative;
  margin-top: 8px;
  padding: 8px;
  border-radius: 12px;
  border: 1px solid rgba(59, 130, 246, 0.3);
  background: rgba(30, 41, 59, 0.98);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  z-index: 100;
}

.service-dropdown-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 15px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}

.service-dropdown-item:hover {
  background: rgba(59, 130, 246, 0.25);
  color: #e2e8f0;
}

.service-dropdown-item .dot {
  width: 5px;
  height: 5px;
  background: #3b82f6;
  border-radius: 50%;
  flex-shrink: 0;
}

/* 计算窗口收起时，在展开按钮正下方垂直显示窗口名称，单字均匀分布填满整条 */
.collapsed-calc-title-wrap {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: stretch;
  cursor: pointer;
  min-height: 0;
}

.collapsed-calc-title {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
  gap: 24px;
}

.collapsed-calc-char {
  font-size: 18px;
  font-family: "SimHei", "Microsoft YaHei", sans-serif;
  font-weight: bold;
  color: #ffffff;
  flex-shrink: 0;
}

/* 括号使用竖排专用字符 ︵︶，在垂直排列时自然正确显示 */
.collapsed-calc-paren {
  font-weight: bold;
  opacity: 1;
}

.collapsed-calc-title-wrap:hover .collapsed-calc-char {
  color: #60a5fa;
}

/* 折叠时的图标列表 */
.panel-collapsed-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  overflow-y: auto;
}

.collapsed-expand-btn {
  width: 40px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(59, 130, 246, 0.3);
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  margin-bottom: 4px;
}

.collapsed-expand-btn:hover {
  background: rgba(59, 130, 246, 0.25);
  border-color: #3b82f6;
}

.collapsed-function-name {
  writing-mode: vertical-lr;
  text-orientation: upright;
  font-size: 14px;
  color: #e2e8f0;
  padding: 8px 4px;
  cursor: pointer;
  letter-spacing: 2px;
  max-height: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.collapsed-function-name:hover {
  color: #60a5fa;
}

.calc-collapsed-icon {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}

.collapsed-item {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.collapsed-item:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.4);
  color: #60a5fa;
}

/* ==================== 展开/收起按钮 ==================== */
.expand-control-btn,
.expand-calc-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid rgba(59, 130, 246, 0.4);
  background: rgba(15, 23, 42, 0.95);
  color: #60a5fa;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.expand-control-btn {
  left: 16px;
}

.expand-calc-btn {
  right: 16px;
}

.expand-control-btn:hover,
.expand-calc-btn:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: #3b82f6;
}

/* ==================== 右侧计算面板 ==================== */
.calc-panel {
  width: 400px;
  max-width: 400px;
  height: 100%;
  background: rgba(15, 23, 42, 0.95);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.calc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(180deg, rgba(30, 41, 59, 0.9) 0%, transparent 100%);
  flex-shrink: 0;
}

.calc-header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.calc-header-actions {
  display: flex;
  gap: 8px;
}

.calc-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #3b82f6, #0ea5e9);
  border-radius: 12px;
  color: #fff;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

.calc-header-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.calc-function-name {
  font-size: 17px;
  font-weight: 600;
  color: #f1f5f9;
}

.calc-service-name {
  font-size: 14px;
  color: #64748b;
}

.calc-minimize,
.calc-close {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.calc-minimize:hover {
  border-color: #60a5fa;
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}

.calc-close:hover {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

/* 计算视图 */
.calc-view {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.calc-view::-webkit-scrollbar {
  width: 4px;
}

.calc-view::-webkit-scrollbar-track {
  background: transparent;
}

.calc-view::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.calc-view,
.calc-content {
  flex: 1;
  padding: 20px;
  overflow-x: hidden;
  overflow-y: auto;
}

.calc-content::-webkit-scrollbar {
  width: 4px;
}

.calc-content::-webkit-scrollbar-track {
  background: transparent;
}

.calc-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

/* 现代化表单样式 - 分组设计 */
.calc-content :deep(.form-section) {
  margin-bottom: 20px;
  padding: 16px;
  background: rgba(30, 41, 59, 0.5);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.calc-content :deep(.form-section-title) {
  font-size: 15px;
  font-weight: 600;
  color: #60a5fa;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(96, 165, 250, 0.2);
  display: flex;
  align-items: center;
  gap: 8px;
}

.calc-content :deep(.form-row) {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
}

.calc-content :deep(.form-row:last-child) {
  margin-bottom: 0;
}

.calc-content :deep(.form-label) {
  font-size: 15px;
  font-weight: 500;
  color: #94a3b8;
}

.calc-content :deep(.form-input),
.calc-content :deep(.form-select) {
  width: 100%;
  padding: 10px 14px;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #f1f5f9;
  font-size: 14px;
  transition: all 0.2s ease;
}

.calc-content :deep(.form-input:focus),
.calc-content :deep(.form-select:focus) {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

.calc-content :deep(.form-input::placeholder) {
  color: #475569;
}

.calc-content :deep(.tip) {
  padding: 12px 14px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 8px;
  color: #60a5fa;
  font-size: 15px;
  line-height: 1.5;
  margin-bottom: 16px;
}

.calc-content :deep(.btn) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 20px;
  border-radius: 10px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.calc-content :deep(.btn-primary) {
  width: 100%;
  background: linear-gradient(135deg, #3b82f6 0%, #0ea5e9 100%);
  color: #fff;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.calc-content :deep(.btn-primary:hover) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
}

.calc-content :deep(.btn-primary:disabled) {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.calc-content :deep(.btn-danger) {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
}

.calc-content :deep(.btn-danger:hover) {
  background: rgba(239, 68, 68, 0.25);
  border-color: #ef4444;
}

.calc-content :deep(.btn-secondary) {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
}

.calc-content :deep(.btn-secondary:hover) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

/* 加载状态 */
.calc-content :deep(.loading-overlay) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: #60a5fa;
}

.calc-content :deep(.loading-spinner) {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 错误提示 */
.calc-content :deep(.error-message) {
  padding: 12px 14px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: #fca5a5;
  font-size: 15px;
  margin-bottom: 16px;
}

/* 结果展示 */
.calc-content :deep(.result-box) {
  padding: 16px;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 10px;
  color: #6ee7b7;
  font-size: 14px;
}

.calc-content :deep(.result-stats) {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}

.calc-content :deep(.result-stat) {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.calc-content :deep(.result-stat-label) {
  font-size: 13px;
  color: #64748b;
}

.calc-content :deep(.result-stat-value) {
  font-size: 18px;
  font-weight: 600;
  color: #34d399;
}

/* 点列表 */
.calc-content :deep(.point-list) {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 16px;
}

.calc-content :deep(.point-item) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
}

.calc-content :deep(.point-info) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 15px;
  color: #cbd5e1;
}

.calc-content :deep(.point-index) {
  font-weight: 600;
  color: #60a5fa;
}

.calc-content :deep(.point-coord) {
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 13px;
  color: #94a3b8;
}

.calc-content :deep(.point-delete) {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.calc-content :deep(.point-delete:hover) {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

/* 操作按钮组 */
.calc-content :deep(.form-actions) {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.calc-content :deep(.form-actions .btn) {
  flex: 1;
}

/* ==================== 过渡动画 ==================== */
.slide-left-enter-active,
.slide-left-leave-active {
  transition: all 0.3s ease;
}

.slide-left-enter-from,
.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.3s ease;
}

.slide-right-enter-from,
.slide-right-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
