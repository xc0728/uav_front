# 参考网格 + 比例尺 + 图例实现计划

## Context

用户需要在 Cesium 地图上实现始终显示的参考网格覆盖层，随地图缩放自动切换网格层级（确保单元格≤10m，即 zoom in 时自动使用 level≥17），不同层级用不同颜色区分（level 18 = 蓝色），配合图例和比例尺，三者随缩放实时更新。

## 改动范围

**唯一修改文件**：`src/components/data-screen/CesiumMap.vue`

纯前端几何计算，不调用后端 API，复用现有 `getViewBounds()` (L2914) 和 polyline 渲染模式 (L335)。

## 实现步骤

### 1. 新增 ref 状态（L33 之后）

```js
const refGridState = reactive({
  visible: true,
  level: 8,
  color: '#3b82f6',
  cellText: '',
  viewportText: '',
  scalePixels: 120,
  scaleLabel: '',
})
let refGridRenderTimer = null
```

### 2. 新增函数（L862 之后，紧跟 `clearGridVisual`）

**约 160 行代码，包含：**

- `refGridLevelColors` 对象：level 4→21 的颜色映射，level 18 = `#3b82f6`
- `getRefGridColor(level)` / `formatDistance(m)` 工具函数
- `clearRefGrid()`：按 `ref-grid-` ID 前缀批量清理 entities（复用 `clearGridVisual` 的模式）
- `drawRefGridLines(west, south, east, north, lonSpan, latSpan, color, maxV, maxH)`：绘制竖/横 polyline entities，`clampToGround: true` + `width: 1` + `alpha 0.35`
- `computeScaleBar(viewportMeters, canvasPx)`：选"漂亮"整数刻度，像素长度 80-200px
- `updateRefGrid()`：核心主函数——调 `getViewBounds()` → 计算视口宽高(m) → 选 level（`targetCell = max(w,h)/30`，`level = clamp(round(8 + log2(4886/targetCell)), 4, 21)`，性能后处理降级直到线数≤50）→ 清旧网格画新网格 → 更新 `refGridState`
- `scheduleRefGridUpdate()`：120ms 节流包装
- `toggleRefGrid()`：开关

### 3. 事件绑定（L3742 `isMapReady.value = true` 之后）

```js
viewer.camera.percentageChanged = 0.01
viewer.camera.changed.addEventListener(scheduleRefGridUpdate)
updateRefGrid()
```

### 4. 清理（L3745 `onBeforeUnmount` 内）

```js
if (refGridRenderTimer) { clearTimeout(refGridRenderTimer); refGridRenderTimer = null }
```

### 5. defineExpose 扩展（L3573-L3616 末尾追加）

```js
toggleRefGrid,
updateRefGrid,
```

### 6. 模板 overlay（L3850 `.cesium-map-container` 关闭 `</div>` 之前）

两个 HTML overlay：
- `.ref-grid-legend`（右下角）：显示当前 level、颜色色块、单元格尺寸、视口范围
- `.ref-scale-bar`（左下角）：比例尺条 + 距离标签

### 7. 样式（`</style>` 之前追加约 50 行 CSS）

复用现有 overlay 风格：`rgba(15,23,42,0.85)` 背景 + `border-radius: 10px` + `pointer-events: none`

## 核心算法

**层级自动选择**：
```
targetCell = max(viewportWidthM, viewportHeightM) / 30
rawLevel = 8 + log2(4886 / targetCell)
level = clamp(round(rawLevel), 4, 21)
// 性能后处理：若线数>50 降级直到≤50
```

**网格尺寸公式**：`cellM = 4886 / 2^(level-8)`（level 17→9.54m, 18→4.77m, 21→0.60m）

**网格线对齐**：`startLon = floor(west / lonSpan) * lonSpan`（防止缩放抖动）

## 颜色映射表

| Level 范围 | 颜色系 | 说明 |
|---|---|---|
| 4-8 | 红→绿 | 暖色系（大网格，远视） |
| 9-12 | 青→蓝 | 冷色系（中网格） |
| 13-16 | 紫→淡紫 | 紫色系（中小网格） |
| 17-18 | 蓝 `#3b82f6` | ≤10m 区，用户指定 18=蓝 |
| 19-21 | 深蓝→极深蓝 | 最细网格 |

## 验证方案

1. 启动 dev server (localhost:5174)，打开网格算子服务
2. 浏览器验证：
   - 初始视角应显示参考网格线（粗层级）
   - 鼠标滚轮缩放，观察网格自动切换密度（zoom in→密、zoom out→疏）
   - 缩放到足够近时，图例应显示 level≥17（单元格≤10m）
   - 比例尺条随缩放变化（km→m）
   - 图例颜色与网格线颜色一致
   - 控制台无 JS 错误
3. 旋转视角后网格仍正确覆盖视口
4. `drawGridBoundary`（数据网格）与参考网格不互相干扰
