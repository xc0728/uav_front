# 航图静态 Feature-DQG 网格数据 · 前端接入方案

> 依据：后端《航图静态 Feature-DQG 网格数据交付与查询说明》（2026-09-10 活动 revision 验收快照）
> 目标项目：`uav_front`（Vue 3 + Vite 7 + Cesium 1.138）
> 文档版本：v1 · 2026-09-16

---

## 1. 结论先行

后端交付的是 **「原始业务 Feature + Feature↔DQG 网格的稀疏关联」**，不是几何替换。因此前端接入不是简单加一个图层，而是要补三层能力：

| 层 | 现状 | 缺口 |
| --- | --- | --- |
| 契约层（HTTP） | 各 Vue 组件裸写 `fetch`，无统一封装 | 缺重试/分片/去重/取消 |
| 渲染层（Cesium） | 仅支持 entity 网格柱、线、单点；**无任何 featureDataSource 与要素拾取** | 缺「带高度的 GeoJSON 要素」渲染 + 点击拾取 |
| 交互层（面板） | `ServicePanel` 已有成熟注册机制 | 需新增服务项 + 两个业务闭环 |

**最大红利**：项目现成的「空域网格化入库/查询服务」（`6_AirspaceGridQuery.vue`）已经能拿到视野内的 `level 16 cells[]`（含 `code / bottom / top`），这**恰好就是新接口的主参数**。两个服务天然可串联，无需造新轮子。

---

## 2. 接口能力盘点

| # | 后端接口 | 前端新增能力 | 前置依赖 |
| --- | --- | --- | --- |
| A | `POST /api/static-features/grid/features` | 网格→要素（**主接口**） | 需先有 code 源 → 复用 `#6` 或直接请求 `#7` |
| B | `GET/POST /api/static-features/feature/grids` | 要素→网格反查、点击高亮所属网格 | A/C 返回的 `featureUid` |
| C | `GET/POST /api/static-features/dataset/grids` | 按 Dataset 全量铺网格 | 33 个 datasetId（前端静态清单） |
| D | `POST /api/static-features/search/grids` | 按 theme / featureType / 属性键值检索 | 无 |
| E | `POST /api/static-features/polygon/features` | 框选 Polygon 精确查要素（PostGIS `ST_Intersects`） | 地图框选（已有 `startBoxSelection`） |

Vite 无需改动：`vite.config.js` 的 `/api` 代理已指向 `http://127.0.0.1:9997`，新前缀自动生效。

---

## 3. 必须先确认的三个硬约束

### 3.1 【P0·阻塞】几何缺失 —— 已核实为「五个接口全都不返回 geometry」

> 本节已于 2026-09-16 直接核对后端源码（`controller/api_static_features.cc`、`service/static_feature/FeatureQueryService.cc`、`SQL/clickhouse/10_static_feature_schema.sql`）修正，不再依赖文档推测。

**经源码确认的事实：**

| 接口 | 处理函数 | 查询库 | 是否含 geometry | 是否含 properties |
| --- | --- | --- | --- | --- |
| `grid/features`（A，主接口） | `FeatureQueryService.cc:94` | **ClickHouse** | **无** | 有 |
| `polygon/features`（E） | `FeatureQueryService.cc:202` | PostgreSQL | **无**（但表里本来就有） | 有 |
| `feature/grids`（B） | `:167` | PostgreSQL | 无（语义不需要） | 无 |
| `dataset/grids`（C） | `:185` | PostgreSQL | 无（语义不需要） | 无 |
| `search/grids`（D） | `:227` | ClickHouse | **无** | **也无**（SELECT 未含 `properties_json`） |

关键原因：**ClickHouse 的 `feature_static` 投影表根本没有几何列**（见 `10_static_feature_schema.sql:13-27`，字段仅到 `properties_json / min_height / max_height`）。因此：

- **主接口 A 补 geometry 不是"加一列 SELECT"，而是要改 ClickHouse 表结构 + 全量重导**，成本高、跨越 33 个 Dataset；
- **接口 E 补 geometry 几乎零成本**：它查的是 PostgreSQL，`static_feature.geometry` 就在那里，只是 `:210` 行的 SELECT 没取——加 `ST_AsGeoJSON(f.geometry)` 即可。

**因此与后端的沟通点应拆成三条，而不是笼统一句"能不能补 geometry"：**

