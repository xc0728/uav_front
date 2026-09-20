<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import * as Cesium from 'cesium'
import {
  loadDeqingBuildings,
  drawBuildingModelsOnMap,
} from '../../utils/buildingModel.js'
import {
  BASE_LAYER_OPTIONS,
  initBaseLayers,
  switchBaseLayer,
} from '../../utils/tdtBaseLayers.js'
import { createZhejiangTerrainProvider } from '../../utils/zhejiangTerrain.js'

// 模块级别的存储（持久化，不随组件销毁而丢失）
const routeGridEntities = {}
let buildingModels = []       // 建筑白膜数据
let buildingEntityIds = []    // Cesium 实体 ID 列表
let buildingsLoaded = false   // 是否已加载数据
let buildingsVisible = true  // 当前可见性
let buildingsLoading = false // 加载中标识

const cesiumEl = ref(null)
let viewer = null
let handler = null
let tileset = null
let gridPrimitives = []

const lon = ref(null)
const lat = ref(null)
const height = ref(null)
const show3DTiles = ref(true)
const showBuildings = ref(false) // 建筑白膜开关
const isMapReady = ref(false) // 地图是否准备就绪

// ==================== 查询结果图例 + 比例尺（仅在查询出网格后显示） ====================
const gridResultState = reactive({
  visible: false,
  levels: [],        // 多层级数组: [{ level, count, color, sizeLabel }]
  total: 0,          // 网格总数
  runtime: '',       // 计算运行时间（如 "1.23 s"）
  scalePixels: 120,
  scaleLabel: '',
})
let scaleBarTimer = null

// ==================== 底图图源切换 ====================
const currentBaseLayer = ref('img')
const showBaseLayerPanel = ref(false)
const baseLayerOptions = BASE_LAYER_OPTIONS
const currentTerrainSource = ref('zhejiang')
const showTerrainPanel = ref(false)
const terrainSourceOptions = [
  { id: 'zhejiang', label: '浙江 DEM' },
  { id: 'world', label: '全球' },
]

function getTerrain(source) {
  if (source === 'world') return Cesium.Terrain.fromWorldTerrain()
  return new Cesium.Terrain(Promise.resolve(createZhejiangTerrainProvider()))
}

function selectBaseLayer(type) {
  if (type === currentBaseLayer.value) {
    showBaseLayerPanel.value = false
    return
  }
  switchBaseLayer(viewer, type)
  currentBaseLayer.value = type
  showBaseLayerPanel.value = false
  showTerrainPanel.value = false
}

function selectTerrainSource(source) {
  if (!viewer || source === currentTerrainSource.value) {
    showTerrainPanel.value = false
    return
  }
  viewer.scene.setTerrain(getTerrain(source))
  currentTerrainSource.value = source
  showTerrainPanel.value = false
  showBaseLayerPanel.value = false
}

// 电子围栏绘制状态
let fenceDrawHandler = null
let fencePoints = []
let fenceDrawingMode = null // 'sphere' | 'line'
let fenceParams = null
let fenceTempEntities = [] // 临时绘制的实体
let sphereGridCells = [] // 球形围栏网格数据
let lineGridCells = [] // 线状围栏网格数据
const onFenceConfirmCallback = ref(null)

const emit = defineEmits(['point-selected', 'fence-confirm', 'box-select-start', 'box-select-end', 'get-view-bounds', 'flight-start', 'flight-end', 'view-bounds-changed'])

const props = defineProps({
  show3DToggle: {
    type: Boolean,
    default: true,
  },
  showScenarioDemo: {
    type: Boolean,
    default: true,
  },
  leftPanelWidth: {
    type: Number,
    default: 0,
  },
})

// 框选相关变量
let isBoxSelecting = false
let boxSelectHandler = null
let boxSelectStartPos = null
let boxSelectEntity = null

// ==================== 一键场景演示 ====================
// 场景演示常量
const SCENARIO_CENTER = { lon: 119.9725, lat: 30.5449 }
const SCENARIO_RADIUS_KM = 3

// 场景演示状态
const scenarioState = reactive({
  active: false,
  step: 0,
  showDialog: false,
  dialogType: 'intro', // 'intro' | 'location' | 'result' | 'conflict'
  incidentLocation: null,
  nearestHospital: null,
  lineRoute: null,
  astarRoute: null,
  conflictResult: null,
  planningLoading: false,
  flightActive: false,
})

// 场景演示实体ID列表
const scenarioEntityIds = []
let scenarioCircleEntity = null

function formatNum(v, digits) {
  if (v === null || v === undefined) return '--'
  if (Number.isNaN(v)) return '--'
  return Number(v).toFixed(digits)
}

