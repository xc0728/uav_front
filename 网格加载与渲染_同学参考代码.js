/**
 * ================================================================
 * 网格数据加载与渲染 · 核心代码（来源：e-E-Desk-CUMTB-uav-front）
 * ================================================================
 * 整体架构：
 *   功能子组件（调用后端接口）→ ServicePanel（事件转发）→ CesiumMap（Cesium Entity 渲染）
 *
 * 依赖：
 *   npm i cesium vue
 *   需要项目中配置 Cesium 资产路径（vite.config.js 中设置）
 *
 * 核心文件：
 *   - src/components/data-screen/CesiumMap.vue        ← 地图渲染层
 *   - src/components/data-screen/ServicePanel.vue     ← 事件转发层
 *   - src/components/data-screen/functions/1_GridInterop.vue ← 业务调用层（示例）
 * ================================================================
 */


/* ================================================================
 * 第一部分：CesiumMap.vue —— 网格渲染核心
 * ================================================================
 * 所有网格/航线/禁飞区都在这里用 Cesium Entity 绘制。
 * 对外暴露方法（defineExpose）：
 *   drawGridBoundary(payload)   ← 绘制网格面
 *   clearGridVisual()           ← 清除网格
 *   drawLinePath(points)        ← 绘制航线折线
 *   drawPolygon(points)         ← 绘制多边形
 *   flyToPoint(lon, lat, h)    ← 飞到指定点
 * ================================================================ */

<template>
  <div ref="cesiumEl" class="cesium-container" />
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, defineExpose } from 'vue'
import * as Cesium from 'cesium'

const cesiumEl = ref(null)
let viewer = null
let handler = null

// ─── 初始化 Cesium 地图 ───
onMounted(() => {
  // 初始化 viewer
  viewer = new Cesium.Viewer(cesiumEl.value, {
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

  // 默认飞到德清县（浙江省）
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(119.97, 30.54, 5000),
    duration: 0,
  })

  // 加载倾斜摄影（3D Tiles）
  const tileset = viewer.scene.primitives.add(
    Cesium3DTileset.fromUrl('/dq3dtiles/Tile_+076_+000')
  )
  tileset.style = new Cesium.Cesium3DTileStyle({
    building: { color: 'color("#ffffff", 0.6)' },
  })
})

// ─── 网格渲染核心函数（同学重点看这里） ───

/**
 * 绘制网格边界（支持单个或批量）
 * @param {Object} gridInfo - 后端返回的网格数据
 *   - gridInfo.cells[]    : 批量网格，每个包含 { code, bounds: { north, south, east, west, top, bottom }, color, level }
 *   - gridInfo.center     : 单网格中心 { longitude, latitude }
 *   - gridInfo.bounds     : 单网格边界 { north, south, east, west, top, bottom }
 */