1. **【低成本·优先】给 E（`polygon/features`）加 `ST_AsGeoJSON(f.geometry)`** —— 一行 SELECT，立刻解锁 Tab②「区域框选」的真实几何渲染。
2. **【中成本·推荐】新增批量取几何接口** `POST /api/static-features/features/geometry`，入参去重后的 `featureUids[]`，返回 `{ featureUid: GeoJSON }` 映射；底层走 PostgreSQL `static_feature.geometry`，**不动 ClickHouse schema**。前端流程变为：`A 查 code→uid` → `按 uid 去重` → `本接口批量取几何` → 渲染。
3. **【高成本·暂缓】A 内联 geometry** —— 需要 CH schema 变更 + 重导，且有严重冗余问题（见下）。

> ⚠️ **为什么不建议在 A 内联 geometry**：A 返回的是 **`code + featureUid` 关系行**，同一 Feature 横跨 N 个网格就会产生 N 行、**携带 N 份完全相同的几何**。文档 §8 记录 1,000 code 的响应已达 1.16 MB（gzip 后 48 KB），内联几何会成倍放大。这是必须在方案层规避的设计缺陷。

**决策树（更新版）：**

- **路线 A′（网格代理渲染）**：零后端改动，今天即可落地 → **作为默认实现**；
- **路线 A（真实几何渲染）**：依赖上述第 2 条新接口，按 uid 去重后批量取，**避免冗余** → 作为增强，后端确认后再叠加；
- 两者共用同一渲染管线，先行 A′ 不会返工。

### 3.2 level 锁死 16

所有请求 `level=16`，UI 不提供层级下拉（与现有所有面板不同，这是硬约束，需在 UI 上明确标注而非留空）。

### 3.3 Dataset 清单只能静态配置

后端**未提供「列出所有 Dataset」接口**（只有 `dataset/grids`）。33 个 datasetId 与其中文名、theme、维度只能按文档 §4 固化成前端配置文件。数据重导后如有新增 Dataset，需人工同步该文件。

---

## 4. 两个业务闭环（本方案的核心价值）

### 闭环一：网格 → 要素（在线推荐路径）

对应文档 §6 推荐流程，是路径规划/冲突检查的主链路。

```text
地图视野变化（debounce 400ms，已有机制）
  → GET_VIEW_BOUNDS → {west,south,east,north}
  → POST /api/multiSource/airSpaceDB/grid/region   【复用现有 #6】
      ← cells[]：code / bounds.top / bounds.bottom
  → 按 (bottom,top) 垂直层分组（关键：一次请求只接受一组 bottom/top）
  → 每组 × ≤1000 code 分片（服务端上限）
  → 并发 4 路 POST /api/static-features/grid/features
      ← features2D[] + features3D[]
  → 按 featureUid 去重 → 渲染 / 属性列表
```

**必须实现的两个细节：**

1. **垂直层分组**：文档明示「一次请求只接受一组 `bottom/top`，不同垂直层应分批查询」。前端必须按 `Map<"${bottom}~${top}", codes[]>` 聚合后再发请求，否则会静默丢数据。
2. **去重策略二选一**：保留 `code+featureUid` 关系用于「点击网格看命中了谁」；按 `featureUid` 去重用于「要素本体渲染」。默认渲染去重，同时保留关系表备查。

### 闭环二：区域 → 要素 → 网格（精确检索路径）

```text
地图框选 Polygon（已有 startBoxSelection）
  → POST /api/static-features/polygon/features   【E】(PostgreSQL)
      ← features[]：datasetId / featureUid / theme / featureType / properties
        ⚠ 源码 :210 确认当前不返回 geometry，仅用 ST_Intersects 过滤
  → 补齐路线：向后端申请在 E 的 SELECT 增加 ST_AsGeoJSON(f.geometry)（一行改动）
     否则先用 featureUid → B 接口反查网格，走网格代理渲染
  → 渲染真实几何 + 拉伸体
  → 点击任一要素 → POST /api/static-features/feature/grids【B】
      ← grids[]：code / level / minHeight / maxHeight
  → 高亮该要素占据的全部网格

> 注意：B/C 接口返回的行**不含 properties**（`rowToJson` 未取），要素属性只能从 A 或 E 获取。
```

---

## 5. 实施计划

### P0 · 契约层 `src/api/staticFeatures.js`（新建）

统一封装，所有面板共用。要点：