function flyToPoint(lon, lat, height = 0) {
  if (!viewer) return
  // 飞行到指定位置
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, height + 500), // 高度偏移以便观察
    duration: 1.5,
  })

  // 添加或更新标记点
  const pointEntityId = 'center-point'
  let entity = viewer.entities.getById(pointEntityId)
  if (entity) {
    entity.position = Cesium.Cartesian3.fromDegrees(lon, lat, height)
  } else {
    viewer.entities.add({
      id: pointEntityId,
      position: Cesium.Cartesian3.fromDegrees(lon, lat, height),
      point: {
        pixelSize: 12,
        color: Cesium.Color.fromCssColorString('#3b82f6'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
      label: {
        text: '网格中心',
        font: '14px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -15),
      },
    })
  }
}

function drawGridBoundary(gridInfo, options = {}) {
  if (!viewer || !gridInfo) {
    console.log('[CesiumMap] drawGridBoundary: viewer 或 gridInfo 不存在')
    return
  }

  const { skipFlyTo = false } = options
  console.log('[CesiumMap] drawGridBoundary gridInfo:', JSON.stringify(gridInfo).slice(0, 500))

  if (gridInfo.renderer === 'primitive' && Array.isArray(gridInfo.cells)) {
    drawGridPrimitives(gridInfo, { skipFlyTo })
    return
  }

  // 先清除之前的网格边界和中心点
  clearGridVisual()

  // 检查是否是多个网格（cells 数组）
  if (gridInfo.cells && Array.isArray(gridInfo.cells) && gridInfo.cells.length > 0) {
    console.log('[CesiumMap] 检测到多个网格:', gridInfo.cells.length)
    // 绘制多个网格边界
    let minLon = Infinity, maxLon = -Infinity
    let minLat = Infinity, maxLat = -Infinity
    let minHeight = Infinity, maxHeight = -Infinity

    gridInfo.cells.forEach((cell, index) => {
      // 兼容多种数据格式：优先从 bounds 取，其次直接从 cell 取
      let north, south, east, west, top = 0, bottom = 0
      if (cell.bounds) {
        north = cell.bounds.north
        south = cell.bounds.south
        east = cell.bounds.east
        west = cell.bounds.west
        top = cell.bounds.top ?? 0
        bottom = cell.bounds.bottom ?? 0
      }
      // Fallback: 直接从 cell 取字段（某些接口返回 maxlon/minlon 等）
      if (north === undefined) north = cell.maxlat
      if (south === undefined) south = cell.minlat
      if (east === undefined) east = cell.maxlon
      if (west === undefined) west = cell.minlon
      if (top === undefined || top === 0) top = cell.top ?? 0
      if (bottom === undefined) bottom = cell.bottom ?? 0

      // 跳过无法获取有效边界的网格
      if (north == null || south == null || east == null || west == null) {
        console.warn(`[CesiumMap] 网格${index + 1} 缺少边界信息，跳过:`, { code: cell.code })
        return
      }

      // 前5个和最后5个网格打印位置分布
      if (index < 5 || index >= gridInfo.cells.length - 5) {
        console.log(`格网${index + 1}: W=${west?.toFixed(6)}, S=${south?.toFixed(6)}, E=${east?.toFixed(6)}, N=${north?.toFixed(6)}`)
      }

      // 更新边界范围
      minLon = Math.min(minLon, west)
      maxLon = Math.max(maxLon, east)
      minLat = Math.min(minLat, south)
      maxLat = Math.max(maxLat, north)
      minHeight = Math.min(minHeight, bottom)
      maxHeight = Math.max(maxHeight, top)

      // 使用格网携带的颜色，如果没有则使用默认颜色
      const cellColor = cell.color || '#3b82f6'
      const cellLevel = cell.level ?? cell.z

      // 绘制每个网格边界
      const cellId = `grid-boundary-${index}`
      
      // 轻微扩展边界以消除Cesium渲染缝隙
      const gapFix = 0.000001
      viewer.entities.add({
        id: cellId,
        rectangle: {
          coordinates: Cesium.Rectangle.fromDegrees(
            west - gapFix, 
            south - gapFix, 
            east + gapFix, 
            north + gapFix
          ),
          material: Cesium.Color.fromCssColorString(cellColor).withAlpha(0.5),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString(cellColor),
          outlineWidth: 1,
          height: bottom,
          extrudedHeight: top,
        },
        description: cellLevel !== undefined ? `层级: ${cellLevel}` : undefined,
      })
    })

    // 计算整体中心位置
    if (minLon !== Infinity && maxLon !== -Infinity) {
      const centerLon = (minLon + maxLon) / 2
      const centerLat = (minLat + maxLat) / 2
      const centerHeight = (minHeight + maxHeight) / 2

      // 飞行到网格区域中心位置（动态缩放模式下跳过，避免触发 camera.changed 死循环）
      if (!skipFlyTo) {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, centerHeight + 3000),
          duration: 1.5,
        })
      }
    }

    console.log('[CesiumMap] 已绘制多个网格边界:', gridInfo.cells.length)
    // 更新查询结果图例（支持多层级）
    gridResultState.levels = collectGridLevels(gridInfo.cells, gridInfo.level)
    gridResultState.total = gridInfo.cells.length
    gridResultState.runtime = formatRuntime(gridInfo.runtime)
    gridResultState.visible = true
    updateScaleBar()
    return
  }

  // 单个网格处理（原有逻辑）
  const { center, bounds } = gridInfo
  if (!bounds) return

  // 绘制网格边界矩形
  const { north, south, east, west, top = 0, bottom = 0 } = bounds
  const gridBoundaryId = 'grid-boundary'

  // 计算中心位置
  const centerLon = (east + west) / 2
  const centerLat = (north + south) / 2
  // 中心高程应该是上下边界的中间，而不是底部
  const centerHeight = (top + bottom) / 2

  // 飞行到网格中心位置（动态缩放模式下跳过，避免触发 camera.changed 死循环）
  if (!skipFlyTo) {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, centerHeight + 2000),
      duration: 1.5,
    })
  }

  // 绘制网格边界（使用矩形 entity）
  viewer.entities.add({
    id: gridBoundaryId,
    rectangle: {
      coordinates: Cesium.Rectangle.fromDegrees(west, south, east, north),
      material: Cesium.Color.fromCssColorString('#3b82f6').withAlpha(0.2),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString('#3b82f6'),
      outlineWidth: 2,
      height: bottom,
      extrudedHeight: top,
    },
  })

  // 绘制中心点标记
  if (center) {
    viewer.entities.add({
      id: 'grid-center-point',
      position: Cesium.Cartesian3.fromDegrees(center.longitude, center.latitude, centerHeight),
      point: {
        pixelSize: 8,
        color: Cesium.Color.fromCssColorString('#f59e0b'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
      label: {
        text: '网格中心',
        font: '14px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -15),
      },
    })
  }

  console.log('[CesiumMap] 已绘制网格边界:', gridInfo)
  // 更新查询结果图例（单层级）
  const singleSizeLabel = computeCellSizeLabel({ bounds })
  gridResultState.levels = gridInfo.level != null
    ? [{ level: Number(gridInfo.level), count: 1, color: '#3b82f6', sizeLabel: singleSizeLabel }]
    : []
  gridResultState.total = 1
  gridResultState.runtime = formatRuntime(gridInfo.runtime)
  gridResultState.visible = true
  updateScaleBar()
}

function drawLinePath(linePoints) {
  if (!viewer) return
  clearLineVisual()

  const raw = Array.isArray(linePoints) ? linePoints : []
  const pts = raw
    .map(p => ({
      lon: Number(p?.lon),
      lat: Number(p?.lat),
      height: Number(p?.height ?? 0),
    }))
    .filter(p => Number.isFinite(p.lon) && Number.isFinite(p.lat) && Number.isFinite(p.height))
  if (pts.length === 0) return

  // 点实体
  pts.forEach((p, idx) => {
    const id = `line-point-${idx}`
    viewer.entities.add({
      id,
      position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.height),
      point: {
        pixelSize: 9,
        color: Cesium.Color.fromCssColorString('#22c55e'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: String(idx + 1),
        font: '12px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -12),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
  })

  // 折线实体（至少 2 点）
  if (pts.length >= 2) {
    const positions = Cesium.Cartesian3.fromDegreesArrayHeights(
      pts.flatMap(p => [p.lon, p.lat, p.height]),
    )
    const lineColor = Cesium.Color.fromCssColorString('#22c55e').withAlpha(0.9)
    viewer.entities.add({
      id: 'line-polyline',
      polyline: {
        positions,
        width: 3,
        material: lineColor,
        clampToGround: true,
      },
    })
  }
}

function drawPolygon(polygonPoints) {
  if (!viewer) return

  // 禁飞区类型不清除其他多边形，由 drawNoFlyZonePrism 自行管理
  const isNoFlyZone = polygonPoints && typeof polygonPoints === 'object'
    && !Array.isArray(polygonPoints) && polygonPoints.type === 'noFlyZone'

  if (!isNoFlyZone) {
    clearPolygonVisual()
  }

  if (polygonPoints && typeof polygonPoints === 'object' && !Array.isArray(polygonPoints)) {
    if (polygonPoints.type === 'noFlyZone' && Array.isArray(polygonPoints.points)) {
      drawNoFlyZonePrism(polygonPoints)
      return
    }

    const { outer, holes, currentHole, drawingMode } = polygonPoints

    console.log('[CesiumMap] drawPolygon 接收到的数据:', {
      outerCount: outer?.length,
      holesCount: holes?.length,
      currentHoleCount: currentHole?.length,
      drawingMode
    })

    // 绘制外边界 + 洞的组合多边形（带挖空效果）
    if (outer && outer.length >= 3) {
      drawPolygonWithHoles(outer, holes || [], currentHole, drawingMode)
    }

    // 绘制当前正在绘制的洞（如果没有外边界或外边界不完整）
    if ((!outer || outer.length < 3) && currentHole && currentHole.length >= 3) {
      drawPolygonShape(currentHole, '#ef4444', 'current-hole', true)
    }

    return
  }

  // 旧格式：简单点数组
  const raw = Array.isArray(polygonPoints) ? polygonPoints : []
  if (raw.length > 0) {
    drawPolygonShape(raw, '#f59e0b', 'polygon')
  }
}

// 绘制带洞的多边形
function drawPolygonWithHoles(outerPoints, completedHoles, currentHole, drawingMode) {
  if (!viewer || !outerPoints || outerPoints.length < 1) return

  const outer = outerPoints
    .map(p => ({
      lon: Number(p?.lon),
      lat: Number(p?.lat),
      height: Number(p?.height ?? 2),
    }))
    .filter(p => Number.isFinite(p.lon) && Number.isFinite(p.lat))

  if (outer.length === 0) return

  // 如果只有1个点，绘制一个点
  if (outer.length === 1) {
    viewer.entities.add({
      id: 'outer-point-0',
      position: Cesium.Cartesian3.fromDegrees(outer[0].lon, outer[0].lat, outer[0].height),
      point: {
        pixelSize: 8,
        color: Cesium.Color.fromCssColorString('#f59e0b'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: '1',
        font: '11px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -10),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
    return
  }

  // 如果有2个点，绘制连线
  if (outer.length === 2) {
    viewer.entities.add({
      id: 'outer-outline',
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([
          outer[0].lon, outer[0].lat, outer[0].height,
          outer[1].lon, outer[1].lat, outer[1].height
        ]),
        width: 2,
        material: Cesium.Color.fromCssColorString('#f59e0b'),
        depthFailMaterial: Cesium.Color.fromCssColorString('#f59e0b'),
      },
    })
    // 绘制两个点
    outer.forEach((p, idx) => {
      viewer.entities.add({
        id: `outer-point-${idx}`,
        position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.height),
        point: {
          pixelSize: 8,
          color: Cesium.Color.fromCssColorString('#f59e0b'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: String(idx + 1),
          font: '11px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -10),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
    })
    return
  }

  // 3个及以上点时，绘制完整的多边形边框（橙色实线）- 闭合多边形
  const outerClosed = [...outer, outer[0]]
  viewer.entities.add({
    id: 'outer-outline',
    polyline: {
      positions: Cesium.Cartesian3.fromDegreesArrayHeights(
        outerClosed.flatMap(p => [p.lon, p.lat, p.height])
      ),
      width: 2,
      material: Cesium.Color.fromCssColorString('#f59e0b'),
      depthFailMaterial: Cesium.Color.fromCssColorString('#f59e0b'),
    },
  })

  // 绘制外边界点（橙色）
  outer.forEach((p, idx) => {
    viewer.entities.add({
      id: `outer-point-${idx}`,
      position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.height),
      point: {
        pixelSize: 8,
        color: Cesium.Color.fromCssColorString('#f59e0b'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: String(idx + 1),
        font: '11px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -10),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
  })

  // 绘制已完成的洞（红色边框，更高的高度）
  if (completedHoles && completedHoles.length > 0) {
    completedHoles.forEach((hole, holeIdx) => {
      if (hole.length < 3) return

      const holeCoords = hole.map(p => ({
        lon: Number(p?.lon),
        lat: Number(p?.lat),
        height: Number(p?.height ?? 4),
      }))

      // 绘制洞的边框线（红色）- 闭合多边形
      const holeClosed = [...holeCoords, holeCoords[0]]
      viewer.entities.add({
        id: `hole-outline-${holeIdx}`,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(
            holeClosed.flatMap(p => [p.lon, p.lat, p.height])
          ),
          width: 2,
          material: Cesium.Color.RED,
          depthFailMaterial: Cesium.Color.RED,
        },
      })

      // 绘制洞的点（红色菱形）
      holeCoords.forEach((p, idx) => {
        viewer.entities.add({
          id: `hole-point-${holeIdx}-${idx}`,
          position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.height),
          point: {
            pixelSize: 6,
            color: Cesium.Color.RED,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: `洞${holeIdx + 1}-${idx + 1}`,
            font: '10px sans-serif',
            fillColor: Cesium.Color.RED,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -8),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        })
      })
    })
  }

  // 绘制当前正在绘制的洞（虚线边框）
  if (currentHole && currentHole.length >= 1) {
    const currentCoords = currentHole.map(p => ({
      lon: Number(p?.lon),
      lat: Number(p?.lat),
      height: Number(p?.height ?? 4),
    }))

    // 如果只有1个点，绘制一个点
    if (currentCoords.length === 1) {
      viewer.entities.add({
        id: 'current-hole-point-0',
        position: Cesium.Cartesian3.fromDegrees(currentCoords[0].lon, currentCoords[0].lat, currentCoords[0].height),
        point: {
          pixelSize: 6,
          color: Cesium.Color.RED,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: '1',
          font: '10px sans-serif',
          fillColor: Cesium.Color.RED,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -8),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
      return
    }

    // 如果有2个点，绘制连线
    if (currentCoords.length === 2) {
      viewer.entities.add({
        id: 'current-hole-outline',
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights([
            currentCoords[0].lon, currentCoords[0].lat, currentCoords[0].height,
            currentCoords[1].lon, currentCoords[1].lat, currentCoords[1].height
          ]),
          width: 2,
          material: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.RED,
          }),
          depthFailMaterial: new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.RED,
          }),
        },
      })
      currentCoords.forEach((p, idx) => {
        viewer.entities.add({
          id: `current-hole-point-${idx}`,
          position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.height),
          point: {
            pixelSize: 6,
            color: Cesium.Color.RED,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: String(idx + 1),
            font: '10px sans-serif',
            fillColor: Cesium.Color.RED,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -8),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        })
      })
      return
    }

    // 3个及以上点，绘制虚线边框
    const currentClosed = [...currentCoords, currentCoords[0]]
    viewer.entities.add({
      id: 'current-hole-outline',
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights(
          currentClosed.flatMap(p => [p.lon, p.lat, p.height])
        ),
        width: 2,
        material: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.RED,
        }),
        depthFailMaterial: new Cesium.PolylineDashMaterialProperty({
          color: Cesium.Color.RED,
        }),
      },
    })

    // 绘制当前洞的点
    currentCoords.forEach((p, idx) => {
      viewer.entities.add({
        id: `current-hole-point-${idx}`,
        position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.height),
        point: {
          pixelSize: 6,
          color: Cesium.Color.RED,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
    })
  }
}

// 绘制多边形形状
function drawPolygonShape(pts, color, idPrefix, isDashed = false) {
  if (!viewer || !pts || pts.length === 0) return

  const points = pts
    .map(p => ({
      lon: Number(p?.lon),
      lat: Number(p?.lat),
      height: Number(p?.height ?? 0),
    }))
    .filter(p => Number.isFinite(p.lon) && Number.isFinite(p.lat) && Number.isFinite(p.height))

  if (points.length === 0) return

  // 点实体 - 使用对应颜色
  points.forEach((p, idx) => {
    const id = `${idPrefix}-point-${idx}`
    viewer.entities.add({
      id,
      position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.height),
      point: {
        pixelSize: 9,
        color: Cesium.Color.fromCssColorString(color),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: String(idx + 1),
        font: '12px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -12),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
  })

  // 闭合多边形（至少 3 个点）
  if (points.length >= 3) {
    const positions = Cesium.Cartesian3.fromDegreesArrayHeights(
      points.flatMap(p => [p.lon, p.lat, p.height]),
    )
    const polygonColor = Cesium.Color.fromCssColorString(color).withAlpha(0.3)
    const outlineColor = Cesium.Color.fromCssColorString(color).withAlpha(0.9)

    const entityConfig = {
      id: `${idPrefix}-area`,
      polygon: {
        hierarchy: positions,
        material: polygonColor,
        outline: true,
        outlineColor: outlineColor,
        outlineWidth: 2,
      },
    }

    // 如果需要虚线边框（当前正在绘制的洞）
    if (isDashed) {
      entityConfig.polyline = {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights(
          [...points, points[0]].flatMap(p => [p.lon, p.lat, p.height])
        ),
        width: 2,
        material: new Cesium.PolylineDashMaterialProperty({
          color: outlineColor,
        }),
      }
    }

    viewer.entities.add(entityConfig)
  }
}

function drawNoFlyZonePrism(data) {
  if (!viewer) return

  const pts = data.points
  if (!pts || pts.length < 3) return

  const bottom = Number(data.bottom ?? 0)
  const top = Number(data.top ?? 120)
  const color = data.color || '#ef4444'
  const zoneId = data.zoneId || 'default'

  removeNoFlyZonePrism(zoneId)

  const positions = Cesium.Cartesian3.fromDegreesArrayHeights(
    pts.flatMap(p => [Number(p.lon), Number(p.lat), bottom]),
  )

  viewer.entities.add({
    id: `noflyzone-prism-${zoneId}`,
    polygon: {
      hierarchy: positions,
      material: Cesium.Color.fromCssColorString(color).withAlpha(0.35),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString(color).withAlpha(0.9),
      outlineWidth: 2,
      height: bottom,
      extrudedHeight: top,
      closeTop: true,
      closeBottom: true,
    },
  })
}

function removeNoFlyZonePrism(zoneId) {
  if (!viewer) return
  viewer.entities.removeById(`noflyzone-prism-${zoneId}`)
}

function clearLineVisual() {
  if (!viewer) return

  const polyline = viewer.entities.getById('line-polyline')
  if (polyline) viewer.entities.remove(polyline)

  const entityIds = viewer.entities.values.map(e => e.id)
  entityIds.forEach(id => {
    if (id && id.startsWith('line-point-')) {
      viewer.entities.removeById(id)
    }
  })
}

function clearPolygonVisual() {
  if (!viewer) return

  const entityIds = viewer.entities.values.map(e => e.id)

  // 清除所有多边形相关的实体
  entityIds.forEach(id => {
    if (!id) return
    // 旧格式
    if (id === 'polygon-area' || id.startsWith('polygon-point-')) {
      viewer.entities.removeById(id)
    }
    // 新格式：外边界
    if (id === 'outer-outline' || id.startsWith('outer-point-')) {
      viewer.entities.removeById(id)
    }
    // 新格式：洞
    if (id.startsWith('hole-outline-') || id.startsWith('hole-point-') || id.startsWith('current-hole-')) {
      viewer.entities.removeById(id)
    }
    // 禁飞区立方体
    if (id.startsWith('noflyzone-prism-') || id.startsWith('noflyzone-point-')) {
      viewer.entities.removeById(id)
    }
  })
}

function clearGridVisual() {
  if (!viewer) return

  gridPrimitives.forEach(primitive => viewer.scene.primitives.remove(primitive))
  gridPrimitives = []

  // 清除之前的单个网格边界
  const boundaryEntity = viewer.entities.getById('grid-boundary')
  if (boundaryEntity) {
    viewer.entities.remove(boundaryEntity)
  }

  // 清除之前的多网格边界（通过 pattern 匹配）
  const entityIds = viewer.entities.values.map(e => e.id)
  entityIds.forEach(id => {
    if (id && id.startsWith('grid-boundary-')) {
      viewer.entities.removeById(id)
    }
  })

  // 清除之前的中心点（保留 showPoint 的中心点）
  const gridCenterEntity = viewer.entities.getById('grid-center-point')
  if (gridCenterEntity) {
    viewer.entities.remove(gridCenterEntity)
  }

  // 隐藏查询结果图例 + 比例尺
  gridResultState.visible = false
  gridResultState.levels = []
  gridResultState.total = 0
  gridResultState.runtime = ''
}

// DEM 查询结果是静态大批量矩形，使用批量 Primitive 避免逐格 Entity 的更新开销。
function drawGridPrimitives(gridInfo, options = {}) {
  clearGridVisual()
  if (!gridInfo.cells.length) return

  const fillColor = Cesium.Color.fromCssColorString('#3b82f6').withAlpha(0.5)
  const outlineColor = Cesium.Color.fromCssColorString('#3b82f6')
  const batchSize = 50000
  let minLon = Infinity, maxLon = -Infinity
  let minLat = Infinity, maxLat = -Infinity
  let minHeight = Infinity, maxHeight = -Infinity
  let validCount = 0

  for (let offset = 0; offset < gridInfo.cells.length; offset += batchSize) {
    const fills = []
    const outlines = []
    const end = Math.min(offset + batchSize, gridInfo.cells.length)

    for (let index = offset; index < end; index++) {
      const bounds = gridInfo.cells[index]?.bounds
      if (!bounds) continue
      const { north, south, east, west, top = 0, bottom = 0 } = bounds
      if (![north, south, east, west, top, bottom].every(Number.isFinite)) continue

      const rectangle = Cesium.Rectangle.fromDegrees(west, south, east, north)
      fills.push(new Cesium.GeometryInstance({
        geometry: new Cesium.RectangleGeometry({
          rectangle,
          height: bottom,
          extrudedHeight: top,
          vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(fillColor),
        },
      }))
      outlines.push(new Cesium.GeometryInstance({
        geometry: new Cesium.RectangleOutlineGeometry({
          rectangle,
          height: bottom,
          extrudedHeight: top,
        }),
        attributes: {
          color: Cesium.ColorGeometryInstanceAttribute.fromColor(outlineColor),
        },
      }))

      minLon = Math.min(minLon, west)
      maxLon = Math.max(maxLon, east)
      minLat = Math.min(minLat, south)
      maxLat = Math.max(maxLat, north)
      minHeight = Math.min(minHeight, bottom)
      maxHeight = Math.max(maxHeight, top)
      validCount++
    }

    if (!fills.length) continue
    gridPrimitives.push(viewer.scene.primitives.add(new Cesium.Primitive({
      geometryInstances: fills,
      appearance: new Cesium.PerInstanceColorAppearance({ translucent: true, closed: true }),
      asynchronous: true,
    })))
    gridPrimitives.push(viewer.scene.primitives.add(new Cesium.Primitive({
      geometryInstances: outlines,
      appearance: new Cesium.PerInstanceColorAppearance({ flat: true, translucent: false }),
      asynchronous: true,
    })))
  }

  if (!validCount) return
  if (!options.skipFlyTo) {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        (minLon + maxLon) / 2,
        (minLat + maxLat) / 2,
        (minHeight + maxHeight) / 2 + 3000,
      ),
      duration: 1.5,
    })
  }

  gridResultState.levels = collectGridLevels(gridInfo.cells, gridInfo.level)
  gridResultState.total = validCount
  gridResultState.runtime = formatRuntime(gridInfo.runtime)
  gridResultState.visible = true
  updateScaleBar()
}

// ==================== 比例尺 + 查询结果图例辅助函数 ====================

// 格式化距离：m → "x.xx m" 或 "x.xx km"
function formatDistance(m) {
  if (m >= 1000) return (m / 1000).toFixed(2) + ' km'
  if (m >= 10) return m.toFixed(1) + ' m'
  return m.toFixed(2) + ' m'
}

// 格式化运行时间：ms → "x.xx s" 或 "x ms"
function formatRuntime(ms) {
  if (ms == null || isNaN(ms)) return ''
  if (ms >= 1000) return (ms / 1000).toFixed(2) + ' s'
  return Math.round(ms) + ' ms'
}

// 计算比例尺：选"漂亮"整数刻度，像素长度 80-200px
function computeScaleBar(viewportMeters, canvasPx) {
  const metersPerPixel = viewportMeters / canvasPx
  const targetMeters = 120 * metersPerPixel
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000,
                 10000, 20000, 50000, 100000, 200000, 500000, 1000000]
  let chosen = steps[0]
  for (const s of steps) {
    if (s <= targetMeters) chosen = s
  }
  const pixelWidth = chosen / metersPerPixel
  return { meters: chosen, pixels: Math.round(pixelWidth), label: formatDistance(chosen) }
}

// 比例尺更新（始终生效，地图就绪后持续刷新当前视口比例尺）
function updateScaleBar() {
  if (!viewer) return
  const bounds = getViewBounds()
  if (!bounds) return
  const { west, south, east, north } = bounds
  if (east <= west || (east - west) > 180) return
  const midLat = (north + south) / 2
  const cosLat = Math.cos(midLat * Math.PI / 180)
  const viewportWidthM = (east - west) * 111320 * cosLat
  if (viewportWidthM <= 0) return
  const canvas = viewer.scene.canvas
  const sb = computeScaleBar(viewportWidthM, canvas.width)
  gridResultState.scalePixels = sb.pixels
  gridResultState.scaleLabel = sb.label
}

// 节流：120ms 合并 camera.changed 高频触发
function scheduleScaleBarUpdate() {
  if (scaleBarTimer) return
  scaleBarTimer = setTimeout(() => {
    scaleBarTimer = null
    updateScaleBar()
  }, 120)
}

// 动态缩放：400ms debounce 合并 camera.changed，避免滚轮连续缩放时疯狂请求
let viewBoundsDebounceTimer = null
function scheduleViewBoundsEmit() {
  if (viewBoundsDebounceTimer) clearTimeout(viewBoundsDebounceTimer)
  viewBoundsDebounceTimer = setTimeout(() => {
    viewBoundsDebounceTimer = null
    const bounds = getViewBounds()
    if (bounds) {
      // 附带相机高度，供上层做自动层级映射
      const height = viewer?.camera?.positionCartographic?.height ?? 0
      emit('view-bounds-changed', { ...bounds, cameraHeight: height })
    }
  }, 400)
}

// 根据网格 bounds 计算格网尺寸（取经向/纬向的代表边长，单位米）
function computeCellSizeLabel(cell) {
  const b = cell.bounds
  if (!b) return ''
  const { north, south, east, west } = b
  if (north == null || south == null || east == null || west == null) return ''
  const midLat = (north + south) / 2
  const cosLat = Math.cos(midLat * Math.PI / 180)
  const latSize = (north - south) * 111320
  const lonSize = (east - west) * 111320 * cosLat
  // 取经向/纬向边长的较大值作为格网代表尺寸
  const sizeM = Math.max(Math.abs(latSize), Math.abs(lonSize))
  if (!isFinite(sizeM) || sizeM <= 0) return ''
  return formatDistance(sizeM)
}

// 从 cells 中提取层级信息（支持多层级：聚合服务的 cells 携带 level/z + color）
function collectGridLevels(cells, fallbackLevel) {
  const levelMap = {}
  let hasCellLevel = false
  cells.forEach(cell => {
    // 优先用 cell.level，其次 cell.z（倾斜摄影聚合返回的字段）
    const lv = cell.level ?? cell.z ?? null
    const color = cell.color || '#3b82f6'
    if (lv !== null && lv !== undefined) {
      hasCellLevel = true
      if (!levelMap[lv]) {
        levelMap[lv] = {
          level: Number(lv),
          count: 0,
          color,
          sizeLabel: computeCellSizeLabel(cell),
        }
      }
      levelMap[lv].count++
    }
  })
  if (hasCellLevel) {
    return Object.values(levelMap).sort((a, b) => a.level - b.level)
  }
  // cells 无层级字段时，用 payload 顶层 level（单层级）
  if (fallbackLevel != null) {
    const sizeLabel = cells.length > 0 ? computeCellSizeLabel(cells[0]) : ''
    return [{ level: Number(fallbackLevel), count: cells.length, color: '#3b82f6', sizeLabel }]
  }
  return []
}

function clearCenterPoint() {
  if (!viewer) return
  // 清除 center-point (flyToPoint 添加的)
  const centerEntity = viewer.entities.getById('center-point')
  if (centerEntity) {
    viewer.entities.remove(centerEntity)
  }
  // 清除 grid-center-point (drawGridBoundary 添加的)
  const gridCenterEntity = viewer.entities.getById('grid-center-point')
  if (gridCenterEntity) {
    viewer.entities.remove(gridCenterEntity)
  }
}

function toggle3DTiles() {
  if (!tileset) return
  show3DTiles.value = !show3DTiles.value
  tileset.show = show3DTiles.value
}

function toggleBuildingsOnMap() {
  if (!buildingsLoaded) {
    loadBuildingModels().then(() => {
      showBuildings.value = true
    })
    return
  }
  showBuildings.value = !showBuildings.value
  buildingsVisible = showBuildings.value
  buildingEntityIds.forEach(id => {
    const entity = viewer.entities.getById(id)
    if (entity) entity.show = showBuildings.value
  })
}

// ==================== 一键场景演示功能 ====================

/** 打开场景演示 */
function openScenarioDemo() {
  currentStartToken++
  scenarioState.active = true
  scenarioState.step = 1
  scenarioState.showDialog = true
  scenarioState.dialogType = 'intro'
  scenarioState.incidentLocation = null
  scenarioState.nearestHospital = null
  scenarioState.lineRoute = null
  scenarioState.astarRoute = null
  scenarioState.conflictResult = null

  // 在地图上绘制3km圆形区域
  drawScenarioCircle()
}

/** 关闭/取消场景演示（通用全量重置） */
function closeScenarioDemo() {
  if (currentFlightAnim) {
    if (currentFlightAnim.rafId) cancelAnimationFrame(currentFlightAnim.rafId)
    if (currentFlightAnim.entity && viewer) viewer.entities.remove(currentFlightAnim.entity)
    currentFlightAnim = null
  }
  currentPlanningToken++
  currentStartToken++
  scenarioState.active = false
  scenarioState.step = 0
  scenarioState.showDialog = false
  scenarioState.dialogType = 'intro'
  scenarioState.incidentLocation = null
  scenarioState.nearestHospital = null
  scenarioState.lineRoute = null
  scenarioState.astarRoute = null
  scenarioState.conflictResult = null
  scenarioState.planningLoading = false
  scenarioState.flightActive = false
  clearScenarioVisualization()
  emit('flight-end')
}

/** 下一步 */
function nextScenarioStep() {
  if (scenarioState.dialogType === 'intro') {
    scenarioState.dialogType = 'location'
  } else if (scenarioState.dialogType === 'location' && scenarioState.incidentLocation) {
    scenarioState.step = 3
    scenarioState.dialogType = 'planning'
    scenarioState.planningLoading = true
    executeRoutePlanning()
  }
}

/** 上一步 */
function prevScenarioStep() {
  if (scenarioState.dialogType === 'location') {
    scenarioState.dialogType = 'intro'
  }
}

/** 重置场景演示 */
function resetScenarioDemo() {
  closeScenarioDemo()
}

let currentFlightAnim = null
let currentPlanningToken = 0
let currentStartToken = 0

/** 放飞无人机：沿A*路径飞行（医院 → 事故地点） */
function releaseDrone() {
  const pathData = scenarioState.astarRoute
  if (!pathData || pathData.length === 0) {
    alert('无航线数据')
    return
  }

  // 隐藏弹窗
  scenarioState.showDialog = false
  scenarioState.flightActive = true

  // 反转路径：从医院飞往事故地点
  const centers = []
  const reversedPath = [...pathData].reverse()
  for (const grid of reversedPath) {
    if (grid.center && Array.isArray(grid.center) && grid.center.length >= 2) {
      const h = Number(grid.center[2])
        || ((Number(grid.top) || 0) + (Number(grid.bottom) || 0)) / 2
        || 120
      centers.push({
        lon: Number(grid.center[0]),
        lat: Number(grid.center[1]),
        height: h,
      })
    }
  }

  if (centers.length < 2) {
    alert('航线数据不足')
    scenarioState.flightActive = false
    return
  }

  // 发射飞行开始事件，通知监控屏开始模拟
  emit('flight-start')

  // 加载无人机图标
  const img = new Image()
  img.onload = () => {
    doFlightAnimation(img, centers)
  }
  img.onerror = () => {
    doFlightAnimation(null, centers)
  }
  img.src = '/webicon1.png'
}

function doFlightAnimation(droneImg, centers) {
  const entityId = 'scenario-drone-flight'
  const start = centers[0]

  // 计算格网尺寸，用于缩放图标
  const g0 = centers[0]
  const g1 = centers[1] || centers[0]
  const dLon = Math.abs(g1.lon - g0.lon) || 0.001
  const dLat = Math.abs(g1.lat - g0.lat) || 0.001
  const midLatRad = ((g0.lat + g1.lat) / 2) * Math.PI / 180
  const cellW = dLon * 111320 * Math.cos(midLatRad)
  const cellH = dLat * 110540
  const cellSize = Math.max(cellW, cellH, 1)
  const scale = Math.max(0.08, cellSize * 0.006)

  const entity = viewer.entities.add({
    id: entityId,
    position: Cesium.Cartesian3.fromDegrees(start.lon, start.lat, start.height),
    billboard: droneImg ? {
      image: droneImg,
      scale,
    } : undefined,
    model: droneImg ? undefined : {
      uri: '/DXY1.glb',
      scale,
      minimumPixelSize: 32,
      maximumScale: 50000,
    },
  })

  const anim = {
    centers,
    idx: 0,
    t: 0,
    pos: Cesium.Cartesian3.fromDegrees(start.lon, start.lat, start.height),
    ori: Cesium.Quaternion.IDENTITY,
    lastTime: performance.now(),
    secondsPerGrid: 2,
    done: false,
    rafId: null,
    entity,
  }
  currentFlightAnim = anim

  const FRAME_RATE = 60
  const INTERVAL = 1000 / FRAME_RATE
  let lastFrameTime = performance.now()

  function flightLoop() {
    if (!currentFlightAnim || currentFlightAnim !== anim || currentFlightAnim.done) return

    const now = performance.now()
    if (now - lastFrameTime < INTERVAL) {
      currentFlightAnim.rafId = requestAnimationFrame(flightLoop)
      return
    }
    lastFrameTime = now

    const dt = (now - anim.lastTime) / 1000
    anim.lastTime = now

    anim.t += dt / anim.secondsPerGrid

    while (anim.t >= 1 && anim.idx < anim.centers.length - 1) {
      anim.t -= 1
      anim.idx++
    }

    if (anim.idx >= anim.centers.length - 1) {
      const last = anim.centers[anim.centers.length - 1]
      anim.pos = Cesium.Cartesian3.fromDegrees(last.lon, last.lat, last.height)
      const hpr = new Cesium.HeadingPitchRoll(0, 0, 0)
      anim.ori = Cesium.Transforms.headingPitchRollQuaternion(anim.pos, hpr)
      entity.position = new Cesium.ConstantPositionProperty(anim.pos)
      entity.orientation = new Cesium.ConstantProperty(anim.ori)
      anim.done = true

      finishFlight()
      return
    }

    const from = anim.centers[anim.idx]
    const to = anim.centers[anim.idx + 1]
    const easeT = anim.t * anim.t * (3 - 2 * anim.t)
    const lon = from.lon + (to.lon - from.lon) * easeT
    const lat = from.lat + (to.lat - from.lat) * easeT
    const h = from.height + (to.height - from.height) * easeT

    anim.pos = Cesium.Cartesian3.fromDegrees(lon, lat, h)

    const dLonRad = (to.lon - from.lon) * Math.PI / 180
    const fromLatRad = from.lat * Math.PI / 180
    const toLatRad = to.lat * Math.PI / 180
    const heading = Math.atan2(
      Math.sin(dLonRad) * Math.cos(toLatRad),
      Math.cos(fromLatRad) * Math.sin(toLatRad)
        - Math.sin(fromLatRad) * Math.cos(toLatRad) * Math.cos(dLonRad)
    )
    const hpr = new Cesium.HeadingPitchRoll(heading, 0, 0)
    anim.ori = Cesium.Transforms.headingPitchRollQuaternion(anim.pos, hpr)

    entity.position = new Cesium.ConstantPositionProperty(anim.pos)
    entity.orientation = new Cesium.ConstantProperty(anim.ori)

    currentFlightAnim.rafId = requestAnimationFrame(flightLoop)
  }

  currentFlightAnim.rafId = requestAnimationFrame(flightLoop)
}

function cancelFlight() {
  // 停止飞行动画
  if (currentFlightAnim) {
    if (currentFlightAnim.rafId) {
      cancelAnimationFrame(currentFlightAnim.rafId)
    }
    if (currentFlightAnim.entity && viewer) {
      viewer.entities.remove(currentFlightAnim.entity)
    }
    currentFlightAnim = null
  }

  // 废弃旧规划请求
  currentPlanningToken++

  // 完全重置场景演示状态，像没演示过一样
  scenarioState.active = false
  scenarioState.step = 0
  scenarioState.showDialog = false
  scenarioState.dialogType = 'intro'
  scenarioState.incidentLocation = null
  scenarioState.nearestHospital = null
  scenarioState.lineRoute = null
  scenarioState.astarRoute = null
  scenarioState.conflictResult = null
  scenarioState.planningLoading = false
  scenarioState.flightActive = false

  clearScenarioVisualization()
  emit('flight-end')
}

function finishFlight() {
  if (currentFlightAnim) {
    if (currentFlightAnim.entity && viewer) {
      viewer.entities.remove(currentFlightAnim.entity)
    }
    currentFlightAnim = null
  }
  scenarioState.flightActive = false
  emit('flight-end')
  resetScenarioDemo()
}

/** 绘制3km圆形区域 */
function drawScenarioCircle() {
  if (!viewer) return

  // 清除旧的可视化
  clearScenarioVisualization()

  const centerLon = SCENARIO_CENTER.lon
  const centerLat = SCENARIO_CENTER.lat

  // 创建圆形
  scenarioCircleEntity = viewer.entities.add({
    id: 'scenario-circle',
    position: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 0),
    ellipse: {
      semiMajorAxis: SCENARIO_RADIUS_KM * 1000,
      semiMinorAxis: SCENARIO_RADIUS_KM * 1000,
      height: 0.1,
      material: Cesium.Color.fromCssColorString('#ff4444').withAlpha(0.15),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString('#ff4444'),
      outlineWidth: 2,
      fill: true,
    }
  })

  // 添加中心点标记
  const centerMarkerId = 'scenario-center-marker'
  scenarioEntityIds.push(centerMarkerId)
  viewer.entities.add({
    id: centerMarkerId,
    position: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 10),
    point: {
      pixelSize: 10,
      color: Cesium.Color.fromCssColorString('#ff4444'),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
    },
    label: {
      text: '演示中心点',
      font: '12px sans-serif',
      fillColor: Cesium.Color.RED,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -15),
    }
  })

  // 飞向该区域
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 3000),
    duration: 1.5
  })
}

