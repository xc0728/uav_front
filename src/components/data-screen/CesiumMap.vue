<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as Cesium from 'cesium'

const cesiumEl = ref(null)
let viewer = null
let handler = null

const lon = ref(null)
const lat = ref(null)
const height = ref(null)

const emit = defineEmits(['point-selected'])

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
  if (!viewer || !gridInfo) return

  // 先清除之前的网格边界和中心点
  clearGridVisual()

  // 检查是否是多个网格（cells 数组）
  if (gridInfo.cells && Array.isArray(gridInfo.cells) && gridInfo.cells.length > 0) {
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

      // 绘制每个网格边界
      const cellId = `grid-boundary-${index}`
      viewer.entities.add({
        id: cellId,
        rectangle: {
          coordinates: Cesium.Rectangle.fromDegrees(west, south, east, north),
          material: Cesium.Color.fromCssColorString('#3b82f6').withAlpha(0.25),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#3b82f6'),
          outlineWidth: 2,
          height: bottom,
          extrudedHeight: top,
        },
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

defineExpose({
  flyToPoint,
  clearCenterPoint,
  drawGridBoundary,
  drawLinePath,
  drawPolygon,
  clearLineVisual,
  clearPolygonVisual,
  clearGridVisual,
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
  })

  // 隐藏 Cesium 标志
  viewer.cesiumWidget.creditContainer.style.display = 'none'

  // 设置初始视角（中国区域）
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(120.0, 30.0, 5000000)
  })

  viewer.scene.globe.depthTestAgainstTerrain = false

  try {
    const tileset = await Cesium.Cesium3DTileset.fromUrl('/dq3dtiles/tileset.json')
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

  handler.setInputAction((movement) => {
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

    // 确保高度有效且为正数（地形高度不能为负或0）
    // 如果高度无效或为0，使用默认高度 100 米
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
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
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
</style>