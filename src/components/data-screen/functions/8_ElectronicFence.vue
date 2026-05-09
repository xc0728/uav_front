<script setup>
import { reactive, ref, computed } from 'vue'
import { Loader2, Trash2, Plus, Circle, Eye, EyeOff, Save, ArrowLeft, Minus } from 'lucide-vue-next'

const props = defineProps({
  mapReady: {
    type: Boolean,
    default: false
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

// 围栏类型
const FENCE_TYPE_SPHERE = 'sphere'
const FENCE_TYPE_LINE = 'line'

// 当前绘制模式
const currentMode = ref(null)

// 球形围栏表单
const sphereForm = reactive({
  name: '',
  radius: 100
})

// 线状围栏表单
const lineForm = reactive({
  name: '',
  halfWidth: 15,
  halfHeight: 15
})

// 围栏列表
const fenceList = ref([])

// 是否正在绘制中
const isDrawing = ref(false)

// 围栏样式颜色
const sphereColor = '#fbbf24'
const lineColor = '#22d3ee'

// 表单验证
const canDrawSphere = computed(() => {
  return sphereForm.radius > 0
})

const canDrawLine = computed(() => {
  return lineForm.halfWidth > 0 && lineForm.halfHeight > 0
})

// 开始绘制球形围栏
function startDrawSphere() {
  currentMode.value = FENCE_TYPE_SPHERE
  isDrawing.value = true
  emit('draw-sphere-fence', {
    type: FENCE_TYPE_SPHERE,
    radius: sphereForm.radius
  })
}

// 开始绘制线状围栏
function startDrawLine() {
  currentMode.value = FENCE_TYPE_LINE
  isDrawing.value = true
  emit('draw-line-fence', {
    type: FENCE_TYPE_LINE,
    halfWidth: lineForm.halfWidth,
    halfHeight: lineForm.halfHeight
  })
}

// 返回列表视图
function backToList() {
  currentMode.value = null
  isDrawing.value = false
  emit('clear-fence')
}

// 取消绘制
function cancelDraw() {
  backToList()
}

// 确认绘制完成
function confirmDraw() {
  if (currentMode.value === FENCE_TYPE_SPHERE) {
    // 球形围栏需要从地图获取点数据
    emit('complete-sphere-fence', {
      type: FENCE_TYPE_SPHERE,
      params: { radius: sphereForm.radius },
      name: sphereForm.name || `围栏${fenceList.value.length + 1}`
    })
  } else if (currentMode.value === FENCE_TYPE_LINE) {
    // 线状围栏需要从地图获取点数据
    emit('complete-line-fence', {
      type: FENCE_TYPE_LINE,
      params: { halfWidth: lineForm.halfWidth, halfHeight: lineForm.halfHeight },
      name: lineForm.name || `围栏${fenceList.value.length + 1}`
    })
  }
}

// 切换围栏启用状态
function toggleFence(id) {
  const fence = fenceList.value.find(f => f.id === id)
  if (fence) {
    fence.enabled = !fence.enabled
    emit('toggle-fence', fence)
  }
}

// 删除围栏
function deleteFence(id) {
  fenceList.value = fenceList.value.filter(f => f.id !== id)
  emit('delete-fence', id)
}

// 保存围栏到后端（按钮功能，API未实现）
function saveFences() {
  if (fenceList.value.length === 0) {
    alert('暂无围栏可保存')
    return
  }
  emit('save-fence', fenceList.value)
  console.log('围栏数据已准备好保存:', fenceList.value)
  alert('围栏数据已准备好，等待后端API实现')
}

// 清除所有围栏
function clearAllFences() {
  fenceList.value = []
  emit('clear-fence')
}

// 获取围栏类型的显示标签
function getFenceTypeLabel(type) {
  if (type === FENCE_TYPE_SPHERE) return '球形'
  if (type === FENCE_TYPE_LINE) return '线状'
  return ''
}

// 获取围栏类型的图标
function getFenceTypeIcon(type) {
  if (type === FENCE_TYPE_SPHERE) return Circle
  if (type === FENCE_TYPE_LINE) return Minus
  return Circle
}

// 获取围栏类型的颜色
function getFenceTypeColor(type) {
  if (type === FENCE_TYPE_SPHERE) return sphereColor
  if (type === FENCE_TYPE_LINE) return lineColor
  return sphereColor
}

// 确认围栏绘制完成（由CesiumMap调用）
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

// 暴露方法给父组件
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
    <!-- 面板标题 -->
    <div class="panel-title">
      <span class="title-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      </span>
      <span>电子围栏</span>
    </div>

    <!-- 绘制功能暂时禁用 -->
    <!-- 绘制模式切换 -->
    <!-- <div class="draw-mode-section">
      <div class="section-label">绘制模式</div>
      <div class="draw-mode-buttons">
        <button
          class="mode-btn sphere-btn"
          :class="{ active: currentMode === FENCE_TYPE_SPHERE }"
          @click="startDrawSphere"
        >
          <Circle :size="16" />
          <span>球形围栏</span>
        </button>
        <button
          class="mode-btn line-btn"
          :class="{ active: currentMode === FENCE_TYPE_LINE }"
          @click="startDrawLine"
        >
          <Minus :size="16" />
          <span>线状围栏</span>
        </button>
      </div>
    </div> -->

    <!-- 绘制参数表单（点击绘制模式后显示） -->
    <div v-if="currentMode" class="draw-form-section">
      <!-- 返回按钮 -->
      <button class="back-btn" @click="backToList">
        <ArrowLeft :size="14" />
        <span>返回列表</span>
      </button>

      <!-- 球形围栏参数 -->
      <div v-if="currentMode === FENCE_TYPE_SPHERE" class="fence-form sphere-form">
        <div class="form-header">
          <Circle :size="16" :style="{ color: sphereColor }" />
          <span class="form-title">球形围栏参数</span>
        </div>
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
        <div class="form-tip info">
          请在地图上点击选择球心位置
        </div>
      </div>

      <!-- 线状围栏参数 -->
      <div v-if="currentMode === FENCE_TYPE_LINE" class="fence-form line-form">
        <div class="form-header">
          <Minus :size="16" :style="{ color: lineColor }" />
          <span class="form-title">线状围栏参数</span>
        </div>
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
        <div class="form-tip info">
          请在地图上点击添加多个点组成线段，完成后点击"完成绘制"
        </div>
      </div>

      <!-- 绘制控制按钮 -->
      <div class="draw-controls">
        <button
          class="control-btn confirm-btn"
          @click="confirmDraw"
          :disabled="currentMode === FENCE_TYPE_SPHERE ? !canDrawSphere : !canDrawLine"
        >
          <Plus :size="14" />
          完成绘制
        </button>
        <button class="control-btn cancel-btn" @click="cancelDraw">
          取消
        </button>
      </div>
    </div>

    <!-- 已绘制围栏列表（默认显示） -->
    <div v-else class="fence-list-section">
      <div class="section-header">
        <span class="section-label">已绘制围栏 ({{ fenceList.length }})</span>
        <div class="section-actions">
          <button
            class="action-btn clear-btn"
            @click="clearAllFences"
            :disabled="fenceList.length === 0"
            title="清除所有围栏"
          >
            <Trash2 :size="14" />
          </button>
          <button
            class="action-btn save-btn"
            @click="saveFences"
            :disabled="fenceList.length === 0"
            title="保存围栏"
          >
            <Save :size="14" />
          </button>
        </div>
      </div>

      <div v-if="fenceList.length === 0" class="empty-list">
        暂无围栏，点击上方按钮开始绘制
      </div>

      <div v-else class="fence-items">
        <div
          v-for="fence in fenceList"
          :key="fence.id"
          class="fence-item"
          :class="{ disabled: !fence.enabled }"
        >
          <div class="fence-item-header">
            <component
              :is="getFenceTypeIcon(fence.type)"
              :size="14"
              :style="{ color: getFenceTypeColor(fence.type) }"
            />
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
              <Eye v-if="fence.enabled" :size="14" />
              <EyeOff v-else :size="14" />
            </button>
            <button
              class="item-action-btn delete"
              @click="deleteFence(fence.id)"
              title="删除围栏"
            >
              <Trash2 :size="14" />
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
  gap: 12px;
  height: 100%;
  overflow-y: auto;
  padding-right: 4px;
}

/* 面板标题 */
.panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 15px;
  font-weight: 600;
  color: #f1f5f9;
}

.title-icon {
  color: #f59e0b;
  display: flex;
  align-items: center;
}

/* 区块标题 */
.section-label {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 8px;
}

/* 绘制模式 */
.draw-mode-section {
  padding: 10px;
  background: rgba(30, 41, 59, 0.5);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.draw-mode-buttons {
  display: flex;
  gap: 10px;
}

.mode-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: #94a3b8;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-btn:hover {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
}

.mode-btn.active {
  color: #fff;
}

.mode-btn.sphere-btn.active {
  border-color: rgba(251, 191, 36, 0.6);
  background: rgba(251, 191, 36, 0.2);
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.3);
}