/** 清除场景可视化 */
function clearScenarioVisualization() {
  if (scenarioCircleEntity) {
    viewer.entities.remove(scenarioCircleEntity)
    scenarioCircleEntity = null
  }

  // 清除所有场景实体
  scenarioEntityIds.forEach(id => {
    viewer.entities.removeById(id)
  })
  scenarioEntityIds.length = 0

  // 清除其他场景相关实体
  const entityIdsToRemove = [
    'scenario-circle',
    'scenario-center-marker',
    'incident-marker',
    'scenario-hospital-marker',
    'scenario-line-route',
    'scenario-grid-route',
    'scenario-astar-route',
    'scenario-conflict-cell',
    'scenario-conflict-marker',
    'scenario-incident-marker',
  ]
  entityIdsToRemove.forEach(id => {
    viewer.entities.removeById(id)
  })
}

/** 计算两点间距离（km）- Haversine公式 */
function getDistanceFromCenter(lon, lat) {
  const R = 6371
  const dLat = (lat - SCENARIO_CENTER.lat) * Math.PI / 180
  const dLon = (lon - SCENARIO_CENTER.lon) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(SCENARIO_CENTER.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/** 添加事故标记 */
function addIncidentMarker(lon, lat) {
  // 移除旧的事故标记
  viewer.entities.removeById('incident-marker')

  const markerId = 'incident-marker'
  scenarioEntityIds.push(markerId)

  viewer.entities.add({
    id: markerId,
    position: Cesium.Cartesian3.fromDegrees(lon, lat, 50),
    billboard: {
      image: createRedMarkerImage(),
      scale: 0.8,
    },
    label: {
      text: '事故地点',
      font: '14px sans-serif',
      fillColor: Cesium.Color.RED,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -20),
    }
  })
}

/** 创建红色标记图片 */
function createRedMarkerImage() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')

  // 绘制红色标记
  ctx.fillStyle = '#ff4444'
  ctx.beginPath()
  ctx.moveTo(32, 4)
  ctx.lineTo(58, 58)
  ctx.lineTo(6, 58)
  ctx.closePath()
  ctx.fill()

  // 绘制白色边框
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 3
  ctx.stroke()

  // 绘制内部白色圆点
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(32, 36, 8, 0, Math.PI * 2)
  ctx.fill()

  return canvas.toDataURL()
}

/** 场景演示地图点击处理 */
function handleScenarioMapClick(movement) {
  if (!scenarioState.active || scenarioState.dialogType !== 'location') return

  const cartesian = viewer.scene.pickPosition(movement.position)
  if (!cartesian) return

  const cartographic = Cesium.Cartographic.fromCartesian(cartesian)
  const clickLon = Cesium.Math.toDegrees(cartographic.longitude)
  const clickLat = Cesium.Math.toDegrees(cartographic.latitude)

  // 计算距离中心的距离（km）
  const distance = getDistanceFromCenter(clickLon, clickLat)

  if (distance > SCENARIO_RADIUS_KM) {
    // 提示用户
    alert(`请在${SCENARIO_RADIUS_KM}km范围内选择位置，当前距离：${distance.toFixed(2)}km`)
    return
  }

  // 保存位置
  scenarioState.incidentLocation = {
    lon: clickLon,
    lat: clickLat,
    height: cartographic.height || 0
  }

  // 在地图上标记
  addIncidentMarker(clickLon, clickLat)
}

/** 计算多边形中心点 */
function getPolygonCenter(coordinates) {
  if (!coordinates || coordinates.length === 0) return null

  let sumLon = 0
  let sumLat = 0
  let count = 0

  for (const coord of coordinates) {
    if (Array.isArray(coord) && coord.length >= 2) {
      sumLon += parseFloat(coord[0])
      sumLat += parseFloat(coord[1])
      count++
    }
  }

  if (count === 0) return null

  return {
    lon: sumLon / count,
    lat: sumLat / count
  }
}

/** 查找最近医院 */
async function findNearestHospital(incident) {
  // 确保建筑数据已加载
  if (!buildingsLoaded || buildingModels.length === 0) {
    console.log('[ScenarioDemo] 加载建筑数据...')
    await loadBuildingModels()
  }

  // 筛选医院 (type === 1)
  const hospitals = buildingModels.filter(b => {
    const type = b.properties?.type || b.type
    return type === 1
  })

  console.log('[ScenarioDemo] 找到医院数量:', hospitals.length)

  if (hospitals.length === 0) {
    // 如果没有找到医院，返回一个默认位置
    console.warn('[ScenarioDemo] 未找到医院，使用默认位置')
    return {
      lon: 119.9850,
      lat: 30.5350,
      name: '最近医院（默认）'
    }
  }

  let nearest = null
  let minDist = Infinity

  for (const h of hospitals) {
    const center = getPolygonCenter(h.coordinates)
    if (!center) continue

    // 使用Haversine计算距离
    const dist = calculateDistance(incident.lat, incident.lon, center.lat, center.lon)

    if (dist < minDist) {
      minDist = dist
      nearest = {
        lon: center.lon,
        lat: center.lat,
        name: h.properties?.name || '医院',
        building: h
      }
    }
  }

  console.log('[ScenarioDemo] 最近医院:', nearest, '距离:', minDist.toFixed(2), 'km')
  return nearest
}

/** 使用Haversine公式计算两点间距离(km) */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/** 执行航线规划 */
async function executeRoutePlanning() {
  const incident = scenarioState.incidentLocation
  const runToken = ++currentPlanningToken
  const runStartToken = currentStartToken

  try {
    // 1. 查找最近医院
    const hospital = await findNearestHospital(incident)
    if (runToken !== currentPlanningToken) return
    scenarioState.nearestHospital = hospital

    // 2. 准备直线航线点（高度10m，层级14）
    const linePoints = [
      [hospital.lon, hospital.lat, 10],
      [incident.lon, incident.lat, 10]
    ]
    scenarioState.lineRoute = linePoints

    // 3. 调用三维线网格化API获取路径格网
    const gridData = await getGridByLine(linePoints)
    if (runToken !== currentPlanningToken) return

    if (!gridData.success || gridData.count === 0) {
      drawSimpleLineRoute(hospital, incident)
    } else {
      scenarioState.gridCells = gridData.cells
    }

    // 4. 调用冲突检测API
    const conflictResult = await checkRouteConflict(linePoints)
    if (runToken !== currentPlanningToken) return
    scenarioState.conflictResult = conflictResult

    // 最终门卫：只有当前运行的场景演示轮次与本轮次一致才更新状态
    if (runStartToken !== currentStartToken) return

    if (conflictResult.hasConflict) {
      if (gridData.cells && gridData.cells.length > 0) drawGridRoute(gridData, scenarioEntityIds)
      if (conflictResult.conflictCell) drawConflictCell(conflictResult.conflictCell, scenarioEntityIds)
      scenarioState.dialogType = 'conflict'
    } else {
      if (gridData.cells && gridData.cells.length > 0) drawGridRoute(gridData, scenarioEntityIds)
      scenarioState.dialogType = 'result'
    }
  } catch (error) {
    console.error('[ScenarioDemo] 航线规划失败:', error)
    if (runToken !== currentPlanningToken) return
    if (runStartToken !== currentStartToken) return
    alert('航线规划失败：' + error.message)
    scenarioState.dialogType = 'intro'
  } finally {
    if (runToken === currentPlanningToken) {
      scenarioState.planningLoading = false
    }
  }
}

/** 调用冲突检测API */
async function checkRouteConflict(points) {
  const payload = {
    startTime: Math.floor(Date.now() / 1000),
    points: points,
    level: 14,
    planeRadius: 0.75,
    speed: 15.0,
    workHeight: 100,
    condition: {
      gd_14: "",
      dz_14: ""
    }
  }

  try {
    console.log('[ScenarioDemo] 调用冲突检测API:', payload)

    const resp = await fetch('/api/airRoute/lineConflict/checkFirst', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await resp.json()
    console.log('[ScenarioDemo] 冲突检测结果:', data)

    // 检查是否有冲突
    const hasConflict = resp.status === 400 || data.status === 'conflict'

    // 提取冲突格网信息
    let conflictCell = null
    if (hasConflict) {
      conflictCell = data.grid || data.conflictCell || data.cell || null
    }

    return {
      hasConflict,
      reason: data.reason || data.message || (hasConflict ? '检测到航线冲突' : ''),
      grid: data.grid,
      conflictCell
    }
  } catch (err) {
    console.error('[ScenarioDemo] 冲突检测失败:', err)
    return { hasConflict: false, reason: '', grid: null, conflictCell: null }
  }
}

/** 调用三维线网格化API */
async function getGridByLine(points) {
  const payload = {
    line: points,
    level: 14
  }

  try {
    console.log('[ScenarioDemo] 调用三维线网格化API:', payload)

    const resp = await fetch('/api/multiSource/geometricGrid/getGridByLine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await resp.json()
    console.log('[ScenarioDemo] 网格化结果:', data)

    if (data.status === 'success' && data.data) {
      return {
        success: true,
        cells: data.data.cells || [],
        count: data.data.count || 0
      }
    }
    return { success: false, cells: [], count: 0 }
  } catch (err) {
    console.error('[ScenarioDemo] 网格化失败:', err)
    return { success: false, cells: [], count: 0 }
  }
}

/** 绘制格网路径（蓝色） */
function drawGridRoute(gridData, entityIds, color = '#3b82f6') {
  if (!gridData.cells || gridData.cells.length === 0) return

  // 为每个格网添加半透明体可视化
  for (let i = 0; i < gridData.cells.length; i++) {
    const cell = gridData.cells[i]
    if (!cell.center || cell.center.length < 3) continue

    const cellId = `scenario-grid-cell-${i}`
    entityIds.push(cellId)

    const minLon = cell.minlon
    const maxLon = cell.maxlon
    const minLat = cell.minlat
    const maxLat = cell.maxlat
    const bottom = cell.bottom || 0
    const top = cell.top || 10

    viewer.entities.add({
      id: cellId,
      rectangle: {
        coordinates: Cesium.Rectangle.fromDegrees(minLon, minLat, maxLon, maxLat),
        height: bottom,
        extrudedHeight: top,
        material: Cesium.Color.fromCssColorString(color).withAlpha(0.15),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString(color).withAlpha(0.5),
        outlineWidth: 1,
      }
    })
  }
}

/** 绘制冲突格网（红色） */
function drawConflictCell(conflictCell, entityIds) {
  if (!conflictCell) return

  const cellId = 'scenario-conflict-cell'
  entityIds.push(cellId)

  const minLon = conflictCell.minlon
  const maxLon = conflictCell.maxlon
  const minLat = conflictCell.minlat
  const maxLat = conflictCell.maxlat
  const bottom = conflictCell.bottom || 0
  const top = conflictCell.top || 10

  // 添加冲突格网实体
  viewer.entities.add({
    id: cellId,
    rectangle: {
      coordinates: Cesium.Rectangle.fromDegrees(minLon, minLat, maxLon, maxLat),
      height: bottom,
      extrudedHeight: top,
      material: Cesium.Color.fromCssColorString('#f97316').withAlpha(0.3),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString('#f97316'),
      outlineWidth: 2,
    }
  })

  // 添加冲突点标记
  if (conflictCell.center && conflictCell.center.length >= 3) {
    const markerId = 'scenario-conflict-marker'
    entityIds.push(markerId)
    viewer.entities.add({
      id: markerId,
      position: Cesium.Cartesian3.fromDegrees(
        conflictCell.center[0],
        conflictCell.center[1],
        conflictCell.center[2] + 20
      ),
      billboard: {
        image: createConflictMarkerImage(),
        scale: 1.2,
      },
      label: {
        text: '冲突点',
        font: '12px sans-serif',
        fillColor: Cesium.Color.fromCssColorString('#ef4444'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -30),
      }
    })
  }
}

/** 创建医院标记图标 */
function createHospitalMarkerImage() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')

  // 绘制圆形背景
  ctx.fillStyle = '#10b981'
  ctx.beginPath()
  ctx.arc(32, 32, 28, 0, Math.PI * 2)
  ctx.fill()

  // 绘制十字
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(28, 14, 8, 36)
  ctx.fillRect(14, 28, 36, 8)

  return canvas
}

/** 创建冲突标记图标 */
function createConflictMarkerImage() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')

  // 绘制三角形警告标志
  ctx.fillStyle = '#ef4444'
  ctx.beginPath()
  ctx.moveTo(32, 8)
  ctx.lineTo(56, 52)
  ctx.lineTo(8, 52)
  ctx.closePath()
  ctx.fill()

  // 绘制感叹号
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(29, 18, 6, 18)
  ctx.beginPath()
  ctx.arc(32, 44, 4, 0, Math.PI * 2)
  ctx.fill()

  return canvas
}

