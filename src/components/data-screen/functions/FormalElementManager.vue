<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { maintenanceRequest, uploadMaintenanceFile, managedCellFeature } from '../../../utils/elementMaintenance.js'

const props = defineProps({ initialCollectionId: { type: String, default: '' } })
const token = ref(''), enabled = ref(false), loaded = ref(false), collections = ref([]), collectionId = ref(props.initialCollectionId.startsWith('managed_') ? props.initialCollectionId : 'managed_buildings')
const collection = computed(() => collections.value.find(c => c.collectionId === collectionId.value))
const mode = ref('FILE'), tab = ref('add'), busy = ref(false), error = ref(''), message = ref(''), reason = ref('')
const file = ref(null), uploadId = ref(''), uploadProgress = ref(0), namespace = ref('formal-supplement')
const classification = ref(''), namePrefix = ref('建筑物'), idField = ref('OID'), nameField = ref('name'), classificationField = ref('class_code')
const identityMode = ref('BATCH'), confirmIdentity = ref(false), coverageMode = ref('SOLID'), confirmHeight = ref(false), heightOffset = ref(0)
const layer = ref(''), bottomField = ref('bottom'), topField = ref('top')
const west = ref(119.95), south = ref(30.55), east = ref(119.951), north = ref(30.551), bottom = ref(100), top = ref(125)
const shape = ref('RECTANGLE'), rings = ref(''), rangeName = ref('新增禁飞区'), sourceCrs = ref('EPSG:4490'), rangeKey = ref('')
const inspection = ref(null), validation = ref(null), activeJob = ref(null), pendingCommand = ref(null)
const objects = ref([]), objectState = ref('active'), selected = ref([]), objectAfter = ref(null), objectHasMore = ref(false)
const history = ref([]), historyBefore = ref(null), historyHasMore = ref(false), mutation = ref(null), mutationPreview = ref(null)
const editProperties = ref(''), previewCells = ref([]), gridCursor = ref(null), gridRevision = ref(null), gridValidation = ref(null), gridMore = ref(false), renderLevel = ref(17)
let pollTimer = null, pollGeneration = 0, uploadController = null
const scope = computed(() => ({ collectionId: collectionId.value, expectedRevision: collection.value?.revision || 0 }))
const inflight = computed(() => ['QUEUED','RUNNING'].includes(activeJob.value?.status))
const canChange = computed(() => enabled.value && !!token.value.trim() && !busy.value && !inflight.value)
const options = computed(() => ({ idField: idField.value, nameField: nameField.value, classificationField: classificationField.value,
  classificationCode: classification.value, namePrefix: namePrefix.value, identityMode: identityMode.value,
  confirmTilesetIsObject: confirmIdentity.value, coverageMode: coverageMode.value,
  confirmHeightReference: confirmHeight.value, heightOffsetMeters: Number(heightOffset.value),
  layer: layer.value, bottomField: bottomField.value, topField: topField.value, heightMode: 'ABSOLUTE' }))

