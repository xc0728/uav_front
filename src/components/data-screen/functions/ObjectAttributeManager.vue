<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Database, SlidersHorizontal, History, ShieldCheck, RefreshCw, Plus, Trash2, Eye, Loader2, AlertCircle, CheckCircle2, Undo2, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-vue-next'
import { attributeRequest, buildAttributeRequest, attributeFieldOptions } from '../../../utils/objectAttributes.js'
import { MODEL_GRID_SOURCES } from '../../../utils/modelGridSources.js'
import { loadAvailableChartDatasets } from '../../../utils/staticFeatures.js'
import BulkAttributeManager from './BulkAttributeManager.vue'

const props = defineProps({ datasetId: { type: String, default: '' } })
const token = ref('')
const kind = ref('STATIC_FEATURE')
const scopeId = ref(props.datasetId)
const descriptor = ref({ enabled: false, fields: {}, maxBatchSize: 500 })
const descriptorState = ref('loading')
const datasets = ref([])
const datasetsState = ref('loading')
const objects = ref([])
const chosen = ref([])
const edits = ref([])
const editMode = ref('existing')
const deleteConfirmation = ref('')
const deleting = computed(() => editMode.value === 'delete')
const reason = ref('')
const busy = ref(false)
const error = ref('')
const notice = ref('')
const preview = ref(null)
const previewChangedCount = computed(() => preview.value?.items.filter(item => changedProperties(item).length).length || 0)
const prepared = ref(null)
const history = ref([])
const historyFilter = ref('ALL')
const batch = ref(null)
const rollbackReason = ref('')
const rollbackConfirmation = ref('')
const rollbackRequest = ref(null)
const rollbackFeedback = ref(null)
const rollbackFeedbackElement = ref(null)
const creatingRollback = ref(false)
const restoreTarget = ref('before')
const restorePreview = ref(null)
const restoreChanges = computed(() => restorePreview.value?.items.some(item => changedProperties(item).length) || false)
const nextCursor = ref(null)
const cursorStack = ref([''])
const requestLifetime = new AbortController()
let timer = null
let mounted = true
let batchGeneration = 0
let publicationSignature = ''
let scopeGeneration = 0
const selected = computed(() => objects.value.filter(item => chosen.value.includes(item.externalKey)))
const allSelected = computed(() => objects.value.some(item => item.editable) && objects.value.filter(item => item.editable).every(item => chosen.value.includes(item.externalKey)))
const fields = computed(() => descriptor.value.fields || {})
const fieldOptions = computed(() => attributeFieldOptions(objects.value, fields.value))
const editorKeys = computed(() => deleting.value ? attributeFieldOptions(selected.value, fields.value).existing : editMode.value === 'existing' ? fieldOptions.value.existing : fieldOptions.value.additional)
const selectedDataset = computed(() => datasets.value.find(item => item.datasetId === scopeId.value) || null)
const scopeLabel = computed(() => kind.value === 'STATIC_FEATURE' ? selectedDataset.value?.datasetName || '尚未选择数据集' : scopeId.value)
const serviceLabel = computed(() => descriptorState.value === 'loading' ? '正在检测服务' : descriptorState.value === 'error' ? '服务连接异常' : descriptor.value.enabled ? '属性维护已启用' : '属性维护未启用')
const statusLabels = { QUEUED: '排队中', RUNNING: '同步中', RECONCILING: '核对 / 待重试', PARTIAL_FAILED: '部分成功', SUCCEEDED: '全部成功', FAILED: '失败', CANCELLED: '已取消', RETRY_WAIT: '等待重试', BLOCKED: '需人工核对' }
const operationLabels = { ADD_PROPERTIES: '新增属性', UPDATE_PROPERTIES: '修改属性', DELETE_PROPERTIES: '删除属性', MIXED_PROPERTIES: '混合变更', ROLLBACK: '回滚 / 撤销', RESTORE_AFTER: '恢复操作后状态', NO_CHANGE: '无实际变化' }
const operationType = item => item.operationType || (item.rollback_of ? (item.actor_note === 'historical_restore:after' ? 'RESTORE_AFTER' : 'ROLLBACK') : 'UNKNOWN')
const operationLabel = item => operationLabels[operationType(item)] || '普通属性变更'
const filteredHistory = computed(() => historyFilter.value === 'ALL' ? history.value : history.value.filter(item =>
  historyFilter.value === 'NO_CHANGE' ? item.changeSummary?.changed_objects === 0 || operationType(item) === 'NO_CHANGE' : operationType(item) === historyFilter.value))