/** 清除场景演示相关实体 */
function clearScenarioEntities() {
  if (!viewer) return

  // 清除所有场景实体
  for (const id of scenarioEntityIds) {
    viewer.entities.removeById(id)
  }
  scenarioEntityIds = []

  // 清除圆形区域
  if (scenarioCircleEntity) {
    viewer.entities.remove(scenarioCircleEntity)
    scenarioCircleEntity = null
  }

  // 清除事故标记
  viewer.entities.removeById('incident-marker')
}

/** 绘制直线航线 */
function drawLineRoute(hospital, incident) {
  drawSimpleLineRoute(hospital, incident)
}

/** 绘制简单直线航线（无格网） */
function drawSimpleLineRoute(hospital, incident) {
  // 清除旧的航线相关实体
  viewer.entities.removeById('scenario-line-route')
  viewer.entities.removeById('scenario-hospital-marker')
  viewer.entities.removeById('scenario-incident-marker')

  // 绘制医院标记
  const hospitalMarkerId = 'scenario-hospital-marker'
  scenarioEntityIds.push(hospitalMarkerId)
  viewer.entities.add({
    id: hospitalMarkerId,
    position: Cesium.Cartesian3.fromDegrees(hospital.lon, hospital.lat, 150),
    billboard: {
      image: createHospitalMarkerImage(),
      scale: 1,
    },
    label: {
      text: hospital.name || '医院',
      font: '14px sans-serif',
      fillColor: Cesium.Color.fromCssColorString('#10b981'),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -25),
    }
  })

  // 绘制直线航线（绿色）
  const lineRouteId = 'scenario-line-route'
  scenarioEntityIds.push(lineRouteId)
  viewer.entities.add({
    id: lineRouteId,
    polyline: {
      positions: Cesium.Cartesian3.fromDegreesArrayHeights([
        hospital.lon, hospital.lat, 1,
        incident.lon, incident.lat, 1
      ]),
      width: 4,
      material: Cesium.Color.fromCssColorString('#10b981'),
      clampToGround: false,
    }
  })

  // 绘制事故点标记
  const incidentMarkerId = 'scenario-incident-marker'
  scenarioEntityIds.push(incidentMarkerId)
  viewer.entities.add({
    id: incidentMarkerId,
    position: Cesium.Cartesian3.fromDegrees(incident.lon, incident.lat, 20),
    billboard: {
      image: createIncidentMarkerImage(),
      scale: 1,
    },
    label: {
      text: '事故地点',
      font: '14px sans-serif',
      fillColor: Cesium.Color.fromCssColorString('#ef4444'),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -25),
    }
  })
}

/** 创建事故地点标记图标 */
function createIncidentMarkerImage() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')

  // 绘制红色圆形背景
  ctx.fillStyle = '#ef4444'
  ctx.beginPath()
  ctx.arc(32, 32, 28, 0, Math.PI * 2)
  ctx.fill()

  // 绘制白色边框
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 3
  ctx.stroke()

  // 绘制X标记
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(20, 20)
  ctx.lineTo(44, 44)
  ctx.moveTo(44, 20)
  ctx.lineTo(20, 44)
  ctx.stroke()

  return canvas.toDataURL()
}

/** 启动A*航路规划 */
async function startAstarPlanning() {
  const incident = scenarioState.incidentLocation
  const hospital = scenarioState.nearestHospital
  const runToken = ++currentPlanningToken
  const runStartToken = currentStartToken

  scenarioState.planningLoading = true

  // 起点：鼠标点击位置上方10m
  const startHeight = (incident.height || 0) + 10
  // 终点：医院模型顶部上方1m（最小10m保底，防止高度为0落在地面）
  // OSGB网格可能仍标记该格子为障碍，需叠加一个安全余量
  const endHeight = Math.max(10, (hospital.building?.height || 30) + 1) + 30

  const payload = {
    startTime: Math.floor(Date.now() / 1000),
    points: [
      [incident.lon, incident.lat, startHeight],
      [hospital.lon, hospital.lat, endHeight]
    ],
    level: 14,
    planeRadius: 0.75,
    speed: 15.0,
    workHeight: 100,
    condition: {
      gd_14: "",
      dz_14: ""
    }
  }

  try {
    const resp = await fetch('/api/airRoute/Astar/AstarPathPlane', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await resp.json()

    // 门卫：旧请求直接丢弃
    if (runToken !== currentPlanningToken) return
    if (runStartToken !== currentStartToken) return

    if (data.results?.success) {
      scenarioState.astarRoute = data.results.path

      // 清除旧直线航线、蓝色格网和冲突格网（含 cell 实体）
      viewer.entities.removeById('scenario-line-route')
      viewer.entities.removeById('scenario-grid-route')
      viewer.entities.removeById('scenario-conflict-cell')
      for (let i = 0; i < scenarioEntityIds.length; i++) {
        const id = scenarioEntityIds[i]
        if (id.startsWith('scenario-grid-cell-') || id === 'scenario-conflict-cell') {
          viewer.entities.removeById(id)
        }
      }
      scenarioEntityIds.splice(0)

      // 用 A* 返回的 path 绘制绿色格网路径
      drawGridRoute({ cells: data.results.path }, scenarioEntityIds, '#22c55e')
      scenarioState.dialogType = 'result'
    } else {
      if (runToken !== currentPlanningToken || runStartToken !== currentStartToken) return
      alert('A*规划失败: ' + (data.results?.reason || '未知错误'))
    }
  } catch (err) {
    if (runToken !== currentPlanningToken || runStartToken !== currentStartToken) return
    alert('A*规划请求失败')
  } finally {
    if (runToken === currentPlanningToken) {
      scenarioState.planningLoading = false
    }
  }
}

/** 绘制A*航线 */
function drawAstarRoute(pathData) {
  if (!pathData || pathData.length === 0) return

  const positions = []
  for (const cell of pathData) {
    if (cell.center && Array.isArray(cell.center) && cell.center.length >= 3) {
      positions.push(cell.center[0], cell.center[1], cell.center[2])
    }
  }

  if (positions.length === 0) return

  const astarRouteId = 'scenario-astar-route'
  scenarioEntityIds.push(astarRouteId)

  viewer.entities.add({
    id: astarRouteId,
    polyline: {
      positions: Cesium.Cartesian3.fromDegreesArrayHeights(positions),
      width: 4,
      material: Cesium.Color.fromCssColorString('#3b82f6'),
      clampToGround: false,
    }
  })
}

// ==================== 电子围栏绘制功能 ====================

function clearFenceTempEntities() {
  if (!viewer) return
  fenceTempEntities.forEach(entity => {
    viewer.entities.remove(entity)
  })
  fenceTempEntities = []
  sphereGridCells = [] // 清理网格数据
}

function clearFenceDrawing() {
  clearFenceTempEntities()
  fencePoints = []
  fenceDrawingMode = null
  fenceParams = null
  if (fenceDrawHandler) {
    fenceDrawHandler.destroy()
    fenceDrawHandler = null
  }
  if (handler) {
    handler.setInputAction((movement) => {
      handleMouseClick(movement)
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
  }
}

function startDrawSphereFence(params, callback) {
  if (!viewer) return
  clearFenceDrawing()
  fenceDrawingMode = 'sphere'
  fenceParams = params
  onFenceConfirmCallback.value = callback

  // 禁用原有的地图点击，改用围栏绘制点击
  if (handler) {
    handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK)
    handler.setInputAction((movement) => {
      handleFenceMapClick(movement)
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
  }

  console.log('[CesiumMap] 开始绘制球形围栏，参数:', params)
}

function startDrawLineFence(params, callback) {
  if (!viewer) return
  clearFenceDrawing()
  fenceDrawingMode = 'line'
  fenceParams = params
  onFenceConfirmCallback.value = callback
  fencePoints = [] // 清空点列表

  // 禁用原有的地图点击，改用围栏绘制点击
  if (handler) {
    handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK)
    handler.setInputAction((movement) => {
      handleFenceMapClick(movement)
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
  }

  console.log('[CesiumMap] 开始绘制线状围栏，参数:', params)
}

function handleFenceMapClick(movement) {
  if (!viewer || !fenceDrawingMode) return

  const cartesian = viewer.scene.pickPosition(movement.position)
  if (!cartesian) return

  const cartographic = Cesium.Cartographic.fromCartesian(cartesian)
  const clickedLon = Cesium.Math.toDegrees(cartographic.longitude)
  const clickedLat = Cesium.Math.toDegrees(cartographic.latitude)
  let clickedHeight = cartographic.height

  if (!clickedHeight || clickedHeight <= 0 || !isFinite(clickedHeight)) {
    try {
      const terrainHeight = viewer.scene.globe.getHeight(cartographic)
      if (terrainHeight && isFinite(terrainHeight)) {
        clickedHeight = terrainHeight
      }
    } catch (e) {}
  }
  if (!clickedHeight || clickedHeight <= 0 || !isFinite(clickedHeight)) {
    clickedHeight = 100
  }

  const point = {
    lon: Number(clickedLon.toFixed(10)),
    lat: Number(clickedLat.toFixed(10)),
    height: Number(clickedHeight.toFixed(1))
  }

  fencePoints.push(point)

  if (fenceDrawingMode === 'sphere') {
    // 球形围栏：绘制单个点预览
    drawSphereFencePreview(point)
  } else if (fenceDrawingMode === 'line') {
    // 线状围栏：绘制点预览
    drawLineFencePreview()
  }
}

// 绘制球形围栏预览（单个点）
function drawSphereFencePreview(center) {
  if (!viewer || !fenceParams) return
  clearFenceTempEntities()

  const { radius } = fenceParams
  const centerHeight = center.height

  // 添加中心点
  const centerEntity = viewer.entities.add({
    id: 'fence-temp-center',
    position: Cesium.Cartesian3.fromDegrees(center.lon, center.lat, centerHeight),
    point: {
      pixelSize: 12,
      color: Cesium.Color.fromCssColorString('#fbbf24'),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  })
  fenceTempEntities.push(centerEntity)

  // 添加中心点标签
  const labelEntity = viewer.entities.add({
    id: 'fence-temp-label',
    position: Cesium.Cartesian3.fromDegrees(center.lon, center.lat, centerHeight),
    label: {
      text: `球心\n半径: ${radius}m`,
      font: '13px sans-serif',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.fromCssColorString('#fbbf24'),
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -20),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  })
  fenceTempEntities.push(labelEntity)
}

// 绘制圆形缓冲区（使用多边形近似圆）
function drawCircleBuffer(center, radius) {
  if (!viewer) return

  const segments = 64 // 圆形的分段数，越多越平滑
  const positions = []

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * 2 * Math.PI
    const dx = radius * Math.cos(angle)
    const dy = radius * Math.sin(angle)

    // 简单的经纬度偏移估算（适用于小范围）
    const dLon = (dx / 111320) / Math.cos(center.lat * Math.PI / 180)
    const dLat = dy / 110540

    positions.push(
      Cesium.Cartesian3.fromDegrees(
        center.lon + dLon,
        center.lat + dLat,
        center.height
      )
    )
  }

  // 绘制圆形填充
  const fillEntity = viewer.entities.add({
    id: 'fence-temp-circle-fill',
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(positions),
      material: Cesium.Color.fromCssColorString('#fbbf24').withAlpha(0.3),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString('#fbbf24'),
      outlineWidth: 2,
    },
  })
  fenceTempEntities.push(fillEntity)

  // 绘制圆形边框线
  const borderEntity = viewer.entities.add({
    id: 'fence-temp-circle-border',
    polyline: {
      positions: positions,
      width: 2,
      material: Cesium.Color.fromCssColorString('#fbbf24'),
    },
  })
  fenceTempEntities.push(borderEntity)
}

// 调用网格化 API 获取球体网格数据
async function fetchSphereGridData(center, radius) {
  try {
    const response = await fetch('/api/multiSource/geometricGrid/getGridByPointAndRadius', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lon: center.lon,
        lat: center.lat,
        height: Math.round(center.height),
        radius: Math.round(radius),
        level: 14
      })
    })
    const result = await response.json()
    if (result.status === 'success' && result.data) {
      return result.data.cells
    }
    return null
  } catch (error) {
    console.error('[CesiumMap] 获取球体网格数据失败:', error)
    return null
  }
}

// 完成球形围栏绘制（点击"完成绘制"时调用）
async function completeSphereFence(fenceData, callback) {
  if (!viewer || fencePoints.length === 0) {
    console.warn('[CesiumMap] 球形围栏需要至少1个点')
    alert('请先在地图上点击选择球心位置')
    return
  }

  const center = fencePoints[fencePoints.length - 1] // 使用最后一个点击的点
  const { radius } = fenceData.params

  // 清除临时绘制
  clearFenceTempEntities()

  // 重新绘制中心点预览
  const centerEntity = viewer.entities.add({
    id: 'fence-temp-center',
    position: Cesium.Cartesian3.fromDegrees(center.lon, center.lat, center.height),
    point: {
      pixelSize: 14,
      color: Cesium.Color.fromCssColorString('#fbbf24'),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  })
  fenceTempEntities.push(centerEntity)

  const labelEntity = viewer.entities.add({
    id: 'fence-temp-label',
    position: Cesium.Cartesian3.fromDegrees(center.lon, center.lat, center.height),
    label: {
      text: `球心\n半径: ${radius}m`,
      font: '13px sans-serif',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.fromCssColorString('#fbbf24'),
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -20),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  })
  fenceTempEntities.push(labelEntity)

  // 调用 API 获取网格数据
  const gridCells = await fetchSphereGridData(center, radius)

  if (gridCells && gridCells.length > 0) {
    // 清除预览点，绘制网格
    clearFenceTempEntities()

    // 添加中心点
    const centerEntity2 = viewer.entities.add({
      id: 'fence-temp-center',
      position: Cesium.Cartesian3.fromDegrees(center.lon, center.lat, center.height),
      point: {
        pixelSize: 14,
        color: Cesium.Color.fromCssColorString('#fbbf24'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
    fenceTempEntities.push(centerEntity2)

    // 绘制网格
    gridCells.forEach((cell, idx) => {
      // 顶面
      viewer.entities.add({
        id: `fence-temp-grid-top-${idx}`,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy([
            Cesium.Cartesian3.fromDegrees(cell.minlon, cell.minlat, cell.top),
            Cesium.Cartesian3.fromDegrees(cell.maxlon, cell.minlat, cell.top),
            Cesium.Cartesian3.fromDegrees(cell.maxlon, cell.maxlat, cell.top),
            Cesium.Cartesian3.fromDegrees(cell.minlon, cell.maxlat, cell.top),
          ]),
          material: Cesium.Color.fromCssColorString('#fbbf24').withAlpha(0.4),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#fbbf24'),
          perPositionHeight: true,
        },
      })

      // 底面
      viewer.entities.add({
        id: `fence-temp-grid-bottom-${idx}`,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy([
            Cesium.Cartesian3.fromDegrees(cell.minlon, cell.minlat, cell.bottom),
            Cesium.Cartesian3.fromDegrees(cell.maxlon, cell.minlat, cell.bottom),
            Cesium.Cartesian3.fromDegrees(cell.maxlon, cell.maxlat, cell.bottom),
            Cesium.Cartesian3.fromDegrees(cell.minlon, cell.maxlat, cell.bottom),
          ]),
          material: Cesium.Color.fromCssColorString('#fbbf24').withAlpha(0.2),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#fbbf24'),
          perPositionHeight: true,
        },
      })

      // 侧面边框线
      viewer.entities.add({
        id: `fence-temp-grid-line-${idx}`,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights([
            cell.minlon, cell.minlat, cell.bottom,
            cell.maxlon, cell.minlat, cell.bottom,
            cell.maxlon, cell.maxlat, cell.bottom,
            cell.minlon, cell.maxlat, cell.bottom,
            cell.minlon, cell.minlat, cell.bottom,
          ]),
          width: 1,
          material: Cesium.Color.fromCssColorString('#fbbf24').withAlpha(0.6),
        },
      })
    })

    // 飞行视角
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(center.lon, center.lat, center.height + radius * 2),
      duration: 1,
    })

    // 回调
    if (callback) {
      callback({
        type: 'sphere',
        center: center,
        gridCells: gridCells
      })
    }
  } else {
    // API 调用失败，使用圆形缓冲区作为后备可视化
    console.warn('[CesiumMap] 球形网格数据为空，使用圆形缓冲区可视化')

    // 清除临时实体，保留中心点和标签
    const tempEntitiesToKeep = fenceTempEntities.filter(e =>
      e.id === 'fence-temp-center' || e.id === 'fence-temp-label'
    )
    fenceTempEntities.forEach(e => {
      if (e.id !== 'fence-temp-center' && e.id !== 'fence-temp-label') {
        viewer.entities.remove(e)
      }
    })
    fenceTempEntities = tempEntitiesToKeep

    // 绘制圆形缓冲区
    drawCircleBuffer(center, radius)

    // 飞行视角
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(center.lon, center.lat, center.height + radius * 2),
      duration: 1,
    })

    // 回调（带空 gridCells 表示使用备用可视化）
    if (callback) {
      callback({
        type: 'sphere',
        center: center,
        gridCells: null // 无网格数据
      })
    }
  }
}

