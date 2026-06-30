<script setup>
import { ref, computed, defineProps } from 'vue'
import { ChevronRight, ChevronLeft, ChevronDown, X, Grid3X3, Navigation, Map, Calculator, Boxes, Settings2, Database, ShieldBan } from 'lucide-vue-next'
import InteropFusion from './functions/1_GridInterop.vue'
import TiltPhotogrammetry from './functions/2_Osgb_Grid.vue'
import GridSplit from './functions/3_1PointGrid.vue'
import LineGrid from './functions/3_2LineGrid.vue'
import PolygonGrid from './functions/3_3PolygonGrid.vue'
import RangeGrid from './functions/3_4RangeGrid.vue'
import PathPlanning from './functions/4_PathPlanning.vue'
import AirspaceGridQuery from './functions/6_AirspaceGridQuery.vue'
import GridAggregation from './functions/7_Aggregation.vue'
import DemGrid from './functions/8_DemGrid.vue'
import NoFlyZone from './functions/9_NoFlyZone.vue'

const props = defineProps({
  panelType: {
    type: String,
    default: 'both'
  },
  theme: {
    type: String,
    default: 'white'
  }
})

const emit = defineEmits(['showPoint', 'showGrid', 'show-line', 'show-polygon', 'get-view-bounds'])

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
    id: 'airspace-grid-query',
    name: '空域网格化入库/查询服务',
    shortName: '空域网格',
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
  {
    id: 'dem-grid-query',
    name: 'DEM网格查询服务',
    shortName: 'DEM网格',
    icon: Database,
    component: DemGrid,
    functions: [
      'DEM网格查询',
    ],
  },
  {
    id: 'no-fly-zone',
    name: '电子围栏服务',
    shortName: '电子围栏',
    icon: ShieldBan,
    component: NoFlyZone,
    functions: [
      '电子围栏设置',
    ],
  },
]

// 控制面板状态
const isControlPanelCollapsed = ref(true) // true = 默认收起
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
  if (activeServiceId.value === 'dem-grid-query') {
    return DemGrid
  }
  if (activeServiceId.value === 'no-fly-zone') {
    return NoFlyZone
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

  if (activeServiceId.value === 'dem-grid-query') {
    if (typeof activeComponentRef.value.setPointFromMap === 'function') {
      activeComponentRef.value.setPointFromMap(lon, lat, height)
    }
  }

  if (activeServiceId.value === 'no-fly-zone') {
    if (typeof activeComponentRef.value.setPointFromMap === 'function') {
      activeComponentRef.value.setPointFromMap(lon, lat, height)
    }
  }

  if (activeServiceId.value === 'path-planning' && activeFunctionName.value === 'A星航路规划') {
    if (typeof activeComponentRef.value.setPointFromMap === 'function') {
      activeComponentRef.value.setPointFromMap(lon, lat, height)
    }
  }

  if (activeServiceId.value === 'path-planning' && activeFunctionName.value === '路径冲突检测（所有冲突）') {
    if (typeof activeComponentRef.value.setPointFromMap === 'function') {
      activeComponentRef.value.setPointFromMap(lon, lat, height)
    }
  }

  if (activeServiceId.value === 'path-planning' && activeFunctionName.value === '路径冲突检测（首个冲突）') {
    if (typeof activeComponentRef.value.setPointFromMap === 'function') {
      activeComponentRef.value.setPointFromMap(lon, lat, height)
    }
  }
}

// 处理地图框选的边界参数
function applyBoundsToActiveService(bounds) {
  if (!activeComponentRef.value || !bounds) return

  console.log('[ServicePanel] 收到地图框选边界:', bounds)

  if (activeServiceId.value === 'dem-grid-query') {
    if (typeof activeComponentRef.value.setBoundsFromViewport === 'function') {
      activeComponentRef.value.setBoundsFromViewport(bounds)
    }
  }
}

// 处理框选开始事件
function handleBoxSelectStart() {
  emit('box-select-start')
}

