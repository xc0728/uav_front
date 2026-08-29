import { ref } from 'vue'

// 飞行器列表共享状态（模块级单例）
// - InfoManagementPanel 作为数据源维护 CRUD
// - MonitoringScreen 只读消费，响应式自动同步
const aircraftList = ref([
  {
    id: 'aircraft-001',
    name: '大疆',
    model: 'M3T',
    transponderNo: '11111',
    bindTime: '2024-12-02 10:06:50',
    owner: '张三',
  },
])

// 整体替换列表
function setAircraftList(list) {
  aircraftList.value = Array.isArray(list) ? list : []
}

// 新增或更新（按 id 判断）
function upsertAircraft(record) {
  if (!record || !record.id) return
  const idx = aircraftList.value.findIndex(a => a.id === record.id)
  if (idx >= 0) {
    // 替换该位置记录，保持响应式
    aircraftList.value.splice(idx, 1, record)
  } else {
    aircraftList.value.unshift(record)
  }
}

// 删除
function removeAircraft(id) {
  if (!id) return
  const idx = aircraftList.value.findIndex(a => a.id === id)
  if (idx >= 0) aircraftList.value.splice(idx, 1)
}

export function useAircraftStore() {
  return {
    aircraftList, // ref，解构后保持响应性
    setAircraftList,
    upsertAircraft,
    removeAircraft,
  }
}