// 绘制线状围栏预览（绘制点连线）
function drawLineFencePreview() {
  if (!viewer || !fenceParams) return

  // 清除之前的临时实体
  clearFenceTempEntities()

  // 绘制所有点
  fencePoints.forEach((p, idx) => {
    const entity = viewer.entities.add({
      id: `fence-temp-line-point-${idx}`,
      position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.height),
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString('#22d3ee'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: `P${idx + 1}`,
        font: '12px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString('#22d3ee'),
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -15),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
    fenceTempEntities.push(entity)
  })

  // 绘制连线（至少2个点）
  if (fencePoints.length >= 2) {
    const positions = fencePoints.map(p =>
      Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.height)
    )
    fenceTempEntities.push(viewer.entities.add({
      id: 'fence-temp-line-polyline',
      polyline: {
        positions: positions,
        width: 3,
        material: Cesium.Color.fromCssColorString('#22d3ee'),
        depthFailMaterial: Cesium.Color.fromCssColorString('#22d3ee'),
      },
    }))
  }
}

// 调用线矩形缓冲区 API
async function fetchLineGridData(points, halfWidth, halfHeight) {
  try {
    // 构造线的坐标数组 [[lon, lat, height], ...]
    const line = points.map(p => [p.lon, p.lat, p.height])

    const response = await fetch('/api/multiSource/geometricGrid/getGridByPolylineAndRect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        line: line,
        level: 14,
        halfWidth: Math.round(halfWidth),
        halfHeight: Math.round(halfHeight)
      })
    })
    const result = await response.json()
    if (result.status === 'success' && result.data) {
      return result.data.cells
    }
    return null
  } catch (error) {
    console.error('[CesiumMap] 获取线状网格数据失败:', error)
    return null
  }
}

// 绘制基于网格的线状围栏
async function drawLineFenceFromGrid(fenceData, callback) {
  if (!viewer || fencePoints.length < 2) {
    console.warn('[CesiumMap] 线状围栏需要至少2个点')
    return
  }

  const { halfWidth, halfHeight } = fenceData.params
  const points = [...fencePoints]

  // 清除临时绘制
  clearFenceTempEntities()

  // 调用 API 获取网格数据
  const gridCells = await fetchLineGridData(points, halfWidth, halfHeight)

  if (gridCells && gridCells.length > 0) {
    lineGridCells = gridCells

    // 绘制线段
    const positions = points.map(p =>
      Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.height)
    )
    viewer.entities.add({
      id: 'fence-temp-line-final',
      polyline: {
        positions: positions,
        width: 4,
        material: Cesium.Color.fromCssColorString('#22d3ee'),
        depthFailMaterial: Cesium.Color.fromCssColorString('#22d3ee'),
      },
    })

    // 绘制每个网格单元格
    gridCells.forEach((cell, idx) => {
      // 顶面
      viewer.entities.add({
        id: `fence-temp-line-grid-top-${idx}`,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy([
            Cesium.Cartesian3.fromDegrees(cell.minlon, cell.minlat, cell.top),
            Cesium.Cartesian3.fromDegrees(cell.maxlon, cell.minlat, cell.top),
            Cesium.Cartesian3.fromDegrees(cell.maxlon, cell.maxlat, cell.top),
            Cesium.Cartesian3.fromDegrees(cell.minlon, cell.maxlat, cell.top),
          ]),
          material: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.35),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.9),
          perPositionHeight: true,
        },
      })

      // 底面（只在高于地表时显示，这里简化处理）
      viewer.entities.add({
        id: `fence-temp-line-grid-bottom-${idx}`,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy([
            Cesium.Cartesian3.fromDegrees(cell.minlon, cell.minlat, cell.bottom),
            Cesium.Cartesian3.fromDegrees(cell.maxlon, cell.minlat, cell.bottom),
            Cesium.Cartesian3.fromDegrees(cell.maxlon, cell.maxlat, cell.bottom),
            Cesium.Cartesian3.fromDegrees(cell.minlon, cell.maxlat, cell.bottom),
          ]),
          material: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.2),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.6),
          perPositionHeight: true,
        },
      })
    })

    // 飞行到线状围栏中心
    const centerLon = points.reduce((sum, p) => sum + p.lon, 0) / points.length
    const centerLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length
    const maxHeight = Math.max(...gridCells.map(c => c.top))
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, maxHeight * 2),
      duration: 1,
    })

    // 回调
    if (callback) {
      callback({
        type: 'line',
        points: points,
        gridCells: gridCells
      })
    }
  } else {
    // API 调用失败，显示错误提示
    console.warn('[CesiumMap] 线状网格数据为空，请确保后端服务已启动')
    alert('网格数据获取失败，请确保后端服务已启动')
  }
}

// 完成线状围栏绘制
function completeLineFence(fenceData, callback) {
  if (!viewer) return

  if (fencePoints.length < 2) {
    console.warn('[CesiumMap] 线状围栏需要至少2个点')
    alert('请先在地图上点击添加至少2个点')
    return
  }

  drawLineFenceFromGrid(fenceData, callback)
}

// ==================== 球形围栏网格数据函数 ====================

function drawFenceOnMap(fence) {
  if (!viewer) return

  const { type, params, gridCells } = fence

  if (type === 'sphere') {
    const center = fence.center || fencePoints[0]
    if (!center) return
    const { radius } = params

    // 获取网格数据（优先使用传入的，否则使用存储的）
    const cells = gridCells || sphereGridCells

    // 添加中心点
    viewer.entities.add({
      id: `fence-${fence.id}-center`,
      position: Cesium.Cartesian3.fromDegrees(center.lon, center.lat, center.height),
      point: {
        pixelSize: 14,
        color: Cesium.Color.fromCssColorString('#fbbf24'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: fence.name,
        font: '14px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString('#fbbf24'),
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })

    // 如果有网格数据，使用网格绘制球形
    if (cells && cells.length > 0) {
      cells.forEach((cell, idx) => {
        // 绘制网格侧面（垂直面）
        viewer.entities.add({
          id: `fence-${fence.id}-grid-side-${idx}`,
          corridor: {
            positions: [
              Cesium.Cartesian3.fromDegrees(cell.minlon, cell.minlat, cell.bottom),
              Cesium.Cartesian3.fromDegrees(cell.minlon, cell.minlat, cell.top),
              Cesium.Cartesian3.fromDegrees(cell.maxlon, cell.minlat, cell.top),
              Cesium.Cartesian3.fromDegrees(cell.maxlon, cell.minlat, cell.bottom),
            ],
            width: Math.max(cell.maxlon - cell.minlon, cell.maxlat - cell.minlat) * 111000,
            material: Cesium.Color.fromCssColorString('#fbbf24').withAlpha(fence.enabled ? 0.15 : 0.05),
            cornerType: Cesium.CornerType.MITERED,
          },
        })

        // 绘制网格顶面
        viewer.entities.add({
          id: `fence-${fence.id}-grid-top-${idx}`,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy([
              Cesium.Cartesian3.fromDegrees(cell.minlon, cell.minlat, cell.top),
              Cesium.Cartesian3.fromDegrees(cell.maxlon, cell.minlat, cell.top),
              Cesium.Cartesian3.fromDegrees(cell.maxlon, cell.maxlat, cell.top),
              Cesium.Cartesian3.fromDegrees(cell.minlon, cell.maxlat, cell.top),
            ]),
            material: Cesium.Color.fromCssColorString('#fbbf24').withAlpha(fence.enabled ? 0.4 : 0.12),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#fbbf24').withAlpha(fence.enabled ? 0.9 : 0.3),
          },
        })

        // 绘制网格底面
        viewer.entities.add({
          id: `fence-${fence.id}-grid-bottom-${idx}`,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy([
              Cesium.Cartesian3.fromDegrees(cell.minlon, cell.minlat, cell.bottom),
              Cesium.Cartesian3.fromDegrees(cell.maxlon, cell.minlat, cell.bottom),
              Cesium.Cartesian3.fromDegrees(cell.maxlon, cell.maxlat, cell.bottom),
              Cesium.Cartesian3.fromDegrees(cell.minlon, cell.maxlat, cell.bottom),
            ]),
            material: Cesium.Color.fromCssColorString('#fbbf24').withAlpha(fence.enabled ? 0.2 : 0.06),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#fbbf24').withAlpha(fence.enabled ? 0.7 : 0.2),
          },
        })

        // 绘制网格边框线
        viewer.entities.add({
          id: `fence-${fence.id}-grid-line-${idx}`,
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights([
              cell.minlon, cell.minlat, cell.bottom,
              cell.maxlon, cell.minlat, cell.bottom,
              cell.maxlon, cell.maxlat, cell.bottom,
              cell.minlon, cell.maxlat, cell.bottom,
              cell.minlon, cell.minlat, cell.bottom,
            ]),
            width: 1,
            material: Cesium.Color.fromCssColorString('#fbbf24').withAlpha(fence.enabled ? 0.6 : 0.2),
          },
        })
      })
    } else {
      // 没有网格数据时，使用 ellipsoid 备用绘制
      viewer.entities.add({
        id: `fence-${fence.id}-sphere`,
        position: Cesium.Cartesian3.fromDegrees(center.lon, center.lat, center.height),
        ellipsoid: {
          radii: new Cesium.Cartesian3(radius, radius, radius),
          material: Cesium.Color.fromCssColorString('#fbbf24').withAlpha(fence.enabled ? 0.25 : 0.08),
          outline: false,
          fill: true,
          slicePartitions: 128,
          stackPartitions: 128,
        },
      })
    }
  } else if (type === 'line') {
    const points = fence.points || fencePoints
    if (!points || points.length < 2) return
    const { halfWidth, halfHeight } = params

    // 获取网格数据
    const cells = gridCells || lineGridCells

    // 绘制线段
    const positions = points.map(p =>
      Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.height)
    )
    viewer.entities.add({
      id: `fence-${fence.id}-line`,
      polyline: {
        positions: positions,
        width: 4,
        material: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(fence.enabled ? 1 : 0.3),
        depthFailMaterial: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(fence.enabled ? 1 : 0.3),
      },
    })

    // 如果有网格数据，绘制网格
    if (cells && cells.length > 0) {
      cells.forEach((cell, idx) => {
        // 获取地表高度用于判断
        const cartographic = Cesium.Cartographic.fromDegrees(
          (cell.minlon + cell.maxlon) / 2,
          (cell.minlat + cell.maxlat) / 2
        )
        let terrainHeight = 0
        try {
          terrainHeight = viewer.scene.globe.getHeight(cartographic) || 0
        } catch (e) {}

        // 只绘制高于地表的网格部分
        const isAboveGround = cell.bottom > terrainHeight || cell.top > terrainHeight

        if (isAboveGround) {
          // 顶面
          viewer.entities.add({
            id: `fence-${fence.id}-line-grid-top-${idx}`,
            polygon: {
              hierarchy: new Cesium.PolygonHierarchy([
                Cesium.Cartesian3.fromDegrees(cell.minlon, cell.minlat, cell.top),
                Cesium.Cartesian3.fromDegrees(cell.maxlon, cell.minlat, cell.top),
                Cesium.Cartesian3.fromDegrees(cell.maxlon, cell.maxlat, cell.top),
                Cesium.Cartesian3.fromDegrees(cell.minlon, cell.maxlat, cell.top),
              ]),
              material: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(fence.enabled ? 0.35 : 0.1),
              outline: true,
              outlineColor: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(fence.enabled ? 0.9 : 0.3),
              perPositionHeight: true,
            },
          })

          // 底面（只在高于地表时显示）
          if (cell.bottom > terrainHeight) {
            viewer.entities.add({
              id: `fence-${fence.id}-line-grid-bottom-${idx}`,
              polygon: {
                hierarchy: new Cesium.PolygonHierarchy([
                  Cesium.Cartesian3.fromDegrees(cell.minlon, cell.minlat, cell.bottom),
                  Cesium.Cartesian3.fromDegrees(cell.maxlon, cell.minlat, cell.bottom),
                  Cesium.Cartesian3.fromDegrees(cell.maxlon, cell.maxlat, cell.bottom),
                  Cesium.Cartesian3.fromDegrees(cell.minlon, cell.maxlat, cell.bottom),
                ]),
                material: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(fence.enabled ? 0.2 : 0.06),
                outline: true,
                outlineColor: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(fence.enabled ? 0.6 : 0.2),
                perPositionHeight: true,
              },
            })
          }
        }
      })
    }
  }
}

function removeFenceFromMap(fenceId) {
  if (!viewer) return

  const idsToRemove = [
    `fence-${fenceId}-center`,
    `fence-${fenceId}-sphere`,
    `fence-${fenceId}-line`,
  ]

  // 添加球体网格相关实体
  for (let i = 0; i < 200; i++) {
    idsToRemove.push(`fence-${fenceId}-grid-side-${i}`)
    idsToRemove.push(`fence-${fenceId}-grid-top-${i}`)
    idsToRemove.push(`fence-${fenceId}-grid-bottom-${i}`)
    idsToRemove.push(`fence-${fenceId}-grid-line-${i}`)
    idsToRemove.push(`fence-${fenceId}-line-grid-top-${i}`)
    idsToRemove.push(`fence-${fenceId}-line-grid-bottom-${i}`)
  }

  idsToRemove.forEach(id => {
    const entity = viewer.entities.getById(id)
    if (entity) {
      viewer.entities.remove(entity)
    }
  })
}

function toggleFenceVisibility(fence) {
  if (!viewer) return
  removeFenceFromMap(fence.id)
  fence.enabled = !fence.enabled
  drawFenceOnMap(fence)
}

function getFencePoints() {
  return [...fencePoints]
}

// ==================== 地图框选功能 ====================