const changeLabel = item => item.changeSummary ? `新增 ${item.changeSummary.added} · 修改 ${item.changeSummary.modified} · 删除 ${item.changeSummary.removed}` : '更新后端后可查看字段统计'
const timeLabel = value => value ? new Date(value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')).toLocaleString('zh-CN', { hour12: false }) : '—'
const json = value => JSON.stringify(value, null, 2)
const label = value => statusLabels[value] || value
const api = (path, options = {}) => attributeRequest(path, { token: token.value, signal: requestLifetime.signal, ...options })

function invalidatePreview() { preview.value = null; prepared.value = null; deleteConfirmation.value = '' }
watch([chosen, edits, reason], invalidatePreview, { deep: true })
watch([kind, scopeId], () => {
  ++scopeGeneration
  objects.value = []; chosen.value = []; edits.value = []; reason.value = ''; editMode.value = 'existing'; cursorStack.value = ['']; nextCursor.value = null
  error.value = ''; notice.value = ''
  invalidatePreview()
  if (scopeId.value && token.value.trim() && descriptorState.value === 'ready' && descriptor.value.enabled && (kind.value !== 'STATIC_FEATURE' || selectedDataset.value)) reload()
})
watch(chosen, () => { edits.value = []; reason.value = ''; editMode.value = 'existing'; invalidatePreview() })
watch(editMode, () => { edits.value = []; invalidatePreview() })
watch(kind, value => { scopeId.value = value === 'MODEL_OBJECT' ? 'lod13' : (datasets.value.some(item => item.datasetId === props.datasetId) ? props.datasetId : '') }, { flush: 'sync' })

async function run(work) {
  if (busy.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try { await work() } catch (e) { if (mounted) error.value = e.name === 'AbortError' ? '请求中断或超时。提交结果不明时，请保留原请求重试并查询批次，避免重复修改。' : e.message }
  finally { busy.value = false }
}

async function loadObjects(cursor = '') {
  if (!descriptor.value.enabled) throw new Error('后端属性维护尚未启用，请先部署数据库脚本并配置管理员令牌')
  if (!token.value.trim()) throw new Error('请输入属性维护管理员令牌')
  if (kind.value === 'STATIC_FEATURE' && (datasetsState.value !== 'ready' || !selectedDataset.value))
    throw new Error('请从已入库数据集列表中选择有效数据集')
  const generation = scopeGeneration
  const result = await api('read', { method: 'POST', body: { objectKind: kind.value, scopeId: scopeId.value, cursor } })
  if (!mounted || generation !== scopeGeneration) return
  objects.value = result.items || []; chosen.value = []; nextCursor.value = result.hasMore ? result.nextCursor : null
}
function reload() { return run(async () => { cursorStack.value = ['']; await loadObjects(); await loadHistory() }) }
function bulkUpdated(detail) {
  if (detail.scopeId !== scopeId.value) return
  if (edits.value.length || preview.value) { notice.value = '批量任务已有成功对象；当前编辑已保留，请提交前重新读取核对版本。'; return }
  reload()
}
function page(direction) {
  return run(async () => {
    const stack = [...cursorStack.value]
    if (direction > 0 && nextCursor.value) stack.push(nextCursor.value)
    else if (direction < 0 && stack.length > 1) stack.pop()
    else return
    await loadObjects(stack.at(-1)); cursorStack.value = stack
  })
}
function addField(requested = '') {
  const key = editorKeys.value.find(name => (!requested || name === requested) && !edits.value.some(item => item.key === name))
  if (key) edits.value.push({ key, value: '', null: false })
}
function fieldDisabled(key, index) { return edits.value.some((edit, i) => i !== index && edit.key === key) }
function currentValues(key) {
  const values = [...new Set(selected.value.map(item => displayProperty(item.properties, key)))]
  return values.length === 1 ? values[0] : `存在 ${values.length} 种原值，请在差异预览中逐项核对`
}
function selectAll(event) { chosen.value = event.target.checked ? objects.value.filter(item => item.editable).map(item => item.externalKey) : [] }

async function makePreview() {
  await run(async () => {
    if (deleting.value && !descriptor.value.attributeDeletion) throw new Error('请重启支持属性删除的新版后端')
    const request = buildAttributeRequest(kind.value, scopeId.value, selected.value, edits.value, fields.value, reason.value, crypto.randomUUID(), deleting.value ? 'delete' : 'set')
    const result = await api('preview', { method: 'POST', body: request })
    prepared.value = request; preview.value = result
  })
}
async function submit() {
  await run(async () => {
    if (!prepared.value) throw new Error('请先预览本次修改')
    if (!previewChangedCount.value) throw new Error('没有实际变更，无需提交')
    if (deleting.value && deleteConfirmation.value.trim() !== '删除') throw new Error('请输入“删除”确认移除属性')
    const result = await api('batches', { method: 'POST', body: prepared.value })
    const id = result.batchId
    notice.value = `${deleting.value ? '删除' : '修改'}已受理，批次 ${id} 正在等待数据库同步确认。`
    preview.value = null; prepared.value = null
    await openBatch(id)
  })
}
async function loadHistory() {
  const result = await api('batches')
  if (mounted) history.value = result.items || []
}
async function refreshPublishedObjects(result, successful) {
  if (result.scope_id !== scopeId.value || result.object_kind !== kind.value) return
  const keys = objects.value.filter(item => successful.includes(item.objectUid)).map(item => item.externalKey)
  if (!keys.length) return
  const generation = scopeGeneration
  const data = await api('read', { method: 'POST', body: { objectKind: kind.value, scopeId: scopeId.value, externalKeys: keys } })
  if (!mounted || generation !== scopeGeneration) return
  const fresh = new Map(data.items.map(item => [item.externalKey, item]))
  objects.value = objects.value.map(item => fresh.get(item.externalKey) || item)
  if (chosen.value.some(key => fresh.has(key))) { edits.value = []; reason.value = ''; invalidatePreview() }
}
async function openBatch(id, generation = ++batchGeneration) {
  clearTimeout(timer)
  const result = await api(`batches/${encodeURIComponent(id)}`)
  if (!mounted || generation !== batchGeneration) return
  batch.value = result
  await loadHistory()
  if (!mounted || generation !== batchGeneration) return
  const successful = result.items?.filter(item => item.status === 'SUCCEEDED').map(item => item.object_uid).sort() || []
  const signature = `${id}:${successful.join(',')}`
  if (successful.length && signature !== publicationSignature) {
    try { await refreshPublishedObjects(result, successful) }
    catch (e) { error.value = `批次已有确认成功的对象，但刷新属性列表失败：${e.message}。请重新读取对象。` }
    if (!mounted || generation !== batchGeneration) return
    publicationSignature = signature
    window.dispatchEvent(new CustomEvent('object-attributes-updated', { detail: { scopeId: result.scope_id } }))
  }
  if (['QUEUED', 'RUNNING', 'RECONCILING', 'PARTIAL_FAILED'].includes(result.status)) {
    timer = setTimeout(() => {
      openBatch(id, generation).catch(e => { if (mounted && generation === batchGeneration) error.value = e.message })
    }, 5000)
  }
}
async function retryBatch() {
  await run(async () => {
    await api(`batches/${batch.value.batch_id}/retry`, { method: 'POST', body: {} })
    await openBatch(batch.value.batch_id)
  })
}
async function rollbackBatch() {
  await run(async () => {
    creatingRollback.value = true
    rollbackFeedback.value = { state: 'pending', message: '正在提交确认的恢复目标，请勿重复提交…' }
    let acceptedId = ''
    try {
      if (!rollbackReason.value.trim() || rollbackConfirmation.value.trim() !== '回滚') throw new Error('请填写回滚原因并输入“回滚”确认')
      if (!restorePreview.value) throw new Error('请先预览当前属性与目标历史快照的差异')
      if (!restoreChanges.value) throw new Error('当前属性与目标快照一致，无需创建恢复批次')
      if (!rollbackRequest.value) rollbackRequest.value = {
        requestId: crypto.randomUUID(), reason: rollbackReason.value.trim(), target: restoreTarget.value,
        items: restorePreview.value.items.map(item => ({ objectUid: item.objectUid, externalKey: item.externalKey, baseToken: item.baseToken, expectedRevision: item.propertyRevision })),
      }
      const result = await api(`batches/${batch.value.batch_id}/restore`, { method: 'POST', body: rollbackRequest.value })
      acceptedId = result.batchId
      rollbackRequest.value = null; rollbackConfirmation.value = ''; rollbackReason.value = ''
      notice.value = `已创建${restoreTarget.value === 'before' ? '回滚' : '历史恢复'}批次 ${acceptedId}，正在核对同步结果。`
      await openBatch(acceptedId)
      rollbackFeedback.value = { state: 'success', message: '批次已创建。只有同步状态为全部成功才已完成；左侧已读取对象会随确认结果更新。', batchId: acceptedId }
    } catch (e) {
      rollbackFeedback.value = acceptedId
        ? { state: 'warning', message: `回滚批次已创建，但读取同步结果失败：${e.message}。请刷新记录核对，无需再次创建。`, batchId: acceptedId }
        : { state: 'error', message: e.name === 'AbortError' ? '请求超时或中断，回滚结果尚未确认。请先刷新批次记录核对；保留当前输入重试将复用请求编号。' : e.message }
      throw e
    } finally {
      creatingRollback.value = false
      await nextTick()
      rollbackFeedbackElement.value?.focus({ preventScroll: true })
      rollbackFeedbackElement.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  })
}
async function previewRestore() {
  await run(async () => {
    restorePreview.value = null; rollbackRequest.value = null; rollbackFeedback.value = null
    try {
      restorePreview.value = await api(`batches/${batch.value.batch_id}/restore-preview`, { method: 'POST', body: { target: restoreTarget.value } })
    } catch (e) {
      rollbackFeedback.value = { state: 'error', message: e.message }
      await nextTick()
      rollbackFeedbackElement.value?.focus({ preventScroll: true })
      rollbackFeedbackElement.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      throw e
    }
  })
}
function changedProperties(item) {
  return [...new Set([...Object.keys(item.before || {}), ...Object.keys(item.after || {})])].filter(key =>
    Object.hasOwn(item.before, key) !== Object.hasOwn(item.after, key) || JSON.stringify(item.before[key]) !== JSON.stringify(item.after[key]))
}
watch([rollbackReason, rollbackConfirmation], () => { rollbackRequest.value = null })
watch(restoreTarget, () => { restorePreview.value = null; rollbackRequest.value = null; rollbackFeedback.value = null })
watch(() => batch.value?.batch_id, () => { rollbackRequest.value = null; rollbackReason.value = ''; rollbackConfirmation.value = ''; rollbackFeedback.value = null; restorePreview.value = null; restoreTarget.value = 'before' })

function displayProperty(properties, key) {
  if (!Object.hasOwn(properties || {}, key)) return '未设置'
  const value = properties[key]
  if (value === null) return 'null（空值）'
  if (value === '') return '空字符串'
  return typeof value === 'string' ? value : JSON.stringify(value)
}

async function loadDatasets() {
  datasetsState.value = 'loading'
  try {
    const available = await loadAvailableChartDatasets({ signal: requestLifetime.signal, includeLod13: false })
    if (!mounted) return
    datasets.value = available.map(item => ({ datasetId: item.id, datasetName: item.label }))
    datasetsState.value = 'ready'
    if (kind.value === 'STATIC_FEATURE' && !datasets.value.some(item => item.datasetId === scopeId.value)) scopeId.value = ''
  } catch (e) {
    datasets.value = []
    datasetsState.value = 'error'
    if (kind.value === 'STATIC_FEATURE') scopeId.value = ''
    throw e
  }
}

async function initialize() {
  const results = await Promise.allSettled([
    (async () => {
      descriptorState.value = 'loading'
      try {
        descriptor.value = await api('descriptor')
        descriptorState.value = 'ready'
      } catch (e) { descriptorState.value = 'error'; throw e }
    })(),
    loadDatasets(),
  ])
  const failures = results.filter(result => result.status === 'rejected')
  if (failures.length) throw new Error(failures.map(result => result.reason?.message || '服务请求失败').join('；'))
}
onMounted(() => run(initialize))
onBeforeUnmount(() => { mounted = false; clearTimeout(timer); requestLifetime.abort() })
</script>

<template>
  <section class="attribute-manager" aria-label="已有对象属性维护" :aria-busy="busy">
    <header class="page-heading">
      <div class="heading-copy">
        <span class="eyebrow">对象数据管理</span>
        <h3>属性维护</h3>
        <p>选择已有对象，修改普通属性。每次变更都有记录，可检查、可回滚。</p>
      </div>
      <span class="service-status" :class="{ online: descriptorState === 'ready' && descriptor.enabled, offline: descriptorState === 'error' }" role="status">
        <span class="status-dot"></span>{{ serviceLabel }}
      </span>
    </header>

    <div v-if="error" class="feedback error" role="alert">
      <AlertCircle :size="19" />
      <div><strong>操作未完成</strong><p>{{ error }}</p><small v-if="descriptorState === 'error'">服务恢复后重新检测，即可继续读取和编辑对象。</small></div>
      <button v-if="descriptorState === 'error'" type="button" class="button feedback-action" :disabled="busy" @click="run(initialize)"><RefreshCw :size="14" />重新检测</button>
    </div>
    <div v-else-if="descriptorState === 'ready' && !descriptor.enabled" class="feedback warning" role="status">
      <ShieldCheck :size="19" /><div><strong>属性维护暂未启用</strong><p>请先完成服务端数据库配置，启用后即可在此维护对象属性。</p></div>
    </div>
    <div v-if="notice" class="feedback success" role="status"><CheckCircle2 :size="19" /><div><strong>操作已受理</strong><p>{{ notice }}</p></div></div>

    <nav class="workflow" aria-label="属性维护步骤">
      <span class="workflow-step" :class="{ complete: selected.length }"><span class="step-index">01</span>选择对象</span>
      <ArrowRight :size="16" aria-hidden="true" />
      <span class="workflow-step" :class="{ complete: preview }"><span class="step-index">02</span>编辑与预览</span>
      <ArrowRight :size="16" aria-hidden="true" />
      <span class="workflow-step"><span class="step-index">03</span>记录与回滚</span>
      <span class="workflow-note"><ShieldCheck :size="14" />保留每次变更记录</span>
    </nav>

    <div class="edit-workspace">
      <fieldset class="step-card object-card" :disabled="busy">
        <legend class="sr-only">1. 选择现有对象</legend>
        <div class="card-heading">
          <div class="card-title"><span class="section-icon"><Database :size="19" /></span><div><h4>选择现有对象</h4><p>按数据集或模型类别读取，勾选需要修改的对象</p></div></div>
          <span class="count-badge">已选 {{ chosen.length }} 个</span>
        </div>
        <div class="source-form">
          <label class="token-field"><span>管理员令牌</span><input v-model="token" type="password" autocomplete="off" placeholder="输入属性维护令牌" /><small>仅保存在当前页面内存中</small></label>
          <label><span>对象类型</span><select v-model="kind"><option value="STATIC_FEATURE">静态要素</option><option value="MODEL_OBJECT">3D 模型对象</option></select></label>
          <div v-if="kind === 'STATIC_FEATURE'" class="dataset-field">
            <div class="dataset-label"><label for="attribute-static-dataset">数据集</label><button type="button" class="text-button" :disabled="busy || datasetsState === 'loading'" @click="run(loadDatasets)"><RefreshCw :size="12" />刷新列表</button></div>
            <select id="attribute-static-dataset" v-model="scopeId" aria-label="静态要素数据集" :disabled="datasetsState !== 'ready' || !datasets.length">
              <option disabled value="">{{ datasetsState === 'loading' ? '正在加载数据集…' : datasetsState === 'error' ? '数据集列表加载失败' : datasets.length ? '请选择已入库数据集' : '暂无可维护的静态数据集' }}</option>
              <option v-for="item in datasets" :key="item.datasetId" :value="item.datasetId" :title="item.datasetName + '（' + item.datasetId + '）'">{{ item.datasetName }}（{{ item.datasetId }}）</option>
            </select>
            <small class="dataset-hint" :class="{ 'dataset-error': datasetsState === 'error' }">{{ datasetsState === 'error' ? '请检查后端连接后刷新列表，不支持手动输入编号。' : datasetsState === 'loading' ? '正在读取服务器已入库目录' : datasets.length ? '共 ' + datasets.length + ' 个已入库数据集，仅显示活动且已关联格网的数据。' : '请先导入静态要素并完成网格化，再刷新列表。' }}</small>
          </div>
          <label v-else><span>模型类别</span><select v-model="scopeId"><option v-for="source in MODEL_GRID_SOURCES" :key="source.value" :value="source.value">{{ source.label }}</option></select></label>
          <button type="button" class="button primary read-button" :disabled="!descriptor.enabled || descriptorState !== 'ready' || (kind === 'STATIC_FEATURE' && (datasetsState !== 'ready' || !selectedDataset))" @click="reload"><RefreshCw :size="15" />读取对象</button>
        </div>
        <div class="table-scroll object-table">
          <table>
            <thead><tr><th class="check-column"><input type="checkbox" :checked="allSelected" :disabled="!objects.some(item => item.editable)" aria-label="选择本页可编辑对象" @change="selectAll" /></th><th>对象编号</th><th class="version-column">版本</th><th>属性 / 状态</th></tr></thead>
            <tbody>
              <tr v-for="item in objects" :key="item.externalKey" :class="{ 'selected-row': chosen.includes(item.externalKey) }">
                <td><input v-model="chosen" type="checkbox" :value="item.externalKey" :disabled="!item.editable" :aria-label="'选择 ' + item.externalKey" /></td>
                <td class="identifier">{{ item.externalKey }}</td><td><span class="version-tag">v{{ item.propertyRevision ?? '—' }}</span></td>
                <td><span v-if="!item.editable" class="row-warning">{{ item.error || '同步待确认：' + item.pendingBatchId }}</span><details v-if="item.properties" class="property-details"><summary>查看属性</summary><pre>{{ json(item.properties) }}</pre></details></td>
              </tr>
              <tr v-if="!objects.length"><td colspan="4" class="empty-cell"><div class="empty-state"><Database :size="30" stroke-width="1.4" /><strong>等待选择对象</strong><span>选择数据集或模型类别，点击“读取对象”</span></div></td></tr>
            </tbody>
          </table>
        </div>
        <footer class="pagination">
          <span>第 <b>{{ cursorStack.length }}</b> 页<span class="pagination-divider">·</span>本页 {{ objects.length }} 个对象</span>
          <div><button type="button" class="button icon-button" :disabled="cursorStack.length < 2" aria-label="上一页" @click="page(-1)"><ChevronLeft :size="16" /></button><button type="button" class="button icon-button" :disabled="!nextCursor" aria-label="下一页" @click="page(1)"><ChevronRight :size="16" /></button></div>
        </footer>
      </fieldset>

      <fieldset class="step-card editor-card" :disabled="busy || !selected.length">
        <legend class="sr-only">2. 编辑属性并预览</legend>
        <div class="card-heading">
          <div class="card-title"><span class="section-icon"><SlidersHorizontal :size="19" /></span><div><h4>编辑普通属性</h4><p>{{ scopeLabel }} · 已选择 {{ selected.length }} 个对象</p></div></div>
        </div>
        <div v-if="!selected.length" class="editor-guide"><span class="guide-number">←</span><div><strong>先选择需要维护的对象</strong><p>选择后即可添加属性，预览修改前后的差异。</p></div></div>
        <div v-else class="selection-note"><CheckCircle2 :size="16" />已选择 {{ selected.length }} 个对象，仅更新下方明确填写的字段。</div>
        <div class="dataset-properties" aria-live="polite">
          <strong>当前数据集属性</strong>
          <p v-if="!objects.length">{{ busy ? '正在读取对象及属性…' : '请先选择数据集并读取对象。输入令牌后切换数据集，会自动读取。' }}</p>
          <template v-else>
            <p>根据当前已读取对象的实际字段显示；选择对象后可设置新值。</p>
            <div v-if="fieldOptions.existing.length" class="property-chips"><span v-for="key in fieldOptions.existing" :key="key">{{ key }} <small>{{ fields[key] }}</small></span></div>
            <p v-else>这些对象暂没有已开放修改的普通属性；未登记字段见下方只读列表。</p>
          </template>
        </div>
        <div class="editor-mode" role="group" aria-label="属性操作类型">
          <button type="button" class="button" :class="{ primary: editMode === 'existing' }" :aria-pressed="editMode === 'existing'" @click="editMode = 'existing'">修改已有属性</button>
          <button type="button" class="button" :class="{ primary: editMode === 'additional' }" :aria-pressed="editMode === 'additional'" @click="editMode = 'additional'">新增普通属性</button>
          <button type="button" class="button delete-mode-button" :class="{ active: deleting }" :disabled="!descriptor.attributeDeletion" :aria-pressed="deleting" @click="editMode = 'delete'"><Trash2 :size="14" />删除普通属性</button>
        </div>
        <div v-if="deleting" class="delete-warning" role="status">删除会移除所选对象的属性键，不是设为 null 或空字符串。坐标、高程、编号等受保护字段不能删除；字段已不存在的对象会跳过。提交前请预览，删除后可通过历史快照恢复。</div>
        <div v-if="!descriptor.attributeDeletion" class="field-hint">当前后端尚未开放删除能力，重启新版后端后可使用。</div>
        <div class="edit-fields">
          <div v-if="!edits.length" class="field-placeholder">{{ deleting ? (editorKeys.length ? '点击下方按钮，选择需要移除的普通属性' : '选中对象没有已开放的可删除属性') : !editorKeys.length ? (editMode === 'existing' ? '当前已读取对象没有可修改字段' : '暂无可新增的白名单字段') : (editMode === 'existing' ? '点击下方按钮，选择当前数据集的已有属性' : '新增操作仅提供服务端允许、当前已读取对象尚未出现的字段') }}</div>
          <div v-for="(edit, index) in edits" :key="index" class="attribute-row">
            <label><span>{{ deleting ? '待删除属性字段' : editMode === 'existing' ? '已有属性字段' : '新增属性字段' }}</span><select v-model="edit.key"><option v-for="key in editorKeys" :key="key" :value="key" :disabled="fieldDisabled(key, index)">{{ key }}（{{ fields[key] }}）</option></select></label>
            <p v-if="deleting" class="delete-target">删除后：字段不存在</p>
            <label v-else><span>新值</span><select v-if="fields[edit.key] === 'boolean'" v-model="edit.value" :disabled="edit.null"><option value="">请选择</option><option value="true">true</option><option value="false">false</option></select><input v-else v-model="edit.value" :disabled="edit.null" :type="fields[edit.key] === 'number' ? 'number' : 'text'" maxlength="4096" placeholder="输入更新后的值" /></label>
            <div class="current-property"><span>当前值</span><pre>{{ currentValues(edit.key) }}</pre><small v-if="selected.some(item => !Object.hasOwn(item.properties || {}, edit.key))">{{ deleting ? '部分对象没有该字段，将跳过其删除操作。' : '部分或全部对象没有该字段，提交后将新增。' }}</small></div>
            <div class="row-options"><label v-if="!deleting" class="inline"><input v-model="edit.null" type="checkbox" />设为空值</label><button type="button" class="button remove-button" :aria-label="'移除第 ' + (index + 1) + ' 个属性'" @click="edits.splice(index, 1)"><Trash2 :size="15" /></button></div>
          </div>
        </div>
        <button type="button" class="button add-button" :disabled="edits.length >= editorKeys.length" @click="addField()"><Plus :size="15" />{{ deleting ? '添加待删除属性' : editMode === 'existing' ? '添加待修改属性' : '添加待新增属性' }}</button>
        <div v-if="selected.length" class="field-hint">编辑列表仅显示当前已读取对象具有的可编辑字段。新增其他白名单字段，请切换“新增普通属性”。部分对象缺少已有字段时，写入前请核对差异预览。</div>
        <details v-if="fieldOptions.readonly.length" class="readonly-properties"><summary>只读属性（{{ fieldOptions.readonly.length }}）</summary><p>{{ fieldOptions.readonly.join('、') }}</p><small>这些字段未开放普通属性维护，可能涉及编号、空间计算或尚未登记的业务字段。保留原值；需核对业务用途后由后端登记。</small></details>
        <label class="reason"><span>{{ deleting ? '删除原因' : '修改原因' }} <em>必填</em></span><textarea v-model="reason" maxlength="500" rows="3" :placeholder="deleting ? '例如：移除误导入的普通属性字段' : '例如：根据最新资料修正所属单位'" /><small>{{ reason.length }} / 500</small></label>
        <div class="field-hint">{{ deleting ? '仅删除明确选择的字段，其余属性保持原值。' : '未编辑的属性保留原值。空字符串会清空文本，“设为空值”会写入 null。' }}</div>
        <div class="editor-actions"><span v-if="!selected.length">选择对象后可预览</span><span v-else>提交前请先核对差异</span><button type="button" class="button primary" :disabled="!edits.length || !reason.trim()" @click="makePreview"><Eye :size="15" />{{ deleting ? '预览删除差异' : '检查并预览' }}</button></div>
        <div v-if="preview" class="preview-panel">
          <div class="preview-heading"><CheckCircle2 :size="17" /><strong>{{ deleting ? '删除差异预览' : '差异预览' }}</strong><span>实际变更 {{ previewChangedCount }} 个 · 跳过 {{ preview.items.length - previewChangedCount }} 个</span></div>
          <div class="table-scroll preview-table"><table><thead><tr><th>对象 / 字段</th><th>修改前</th><th>修改后</th></tr></thead><tbody><template v-for="item in preview.items" :key="item.externalKey"><tr v-for="key in [...new Set([...Object.keys(item.set || {}), ...(item.unset || [])])]" :key="item.externalKey + ':' + key"><td><small class="identifier">{{ item.externalKey }}</small><strong>{{ key }}</strong></td><td>{{ displayProperty(item.before, key) }}</td><td class="new-value">{{ Object.hasOwn(item.after, key) ? displayProperty(item.after, key) : '删除该字段（不再存在）' }}</td></tr><tr v-if="!changedProperties(item).length"><td class="identifier">{{ item.externalKey }}</td><td colspan="2">无变化，跳过；待删除字段可能已不存在。</td></tr></template></tbody></table></div>
          <label v-if="deleting && previewChangedCount" class="delete-confirmation"><span>输入“删除”确认移除上述属性</span><input v-model="deleteConfirmation" placeholder="删除" autocomplete="off" /></label>
          <button type="button" class="button submit-button" :class="deleting ? 'delete-submit' : 'primary'" :disabled="!previewChangedCount || (deleting && deleteConfirmation.trim() !== '删除')" @click="submit">{{ deleting ? '确认删除属性' : '确认提交' }}（{{ previewChangedCount }} 个对象）<ArrowRight :size="15" /></button>
          <p class="retry-hint">提交超时可保留此预览再次提交，系统会复用原请求编号。</p>
        </div>
      </fieldset>
    </div>

    <BulkAttributeManager :token="token" :scope-id="scopeId" :object-kind="kind" :objects="objects" :capability="descriptor.bulkImport || {}" @updated="bulkUpdated" @open-batch="id => run(() => openBatch(id))" />

    <fieldset class="step-card history-card" :disabled="busy">
      <legend class="sr-only">3. 批次记录与回滚</legend>
      <div class="card-heading">
        <div class="card-title"><span class="section-icon"><History :size="19" /></span><div><h4>变更记录与回滚</h4><p>检查同步结果，必要时恢复修改前的属性</p></div></div>
        <button type="button" class="button" :disabled="!descriptor.enabled || descriptorState !== 'ready' || !token.trim()" @click="run(loadHistory)"><RefreshCw :size="14" />刷新最近 50 个批次</button>
      </div>
      <div class="history-toolbar"><label><span>操作类型</span><select v-model="historyFilter"><option value="ALL">全部操作</option><option v-for="(text, value) in operationLabels" :key="value" :value="value">{{ text }}</option></select></label><small>按快照实际差异分类，与同步状态分开显示；筛选范围为最近 50 个批次。</small></div>
      <div class="table-scroll history-table"><table><thead><tr><th>批次 / 作用域</th><th>操作类型 / 字段变化</th><th>同步状态</th><th>操作时间 / 原因</th><th class="action-column">操作</th></tr></thead><tbody>
        <tr v-for="item in filteredHistory" :key="item.batch_id"><td><span class="identifier">{{ item.batch_id }}</span><small class="scope-label">{{ item.scope_id }}</small><button v-if="item.rollback_of" type="button" class="text-button source-batch" @click="run(() => openBatch(item.rollback_of))">查看来源批次<ChevronRight :size="12" /></button></td><td><span class="operation-badge" :data-operation="operationType(item)">{{ operationLabel(item) }}</span><small class="scope-label">{{ changeLabel(item) }}</small><small v-if="item.changeSummary?.changed_objects === 0" class="no-change">未改变任何对象属性</small></td><td><span class="status-badge" :data-status="item.status">{{ label(item.status) }}</span></td><td><small class="scope-label">{{ timeLabel(item.created_at) }}</small>{{ item.reason }}</td><td><button type="button" class="text-button" @click="run(() => openBatch(item.batch_id))">查看详情<ChevronRight :size="14" /></button></td></tr>
        <tr v-if="!filteredHistory.length"><td colspan="5" class="empty-cell"><div class="empty-state history-empty"><History :size="27" stroke-width="1.4" /><strong>{{ history.length ? '没有符合筛选条件的记录' : '暂无已加载的变更记录' }}</strong><span>输入管理员令牌后刷新记录，可查看每次修改与同步结果</span></div></td></tr>
      </tbody></table></div>
      <div v-if="rollbackFeedback" ref="rollbackFeedbackElement" class="feedback rollback-feedback" :class="rollbackFeedback.state" :role="rollbackFeedback.state === 'error' ? 'alert' : 'status'" tabindex="-1">
        <Loader2 v-if="rollbackFeedback.state === 'pending'" :size="19" class="spin" /><AlertCircle v-else-if="rollbackFeedback.state === 'error' || rollbackFeedback.state === 'warning'" :size="19" /><CheckCircle2 v-else :size="19" />
        <div><strong>{{ rollbackFeedback.state === 'error' ? '恢复请求未完成' : rollbackFeedback.state === 'pending' ? '正在提交恢复操作' : '恢复操作已受理' }}</strong><p>{{ rollbackFeedback.message }}</p><small v-if="rollbackFeedback.batchId">新批次：{{ rollbackFeedback.batchId }} · 当前状态：{{ batch?.batch_id === rollbackFeedback.batchId ? label(batch.status) : '请刷新记录核对' }}</small></div>
      </div>
      <div v-if="batch" class="batch-detail">
        <div class="batch-heading"><div><h4>批次详情</h4><span class="identifier">{{ batch.batch_id }}</span></div><span class="status-badge" :data-status="batch.status">{{ label(batch.status) }}</span><button v-if="['RECONCILING', 'PARTIAL_FAILED', 'RUNNING', 'QUEUED'].includes(batch.status)" type="button" class="button" @click="retryBatch"><RefreshCw :size="14" />重试 / 核对</button></div>
        <p class="batch-note">每个对象独立确认。部分成功时仅重试未完成项；结果未确认前，对象暂不能再次修改。</p>
        <p class="batch-note"><span class="operation-badge" :data-operation="operationType(batch)">{{ operationLabel(batch) }}</span> {{ changeLabel(batch) }}<strong v-if="batch.changeSummary?.changed_objects === 0" class="no-change"> · 该历史批次没有实际改变属性</strong></p>
        <p v-if="batch.actor_note?.startsWith('historical_restore:')" class="batch-note">历史恢复批次：目标为原批次{{ batch.actor_note === 'historical_restore:before' ? '修改前' : '修改后' }}的完整属性。来源：{{ batch.rollback_of }}</p>
        <p v-if="batch.actor_note?.startsWith('bulk_import:')" class="batch-note">来源：CSV批量任务 {{ batch.actor_note.slice('bulk_import:'.length) }}。本批次独立同步与恢复，不代表整文件原子提交。</p>
        <div class="table-scroll"><table><thead><tr><th>对象</th><th>状态</th><th>变更快照</th><th>异常说明</th></tr></thead><tbody><tr v-for="item in batch.items" :key="item.object_uid"><td class="identifier">{{ item.external_key }}</td><td><span class="status-badge" :data-status="item.status">{{ label(item.status) }}</span></td><td><details class="property-details"><summary>查看修改前后</summary><div class="snapshot-pair"><div><small>修改前</small><pre>{{ json(item.before) }}</pre></div><div><small>修改后</small><pre>{{ json(item.after) }}</pre></div></div></details></td><td>{{ item.last_error || '—' }}</td></tr></tbody></table></div>
        <div v-if="batch.items?.some(item => item.status === 'SUCCEEDED')" class="rollback">
          <div class="rollback-heading"><Undo2 :size="18" /><div><strong>恢复到历史版本</strong><p>可跨多次修改恢复本批次已成功对象的完整属性快照。后续新增字段也可能被删除，请逐项核对。几何与导入基线变化、同步未完成时禁止恢复；预览后再有新修改也会被拒绝。</p></div></div>
          <div class="restore-target"><label><span>选择恢复目的</span><select v-model="restoreTarget"><option value="before">撤销该次操作 → 恢复操作前（回滚）</option><option value="after">恢复到该次操作后状态（不是撤销）</option></select></label><button type="button" class="button" :disabled="!descriptor.historicalRestore" @click="previewRestore"><Eye :size="14" />预览历史恢复差异</button></div>
          <p class="restore-purpose">{{ restoreTarget === 'before' ? '当前选择：撤销来源批次。若该批次新增了属性，目标快照中将不再包含这些属性。' : '当前选择：恢复来源批次执行后的状态。若该批次新增了属性，恢复后仍会保留它们；要撤销新增请选择上一项。' }}</p>
          <p v-if="!descriptor.historicalRestore" class="field-hint">当前服务端尚未支持历史恢复，请部署并重启新版后端。</p>
          <div v-if="restorePreview" class="preview-panel restore-preview"><strong>当前属性 → 目标历史快照（{{ restorePreview.items.length }} 个对象）</strong><div class="table-scroll"><table><thead><tr><th>对象 / 字段</th><th>当前值</th><th>恢复后的值</th></tr></thead><tbody><template v-for="item in restorePreview.items" :key="item.externalKey"><tr v-for="key in changedProperties(item)" :key="item.externalKey + ':' + key"><td><small class="identifier">{{ item.externalKey }}</small><strong>{{ key }}</strong></td><td>{{ displayProperty(item.before, key) }}</td><td>{{ Object.hasOwn(item.after, key) ? displayProperty(item.after, key) : '删除该字段（历史快照中不存在）' }}</td></tr><tr v-if="!changedProperties(item).length"><td class="identifier">{{ item.externalKey }}</td><td colspan="2">当前属性与目标快照一致</td></tr></template></tbody></table></div></div>
          <p v-if="restorePreview && !restoreChanges" class="no-change restore-purpose" role="status">当前属性与目标快照完全一致，无需恢复，不会创建批次。若要撤销本次操作，请选择“恢复操作前”重新预览。</p>
          <div class="rollback-form"><label><span>恢复原因</span><textarea v-model="rollbackReason" maxlength="500" rows="2" placeholder="请说明需要恢复历史属性的原因" /></label><label><span>输入“回滚”确认</span><input v-model="rollbackConfirmation" placeholder="回滚" /></label><button type="button" class="button rollback-button" :disabled="!restorePreview || !restoreChanges || creatingRollback || rollbackConfirmation.trim() !== '回滚' || !rollbackReason.trim()" @click="rollbackBatch"><Loader2 v-if="creatingRollback" :size="14" class="spin" /><Undo2 v-else :size="14" />{{ creatingRollback ? '正在创建…' : restoreTarget === 'before' ? '确认回滚到操作前' : '确认恢复到操作后' }}</button></div>
        </div>
      </div>
    </fieldset>
    <footer class="page-footer"><ShieldCheck :size="14" />此处仅维护普通属性。坐标、高程、对象编号和气象格点数值需使用对应业务流程。</footer>
    <div v-if="busy" class="busy-status" role="status"><Loader2 :size="16" class="spin" />正在处理，请稍候</div>
  </section>
</template>

<style scoped>
.attribute-manager {
  --oa-text: #243b53; --oa-muted: #61758a; --oa-border: #dce6ed; --oa-blue: #087ea8; --oa-soft: #f5f8fb;
  color: var(--oa-text); background: #f7f9fc; border: 1px solid #e5ecf2; border-radius: 14px;
  padding: 24px; font-size: 13px; line-height: 1.55; color-scheme: light;
}
.attribute-manager *, .attribute-manager *::before, .attribute-manager *::after { box-sizing: border-box; }
.page-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 20px; }
.eyebrow { font-size: 11px; font-weight: 600; letter-spacing: .08em; color: var(--oa-muted); }
h3 { margin: 3px 0 6px; font-size: 24px; line-height: 1.35; font-weight: 650; letter-spacing: -.02em; color: #173b57; }
.heading-copy p { margin: 0; color: var(--oa-muted); }
.service-status { display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0; padding: 6px 10px; margin-top: 7px; border: 1px solid #e1e7ee; border-radius: 20px; background: #fff; color: #667587; font-size: 12px; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: #8b9baa; }
.service-status.online { background: #edf9f4; color: #21724e; border-color: #cbe9db; }.online .status-dot { background: #238761; }
.service-status.offline { color: #aa4438; border-color: #f0d4ce; background: #fff6f3; }.offline .status-dot { background: #c65c4c; }
.feedback { display: flex; align-items: flex-start; gap: 10px; margin: 0 0 18px; padding: 13px 15px; border: 1px solid; border-radius: 9px; }
.rollback-feedback { margin: 16px 0; scroll-margin: 20px; overflow-wrap: anywhere; }
.rollback-feedback.pending { color: #176380; background: #eef8fc; border-color: #cfe7f2; }
.restore-target { display: flex; align-items: end; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; }
.restore-target label { flex: 1; min-width: 0; }
.restore-purpose { margin: 10px 0; font-size: 12px; color: #7c5e35; line-height: 1.7; }
.history-toolbar { display: flex; align-items: end; flex-wrap: wrap; gap: 14px; margin-bottom: 14px; }
.history-toolbar label { min-width: 180px; }
.history-toolbar > small { color: #728698; padding-bottom: 8px; }
.operation-badge { display: inline-block; padding: 3px 8px; border-radius: 5px; background: #eaf3fb; color: #276492; font-size: 11px; white-space: nowrap; }
.operation-badge[data-operation=ADD_PROPERTIES] { color: #267756; background: #eaf7ef; }
.operation-badge[data-operation=ROLLBACK] { color: #995e22; background: #fff3df; }
.operation-badge[data-operation=RESTORE_AFTER] { color: #74509d; background: #f2ebfa; }
.operation-badge[data-operation=DELETE_PROPERTIES] { color: #aa4740; background: #fff0ec; }
.operation-badge[data-operation=NO_CHANGE] { color: #677787; background: #edf1f5; }
.no-change { display: block; color: #a26722; font-size: 12px; margin-top: 5px; }
.source-batch { margin-top: 6px; font-size: 11px; }
.history-table table { min-width: 810px; }
.rollback-feedback:focus { outline: 2px solid #087ea8; outline-offset: 3px; }
.feedback > svg { flex-shrink: 0; margin-top: 2px; }.feedback > div { min-width: 0; }.feedback strong { font-size: 13px; font-weight: 600; }
.feedback p { margin: 2px 0 0; overflow-wrap: anywhere; }.feedback small { display: block; margin-top: 4px; opacity: .85; }
.feedback.error { color: #a03932; background: #fff5f3; border-color: #f1d5cf; }.feedback.warning { color: #8b5b16; background: #fff9ed; border-color: #eddfbd; }
.feedback.success { color: #236c51; background: #f0faf5; border-color: #cde8d9; }.feedback .feedback-action { margin-left: auto; flex-shrink: 0; background: #fff; color: inherit; border-color: currentColor; }
.workflow { display: flex; align-items: center; gap: 18px; padding: 0 2px 20px; color: #91a0af; }
.workflow-step { display: flex; align-items: center; gap: 7px; color: #486076; font-weight: 550; white-space: nowrap; }
.step-index { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border: 1px solid #dce6ee; border-radius: 8px; font-size: 11px; color: #6d8093; background: #fff; }
.complete .step-index { color: #087ea8; background: #e9f6fc; border-color: #b9dfea; }.workflow-note { display: inline-flex; gap: 6px; align-items: center; margin-left: auto; font-size: 12px; color: #6f8394; }
.edit-workspace { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 18px; align-items: start; }
.step-card { min-width: 0; margin: 0; padding: 20px; border: 1px solid var(--oa-border); border-radius: 11px; background: #fff; box-shadow: 0 2px 6px rgba(25, 55, 80, .025); }
.card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 20px; }
.card-title { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }.section-icon { display: grid; place-items: center; flex-shrink: 0; width: 36px; height: 36px; border-radius: 9px; color: #187fa6; background: #edf6fb; }
h4 { margin: 0; font-size: 15px; font-weight: 650; color: #244259; }.card-title p { margin: 3px 0 0; color: var(--oa-muted); font-size: 12px; }
.count-badge { flex-shrink: 0; color: #277498; background: #eef6fb; padding: 4px 9px; border-radius: 6px; font-size: 11px; }
.source-form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 14px 12px; margin-bottom: 20px; align-items: end; }
.token-field { grid-column: 1 / -1; }.source-form .read-button { grid-column: 1 / -1; justify-self: start; }
.dataset-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }.dataset-label { display: flex; align-items: center; justify-content: space-between; gap: 8px; }.dataset-label .text-button { padding: 0; font-size: 11px; }.dataset-label .text-button:disabled { color: #8a9aa8; cursor: not-allowed; }.dataset-hint { line-height: 1.5; color: #7b8b99; font-size: 11px; }.dataset-hint.dataset-error { color: #a34a40; }
label { display: flex; flex-direction: column; gap: 6px; min-width: 0; color: #425b70; font-size: 12px; font-weight: 550; }
label small { color: #7b8b99; font-size: 11px; font-weight: 400; }label em { font-size: 10px; color: #9c6d46; font-style: normal; font-weight: 400; margin-left: 4px; }
input, select, textarea { width: 100%; min-width: 0; border: 1px solid #cfdae4; border-radius: 7px; background: #fff; color: #243b53; padding: 9px 10px; font: inherit; font-weight: 400; line-height: 1.45; transition: border-color .15s, box-shadow .15s; }
input, select { min-height: 39px; }input::placeholder, textarea::placeholder { color: #8795a3; opacity: 1; }textarea { resize: vertical; min-height: 76px; }
input:focus, select:focus, textarea:focus { outline: none; border-color: #3f9ec1; box-shadow: 0 0 0 3px #ebf5fb; }
input[type=checkbox] { width: 15px; height: 15px; min-height: 0; margin: 0; accent-color: #087ea8; cursor: pointer; flex-shrink: 0; }
input:disabled, select:disabled, textarea:disabled { color: #7a8c9b; background: #f5f7fa; border-color: #e0e7ee; cursor: not-allowed; opacity: 1; }
.button { display: inline-flex; gap: 7px; align-items: center; justify-content: center; min-height: 36px; padding: 8px 12px; border: 1px solid #cbd9e4; border-radius: 7px; background: #fff; color: #3d5f78; font: inherit; font-size: 12px; font-weight: 550; line-height: 1.4; cursor: pointer; transition: background .15s, border-color .15s; }
.button:hover:not(:disabled) { background: #f0f7fb; border-color: #87bcd2; }.button.primary { color: #fff; background: #087ea8; border-color: #087ea8; }.button.primary:hover:not(:disabled) { background: #056b92; }
.button:disabled, fieldset:disabled .button { cursor: not-allowed; color: #8493a2; background: #f0f3f7; border-color: #dde5ec; opacity: 1; }
.button:focus-visible, .text-button:focus-visible, summary:focus-visible { outline: 2px solid #087ea8; outline-offset: 3px; }
.button svg { flex-shrink: 0; }.icon-button { width: 32px; min-height: 32px; padding: 6px; }
.table-scroll { width: 100%; overflow: auto; max-height: 360px; border: 1px solid #e3ebf1; border-radius: 8px; }
table { width: 100%; border-collapse: collapse; text-align: left; color: #3c5267; }
thead { background: #f5f8fb; }th { padding: 10px 12px; color: #63788b; font-size: 11px; font-weight: 600; white-space: nowrap; }
td { padding: 12px; border-top: 1px solid #edf1f5; vertical-align: middle; overflow-wrap: anywhere; font-size: 12px; }
tbody tr:hover:not(:has(.empty-state)) { background: #f9fbfd; }tbody .selected-row { background: #f0f8fd; }
.check-column { width: 36px; }.version-column { width: 64px; }.action-column { width: 104px; }
.identifier { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; overflow-wrap: anywhere; }.version-tag { color: #65778b; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
.row-warning { display: block; color: #a16e25; font-size: 11px; margin-bottom: 5px; }.property-details summary { color: #087ea8; cursor: pointer; font-size: 12px; white-space: nowrap; }
pre { padding: 10px; background: #f5f8fb; border: 1px solid #e5ecf2; border-radius: 6px; color: #456078; font-size: 11px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; min-width: 140px; max-width: 480px; margin: 8px 0 0; }
.empty-cell { padding: 0; }.empty-state { display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 8px; padding: 44px 14px; min-height: 190px; color: #8d9fac; text-align: center; }
.empty-state > svg { margin-bottom: 4px; color: #9cb5c8; }.empty-state strong { color: #657d90; font-size: 13px; font-weight: 500; }.empty-state span { color: #7c8f9f; font-size: 11px; }
.pagination { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 13px; color: #6d8093; font-size: 11px; }.pagination > div { display: flex; gap: 6px; }.pagination b { font-weight: 600; }.pagination-divider { margin: 0 7px; color: #c4d0d9; }
.editor-guide { display: flex; align-items: center; gap: 11px; background: #f5f8fb; border: 1px dashed #d3e0e9; border-radius: 8px; padding: 14px; margin-bottom: 16px; }.guide-number { color: #7fa4be; font-size: 22px; }.editor-guide strong { font-weight: 550; font-size: 12px; color: #57768c; }.editor-guide p { margin: 3px 0 0; color: #7b8e9e; font-size: 11px; }
.selection-note { display: flex; gap: 7px; align-items: center; margin-bottom: 16px; padding: 11px; border-radius: 7px; background: #eef8fc; color: #36768f; font-size: 12px; }
.field-placeholder { padding: 18px; text-align: center; border-radius: 7px; border: 1px dashed #e0e7ed; color: #8493a0; font-size: 12px; margin-bottom: 12px; }
.attribute-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; padding: 13px; margin-bottom: 10px; border: 1px solid #e2eaf1; border-radius: 8px; background: #fafcfe; }
.current-property { grid-column: 1 / -1; min-width: 0; color: #526c82; font-size: 12px; }
.dataset-properties { margin-bottom: 14px; padding: 12px; border: 1px solid #e2eaf1; border-radius: 8px; background: #f7fafc; font-size: 12px; color: #526c82; }
.dataset-properties p { margin: 8px 0 0; line-height: 1.6; }
.property-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.property-chips > span { padding: 4px 8px; border: 1px solid #dbe8f0; border-radius: 5px; background: white; overflow-wrap: anywhere; }
.property-chips small { margin-left: 4px; color: #728698; }
.editor-mode { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.delete-mode-button, .delete-target { color: #b34c3e; }
.delete-mode-button.active, .delete-submit { background: #b34c3e; border-color: #b34c3e; color: #fff; }
.delete-warning { margin: 10px 0 14px; padding: 11px 13px; border: 1px solid #efcec8; border-radius: 7px; background: #fff5f2; color: #98483d; font-size: 12px; line-height: 1.7; }
.delete-target { margin: 25px 0 0; font-size: 12px; }
.delete-confirmation { margin: 15px 0; }
.current-property > span { font-weight: 600; }
.current-property pre { margin: 5px 0; padding: 8px 10px; border-radius: 5px; background: #eef3f7; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; max-height: 100px; overflow: auto; }
.current-property small, .readonly-properties small { color: #728698; line-height: 1.6; }
.readonly-properties { margin-top: 12px; padding: 10px 12px; border: 1px solid #e2eaf1; border-radius: 7px; font-size: 12px; color: #526c82; }
.readonly-properties summary { cursor: pointer; }
.readonly-properties p { margin: 8px 0; overflow-wrap: anywhere; }
.row-options { display: flex; justify-content: space-between; align-items: center; grid-column: 1 / -1; }.inline { display: inline-flex; flex-direction: row; align-items: center; gap: 6px; font-size: 11px; font-weight: 400; }.remove-button { padding: 5px; min-height: 28px; width: 28px; border: 0; background: transparent; color: #a26058; }
.add-button { width: 100%; border-style: dashed; color: #087ea8; }.reason { margin-top: 19px; }.reason small { align-self: flex-end; color: #8493a1; font-variant-numeric: tabular-nums; }.field-hint { margin-top: 10px; color: #728698; font-size: 11px; line-height: 1.65; }
.editor-actions { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-top: 18px; padding-top: 16px; border-top: 1px solid #edf1f5; }.editor-actions > span { font-size: 11px; color: #7d8e9d; }
.preview-panel { margin-top: 20px; border-top: 1px solid #dce9f0; padding-top: 16px; }.preview-heading { display: flex; align-items: center; gap: 7px; color: #24799c; margin-bottom: 12px; }.preview-heading strong { font-size: 12px; }.preview-heading > span { margin-left: auto; font-size: 11px; color: #7b8d9c; }
.preview-table { max-height: 270px; }.preview-table td { min-width: 70px; font-size: 11px; }.preview-table td:first-child { max-width: 180px; }.preview-table td small { display: block; color: #8493a1; font-size: 10px; margin-bottom: 4px; }.preview-table td strong { display: block; font-weight: 550; color: #496175; }.new-value { color: #177058; background: #f4fbf7; }
.submit-button { width: 100%; margin-top: 13px; }.retry-hint { margin: 9px 0 0; color: #7b8e9f; font-size: 11px; }
.history-card { margin-top: 18px; }.history-card > .card-heading { align-items: center; margin-bottom: 16px; }.history-empty { min-height: 150px; padding: 25px 14px; }.scope-label { display: block; margin-top: 4px; font-size: 11px; color: #8a9aa8; }
.text-button { display: inline-flex; align-items: center; gap: 2px; border: 0; background: none; padding: 4px 0; color: #087ea8; cursor: pointer; font-size: 12px; white-space: nowrap; }.text-button:hover { color: #005f88; }
.status-badge { display: inline-block; border-radius: 5px; padding: 3px 8px; background: #eef3f8; color: #64798c; font-size: 11px; white-space: nowrap; }
.status-badge[data-status=SUCCEEDED] { color: #277955; background: #edf8f1; }.status-badge[data-status=RUNNING], .status-badge[data-status=QUEUED] { color: #24789b; background: #edf7fd; }
.status-badge[data-status=PARTIAL_FAILED], .status-badge[data-status=RECONCILING], .status-badge[data-status=RETRY_WAIT] { color: #9d6b24; background: #fff6e7; }.status-badge[data-status=FAILED], .status-badge[data-status=BLOCKED] { color: #ae5249; background: #fff0ec; }
.batch-detail { margin-top: 18px; border-top: 1px solid var(--oa-border); padding-top: 18px; }.batch-heading { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }.batch-heading > div { margin-right: auto; }.batch-heading .identifier { display: block; margin-top: 3px; color: #8797a7; }.batch-note { color: #73889b; font-size: 12px; margin: 12px 0; }
.snapshot-pair { display: flex; gap: 12px; flex-wrap: wrap; }.snapshot-pair > div { min-width: 170px; flex: 1; }.snapshot-pair small { display: block; margin-top: 8px; color: #7990a3; }
.rollback { margin-top: 18px; padding: 16px; border: 1px solid #ebd8bd; border-radius: 9px; background: #fffaf4; }.rollback-heading { display: flex; align-items: flex-start; gap: 8px; color: #936526; }.rollback-heading > svg { flex-shrink: 0; margin-top: 2px; }.rollback-heading strong { font-size: 12px; font-weight: 600; }.rollback-heading p { margin: 4px 0 0; font-size: 11px; color: #977d58; }
.rollback-form { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr) auto; gap: 12px; align-items: end; margin-top: 14px; }.rollback-form textarea { min-height: 64px; }.rollback-button { color: #96601e; border-color: #d9bc95; background: #fff; }
.page-footer { display: flex; align-items: flex-start; gap: 6px; margin-top: 16px; color: #8191a0; font-size: 11px; }.page-footer > svg { flex-shrink: 0; margin-top: 2px; }
.busy-status { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); z-index: 10001; display: flex; gap: 9px; align-items: center; padding: 12px 20px; background: #fff; border: 1px solid #cbdfe9; border-radius: 10px; box-shadow: 0 8px 30px #214a6726; color: #37667f; font-size: 12px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.spin { animation: spin 1s linear infinite; }@keyframes spin { to { transform: rotate(360deg); } }@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
@media (min-width: 1400px) { .source-form { grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); }.token-field { grid-column: auto; grid-row: 1 / 3; align-self: start; }.source-form .read-button { grid-column: 2; width: 100%; }.edit-workspace { grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); } }
@media (max-width: 1000px) { .attribute-manager { padding: 18px; }.edit-workspace { grid-template-columns: minmax(0, 1fr); }.workflow-note { display: none; }.rollback-form { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }.rollback-form > label:first-child { grid-column: 1 / -1; }.rollback-form > button { justify-self: start; }.guide-number { transform: rotate(90deg); } }
@media (max-width: 600px) { .attribute-manager { padding: 14px; border-radius: 10px; }.page-heading { flex-direction: column; gap: 8px; }.service-status { margin-top: 0; }.workflow { gap: 7px; font-size: 11px; flex-wrap: wrap; }.workflow > svg { width: 12px; }.step-index { width: 22px; height: 22px; font-size: 10px; }.step-card { padding: 15px; }.card-heading { flex-wrap: wrap; }.source-form { grid-template-columns: minmax(0, 1fr); }.token-field, .source-form .read-button { grid-column: 1; }.history-card > .card-heading > button { margin-left: 46px; }.attribute-row, .rollback-form { grid-template-columns: minmax(0, 1fr); }.row-options, .rollback-form > label:first-child { grid-column: 1; }.feedback { flex-wrap: wrap; }.feedback .feedback-action { margin-left: 29px; }.table-scroll { overflow-x: auto; }.history-table table { min-width: 520px; }.object-table table { min-width: 370px; } }
</style>
