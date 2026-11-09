<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { createCatalogRule, requestConflictCatalog } from '../../../utils/conflictCheck.js'
import { loadActiveAttributeDatasets } from '../../../utils/gridAttributeCatalog.js'

const props = defineProps({ form: { type: Object, required: true }, disabled: Boolean })
const datasets = ref([])
const loadingDatasets = ref(false)
const loadingCatalog = ref(false)
const datasetError = ref('')
const catalogError = ref('')
const selectionNotice = ref('')
let datasetController, catalogController
const selected = computed(() => new Map(props.form.rules.map(rule => [rule.elementId, rule])))
const groups = computed(() => {
  const result = new Map()
  for (const item of props.form.catalogItems) {
    if (!result.has(item.category)) result.set(item.category, [])
    result.get(item.category).push(item)
  }
  return [...result].map(([name, items]) => ({ name, items }))
})
const orphanRules = computed(() => props.form.rules.filter(rule => !props.form.catalogItems.some(item => item.id === rule.elementId)))
const temporal = computed(() => props.form.catalogItems.some(item => item.requiresTimestamp && selected.value.has(item.id)))
function selectedRule(item) { return selected.value.get(item.id) }
function definition(item) { return item.methods.find(method => method.id === selectedRule(item)?.method) }
function toggle(item, checked) {
  props.form.rules = props.form.rules.filter(rule => rule.elementId !== item.id)
  if (checked) props.form.rules.push(createCatalogRule(item))
}
function changeMethod(item, method) {
  const index = props.form.rules.findIndex(rule => rule.elementId === item.id)
  props.form.rules.splice(index, 1, createCatalogRule(item, method))
}
function chooseDataset() {
  props.form.datasetVersion = datasets.value.find(item => item.datasetId === props.form.datasetId)?.activeVersion ?? ''
  props.form.stateRevision = ''
}
async function loadCatalog() {
  catalogController?.abort()
  props.form.catalogLoaded = false
  catalogError.value = ''
  loadingCatalog.value = false
  if (!props.form.datasetId) return
  const current = new AbortController()
  catalogController = current
  loadingCatalog.value = true
  try {
    const data = await requestConflictCatalog(props.form, { signal: current.signal })
    if (current.signal.aborted) return
    const initial = props.form.catalogItems.length === 0
    props.form.catalogItems = data.items
    if (initial) props.form.rules = data.items.filter(item => item.defaultSelected && item.available && !item.mandatory).map(item => createCatalogRule(item))
    props.form.catalogLoaded = true
    if (props.form.rules.some(rule => !data.items.some(item => item.id === rule.elementId && item.revision === rule.elementRevision && item.available))) {
      catalogError.value = '部分所选要素已停用或版本变化，请取消后重新选择；原规则不会被静默忽略。'
    }
  } catch (error) {
    if (!current.signal.aborted) catalogError.value = error.message || '判定目录加载失败'
  } finally {
    if (catalogController === current) loadingCatalog.value = false
  }
}
watch(() => [props.form.datasetId, props.form.datasetVersion, props.form.stateRevision], () => {
  selectionNotice.value = props.form.rules.length ? '数据集或状态版本已切换，原规则已清空，请重新选择并设置阈值。' : ''
  props.form.rules = []
  props.form.catalogItems = []
  loadCatalog()
})
async function refresh() {
  datasetController?.abort()
  const current = new AbortController()
  datasetController = current
  loadingDatasets.value = true
  datasetError.value = ''
  const before = [props.form.datasetId, props.form.datasetVersion, props.form.stateRevision].join('|')
  try {
    const rows = await loadActiveAttributeDatasets({ signal: current.signal })
    if (current.signal.aborted) return
    datasets.value = rows.filter(item => Number(item.activeLevel) === 17)
    if (!props.form.datasetId && datasets.value.length === 1) props.form.datasetId = datasets.value[0].datasetId
    const active = datasets.value.find(item => item.datasetId === props.form.datasetId)
    if (props.form.datasetId && !active) { props.form.datasetId = ''; props.form.datasetVersion = ''; datasetError.value = '原数据集已不可用，请重新选择' }
    else if (active && String(active.activeVersion) !== String(props.form.datasetVersion)) chooseDataset()
    if (!datasets.value.length) datasetError.value = '暂无已激活的 L17 真高空域数据集'
    if (before === [props.form.datasetId, props.form.datasetVersion, props.form.stateRevision].join('|')) await loadCatalog()
  } catch (error) {
    if (!current.signal.aborted) datasetError.value = error.message || '活动数据集加载失败'
  } finally {
    if (datasetController === current) loadingDatasets.value = false
  }
}
onMounted(refresh)
onBeforeUnmount(() => { datasetController?.abort(); catalogController?.abort() })
</script>

