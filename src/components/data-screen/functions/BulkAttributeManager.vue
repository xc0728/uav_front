<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Upload, RefreshCw, Download, Pause, Play, FileSpreadsheet } from 'lucide-vue-next'
import { attributeRequest } from '../../../utils/objectAttributes.js'
import { errorMessage } from '../../../utils/http.js'
const props = defineProps({
  token: { type: String, default: '' }, scopeId: { type: String, default: '' },
  objectKind: { type: String, default: 'STATIC_FEATURE' }, capability: { type: Object, default: () => ({}) },
  objects: { type: Array, default: () => [] },
})
const emit = defineEmits(['updated', 'open-batch'])
const csv = ref(null), reason = ref(''), operation = ref('fill_missing'), overwrite = ref(false)
const busy = ref(false), error = ref(''), note = ref(''), tasks = ref([]), selectedId = ref('')
const job = ref(null), rows = ref([]), cursor = ref('0'), stack = ref(['0']), hasMore = ref(false), nextCursor = ref('0')
const confirmation = ref(''), uploadId = ref(''), enabled = computed(() => props.capability.enabled === true)
const rollbackReason = ref(''), rollbackId = ref('')
const model = computed(() => props.objectKind === 'MODEL_OBJECT')
const kindAllowed = computed(() => props.capability.objectKinds?.includes(props.objectKind) && (!model.value || props.capability.verifiedModelSources?.includes(props.scopeId)))
const rolling = computed(() => job.value?.task_type === 'ROLLBACK')
const confirmWord = computed(() => rolling.value ? '整文件回滚' : '批量执行')
const canRollback = computed(() => ['SUCCEEDED','PARTIAL_FAILED'].includes(job.value?.status) && Number(job.value?.counts?.SUCCEEDED) > 0)
const statuses = { VALIDATING: '预检中', AWAITING_CONFIRMATION: '等待确认', RUNNING: '执行中', PAUSED: '已暂停', SUCCEEDED: '全部成功', PARTIAL_FAILED: '部分失败', FAILED: '任务失败', CANCELLED: '已取消（未提交）' }
const rowLabels = { PENDING: '待预检', READY: '可执行', SKIPPED: '已跳过', INVALID: '无效行', DISPATCHING: '正在提交', QUEUED: '同步待确认', SUCCEEDED: '成功', FAILED: '失败' }
const operationLabels = { fill_missing: '只补空值', add: '新增属性', update: '修改已有属性', upsert: '新增或覆盖', delete: '删除属性' }
const canConfirm = computed(() => job.value?.status === 'AWAITING_CONFIRMATION' && Number(job.value.counts?.READY) > 0 && !Number(job.value.counts?.INVALID))
let timer = null, generation = 0, mounted = true, lastSuccess = ''
const lifetime = new AbortController()
const api = (path, options = {}) => attributeRequest(path, { token: props.token, signal: lifetime.signal, ...options })
watch([csv, reason, operation, overwrite, () => props.scopeId, () => props.objectKind], () => { uploadId.value = '' })
watch([rollbackReason, selectedId], () => { rollbackId.value = '' })
watch(() => props.scopeId, () => { csv.value = null; confirmation.value = ''; note.value = ''; error.value = '' })
async function run(work) {
  if (busy.value) return
  busy.value = true; error.value = ''; note.value = ''
  try {
    if (!props.token.trim()) throw new Error('请先输入上方管理员令牌')
    await work()
  } catch (e) { if (mounted) error.value = e.name === 'AbortError' ? '请求中断，任务可能已受理。请刷新任务核对后使用原请求重试。' : e.message }
  finally { busy.value = false }
}
async function list() { const r = await api('bulk-imports'); if (mounted) tasks.value = r.items || [] }
async function loadRows(id) {
  const r = await api('bulk-imports/' + id + '/rows?after=' + cursor.value)
  if (selectedId.value !== id || !mounted) return
  rows.value = r.items; hasMore.value = r.hasMore; nextCursor.value = r.nextCursor
}
async function open(id, reset = true) {
  clearTimeout(timer)
  const version = ++generation
  if (reset) { cursor.value = '0'; stack.value = ['0']; confirmation.value = '' }
  selectedId.value = id
  const r = await api('bulk-imports/' + id)
  if (!mounted || version !== generation) return
  job.value = r
  await loadRows(id); await list()
  if (!mounted || version !== generation) return
  const signature = id + ':' + (r.counts?.SUCCEEDED || 0)
  if (Number(r.counts?.SUCCEEDED) > 0 && signature !== lastSuccess) {
    lastSuccess = signature; emit('updated', { scopeId: r.scope_id })
    window.dispatchEvent(new CustomEvent('object-attributes-updated', { detail: { scopeId: r.scope_id } }))
  }
  if (['VALIDATING', 'RUNNING', 'PAUSED'].includes(r.status)) {
    const poll = () => open(id, false).catch(e => {
      if (!mounted || selectedId.value !== id) return
      error.value = e.message; timer = setTimeout(poll, 5000)
    })
    timer = setTimeout(poll, 3000)
  }
}
async function upload() {
  await run(async () => {
    if (!enabled.value || !kindAllowed.value) throw new Error('批量导入未启用，或当前模型来源尚未通过身份核验')
    if (!props.scopeId || !csv.value || !reason.value.trim()) throw new Error('请选择数据集、CSV文件并填写操作原因')
    if (!csv.value.size || csv.value.size > Number(props.capability.maxFileBytes)) throw new Error('文件为空或超过上传限制')
    if (!uploadId.value) uploadId.value = crypto.randomUUID()
    const q = new URLSearchParams({ objectKind: props.objectKind, scopeId: props.scopeId, requestId: uploadId.value, reason: reason.value.trim(), operation: operation.value, allowOverwrite: String(overwrite.value), fileName: csv.value.name })
    const response = await fetch('/api/object-attributes/bulk-imports?' + q, {
      method: 'POST', headers: { 'Content-Type': 'text/csv; charset=utf-8', 'X-Static-Feature-Admin-Token': props.token },
      body: csv.value, signal: lifetime.signal,
    })
    if (!response.ok) throw new Error(await errorMessage(response, 'CSV上传失败'))
    const result = await response.json()
    if (result.status !== 'success') throw new Error(result.message || 'CSV上传失败')
    await open(result.data.job_id)
    note.value = '文件已落盘，服务端正在预检；预检不会修改业务属性。'
  })
}
async function action(name) {
  await run(async () => {
    await api('bulk-imports/' + job.value.job_id + '/' + name, { method: 'POST', body: { confirmation: confirmation.value, fileSha256: job.value.file_sha256 } })
    await open(job.value.job_id, false)
  })
}
async function rollbackFile() {
  await run(async () => {
    if (!rollbackReason.value.trim()) throw new Error('请填写整文件回滚原因')
    if (!rollbackId.value) rollbackId.value = crypto.randomUUID()
    const result = await api('bulk-imports/' + job.value.job_id + '/rollback-preview', {
      method: 'POST', body: { requestId: rollbackId.value, reason: rollbackReason.value.trim() },
    })
    await open(result.job_id)
    note.value = '正在汇总整个文件的回滚差异。预览不会修改属性，通过后一次确认即可执行整个文件。'
  })
}
async function page(direction) {
  await run(async () => {
    if (direction > 0 && hasMore.value) stack.value.push(nextCursor.value)
    else if (direction < 0 && stack.value.length > 1) stack.value.pop()
    else return
    cursor.value = stack.value.at(-1); await loadRows(job.value.job_id)
  })
}
function save(content, name) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
function template() {
  const quote = v => '"' + String(v).replaceAll('"', '""') + '"'
  const lines = [model.value ? ['source', 'object_uid', 'external_key', 'base_token', 'expected_revision', 'operation', 'unset', 'Address', 'Descriptio', 'notes'] : ['dataset_id', 'feature_uid', 'base_token', 'expected_revision', 'operation', 'unset', 'Address', 'Descriptio', 'notes']]
  for (const item of props.objects.filter(v => v.editable)) lines.push(model.value ? [props.scopeId, item.objectUid, item.externalKey, item.baseToken, item.propertyRevision, 'fill_missing', '', '', '', ''] : [props.scopeId, item.objectUid, item.baseToken, item.propertyRevision, 'fill_missing', '', '', '', ''])
  save('\uFEFF' + lines.map(row => row.map(quote).join(',')).join('\r\n') + '\r\n', '属性批量更新_当前页模板.csv')
}
async function download() {
  await run(async () => {
    const response = await fetch('/api/object-attributes/bulk-imports/' + job.value.job_id + '/report', { headers: { 'X-Static-Feature-Admin-Token': props.token }, signal: lifetime.signal })
    if (!response.ok) throw new Error(await errorMessage(response, '报告下载失败'))
    save(await response.blob(), '属性批量任务_' + job.value.job_id + '.csv')
  })
}
const json = value => JSON.stringify(value, null, 2)
onBeforeUnmount(() => { mounted = false; ++generation; clearTimeout(timer); lifetime.abort() })
</script>