// 处理框选结束事件
function handleBoxSelectEnd() {
  emit('box-select-end')
}

// 处理获取视图边界请求
function handleGetViewBounds() {
  emit('get-view-bounds')
}

// 设置视图边界到当前激活的服务
function setViewBoundsToActiveService(bounds) {
  if (!activeComponentRef.value || !bounds) return

  console.log('[ServicePanel] 设置视图边界:', bounds)

  if (activeServiceId.value === 'dem-grid-query' || activeServiceId.value === 'airspace-grid-query') {
    if (typeof activeComponentRef.value.setViewBounds === 'function') {
      activeComponentRef.value.setViewBounds(bounds)
    }
  }
}

defineExpose({
  applyMapPointToActiveService,
  applyBoundsToActiveService,
  setViewBoundsToActiveService,
})
</script>

<template>
  <div class="service-panel-container" :class="`theme-${props.theme}`">
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
              :theme="props.theme"
              @close="closeCalcPanel"
              @show-point="handleShowPoint"
              @show-grid="handleShowGrid"
              @show-line="handleShowLine"
              @show-polygon="handleShowPolygon"
              @get-view-bounds="handleGetViewBounds"
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
  --panel-surface: rgba(253, 251, 247, 0.97);
  --panel-border: rgba(0, 0, 0, 0.06);
  --panel-shadow: 4px 0 24px rgba(0, 0, 0, 0.06);
  --panel-header-bg: linear-gradient(180deg, #faf8f4 0%, rgba(253, 251, 247, 0) 100%);
  --panel-primary: #5b9fd4;
  --panel-primary-soft: #eef6fc;
  --panel-primary-soft-border: #7db8e0;
  --panel-title: #334155;
  --panel-text: #475569;
  --panel-text-strong: #334155;
  --panel-muted: #64748b;
  --panel-muted-soft: #94a3b8;
  --panel-card-bg: #ffffff;
  --panel-card-border: #ebe6df;
  --panel-card-hover-bg: #faf8f4;
  --panel-card-hover-border: #d4c9b8;
  --panel-dropdown-bg: #ffffff;
  --panel-dropdown-hover-bg: #f5f3f0;
  --panel-scrollbar: rgba(0, 0, 0, 0.12);
  --panel-form-section-bg: #ffffff;
  --panel-form-section-border: #ebe6df;
  --panel-form-label: #64748b;
  --panel-form-title: #4a7eb0;
  --panel-form-title-border: #e8e4df;
  --panel-input-bg: #ffffff;
  --panel-input-border: #d7dee8;
  --panel-input-focus-border: #7db8e0;
  --panel-input-focus-shadow: 0 0 0 3px rgba(91, 159, 212, 0.15);
  --panel-tip-bg: #eef6fc;
  --panel-tip-border: #bfdbfe;
  --panel-tip-text: #3b82f6;
  --panel-btn-primary-bg: linear-gradient(135deg, #7db8e0, #5b9fd4);
  --panel-btn-primary-hover-bg: linear-gradient(135deg, #6aa8d4, #4a8fc4);
  --panel-btn-primary-shadow: 0 2px 8px rgba(91, 159, 212, 0.25);
  --panel-btn-primary-hover-shadow: 0 4px 12px rgba(91, 159, 212, 0.3);
  --panel-btn-secondary-bg: #ffffff;
  --panel-btn-secondary-border: #e2e8f0;
  --panel-btn-secondary-text: #475569;
  --panel-btn-secondary-hover-bg: #f8fafc;
  --panel-btn-secondary-hover-border: #cbd5e1;
  --panel-result-bg: rgba(16, 185, 129, 0.1);
  --panel-result-border: rgba(16, 185, 129, 0.3);
  --panel-result-label: #64748b;
  --panel-result-value: #34d399;
  --panel-danger-bg: rgba(239, 68, 68, 0.15);
  --panel-danger-hover-bg: rgba(239, 68, 68, 0.25);
  --panel-danger-border: rgba(239, 68, 68, 0.3);
  --panel-danger-color: #fca5a5;
  --panel-point-item-bg: rgba(248, 250, 252, 0.92);
}

.service-panel-container.theme-techBlue {
  --panel-surface: rgba(5, 23, 49, 0.92);
  --panel-border: rgba(77, 189, 255, 0.18);
  --panel-shadow: 8px 0 28px rgba(2, 12, 26, 0.38);
  --panel-header-bg: linear-gradient(180deg, rgba(8, 43, 86, 0.96) 0%, rgba(5, 23, 49, 0) 100%);
  --panel-primary: #7cecff;
  --panel-primary-soft: rgba(12, 63, 118, 0.7);
  --panel-primary-soft-border: rgba(111, 223, 255, 0.72);
  --panel-title: #ecfbff;
  --panel-text: #c8f1ff;
  --panel-text-strong: #ecfbff;
  --panel-muted: #98d8ef;
  --panel-muted-soft: #75b9d4;
  --panel-card-bg: rgba(10, 41, 82, 0.72);
  --panel-card-border: rgba(90, 193, 255, 0.2);
  --panel-card-hover-bg: rgba(15, 63, 118, 0.82);
  --panel-card-hover-border: rgba(120, 230, 255, 0.46);
  --panel-dropdown-bg: rgba(7, 31, 64, 0.96);
  --panel-dropdown-hover-bg: rgba(13, 73, 134, 0.88);
  --panel-scrollbar: rgba(125, 236, 255, 0.3);
  --panel-form-section-bg: rgba(9, 39, 78, 0.84);
  --panel-form-section-border: rgba(88, 199, 255, 0.22);
  --panel-form-label: #d7f5ff;
  --panel-form-title: #b8f6ff;
  --panel-form-title-border: rgba(106, 220, 255, 0.34);
  --panel-field-title: #ecfbff;
  --panel-input-bg: rgba(4, 24, 52, 0.9);
  --panel-input-border: rgba(86, 191, 255, 0.28);
  --panel-input-focus-border: rgba(124, 236, 255, 0.82);
  --panel-input-focus-shadow: 0 0 0 3px rgba(64, 196, 255, 0.16);
  --panel-tip-bg: rgba(10, 48, 92, 0.82);
  --panel-tip-border: rgba(97, 218, 251, 0.26);
  --panel-tip-text: #80edff;
  --panel-btn-primary-bg: linear-gradient(135deg, #1fb6ff, #0b79d0);
  --panel-btn-primary-hover-bg: linear-gradient(135deg, #36c6ff, #1190e8);
  --panel-btn-primary-shadow: 0 6px 18px rgba(7, 138, 219, 0.28);
  --panel-btn-primary-hover-shadow: 0 10px 24px rgba(11, 145, 232, 0.34);
  --panel-btn-secondary-bg: rgba(6, 33, 67, 0.92);
  --panel-btn-secondary-border: rgba(90, 193, 255, 0.26);
  --panel-btn-secondary-text: #dff8ff;
  --panel-btn-secondary-hover-bg: rgba(12, 63, 118, 0.88);
  --panel-btn-secondary-hover-border: rgba(124, 236, 255, 0.54);
  --panel-result-bg: rgba(22, 163, 74, 0.16);
  --panel-result-border: rgba(74, 222, 128, 0.28);
  --panel-result-label: #9ed8ef;
  --panel-result-value: #6ee7b7;
  --panel-danger-bg: rgba(239, 68, 68, 0.18);
  --panel-danger-hover-bg: rgba(239, 68, 68, 0.26);
  --panel-danger-border: rgba(248, 113, 113, 0.38);
  --panel-danger-color: #fecaca;
  --panel-point-item-bg: rgba(7, 31, 64, 0.86);
}

.service-panel-container.theme-freshGreen {
  --panel-surface: rgba(245, 252, 247, 0.94);
  --panel-border: rgba(128, 200, 155, 0.22);
  --panel-shadow: 8px 0 28px rgba(122, 197, 150, 0.14);
  --panel-header-bg: linear-gradient(180deg, rgba(235, 248, 239, 0.98) 0%, rgba(245, 252, 247, 0) 100%);
  --panel-primary: #66b784;
  --panel-primary-soft: rgba(227, 245, 233, 0.9);
  --panel-primary-soft-border: rgba(126, 198, 152, 0.64);
  --panel-title: #2f5d45;
  --panel-text: #466c56;
  --panel-text-strong: #2f5d45;
  --panel-muted: #5f8670;
  --panel-muted-soft: #89aa96;
  --panel-card-bg: rgba(255, 255, 255, 0.82);
  --panel-card-border: rgba(167, 214, 184, 0.38);
  --panel-card-hover-bg: rgba(244, 252, 247, 0.96);
  --panel-card-hover-border: rgba(126, 198, 152, 0.5);
  --panel-dropdown-bg: rgba(249, 253, 250, 0.98);
  --panel-dropdown-hover-bg: rgba(238, 249, 242, 0.95);
  --panel-scrollbar: rgba(126, 198, 152, 0.24);
  --panel-form-section-bg: rgba(255, 255, 255, 0.84);
  --panel-form-section-border: rgba(167, 214, 184, 0.38);
  --panel-form-label: #5a7d68;
  --panel-form-title: #4e8d68;
  --panel-form-title-border: rgba(167, 214, 184, 0.46);
  --panel-field-title: #2f5d45;
  --panel-input-bg: rgba(255, 255, 255, 0.92);
  --panel-input-border: rgba(167, 214, 184, 0.64);
  --panel-input-focus-border: rgba(102, 183, 132, 0.9);
  --panel-input-focus-shadow: 0 0 0 3px rgba(126, 198, 152, 0.18);
  --panel-tip-bg: rgba(236, 248, 240, 0.96);
  --panel-tip-border: rgba(167, 214, 184, 0.52);
  --panel-tip-text: #4a8b65;
  --panel-btn-primary-bg: linear-gradient(135deg, #8fd0a6, #66b784);
  --panel-btn-primary-hover-bg: linear-gradient(135deg, #9bdab1, #74c18f);
  --panel-btn-primary-shadow: 0 6px 18px rgba(126, 198, 152, 0.22);
  --panel-btn-primary-hover-shadow: 0 10px 24px rgba(126, 198, 152, 0.28);
  --panel-btn-secondary-bg: rgba(255, 255, 255, 0.9);
  --panel-btn-secondary-border: rgba(167, 214, 184, 0.5);
  --panel-btn-secondary-text: #466c56;
  --panel-btn-secondary-hover-bg: rgba(244, 252, 247, 0.98);
  --panel-btn-secondary-hover-border: rgba(126, 198, 152, 0.72);
  --panel-result-bg: rgba(143, 208, 166, 0.14);
  --panel-result-border: rgba(126, 198, 152, 0.34);
  --panel-result-label: #5f8670;
  --panel-result-value: #4fa56f;
  --panel-danger-bg: rgba(239, 68, 68, 0.12);
  --panel-danger-hover-bg: rgba(239, 68, 68, 0.18);
  --panel-danger-border: rgba(248, 113, 113, 0.28);
  --panel-danger-color: #dc2626;
  --panel-point-item-bg: rgba(250, 253, 251, 0.92);
}

.service-panel-container.theme-freshGreen .calc-view :deep(.group-title),
.service-panel-container.theme-freshGreen .calc-view :deep(.group-title-row .group-title),
.service-panel-container.theme-freshGreen .calc-view :deep(.param-label),
.service-panel-container.theme-freshGreen .calc-view :deep(.coord-label),
.service-panel-container.theme-freshGreen .calc-view :deep(.height-label),
.service-panel-container.theme-freshGreen .calc-view :deep(.result-section-title),
.service-panel-container.theme-freshGreen .calc-view :deep(.form-title),
.service-panel-container.theme-freshGreen .calc-view :deep(label),
.service-panel-container.theme-freshGreen .calc-view :deep(.detail-value),
.service-panel-container.theme-freshGreen .calc-view :deep(.result-v),
.service-panel-container.theme-freshGreen .calc-view :deep(.store-info-value),
.service-panel-container.theme-freshGreen .calc-view :deep(.result-num),
.service-panel-container.theme-freshGreen .calc-view :deep(.result-status),
.service-panel-container.theme-freshGreen .calc-view :deep(.point-name),
.service-panel-container.theme-freshGreen .calc-view :deep(.coord-value),
.service-panel-container.theme-freshGreen .calc-view :deep(.height-value),
.service-panel-container.theme-freshGreen .calc-view :deep(.info-row strong),
.service-panel-container.theme-freshGreen .calc-view :deep(.breadcrumb-item.current),
.service-panel-container.theme-freshGreen .calc-view :deep(.rule-label) {
  color: var(--panel-field-title) !important;
  text-shadow: 0 0 10px rgba(104, 255, 168, 0.18);
}

.service-panel-container.theme-freshGreen .calc-view :deep(.group-sub),
.service-panel-container.theme-freshGreen .calc-view :deep(.result-label),
.service-panel-container.theme-freshGreen .calc-view :deep(.coord-range-label),
.service-panel-container.theme-freshGreen .calc-view :deep(.point-count-label),
.service-panel-container.theme-freshGreen .calc-view :deep(.hint-box),
.service-panel-container.theme-freshGreen .calc-view :deep(.tip-text),
.service-panel-container.theme-freshGreen .calc-view :deep(.empty-tip),
.service-panel-container.theme-freshGreen .calc-view :deep(.detail-label),
.service-panel-container.theme-freshGreen .calc-view :deep(.result-k),
.service-panel-container.theme-freshGreen .calc-view :deep(.store-info-label),
.service-panel-container.theme-freshGreen .calc-view :deep(.point-coord),
.service-panel-container.theme-freshGreen .calc-view :deep(.path-tip),
.service-panel-container.theme-freshGreen .calc-view :deep(.info-row span),
.service-panel-container.theme-freshGreen .calc-view :deep(.breadcrumb-item),
.service-panel-container.theme-freshGreen .calc-view :deep(.field-tip),
.service-panel-container.theme-freshGreen .calc-view :deep(.empty-state),
.service-panel-container.theme-freshGreen .calc-view :deep(.help-text),
.service-panel-container.theme-freshGreen .calc-view :deep(.rule-desc),
.service-panel-container.theme-freshGreen .calc-view :deep(.rule-param-label),
.service-panel-container.theme-freshGreen .calc-view :deep(.rule-param-sm-label),
.service-panel-container.theme-freshGreen .calc-view :deep(.checkbox-text) {
  color: var(--panel-form-label) !important;
}

.service-panel-container.theme-freshGreen .calc-view :deep(.hint-box),
.service-panel-container.theme-freshGreen .calc-view :deep(.tip-box),
.service-panel-container.theme-freshGreen .calc-view :deep(.store-tips),
.service-panel-container.theme-freshGreen .calc-view :deep(.empty-state) {
  background: var(--panel-tip-bg) !important;
  border-color: var(--panel-tip-border) !important;
}

/* 所有子元素启用 pointer-events */
.service-panel-container > * {
  pointer-events: auto;
}

/* ==================== 左侧控制面板 - 奶白清新 ==================== */
.control-panel {
  width: 360px;
  max-width: 360px;
  height: 100%;
  background: var(--panel-surface);
  border-right: 1px solid var(--panel-border);
  box-shadow: var(--panel-shadow);
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
  border-bottom: 1px solid var(--panel-border);
  background: var(--panel-header-bg);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-icon {
  color: var(--panel-primary);
}

/* 返回按钮 */
.back-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--panel-btn-secondary-border);
  background: var(--panel-btn-secondary-bg);
  color: var(--panel-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.back-btn:hover {
  background: var(--panel-primary-soft);
  border-color: var(--panel-primary-soft-border);
}

/* 服务信息标题 */
.header-service-info {
  display: flex;
  flex-direction: column;
}

.header-function-name {
  font-size: 17px;
  font-weight: 600;
  color: var(--panel-title);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
}

.panel-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--panel-title);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--panel-btn-secondary-border);
  background: var(--panel-btn-secondary-bg);
  color: var(--panel-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.icon-btn:hover {
  background: var(--panel-primary-soft);
  border-color: var(--panel-primary-soft-border);
  color: var(--panel-primary);
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
  background: var(--panel-scrollbar);
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
  border: 1px solid var(--panel-card-border);
  background: var(--panel-card-bg);
  color: var(--panel-text);
  font-size: 16px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

.service-btn:hover {
  background: var(--panel-card-hover-bg);
  border-color: var(--panel-card-hover-border);
  color: var(--panel-title);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.service-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #eef6fc;
  border-radius: 10px;
  color: #5b9fd4;
  flex-shrink: 0;
}

.service-name {
  flex: 1;
  font-weight: 500;
}

.service-arrow {
  color: var(--panel-muted);
  transition: transform 0.2s ease;
}

.service-arrow.active {
  transform: rotate(90deg);
  color: var(--panel-primary);
}

/* 下拉菜单 */
.service-dropdown {
  position: relative;
  margin-top: 8px;
  padding: 8px;
  border-radius: 12px;
  border: 1px solid var(--panel-card-border);
  background: var(--panel-dropdown-bg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
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
  color: var(--panel-muted);
  font-size: 15px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}

.service-dropdown-item:hover {
  background: var(--panel-dropdown-hover-bg);
  color: var(--panel-title);
}

.service-dropdown-item .dot {
  width: 5px;
  height: 5px;
  background: #5b9fd4;
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
  color: var(--panel-text);
  flex-shrink: 0;
}

/* 括号使用竖排专用字符 ︵︶，在垂直排列时自然正确显示 */
.collapsed-calc-paren {
  font-weight: bold;
  opacity: 1;
}

.collapsed-calc-title-wrap:hover .collapsed-calc-char {
  color: var(--panel-primary);
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
  border: 1px solid var(--panel-btn-secondary-border);
  background: var(--panel-btn-secondary-bg);
  color: var(--panel-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  margin-bottom: 4px;
}

.collapsed-expand-btn:hover {
  background: var(--panel-primary-soft);
  border-color: var(--panel-primary-soft-border);
}

.collapsed-function-name {
  writing-mode: vertical-lr;
  text-orientation: upright;
  font-size: 14px;
  color: var(--panel-muted);
  padding: 8px 4px;
  cursor: pointer;
  letter-spacing: 2px;
  max-height: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.collapsed-function-name:hover {
  color: var(--panel-primary);
}

.calc-collapsed-icon {
  background: var(--panel-primary-soft);
  color: var(--panel-primary);
}

.collapsed-item {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid var(--panel-card-border);
  background: var(--panel-card-bg);
  color: var(--panel-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.collapsed-item:hover {
  background: var(--panel-primary-soft);
  border-color: var(--panel-primary-soft-border);
  color: var(--panel-primary);
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
  border: 1px solid var(--panel-card-border);
  background: color-mix(in srgb, var(--panel-surface) 92%, transparent 8%);
  color: var(--panel-primary);
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.expand-control-btn {
  left: 16px;
}

.expand-calc-btn {
  right: 16px;
}

.expand-control-btn:hover,
.expand-calc-btn:hover {
  background: var(--panel-card-bg);
  border-color: var(--panel-primary-soft-border);
}

/* ==================== 右侧计算面板（备用） ==================== */
.calc-panel {
  width: 400px;
  max-width: 400px;
  height: 100%;
  background: var(--panel-surface);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.calc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--panel-border);
  background: var(--panel-header-bg);
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
  background: linear-gradient(135deg, #7db8e0, #5b9fd4);
  border-radius: 12px;
  color: #fff;
  box-shadow: 0 4px 12px rgba(91, 159, 212, 0.25);
}

.calc-header-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.calc-function-name {
  font-size: 17px;
  font-weight: 600;
  color: var(--panel-title);
}

.calc-service-name {
  font-size: 14px;
  color: var(--panel-muted);
}

.calc-minimize,
.calc-close {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--panel-btn-secondary-border);
  background: var(--panel-btn-secondary-bg);
  color: var(--panel-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.calc-minimize:hover {
  border-color: var(--panel-primary-soft-border);
  background: var(--panel-primary-soft);
  color: var(--panel-primary);
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
  padding: 10px;
}

.calc-view::-webkit-scrollbar {
  width: 4px;
}

.calc-view::-webkit-scrollbar-track {
  background: transparent;
}

.calc-view::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 2px;
}

.calc-view,
.calc-content {
  flex: 1;
  padding: 10px;
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
  background: var(--panel-scrollbar);
  border-radius: 2px;
}

/* 现代化表单样式 - 分组设计 */
.calc-content :deep(.form-section) {
  margin-bottom: 20px;
  padding: 16px;
  background: var(--panel-form-section-bg);
  border-radius: 12px;
  border: 1px solid var(--panel-form-section-border);
}

.calc-content :deep(.form-section-title) {
  font-size: 15px;
  font-weight: 700;
  color: var(--panel-form-title);
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--panel-form-title-border);
  display: flex;
  align-items: center;
  gap: 8px;
  text-shadow: 0 0 10px color-mix(in srgb, var(--panel-form-title) 32%, transparent 68%);
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
  color: var(--panel-form-label);
}

.calc-content :deep(.form-input),
.calc-content :deep(.form-select) {
  width: 100%;
  height: 36px;
  line-height: 1.2;
  padding: 8px 14px;
  background: var(--panel-input-bg);
  border: 1px solid var(--panel-input-border);
  border-radius: 8px;
  color: var(--panel-text-strong);
  font-size: 14px;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.calc-content :deep(.form-input:focus),
.calc-content :deep(.form-select:focus) {
  outline: none;
  border-color: var(--panel-input-focus-border);
  box-shadow: var(--panel-input-focus-shadow);
}

.calc-content :deep(.form-input::placeholder) {
  color: var(--panel-muted-soft);
}

.calc-content :deep(.tip) {
  padding: 12px 14px;
  background: var(--panel-tip-bg);
  border: 1px solid var(--panel-tip-border);
  border-radius: 8px;
  color: var(--panel-tip-text);
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
  background: var(--panel-btn-primary-bg);
  border: none;
  color: #ffffff;
  box-shadow: var(--panel-btn-primary-shadow);
}

.calc-content :deep(.btn-primary:hover) {
  transform: translateY(-1px);
  background: var(--panel-btn-primary-hover-bg);
  box-shadow: var(--panel-btn-primary-hover-shadow);
}

.calc-content :deep(.btn-primary:disabled) {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
  background: #e2e8f0;
  border: none;
  color: var(--panel-muted-soft);
  box-shadow: none;
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
  background: var(--panel-btn-secondary-bg);
  border: 1px solid var(--panel-btn-secondary-border);
  color: var(--panel-btn-secondary-text);
}

.calc-content :deep(.btn-secondary:hover) {
  background: var(--panel-btn-secondary-hover-bg);
  border-color: var(--panel-btn-secondary-hover-border);
}

/* 加载状态 */
.calc-content :deep(.loading-overlay) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: var(--panel-primary);
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
  color: var(--panel-result-label);
}

.calc-content :deep(.result-stat-value) {
  font-size: 18px;
  font-weight: 600;
  color: var(--panel-result-value);
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
  background: var(--panel-point-item-bg);
  border: 1px solid var(--panel-form-section-border);
  border-radius: 8px;
}

.calc-content :deep(.point-info) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 15px;
  color: var(--panel-text);
}

.calc-content :deep(.point-index) {
  font-weight: 600;
  color: var(--panel-primary);
}

.calc-content :deep(.point-coord) {
  font-family: 'Monaco', 'Consolas', monospace;
  font-size: 13px;
  color: var(--panel-muted-soft);
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

.service-panel-container.theme-techBlue .calc-view :deep(.group-title),
.service-panel-container.theme-techBlue .calc-view :deep(.group-title-row .group-title),
.service-panel-container.theme-techBlue .calc-view :deep(.param-label),
.service-panel-container.theme-techBlue .calc-view :deep(.coord-label),
.service-panel-container.theme-techBlue .calc-view :deep(.height-label),
.service-panel-container.theme-techBlue .calc-view :deep(.result-section-title),
.service-panel-container.theme-techBlue .calc-view :deep(.form-title),
.service-panel-container.theme-techBlue .calc-view :deep(label),
.service-panel-container.theme-techBlue .calc-view :deep(.detail-value),
.service-panel-container.theme-techBlue .calc-view :deep(.result-v),
.service-panel-container.theme-techBlue .calc-view :deep(.store-info-value),
.service-panel-container.theme-techBlue .calc-view :deep(.result-num),
.service-panel-container.theme-techBlue .calc-view :deep(.result-status),
.service-panel-container.theme-techBlue .calc-view :deep(.point-name),
.service-panel-container.theme-techBlue .calc-view :deep(.coord-value),
.service-panel-container.theme-techBlue .calc-view :deep(.height-value),
.service-panel-container.theme-techBlue .calc-view :deep(.info-row strong),
.service-panel-container.theme-techBlue .calc-view :deep(.breadcrumb-item.current),
.service-panel-container.theme-techBlue .calc-view :deep(.rule-label) {
  color: var(--panel-field-title) !important;
  text-shadow: 0 0 10px rgba(184, 246, 255, 0.18);
}

.service-panel-container.theme-techBlue .calc-view :deep(.group-sub),
.service-panel-container.theme-techBlue .calc-view :deep(.result-label),
.service-panel-container.theme-techBlue .calc-view :deep(.coord-range-label),
.service-panel-container.theme-techBlue .calc-view :deep(.point-count-label),
.service-panel-container.theme-techBlue .calc-view :deep(.hint-box),
.service-panel-container.theme-techBlue .calc-view :deep(.tip-text),
.service-panel-container.theme-techBlue .calc-view :deep(.empty-tip),
.service-panel-container.theme-techBlue .calc-view :deep(.detail-label),
.service-panel-container.theme-techBlue .calc-view :deep(.result-k),
.service-panel-container.theme-techBlue .calc-view :deep(.store-info-label),
.service-panel-container.theme-techBlue .calc-view :deep(.point-coord),
.service-panel-container.theme-techBlue .calc-view :deep(.path-tip),
.service-panel-container.theme-techBlue .calc-view :deep(.info-row span),
.service-panel-container.theme-techBlue .calc-view :deep(.breadcrumb-item),
.service-panel-container.theme-techBlue .calc-view :deep(.field-tip),
.service-panel-container.theme-techBlue .calc-view :deep(.empty-state),
.service-panel-container.theme-techBlue .calc-view :deep(.help-text),
.service-panel-container.theme-techBlue .calc-view :deep(.rule-desc),
.service-panel-container.theme-techBlue .calc-view :deep(.rule-param-label),
.service-panel-container.theme-techBlue .calc-view :deep(.rule-param-sm-label),
.service-panel-container.theme-techBlue .calc-view :deep(.checkbox-text) {
  color: var(--panel-form-label) !important;
}

.service-panel-container.theme-techBlue .calc-view :deep(.hint-box),
.service-panel-container.theme-techBlue .calc-view :deep(.tip-box),
.service-panel-container.theme-techBlue .calc-view :deep(.store-tips),
.service-panel-container.theme-techBlue .calc-view :deep(.empty-state) {
  background: var(--panel-tip-bg) !important;
  border-color: var(--panel-tip-border) !important;
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