function startBoxSelection() {
  if (!viewer || isBoxSelecting) return
  isBoxSelecting = true
  emit('box-select-start')

  // 禁用原有的地图点击
  if (handler) {
    handler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK)
  }

  // 创建框选手势处理
  boxSelectHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)

  // 鼠标按下
  boxSelectHandler.setInputAction((movement) => {
    boxSelectStartPos = movement.position.clone()
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN)

  // 鼠标移动（拖拽）
  boxSelectHandler.setInputAction((movement) => {
    if (!boxSelectStartPos || !isBoxSelecting) return

    // 清除之前的框选实体
    if (boxSelectEntity) {
      viewer.entities.remove(boxSelectEntity)
    }

    // 绘制新的框选矩形
    const startX = boxSelectStartPos.x
    const startY = boxSelectStartPos.y
    const endX = movement.endPosition.x
    const endY = movement.endPosition.y

    // 计算矩形的四个角
    const minX = Math.min(startX, endX)
    const maxX = Math.max(startX, endX)
    const minY = Math.min(startY, endY)
    const maxY = Math.max(startY, endY)

    // 转换屏幕坐标为经纬度
    const bottomLeft = viewer.scene.globe.pick(
      new Cesium.Cartesian2(minX, maxY),
      viewer.scene
    )
    const topRight = viewer.scene.globe.pick(
      new Cesium.Cartesian2(maxX, minY),
      viewer.scene
    )

    if (bottomLeft && topRight) {
      const bottomLeftCart = Cesium.Cartographic.fromCartesian(bottomLeft)
      const topRightCart = Cesium.Cartographic.fromCartesian(topRight)

      const west = Cesium.Math.toDegrees(bottomLeftCart.longitude)
      const south = Cesium.Math.toDegrees(bottomLeftCart.latitude)
      const east = Cesium.Math.toDegrees(topRightCart.longitude)
      const north = Cesium.Math.toDegrees(topRightCart.latitude)

      // 绘制框选矩形
      boxSelectEntity = viewer.entities.add({
        rectangle: {
          coordinates: Cesium.Rectangle.fromDegrees(west, south, east, north),
          material: Cesium.Color.fromCssColorString('#3b82f6').withAlpha(0.2),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#3b82f6'),
          outlineWidth: 2,
        },
      })
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

  // 鼠标释放
  boxSelectHandler.setInputAction((movement) => {
    if (!boxSelectStartPos || !isBoxSelecting) return

    const startX = boxSelectStartPos.x
    const startY = boxSelectStartPos.y
    const endX = movement.position.x
    const endY = movement.position.y

    // 判断是否有拖拽（框选）
    const dragDistance = Math.sqrt(
      Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2)
    )

    // 先停止框选状态
    stopBoxSelection()

    if (dragDistance > 10) {
      // 框选操作：转换坐标并发送
      const bottomLeft = viewer.scene.globe.pick(
        new Cesium.Cartesian2(Math.min(startX, endX), Math.max(startY, endY)),
        viewer.scene
      )
      const topRight = viewer.scene.globe.pick(
        new Cesium.Cartesian2(Math.max(startX, endX), Math.min(startY, endY)),
        viewer.scene
      )

      if (bottomLeft && topRight) {
        const bottomLeftCart = Cesium.Cartographic.fromCartesian(bottomLeft)
        const topRightCart = Cesium.Cartographic.fromCartesian(topRight)

        const bounds = {
          west: Cesium.Math.toDegrees(bottomLeftCart.longitude),
          south: Cesium.Math.toDegrees(bottomLeftCart.latitude),
          east: Cesium.Math.toDegrees(topRightCart.longitude),
          north: Cesium.Math.toDegrees(topRightCart.latitude),
        }

        // 发送边界数据
        emit('box-select-end', bounds)
      }
    }

    // 清理状态
    if (boxSelectEntity) {
      viewer.entities.remove(boxSelectEntity)
      boxSelectEntity = null
    }
    boxSelectStartPos = null
  }, Cesium.ScreenSpaceEventType.LEFT_UP)
}

function stopBoxSelection() {
  isBoxSelecting = false
  emit('box-select-end')

  // 清理框选处理器
  if (boxSelectHandler) {
    boxSelectHandler.destroy()
    boxSelectHandler = null
  }

  // 恢复原有的地图点击
  if (handler) {
    handler.setInputAction((movement) => {
      handleMouseClick(movement)
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
  }
}

function getIsBoxSelecting() {
  return isBoxSelecting
}

// 获取当前地图视图的边界范围
function getViewBounds() {
  if (!viewer) {
    console.log('[CesiumMap] getViewBounds: viewer 不存在')
    return null
  }

  const camera = viewer.camera
  const canvas = viewer.scene.canvas

  // 计算视图的四个角点
  const leftBottom = Cesium.Cartesian2.fromElements(0, canvas.height)
  const rightTop = Cesium.Cartesian2.fromElements(canvas.width, 0)

  // 获取左下角经纬度
  const bottomLeftCartesian = viewer.scene.globe.pick(
    camera.getPickRay(leftBottom),
    viewer.scene
  )
  // 获取右上角经纬度
  const topRightCartesian = viewer.scene.globe.pick(
    camera.getPickRay(rightTop),
    viewer.scene
  )

  let bounds = null

  // 如果能够获取到地球表面的点
  if (bottomLeftCartesian && topRightCartesian) {
    const bottomLeftCart = Cesium.Cartographic.fromCartesian(bottomLeftCartesian)
    const topRightCart = Cesium.Cartographic.fromCartesian(topRightCartesian)

    bounds = {
      west: Cesium.Math.toDegrees(bottomLeftCart.longitude),
      south: Cesium.Math.toDegrees(bottomLeftCart.latitude),
      east: Cesium.Math.toDegrees(topRightCart.longitude),
      north: Cesium.Math.toDegrees(topRightCart.latitude),
    }
  } else {
    // 备用方案：使用 camera.viewRectangle 获取相机的可视区域
    const rect = camera.computeViewRectangle()
    if (rect) {
      bounds = {
        west: Cesium.Math.toDegrees(rect.west),
        south: Cesium.Math.toDegrees(rect.south),
        east: Cesium.Math.toDegrees(rect.east),
        north: Cesium.Math.toDegrees(rect.north),
      }
    }
  }

  if (!bounds) {
    console.log('[CesiumMap] getViewBounds: 无法获取视图边界')
    return null
  }

  // 验证边界合理性
  if (bounds.west >= bounds.east || bounds.south >= bounds.north) {
    console.log('[CesiumMap] getViewBounds: 边界值不合法')
    return null
  }

  console.log('[CesiumMap] 获取视图边界:', bounds)
  return bounds
}

// 航线颜色（统一使用绿色）
const routeColor = { fill: '#10b981', outline: '#059669' }

// 绘制航线格网
function drawRouteGrid(routeId, pathData) {
  if (!viewer || !pathData || !Array.isArray(pathData)) {
    console.log('[CesiumMap] drawRouteGrid: viewer 或 pathData 不存在')
    return
  }

  console.log('[CesiumMap] 绘制航线格网:', routeId, '格网数量:', pathData.length)

  // 清除该航线之前的格网
  clearRouteGrid(routeId)

  // 遍历所有格网单元进行绘制
  pathData.forEach((grid, index) => {
    const { center, minlon, maxlon, minlat, maxlat, bottom, top, isStart, isEnd } = grid

    // 绘制格网框体
    const entityId = `route-grid-${routeId}-${index}`
    viewer.entities.add({
      id: entityId,
      rectangle: {
        coordinates: Cesium.Rectangle.fromDegrees(minlon, minlat, maxlon, maxlat),
        material: Cesium.Color.fromCssColorString(routeColor.fill).withAlpha(0.4),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString(routeColor.outline),
        outlineWidth: 2,
        height: bottom,
        extrudedHeight: top,
      },
      properties: {
        routeId,
        isStart: !!isStart,
        isEnd: !!isEnd,
      }
    })

    // 存储实体引用
    if (!routeGridEntities[routeId]) {
      routeGridEntities[routeId] = []
    }
    routeGridEntities[routeId].push(entityId)
  })

  // 飞行到航线区域（只在绘制第一条航线时飞行，避免多次切换视角）
  const existingRouteCount = Object.keys(routeGridEntities).filter(id => id !== routeId).length
  if (existingRouteCount === 0 && pathData.length > 0) {
    const firstGrid = pathData[0]
    if (firstGrid.center && firstGrid.center.length >= 2) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          firstGrid.center[0],
          firstGrid.center[1],
          (firstGrid.top || 100) + 2000
        ),
        duration: 1.5,
      })
    }
  }

  console.log('[CesiumMap] 航线格网绘制完成，当前航线数量:', Object.keys(routeGridEntities).length)

  // 强制渲染
  viewer.scene.requestRender()
}

// 清除航线格网
function clearRouteGrid(routeId) {
  if (!viewer || !routeId) return

  console.log('[CesiumMap] 清除航线格网:', routeId)

  // 直接遍历所有实体，删除匹配该航线的
  const idsToRemove = []
  viewer.entities.values.forEach(entity => {
    if (entity.id && entity.id.startsWith(`route-grid-${routeId}-`)) {
      idsToRemove.push(entity.id)
    }
  })

  console.log('[CesiumMap] 找到要清除的实体:', idsToRemove.length)

  idsToRemove.forEach(id => {
    try {
      viewer.entities.removeById(id)
    } catch (e) {
      console.warn('[CesiumMap] 清除实体失败:', id)
    }
  })

  // 清除存储
  delete routeGridEntities[routeId]

  // 强制渲染
  viewer.scene.requestRender()
}

// 清除所有航线格网
function clearAllRouteGrids() {
  if (!viewer) return

  console.log('[CesiumMap] 清除所有航线格网')

  // 直接遍历所有实体，删除所有航线格网
  const idsToRemove = []
  viewer.entities.values.forEach(entity => {
    if (entity.id && entity.id.startsWith('route-grid-')) {
      idsToRemove.push(entity.id)
    }
  })

  console.log('[CesiumMap] 清除所有航线格网，找到实体:', idsToRemove.length)

  idsToRemove.forEach(id => {
    try {
      viewer.entities.removeById(id)
    } catch (e) {
      console.warn('[CesiumMap] 清除实体失败:', id)
    }
  })

  // 清除存储
  Object.keys(routeGridEntities).forEach(id => delete routeGridEntities[id])

  // 强制渲染
  viewer.scene.requestRender()
}

// 创建格网标签画布
function createGridLabelCanvas(text) {
  const canvas = document.createElement('canvas')
  canvas.width = 120
  canvas.height = 40
  const ctx = canvas.getContext('2d')

  // 背景
  ctx.fillStyle = 'rgba(16, 185, 129, 0.9)'
  ctx.roundRect(0, 0, 120, 40, 6)
  ctx.fill()

  // 文字
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 14px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text.substring(0, 10), 60, 20)

  return canvas
}

// CanvasRenderingContext2D.roundRect polyfill
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (w < 2 * r) r = w / 2
    if (h < 2 * r) r = h / 2
    this.beginPath()
    this.moveTo(x + r, y)
    this.arcTo(x + w, y, x + w, y + h, r)
    this.arcTo(x + w, y + h, x, y + h, r)
    this.arcTo(x, y + h, x, y, r)
    this.arcTo(x, y, x + w, y, r)
    this.closePath()
    return this
  }
}

function drawEventVisualization(payload) {
  if (!viewer || !payload) return

  const removeIds = [
    'event-visual-point',
    'event-visual-point-label',
    'event-visual-grid',
    'event-visual-warning-area',
    'event-visual-warning-center',
    'event-visual-warning-center-label',
  ]
  removeIds.forEach((id) => {
    const entity = viewer.entities.getById(id)
    if (entity) viewer.entities.remove(entity)
  })

  const point = payload.eventPoint || {}
  const lon = Number(point.lon)
  const lat = Number(point.lat)
  const height = Number(point.height || 0)

  if (Number.isFinite(lon) && Number.isFinite(lat)) {
    viewer.entities.add({
      id: 'event-visual-point',
      position: Cesium.Cartesian3.fromDegrees(lon, lat, Number.isFinite(height) ? height : 0),
      point: {
        pixelSize: 12,
        color: Cesium.Color.RED,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
      },
    })
    viewer.entities.add({
      id: 'event-visual-point-label',
      position: Cesium.Cartesian3.fromDegrees(lon, lat, Number.isFinite(height) ? height : 0),
      label: {
        text: '事件位置',
        font: '14px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -18),
      },
    })
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, Math.max(1200, (Number.isFinite(height) ? height : 0) + 1200)),
      duration: 1.2,
    })
  }

  const grid = payload.grid || {}
  const bounds = grid.bounds || (grid.center && grid.center.length >= 4 ? { west: grid.center[0], south: grid.center[1], east: grid.center[2], north: grid.center[3] } : null)
  if (bounds && Number.isFinite(bounds.west) && Number.isFinite(bounds.south) && Number.isFinite(bounds.east) && Number.isFinite(bounds.north)) {
    viewer.entities.add({
      id: 'event-visual-grid',
      rectangle: {
        coordinates: Cesium.Rectangle.fromDegrees(bounds.west, bounds.south, bounds.east, bounds.north),
        material: Cesium.Color.fromCssColorString('#3b82f6').withAlpha(0.18),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#3b82f6'),
        outlineWidth: 2,
      },
    })
  }

  const warningArea = payload.warningArea || {}
  const radiusMeters = Number(warningArea.radiusMeters ?? warningArea.radius ?? warningArea.warningRadiusMeters)
  if (Number.isFinite(lon) && Number.isFinite(lat) && Number.isFinite(radiusMeters) && radiusMeters > 0) {
    viewer.entities.add({
      id: 'event-visual-warning-area',
      position: Cesium.Cartesian3.fromDegrees(lon, lat, Number.isFinite(height) ? height : 0),
      ellipse: {
        semiMajorAxis: radiusMeters,
        semiMinorAxis: radiusMeters,
        material: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.12),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.8),
      },
    })
  }

  // 绘制 warningArea 中心点
  const wc = payload.warningCenter || {}
  const wcLon = Number(wc.lon)
  const wcLat = Number(wc.lat)
  const wcHeight = Number(wc.height || 0)
  if (Number.isFinite(wcLon) && Number.isFinite(wcLat)) {
    viewer.entities.add({
      id: 'event-visual-warning-center',
      position: Cesium.Cartesian3.fromDegrees(wcLon, wcLat, Number.isFinite(wcHeight) ? wcHeight : 0),
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString('#f59e0b'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
    })
    viewer.entities.add({
      id: 'event-visual-warning-center-label',
      position: Cesium.Cartesian3.fromDegrees(wcLon, wcLat, Number.isFinite(wcHeight) ? wcHeight : 0),
      label: {
        text: '事件位置点',
        font: '14px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -16),
      },
    })
  }
}

function clearEventVisualization() {
  if (!viewer) return
  ;['event-visual-point', 'event-visual-point-label', 'event-visual-grid', 'event-visual-warning-area', 'event-visual-warning-center', 'event-visual-warning-center-label'].forEach((id) => {
    const entity = viewer.entities.getById(id)
    if (entity) viewer.entities.remove(entity)
  })
}

// ==================== 警戒区网格可视化 ====================

function drawWarningGridPoints(cells) {
  if (!viewer || !Array.isArray(cells)) return
  clearWarningGridPoints()

  cells.forEach((cell, index) => {
    const minlon = Number(cell.minlon)
    const maxlon = Number(cell.maxlon)
    const minlat = Number(cell.minlat)
    const maxlat = Number(cell.maxlat)
    const bottom = Number(cell.bottom ?? 0)
    const top = Number(cell.top ?? 0)

    if (Number.isFinite(minlon) && Number.isFinite(maxlon) && Number.isFinite(minlat) && Number.isFinite(maxlat)) {
      viewer.entities.add({
        id: `warning-grid-cell-${index}`,
        rectangle: {
          coordinates: Cesium.Rectangle.fromDegrees(minlon, minlat, maxlon, maxlat),
          material: Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.5),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#f59e0b'),
          outlineWidth: 2,
          height: bottom,
          extrudedHeight: top,
        },
      })
    }
  })
  console.log('[CesiumMap] 已绘制警戒区网格:', cells.length, '个')
}

function clearWarningGridPoints() {
  if (!viewer) return
  const entityIds = viewer.entities.values.map(e => e.id)
  entityIds.forEach(id => {
    if (id && id.startsWith('warning-grid-cell-')) {
      viewer.entities.removeById(id)
    }
  })
}

// ==================== 建筑白膜模型 ====================

async function loadBuildingModels() {
  if (buildingsLoaded && buildingModels.length > 0) {
    console.log('[CesiumMap] 建筑数据已加载，跳过重复加载')
    return { buildings: buildingModels, summary: {} }
  }
  if (buildingsLoading) {
    console.log('[CesiumMap] 建筑数据正在加载中...')
    return null
  }
  if (!viewer) {
    console.error('[CesiumMap] viewer 未初始化')
    return null
  }

  buildingsLoading = true
  console.log('[CesiumMap] 开始加载建筑白膜数据...')

  try {
    const result = await loadDeqingBuildings({
      shpUrl: '/deqing/deqing4.shp',
      dbfUrl: '/deqing/deqing4.dbf',
    })

    buildingModels = result.buildings
    buildingsLoaded = true
    buildingsVisible = true

    console.log('[CesiumMap] 建筑白膜数据加载完成:', result.summary)

    // 立即绘制（白色不透明）
    // 医院建筑（type===1）用浅红色半透明白膜，普通建筑为白色
    buildingEntityIds = drawBuildingModelsOnMap(viewer, buildingModels, {
      color: Cesium.Color.WHITE,
      opacity: 1,
      outline: false,
      showLabels: false,
      // 医院特殊样式：深红色不透明
      hospitalColor: Cesium.Color.fromCssColorString('#FF7788'),
      hospitalOpacity: 1,
      hospitalLabelFont: 'bold 14px sans-serif',
      hospitalLabelColor: Cesium.Color.YELLOW,
    })

    return result
  } catch (err) {
    console.error('[CesiumMap] 建筑白膜加载失败:', err)
    buildingsLoaded = false
    return null
  } finally {
    buildingsLoading = false
  }
}

// ==================== UAV 飞行动画 ====================

const uavAnimState = {
  items: [],
  frameId: null,
  running: false,
}