<template>
  <section class="bulk-card" aria-label="CSV批量普通属性维护">
    <header><div><h4><FileSpreadsheet :size="19" />CSV 批量普通属性维护</h4><p>已有对象的属性新增、修改与删除；先预检再确认，后台执行并持久化进度。</p></div><button type="button" :disabled="busy || !enabled || !token.trim()" @click="run(list)"><RefreshCw :size="14" />刷新任务</button></header>
    <p v-if="!enabled" class="warning">批量功能尚未就绪：请部署 {{ capability.migration || 'SQL/50_object_attribute_bulk_import.sql' }} 并重启已启用 bulk 配置的后端。</p>
    <p v-if="model && !kindAllowed" class="warning">当前模型来源尚未核验身份或后端未升级，暂不允许批量写入。</p>
    <div v-if="error" class="feedback error" role="alert">{{ error }}</div>
    <div v-if="note" class="feedback success" role="status">{{ note }}</div>
    <fieldset :disabled="busy || !enabled || !kindAllowed">
      <div class="upload-form">
        <label><span>{{ model ? '当前模型来源' : '当前数据集' }}</span><input :value="scopeId" readonly placeholder="请在上方选择数据集或模型" /></label>
        <label><span>默认操作（CSV operation 列可逐行指定）</span><select v-model="operation"><option v-for="(label, key) in operationLabels" :key="key" :value="key">{{ label }}</option></select></label>
        <label><span>CSV 文件（最多 {{ Math.round(Number(capability.maxFileBytes || 0) / 1048576) }} MiB）</span><input type="file" accept=".csv,text/csv" @change="csv = $event.target.files[0] || null" /></label>
        <label><span>操作原因</span><input v-model="reason" maxlength="500" placeholder="例如：根据核实资料批量补全地址描述" /></label>
      </div>
      <label class="inline"><input v-model="overwrite" type="checkbox" />我允许 update/upsert 行覆盖已有非空值（默认关闭）</label>
      <p class="hint">单文件只操作一个数据集或模型来源、每对象一行。模型须使用永久 object_uid 和带类型的 external_key，不能用名称或格网编码。空单元格不修改；delete 行在 unset 列填写 JSON 字段名数组。关闭页面不终止已确认任务。</p>
      <div class="actions"><button type="button" :disabled="!scopeId || !csv || !reason.trim() || !token.trim()" @click="upload"><Upload :size="14" />上传并预检</button><button type="button" :disabled="!objects.some(v => v.editable)" @click="template"><Download :size="14" />下载当前页空白模板</button></div>
    </fieldset>
    <label v-if="tasks.length" class="task-selector"><span>已保存任务（最近30个，可重新打开）</span><select :value="selectedId" :disabled="busy" @change="run(() => open($event.target.value))"><option value="" disabled>选择任务</option><option v-for="item in tasks" :key="item.job_id" :value="item.job_id">{{ item.task_type === 'ROLLBACK' ? '整文件回滚' : item.object_kind === 'MODEL_OBJECT' ? '3D模型导入' : '静态导入' }} · {{ statuses[item.status] }} · {{ item.file_name }} · {{ item.scope_id }} · {{ item.job_id }}</option></select></label>
    <div v-if="job" class="job-detail">
      <div class="job-heading"><strong>{{ rolling ? '整文件回滚 · ' : '' }}{{ statuses[job.status] || job.status }}</strong><code>{{ job.job_id }}</code><button :disabled="busy" type="button" @click="run(() => open(job.job_id, false))">刷新进度</button><button :disabled="busy" type="button" @click="download"><Download :size="14" />下载逐行报告</button></div>
      <p>文件：{{ job.file_name }} · {{ job.object_kind === 'MODEL_OBJECT' ? '3D模型来源' : '静态数据集' }}：{{ job.scope_id }}</p>
      <p v-if="!rolling" class="hint">本任务默认模式：{{ operationLabels[job.default_operation] }} · 覆盖非空值：{{ job.allow_overwrite === 't' ? '上传时已明确授权' : '未授权' }}。任务参数以上传时的记录为准。</p>
      <p v-else class="warning">将原文件所有已成功对象恢复到各自操作前的完整属性快照，后来新增的字段可能删除、后来修改的其他字段也可能恢复。请核对整个文件的差异；未成功写入的原行不参与。</p>
      <button v-if="job.source_job_id" type="button" :disabled="busy" @click="run(() => open(job.source_job_id))">查看原文件任务</button>
      <button v-if="job.latestRollback" type="button" :disabled="busy" @click="run(() => open(job.latestRollback.job_id))">查看最近整文件回滚（{{ statuses[job.latestRollback.status] }}）</button>
      <div class="stats"><span>共 {{ job.counts.total || 0 }} 行</span><span>待预检 {{ job.counts.PENDING || 0 }}</span><span>可执行 {{ job.counts.READY || 0 }}</span><span>同步中 {{ Number(job.counts.DISPATCHING || 0) + Number(job.counts.QUEUED || 0) }}</span><span>无效 {{ job.counts.INVALID || 0 }}</span><span>跳过 {{ job.counts.SKIPPED || 0 }}</span><span>成功 {{ job.counts.SUCCEEDED || 0 }}</span><span>失败 {{ job.counts.FAILED || 0 }}</span></div>
      <p v-if="job.last_error" class="warning">{{ job.last_error }}</p>
      <p v-if="job.status === 'AWAITING_CONFIRMATION' && Number(job.counts.INVALID)" class="warning">存在无效行，禁止整文件提交。请下载报告、修正并重新上传，不能自动采用新版本覆盖。</p>
      <p v-if="job.status === 'AWAITING_CONFIRMATION' && !Number(job.counts.READY) && !Number(job.counts.INVALID)" class="warning">没有有效变化，无需执行；可以取消此任务。空单元格或已存在的非空值可能已被跳过。</p>
      <div v-if="canConfirm" class="confirm"><p>{{ rolling ? '一次确认恢复整个文件，后台完成安全调度，无需逐批操作。若确认后再次发生并发修改，会明确报告冲突，不强制覆盖。' : '确认后新增、修改、删除均会执行；仅跳过无变化行。整个文件不是一个数据库事务。' }}</p><label><span>输入“{{ confirmWord }}”确认</span><input v-model="confirmation" :placeholder="confirmWord" /></label><button type="button" :disabled="busy || confirmation !== confirmWord" @click="action('confirm')">{{ rolling ? '确认一键回滚整个文件' : '确认执行有效行' }}</button></div>
      <div v-if="canRollback" class="file-rollback"><h4>整个文件一键回滚</h4><p>统一汇总恢复差异并一次确认，无需为每个批次分别操作。恢复会保留原文件与回滚记录。</p><label><span>整文件回滚原因</span><input v-model="rollbackReason" maxlength="500" placeholder="例如：撤销本次文件的全部属性变更" /></label><button type="button" :disabled="busy || !rollbackReason.trim()" @click="rollbackFile">一键回滚整个文件（先预览）</button></div>
      <div class="actions"><button v-if="job.status === 'RUNNING'" :disabled="busy" type="button" @click="action('pause')"><Pause :size="14" />暂停后续分片</button><button v-if="job.status === 'PAUSED'" :disabled="busy" type="button" @click="action('resume')"><Play :size="14" />继续执行</button><button v-if="['VALIDATING','AWAITING_CONFIRMATION'].includes(job.status)" :disabled="busy" type="button" @click="action('cancel')">取消未执行任务</button></div>
      <div class="table-scroll"><table><thead><tr><th>CSV记录 / 对象</th><th>操作 / 状态</th><th>差异预览</th><th>说明 / 审计记录</th></tr></thead><tbody><tr v-for="row in rows" :key="row.record_number"><td>{{ row.record_number }}<code>{{ row.external_key }}</code><code>{{ row.object_uid || '无效编号' }}</code></td><td>{{ row.operation === 'rollback' ? '整文件回滚' : operationLabels[row.operation] || row.operation }}<br />{{ rowLabels[row.status] }}</td><td><details v-if="row.diff"><summary>查看当前值→目标值</summary><p>目标中不再出现的键将被删除。</p><pre>{{ json(row.diff) }}</pre></details></td><td>{{ row.error || '—' }}<code v-if="row.batch_id">审计：{{ row.batch_id }}</code></td></tr><tr v-if="!rows.length"><td colspan="4">暂无已解析记录</td></tr></tbody></table></div>
      <div class="actions"><button type="button" :disabled="busy || stack.length < 2" @click="page(-1)">上一页</button><span>第 {{ stack.length }} 页</span><button type="button" :disabled="busy || !hasMore" @click="page(1)">下一页</button></div>
    </div>
  </section>