async function run(work) {
  if (busy.value) return
  error.value = ''; message.value = ''; busy.value = true
  try { await work() } catch (e) { error.value = e.message || '操作失败' } finally { busy.value = false }
}
async function call(op, data) { return maintenanceRequest(op, data, token.value.trim()) }
async function loadCollections() {
  const data = await call('collections', {})
  collections.value = data.items || []
  renderLevel.value = Number(collection.value?.levels?.at(-1) || 17)
}
async function connect() { await loadCollections(); loaded.value = true; await loadObjects(); await loadHistory() }
function newFile(event) { file.value = event.target.files?.[0] || null; uploadId.value = ''; inspection.value = null; validation.value = null; uploadProgress.value = 0 }
function invalidate() { validation.value = null; mutation.value = null; mutationPreview.value = null; gridCursor.value = null }
watch([mode, namespace, options, west, south, east, north, bottom, top, rings, shape, rangeName, sourceCrs], invalidate, { deep: true })
watch([editProperties, selected], () => { mutation.value = null; mutationPreview.value = null }, { deep: true })
watch(collectionId, () => {
  invalidate(); inspection.value = null; objects.value = []; history.value = []; selected.value = []
  namePrefix.value = collectionId.value === 'managed_buildings' ? '建筑物' : '要素'
  renderLevel.value = Number(collection.value?.levels?.at(-1) || 17)
})
function rangeFeatures() {
  rangeKey.value ||= crypto.randomUUID()
  return [{ clientFeatureId: rangeKey.value, properties: { '名称': rangeName.value, '分类代码': classification.value },
    spatialInput: { shape: shape.value, sourceCrs: sourceCrs.value,
      ...(shape.value === 'RECTANGLE' ? { bbox: [Number(west.value), Number(south.value), Number(east.value), Number(north.value)] } : { rings: JSON.parse(rings.value) }) },
    ...(collection.value?.dimensionMode === '3D' ? { height: { mode: 'ABSOLUTE', unit: 'm', bottom: Number(bottom.value), top: Number(top.value) } } : {}) }]
}
async function submit(op, data) {
  if (pendingCommand.value) throw new Error('上一请求结果尚未确认，请先重试或刷新任务状态')
  const payload = { ...data, requestId: crypto.randomUUID() }
  pendingCommand.value = { op, payload }
  return retryPending()
}
async function retryPending() {
  const command = pendingCommand.value
  if (!command) throw new Error('没有待确认请求')
  let result
  try { result = await call(command.op, command.payload) } catch (e) { if (e.status) pendingCommand.value = null; throw e }
  pendingCommand.value = null
  if (result.jobId) { activeJob.value = result; startPolling(result.jobId, command.op) }
  return result
}
function startPolling(jobId, op) {
  clearTimeout(pollTimer); const generation = ++pollGeneration
  const poll = async () => {
    try {
      const result = await call('job', { jobId })
      if (generation !== pollGeneration) return
      activeJob.value = result
      if (['FAILED', 'CANCELLED'].includes(result.status)) { error.value = result.error || '任务已取消'; return }
      if (result.status === 'SUCCEEDED') { inspection.value = result.result; message.value = '文件分析完成，请确认字段映射后预检'; return }
      if (result.status === 'READY') { validation.value = result.result; gridValidation.value = result.result.validationId; message.value = '预检就绪，尚未正式发布'; return }
      if (result.status === 'PUBLISHED') {
        message.value = '正式发布成功，已更新有效对象及计算约束'; rangeKey.value = ''; validation.value = null; mutation.value = null; mutationPreview.value = null
        window.dispatchEvent(new CustomEvent('formal-elements-changed', { detail: { collectionId: collectionId.value } }))
        await loadCollections(); await loadObjects(); await loadHistory(); return
      }
      pollTimer = setTimeout(poll, 1500)
    } catch (e) { if (generation === pollGeneration) error.value = '自动查询已停止：' + e.message + '。可按任务ID继续查询。' }
  }
  poll()
}
async function analyze() {
  if (!file.value) throw new Error('请选择完整3D Tiles ZIP或矢量文件')
  uploadId.value ||= crypto.randomUUID()
  uploadController = new AbortController()
  await uploadMaintenanceFile(file.value, uploadId.value, token.value.trim(), (done, total) => { uploadProgress.value = Math.round(done / total * 100) }, uploadController.signal)
  await submit('inspect', { ...scope.value, inputMode: 'FILE', uploadId: uploadId.value, options: options.value })
}
async function validate() {
  if (!classification.value.trim() && mode.value === 'RANGE') throw new Error('请填写分类代码')
  await loadCollections()
  const data = { ...scope.value, inputMode: mode.value, sourceNamespace: namespace.value.trim(), options: options.value,
    ...(mode.value === 'FILE' ? { uploadId: uploadId.value } : { rangeFeatures: rangeFeatures() }) }
  if (mode.value === 'FILE' && !uploadId.value) throw new Error('请先上传文件并分析')
  await submit('validate', data)
}
async function publish() {
  if (!reason.value.trim()) throw new Error('请填写修改原因')
  await submit('commit', { collectionId: collectionId.value, expectedRevision: validation.value.expectedRevision,
    validationId: validation.value.validationId, reason: reason.value.trim() })
}
async function loadObjects(next = false) {
  const result = await call('objects', { collectionId: collectionId.value, state: objectState.value, limit: 30,
    ...(next && objectAfter.value ? { afterId: objectAfter.value } : {}) })
  objects.value = result.items; objectAfter.value = result.nextId; objectHasMore.value = result.hasMore; selected.value = []; mutation.value = null; mutationPreview.value = null
}
async function loadHistory(next = false) {
  const result = await call('history', { collectionId: collectionId.value,
    ...(next && historyBefore.value ? { beforeRevision: historyBefore.value } : {}) })
  history.value = result.items; historyHasMore.value = result.hasMore; historyBefore.value = result.items.at(-1)?.revision
}
async function previewMutation(operation, batchId = null) {
  if (!reason.value.trim()) throw new Error('请填写修改原因')
  await loadCollections()
  const targets = objects.value.filter(o => selected.value.includes(o.objectId)).map(o => ({ objectId: o.objectId, expectedVersion: o.objectVersion,
    ...(operation === 'PROPERTIES' ? { properties: JSON.parse(editProperties.value) } : {}) }))
  if (operation !== 'ROLLBACK' && !targets.length) throw new Error('请至少选择一个对象')
  if (operation === 'PROPERTIES' && targets.length !== 1) throw new Error('属性编辑每次请选择一个对象')
  const body = { ...scope.value, operation, reason: reason.value.trim(), ...(batchId ? { batchId } : { targets }) }
  mutationPreview.value = await call('preview-change', body); mutation.value = body
}
async function executeMutation() {
  if (!mutationPreview.value?.canApply) throw new Error('变更预览存在冲突')
  const op = { DELETE: 'delete', RESTORE: 'restore', ROLLBACK: 'rollback', PROPERTIES: 'properties' }[mutation.value.operation]
  await submit(op, mutation.value)
}
async function showGrids(preview = false, next = false) {
  const params = { collectionId: collectionId.value, level: Number(renderLevel.value), limit: 1000,
    ...(preview ? { validationId: validation.value?.validationId } : {}),
    ...(next && gridCursor.value ? { cursor: gridCursor.value, revision: gridRevision.value } : {}) }
  if (preview && !params.validationId) throw new Error('请先完成预检')
  const data = await call('grids', params)
  previewCells.value = data.cells; gridCursor.value = data.nextCursor; gridMore.value = data.hasMore; gridRevision.value = data.revision; gridValidation.value = preview ? params.validationId : null
  const cells = data.cells.map(cell => ({ ...cell, features: [managedCellFeature(cell, collectionId.value)] }))
  window.dispatchEvent(new CustomEvent('formal-element-grids', { detail: { ...data, cells, preview } }))
}
function editObject(o) { selected.value = [o.objectId]; editProperties.value = JSON.stringify(o.properties, null, 2); mutationPreview.value = null; mutation.value = null }
onMounted(async () => {
  try { const response = await fetch('/api/element-maintenance/status'); const body = await response.json(); enabled.value = body.data?.enabled === true } catch (e) { error.value = e.message }
})
onBeforeUnmount(() => { ++pollGeneration; clearTimeout(pollTimer); uploadController?.abort() })
</script>

