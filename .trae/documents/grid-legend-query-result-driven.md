# 网格图例改为查询结果驱动

## Context（背景）

当前地图存在两套网格系统：
1. **参考网格系统**（`refGridState`）：跟随地图缩放自动切换层级、变色绘制的格网线条 + 比例尺 + 图例。这是用户**不想要**的——它在常规浏览/操作场景下显示"跟随地图变化呈现不同颜色的格网线条"。
2. **查询结果网格**（`drawGridBoundary`）：点网格化、线网格化、A星航路规划、DEM查询、空域查询等功能查询出网格后绘制到地图上。这是用户**想要保留**的。

用户需求：
1. 图例应在**查询结果绘制到地图后**才显示，层级对应实际绘制的网格层级，而非跟随地图缩放变化
2. 保留比例尺用于对照格网大小
3. **多层级网格同时展示**：网格聚合菜单下"多粒度混合格网建模"和"倾斜摄影多源聚合网格查询"会涉及多层级网格同时展示，图例需支持显示多个层级

### 多层级数据结构说明

- **单层级功能**（点网格化、线网格化、A星规划、DEM查询、空域查询等）：cells 不含 level，需从组件表单传入 `level` 作为 payload 顶层字段
- **多层级功能**（7_Aggregation.vue 两个子功能）：cells 已携带 `level`/`z` 和 `color` 字段
  - 多粒度混合格网建模：cell 有 `level`（由 `estimateLevel` 估算）+ `color`（来自 `levelColors` 映射）
  - 倾斜摄影多源聚合网格查询：cell 有 `z`（后端返回的层级）+ `color`（来自 `getColorBySpan`）

## 方案

### 1. CesiumMap.vue — 移除参考网格线条，保留比例尺，图例改为查询结果驱动（支持多层级）

**移除参考网格线条系统（删除绘制变色格网线条的函数）：**
- 删除 `refGridState`、`refGridRenderTimer`、`refGridLevelColors`、`getRefGridColor`、`cellMetersByLevel`、`clearRefGrid`、`drawRefGridLines`、`updateRefGrid`、`scheduleRefGridUpdate`、`toggleRefGrid`、`setRefGridVisible`
- 删除 `onMounted` 中 `viewer.camera.changed.addEventListener(scheduleRefGridUpdate)` 和 `updateRefGrid()` 调用
- 删除 `onBeforeUnmount` 中 `refGridRenderTimer` 清理
- 删除 `.ref-grid-legend` 模板（保留 CSS 改名复用）
- 从 `defineExpose` 移除 `toggleRefGrid`、`setRefGridVisible`、`updateRefGrid`

**保留比例尺相关函数（`formatDistance`、`computeScaleBar`、`getViewBounds`）：**
- 这些函数仅被比例尺使用，保留不动

**新增查询结果状态（同时驱动图例 + 比例尺显示，支持多层级）：**
```js
const gridResultState = reactive({
  visible: false,
  levels: [],        // 多层级数组: [{ level, count, color }]
  total: 0,          // 网格总数
  scalePixels: 120,
  scaleLabel: '',
})
let scaleBarTimer = null
```

**新增比例尺更新函数（仅更新比例尺，不绘制格网线条）：**
```js
function updateScaleBar() {
  if (!viewer || !gridResultState.visible) return
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

function scheduleScaleBarUpdate() {
  if (scaleBarTimer) return
  scaleBarTimer = setTimeout(() => {
    scaleBarTimer = null
    updateScaleBar()
  }, 120)
}
```

**新增层级收集辅助函数（从 cells 中提取层级信息，支持多层级）：**
```js
function collectGridLevels(cells, fallbackLevel) {
  const levelMap = {}
  let hasCellLevel = false
  cells.forEach(cell => {
    // 优先用 cell.level，其次 cell.z（倾斜摄影聚合返回的字段）
    const lv = cell.level ?? cell.z ?? null
    const color = cell.color || '#3b82f6'
    if (lv !== null && lv !== undefined) {
      hasCellLevel = true
      if (!levelMap[lv]) levelMap[lv] = { level: Number(lv), count: 0, color }
      levelMap[lv].count++
    }
  })
  if (hasCellLevel) {
    return Object.values(levelMap).sort((a, b) => a.level - b.level)
  }
  // cells 无层级字段时，用 payload 顶层 level（单层级）
  if (fallbackLevel != null) {
    return [{ level: Number(fallbackLevel), count: cells.length, color: '#3b82f6' }]
  }
  return []
}
```

**onMounted 中替换相机监听（仅更新比例尺，不绘制格网线条）：**
```js
viewer.camera.percentageChanged = 0.01
viewer.camera.changed.addEventListener(scheduleScaleBarUpdate)
```
- `onBeforeUnmount` 中清理 `scaleBarTimer`（替换原 `refGridRenderTimer` 清理）

**修改 `drawGridBoundary(gridInfo)`（L157）：**
- 多网格分支（`gridInfo.cells.length > 0`）末尾：
  ```js
  gridResultState.levels = collectGridLevels(gridInfo.cells, gridInfo.level)
  gridResultState.total = gridInfo.cells.length
  gridResultState.visible = true
  updateScaleBar()
  ```
- 单网格分支末尾：
  ```js
  gridResultState.levels = gridInfo.level != null
    ? [{ level: Number(gridInfo.level), count: 1, color: '#3b82f6' }]
    : []
  gridResultState.total = 1
  gridResultState.visible = true
  updateScaleBar()
  ```
