<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as Cesium from 'cesium'

// 模块级别的存储（持久化，不随组件销毁而丢失）
const routeGridEntities = {}

const cesiumEl = ref(null)
let viewer = null
let handler = null
let tileset = null

const lon = ref(null)
const lat = ref(null)
const height = ref(null)
const show3DTiles = ref(true)
const isMapReady = ref(false) // 地图是否准备就绪

// 电子围栏绘制状态
let fenceDrawHandler = null
let fencePoints = []
let fenceDrawingMode = null // 'sphere' | 'line'
let fenceParams = null
let fenceTempEntities = [] // 临时绘制的实体
let sphereGridCells = [] // 球形围栏网格数据
let lineGridCells = [] // 线状围栏网格数据
const onFenceConfirmCallback = ref(null)

const emit = defineEmits(['point-selected', 'fence-confirm', 'box-select-start', 'box-select-end', 'get-view-bounds'])

// 框选相关变量
let isBoxSelecting = false
let boxSelectHandler = null
let boxSelectStartPos = null
let boxSelectEntity = null

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

function drawGridBoundary(gridInfo) {
  if (!viewer || !gridInfo) {
    console.log('[CesiumMap] drawGridBoundary: viewer 或 gridInfo 不存在')
    return
  }

  console.log('[CesiumMap] drawGridBoundary gridInfo:', JSON.stringify(gridInfo).slice(0, 500))

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
      if (!cell.bounds) return
      const { north, south, east, west, top = 0, bottom = 0 } = cell.bounds

      // 更新边界范围
      minLon = Math.min(minLon, west)
      maxLon = Math.max(maxLon, east)
      minLat = Math.min(minLat, south)
      maxLat = Math.max(maxLat, north)
      minHeight = Math.min(minHeight, bottom)
      maxHeight = Math.max(maxHeight, top)

      // 使用格网携带的颜色，如果没有则使用默认颜色
      const cellColor = cell.color || '#3b82f6'
      const cellLevel = cell.level

      // 前5个格网输出调试信息
      if (index < 5) {
        console.log(`[CesiumMap] 格网${index + 1}: color=${cellColor}, level=${cellLevel}, bounds=(W:${west.toFixed(6)}, S:${south.toFixed(6)}, E:${east.toFixed(6)}, N:${north.toFixed(6)})`)
      }

      // 绘制每个网格边界
      const cellId = `grid-boundary-${index}`
      viewer.entities.add({
        id: cellId,
        rectangle: {
          coordinates: Cesium.Rectangle.fromDegrees(west, south, east, north),
          material: Cesium.Color.fromCssColorString(cellColor).withAlpha(0.5),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString(cellColor),
          outlineWidth: 2,
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

      // 飞行到网格区域中心位置
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, centerHeight + 3000),
        duration: 1.5,
      })
    }

    console.log('[CesiumMap] 已绘制多个网格边界:', gridInfo.cells.length)
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

  // 飞行到网格中心位置
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, centerHeight + 2000),
    duration: 1.5,
  })

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
        depthFailMaterial: lineColor,
        clampToGround: false,
      },
    })
  }
}

function drawPolygon(polygonPoints) {
  if (!viewer) return
  clearPolygonVisual()

  // 处理新格式：{ outer: [...], holes: [...], currentHole: [...], drawingMode: 'outer'|'hole' }
  // 或旧格式：Array of points

  // 如果是对象格式（新格式带洞）
  if (polygonPoints && typeof polygonPoints === 'object' && !Array.isArray(polygonPoints)) {
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
  })
}

function clearGridVisual() {
  if (!viewer) return

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

defineExpose({
  flyToPoint,
  clearCenterPoint,
  drawGridBoundary,
  drawLinePath,
  drawPolygon,
  clearLineVisual,
  clearPolygonVisual,
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
})

onMounted(async () => {
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

  try {
    tileset = await Cesium.Cesium3DTileset.fromUrl('/dq3dtiles/tileset.json')
    viewer.scene.primitives.add(tileset)
    await viewer.zoomTo(tileset)
  } catch (error) {
    console.error('Failed to load local 3D Tiles:', error)
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
})

onBeforeUnmount(() => {
  if (handler) {
    handler.destroy()
    handler = null
  }
  if (viewer) {
    viewer.destroy()
    viewer = null
  }
  // 注意：不清除 routeGridEntities，保持数据持久化
  // 当组件重新挂载时，CesiumMap 会使用这些数据来管理已绘制的航线
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

    <!-- 3D底图开关 -->
    <div class="tileset-toggle" @click="toggle3DTiles">
      <span class="toggle-label">3D底图</span>
      <div class="toggle-switch" :class="{ active: show3DTiles }">
        <div class="toggle-slider" />
      </div>
    </div>
  </section>
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
  position: absolute;
  right: 20px;
  bottom: 20px;
  display: flex;
  gap: 16px;
  padding: 10px 16px;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(10px);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}.mouse-info-item {
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

/* 3D底图滑动开关 */
.tileset-toggle {
  position: absolute;
  right: 20px;
  bottom: 70px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(10px);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  cursor: pointer;
  user-select: none;
  transition: all 0.2s ease;
}

.tileset-toggle:hover {
  background: rgba(15, 23, 42, 0.95);
  border-color: rgba(59, 130, 246, 0.4);
}

.toggle-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
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
</style>