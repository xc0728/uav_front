<script setup>
import { reactive, ref, computed } from 'vue'

const props = defineProps({
  mapReady: {
    type: Boolean,
    default: false
  },
  noFlyZones: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits([
  'draw-sphere-fence',
  'draw-line-fence',
  'complete-sphere-fence',
  'complete-line-fence',
  'clear-fence',
  'toggle-fence',
  'delete-fence',
  'save-fence',
  'draw-fence'
])

const FENCE_TYPE_SPHERE = 'sphere'
const FENCE_TYPE_LINE = 'line'

const currentMode = ref(null)

const sphereForm = reactive({
  name: '',
  radius: 100
})

const lineForm = reactive({
  name: '',
  halfWidth: 15,
  halfHeight: 15
})

const fenceList = ref([])
const isDrawing = ref(false)

const noFlyZoneList = computed(() => {
  return Object.values(props.noFlyZones).map(zone => ({
    id: `noflyzone-${zone.zone_id}`,
    name: zone.name || '未命名禁飞区',
    type: 'noflyzone',
    typeCode: zone.type_code,
    typeName: zone.type_name || (zone.type_code === 'electronic_fence' ? '电子围栏' : '风险区域'),
    enabled: true,
    bottom: zone.bottom,
    top: zone.top,
    createdAt: zone.create_time ? new Date(zone.create_time * 1000).toISOString() : '',
  }))
})

const sphereColor = '#f59e0b'
const lineColor = '#22d3ee'

const canDrawSphere = computed(() => {
  return sphereForm.radius > 0
})

const canDrawLine = computed(() => {
  return lineForm.halfWidth > 0 && lineForm.halfHeight > 0
})

function startDrawSphere() {
  currentMode.value = FENCE_TYPE_SPHERE
  isDrawing.value = true
  emit('draw-sphere-fence', {
    type: FENCE_TYPE_SPHERE,
    radius: sphereForm.radius
  })
}

function startDrawLine() {
  currentMode.value = FENCE_TYPE_LINE
  isDrawing.value = true
  emit('draw-line-fence', {
    type: FENCE_TYPE_LINE,
    halfWidth: lineForm.halfWidth,
    halfHeight: lineForm.halfHeight
  })
}

function backToList() {
  currentMode.value = null
  isDrawing.value = false
  emit('clear-fence')
}

function cancelDraw() {
  backToList()
}

function confirmDraw() {
  if (currentMode.value === FENCE_TYPE_SPHERE) {
    emit('complete-sphere-fence', {
      type: FENCE_TYPE_SPHERE,
      params: { radius: sphereForm.radius },
      name: sphereForm.name || `围栏${fenceList.value.length + 1}`
    })
  } else if (currentMode.value === FENCE_TYPE_LINE) {
    emit('complete-line-fence', {
      type: FENCE_TYPE_LINE,
      params: { halfWidth: lineForm.halfWidth, halfHeight: lineForm.halfHeight },
      name: lineForm.name || `围栏${fenceList.value.length + 1}`
    })
  }
}

function toggleFence(id) {
  const fence = fenceList.value.find(f => f.id === id)
  if (fence) {
    fence.enabled = !fence.enabled
    emit('toggle-fence', fence)
  }
}

function deleteFence(id) {
  fenceList.value = fenceList.value.filter(f => f.id !== id)
  emit('delete-fence', id)
}

function saveFences() {
  if (fenceList.value.length === 0) {
    alert('暂无围栏可保存')
    return
  }
  emit('save-fence', fenceList.value)
  console.log('围栏数据已准备好保存:', fenceList.value)
  alert('围栏数据已准备好，等待后端API实现')
}

function clearAllFences() {
  fenceList.value = []
  emit('clear-fence')
}

function getFenceTypeLabel(type) {
  if (type === FENCE_TYPE_SPHERE) return '球形'
  if (type === FENCE_TYPE_LINE) return '线状'
  return ''
}

function getFenceTypeIcon(type) {
  if (type === FENCE_TYPE_SPHERE) return '●'
  if (type === FENCE_TYPE_LINE) return '—'
  return '●'
}

function getFenceTypeColor(type) {
  if (type === FENCE_TYPE_SPHERE) return sphereColor
  if (type === FENCE_TYPE_LINE) return lineColor
  return sphereColor
}

function confirmFenceDraw(data) {
  let fence
  if (data.type === FENCE_TYPE_SPHERE) {
    fence = {
      id: Date.now(),
      name: sphereForm.name || `围栏${fenceList.value.length + 1}`,
      type: FENCE_TYPE_SPHERE,
      params: { radius: sphereForm.radius },
      enabled: true,
      createdAt: new Date().toISOString(),
      center: data.center,
      gridCells: data.gridCells
    }
    sphereForm.name = ''
  } else if (data.type === FENCE_TYPE_LINE) {
    fence = {
      id: Date.now(),
      name: lineForm.name || `围栏${fenceList.value.length + 1}`,
      type: FENCE_TYPE_LINE,
      params: { halfWidth: lineForm.halfWidth, halfHeight: lineForm.halfHeight },
      enabled: true,
      createdAt: new Date().toISOString(),
      points: data.points,
      gridCells: data.gridCells
    }
    lineForm.name = ''
  }

  if (fence) {
    fenceList.value.push(fence)
    backToList()
    emit('draw-fence', fence)
  }
}

function addFence(fence) {
  fenceList.value.push(fence)
  backToList()
}

defineExpose({
  confirmFenceDraw,
  addFence,
  fences: fenceList,
})
</script>

<template>
  <div class="electronic-fence-panel">
    <div class="panel-title">
      <span>禁飞区</span>
    </div>

    <div v-if="currentMode" class="draw-form-section">
      <div class="form-header">
        <span class="form-title">{{ currentMode === 'sphere' ? '球形围栏参数' : '线状围栏参数' }}</span>
      </div>

      <div v-if="currentMode === FENCE_TYPE_SPHERE" class="fence-form">
        <div class="form-row">
          <label class="form-label">围栏名称</label>
          <input
            v-model="sphereForm.name"
            type="text"
            class="form-input"
            placeholder="请输入围栏名称"
          >
        </div>
        <div class="form-row">
          <label class="form-label">半径 (m)</label>
          <input
            v-model.number="sphereForm.radius"
            type="number"
            class="form-input"
            min="1"
            step="1"
          >
        </div>
        <div v-if="!canDrawSphere" class="form-tip error">
          半径必须大于0
        </div>
        <div class="form-tip">
          请在地图上点击选择球心位置
        </div>
      </div>

      <div v-if="currentMode === FENCE_TYPE_LINE" class="fence-form">
        <div class="form-row">
          <label class="form-label">围栏名称</label>
          <input
            v-model="lineForm.name"
            type="text"
            class="form-input"
            placeholder="请输入围栏名称"
          >
        </div>
        <div class="form-row">
          <label class="form-label">半宽 (m)</label>
          <input
            v-model.number="lineForm.halfWidth"
            type="number"
            class="form-input"
            min="1"
            step="1"
          >
        </div>
        <div class="form-row">
          <label class="form-label">半高 (m)</label>
          <input
            v-model.number="lineForm.halfHeight"
            type="number"
            class="form-input"
            min="1"
            step="1"
          >
        </div>
        <div v-if="!canDrawLine" class="form-tip error">
          半宽和半高必须大于0
        </div>
        <div class="form-tip">
          请在地图上点击添加多个点组成线段
        </div>
      </div>

      <div class="draw-controls">
        <button
          class="control-btn confirm-btn"
          @click="confirmDraw"
          :disabled="currentMode === FENCE_TYPE_SPHERE ? !canDrawSphere : !canDrawLine"
        >
          完成绘制
        </button>
        <button class="control-btn cancel-btn" @click="cancelDraw">
          取消
        </button>
      </div>
    </div>

    <div v-else class="fence-list-section">
      <div class="section-header">
        <span class="section-label">已绘制禁飞区 ({{ fenceList.length + noFlyZoneList.length }})</span>
        <!-- <div class="section-actions">
          <button
            class="action-btn"
            @click="clearAllFences"
            :disabled="fenceList.length === 0"
            title="清除所有围栏"
          >
            清空
          </button>
          <button
            class="action-btn save-btn"
            @click="saveFences"
            :disabled="fenceList.length === 0"
            title="保存围栏"
          >
            保存
          </button>
        </div> -->
      </div>

      <div v-if="fenceList.length === 0 && noFlyZoneList.length === 0" class="empty-list">
        暂无禁飞区
      </div>

      <div v-else class="fence-items">
        <div
          v-for="zone in noFlyZoneList"
          :key="zone.id"
          class="fence-item"
        >
          <div class="fence-item-header">
            <span class="fence-icon" style="color: #ef4444">
              ⛔
            </span>
            <span class="fence-name">{{ zone.name }}</span>
            <span
              class="fence-type-tag"
              :style="{
                background: zone.typeCode === 'electronic_fence' ? '#5b9fd433' : '#a855f733',
                color: zone.typeCode === 'electronic_fence' ? '#5b9fd4' : '#a855f7'
              }"
            >
              {{ zone.typeName }}
            </span>
          </div>
          <div class="fence-item-info">
            <span>底: {{ zone.bottom }}m | 顶: {{ zone.top }}m</span>
          </div>
        </div>

        <div
          v-for="fence in fenceList"
          :key="fence.id"
          class="fence-item"
          :class="{ disabled: !fence.enabled }"
        >
          <div class="fence-item-header">
            <span
              class="fence-icon"
              :style="{ color: getFenceTypeColor(fence.type) }"
            >
              {{ getFenceTypeIcon(fence.type) }}
            </span>
            <span class="fence-name">{{ fence.name }}</span>
            <span
              class="fence-type-tag"
              :style="{
                background: getFenceTypeColor(fence.type) + '33',
                color: getFenceTypeColor(fence.type)
              }"
            >
              {{ getFenceTypeLabel(fence.type) }}
            </span>
          </div>
          <div class="fence-item-info">
            <span v-if="fence.type === FENCE_TYPE_SPHERE">半径: {{ fence.params.radius }}m</span>
            <span v-else-if="fence.type === FENCE_TYPE_LINE">半宽: {{ fence.params.halfWidth }}m | 半高: {{ fence.params.halfHeight }}m</span>
          </div>
          <div class="fence-item-actions">
            <button
              class="item-action-btn"
              @click="toggleFence(fence.id)"
              :title="fence.enabled ? '禁用围栏' : '启用围栏'"
            >
              {{ fence.enabled ? '隐藏' : '显示' }}
            </button>
            <button
              class="item-action-btn delete"
              @click="deleteFence(fence.id)"
              title="删除围栏"
            >
              删除
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.electronic-fence-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  overflow-y: auto;
  padding: 10px;
  background: transparent;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
  font-size: 14px;
  font-weight: bold;
  color: #2d3748;
  background: transparent;
}