.mode-btn.line-btn.active {
  border-color: rgba(34, 211, 238, 0.6);
  background: rgba(34, 211, 238, 0.2);
  box-shadow: 0 0 12px rgba(34, 211, 238, 0.3);
}

/* 绘制表单区域 */
.draw-form-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: rgba(30, 41, 59, 0.6);
  border-radius: 12px;
  border: 1px solid rgba(59, 130, 246, 0.2);
  animation: slideIn 0.25s ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 返回按钮 */
.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: #94a3b8;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  align-self: flex-start;
}

.back-btn:hover {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.3);
  color: #60a5fa;
}

/* 围栏表单 */
.fence-form {
  padding: 14px;
  background: rgba(30, 41, 59, 0.4);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.fence-form.sphere-form {
  border-color: rgba(251, 191, 36, 0.25);
}

.fence-form.line-form {
  border-color: rgba(34, 211, 238, 0.25);
}

.form-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.form-title {
  font-size: 14px;
  font-weight: 500;
  color: #e2e8f0;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.form-row:last-of-type {
  margin-bottom: 0;
}

.form-label {
  font-size: 12px;
  color: #94a3b8;
}

.form-input {
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.3);
  color: #f1f5f9;
  font-size: 13px;
  transition: all 0.15s ease;
}

