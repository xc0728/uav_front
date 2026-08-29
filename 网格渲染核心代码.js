/**
5个网格渲染核心函数
initCesiumMap(dom)
初始化地图
drawGridBoundary(gridInfo)
核心渲染函数，单个/批量网格都支持
clearGridVisual()
清除网格
loadAndRenderGrid(lon, lat, level)
查询并渲染单个网格
loadAndRenderGridBatch(cellsData)
批量渲染多个网格 
*/

import * as Cesium from 'cesium'

let viewer = null

// ──────────────────────────────────────────────
/**
 * 初始化 Cesium 地图
 */
function initCesiumMap(domElement) {
  viewer = new Cesium.Viewer(domElement, {
    terrain: Cesium.createWorldTerrain(),
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
  })

  // 飞至德清县
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(119.97, 30.54, 5000),
    duration: 0,
  })
}


// ──────────────────────────────────────────────
/**
 * 绘制网格边界（核心函数）
 *
 * gridInfo 支持两种格式：
 *
 * 格式一（单个网格）:
 * {
 *   center: { longitude, latitude },
 *   bounds: { north, south, east, west, top, bottom }
 * }
 *
 * 格式二（多个网格）:
 * {
 *   cells: [
 *     { code, bounds: { north, south, east, west, top, bottom }, color, level },
 *     ...
 *   ]
 * }
 */
function drawGridBoundary(gridInfo) {
  if (!viewer || !gridInfo) return

  clearGridVisual()

  // ── 批量网格 ──
  if (gridInfo.cells && Array.isArray(gridInfo.cells) && gridInfo.cells.length > 0) {
    let minLon = Infinity, maxLon = -Infinity
    let minLat = Infinity, maxLat = -Infinity
    let minH = Infinity, maxH = -Infinity

    gridInfo.cells.forEach((cell, index) => {
      if (!cell.bounds) return
      const { north, south, east, west, top = 0, bottom = 0 } = cell.bounds

      minLon = Math.min(minLon, west)
      maxLon = Math.max(maxLon, east)
      minLat = Math.min(minLat, south)
      maxLat = Math.max(maxLat, north)
      minH = Math.min(minH, bottom)
      maxH = Math.max(maxH, top)

      const cellColor = cell.color || '#3b82f6'

      viewer.entities.add({
        id: `grid-boundary-${index}`,
        rectangle: {
          coordinates: Cesium.Rectangle.fromDegrees(
            west - 0.000001,
            south - 0.000001,
            east + 0.000001,
            north + 0.000001
          ),
          material: Cesium.Color.fromCssColorString(cellColor).withAlpha(0.5),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString(cellColor),
          outlineWidth: 1,
          height: bottom,
          extrudedHeight: top,
        },
      })
    })

    if (minLon !== Infinity) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          (minLon + maxLon) / 2,
          (minLat + maxLat) / 2,
          (minH + maxH) / 2 + 3000
        ),
        duration: 1.5,
      })
    }
    return
  }

  // ── 单个网格 ──
  const { center, bounds } = gridInfo
  if (!bounds) return
  const { north, south, east, west, top = 0, bottom = 0 } = bounds
  const centerLon = (east + west) / 2
  const centerLat = (north + south) / 2
  const centerHeight = (top + bottom) / 2

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, centerHeight + 2000),
    duration: 1.5,
  })

  viewer.entities.add({
    id: 'grid-boundary',
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
}


// ──────────────────────────────────────────────
/**
 * 清除所有网格
 */
function clearGridVisual() {
  if (!viewer) return
  const toRemove = viewer.entities.values.filter(e => e.id?.startsWith('grid-'))
  toRemove.forEach(e => viewer.entities.remove(e))
}


// ──────────────────────────────────────────────
/**
 * 调用后端接口，查询网格边界，然后渲染
 *
 * 示例：查询经纬度 (119.9733, 30.5199) 在 level=14 下的网格编码及边界
 */
async function loadAndRenderGrid(lon, lat, level = 14) {
  // ① 调用后端：根据经纬度查网格码
  const codeResp = await fetch('/api/multiSource/basicGrid/getGridCodeByPoint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ longitude: lon, latitude: lat, level }),
  })
  const codeData = await codeResp.json()
  const gridCode = codeData.results?.gridCode
  if (!gridCode) return

  // ② 调用后端：根据网格码查边界
  const boundsResp = await fetch('/api/multiSource/basicGrid/getGridBoundaryByCode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: gridCode, level }),
  })
  const boundsData = await boundsResp.json()

  // ③ 渲染到地图
  drawGridBoundary(boundsData.results)
}


// ──────────────────────────────────────────────
/**
 * 批量渲染多个网格（例如多边形区域内的所有网格）
 * 只需传入 cells 数组即可
 */
async function loadAndRenderGridBatch(cellsData) {
  // cellsData 格式：
  // {
  //   cells: [
  //     { code: "30122030411", bounds: { north, south, east, west, top, bottom }, color: "#22c55e", level: 14 },
  //     { code: "30122030412", bounds: { north, south, east, west, top, bottom }, color: "#22c55e", level: 14 },
  //   ]
  // }
  drawGridBoundary(cellsData)
}


// ──────────────────────────────────────────────
/**
 * 导出给外部调用的方法
 */
export {
  initCesiumMap,
  drawGridBoundary,
  clearGridVisual,
  loadAndRenderGrid,
  loadAndRenderGridBatch,
}
