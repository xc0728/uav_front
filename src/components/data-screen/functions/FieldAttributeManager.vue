<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { errorMessage } from '../../../utils/http.js'
import { noiseAttributeLabel } from '../../../utils/noiseGrid.js'

const emit = defineEmits(['import-field'])
const items = ref([])
const loading = ref(false)
const error = ref('')
const search = ref('')
const state = ref('all')
const selectedId = ref('')
const operation = ref(null)
const reason = ref('')
const token = ref('')
const busy = ref(false)
const actionError = ref('')
const previewed = ref(false)
const notice = ref('')
const confirmation = ref('')
const purgePreview = ref(null)
const purgeJob = ref(null)
let mounted = true
const filtered = computed(() => items.value.filter(item => {
  const text = `${fieldName(item)} ${item.code} ${item.category || ''} ${item.bindings.map(b => b.datasetId).join(' ')}`.toLowerCase()
  return (state.value === 'all' || item.state === state.value) && text.includes(search.value.trim().toLowerCase())
}))
const selected = computed(() => filtered.value.find(item => item.attributeId === selectedId.value) || filtered.value[0])

function fieldName(item) {
  if (item.code === 'surveillance_coverage') return '监视设施覆盖'
  const label = noiseAttributeLabel(item.code)
  return label !== item.code ? label.replace('（待入库）', '') : (item.name || item.code)
}