function drawGridBoundary(gridInfo) {
  if (!viewer || !gridInfo) return

  // 先清除旧的网格
  clearGridVisual()

  // ── 批量网格（cells 数组）────────────
  if (gridInfo.cells && Array.isArray(gridInfo.cells) && gridInfo.cells.length > 0) {
    let minLon = Infinity, maxLon = -Infinity
    let minLat = Infinity, maxLat = -Infinity
    let minHeight = Infinity, maxHeight = -Infinity

    gridInfo.cells.forEach((cell, index) => {
      if (!cell.bounds) return
      const { north, south, east, west, top = 0, bottom = 0 } = cell.bounds

      // 更新包围盒
      minLon = Math.min(minLon, west)
      maxLon = Math.max(maxLon, east)
      minLat = Math.min(minLat, south)
      maxLat = Math.max(maxLat, north)
      minHeight = Math.min(minHeight, bottom)
      maxHeight = Math.max(maxHeight, top)

      // 取网格颜色，没有则默认蓝色
      const cellColor = cell.color || '#3b82f6'

      // 核心：用 Cesium.Rectangle 绘制矩形网格面
      viewer.entities.add({
        id: `grid-boundary-${index}`,
        rectangle: {
          // 轻微扩展以消除渲染缝隙
          coordinates: Cesium.Rectangle.fromDegrees(
            west - 0.000001,
            south - 0.000001,
            east + 0.000001,
            north + 0.000001
          ),
          // 半透明填充
          material: Cesium.Color.fromCssColorString(cellColor).withAlpha(0.5),
          // 边框
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString(cellColor),
          outlineWidth: 1,
          // 底高和顶高（立体网格）
          height: bottom,
          extrudedHeight: top,
        },
        description: cell.level !== undefined ? `层级: ${cell.level}` : undefined,
      })
    })

    // 飞行到网格区域中心
    if (minLon !== Infinity) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          (minLon + maxLon) / 2,
          (minLat + maxLat) / 2,
          (minHeight + maxHeight) / 2 + 3000
        ),
        duration: 1.5,
      })
    }
    return
  }

  // ── 单个网格 ────────────────────────
  const { center, bounds } = gridInfo
  if (!bounds) return
  const { north, south, east, west, top = 0, bottom = 0 } = bounds
  const centerLon = (east + west) / 2
  const centerLat = (north + south) / 2
  const centerHeight = (top + bottom) / 2

  // 飞行到网格中心
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, centerHeight + 2000),
    duration: 1.5,
  })

  // 绘制矩形网格面
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

  // 绘制中心点
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

/**
 * 清除所有网格实体
 */
function clearGridVisual() {
  if (!viewer) return
  const toRemove = viewer.entities.values.filter(e => e.id?.startsWith('grid-'))
  toRemove.forEach(e => viewer.entities.remove(e))
}

/**
 * 绘制航迹折线
 * @param {Array} linePoints - 点数组，每个点包含 { lon, lat, height }
 */
function drawLinePath(linePoints) {
  if (!viewer || !linePoints?.length) return

  // 绘制路径点
  linePoints.forEach((p, idx) => {
    viewer.entities.add({
      id: `line-point-${idx}`,
      position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.height),
      point: {
        pixelSize: 9,
        color: Cesium.Color.fromCssColorString('#22c55e'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
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
      },
    })
  })

  // 绘制折线
  if (linePoints.length >= 2) {
    viewer.entities.add({
      id: 'line-polyline',
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights(
          linePoints.flatMap(p => [p.lon, p.lat, p.height ?? 0])
        ),
        width: 3,
        material: Cesium.Color.fromCssColorString('#22c55e').withAlpha(0.9),
        clampToGround: true,
      },
    })
  }
}

// ─── 地图点击获取经纬度 ───
function setupClickHandler() {
  handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
  handler.setInputAction((click) => {
    const ray = viewer.camera.getPickRay(click.position)
    const cartesian = viewer.scene.globe.pick(ray, viewer.scene)
    if (!cartesian) return

    const cartographic = Cesium.Cartographic.fromCartesian(cartesian)
    const lon = Cesium.Math.toDegrees(cartographic.longitude)
    const lat = Cesium.Math.toDegrees(cartographic.latitude)
    const height = cartographic.height

    emit('point-selected', { lon, lat, height })
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
}

const emit = defineEmits(['point-selected'])

defineExpose({
  drawGridBoundary,
  clearGridVisual,
  drawLinePath,
  flyToPoint: (lon, lat, h = 0) => {
    viewer?.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, h + 500),
      duration: 1.5,
    })
  },
})
</script>

<style scoped>
.cesium-container {
  width: 100%;
  height: 100%;
}
</style>


/* ================================================================
 * 第二部分：ServicePanel.vue —— 事件转发层
 * ================================================================
 * ServicePanel 是父容器，负责：
 *   1. 渲染左侧服务面板和功能子组件
 *   2. 接收子组件 emit 的事件
 *   3. 转发给 CesiumMap 执行渲染
 * ================================================================ */