.title-icon {
  color: #2b6cb0;
  font-size: 16px;
}

.section-label {
  font-size: 12px;
  color: #4a5568;
}

.draw-form-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  background: transparent;
  border: 1px solid rgba(226, 232, 240, 0.4);
}

.form-header {
  padding-bottom: 8px;
  border-bottom: 1px solid #e2e8f0;
}

.form-title {
  font-size: 13px;
  font-weight: bold;
  color: #2d3748;
}

.fence-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-label {
  font-size: 12px;
  color: #4a5568;
}

.form-input {
  padding: 6px 8px;
  border: 1px solid #cbd5e0;
  background: rgba(255, 255, 255, 0.3);
  color: #2d3748;
  font-size: 12px;
}

.form-input:focus {
  outline: none;
  border-color: #3182ce;
}

.form-tip {
  padding: 6px 8px;
  background: rgba(235, 248, 255, 0.3);
  border: 1px solid rgba(144, 205, 244, 0.3);
  color: #2b6cb0;
  font-size: 11px;
}

.form-tip.error {
  background: rgba(255, 245, 245, 0.3);
  border-color: rgba(254, 178, 178, 0.3);
  color: #c53030;
}

.draw-controls {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.control-btn {
  flex: 1;
  padding: 8px;
  font-size: 12px;
  cursor: pointer;
}

.confirm-btn {
  background: #3182ce;
  border: 1px solid #2b6cb0;
  color: #fff;
}

.confirm-btn:hover:not(:disabled) {
  background: #2b6cb0;
}

.confirm-btn:disabled {
  background: #a0aec0;
  border-color: #718096;
  cursor: not-allowed;
}

.cancel-btn {
  background: rgba(247, 250, 252, 0.3);
  border: 1px solid rgba(203, 213, 224, 0.4);
  color: #4a5568;
}

.cancel-btn:hover {
  background: rgba(237, 242, 247, 0.3);
}

.fence-list-section {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.section-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  padding: 4px 10px;
  background: rgba(237, 242, 247, 0.3);
  border: 1px solid rgba(203, 213, 224, 0.4);
  color: #4a5568;
  font-size: 11px;
  cursor: pointer;
}

.action-btn:hover:not(:disabled) {
  background: rgba(226, 232, 240, 0.3);
}

.action-btn:disabled {
  color: #a0aec0;
  cursor: not-allowed;
}

.action-btn.save-btn {
  background: rgba(198, 246, 213, 0.3);
  border-color: rgba(154, 230, 180, 0.4);
  color: #276749;
}

.action-btn.save-btn:hover:not(:disabled) {
  background: rgba(154, 230, 180, 0.3);
}

.empty-list {
  padding: 20px;
  text-align: center;
  color: #a0aec0;
  font-size: 12px;
  background: transparent;
  border: 1px dashed rgba(203, 213, 224, 0.4);
}

.fence-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  flex: 1;
}

.fence-item {
  padding: 10px;
  background: rgba(247, 250, 252, 0.3);
  border: 1px solid rgba(226, 232, 240, 0.4);
}

.fence-item.disabled {
  opacity: 0.5;
}

.fence-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.fence-icon {
  font-size: 14px;
}

.fence-name {
  font-size: 13px;
  color: #2d3748;
  font-weight: 500;
  flex: 1;
}

.fence-type-tag {
  font-size: 10px;
  padding: 2px 6px;
}

.fence-item-info {
  font-size: 11px;
  color: #718096;
  margin-bottom: 6px;
}

.fence-item-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.item-action-btn {
  padding: 3px 8px;
  background: rgba(255, 255, 255, 0.3);
  border: 1px solid rgba(203, 213, 224, 0.4);
  color: #4a5568;
  font-size: 11px;
  cursor: pointer;
}

.item-action-btn:hover {
  background: rgba(237, 242, 247, 0.3);
}

.item-action-btn.delete {
  color: #c53030;
  border-color: #feb2b2;
}

.item-action-btn.delete:hover {
  background: rgba(255, 245, 245, 0.3);
}
</style>