<template>
  <fieldset class="conflict-options" :disabled="disabled">
    <legend>要素目录与判定规则 · L17</legend>
    <div class="catalog-heading">
      <span>活动真高空域数据集</span>
      <button type="button" @click="refresh" :disabled="loadingDatasets || loadingCatalog">{{ loadingDatasets || loadingCatalog ? '加载中…' : '刷新目录' }}</button>
    </div>
    <label>数据集
      <select v-model="form.datasetId" @change="chooseDataset" :disabled="loadingDatasets">
        <option value="">请选择数据集</option>
        <option v-for="dataset in datasets" :key="dataset.datasetId" :value="dataset.datasetId">{{ dataset.description || dataset.datasetName || dataset.datasetId }} · {{ dataset.datasetId }}</option>
      </select>
    </label>
    <p v-if="datasetError" role="alert" class="error">{{ datasetError }}</p>
    <p class="hint">网格固定 L17 · 活动数据集版本：{{ form.datasetVersion || '待选择' }}。航点使用绝对高程。</p>
    <details>
      <summary>固定状态版本（可选）</summary>
      <label>状态修订号<input v-model="form.stateRevision" type="number" min="1" step="1" placeholder="留空使用当前活动状态"></label>
    </details>
    <p v-if="loadingCatalog" class="hint" role="status">正在读取已发布要素和可用判定方式…</p>
    <p v-if="catalogError" role="alert" class="error">{{ catalogError }}</p>
    <p v-if="selectionNotice" role="status" class="hint">{{ selectionNotice }}</p>
    <p class="hint">勾选要素后配置判定方式和参数。只执行所选规则及正式维护强制约束，阈值不由系统猜测。</p>
    <div v-for="rule in orphanRules" :key="rule.elementId" class="error">
      已选要素不在当前目录：{{ rule.elementId }}
      <button type="button" @click="form.rules = form.rules.filter(item => item.elementId !== rule.elementId)">移除此规则</button>
    </div>
    <details v-for="group in groups" :key="group.name" :open="['地形与基础状态', '模型障碍', '正式维护强制约束'].includes(group.name)" class="catalog-group">
      <summary>{{ group.name }}（{{ group.items.length }}）</summary>
      <div v-for="item in group.items" :key="item.id" class="environment-rule">
        <label class="check">
          <input type="checkbox" :checked="item.mandatory || Boolean(selectedRule(item))" :disabled="item.mandatory || (!item.available && !selectedRule(item)) || loadingCatalog" @change="toggle(item, $event.target.checked)">
          <span>{{ item.name }}{{ item.unit ? `（${item.unit}）` : '' }}<small v-if="item.mandatory">正式约束，服务端始终检查</small></span>
        </label>
        <p v-if="!item.available" class="error">{{ item.unavailableReason }}</p>
        <p v-if="item.description" class="hint">{{ item.description }}</p>
        <template v-if="selectedRule(item) && !item.mandatory">
          <p v-if="selectedRule(item).elementRevision !== item.revision" class="error">版本已变化，请取消后重新选择并复核参数。</p>
          <label>判定方式<select :value="selectedRule(item).method" :disabled="loadingCatalog" @change="changeMethod(item, $event.target.value)"><option v-for="method in item.methods" :key="method.id" :value="method.id">{{ method.name }}</option></select></label>
          <label v-for="parameter in definition(item)?.parameters || []" :key="parameter.name">{{ parameter.label }}{{ parameter.required ? '（必填）' : '' }}
            <select v-if="parameter.type === 'select'" v-model="selectedRule(item)[parameter.name]" :disabled="loadingCatalog"><option value="">请选择</option><option v-for="option in parameter.options" :key="option.value" :value="option.value">{{ option.label }}</option></select>
            <input v-else v-model="selectedRule(item)[parameter.name]" :type="parameter.type === 'number' ? 'number' : 'text'" step="any" :disabled="loadingCatalog" :placeholder="parameter.placeholder || (parameter.required ? '请填写' : '留空不限制')">
          </label>
          <small v-if="definition(item)?.requiresOneOf?.length">允许范围包含边界，最小值与最大值至少填一项。非数值或缺失属性按缺测处理。</small>
          <small v-if="selectedRule(item).method === 'property_values'">取值按原始类型精确比较；带前导零的分类代码请写成字符串，如 ["001", "002"]。</small>
          <small v-if="item.requiresTimestamp">时变要素，需要下方的查询时间。</small>
        </template>
      </div>
    </details>
    <p v-if="form.catalogLoaded && !form.rules.length" class="hint">未选择可选要素，本次仅执行已启用的正式维护强制约束。</p>
    <p class="hint">建筑、禁飞区可通过“正式要素维护”发布。二维水平避让与实体三维碰撞分别报告；目录未声明的距离缓冲方式尚不支持。</p>
    <label>环境查询时间（UTC Unix 秒）<input v-model="form.timestamp" type="number" min="1" step="1" :required="temporal" placeholder="时变属性必填，其余可留空"></label>
    <button type="button" @click="form.timestamp = Math.floor(Date.now() / 1000)">使用当前时刻</button>
    <p class="hint">整条航迹按同一时刻查询时变属性，不推算逐格到达时间。</p>
  </fieldset>
