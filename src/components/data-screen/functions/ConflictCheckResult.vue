<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { conflictReasonsText, MODEL_SOURCE_LABELS, resolveConflictGrid } from '../../../utils/conflictCheck.js'
import { noiseAttributeLabel } from '../../../utils/noiseGrid.js'
const props = defineProps({ result: { type: Object, required: true } })
const emit = defineEmits(['focus-grid'])
const selectedCode = ref('')
const pendingCode = ref('')
const focusError = ref('')
const resolvedGrids = new Map()
let focusRequest
const gridKey = grid => String(grid.code || '').replace(/^dqg/, '')
function resetFocus() {
  focusRequest?.abort()
  selectedCode.value = ''; pendingCode.value = ''; focusError.value = ''
  resolvedGrids.clear()
}
watch(() => props.result, resetFocus)
onBeforeUnmount(resetFocus)
async function focusGrid(grid) {
  focusRequest?.abort()
  const current = new AbortController()
  focusRequest = current
  pendingCode.value = gridKey(grid)
  focusError.value = ''
  try {
    const detail = resolvedGrids.get(gridKey(grid)) || await resolveConflictGrid(grid, { signal: current.signal })
    if (current.signal.aborted) return
    resolvedGrids.set(detail.code, detail)
    selectedCode.value = detail.code
    emit('focus-grid', detail)
  } catch (error) {
    if (!current.signal.aborted) focusError.value = `网格定位失败：${error.message}`
  } finally {
    if (focusRequest === current) pendingCode.value = ''
  }
}
</script>
<template>
  <section class="conflict-result" aria-live="polite">
    <h4 :class="{ warning: result.data.conflict }">{{ result.data.conflict ? '发现冲突或数据缺测' : '所选条件下未发现冲突' }}</h4>
    <p>已判定网格 {{ result.data.checkedGridCount }} · 冲突网格 {{ result.data.conflictGridCount }}</p>
    <p class="muted">L17 · 数据集 {{ result.data.datasetId || result.data.airspaceId }} · 版本 {{ result.data.datasetVersion ?? result.data.version }} · 状态修订 {{ result.data.stateRevision }}</p>
    <p v-if="result.mode === 'FIRST' && result.data.conflict" class="muted">仅返回首个冲突，其余航迹不代表已通过检测；地图灰色格网不作安全结论。</p>
    <p v-if="result.visualizationWarning" role="alert" class="warning">{{ result.visualizationWarning }}</p>
    <details v-if="result.data.ruleMode === 'catalog'">
      <summary>已执行 {{ result.data.appliedRules?.length || 0 }} 项可选规则及正式维护强制约束</summary>
      <p v-for="rule in result.data.appliedRules || []" :key="rule.elementId">{{ rule.elementName }} · {{ rule.methodName || rule.method }}</p>
    </details>
    <p v-if="focusError" role="alert" class="warning">{{ focusError }}</p>
    <article v-for="(grid, index) in result.grids" :key="grid.code"
      role="button" tabindex="0" :aria-label="`定位冲突网格 ${grid.code}`"
      :aria-pressed="selectedCode === gridKey(grid)" :aria-busy="pendingCode === gridKey(grid)"
      :class="{ selected: selectedCode === gridKey(grid) }"
      @click="focusGrid(grid)" @keydown.enter.prevent="focusGrid(grid)" @keydown.space.prevent="focusGrid(grid)">
      <span class="locate-hint">{{ pendingCode === gridKey(grid) ? '正在定位…' : selectedCode === gridKey(grid) ? '已定位 · 点击重新定位' : '点击定位并高亮' }}</span>
      <strong>#{{ index + 1 }} {{ conflictReasonsText(grid.reasons) }}</strong>
      <p>编码：{{ grid.code }} · 航迹索引：{{ grid.routeIndex }}</p>
      <p>绝对高程：{{ grid.bottom }} ～ {{ grid.top }} m</p>
      <div v-for="(hit, hitIndex) in grid.ruleHits || []" :key="`rule-${hitIndex}`" class="rule-hit">
        <strong>{{ hit.elementName }} · {{ hit.methodName || hit.method }}</strong>
        <p v-if="hit.actual != null">实际值：{{ hit.actual }}{{ hit.field ? ` · 属性：${hit.field}` : '' }}</p>
        <p v-if="hit.values">避让取值：{{ JSON.stringify(hit.values) }}</p>
        <p v-if="hit.min != null || hit.max != null">允许范围：{{ hit.min ?? '不限' }} ～ {{ hit.max ?? '不限' }}</p>
        <p v-if="hit.minAgl != null || hit.maxAgl != null">适用离地高度：{{ hit.minAgl ?? '不限' }} ～ {{ hit.maxAgl ?? '不限' }} m</p>
        <p class="muted">要素版本：{{ hit.elementRevision }}</p>
      </div>
      <p v-for="(model, modelIndex) in grid.modelHits || []" :key="modelIndex">模型：{{ MODEL_SOURCE_LABELS[model.source] || model.source }}{{ model.chunkName ? ` · ${model.chunkName}` : '' }}</p>
      <p v-for="(hit, hitIndex) in grid.environmentHits || []" :key="`env-${hitIndex}`">
        {{ hit.elementName || noiseAttributeLabel(hit.attributeCode) }}：{{ hit.actual ?? '缺测' }}；允许 {{ hit.min ?? '不限' }} ～ {{ hit.max ?? '不限' }}
      </p>
      <p v-for="(feature, featureIndex) in grid.features || []" :key="`feature-${featureIndex}`">航图要素：{{ feature.featureType || feature.theme }} · {{ feature.featureUid }}</p>
      <p v-for="(feature, featureIndex) in grid.managedFeatures || []" :key="`managed-${featureIndex}`">正式维护：{{ feature.kind === 'PROHIBITED' ? '禁飞区' : '建筑' }} · {{ feature.objectId || feature.featureUid }}</p>
    </article>
  </section>
</template>
<style scoped>
.conflict-result { margin: 12px 0; padding: 12px; border: 1px solid var(--panel-card-border, #d7dee8); border-radius: 8px; background: var(--panel-card-bg, #fff); color: var(--panel-text, #475569); font-size: 13px; overflow-wrap: anywhere; }
h4 { color: var(--panel-text-strong, #334155); border-left: 3px solid #16a34a; padding-left: 8px; margin: 0 0 8px; }
p { margin: 5px 0; line-height: 1.7; }
.warning { color: var(--panel-text-strong, #334155); background: var(--panel-danger-bg, #fef2f2); border-left: 3px solid #dc2626; padding: 8px; }
.muted { color: var(--panel-text, #475569); font-size: 12px; }
article { border: 1px solid var(--panel-card-border, #d7dee8); border-radius: 6px; margin-top: 10px; padding: 10px; cursor: pointer; }
article:hover, article.selected { border-color: var(--panel-primary, #2563eb); background: var(--panel-primary-soft, #eff6ff); }
article:focus-visible { outline: 2px solid var(--panel-text-strong, #334155); outline-offset: 2px; }
.locate-hint { display: block; margin-bottom: 6px; color: var(--panel-text-strong, #334155); font-size: 12px; }
.rule-hit { border-left: 2px solid var(--panel-input-border, #cbd5e1); padding-left: 8px; margin: 8px 0; }
strong { color: var(--panel-text-strong, #334155); }
</style>