/*
  <template>
    <!-- 左侧服务面板 -->
    <div class="service-panel">
      <div
        v-for="service in services"
        :key="service.id"
        class="service-item"
        @click="activeService = service"
      >
        {{ service.name }}
      </div>
    </div>

    <!-- 当前选中的功能组件 -->
    <div class="function-panel">
      <component
        :is="activeService.component"
        :functionName="selectedFunction"
        @showGrid="handleShowGrid"
        @showPoint="handleShowPoint"
        @show-line="handleShowLine"
      />
    </div>

    <!-- 地图 -->
    <CesiumMap
      ref="cesiumMapRef"
      @point-selected="handlePointSelected"
    />
  </template>

  <script setup>
  import { ref } from 'vue'
  import CesiumMap from './CesiumMap.vue'

  const cesiumMapRef = ref(null)

  // ── 接收子组件的 showGrid 事件，转发给 CesiumMap ──
  function handleShowGrid(payload) {
    // payload = { cells: [{ code, bounds, color, level }, ...] }
    cesiumMapRef.value?.drawGridBoundary(payload)
  }

  // ── 接收子组件的 show-line 事件，绘制航迹 ──
  function handleShowLine(points) {
    // points = [{ lon, lat, height }, ...]
    cesiumMapRef.value?.drawLinePath(points)
  }

  // ── 接收地图点选事件，传给子组件填充坐标 ──
  function handlePointSelected({ lon, lat, height }) {
    // 找到当前活动的子组件，调用其 setPointFromMap 方法
    const activeComponent = activeServiceRef.value?.$refs?.funcRef
    activeComponent?.setPointFromMap?.(lon, lat, height)
  }
  </script>
*/


/* ================================================================
 * 第三部分：1_GridInterop.vue —— 业务调用层（示例）
 * ================================================================
 * 功能：输入经纬度 + 层级 → 调用后端 → 拿到网格码 → emit 给父容器
 * 同学改写时，只需替换接口地址和字段名即可
 * ================================================================ */

/*
  <template>
    <div class="interop-panel">
      <h3>经纬度高转网格编码</h3>

      <div class="form">
        <label>经度</label>
        <input v-model="form.longitude" type="number" step="0.000001" />

        <label>纬度</label>
        <input v-model="form.latitude" type="number" step="0.000001" />

        <label>高度 (m)</label>
        <input v-model="form.height" type="number" />

        <label>网格层级</label>
        <select v-model="form.level">
          <option v-for="lv in [4,5,6,7,8,9,10,11,12,13,14]" :key="lv" :value="lv">
            层级 {{ lv }}
          </option>
        </select>

        <button @click="submit">查询</button>
      </div>

      <!-- 结果 -->
      <div v-if="result" class="result">
        <p>网格编码：{{ result.gridCode }}</p>
        <p>层级：{{ result.level }}</p>
        <!-- 在地图上显示 -->
        <button @click="showOnMap">地图上显示</button>
      </div>
    </div>
  </template>

  <script setup>
  import { reactive, ref } from 'vue'

  const emit = defineEmits(['showGrid', 'showPoint'])

  // ── 表单数据 ──
  const form = reactive({
    longitude: 119.9733,
    latitude: 30.5199,
    height: 100,
    level: 14,
  })

  const result = ref(null)
  const loading = ref(false)

  // ── 调用后端接口，拿到网格码 ──
  async function submit() {
    loading.value = true
    try {
      const resp = await fetch('/api/multiSource/basicGrid/getGridCodeByPoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          longitude: Number(form.longitude),
          latitude: Number(form.latitude),
          height: Number(form.height),
          level: Number(form.level),
        }),
      })
      const data = await resp.json()
      result.value = data.results
    } catch (err) {
      console.error('查询失败', err)
    } finally {
      loading.value = false
    }
  }

  // ── 调用后端：根据网格码查边界 ──
  async function showOnMap() {
    if (!result.value?.gridCode) return

    const resp = await fetch('/api/multiSource/basicGrid/getGridBoundaryByCode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: result.value.gridCode,
        level: form.level,
      }),
    })
    const data = await resp.json()
    // data.results 格式：
    // { center: { longitude, latitude }, bounds: { north, south, east, west, top, bottom }, ... }

    // 核心：emit 给父容器，父容器再调 CesiumMap.drawGridBoundary()
    emit('showGrid', data.results)
  }

  // ── 接收地图点选的经纬度（由父容器调用） ──
  function setPointFromMap(lon, lat, height) {
    form.longitude = Number(lon.toFixed(10))
    form.latitude = Number(lat.toFixed(10))
    if (height > 0) form.height = Number(height.toFixed(2))
  }

  defineExpose({ setPointFromMap })
  </script>
*/


