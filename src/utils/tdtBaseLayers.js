import * as Cesium from 'cesium'

// 天地图浏览器端 key，可通过 VITE_TDT_KEY 环境变量覆盖
const TDT_KEY = import.meta.env.VITE_TDT_KEY || '165bf7b260b0e00a80b6aa3071b41ba8'

// 可选底图（UI 展示顺序）
export const BASE_LAYER_OPTIONS = [
  { id: 'default', label: '默认' },
  { id: 'img', label: '影像' },
  { id: 'vec', label: '矢量' },
  { id: 'ter', label: '地形' },
]

// 天地图图源定义：底图 + 注记两层，全部使用 w（Web 墨卡托）切片
const TDT_LAYERS = {
  img: { base: 'img_w', baseFormat: 'image/jpeg', anno: 'cva_w', maxLevel: 18 },
  vec: { base: 'vec_w', baseFormat: 'image/png', anno: 'cva_w', maxLevel: 18 },
  ter: { base: 'ter_w', baseFormat: 'image/jpeg', anno: 'cta_w', maxLevel: 12 },
}

// 页面上可能同时存在多个 CesiumMap 实例（数据大屏/监控大屏），
// 状态必须按 viewer 隔离，否则切换会作用到错误的地图上
const stateMap = new WeakMap()

function getState(viewer) {
  let state = stateMap.get(viewer)
  if (!state) {
    state = { defaultLayer: null, currentType: 'default', tdtLayers: [] }
    stateMap.set(viewer, state)
  }
  return state
}

function createTdtProvider(layerId, format, maxLevel) {
  return new Cesium.WebMapTileServiceImageryProvider({
    url: `https://t{s}.tianditu.gov.cn/${layerId}/wmts?service=WMTS&request=GetTile&version=1.0.0` +
      `&layer=${layerId.slice(0, 3)}&style=default&tilematrixset=w&format=tiles` +
      `&tilematrix={TileMatrix}&tilerow={TileRow}&tilecol={TileCol}&tk=${TDT_KEY}`,
    layer: layerId.slice(0, 3),
    style: 'default',
    format,
    tileMatrixSetID: 'w',
    subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'],
    maximumLevel: maxLevel,
  })
}

function removeTdtLayers(viewer, state) {
  while (state.tdtLayers.length) {
    const layer = state.tdtLayers.pop()
    try {
      viewer.imageryLayers.remove(layer, true)
    } catch (e) {
      console.warn('[tdtBaseLayers] 移除图层失败:', e)
    }
  }
}

// onMounted 创建 viewer 后调用，记录该 viewer 的默认（Ion）影像图层
export function initBaseLayers(viewer) {
  if (!viewer || !viewer.imageryLayers) return
  const state = getState(viewer)
  if (!state.defaultLayer) {
    state.defaultLayer = viewer.imageryLayers.get(0) || null
  }
}

// type: 'default' | 'img' | 'vec' | 'ter'
export function switchBaseLayer(viewer, type) {
  const state = getState(viewer)
  if (!viewer || !state.defaultLayer || type === state.currentType) return
  if (type !== 'default' && !TDT_LAYERS[type]) {
    console.warn(`[tdtBaseLayers] 未知的底图类型: ${type}`)
    return
  }

  removeTdtLayers(viewer, state)
  state.defaultLayer.show = type === 'default'

  if (type !== 'default') {
    const def = TDT_LAYERS[type]
    const baseLayer = viewer.imageryLayers.addImageryProvider(
      createTdtProvider(def.base, def.baseFormat, def.maxLevel)
    )
    const annoLayer = viewer.imageryLayers.addImageryProvider(
      createTdtProvider(def.anno, 'image/png', def.maxLevel)
    )
    // 注记层压在底图之上
    viewer.imageryLayers.raiseToTop(annoLayer)
    state.tdtLayers.push(baseLayer, annoLayer)
  }

  state.currentType = type
}

export function getCurrentBaseLayerType(viewer) {
  return getState(viewer).currentType
}
