# 新增"入库服务"子页面

## Context

系统现有三个子页面(网格化算子/实时监控大屏/信息管理系统)。用户要求新增第四个子页面"入库服务":提供数据入库参数设置表单,按接口文档 [RuKu.json](file:///e:/E_Desk/CUMTB/uav_front/public/RuKu.json)(OpenAPI 3.0,"数据处理模块")集成后端入库 API,含前端校验、提交状态反馈与响应式设计。

已确认决策:
- **覆盖四类核心入库**:OSGB 网格化、建筑白模入库、DEM 地面网格构建、真高空域剖分(不含空域网格 polygon 类接口)
- **异步任务提交后自动轮询进度**(`GET /api/data-processing-jobs/{jobId}`,202 返回 jobId)

## 架构现状

- 无路由,页面切换由 [DataScreen.vue](file:///e:/E_Desk/CUMTB/uav_front/src/components/DataScreen.vue) 的 `currentPage: 'main' | 'monitoring' | 'info'` 控制
- 导航按钮:左侧 `left-nav-buttons`(网格化算子、信息管理系统,gap 80px),标题右侧 `title-action-buttons`(实时监控大屏、主题下拉)
- 信息管理系统/监控大屏均 `v-show` 常驻渲染保持状态
- 主题体系:CSS 变量 `--theme-*`(天空白/科技蓝/清新绿),组件样式跟随变量自动适配
- API 代理:`/api` → `http://100.104.49.70:9997`(vite.config.js),前端直接用相对路径请求
- Element Plus 已安装但现有面板均为自定义样式,新页面沿用自定义样式风格(参考 InfoManagementPanel 的 form-item/btn-filter/表格风格)

## 实施方案

### 步骤 1:新建 `src/components/data-screen/functions/StorageServicePanel.vue`

页面结构(风格对齐 InfoManagementPanel):

```
顶栏:返回按钮 + 面包屑(智绘平台 / 入库服务)
Tab 栏:OSGB 网格化 | 建筑白模入库 | DEM 地面网格 | 真高空域剖分 | 任务查询
表单区:当前 Tab 的参数表单(2 列 grid,窄屏 1 列)
提交区:提示条(成功绿/失败红)+ 提交按钮(loading spinner + 禁用)
```

#### 四类表单字段(严格按 RuKu.json schema 校验)

**Tab1 OSGB 网格化** — 入库模式单选:同步(`/api/multiSource/triangleGrid/osgbToGridJson`)/ 聚合(`/api/multiSource/triangleGrid/osgbToGridAggregation`):
- `osgbFolder` 必填(字符串)
- `level` 必填,整数 0-21
- `minLevel` 仅聚合模式显示,整数 0-21,校验 ≤ level;响应 200 显示处理摘要(三角面数/目标表/聚合层级)

**Tab2 建筑白模** — `POST /api/building-model/grid-import-jobs`(202 异步):
- `table` 必填,正则 `^white_model_grid_[0-9]+$`
- `level` 整数 1-21,默认 14
- `input` 选填,默认 `building_model.json`
- `maxCells` 整数 1-2000000,默认 2000000
- `refreshObstacle` 复选框(勾选传 true,不勾不传)
- `replace` 复选框;勾选后显示"确认替换"复选框,两者都勾才传 `confirmReplace: true`

**Tab3 DEM 地面网格** — `POST /api/dem/raster-grid-build-jobs`(202 异步):
- `buildId` 必填,1-24 字符,正则 `^[A-Za-z_][A-Za-z0-9_]{0,23}$`
- `inputPath` 必填,默认 `data/dem/zhejiang_dem_glo30.tif`
- `table` 选填,正则 `^demgrid(?:_[0-9]+)?$`
- `level` 整数 1-21,默认 16
- `maxCells` 整数 1-5000000000,默认 1000000000
- `batchSize` 整数 1000-1000000,默认 100000

**Tab4 真高空域** — `POST /api/true-altitude-airspace/import-jobs`(202 异步):
- `datasetId` 必填,1-128 字符,正则 `^[A-Za-z0-9_.-]+$`
- `sourceTable` 选填,默认 `demgrid`,正则同上
- `level` 整数 1-21,默认 15
- `minAgl` 0-100000 默认 0;`maxAgl` 0-100000 默认 600,校验 ≥ minAgl
- `description` 选填 ≤2000 字
- 高级参数(折叠区):`maxSourceRows` 1-4000000000 默认 50000000、`maxCells` 1-1000000000000 默认 1000000000、`batchSize` 1000-1000000 默认 100000、`computeThreads` 0-64 默认 0、`maxConcurrentIo` 1-2 默认 2
- 不提供 polygon 输入,页面注明"不填时处理整个源表"

**Tab5 任务查询** — `GET /api/data-processing-jobs/{jobId}`:
- `jobId` 必填,正则 `^[A-Za-z0-9_-]+$`,≤128
- 展示:状态(queued=排队中/running=执行中/succeeded=成功/failed=失败,映射中文+颜色)、operation、进度条(percent)+ stage、processed/total、起止时间、失败时 error
- 自动轮询:2 秒间隔,succeeded/failed 停止;切换页面/组件卸载时清理定时器;手动"刷新"按钮

#### 校验与反馈机制

- 字段级 rules:{ required, pattern, min, max, 自定义(如 minLevel≤level、maxAgl≥minAgl) };blur 校验单字段,提交时全量校验并滚动到首个错误字段,错误红字显示在字段下方
- 提交中:按钮 spinner + 禁用,防重复提交
- 成功:绿色提示条——同步接口显示结果摘要;202 异步显示"任务已提交",自动切换到任务查询 Tab 并以返回 jobId 开始轮询
- 失败:红色提示条,优先展示后端 `message`,网络错误显示统一文案(含 HTTP 状态码)

#### 响应式与主题

- 容器 max-width 居中;表单 2 列 grid,`@media (max-width: 900px)` 降为 1 列
- 全部颜色/边框使用 `--theme-*` 变量,三种主题自动适配

### 步骤 2:修改 `src/components/DataScreen.vue`

- `currentPage` 增加 `'storage'`;新增 `goToStorage()`,`handleSwitchPage` 支持 `'storage'`
- 左侧导航 `left-nav-buttons` 中"信息管理系统"后新增按钮"入库服务"(`:class="{ active: currentPage === 'storage' }"`)
  - 将 `gap: 80px` 调小(约 24px)避免三按钮与中间标题重叠
- 新增页面容器:`<div v-show="currentPage === 'storage'" class="storage-page-wrapper">` 包裹 `<StorageServicePanel />`(v-show 保持表单状态,样式对齐 `.info-page-wrapper`)

## 关键文件

| 文件 | 操作 |
|------|------|
| `src/components/data-screen/functions/StorageServicePanel.vue` | 新建(核心页面) |
| `src/components/DataScreen.vue` | 修改(导航按钮 + currentPage + 容器) |

## 验证方法

1. `npm run dev` 启动
2. **功能测试**(浏览器 agent):
   - 导航出现"入库服务"按钮,active 高亮与三主题下样式正常
   - 四类表单:空提交被拦截、非法格式(table 不匹配正则/buildId 非法字符/level 越界/minLevel>level/maxAgl<minAgl)显示对应错误、修正后可提交
   - 后端可达时:真实提交 → 202 → 自动跳任务查询 Tab → 轮询进度;同步 OSGB → 结果摘要;后端不可达时:错误提示条正确展示(此即错误路径测试)
   - 任务查询 Tab:输入 jobId 查询、状态/进度/错误展示、轮询停止条件
3. **兼容性测试**:天空白/科技蓝/清新绿三主题切换样式正常;页面切换往返后表单状态保持
4. **用户体验测试**:窄视口(≤900px)表单单列不溢出;提交按钮 loading 反馈;无控制台报错