</template>

<style scoped>
.bulk-card { margin-top: 18px; padding: 20px; border: 1px solid #dce6ed; border-radius: 12px; background: #fff; color: #243b53; font-size: 13px; min-width: 0; }
.bulk-card * { box-sizing: border-box; }
header, .job-heading, .actions, .stats { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
header { justify-content: space-between; margin-bottom: 16px; }
h4 { display: flex; gap: 8px; align-items: center; margin: 0; font-size: 16px; } p { line-height: 1.65; }
header p, .hint { color: #728698; font-size: 12px; }
fieldset { border: 0; padding: 0; min-width: 0; margin: 0; }
.upload-form { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
label { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
input, select { width: 100%; min-width: 0; padding: 10px; border: 1px solid #cedde8; border-radius: 6px; color: #243b53; background: #fff; font: inherit; }
button { display: inline-flex; gap: 6px; align-items: center; padding: 9px 12px; border: 1px solid #c9dbe7; border-radius: 6px; background: #edf7fc; color: #087ea8; cursor: pointer; font: inherit; }
button:disabled, fieldset:disabled button { cursor: not-allowed; background: #f1f4f7; color: #8695a4; }
.inline { flex-direction: row; align-items: center; margin-top: 12px; } .inline input { width: auto; }
.feedback, .warning { padding: 10px 12px; border-radius: 6px; background: #fff6e7; color: #94611f; }
.error { background: #fff0ec; color: #a8463a; } .success { background: #edf8f1; color: #277955; }
.actions, .task-selector { margin-top: 14px; } .job-detail { margin-top: 18px; padding-top: 16px; border-top: 1px solid #dce6ed; }
code { display: block; font-size: 11px; white-space: normal; overflow-wrap: anywhere; }
.stats span { padding: 6px 10px; background: #f1f6fa; border-radius: 5px; }
.confirm { margin-top: 12px; padding: 12px; border: 1px solid #e6d1ad; background: #fffbf4; border-radius: 7px; }
.confirm input { max-width: 250px; } .confirm button { margin-top: 10px; }
.file-rollback { margin-top: 16px; padding: 14px; border: 1px solid #e5c9a8; background: #fffbf5; border-radius: 8px; }
.file-rollback button { margin-top: 10px; color: #995e22; background: #fff3df; }
.table-scroll { overflow: auto; margin-top: 15px; max-height: 430px; }
table { border-collapse: collapse; width: 100%; min-width: 650px; } th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e4ebf1; vertical-align: top; }
th { background: #f4f8fb; } pre { white-space: pre-wrap; overflow-wrap: anywhere; max-width: 400px; max-height: 200px; overflow: auto; }
.batch-link { display: block; margin-top: 5px; font-size: 11px; padding: 4px 6px; }
@media(max-width:650px) { .upload-form { grid-template-columns: minmax(0,1fr); } .bulk-card { padding: 14px; } }
</style>
