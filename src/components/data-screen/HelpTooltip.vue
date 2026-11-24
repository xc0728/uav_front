<script>
// 同一选项可有多条说明；共享登记表确保条件切换、卸载时不会互相覆盖。
const bindings = new WeakMap()

function updateAttribute(element, name, notes, owner, text) {
  let attributes = bindings.get(element)
  if (!attributes) {
    attributes = new Map()
    bindings.set(element, attributes)
  }
  let record = attributes.get(name)
  if (!record) {
    record = { original: element.getAttribute(name), written: null, notes: new Map() }
    attributes.set(name, record)
  }
  const current = element.getAttribute(name)
  if (record.written !== null && current !== record.written) record.original = current
  if (text) record.notes.set(owner, text)
  else record.notes.delete(owner)
  const combined = [record.original, ...record.notes.values()].filter(Boolean).join(notes)
  const value = name === 'aria-describedby' ? [...new Set(combined.split(/\s+/).filter(Boolean))].join(' ') : combined
  if (value) element.setAttribute(name, value)
  else element.removeAttribute(name)
  record.written = value || null
  if (!record.notes.size) {
    attributes.delete(name)
    if (!attributes.size) bindings.delete(element)
  }
}
</script>

<script setup>
import { onBeforeUnmount, onMounted, onUpdated, ref, useId } from 'vue'

const props = defineProps({
  // 相对说明所在容器选择已有文字/控件；不传时绑定当前字段容器。
  target: { type: String, default: '' },
  id: { type: String, default: '' },
})

const generatedId = `help-description-${useId()}`
const description = ref(null)
const owner = Symbol('help-tooltip')
let attached = []
let observer

function clearBindings() {
  for (const { element, name, separator } of attached) {
    updateAttribute(element, name, separator, owner, '')
  }
  attached = []
}

function refreshBindings() {
  const container = description.value?.parentElement
  if (!container) return
  const text = description.value.textContent.replace(/\s+/g, ' ').trim()
  const targets = props.target ? [...container.querySelectorAll(props.target)] : [container]
  const next = []
  for (const element of targets) {
    next.push({ element, name: 'title', separator: '\n', text })
    // title 会继承到子控件；无障碍描述同时直接关联可聚焦的原有控件。
    for (const control of [element, ...element.querySelectorAll('input, select, textarea, button, [tabindex]')]) {
      next.push({ element: control, name: 'aria-describedby', separator: ' ', text: props.id || generatedId })
    }
  }
  for (const previous of attached) {
    if (!next.some(item => item.element === previous.element && item.name === previous.name)) {
      updateAttribute(previous.element, previous.name, previous.separator, owner, '')
    }
  }
  for (const item of next) updateAttribute(item.element, item.name, item.separator, owner, item.text)
  attached = next
}

onMounted(() => {
  refreshBindings()
  // 支持 v-if 切换字段及动态说明；只观察内容，不观察自身写入的属性。
  observer = new MutationObserver(refreshBindings)
  observer.observe(description.value.parentElement, { childList: true, subtree: true, characterData: true })
})
onUpdated(refreshBindings)
onBeforeUnmount(() => {
  observer?.disconnect()
  clearBindings()
})
</script>

<template>
  <!-- 不增加独立入口，也不包装或拦截原控件的点击与选择事件。 -->
  <span :id="id || generatedId" ref="description" hidden><slot /></span>
</template>