- L195 `const cellLevel = cell.level` 改为 `const cellLevel = cell.level ?? cell.z`（兼容倾斜摄影聚合的 z 字段）

**修改 `clearGridVisual()`（L852）：**
- 末尾增加：
  ```js
  gridResultState.visible = false
  gridResultState.levels = []
  gridResultState.total = 0
  ```

**替换模板（图例支持多层级 + 比例尺，均由 gridResultState.visible 控制）：**
```html
<!-- 查询网格图例（右下角，支持多层级） -->
<div class="grid-result-legend" v-if="gridResultState.visible">
  <div class="legend-title">查询网格</div>
  <div v-for="item in gridResultState.levels" :key="item.level" class="legend-row">
    <span class="legend-swatch" :style="{ background: item.color }" />
    <span class="legend-label">Level {{ item.level }}</span>
    <span class="legend-metric">{{ item.count }}</span>
  </div>
  <div class="legend-row legend-metric">
    网格总数 {{ gridResultState.total }}
  </div>
</div>

<!-- 比例尺（左下角，用于对照格网大小） -->
<div class="ref-scale-bar" v-if="gridResultState.visible">
  <div class="scale-track">
    <div class="scale-fill" :style="{ width: gridResultState.scalePixels + 'px' }" />
  </div>
  <div class="scale-label">{{ gridResultState.scaleLabel }}</div>
</div>
```
- 图例 CSS 类名从 `.ref-grid-legend` 改为 `.grid-result-legend`，样式复用
- 比例尺 CSS（`.ref-scale-bar`）保留不动
- 单层级时 levels 数组只有 1 项，显示 1 行；多层级时显示多行，每行带颜色色块 + Level + 数量

### 2. ServicePanel.vue — 还原 ref-grid-visibility emit

- 从 `defineEmits` 移除 `'ref-grid-visibility'`
- `openCalcPanel` 移除 `emit('ref-grid-visibility', true)`
- `closeCalcPanel` 移除 `emit('ref-grid-visibility', false)`

### 3. DataScreen.vue — 移除 ref-grid-visibility 绑定

- ServicePanel 模板移除 `@ref-grid-visibility="handleRefGridVisibility"`
- 删除 `handleRefGridVisibility` 函数

### 4. 功能组件 — showGrid payload 增加 level 字段

**单层级功能组件**（cells 不含 level，需从表单传入顶层 level）：

| 组件 | 表单 level 字段 | emit 行 |
|------|----------------|---------|
| 1_GridInterop.vue | pointToGridForm.level | 单网格 emit 处加 level |
| 2_Osgb_Grid.vue | triangleGridForm.level / osgbForm.level | L317 emit 加 level |
| 3_1PointGrid.vue | pointGridForm.level | L200 emit 加 level |
| 3_2LineGrid.vue | lineForm.level / pipeForm.level | L193/L251 emit 加 level |
| 3_3PolygonGrid.vue | polygonForm.level 等 | L261/L344/L426/L542 emit 加 level |
| 3_4RangeGrid.vue | rangeForm.level | L169 emit 加 level |
| 4_PathPlanning.vue | astarForm.level / conflictForm.level | 各 emit cells 处加 level |
| 6_AirspaceGridQuery.vue | airspaceGridForm.level | L183 emit 加 level |
| 8_DemGrid.vue | demGridForm.level | L197 emit 加 level |

**多层级功能组件**（cells 已携带 level/z + color，无需传顶层 level）：

| 组件 | 子功能 | cell 已有字段 | 说明 |
|------|--------|-------------|------|
| 7_Aggregation.vue | 多粒度混合格网建模 | level + color | collectGridLevels 自动收集多层级 |
| 7_Aggregation.vue | 倾斜摄影多源聚合网格查询 | z + color | collectGridLevels 用 cell.z 作为 level |

**模式（单层级，多网格）：**
```js
emit('showGrid', { cells, level: Number(xxxForm.level) })
```
**模式（单层级，单网格）：**
```js
emit('showGrid', { center, bounds, level: Number(xxxForm.level) })
```
**多层级无需改动**：7_Aggregation 的 cells 已带 level/z + color，drawGridBoundary 的 collectGridLevels 自动提取多层级
- `emit('showGrid', { cells: [] })`（清除操作）不加 level，drawGridBoundary 会走 clearGridVisual 隐藏图例

## 验证

1. `npm run dev` 启动，浏览器打开 http://localhost:5174/
2. **默认浏览**：地图加载后无格网线条、无图例、无比例尺
3. **进入操作面板**（如点网格化）：进入时不显示参考网格（与之前行为不同）
4. **单层级查询**：点网格化/DEM查询/空域查询等查询出网格后，图例出现在右下角，显示 1 行（色块 + Level N + 数量）+ 网格总数，比例尺出现在左下角，层级与表单选择一致
5. **多层级查询**：网格聚合 → 多粒度混合格网建模（勾选聚合 + minLevel < level），查询后图例显示多行（每行一个层级，带各自颜色色块 + Level + 数量）+ 网格总数
6. **多层级查询2**：网格聚合 → 倾斜摄影多源聚合网格查询，查询后图例显示多行（基于 cell.z 的多层级）
7. **缩放地图**：比例尺随缩放更新（如 500m → 200m），图例层级不变，可对照比例尺看格网大小
8. **清除网格**：图例和比例尺同时消失
9. **切换功能**：不同功能间切换，图例+比例尺均跟随查询结果显示/隐藏
10. **多分辨率**：不同窗口大小下图例和比例尺位置正常