async function jsonResponse(response, fallback) {
  if (!response.ok) throw new Error(await errorMessage(response, fallback))
  const body = await response.json()
  if (body?.success === false || body?.status === 'error') throw new Error(body.message || fallback)
  return body
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const body = await jsonResponse(await fetch('/api/grid-attributes/catalog'), '场数据目录加载失败')
    items.value = (body?.data?.items || []).map(item => ({ ...item, bindings: item.bindings || [] }))
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function openStateChange(item) {
  operation.value = { ...item, targetState: item.state === 'active' ? 'retired' : 'active' }
  reason.value = ''
  token.value = window.sessionStorage.getItem('staticFeatureAdminToken') || ''
  actionError.value = ''
  previewed.value = false
  purgePreview.value = null
  purgeJob.value = null
}

function openPurge(item) {
  openStateChange(item)
  operation.value = { ...item, purge: true }
  confirmation.value = ''
}

async function pollPurge(jobId) {
  purgeJob.value = { jobId, status: 'queued' }
  for (let attempt = 0; attempt < 1800 && mounted; attempt++) {
    const body = await jsonResponse(await fetch(`/api/data-processing-jobs/${encodeURIComponent(jobId)}`), '清理任务查询失败')
    purgeJob.value = body.data
    if (body.data?.status === 'succeeded') return body.data.result
    if (body.data?.status === 'failed') throw new Error(body.data.error || '清理任务失败，请重新预检后重试')
    await new Promise(resolve => window.setTimeout(resolve, 1000))
  }
  throw new Error(`已停止等待，请通过任务查询查看 ${jobId}，不要重复提交清理`)
}

async function changeState(dryRun) {
  if (!reason.value.trim() || !token.value.trim()) {
    actionError.value = '请填写操作原因和管理员令牌。'
    return
  }
  if (operation.value.purge && confirmation.value !== operation.value.code) {
    actionError.value = '请完整输入属性编码确认清理范围。'
    return
  }
  if (operation.value.purge && !dryRun && !purgePreview.value) {
    actionError.value = '请先执行物理清理预检。'
    return
  }
  busy.value = true
  actionError.value = ''
  try {
    const item = operation.value
    if (item.purge) {
      const payload = { confirmAttributeCode: confirmation.value, reason: reason.value.trim(), dryRun }
      if (!dryRun) {
        payload.expectedRows = purgePreview.value.factRows
        payload.expectedBindingFingerprint = purgePreview.value.bindingFingerprint
      }
      const body = await jsonResponse(await fetch(`/api/grid-attributes/catalog/${encodeURIComponent(item.attributeId)}/purge-jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Static-Feature-Admin-Token': token.value.trim() },
        body: JSON.stringify(payload),
      }), '物理清理任务提交失败')
      if (!body.data?.jobId) throw new Error('服务未返回任务编号')
      const result = await pollPurge(body.data.jobId)
      if (dryRun) {
        purgePreview.value = result
        previewed.value = true
      } else {
        notice.value = `${fieldName(item)}事实数据及绑定已物理清理，停用目录保留；旧数据部件占用空间由数据库后台回收。`
        operation.value = null
        await load()
      }
      return
    }
    await jsonResponse(await fetch(`/api/grid-attributes/catalog/${encodeURIComponent(item.attributeId)}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Static-Feature-Admin-Token': token.value.trim() },
      body: JSON.stringify({ state: item.targetState, expectedState: item.state, reason: reason.value.trim(), dryRun }),
    }), '场数据状态更新失败')
    if (dryRun) previewed.value = true
    else {
      notice.value = `${fieldName(item)}已${item.targetState === 'active' ? '恢复' : '停用'}`
      operation.value = null
      await load()
    }
  } catch (e) {
    actionError.value = e.message
    previewed.value = false
    purgePreview.value = null
  } finally {
    busy.value = false
  }
}

function openImport(type, binding) {
  emit('import-field', { type, attribute: selected.value, binding })
}

onMounted(load)
onUnmounted(() => { mounted = false })
</script>

<template>
  <section class="field-manager">
    <div class="field-toolbar">
      <input v-model="search" type="search" placeholder="搜索场名称、属性编码或绑定数据集" aria-label="搜索场数据" />
      <select v-model="state" aria-label="场数据状态"><option value="all">全部状态</option><option value="active">已启用</option><option value="retired">已停用</option></select>
      <button :disabled="loading" @click="load">{{ loading ? '加载中…' : '刷新' }}</button>
      <button @click="openImport('parquetAttribute')">导入噪声 / 表格属性</button>
      <button @click="openImport('fieldResample')">导入监视覆盖 / 多维场</button>
    </div>
    <p class="field-note">统一管理噪声、监视设施覆盖、电磁场等已注册网格属性。绑定数表示关联的空域版本数，不表示网格覆盖数量。</p>
    <p v-if="error" role="alert" class="field-error">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <div class="field-workspace">
      <div class="field-list">
        <button v-for="item in filtered" :key="item.attributeId" class="field-row" :class="{ selected: selected?.attributeId === item.attributeId }" @click="selectedId = item.attributeId">
          <span><strong>{{ fieldName(item) }}</strong><small>{{ item.code }} · 定义 v{{ item.schemaVersion }}</small></span>
          <span>{{ item.unit || '无单位' }}<small>{{ item.bindings.length }} 个绑定 · {{ item.state === 'active' ? '已启用' : '已停用' }}</small></span>
        </button>
        <p v-if="!filtered.length && !loading && !error" class="field-note">暂无符合条件的属性，可通过上方导入入口添加场数据。</p>
      </div>
      <aside v-if="selected" class="field-detail">
        <h3>{{ fieldName(selected) }}</h3>
        <p>{{ selected.description || '暂无说明' }}</p>
        <dl><dt>分类</dt><dd>{{ ({ environment_field: '环境场', noise: '噪声', surveillance: '监视覆盖' })[selected.category] || selected.category || '未分类' }}</dd><dt>数值类型</dt><dd>{{ ({ float: '浮点数', int: '整数', uint: '非负整数', bool: '布尔值', string: '文本' })[selected.valueType] || selected.valueType }}</dd><dt>时间类型</dt><dd>{{ selected.temporalMode === 'interval' ? '时段场' : '静态场' }}</dd></dl>
        <h4>绑定空域及版本（{{ selected.bindings.length }}）</h4>
        <div v-for="binding in selected.bindings" :key="binding.bindingId" class="field-binding">
          <strong>{{ binding.datasetId }}</strong>
          <small>v{{ binding.datasetVersion }} · L{{ binding.level }} · 投影版本 {{ binding.projectionRevision }}</small>
          <small>更新：{{ binding.updatedAt || '—' }}</small>
          <button @click="openImport('parquetAttribute', binding)">向此空域导入属性</button>
          <button @click="openImport('fieldResample', binding)">向此空域挂载场</button>
        </div>
        <p v-if="!selected.bindings.length" class="field-note">尚未绑定真高空域，注册属性不代表已有覆盖数据。</p>
        <button class="field-state-button" @click="openStateChange(selected)">{{ selected.state === 'active' ? '停用此属性' : '恢复此属性' }}</button>
        <button v-if="selected.state === 'retired'" class="field-state-button field-error" @click="openPurge(selected)">永久清理事实数据</button>
        <p class="field-note">状态操作影响此属性定义绑定的全部空域；事实数据保留，恢复后可继续查询。</p>
        <p class="field-note">永久清理需先停用，将删除该属性全部版本的事实数据和绑定，不删除基础空域网格；仅恢复目录不能找回已清理数据。</p>
      </aside>
    </div>
    <div v-if="operation" class="field-modal">
      <section role="dialog" aria-modal="true" aria-label="场数据管理">
        <h3>{{ operation.purge ? '永久清理' : operation.targetState === 'active' ? '恢复' : '停用' }}{{ fieldName(operation) }}</h3>
        <p v-if="operation.purge" class="field-error">不可恢复：清理该属性全部绑定、全部历史投影的事实数据。请先备份；不会删除其他属性及共用空域网格。</p>
        <p v-else>影响此定义的 {{ operation.bindings.length }} 个空域绑定。{{ operation.targetState === 'retired' ? '停用后不再参与在线场属性查询，数据仍保留。' : '恢复后重新参与在线场属性查询。' }}</p>
        <label v-if="operation.purge">输入属性编码：{{ operation.code }}<input v-model="confirmation" :disabled="busy" @input="previewed = false" /></label>
        <label>操作原因<textarea v-model="reason" :disabled="busy" maxlength="500" @input="previewed = false" /></label>
        <label>管理员令牌（与实体要素管理相同）<input v-model="token" :disabled="busy" type="password" autocomplete="off" @input="previewed = false" /></label>
        <p v-if="actionError" class="field-error" role="alert">{{ actionError }}</p>
        <p v-if="purgeJob">任务 {{ purgeJob.jobId }}：{{ purgeJob.progress?.stage || purgeJob.status }}</p>
        <div v-if="operation.purge && purgePreview">
          <p>待删除 {{ Number(purgePreview.factRows).toLocaleString('zh-CN') }} 条事实数据、{{ purgePreview.bindingCount }} 个绑定。</p>
          <p v-for="(count, table) in purgePreview.tables" :key="table">{{ table }}：{{ Number(count).toLocaleString('zh-CN') }} 条</p>
        </div>
        <p v-if="previewed">预检通过，可确认执行。</p>
        <footer><button :disabled="busy" @click="operation = null">取消</button><button :disabled="busy" @click="changeState(true)">预检</button><button :disabled="busy || !previewed" @click="changeState(false)">{{ busy ? '处理中…' : '确认执行' }}</button></footer>
      </section>
    </div>
  </section>
</template>

<style scoped>
.field-manager { color: var(--theme-text-primary, #244252); }
.field-toolbar { display:flex; flex-wrap:wrap; gap:8px; margin:16px 0; }
input, select, textarea, button { font:inherit; color:inherit; border:1px solid var(--theme-nav-border,#c8dbe7); border-radius:7px; padding:8px 10px; background:var(--theme-dropdown-bg,#fff); }
.field-toolbar input { flex:1; min-width:220px; }
button { cursor:pointer; } button:disabled { opacity:.5; cursor:wait; }
.field-note { color:var(--theme-side-label,#64748b); font-size:12px; line-height:1.6; }
.field-workspace { display:grid; grid-template-columns:minmax(300px,1fr) minmax(300px,1fr); gap:16px; }
.field-list, .field-detail { border:1px solid var(--theme-nav-border,#c8dbe7); border-radius:10px; background:var(--theme-dropdown-bg,#fff); }
.field-list { max-height:650px; overflow:auto; }
.field-row { display:flex; justify-content:space-between; gap:12px; width:100%; text-align:left; border:0; border-bottom:1px solid var(--theme-nav-border,#c8dbe7); border-radius:0; padding:14px; }
.field-row.selected { background:color-mix(in srgb,var(--theme-dropdown-bg,#fff) 88%,#168fc5 12%); }
small { display:block; margin-top:5px; color:var(--theme-side-label,#64748b); }
.field-detail { padding:18px; overflow-wrap:anywhere; } h3 { margin-top:0; }
dl { display:grid; grid-template-columns:90px 1fr; gap:8px; } dd { margin:0; }
.field-binding { padding:12px 0; border-top:1px solid var(--theme-nav-border,#c8dbe7); }.field-binding button { margin:8px 6px 0 0; font-size:12px; }
.field-state-button { margin-top:14px; } .field-error { color:#b42318; }
.field-modal { position:fixed; inset:0; background:#07172399; display:grid; place-items:center; z-index:10000; padding:20px; }
.field-modal section { background:var(--theme-dropdown-bg,#fff); padding:24px; border-radius:12px; width:min(540px,100%); max-height:90vh; overflow:auto; }
.field-modal label { display:block; margin:14px 0; }.field-modal input,.field-modal textarea { display:block; width:100%; margin-top:6px; box-sizing:border-box; }
footer { display:flex; justify-content:flex-end; gap:8px; }
@media(max-width:900px) { .field-workspace { grid-template-columns:1fr; } }
</style>
