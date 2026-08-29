# 重构飞行器管理模块前端显示逻辑

## Context（背景与目标）

当前实时监控大屏 [MonitoringScreen.vue](file:///e:/E_Desk/CUMTB/uav_front/src/components/MonitoringScreen.vue) 的右下角"飞行器管理"面板通过 `fetch('/api/aircraft/list')` 拉取数据（[L32-59](file:///e:/E_Desk/CUMTB/uav_front/src/components/MonitoringScreen.vue#L32-L59)），与信息管理系统 [InfoManagementPanel.vue](file:///e:/E_Desk/CUMTB/uav_front/src/components/data-screen/functions/InfoManagementPanel.vue) 中的飞行器管理列表（本地 mock 数据，[L86-95](file:///e:/E_Desk/CUMTB/uav_front/src/components/data-screen/functions/InfoManagementPanel.vue#L86-L95)）是两套独立数据源，互不同步。

本次重构目标：
1. 移除 `/api/aircraft/list` 接口调用，飞行器列表改为纯前端要素
2. 信息管理系统列表 与 监控大屏右下角面板 数据实时同步（监控大屏不显示绑定时间）
3. 点击监控大屏飞行器面板列表项 → 无人机状态面板显示该无人机详细数值
4. 数值随机生成（速度 3-15 km/h、电量 40-95%、高度 10-120m、信号"正常"），不同无人机数值组合唯一
5. 数据更新时两边同步刷新

## 架构现状

- 技术栈：Vue 3.5 + Vite + Element Plus，**无 Pinia/Vuex，无路由**
- 组件关系：`App.vue → DataScreen.vue`（`currentPage` 切换 main/monitoring/info）→ `MonitoringScreen.vue` 与 `InfoManagementPanel.vue` 是**兄弟关系**，均通过 `v-show` 始终渲染（状态不丢失），`DataScreen.vue` 持有两者 ref
- 字段差异：InfoManagementPanel 用 `name/model/transponderNo/bindTime/owner`；MonitoringScreen 兼容 `name||deviceName`、`transponderNo||serialNo`。**统一为 InfoManagementPanel 的字段名**（name/model/transponderNo/bindTime/owner）

## 实施方案

### 步骤 1：新建共享状态模块（数据同步核心）

新建 `src/stores/aircraft.js`（Vue 3 模块级 reactive 单例，无需引入 Pinia）：

```js
import { reactive, readonly } from 'vue'

// 飞行器列表共享状态（由 InfoManagementPanel 维护 CRUD，MonitoringScreen 只读消费）
const state = reactive({
  aircraftList: [
    { id: 'aircraft-001', name: '大疆', model: 'M3T', transponderNo: '11111', bindTime: '2024-12-02 10:06:50', owner: '张三' },
  ],
})

function setAircraftList(list) {
  state.aircraftList.splice(0, state.aircraftList.length, ...list)
}
function upsertAircraft(record) { /* 新增或更新 */ }
function removeAircraft(id) { /* 删除 */ }

export function useAircraftStore() {
  return {
    aircraftList: readonly(state.aircraftList), // 只读，防误改
    setAircraftList,
    upsertAircraft,
    removeAircraft,
  }
}
```

**理由**：两个组件是兄弟且无全局 store，模块级 reactive 单例是 Vue 3 最轻量的实时同步方案——任一方修改，另一方响应式自动更新，满足"实时有效"要求。

### 步骤 2：改造 InfoManagementPanel.vue（数据源迁移到共享状态）

- 删除本地 `const aircraftList = ref([...])`（[L86-95](file:///e:/E_Desk/CUMTB/uav_front/src/components/data-screen/functions/InfoManagementPanel.vue#L86-L95)）
- 改为从共享状态读取：`const { aircraftList: sharedAircraftList, upsertAircraft, removeAircraft, setAircraftList } = useAircraftStore()`
- 用 `computed` 派生本地使用的 `aircraftList`（保持分页/搜索逻辑兼容）：`const aircraftList = computed(() => sharedAircraftList.value)` 或直接用响应式数组
- `saveAircraft()`（[L508-531](file:///e:/E_Desk/CUMTB/uav_front/src/components/data-screen/functions/InfoManagementPanel.vue#L508-L531)）改为调用 `upsertAircraft(record)`（共享状态更新后，MonitoringScreen 自动同步）
- 删除/编辑/搜索逻辑保持不变，只是数据源从本地 ref 换成共享状态
- 列表显示**保留绑定时间**（InfoManagementPanel 是管理侧，需完整信息）

### 步骤 3：改造 MonitoringScreen.vue（移除接口 + 接入共享状态 + 交互）

#### 3.1 移除接口调用
- 删除 `fetchAircraftList()`（[L32-59](file:///e:/E_Desk/CUMTB/uav_front/src/components/MonitoringScreen.vue#L32-L59)）、`aircraftLoading`、`aircraftError`
- 删除 `onMounted` 中的 `fetchAircraftList()` 调用（[L270-273](file:///e:/E_Desk/CUMTB/uav_front/src/components/MonitoringScreen.vue#L270-L273)）
- 删除"刷新"按钮（[L1267-1270](file:///e:/E_Desk/CUMTB/uav_front/src/components/MonitoringScreen.vue#L1267-L1270)）——响应式自动同步，无需手动刷新

#### 3.2 接入共享状态
- `const { aircraftList } = useAircraftStore()` 替代原本地 `aircraftList`
- 列表项字段统一为 `aircraft.name`、`aircraft.model`、`aircraft.transponderNo`（移除 `||deviceName`、`||serialNo` 兼容写法）
- 列表项**不显示绑定时间**（符合用户要求，当前模板本就未显示，保持不变）

#### 3.3 添加列表项点击交互
- 模板列表项添加 `@click="selectAircraft(aircraft)"` 和选中高亮 class（[L1282-1295](file:///e:/E_Desk/CUMTB/uav_front/src/components/MonitoringScreen.vue#L1282-L1295)）
- 新增 `const selectedAircraftId = ref(null)` 记录当前选中

#### 3.4 数值随机生成算法（核心）
新增 `const aircraftMetricsCache = ref(new Map())` 缓存每架无人机的数值，保证唯一性：

```js
function generateUniqueMetrics(aircraftId) {
  // 复用缓存：同一无人机点击多次数值不变
  if (aircraftMetricsCache.value.has(aircraftId)) {
    return aircraftMetricsCache.value.get(aircraftId)
  }
  const used = new Set(
    [...aircraftMetricsCache.value.values()]
      .map(m => `${m.speed}-${m.battery}-${m.altitude}`)
  )
  // 组合空间 13*56*111=80808，冲突概率极低，重试即可
  let metrics = null
  for (let i = 0; i < 200; i++) {
    const speed = randInt(3, 15)      // 3-15 km/h（含边界）
    const battery = randInt(40, 95)   // 40-95 %（含边界）
    const altitude = randInt(10, 120) // 10-120 m（含边界）
    const key = `${speed}-${battery}-${altitude}`
    if (!used.has(key)) {
      metrics = { speed, battery, altitude, signal: '正常' }
      break
    }
  }
  // 极端兜底：仍冲突则取边界值偏移
  if (!metrics) metrics = { speed: 3, battery: 40, altitude: 10, signal: '正常' }
  aircraftMetricsCache.value.set(aircraftId, metrics)
  return metrics
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
```

#### 3.5 点击处理 + 更新无人机状态面板
```js
function selectAircraft(aircraft) {
  selectedAircraftId.value = aircraft.id
  const m = generateUniqueMetrics(aircraft.id)
  uavStatus.value = {
    online: true,
    speed: m.speed,        // 数值，单位 km/h
    battery: m.battery,    // 数值，单位 %
    altitude: m.altitude,  // 数值，单位 m
    signal: m.signal,      // 字符串 "正常"
    position: uavStatus.value.position, // 保持原值
    heading: uavStatus.value.heading,
  }
}
```

#### 3.6 无人机状态面板模板调整（[L1211-1261](file:///e:/E_Desk/CUMTB/uav_front/src/components/MonitoringScreen.vue#L1211-L1261)）
- 速度单位 `m/s` → `km/h`（[L1224](file:///e:/E_Desk/CUMTB/uav_front/src/components/MonitoringScreen.vue#L1224)）
- 信号项：移除数值 + `%` 显示和 strong/medium/weak 数值判断，改为显示 `{{ uavStatus.signal }}`（即"正常"文本，[L1244-1252](file:///e:/E_Desk/CUMTB/uav_front/src/components/MonitoringScreen.vue#L1244-L1252)）

### 步骤 4：处理已有无人机被删除时的缓存清理

InfoManagementPanel 删除飞行器时，MonitoringScreen 的 `aircraftMetricsCache` 需同步清理对应 id，避免幽灵数据。在 MonitoringScreen 中 `watch` 共享 `aircraftList`，删除缓存中不存在于列表的 id：

```js
watch(aircraftList, (list) => {
  const ids = new Set(list.map(a => a.id))
  for (const id of aircraftMetricsCache.value.keys()) {
    if (!ids.has(id)) aircraftMetricsCache.value.delete(id)
  }
  // 若当前选中被删除，清空选中状态
  if (selectedAircraftId.value && !ids.has(selectedAircraftId.value)) {
    selectedAircraftId.value = null
    // 可选：重置 uavStatus 为初始值
  }
}, { deep: true })
```

## 关键文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/stores/aircraft.js` | **新建** | 模块级共享状态（reactive 单例 + CRUD 函数） |
| `src/components/data-screen/functions/InfoManagementPanel.vue` | 修改 | `aircraftList` 迁移到共享状态，`saveAircraft` 改调 `upsertAircraft`；保留绑定时间显示 |
| `src/components/MonitoringScreen.vue` | 修改 | 移除接口调用与刷新按钮；接入共享状态；列表项点击交互；数值随机生成；状态面板单位/信号显示调整；删除时缓存清理 |

## 复用现有工具/函数

- `randInt` 风格的随机整数生成（项目内无现成工具，随用随定义即可）
- `updateAircraftPagination`/`searchAircraft` 等分页搜索逻辑保持不变（仅数据源替换）

## 验证方法（端到端）

1. `npm run dev` 启动开发服务器
2. 进入"信息管理系统 → 飞行器管理"：
   - 新增一架无人机 → 切到"实时监控大屏" → 右下角面板应立即出现该无人机（同步生效）
   - 编辑某架无人机名称 → 切回监控大屏 → 面板中名称同步更新
   - 删除某架无人机 → 监控大屏面板中该项消失
3. 在监控大屏右下角面板：
   - 点击无人机 A → 中下"无人机状态"面板显示 速度∈[3,15]km/h、电量∈[40,95]%、高度∈[10,120]m、信号"正常"
   - 再点击无人机 B → 数值刷新，且与 A 的 (speed,battery,altitude) 组合不同（唯一性）
   - 再次点击 A → 数值与首次相同（缓存复用，同一无人机数值稳定）
   - 状态面板速度单位显示 km/h、信号显示"正常"文本
   - 监控大屏面板列表项不显示绑定时间
4. 切换主题（天空白/科技蓝/清新绿）确认样式无破坏