<template>
  <section class="formal-manager">
    <h3>正式要素维护</h3>
    <p>建筑物占据网格、禁飞区及二维实体的新增、删除、属性维护和批次回滚。维护数据位于独立集合；原有大库对象需先完成身份建档，不在此直接擦除。</p>
    <p v-if="!enabled" class="notice">后端尚未启用此功能。请先执行独立迁移并配置维护开关。</p>
    <div class="form-row"><label>维护令牌<input v-model="token" type="password" autocomplete="off" placeholder="仅保存在当前组件内存" /></label><button :disabled="!canChange" @click="run(connect)">连接并读取集合</button></div>
    <template v-if="loaded">
      <div class="form-row"><label>目标集合<select v-model="collectionId" :disabled="busy || inflight"><option v-for="c in collections" :key="c.collectionId" :value="c.collectionId">{{ c.name }} · 修订 {{ c.revision }}</option></select></label><label>修改原因<input v-model="reason" :disabled="busy" placeholder="新增、删除、恢复或回滚的原因" /></label></div>
      <p>当前有效对象 {{ collection?.objectCount }} 个；网格贡献 {{ collection?.contributionCount }} 条（包含不同层级及重叠，不是去重格元数）；层级 {{ collection?.levels?.join(' / ') }}。</p>
      <nav><button @click="tab='add'">新增 / 预检</button><button @click="tab='objects';run(() => loadObjects())">对象维护</button><button @click="tab='history';run(() => loadHistory())">历史 / 回滚</button></nav>
      <fieldset v-if="tab==='add'" :disabled="busy || inflight">
        <div class="form-row"><label>输入方式<select v-model="mode" :disabled="busy"><option value="FILE">文件输入</option><option value="RANGE">空间范围＋高度</option></select></label><label>来源命名空间<input v-model="namespace" :disabled="busy" /></label><label>统一分类代码（仅补空）<input v-model="classification" :disabled="busy" /></label></div>
        <template v-if="mode==='FILE'">
          <label>文件<input type="file" accept=".zip,.gpkg,.geojson" :disabled="busy" @change="newFile" /></label>
          <p>建筑请上传完整3D Tiles ZIP。禁飞区支持面文件＋绝对底顶高；矢量支持GPKG、SHP ZIP。文件范围和定位由后端读取。</p>
          <div class="form-row"><label>编号字段<input v-model="idField" /></label><label>名称字段<input v-model="nameField" /></label><label>分类字段<input v-model="classificationField" /></label><label>缺失名称前缀<input v-model="namePrefix" /></label></div>
          <details><summary>3D Tiles解析参数</summary>
            <label>单栋身份<select v-model="identityMode"><option value="BATCH">batch元数据中的稳定编号</option><option value="TILESET">每个子tileset代表一个对象</option></select></label>
            <label v-if="identityMode==='TILESET'"><input v-model="confirmIdentity" type="checkbox" /> 我已核对每个子tileset是一个对象，不能把多个建筑合并为单栋</label>
            <label>覆盖方式<select v-model="coverageMode"><option value="SOLID">封闭实体占据（推荐）</option><option value="SURFACE">仅表面相交（不含内部体积）</option></select></label>
            <label>高度偏移（米）<input v-model.number="heightOffset" type="number" /></label>
            <label><input v-model="confirmHeight" type="checkbox" /> 已确认模型椭球高加上述偏移后与项目绝对高程一致</label>
            <p>暂不支持Draco、隐式瓦片、mesh特征扩展等未实现格式；预检会拒绝，不会用包围盒冒充建筑。</p>
          </details>
          <details v-if="collection?.kind!=='BUILDING'"><summary>矢量图层及高度字段</summary><label>图层（单图层可空）<input v-model="layer" /></label><label>底高字段<input v-model="bottomField" /></label><label>顶高字段<input v-model="topField" /></label></details>
          <button :disabled="!canChange || !file" @click="run(analyze)">上传并分析文件</button><span>上传 {{ uploadProgress }}%</span>
          <details v-if="inspection"><summary>文件字段与对象样例</summary><pre>{{ JSON.stringify(inspection, null, 2) }}</pre></details>
        </template>
        <template v-else>
          <div class="form-row"><label>对象名称<input v-model="rangeName" /></label><label>坐标系<input v-model="sourceCrs" /></label><label>水平形状<select v-model="shape"><option value="RECTANGLE">矩形</option><option value="POLYGON">多边形</option></select></label></div>
          <div v-if="shape==='RECTANGLE'" class="form-row"><label>最小经度<input v-model.number="west" type="number" step="any" /></label><label>最小纬度<input v-model.number="south" type="number" step="any" /></label><label>最大经度<input v-model.number="east" type="number" step="any" /></label><label>最大纬度<input v-model.number="north" type="number" step="any" /></label></div>
          <label v-else>闭合边界环JSON（外环在前，后续为洞）<textarea v-model="rings" rows="5" placeholder="[[[经度,纬度],...,[首点经度,首点纬度]]]" /></label>
          <div v-if="collection?.dimensionMode==='3D'" class="form-row"><label>绝对底高（米）<input v-model.number="bottom" type="number" /></label><label>绝对顶高（米）<input v-model.number="top" type="number" /></label></div>
          <p>本版只开放项目绝对高度；AGL不自动换算。按输入范围直接生成占据网格，不创建白模。</p>
        </template>
        <button :disabled="!canChange || !!pendingCommand" @click="run(validate)">生成候选网格并预检</button>
        <div v-if="validation" class="notice"><p>预检通过，尚未发布：{{ validation.objectCount }} 个对象，{{ validation.contributionCount }} 条网格贡献。</p><button :disabled="!canChange" @click="run(() => showGrids(true))">预览候选网格</button><button :disabled="!canChange || !reason.trim()" @click="run(publish)">确认新增并正式发布</button></div>
      </fieldset>
      <div v-if="tab==='objects'">
        <label>对象状态<select v-model="objectState" @change="run(() => loadObjects())"><option value="active">有效</option><option value="deleted">已删除</option><option value="all">全部</option></select></label>
        <button :disabled="!canChange" @click="run(() => loadObjects())">刷新首屏</button><button :disabled="!canChange || !objectHasMore" @click="run(() => loadObjects(true))">下一页</button>
        <div class="object-row" v-for="o in objects" :key="o.objectId"><input v-model="selected" type="checkbox" :value="o.objectId" /><div><strong>{{ o.properties?.['名称'] }}</strong><small>{{ o.sourceKey }} · 分类 {{ o.properties?.['分类代码'] }} · v{{ o.objectVersion }} · {{ o.deleted ? '已删除' : '有效' }} · {{ o.gridCount }}条贡献</small></div><button @click="editObject(o)">属性</button></div>
        <p>本页选中 {{ selected.length }} 个对象。</p><button :disabled="!canChange || !selected.length" @click="run(() => previewMutation('DELETE'))">预览删除</button><button :disabled="!canChange || !selected.length" @click="run(() => previewMutation('RESTORE'))">预览恢复</button>
        <details><summary>编辑选中单对象属性</summary><textarea v-model="editProperties" rows="6" /><button :disabled="!canChange" @click="run(() => previewMutation('PROPERTIES'))">预览属性变更</button></details>
      </div>
      <div v-if="tab==='history'">
        <button :disabled="!canChange" @click="run(() => loadHistory())">刷新历史</button><button :disabled="!canChange || !historyHasMore" @click="run(() => loadHistory(true))">更早记录</button>
        <div class="object-row" v-for="h in history" :key="h.id"><div><strong>修订 {{ h.revision }} · {{ h.operation }}</strong><small>{{ h.reason }} · {{ h.created_at }} · {{ h.id }}</small></div><button :disabled="!canChange" @click="run(() => previewMutation('ROLLBACK', h.id))">预览回滚</button></div>
      </div>
      <div v-if="mutationPreview" class="notice"><strong>变更预览：{{ mutation?.operation }}</strong><p>{{ mutationPreview.objectCount }}个对象、约{{ mutationPreview.contributionCount }}条关联受影响；共享格元其他对象保持有效。</p><pre v-if="!mutationPreview.canApply">{{ JSON.stringify(mutationPreview.conflicts,null,2) }}</pre><button :disabled="!canChange || !mutationPreview.canApply" @click="run(executeMutation)">确认执行此变更</button></div>
      <div class="form-row"><label>预览层级<select v-model.number="renderLevel"><option v-for="l in collection?.levels" :key="l" :value="l">{{ l }}</option></select></label><button :disabled="!canChange" @click="run(() => showGrids(false))">查看已发布网格</button><button :disabled="!canChange || !gridMore" @click="run(() => showGrids(!!gridValidation, true))">下一页网格</button></div>
      <p v-if="previewCells.length">当前仅显示本页 {{ previewCells.length }} 条贡献，{{ gridMore ? '还有后续页' : '已到最后一页' }}。同格多个对象会合并显示，不能把页数当作总量。</p>
    </template>
    <div v-if="activeJob" class="notice"><strong>{{ activeJob.status }} · {{ activeJob.stage }}</strong><p>任务ID {{ activeJob.jobId }}</p><p>{{ activeJob.processed || 0 }} / {{ activeJob.total || '总量待确定' }} 个对象</p><button :disabled="busy" @click="startPolling(activeJob.jobId)">继续查询</button><button :disabled="busy || !token.trim()" @click="run(async () => { await call('cancel',{jobId:activeJob.jobId}); ++pollGeneration; activeJob.status='CANCELLED' })">取消未发布任务</button><button v-if="activeJob.status==='FAILED'" :disabled="!canChange" @click="run(async () => { await call('retry',{jobId:activeJob.jobId}); startPolling(activeJob.jobId) })">重试失败任务</button></div>
    <p v-if="pendingCommand" class="notice">上一提交结果尚未确认。<button :disabled="busy" @click="run(retryPending)">使用同一请求ID重试</button></p>
    <p v-if="message" role="status" class="success">{{ message }}</p><p v-if="error" role="alert" class="error">{{ error }}</p>
  </section>