.form-input:focus {
  outline: none;
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.1);
}

.form-tip {
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  margin-top: 10px;
}

.form-tip.info {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.form-tip.error {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

/* 绘制控制按钮 */
.draw-controls {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

.control-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  border-radius: 8px;
  border: none;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.confirm-btn {
  background: linear-gradient(135deg, #3b82f6, #0ea5e9);
  color: #fff;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.confirm-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4);
}

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cancel-btn {
  background: rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.cancel-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
  color: #fca5a5;
}

/* 围栏列表 */
.fence-list-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.section-actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.action-btn:hover:not(:disabled) {
  border-color: rgba(59, 130, 246, 0.4);
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.action-btn.save-btn:hover:not(:disabled) {
  border-color: rgba(34, 197, 94, 0.4);
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}

.action-btn.clear-btn:hover:not(:disabled) {
  border-color: rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.empty-list {
  padding: 24px;
  text-align: center;
  color: #64748b;
  font-size: 13px;
  background: rgba(30, 41, 59, 0.3);
  border-radius: 10px;
  border: 1px dashed rgba(255, 255, 255, 0.1);
}

.fence-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  flex: 1;
}

.fence-item {
  padding: 12px;
  background: rgba(30, 41, 59, 0.5);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: all 0.2s ease;
}

.fence-item:hover {
  border-color: rgba(251, 191, 36, 0.3);
  background: rgba(30, 41, 59, 0.7);
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

.fence-name {
  font-size: 14px;
  font-weight: 500;
  color: #f1f5f9;
  flex: 1;
}

.fence-type-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
}

.fence-item-info {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 8px;
}

.fence-item-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.item-action-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.item-action-btn:hover {
  border-color: rgba(59, 130, 246, 0.4);
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.item-action-btn.delete:hover {
  border-color: rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
}
</style>