</template>

<style scoped>
.conflict-options { border: 1px solid var(--panel-card-border, #d7dee8); border-radius: 8px; padding: 12px; margin: 12px 0; background: var(--panel-card-bg, #fff); color: var(--panel-text, #475569); min-width: 0; }
legend, summary { color: var(--panel-text-strong, #334155); font-weight: 600; font-size: 14px; }
legend { padding: 0 6px; }
summary { cursor: pointer; }
label { display: flex; flex-direction: column; gap: 5px; margin: 10px 0; font-size: 13px; color: var(--panel-text-strong, #334155); }
select, input:not([type="checkbox"]) { width: 100%; box-sizing: border-box; min-width: 0; padding: 8px; border: 1px solid var(--panel-input-border, #d7dee8); border-radius: 5px; background: var(--panel-input-bg, #fff); color: var(--panel-text-strong, #334155); font-size: 13px; }
option { background: var(--panel-input-bg, #fff); color: var(--panel-text-strong, #334155); }
input::placeholder { color: var(--panel-muted, #64748b); opacity: 1; }
button { color: var(--panel-btn-secondary-text, #475569); background: var(--panel-btn-secondary-bg, #fff); border: 1px solid var(--panel-btn-secondary-border, #cbd5e1); border-radius: 5px; padding: 6px 8px; font-size: 12px; cursor: pointer; }
button:hover:enabled { background: var(--panel-card-hover-bg, #f8fafc); }
button:disabled, select:disabled, input:disabled { color: var(--panel-muted, #64748b); background: var(--panel-card-hover-bg, #f8fafc); opacity: 1; cursor: default; }
button:focus-visible, select:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid var(--panel-text-strong, #334155); outline-offset: 2px; }
.check { flex-direction: row; align-items: flex-start; gap: 8px; line-height: 1.6; }
.check input { margin-top: 4px; accent-color: var(--panel-primary, #2563eb); }
small { display: block; color: var(--panel-text, #475569); margin-top: 3px; font-size: 12px; }
.catalog-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 12px; color: var(--panel-text-strong, #334155); font-size: 13px; font-weight: 600; }
.hint { font-size: 12px; line-height: 1.7; color: var(--panel-text, #475569); overflow-wrap: anywhere; }
.error { font-size: 13px; line-height: 1.6; color: var(--panel-text-strong, #334155); background: var(--panel-danger-bg, #fef2f2); border-left: 3px solid #dc2626; padding: 8px; }
.environment-rule { padding: 8px; margin: 8px 0; border: 1px solid var(--panel-input-border, #d7dee8); border-radius: 5px; }
.range { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
</style>