</template>
<style scoped>
fieldset{border:0;margin:0;padding:0;min-width:0}
.formal-manager{padding:16px;background:#fff;color:#334155;border:1px solid #dbe5ed;border-radius:10px}h3{margin:0 0 10px}p,small{font-size:12px;line-height:1.6}small{display:block;overflow-wrap:anywhere}label{display:block;font-size:12px;margin:8px 0}.form-row{display:flex;gap:12px;flex-wrap:wrap;align-items:end}.form-row label{flex:1;min-width:150px}input:not([type=checkbox]),select,textarea{box-sizing:border-box;width:100%;padding:8px;margin-top:4px;border:1px solid #cbd5e1;border-radius:5px}button{padding:8px 12px;margin:5px;border:1px solid #cbd5e1;border-radius:5px;background:#f8fafc;cursor:pointer}button:disabled{opacity:.5;cursor:default}nav{border-bottom:1px solid #dbe5ed;margin:12px 0}.notice{padding:10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;margin:10px 0}.object-row{display:flex;gap:10px;padding:10px;border-bottom:1px solid #e2e8f0;align-items:center}.object-row div{flex:1}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:280px;overflow:auto;font-size:12px}.error{color:#b91c1c}.success{color:#047857}details{margin:10px 0}summary{cursor:pointer;font-weight:600}
</style>