/* ================================================================
 * 第四部分：完整的调用链路示例（从用户操作到地图渲染）
 * ================================================================
 *
 *  Step 1. 用户在左侧面板输入经纬度，点击"查询"
 *           → 1_GridInterop.vue 的 submit() 发送请求
 *           → 后端返回 { gridCode: "30122030411" }
 *
 *  Step 2. 用户点击"地图上显示"
 *           → 再次请求 /getGridBoundaryByCode
 *           → 后端返回网格边界：
 *             {
 *               center: { longitude: 119.9733, latitude: 30.5199 },
 *               bounds: { north: 30.5200, south: 30.5198,
 *                         east: 119.9740, west: 119.9730,
 *                         top: 110, bottom: 90 },
 *               level: 14
 *             }
 *
 *  Step 3. 1_GridInterop.vue 执行：
 *           emit('showGrid', { center, bounds, level })
 *
 *  Step 4. ServicePanel.vue 接收：
 *           @showGrid="handleShowGrid"
 *           function handleShowGrid(payload) {
 *             cesiumMapRef.value.drawGridBoundary(payload)
 *           }
 *
 *  Step 5. CesiumMap.vue 执行 drawGridBoundary()：
 *           → viewer.entities.add({ rectangle: { coordinates, material, ... } })
 *           → viewer.camera.flyTo({ destination })
 *
 *  效果：地图飞到这个网格的位置，高亮显示该网格的矩形面。
 *
 * ================================================================ */


/* ================================================================
 * 第五部分：批量网格渲染（多网格场景）
 * ================================================================
 * 例如：用户选择一个区域，后端返回 100 个网格：
 *
 * 后端返回格式：
 * {
 *   cells: [
 *     { code: "30122030411", bounds: { north, south, east, west, top, bottom }, color: "#22c55e", level: 14 },
 *     { code: "30122030412", bounds: { north, south, east, west, top, bottom }, color: "#22c55e", level: 14 },
 *     ...（100个）
 *   ]
 * }
 *
 * 调用方式完全一样：
 *   emit('showGrid', { cells: [...] })
 *   → ServicePanel → cesiumMapRef.value.drawGridBoundary({ cells: [...] })
 *   → CesiumMap 遍历 cells，批量 add entity
 *
 * 颜色约定（前端视觉标准）：
 *   #22c55e (绿色) → 可飞区
 *   #ef4444 (红色) → 禁飞区
 *   #3b82f6 (蓝色) → 航路区 / 默认蓝色
 *
 * ================================================================ */


/* ================================================================
 * 第六部分：关键依赖配置（vite.config.js 中的代理配置）
 * ================================================================
 *
 * import { defineConfig } from 'vite'
 * import vue from '@vitejs/plugin-vue'
 *
 * export default defineConfig({
 *   plugins: [vue()],
 *   resolve: {
 *     alias: { '@': '/src' },
 *   },
 *   server: {
 *     proxy: {
 *       '/api': {
 *         target: 'https://your-backend-server.com',
 *         changeOrigin: true,
 *         rewrite: (path) => path.replace(/^\/api/, ''),
 *       },
 *     },
 *   },
 * })
 *
 * ================================================================ */