function startUavAnimation(pathData, routeId, flyCamera = true) {
  if (!viewer || !pathData || !Array.isArray(pathData) || pathData.length === 0) return

  const centers = []
  for (const grid of pathData) {
    if (grid.center && Array.isArray(grid.center) && grid.center.length >= 2) {
      const h = Number(grid.center[2])
        || ((Number(grid.top) || 0) + (Number(grid.bottom) || 0)) / 2
        || 120
      centers.push({
        lon: Number(grid.center[0]),
        lat: Number(grid.center[1]),
        height: h,
      })
    }
  }

  if (centers.length < 2) return

  const g0 = pathData[0]
  const cellLonSpan = Math.abs(Number(g0.maxlon) - Number(g0.minlon))
  const cellLatSpan = Math.abs(Number(g0.maxlat) - Number(g0.minlat))
  const midLatRad = ((Number(g0.minlat) + Number(g0.maxlat)) / 2) * Math.PI / 180
  const cellW = cellLonSpan * 111320 * Math.cos(midLatRad)
  const cellH = cellLatSpan * 110540
  const cellSize = Math.max(cellW, cellH, 1)
  const scale = Math.max(1, cellSize * 0.01)

  const anim = {
    routeId: routeId || null,
    centers,
    idx: 0,
    t: 0,
    pos: Cesium.Cartesian3.fromDegrees(centers[0].lon, centers[0].lat, centers[0].height),
    ori: Cesium.Quaternion.IDENTITY,
    entity: null,
    secondsPerGrid: 2,
    lastTime: performance.now(),
  }

  anim.entity = viewer.entities.add({
    id: `uav-sim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    position: new Cesium.CallbackProperty(() => anim.pos, false),
    orientation: new Cesium.CallbackProperty(() => anim.ori, false),
    model: {
      uri: '/DXY1.glb',
      scale,
      minimumPixelSize: 64,
      maximumScale: 50000,
    },
  })

  uavAnimState.items.push(anim)

  if (!uavAnimState.running) {
    uavAnimState.running = true
    uavAnimLoop()
  }

  if (flyCamera) {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        centers[0].lon,
        centers[0].lat,
        centers[0].height + cellSize * 3
      ),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-45),
        roll: 0,
      },
      duration: 1.5,
    })
  }
}

function uavAnimLoop() {
  if (!uavAnimState.running) return

  const now = performance.now()
  let active = false

  for (const a of uavAnimState.items) {
    if (a.idx >= a.centers.length - 1) continue

    active = true
    const dt = (now - a.lastTime) / 1000
    a.lastTime = now

    a.t += dt / a.secondsPerGrid

    while (a.t >= 1 && a.idx < a.centers.length - 1) {
      a.t -= 1
      a.idx++
    }

    if (a.idx >= a.centers.length - 1) {
      const last = a.centers[a.centers.length - 1]
      a.pos = Cesium.Cartesian3.fromDegrees(last.lon, last.lat, last.height)
      const hpr = new Cesium.HeadingPitchRoll(0, 0, 0)
      a.ori = Cesium.Transforms.headingPitchRollQuaternion(a.pos, hpr)
      continue
    }

    const from = a.centers[a.idx]
    const to = a.centers[a.idx + 1]

    const easeT = a.t * a.t * (3 - 2 * a.t)
    const lon = from.lon + (to.lon - from.lon) * easeT
    const lat = from.lat + (to.lat - from.lat) * easeT
    const h = from.height + (to.height - from.height) * easeT

    a.pos = Cesium.Cartesian3.fromDegrees(lon, lat, h)

    const dLonRad = (to.lon - from.lon) * Math.PI / 180
    const fromLatRad = from.lat * Math.PI / 180
    const toLatRad = to.lat * Math.PI / 180
    const heading = Math.atan2(
      Math.sin(dLonRad) * Math.cos(toLatRad),
      Math.cos(fromLatRad) * Math.sin(toLatRad)
        - Math.sin(fromLatRad) * Math.cos(toLatRad) * Math.cos(dLonRad)
    )
    const hpr = new Cesium.HeadingPitchRoll(heading, 0, 0)
    a.ori = Cesium.Transforms.headingPitchRollQuaternion(a.pos, hpr)
  }

  if (active) {
    uavAnimState.frameId = requestAnimationFrame(uavAnimLoop)
  } else {
    uavAnimState.running = false
    uavAnimState.frameId = null
  }
}

function stopUavAnimation() {
  uavAnimState.running = false

  if (uavAnimState.frameId) {
    cancelAnimationFrame(uavAnimState.frameId)
    uavAnimState.frameId = null
  }

  for (const a of uavAnimState.items) {
    if (viewer && a.entity) {
      viewer.entities.remove(a.entity)
    }
  }

  uavAnimState.items = []
}

function stopUavAnimationByRouteId(routeId) {
  if (!routeId) return
  const idx = uavAnimState.items.findIndex(a => a.routeId === routeId)
  if (idx < 0) return
  const anim = uavAnimState.items[idx]
  if (viewer && anim.entity) {
    viewer.entities.remove(anim.entity)
  }
  uavAnimState.items.splice(idx, 1)
  if (uavAnimState.items.length === 0) {
    uavAnimState.running = false
    if (uavAnimState.frameId) {
      cancelAnimationFrame(uavAnimState.frameId)
      uavAnimState.frameId = null
    }
  }
}

function getUavCurrentPosition(routeId) {
  if (!routeId) return null
  const anim = uavAnimState.items.find(a => a.routeId === routeId)
  if (!anim || !anim.pos) return null
  const cartographic = Cesium.Cartographic.fromCartesian(anim.pos)
  if (!cartographic) return null
  return [
    Number(Cesium.Math.toDegrees(cartographic.longitude).toFixed(6)),
    Number(Cesium.Math.toDegrees(cartographic.latitude).toFixed(6)),
    Number(cartographic.height.toFixed(1)),
  ]
}

function getScenarioFlightPosition() {
  if (!currentFlightAnim || !currentFlightAnim.pos || !viewer) return null
  try {
    const cartographic = Cesium.Cartographic.fromCartesian(currentFlightAnim.pos)
    if (!cartographic) return null
    return {
      lon: Number(Cesium.Math.toDegrees(cartographic.longitude).toFixed(6)),
      lat: Number(Cesium.Math.toDegrees(cartographic.latitude).toFixed(6)),
      height: Number(cartographic.height.toFixed(1)),
    }
  } catch (e) {
    return null
  }
}

defineExpose({
  flyToPoint,
  clearCenterPoint,
  drawGridBoundary,
  drawLinePath,
  drawPolygon,
  clearLineVisual,
  clearPolygonVisual,
  removeNoFlyZonePrism,
  clearGridVisual,
  toggle3DTiles,
  startDrawSphereFence,
  startDrawLineFence,
  completeSphereFence,
  completeLineFence,
  clearFenceDrawing,
  drawFenceOnMap,
  removeFenceFromMap,
  toggleFenceVisibility,
  clearFenceTempEntities,
  getFencePoints,
  drawRouteGrid,
  clearRouteGrid,
  clearAllRouteGrids,
  isMapReady,
  startBoxSelection,
  stopBoxSelection,
  getIsBoxSelecting,
  getViewBounds,
  drawEventVisualization,
  clearEventVisualization,
  drawWarningGridPoints,
  clearWarningGridPoints,
  startUavAnimation,
  stopUavAnimation,
  stopUavAnimationByRouteId,
  getUavCurrentPosition,
  getScenarioFlightPosition,
  // 建筑白膜模型
  loadBuildingModels,
  toggleBuildingsOnMap,
  // 底图图源切换
  setBaseLayer: selectBaseLayer,
  // 高程图源切换
  setTerrainSource: selectTerrainSource,
})

onMounted(async () => {
  try {
    // 配置 Cesium Ion Token
    Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJmZDBhNDFhZi1iZDZiLTQxOTItODBmNy0wNTM5MzNkNDE1MjciLCJpZCI6MzgzMjUyLCJpYXQiOjE3Njk0MDI3NjN9.Z7q5n75AghS4cysQLhuLx2_70MrUJLjgGTgrqEtcnyo'

    // 使用 Cesium 默认配置
    viewer = new Cesium.Viewer(cesiumEl.value, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      navigationHelpButton: false,
      shouldAnimate: true,
      requestRenderMode: false,      // 禁用请求渲染模式
      maximumRenderTimeChange: Infinity, // 允许无限时间变化
      // 默认使用项目内浙江 DEM；影像底图仍由现有图层管理。
      terrain: getTerrain(currentTerrainSource.value),
    })

    // 确保启用持续渲染
    viewer.scene.enableAutoRenderLoop = true
    viewer.scene.render()  // 初始渲染

    // 隐藏 Cesium 标志
    viewer.cesiumWidget.creditContainer.style.display = 'none'

    // 设置初始视角（中国区域）
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(120.0, 30.0, 5000000)
    })

    viewer.scene.globe.depthTestAgainstTerrain = false

    // 记录默认影像图层后，默认切换为天地图影像底图。
    initBaseLayers(viewer)
    switchBaseLayer(viewer, currentBaseLayer.value)

    tileset = await Cesium.Cesium3DTileset.fromUrl('/dq3dtiles/tileset.json')
    viewer.scene.primitives.add(tileset)
    await viewer.zoomTo(tileset)
  } catch (error) {
    console.error('[CesiumMap] 初始化错误:', error)
  }

  handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
  handler.setInputAction((movement) => {
    if (!viewer) return
    const cartesian = viewer.scene.pickPosition(movement.endPosition)
    if (!cartesian) {
      lon.value = null
      lat.value = null
      height.value = null
      return
    }

    const cartographic = Cesium.Cartographic.fromCartesian(cartesian)
    lon.value = Cesium.Math.toDegrees(cartographic.longitude)
    lat.value = Cesium.Math.toDegrees(cartographic.latitude)
    height.value = cartographic.height
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

  // 处理鼠标点击
  function handleMouseClick(movement) {
    if (!viewer) return

    // 如果处于场景演示模式且正在选择地点，交给场景演示处理
    if (scenarioState.active && scenarioState.dialogType === 'location') {
      handleScenarioMapClick(movement)
      return
    }

    // 获取点击位置的 cartesian 坐标
    const cartesian = viewer.scene.pickPosition(movement.position)
    if (!cartesian) return

    let pickedLon, pickedLat, pickedHeight

    // 尝试从 pickPosition 获取高度
    const cartographic = Cesium.Cartographic.fromCartesian(cartesian)
    pickedLon = Cesium.Math.toDegrees(cartographic.longitude)
    pickedLat = Cesium.Math.toDegrees(cartographic.latitude)
    pickedHeight = cartographic.height

    // 如果高度无效或为0，尝试从地形获取
    if (!pickedHeight || pickedHeight < 0 || !isFinite(pickedHeight)) {
      try {
        const terrainHeight = viewer.scene.globe.getHeight(cartographic)
        if (terrainHeight && isFinite(terrainHeight)) {
          pickedHeight = terrainHeight
        }
      } catch (e) {
        // 忽略错误
      }
    }

    // 确保高度有效且为正数
    if (!pickedHeight || pickedHeight <= 0 || !isFinite(pickedHeight)) {
      pickedHeight = 100
    }

    // 保留高精度小数位
    pickedLon = Number(pickedLon.toFixed(10))
    pickedLat = Number(pickedLat.toFixed(10))
    pickedHeight = Number(pickedHeight.toFixed(1))

    lon.value = pickedLon
    lat.value = pickedLat
    height.value = pickedHeight

    emit('point-selected', {
      lon: pickedLon,
      lat: pickedLat,
      height: pickedHeight,
    })
  }

  handler.setInputAction((movement) => {
    handleMouseClick(movement)
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  // 地图初始化完成
  isMapReady.value = true
  console.log('[CesiumMap] 地图初始化完成')

  // 比例尺：监听相机变化，随缩放实时更新（始终显示）
  viewer.camera.percentageChanged = 0.01
  viewer.camera.changed.addEventListener(scheduleScaleBarUpdate)
  // 动态缩放格网查询：同一 camera.changed 触发，400ms debounce
  viewer.camera.changed.addEventListener(scheduleViewBoundsEmit)
  // 初始化比例尺
  updateScaleBar()
})

onBeforeUnmount(() => {
  stopUavAnimation()
  if (scaleBarTimer) {
    clearTimeout(scaleBarTimer)
    scaleBarTimer = null
  }
  if (viewBoundsDebounceTimer) {
    clearTimeout(viewBoundsDebounceTimer)
    viewBoundsDebounceTimer = null
  }
  if (handler) {
    handler.destroy()
    handler = null
  }
  if (viewer) {
    viewer.destroy()
    viewer = null
  }
})
</script>

<template>
  <section class="cesium-map-container">
    <div ref="cesiumEl" class="cesium-viewer" />

    <!-- 鼠标位置信息 -->
    <div class="mouse-info">
      <div class="mouse-info-item">
        <span class="label">经度</span>
        <span class="value">{{ formatNum(lon, 6) }}</span>
      </div>
      <div class="mouse-info-item">
        <span class="label">纬度</span>
        <span class="value">{{ formatNum(lat, 6) }}</span>
      </div>
      <div class="mouse-info-item">
        <span class="label">高程</span>
        <span class="value">{{ formatNum(height, 2) }} m</span>
      </div>
    </div>

    <!-- 底图开关卡片（位于鼠标信息条右侧） -->
    <div class="bottom-bar">
      <div class="mouse-info">
        <div class="mouse-info-item">
          <span class="label">经度</span>
          <span class="value">{{ formatNum(lon, 6) }}</span>
        </div>
        <div class="mouse-info-item">
          <span class="label">纬度</span>
          <span class="value">{{ formatNum(lat, 6) }}</span>
        </div>
        <div class="mouse-info-item">
          <span class="label">高程</span>
          <span class="value">{{ formatNum(height, 2) }} m</span>
        </div>
      </div>

      <!-- 建筑白膜单行开关 -->
      <div class="single-toggle-card" @click="toggleBuildingsOnMap">
        <span class="layer-label">建筑白膜</span>
        <div class="toggle-switch" :class="{ active: showBuildings }">
          <div class="toggle-slider" />
        </div>
      </div>

      <!-- 一键场景演示按钮（飞行中显示取消按钮） -->
      <div v-if="showScenarioDemo && !scenarioState.flightActive" class="single-toggle-card scenario-demo-btn" @click="openScenarioDemo">
        <span class="layer-label">一键场景演示</span>
        <svg class="scenario-demo-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 12h4l3-9 4 18 3-9h4" />
        </svg>
      </div>
      <div v-else-if="showScenarioDemo" class="single-toggle-card scenario-demo-btn flight-cancel-btn" @click="cancelFlight">
        <span class="layer-label">取消飞行</span>
        <svg class="scenario-demo-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </div>

      <!-- 3D底图单行开关 -->
      <div v-if="props.show3DToggle" class="single-toggle-card" @click="toggle3DTiles">
        <span class="layer-label">3D底图</span>
        <div class="toggle-switch" :class="{ active: show3DTiles }">
          <div class="toggle-slider" />
        </div>
      </div>

      <!-- 底图图源切换卡片 -->
      <div class="single-toggle-card base-layer-card" @click.stop="showBaseLayerPanel = !showBaseLayerPanel; showTerrainPanel = false">
        <span class="layer-label">底图</span>
        <span class="base-layer-current">{{ baseLayerOptions.find(o => o.id === currentBaseLayer)?.label }}</span>
        <svg class="base-layer-chevron" :class="{ open: showBaseLayerPanel }" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <div v-if="showBaseLayerPanel" class="base-layer-panel" @click.stop>
          <div
            v-for="opt in baseLayerOptions"
            :key="opt.id"
            class="base-layer-option"
            :class="{ active: opt.id === currentBaseLayer }"
            @click="selectBaseLayer(opt.id)"
          >
            <span>{{ opt.label }}</span>
            <span v-if="opt.id === currentBaseLayer" class="base-layer-check">&#10003;</span>
          </div>
        </div>
      </div>

      <!-- 高程图源切换卡片 -->
      <div class="single-toggle-card base-layer-card" @click.stop="showTerrainPanel = !showTerrainPanel; showBaseLayerPanel = false">
        <span class="layer-label">高程</span>
        <span class="base-layer-current">{{ terrainSourceOptions.find(o => o.id === currentTerrainSource)?.label }}</span>
        <svg class="base-layer-chevron" :class="{ open: showTerrainPanel }" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <div v-if="showTerrainPanel" class="base-layer-panel" @click.stop>
          <div
            v-for="opt in terrainSourceOptions"
            :key="opt.id"
            class="base-layer-option"
            :class="{ active: opt.id === currentTerrainSource }"
            @click="selectTerrainSource(opt.id)"
          >
            <span>{{ opt.label }}</span>
            <span v-if="opt.id === currentTerrainSource" class="base-layer-check">&#10003;</span>
          </div>
        </div>
      </div>

      <!-- 点击面板外区域关闭图源选择面板 -->
      <div v-if="showBaseLayerPanel || showTerrainPanel" class="base-layer-mask" @click="showBaseLayerPanel = false; showTerrainPanel = false" />
    </div>

    <!-- 查询网格图例（右下角，支持多层级：层级+颜色+尺寸、运行时间） -->
    <div class="grid-result-legend" v-if="gridResultState.visible">
      <div class="legend-title">查询网格</div>
      <!-- 表头 -->
      <div class="legend-row legend-head">
        <span class="legend-swatch-col"></span>
        <span class="legend-level-col">层级</span>
        <span class="legend-size-col">格网尺寸</span>
      </div>
      <!-- 各级网格行 -->
      <div v-for="item in gridResultState.levels" :key="item.level" class="legend-row">
        <span class="legend-swatch legend-swatch-col" :style="{ background: item.color }" />
        <span class="legend-label legend-level-col">L{{ item.level }}</span>
        <span class="legend-size legend-size-col">{{ item.sizeLabel || '—' }}</span>
      </div>
      <div class="legend-divider" />
      <div class="legend-row legend-metric" v-if="gridResultState.runtime">
        <span>计算耗时</span>
        <span class="legend-value">{{ gridResultState.runtime }}</span>
      </div>
    </div>

    <!-- 比例尺（左下角，始终显示，独立于图例） -->
    <div class="ref-scale-bar" :style="{ left: `calc(${leftPanelWidth}px + 16px)` }" v-if="isMapReady">
      <div class="scale-track">
        <div class="scale-fill" :style="{ width: gridResultState.scalePixels + 'px' }" />
      </div>
      <div class="scale-label">{{ gridResultState.scaleLabel }}</div>
    </div>
  </section>

  <!-- 一键场景演示弹窗区域 -->
  <div v-if="scenarioState.showDialog">
    <!-- 步骤1: 场景介绍（右上角浮动卡片） -->
    <div v-if="scenarioState.dialogType === 'intro'" class="scenario-result-card intro">
      <div class="location-card-header">
        <div class="location-card-icon">&#x1F3E5;</div>
        <div class="location-card-title">医疗急救场景演示</div>
        <button class="location-card-close" @click="closeScenarioDemo">&#x2715;</button>
      </div>
      <div class="location-card-body">
        <div class="scenario-narrative">
          <div class="narrative-icon">&#x26A0;</div>
          <p class="narrative-text">
            紧急情况：某人在此处突发心脏骤停，需要紧急配送AED（自动体外除颤器）和急救药物！
          </p>
        </div>
        <div class="scenario-steps">
          <div class="step-item">
            <div class="step-number">1</div>
            <div class="step-content">从最近的医院/卫生室取回AED和药物</div>
          </div>
          <div class="step-item">
            <div class="step-number">2</div>
            <div class="step-content">以最高效的航线飞抵事发地点</div>
          </div>
          <div class="step-item">
            <div class="step-number">3</div>
            <div class="step-content">为伤者提供及时的急救支持</div>
          </div>
        </div>
        <div class="scenario-urgency">
          <div class="urgency-bar"></div>
          <span>这是一场与时间赛跑的生命救援</span>
          <div class="urgency-bar"></div>
        </div>
      </div>
      <div class="location-card-footer">
        <button class="scenario-btn cancel small" @click="closeScenarioDemo">取消</button>
        <button class="scenario-btn primary small" @click="nextScenarioStep">
          <span class="btn-icon">&#x25B6;</span>
          开始演示
        </button>
      </div>
    </div>

    <!-- 步骤3: 航线规划中（右上角浮动卡片） -->
    <div v-if="scenarioState.dialogType === 'planning'" class="scenario-result-card planning">
      <div class="location-card-header">
        <div class="location-card-icon">&#x2699;</div>
        <div class="location-card-title">航线规划中</div>
        <button class="location-card-close" @click="closeScenarioDemo">&#x2715;</button>
      </div>
      <div class="location-card-body">
        <div class="planning-status">
          <div class="planning-spinner"></div>
          <p>正在执行航线规划...</p>
          <div class="planning-steps">
            <div class="planning-step active">
              <span class="step-check">&#x2714;</span>
              <span>查找最近医院</span>
            </div>
            <div class="planning-step active">
              <span class="step-spin"></span>
              <span>规划航线</span>
            </div>
            <div class="planning-step">
              <span class="step-pending">&#x25CB;</span>
              <span>检测冲突</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 步骤4: 结果展示（右上角浮动卡片） -->
    <div v-if="scenarioState.dialogType === 'result'" class="scenario-result-card">
      <div class="location-card-header success">
        <div class="location-card-icon">&#x2705;</div>
        <div class="location-card-title">航线规划成功</div>
        <button class="location-card-close" @click="resetScenarioDemo">&#x2715;</button>
      </div>
      <div class="location-card-body">
        <div class="result-summary">
          <p>已找到最近医院并成功规划航线：</p>
          <div class="result-info">
            <div class="info-row">
              <span class="info-label">医院位置</span>
              <span class="info-value">
                {{ scenarioState.nearestHospital?.lon.toFixed(6) }}, {{ scenarioState.nearestHospital?.lat.toFixed(6) }}
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">事故位置</span>
              <span class="info-value">
                {{ scenarioState.incidentLocation?.lon.toFixed(6) }}, {{ scenarioState.incidentLocation?.lat.toFixed(6) }}
              </span>
            </div>
          </div>
          <div class="result-success-badge">
            <span>&#x2714;</span> 航线已生成，允许放飞无人机
          </div>
        </div>
      </div>
      <div class="location-card-footer">
        <button class="scenario-btn primary small" @click="releaseDrone">
          <span class="btn-icon">&#x2708;</span>
          放飞无人机
        </button>
      </div>
    </div>

    <!-- 步骤5: 冲突提示（右上角浮动卡片） -->
    <div v-if="scenarioState.dialogType === 'conflict'" class="scenario-result-card conflict">
      <div class="location-card-header warning">
        <div class="location-card-icon">&#x26A0;</div>
        <div class="location-card-title">航线冲突警告</div>
        <button class="location-card-close" @click="resetScenarioDemo">&#x2715;</button>
      </div>
      <div class="location-card-body">
        <div class="conflict-info">
          <p>检测到直线航线存在冲突：</p>
          <div class="conflict-reason">
            {{ scenarioState.conflictResult?.reason || '检测到障碍物' }}
          </div>
          <p class="conflict-question">是否启用 A* 智能航路规划绕开障碍物？</p>
        </div>
      </div>
      <div class="location-card-footer">
        <button class="scenario-btn cancel small" @click="resetScenarioDemo">取消</button>
        <button class="scenario-btn primary warning small" @click="startAstarPlanning">
          <span class="btn-icon">&#x2699;</span>
          开启A*规划
        </button>
      </div>
    </div>

    <!-- 步骤2: 选择出事地点（右上角浮动卡片） -->
    <div v-if="scenarioState.dialogType === 'location'" class="scenario-location-card">
      <div class="location-card-header">
        <div class="location-card-icon">&#x1F4CD;</div>
        <div class="location-card-title">选择事发地点</div>
        <button class="location-card-close" @click="closeScenarioDemo">&#x2715;</button>
      </div>
      <div class="location-card-body">
        <p class="location-card-hint">
          请在地图<strong>红圈范围内</strong>点击选择事故地点
        </p>
        <div class="location-card-coords">
          <div class="coords-center">
            中心: <strong>({{ SCENARIO_CENTER.lon }}, {{ SCENARIO_CENTER.lat }})</strong>
          </div>
          <div class="coords-radius">
            范围: <strong>{{ SCENARIO_RADIUS_KM }} 公里</strong>
          </div>
        </div>
        <div v-if="scenarioState.incidentLocation" class="location-card-selected">
          <div class="selected-check">&#x2705;</div>
          <div class="selected-info">
            <span class="selected-label">已选择</span>
            <span class="selected-lon">经度: {{ scenarioState.incidentLocation.lon.toFixed(6) }}</span>
            <span class="selected-lat">纬度: {{ scenarioState.incidentLocation.lat.toFixed(6) }}</span>
          </div>
        </div>
        <div v-else class="location-card-waiting">
          <div class="mini-pulse"></div>
          <span>点击地图选择位置</span>
        </div>
      </div>
      <div class="location-card-footer">
        <button class="scenario-btn cancel small" @click="prevScenarioStep">返回</button>
        <button class="scenario-btn primary small" :disabled="!scenarioState.incidentLocation" @click="nextScenarioStep">
          下一步 &#x25B6;
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cesium-map-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 0;
}

.cesium-viewer {
  width: 100%;
  height: 100%;
}

.mouse-info {
  display: flex;
  gap: 16px;
  padding: 10px 16px;
  background: rgba(15, 23, 42, 0.85);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.bottom-bar {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 20px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.single-toggle-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(15, 23, 42, 0.85);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: all 0.2s ease;
}

.single-toggle-card:hover {
  background: rgba(15, 23, 42, 0.95);
  border-color: rgba(59, 130, 246, 0.4);
}

.mouse-info-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mouse-info-item .label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.mouse-info-item .value {
  font-size: 13px;
  font-family: 'SF Mono', 'Monaco', monospace;
  font-variant-numeric: tabular-nums;
  color: #fff;
}

/* 底图开关卡片 */
/* 已废弃，保持兼容 */

.layer-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}

.toggle-switch {
  position: relative;
  width: 36px;
  height: 20px;
  background: rgba(100, 116, 139, 0.5);
  border-radius: 10px;
  transition: background 0.3s ease;
}

.toggle-switch.active {
  background: rgba(59, 130, 246, 0.7);
}

.toggle-slider {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.3s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.toggle-switch.active .toggle-slider {
  transform: translateX(16px);
}

/* ==================== 底图图源切换 ==================== */

.base-layer-card {
  position: relative;
}

.base-layer-current {
  font-size: 12px;
  color: #60a5fa;
  min-width: 24px;
  text-align: center;
}

.base-layer-chevron {
  color: rgba(255, 255, 255, 0.6);
  transition: transform 0.2s ease;
}

.base-layer-chevron.open {
  transform: rotate(180deg);
}

.base-layer-panel {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  min-width: 96px;
  padding: 6px;
  background: rgba(15, 23, 42, 0.95);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  z-index: 30;
}

.base-layer-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.base-layer-option:hover {
  background: rgba(59, 130, 246, 0.2);
  color: #fff;
}

.base-layer-option.active {
  color: #60a5fa;
}

.base-layer-check {
  font-size: 11px;
}

.base-layer-mask {
  position: fixed;
  inset: 0;
  z-index: 20;
}

/* ==================== 一键场景演示样式 ==================== */

/* 场景演示按钮样式 */
.scenario-demo-btn {
  background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%) !important;
  border-color: #f87171 !important;
}

.scenario-demo-btn:hover {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%) !important;
  border-color: #fca5a5 !important;
  transform: scale(1.02);
}

.flight-cancel-btn {
  background: linear-gradient(135deg, #d97706 0%, #b45309 100%) !important;
  border-color: #fbbf24 !important;
  cursor: pointer;
}

.flight-cancel-btn:hover {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%) !important;
  border-color: #fcd34d !important;
}

.scenario-demo-icon {
  color: #ffffff;
  font-size: 14px;
}

/* 弹窗遮罩层（透明，不影响地图操作） */
.scenario-dialog-overlay {
  position: fixed;
  inset: 0;
  background: transparent;
  pointer-events: none;
  z-index: 9998;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 地点选择时的透明覆盖层（不阻挡地图但确保卡片在最上层） */
.scenario-location-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  pointer-events: none;
}

/* 弹窗主体 */
.scenario-dialog {
  width: min(520px, 92vw);
  background: linear-gradient(145deg, #1e293b 0%, #0f172a 100%);
  border-radius: 16px;
  border: 2px solid #3b82f6;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6), 0 0 40px rgba(59, 130, 246, 0.15);
  overflow: hidden;
  animation: slideUp 0.4s ease;
}

.scenario-dialog.success {
  border-color: #10b981;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6), 0 0 40px rgba(16, 185, 129, 0.15);
}

.scenario-dialog.warning {
  border-color: #f59e0b;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6), 0 0 40px rgba(245, 158, 11, 0.15);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(30px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* 弹窗头部 */
.scenario-dialog-header {
  padding: 24px;
  background: linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.scenario-dialog-header.success {
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
}

.scenario-dialog-header.warning {
  background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
}

.scenario-header-icon {
  font-size: 28px;
}

.scenario-header-title {
  font-size: 20px;
  font-weight: bold;
  color: white;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

/* 弹窗内容 */
.scenario-dialog-body {
  padding: 24px;
  color: #e2e8f0;
  line-height: 1.8;
}

/* 叙述文本 */
.scenario-narrative {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 20px;
}

.narrative-icon {
  font-size: 24px;
  margin-bottom: 8px;
}

.narrative-text {
  font-size: 15px;
  color: #fca5a5;
  margin: 0;
}

/* 步骤列表 */
.scenario-steps {
  margin: 20px 0;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.step-number {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 14px;
  color: white;
  flex-shrink: 0;
}

.step-content {
  font-size: 14px;
  color: #cbd5e1;
}

/* 紧急提示条 */
.scenario-urgency {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: linear-gradient(90deg, rgba(239, 68, 68, 0.2), rgba(239, 68, 68, 0.3), rgba(239, 68, 68, 0.2));
  border-radius: 8px;
  margin-top: 20px;
}

.urgency-bar {
  flex: 1;
  height: 2px;
  background: linear-gradient(90deg, transparent, #ef4444, transparent);
}

.scenario-urgency span {
  font-size: 13px;
  color: #fca5a5;
  font-weight: 500;
  white-space: nowrap;
}

/* 位置选择说明 */
.location-instruction {
  font-size: 16px;
  text-align: center;
  margin-bottom: 16px;
}

.location-hint {
  margin: 16px 0;
}

.hint-box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 12px;
}

.hint-icon {
  font-size: 24px;
}

.hint-text {
  font-size: 14px;
  color: #93c5fd;
}

/* 已选位置显示 */
.location-selected {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 12px;
  padding: 16px;
  margin-top: 16px;
}

.selected-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.selected-icon {
  font-size: 18px;
}

.selected-badge span {
  font-weight: bold;
  color: #6ee7b7;
}

.selected-coords {
  display: flex;
  gap: 24px;
}

.coord-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.coord-label {
  font-size: 12px;
  color: #64748b;
}

.coord-value {
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 14px;
  color: #10b981;
  font-weight: bold;
}

/* 等待动画 */
.location-waiting {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 24px;
  color: #64748b;
}

.waiting-animation {
  position: relative;
  width: 60px;
  height: 60px;
}

.pulse-ring {
  position: absolute;
  inset: 0;
  border: 3px solid rgba(59, 130, 246, 0.3);
  border-radius: 50%;
  animation: pulse 1.5s ease-out infinite;
}

.pulse-dot {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 12px;
  height: 12px;
  background: #3b82f6;
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

@keyframes pulse {
  0% {
    transform: scale(0.5);
    opacity: 1;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

/* 规划中状态 */
.planning-status {
  text-align: center;
}

.planning-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid rgba(59, 130, 246, 0.2);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.planning-steps {
  margin-top: 24px;
  text-align: left;
}

.planning-step {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  color: #64748b;
}

.planning-step.active {
  color: #3b82f6;
}

.step-check {
  color: #10b981;
}

.step-spin {
  animation: spin 1s linear infinite;
}

.step-pending {
  color: #475569;
}

/* 结果展示 */
.result-summary p {
  text-align: center;
  margin-bottom: 16px;
}

.result-info {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 12px;
  padding: 16px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid rgba(16, 185, 129, 0.2);
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  color: #64748b;
  font-size: 14px;
}

.info-value {
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 13px;
  color: #6ee7b7;
}

.result-success-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
  padding: 12px;
  background: rgba(16, 185, 129, 0.2);
  border-radius: 8px;
  color: #6ee7b7;
  font-weight: bold;
}

/* 冲突提示 */
.conflict-info {
  text-align: center;
}

.conflict-reason {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 8px;
  padding: 12px;
  margin: 16px 0;
  color: #fbbf24;
  font-family: monospace;
}

.conflict-question {
  margin-top: 16px;
  color: #fcd34d;
}

/* 弹窗底部按钮 */
.scenario-dialog-footer {
  padding: 16px 24px;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
}

.scenario-btn {
  padding: 12px 28px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
  display: flex;
  align-items: center;
  gap: 8px;
}

.scenario-btn .btn-icon {
  font-size: 12px;
}

.scenario-btn.cancel {
  background: rgba(100, 116, 139, 0.2);
  color: #94a3b8;
  border: 1px solid rgba(100, 116, 139, 0.4);
}

.scenario-btn.cancel:hover {
  background: rgba(100, 116, 139, 0.4);
  color: #cbd5e1;
}

.scenario-btn.primary {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
}

.scenario-btn.primary:hover {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
}

.scenario-btn.primary.warning {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  box-shadow: 0 4px 15px rgba(245, 158, 11, 0.3);
}

.scenario-btn.primary.warning:hover {
  background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
  box-shadow: 0 6px 20px rgba(245, 158, 11, 0.4);
}

.scenario-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
}

/* ==================== 角落浮动选择卡片 ==================== */

.scenario-location-card {
  position: fixed;
  top: 80px;
  right: 20px;
  width: 280px;
  background: linear-gradient(145deg, #1e293b 0%, #0f172a 100%);
  border-radius: 12px;
  border: 2px solid #3b82f6;
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.5), 0 0 20px rgba(59, 130, 246, 0.15);
  overflow: hidden;
  z-index: 9999;
  animation: slideInRight 0.3s ease;
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.location-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%);
}

.location-card-icon {
  font-size: 18px;
}

.location-card-title {
  flex: 1;
  font-size: 14px;
  font-weight: bold;
  color: white;
}

.location-card-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 16px;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
}

.location-card-close:hover {
  color: white;
}

/* ==================== 结果展示卡片 ==================== */
.scenario-result-card {
  position: fixed;
  top: 80px;
  right: 20px;
  width: 300px;
  background: linear-gradient(145deg, #1e293b 0%, #0f172a 100%);
  border-radius: 12px;
  border: 2px solid #10b981;
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.5), 0 0 20px rgba(16, 185, 129, 0.15);
  overflow: hidden;
  z-index: 9999;
  animation: slideInRight 0.3s ease;
}

.scenario-result-card.conflict {
  border-color: #f59e0b;
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.5), 0 0 20px rgba(245, 158, 11, 0.15);
}

.scenario-result-card .location-card-header.success {
  background: linear-gradient(90deg, rgba(16, 185, 129, 0.3), transparent);
  border-bottom: 1px solid rgba(16, 185, 129, 0.3);
}

.scenario-result-card .location-card-header.warning {
  background: linear-gradient(90deg, rgba(245, 158, 11, 0.3), transparent);
  border-bottom: 1px solid rgba(245, 158, 11, 0.3);
}

.scenario-result-card .location-card-body {
  padding: 14px;
}

.scenario-result-card .result-summary p {
  font-size: 13px;
  color: #e2e8f0;
  margin: 0 0 10px 0;
}

.scenario-result-card .result-success-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: #10b981;
}

.scenario-result-card .conflict-info p {
  font-size: 13px;
  color: #e2e8f0;
  margin: 0 0 8px 0;
}

.scenario-result-card .conflict-reason {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 12px;
  color: #fca5a5;
  margin-bottom: 10px;
}

.scenario-result-card .conflict-question {
  font-size: 12px;
  color: #fbbf24;
  font-weight: 500;
}

.location-card-body {
  padding: 14px;
}

.location-card-hint {
  font-size: 13px;
  color: #e2e8f0;
  margin: 0 0 12px 0;
  text-align: center;
}

.location-card-hint strong {
  color: #ff6b6b;
}

.location-card-coords {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #93c5fd;
}

.coords-center, .coords-radius {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
}

.coords-center strong, .coords-radius strong {
  color: #3b82f6;
}

.location-card-selected {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 8px;
  padding: 10px;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.selected-check {
  font-size: 24px;
}

.selected-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.selected-label {
  font-size: 12px;
  color: #10b981;
  font-weight: bold;
}

.selected-lon, .selected-lat {
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 11px;
  color: #6ee7b7;
}

.location-card-waiting {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  color: #64748b;
  font-size: 13px;
}

.mini-pulse {
  width: 16px;
  height: 16px;
  background: #3b82f6;
  border-radius: 50%;
  animation: miniPulse 1.5s ease-in-out infinite;
}

@keyframes miniPulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.3);
    opacity: 0.6;
  }
}

.location-card-footer {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
}

.scenario-btn.small {
  padding: 8px 16px;
  font-size: 13px;
  flex: 1;
  justify-content: center;
}

/* ==================== 查询网格图例 + 比例尺 ==================== */
.grid-result-legend {
  position: absolute;
  right: 16px;
  bottom: 20px;
  padding: 10px 14px;
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  pointer-events: none;
  min-width: 180px;
  z-index: 5;
  backdrop-filter: blur(6px);
}
.legend-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #fff;
  letter-spacing: 0.5px;
}
/* 表头行 */
.legend-row.legend-head {
  color: rgba(255, 255, 255, 0.55);
  font-size: 11px;
  margin-bottom: 4px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.legend-row {
  display: grid;
  grid-template-columns: 20px 46px 1fr;
  align-items: center;
  gap: 6px;
  margin: 4px 0;
}
.legend-swatch {
  width: 16px;
  height: 10px;
  border-radius: 2px;
  display: inline-block;
  border: 1px solid rgba(255, 255, 255, 0.3);
}
.legend-swatch-col { justify-self: start; }
.legend-level-col { justify-self: start; }
.legend-size-col { justify-self: start; }
.legend-label {
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 12px;
  color: #fff;
  font-weight: 500;
}
.legend-size {
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
}
.legend-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 6px 0;
}
.legend-row.legend-metric {
  display: flex;
  justify-content: space-between;
  grid-template-columns: none;
  color: rgba(255, 255, 255, 0.75);
  font-size: 11px;
}
.legend-row.legend-metric .legend-value {
  color: #fff;
  font-weight: 600;
  font-family: 'SF Mono', 'Monaco', monospace;
}
.legend-hint { color: rgba(255,255,255,0.55); font-size: 10px; }

.ref-scale-bar {
  position: absolute;
  bottom: 20px;
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  z-index: 5;
  pointer-events: none;
}
.scale-track {
  width: 120px;
  height: 6px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  position: relative;
}
.scale-fill {
  position: absolute;
  left: 0; top: 0;
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #fff);
  border-radius: 3px;
  max-width: 100%;
}
.scale-label {
  margin-top: 4px;
  font-size: 11px;
  font-family: 'SF Mono', 'Monaco', monospace;
  color: #fff;
  text-align: center;
}
</style>
