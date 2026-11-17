<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

const emit = defineEmits(['resize'])
const panel = ref(null)
const width = ref(null)
const dragging = ref(false)
let observer
let startX = 0
let startWidth = 0

function setWidth(value) {
  const available = Math.max(0, panel.value.parentElement.clientWidth - 32)
  width.value = Math.min(Math.max(Math.min(360, available), value), 560, available)
}

function startResize(event) {
  if (event.button !== 0) return
  startX = event.clientX
  startWidth = panel.value.getBoundingClientRect().width
  dragging.value = true
  event.currentTarget.setPointerCapture(event.pointerId)
}

function resize(event) {
  if (dragging.value) setWidth(startWidth + startX - event.clientX)
}

function resetWidth() {
  width.value = null
}

function resizeWithKeyboard(event) {
  if (event.key === 'Home') {
    event.preventDefault()
    resetWidth()
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    setWidth(panel.value.getBoundingClientRect().width + (event.key === 'ArrowLeft' ? 20 : -20))
  }
}

onMounted(() => {
  observer = new ResizeObserver(() => emit('resize', panel.value.getBoundingClientRect().width))
  observer.observe(panel.value)
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <aside ref="panel" :style="width === null ? undefined : { width: `${width}px` }" :class="{ 'is-resizing': dragging }">
    <button
      type="button"
      class="resize-handle"
      aria-label="调整图例宽度，左右方向键调节，Home 恢复自适应"
      title="拖动调整宽度，双击恢复自适应"
      @pointerdown.stop.prevent="startResize"
      @pointermove.stop="resize"
      @pointerup="dragging = false"
      @pointercancel="dragging = false"
      @lostpointercapture="dragging = false"
      @dblclick="resetWidth"
      @keydown="resizeWithKeyboard"
    />
    <div class="chart-panel-content"><slot /></div>
  </aside>
</template>

<style scoped>
aside {
  display: flex;
  flex-direction: column;
}
.chart-panel-content {
  box-sizing: border-box;
  min-height: 0;
  overflow: auto;
  padding: 12px;
  scrollbar-width: thin;
  scrollbar-color: #64748b transparent;
}
.resize-handle {
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: -5px;
  width: 10px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  cursor: ew-resize;
  touch-action: none;
  z-index: 1;
}
.resize-handle::after {
  content: '';
  position: absolute;
  top: calc(50% - 20px);
  left: 4px;
  width: 3px;
  height: 40px;
  border-radius: 3px;
  background: #94a3b8;
}
.resize-handle:hover::after,
.resize-handle:focus-visible::after,
.is-resizing .resize-handle::after { background: #60a5fa; }
.is-resizing { user-select: none; }
</style>