```js
export const CHART_GRID_LEVEL = 16
export const MAX_CODES_PER_REQ = 1000
export const WORK_DOMAIN_TOP = 300   // 文档 §5.1：[0,300)

// 分片 + 双维度分组 + 并发 4 路 + AbortController + 30s 超时
export async function queryGridFeatures({ codes, cells, signal })
export async function queryFeatureGrids(featureUid, { signal })
export async function queryDatasetGrids(datasetId, { signal })
export async function searchGrids(cond, { signal })          // limit 1~50000
export async function queryPolygonFeatures(geojson, { signal })
```

必须内置的逻辑：

| 项 | 处理 |
| --- | --- |
| `Accept-Encoding: gzip` | 浏览器自动，但**超时必须放宽**——文档记录冷缓存 9–20s，热缓存 1,000 code 约 120ms |
| code 去重 | 客户端先去重，减少请求体积（§8） |
| 垂直层分组 | 见 §4 闭环一细节 1 |
| HTTP 400 | 参数越界（如 1,001 code、只传 bottom、`bottom>=top`）→ 明确提示而非「请求失败」 |
| 空结果 | `features2D/3D` 为空是正常业务空，**不得按故障提示**（§8） |
| `bottom>=300` | 预期 `features3D=[]`，UI 应提示「当前层超出 [0,300) 三维工作域」而非报错 |

### P1 · 地图渲染能力 `CesiumMap.vue`（改造）

现状：39 个 expose 方法，**无 `GeoJsonDataSource` / `CustomDataSource`，且 `handleMouseClick`（3859 行）只做 `scene.pickPosition` 取地形坐标，从不 `scene.pick`**。因此必须新增：

```js
// 1) 独立数据源，避免污染现有 entity 集合
let chartFeatureDs = null
function drawStaticFeatures(geojson)          // 新增 expose
function clearStaticFeatures()                // 新增 expose
function highlightFeatureByUid(uid)           // 新增 expose
function flyToFeature(uid)                    // 新增 expose

// 2) 点击拾取（在现有 handleMouseClick 开头插入，命中要素则 return，不落点）
const picked = viewer.scene.pick(movement.position)
if (Cesium.defined(picked) && picked.id?.properties?.featureUid) {
  emit('feature-selected', picked.id.properties.getValue(viewer.clock.currentTime))
  return
}
```

**几何→Cesium 图元映射（本项目无 TerrainProvider，`depthTestAgainstTerrain=false`）：**

| 业务类型 | Cesium 图元 | 高度处理 |
| --- | --- | --- |
| PointZ | `point{pixelSize} + label` | `height = z`，取海拔直接用 |
| LineStringZ | `polyline{positions: Cartesian3.fromDegreesArrayHeights}` | 逐点 Z 直用（**不可用 `clampToGround`**，会丢 Z） |
| Polygon · 2D | `polygon{hierarchy}` | `height = 0` |
| Polygon · 3D RANGE | `polygon{hierarchy, extrudedHeight}` | 底=`minHeight`，顶=`maxHeight` |
| Polygon · 3D ALL | 同上 | 底=0，顶=WORK_DOMAIN_TOP(300) |
| 退化 RANGE（minHeight===maxHeight，如 170~170） | **特殊处理** | `extrudedHeight === height` 时 Cesium 拉伸体退化不可见 → 强制 `+1m` 或直接按面渲染 |

配色建议（沿用项目科技蓝主色 + 语义色）：`air_route` 青蓝 `#00d4ff`；`prohibited_airspace` 半透明红 `#ff4d4f`；`obstacle` 橙 `#fa8c16`；`utility` 紫 `#9254de`；`road/transport` 灰白；`water` 蓝；`landuse/landcover` 绿系；`admin` 黄色虚线边界。

### P2 · 事件链路（改造）

1. `CesiumMap.vue`：`defineEmits`（第 70 行）增加 `'feature-selected'`；`defineExpose`（3750 行）增加上述 4 个方法。
2. `DataScreen.vue`：`@feature-selected` 转发（参照现有 `point-selected` 中转，约 469–488 行）。
3. `ServicePanel.vue`：注册新服务 + 接入 `applyMapPointToActiveService` / `setViewBoundsToActiveService` / `onActiveServiceViewBoundsChanged` 三条既有通道，即可复用地图点选、视图边界、动态缩放。

### P3 · 功能面板 `functions/11_StaticFeature.vue`（新建）

按 the existing naming convention（`NN_xxx.vue`），服务名建议：**「航图静态要素查询服务」**，短名 **「静态要素」**。下设 4 个 Tab：

| Tab | 对应接口 | 交互 |
| --- | --- | --- |
| ① 视野联动 | A + 复用 #6 | 开关「动态缩放」沿用 `6_AirspaceGridQuery.vue` 的 debounce + AbortController 竞态取消模式 |
| ② 区域框选 | E + B | 框选 → 要素列表 → 点击 → 高亮网格 |
| ③ 数据集图层 | C | 33 个 dataset 树形勾选（按 theme 分组），**大 Dataset 需二次确认**：`admin_county_areas` 19.4 万映射、`landuse_construction_land` 14 万映射，文档明确「不应在高频在线请求中反复全量调用」 |
| ④ 条件检索 | D | datasetId / theme / featureType / 属性键值四选一组合，`limit` 滑块 1–50,000 |

面板必备 UI 语义（文档 §11 对接清单要求）：**必须能区分 `features2D` / `features3D`，且必须能区分 `RANGE` / `ALL`**。建议做成两个结果区 + 垂直模式徽标。

### P4 · 静态配置 `src/config/chartDatasets.js`（新建）

按文档 §4 固化 33 个 Dataset：`datasetId / name / theme / dimension(2D|3D) / featureCount / mappingCount / recommendWarn`。

> 依据 §4.4，**「限制性管制空域」不应被宣称已交付**，不得出现在配置清单中。

---

## 6. 关键设计取舍

| 决策点 | 方案 A | 方案 B | 建议 |
| --- | --- | --- | --- |
| 几何渲染 vs 网格代理 | 需要后端补 geometry，形状真实 | 今天即可落地，零依赖 | **先 B 后 A**，两者共用同一渲染管线 |
| 视野联动重绘策略 | 全量清除后重绘 | 按 featureUid 差量增删 | **差量**，避免每次视野变化全清重绘导致闪烁 |
| 「③ 数据集图层」全量拉取 | 一次拉全量 | 视野裁剪后再拉 | **按需 + 视野裁剪**，并对超大 Dataset 加确认弹窗 |
| 要素entity vs primitive | Entity API（项目现有风格） | Primitive 性能更强 | **Entity + CustomDataSource**，数量级（万级以下）足够，且便于拾取；若后续 `transport_road_service_facilities`(5,625) / `utility_fire_hydrants`(4,012) 全量同屏再评估 Primitive |

---

## 7. 验收清单

直接对齐文档 §9 / §11，前端侧需验证：

- [ ] level 一律 16，UI 无层级输入或锁定为 16
- [ ] `[295.63904,300)` 查询禁止性管制空域，`ALL` 正常命中（§9.6-2）
- [ ] `[300,305.17578)` 查询：三维结果为空，二维正常（§9.6-3）
- [ ] 同一 code 重复传入无重复映射；客户端已去重（§9.6-4）
- [ ] 传入 1,001 code 得到 HTTP 400 并有友好提示（§9.6-5）
- [ ] 只传 `bottom` 或 `bottom>=top` 得到 HTTP 400 友好提示（§9.6-6）
- [ ] 省略 bottom/top 与显式传入时，UI 能解释差异（前者返回全部三维映射，后者按高度过滤）
- [ ] 空结果区分为「无命中」而非「服务异常」
- [ ] 点击要素可拾取并展示 properties + 所属网格
- [ ] 冷缓存场景下 30s 超时不误报「服务故障」

---

## 8. 工作量与风险

| 阶段 | 内容 | 前置阻塞 |
| --- | --- | --- |
| P0 契约层 | ~150 行 | 无 |
| P1 CesiumMap 改造 | ~200 行（含拾取），**需回归现有点击落点行为** | 无 |
| P2 事件链路 | ~15 行 × 3 文件 | P1 |
| P3 面板 | ~800 行 | P0/P1/P2 |
| P4 配置 | ~80 行 | 无 |

**主要风险：**
1. **几何缺失已确认为全接口现状**（源码核实，非待办）→ 因此 P3 的 Tab①/②**必须先按「网格代理渲染」实现**，不等待后端排期；若后端按 §3.1 第 2 条交付批量几何接口，再叠加真实几何，渲染管线复用、**不返工**。切勿把 Tab① 阻塞在后端沟通上；
2. P1 修改 `handleMouseClick` 会影响现有「点击地图落点」全链路（网格剖分、路径规划、民航冲突检测均依赖），必须做回归；
3. 超大 Dataset 的 C 接口若在视野联动中被触发，冷缓存 9–20s 会阻塞主线程体验，建议在 Tab③ 独立且强制二次确认。
