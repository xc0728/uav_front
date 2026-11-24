<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { loadActiveAttributeDatasets, loadGridAttributeCatalog } from '../../../utils/gridAttributeCatalog.js'
import { loadConeTemplates, queryConeRegions, loadConeCells } from '../../../utils/coneRegionQuery.js'

import { DEFAULT_CONE_TOPIC, availableConeTopics, coneTopicEntry, coneTopicBin, coneBinRange, coneTopicSummary } from '../../../utils/coneRegionTopics.js'

const props = defineProps({ theme: { type: String, default: 'white' }, loadBuildingModel: { type: Function, default: null } })
const inputMode = ref('map'), absoluteHeight = ref(''), buildings = ref([]), buildingId = ref(''), loadedBuildingId = ref(''), buildingLoading = ref(false), buildingMessage = ref('')
let disposed = false
async function loadBuildings() {
  if (!buildingId.value || buildingLoading.value) return
  buildingLoading.value = true; buildingMessage.value = ''
  try {
    if (!props.loadBuildingModel) throw new Error('地图尚未就绪')
    const id = buildingId.value
    if (!await props.loadBuildingModel(id)) throw new Error('模型未加载，请稍后重试')
    if (!disposed) { loadedBuildingId.value = id; buildingMessage.value = '已加载，可点击模型顶部；请确认拾取高程。' }
  } catch (e) { if (!disposed) buildingMessage.value = e.message }
  finally { if (!disposed) buildingLoading.value = false }
}
function startPicking() {
  picking.value = !picking.value
  if (picking.value) points.value.forEach(p => clearMap(p.id))
  else points.value.forEach(p => p.result ? showRegion(p) : showPoint(p))
}
function showPoint(p) {
  emit('showGrid', { coneRegion: { operation: 'point', id: p.id, longitude: p.longitude, latitude: p.latitude,
    height: p.heightAbsolute, labelText: `${p.id} · ${p.heightAbsolute == null ? '地面' : p.heightAbsolute.toFixed(2) + ' m'}` } })
}
function editHeight(p) {
  invalidate(p)
  p.source = 'manual'
  if (p.heightAbsolute === '' || p.heightAbsolute == null) p.heightAbsolute = null
  if (p.heightAbsolute != null && (!Number.isFinite(p.heightAbsolute) || p.heightAbsolute < 0)) { error.value = '底部高程必须为非负有限数值'; clearMap(p.id); return }
  showPoint(p)
}
const emit = defineEmits(['close', 'showGrid'])
const templates = ref([]), templateVersion = ref(1), datasets = ref([]), datasetId = ref('')
const points = ref([]), selectedId = ref(''), defaultTemplate = ref('delivery_120'), picking = ref(false)
const longitude = ref(''), latitude = ref(''), loading = ref(false), error = ref(''), notice = ref('')
const displayMode = ref('surface'), selectedCell = ref(null)
const topics = ref([]), catalog = ref([]), topicCode = ref(DEFAULT_CONE_TOPIC)
let displayedTopic = DEFAULT_CONE_TOPIC
const topicOptions = computed(() => availableConeTopics(topics.value, catalog.value, dataset.value))
const currentTopic = computed(() => selected.value?.result?.topic || topics.value.find(t => t.code === topicCode.value))
const topicAvailable = computed(() => topicOptions.value.some(t => t.code === topicCode.value && t.available))
const selectedEntry = computed(() => coneTopicEntry(selectedCell.value, topicCode.value))
const selectedBin = computed(() => coneTopicBin(selectedEntry.value, currentTopic.value))
let controller = null, sequence = 0, maxRegions = 12
const selected = computed(() => points.value.find(p => p.id === selectedId.value))
const dataset = computed(() => datasets.value.find(d => d.datasetId === datasetId.value))
const selectedTemplate = computed(() => templates.value.find(t => t.id === selected.value?.templateId))
const grades = computed(() => selected.value?.result?.statistics?.bins || [])
const legend = computed(() => currentTopic.value?.bins || [])
const numericText = value => value == null ? '—' : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 6 })
const percent = value => value == null ? '—' : `${(value * 100).toFixed(1)}%`
const snapshotPoint = p => ({ id: p.id, point: { longitude: p.longitude, latitude: p.latitude, ...(p.heightAbsolute == null ? { heightAgl: 0 } : { heightAbsolute: Number(p.heightAbsolute) }) },
  templateId: p.templateId, templateVersion: templateVersion.value })
function showRegion(p) {
  if (!p.result) return
  emit('showGrid', { coneRegion: { operation: 'region', id: p.id, region: p.result.region,
    cells: p.cells, mode: displayMode.value, selected: p.id === selectedId.value, attributeCode: topicCode.value, topic: p.result.topic } })
}
function focus(p) { selectedId.value = p.id; selectedCell.value = null; showRegion(p) }
function cancel() {
  controller?.abort(); controller = null; loading.value = false
  points.value.forEach(p => { if (['统计中', '加载网格', '统计完成，加载网格'].includes(p.status)) p.status = '未完成，可重试' })
}
function clearMap(id) {
  if (!id) { points.value.forEach(p => clearMap(p.id)); return }
  emit('showGrid', { coneRegion: { operation: 'remove', id } })
}
function invalidate(p) { cancel(); p.topicCache = {}; p.result = null; p.cells = []; p.message = ''; p.status = '待查询'; clearMap(p.id); selectedCell.value = null }
function changeDataset() {
  cancel(); clearMap(); selectedCell.value = null
  points.value.forEach(p => { p.topicCache = {}; p.result = null; p.cells = []; p.status = '待查询'; p.message = '' })
  if (!topicAvailable.value) topicCode.value = topicOptions.value.find(t => t.available)?.code || DEFAULT_CONE_TOPIC
  displayedTopic = topicCode.value; error.value = ''
}
function changeTopic() {
  cancel(); picking.value = false; clearMap(); selectedCell.value = null; error.value = ''
  for (const p of points.value) {
    p.topicCache[displayedTopic] = { result: p.result, cells: p.cells, status: p.status, message: p.message }
    const cached = p.topicCache[topicCode.value]
    p.result = cached?.result || null; p.cells = cached?.cells || []; p.status = cached?.status || '待查询'; p.message = cached?.message || ''
    if (p.status === '完成') showRegion(p)
    else showPoint(p)
  }
  displayedTopic = topicCode.value
  if (topicAvailable.value && points.value.length) return runQuery()
}
function addPoint(lon, lat, height = null, source = 'ground') {
  if (loading.value) return
  if (points.value.length >= maxRegions) { error.value = `一次最多 ${maxRegions} 个点`; return }
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -85 || lat > 85) {
    error.value = '请输入有效经纬度'; return
  }
  if (height != null && (!Number.isFinite(height) || height < 0)) { error.value = '底部绝对高程必须是非负有限数值'; return }
  const p = { heightAbsolute: height, source, id: `cone-${++sequence}`, longitude: lon, latitude: lat, templateId: defaultTemplate.value,
    status: '待查询', cells: [], result: null, topicCache: {} }
  points.value.push(p); selectedId.value = p.id; error.value = ''
  selectedCell.value = null
  showPoint(p)
}
function addInput() {
  if (longitude.value === '' || latitude.value === '' || absoluteHeight.value === '') { error.value = '经纬度及底部绝对高程不能为空'; return }
  addPoint(Number(longitude.value), Number(latitude.value), Number(absoluteHeight.value), 'manual')
}
function remove(p) { cancel(); clearMap(p.id); points.value = points.value.filter(x => x.id !== p.id); selectedId.value = points.value[0]?.id || ''; selectedCell.value = null }
function setPointFromMap(lon, lat, height, detail) {
  if (!picking.value) return
  if (detail?.source === 'building_surface') addPoint(lon, lat, height, 'building_surface')
  else if (detail?.source === 'ground') addPoint(lon, lat)
}
function selectConeCell(detail) {
  const p = points.value.find(p => p.id === detail.regionId)
  if (p) { focus(p); selectedCell.value = detail.cell || null }
}
async function initialize() {
  changeDataset(); error.value = ''; notice.value = ''
  controller = new AbortController(); const active = controller
  try {
    const [config, available, attributes] = await Promise.all([
      loadConeTemplates(active.signal), loadActiveAttributeDatasets({ signal: active.signal }), loadGridAttributeCatalog({ signal: active.signal }),
    ])
    if (active.signal.aborted || controller !== active) return
    templates.value = config.templates; templateVersion.value = config.version; maxRegions = config.maxRegions
    if (!Array.isArray(config.attributeTopics) || !config.attributeTopics.length
      || !config.attributeTopics.some(t => t.code === DEFAULT_CONE_TOPIC)
      || config.attributeTopics.some(t => !t.code || !Array.isArray(t.bins) || !t.bins.length)
      || new Set(config.attributeTopics.map(t => t.code)).size !== config.attributeTopics.length) throw new Error('后端尚未提供专题配置，请部署新版后端后刷新')
    topics.value = config.attributeTopics; catalog.value = attributes
    datasets.value = available.filter(d => availableConeTopics(topics.value, attributes, d).some(t => t.available))
    datasetId.value = datasets.value.some(d => d.datasetId === datasetId.value) ? datasetId.value : datasets.value[0]?.datasetId || ''
    changeDataset()
    if (!datasetId.value) notice.value = '当前没有绑定可用专题的活动 L17 数据集。请先发布真实规划数据。'
  } catch (e) { if (controller === active && e.name !== 'AbortError') error.value = e.message }
  finally { if (controller === active) controller = null }
}
async function runQuery() {
  if (!dataset.value || !topicAvailable.value || !points.value.length || loading.value) return
  if (points.value.some(p => p.heightAbsolute != null && (!Number.isFinite(p.heightAbsolute) || p.heightAbsolute < 0))) { error.value = '请先修正无效的底部高程'; return }
  cancel(); picking.value = false; points.value.forEach(p => p.result ? showRegion(p) : showPoint(p)); error.value = ''; selectedCell.value = null
  const active = new AbortController(); controller = active; loading.value = true
  const code = topicCode.value
  const payload = { datasetId: dataset.value.datasetId, datasetVersion: dataset.value.activeVersion, attributeCodes: [code] }
  const pending = points.value.filter(p => !p.result)
  try {
    if (pending.length) {
      pending.forEach(p => { p.status = '统计中'; p.message = '' })
      const data = await queryConeRegions({ ...payload, resultMode: 'summary', regions: pending.map(snapshotPoint) }, active.signal)
      if (active.signal.aborted || controller !== active) return
      for (const result of data.regions) {
        const p = points.value.find(p => p.id === result.id)
        if (!p) continue
        if (result.status !== 'success') { p.status = '查询失败'; p.message = result.message; continue }
        p.result = coneTopicSummary(data, result, code); p.cells = []; p.status = '统计完成，加载网格'
      }
    }
    for (const p of points.value) {
      if (!p.result || p.status === '完成') continue
      // 失败或中断后的重试从首游标重读，不重复累加旧明细。
      p.cells = []; p.status = '加载网格'
      await loadConeCells(payload, snapshotPoint(p), p.result, active.signal, async cells => {
        if (active.signal.aborted || controller !== active) throw new DOMException('查询已取消', 'AbortError')
        if (p.cells.length + cells.length > 100000) throw new Error('区域明细超过前端 100000 格元绘制预算，完整统计仍保留')
        p.cells.push(...cells)
      })
      if (active.signal.aborted || controller !== active) return
      if (p.cells.length !== p.result.statistics.totalGridCount) throw new Error('统计与明细数量不一致，请重新查询')
      p.status = '完成'; showRegion(p)
    }
  } catch (e) {
    if (controller !== active) return
    if (e.name !== 'AbortError') {
      error.value = e.message
      points.value.filter(p => p.status !== '完成').forEach(p => { p.result = null; p.cells = [] })
    }
    points.value.forEach(p => { if (['统计中', '加载网格', '统计完成，加载网格'].includes(p.status)) p.status = '未完成，可重试' })
  } finally { if (controller === active) { controller = null; loading.value = false } }
}
function resetForm() { cancel(); picking.value = false; clearMap(); points.value = []; selectedId.value = ''; error.value = '' }
function changeDisplay() { points.value.filter(p => p.status === '完成').forEach(showRegion) }
defineExpose({ resetForm, setPointFromMap, selectConeCell, picking, loadedBuildingId })
onMounted(initialize)
onBeforeUnmount(() => { disposed = true; resetForm() })
onMounted(async () => {
  try { const response = await fetch('/lod13-datasets.json'); if (!response.ok) throw new Error('建筑模型目录读取失败'); const list = await response.json(); if (!Array.isArray(list)) throw new Error('建筑目录格式错误'); if (disposed) return; buildings.value = list.filter(d => typeof d.id === 'string' && d.url?.startsWith('/models/buildings/')); buildingId.value = buildings.value[0]?.id || '' }
  catch (e) { if (!disposed) buildingMessage.value = e.message }
})
</script>

<template>
  <section class="cone-panel" :class="{ 'tech-blue': props.theme === 'techBlue' }">
    <details open class="group"><summary>数据来源</summary>
      <label>空域数据集<select v-model="datasetId" :disabled="loading" @change="changeDataset"><option value="" disabled>请选择数据集</option><option v-for="d in datasets" :key="d.datasetId" :value="d.datasetId">{{ d.datasetId }} · V{{ d.activeVersion }}</option></select></label>
      <p v-if="notice" class="notice">{{ notice }}</p>
      <button type="button" :disabled="loading" @click="initialize">刷新目录与模板</button>
      <label>建筑模型<select v-model="buildingId" :disabled="buildingLoading || picking" @change="buildingMessage = ''"><option value="">请选择建筑模型</option><option v-for="b in buildings" :key="b.id" :value="b.id">{{ b.label }}</option></select></label>
      <button type="button" :disabled="!buildingId || buildingLoading || picking" @click="loadBuildings">{{ buildingLoading ? '加载中…' : '加载并显示建筑' }}</button>
      <p class="hint" role="status">{{ buildingMessage || (loadedBuildingId ? '已有建筑模型可供选点' : '可选加载；未加载时支持地面选点或输入经纬高。') }}</p>
    </details>
    <div class="group"><h3>添加点位</h3>
      <div class="tabs"><button type="button" :class="{ active: inputMode === 'map' }" :disabled="loading" @click="inputMode = 'map'">地图选点</button><button type="button" :class="{ active: inputMode === 'manual' }" :disabled="loading" @click="inputMode = 'manual'; picking && startPicking()">输入经纬高</button></div>
      <label>新增点默认尺寸<select v-model="defaultTemplate" :disabled="loading"><option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }} · {{ t.height }} m</option></select></label>
      <template v-if="inputMode === 'map'"><button type="button" :disabled="loading || buildingLoading" :class="{ active: picking }" @click="startPicking">{{ picking ? '结束地图选点' : '开始地图选点' }}</button><p class="hint">点击模型顶部取得表面高程；点击地面沿用地面起点。请避开建筑立面。</p></template>
      <template v-else><label>经度<input v-model="longitude" type="number" step="0.000001" :disabled="loading"></label><label>纬度<input v-model="latitude" type="number" step="0.000001" :disabled="loading"></label><label>底部绝对高程（m）<input v-model="absoluteHeight" type="number" min="0" step="0.1" :disabled="loading"></label><p class="hint">填写项目基准下的绝对高程；不是建筑高度或离地高度。</p><button type="button" :disabled="loading" @click="addInput">添加经纬高点</button></template>
    </div>
    <div class="group"><h3>已选点位 <small>{{ points.length }}/{{ maxRegions }}</small></h3>
      <div class="points"><div v-for="(p, index) in points" :key="p.id" class="point" :class="{ selected: selectedId === p.id }"><button type="button" class="point-name" @click="focus(p)">点位 {{ index + 1 }} · {{ p.source === 'building_surface' ? '模型表面' : p.source === 'manual' ? '手动输入' : '地面' }}<small>{{ p.heightAbsolute == null ? '离地高度 0 m' : '底部高程 ' + Number(p.heightAbsolute).toFixed(2) + ' m' }}</small></button><span>{{ p.status }}</span><button type="button" :disabled="loading" @click="remove(p)" :aria-label="`删除点位 ${index+1}`">×</button><p v-if="p.message" class="error">{{ p.message }}</p></div></div>
      <details v-if="selected"><summary>当前点位详情</summary><p class="hint">{{ selected.longitude.toFixed(7) }}, {{ selected.latitude.toFixed(7) }}</p><label>底部绝对高程（m）<input v-model.number="selected.heightAbsolute" type="number" min="0" step="0.1" placeholder="留空沿用地面起点" :disabled="loading" @change="editHeight(selected)"></label><label>当前点位尺寸<select v-model="selected.templateId" :disabled="loading" @change="invalidate(selected)"><option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }} · {{ t.height }} m</option></select></label><p v-if="selectedTemplate" class="hint">底半径 {{ selectedTemplate.bottomRadius }} m / 顶半径 {{ selectedTemplate.topRadius }} m / 高 {{ selectedTemplate.height }} m</p></details>
    </div>
    <div class="actions query-actions"><button class="primary" type="button" :disabled="loading || !datasetId || !topicAvailable || !points.length" @click="runQuery">批量查询 / 重试</button><button v-if="loading" type="button" @click="cancel">取消</button><button type="button" :disabled="loading" @click="resetForm">清除</button></div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <label>展示专题<select v-model="topicCode" :disabled="!topics.length" @change="changeTopic"><option v-for="t in topicOptions" :key="t.code" :value="t.code" :disabled="!t.available">{{ t.name }}{{ t.available ? '' : '（当前数据集未绑定）' }}</option></select></label>
    <p v-if="currentTopic" class="hint">指标：{{ currentTopic.indicatorName }}<br>{{ currentTopic.description }}</p>
    <label>显示方式<select v-model="displayMode" @change="changeDisplay"><option value="surface">圆锥台表面映射</option><option value="cells">真实盒状格元</option></select></label>
    <div class="legend"><span v-for="g in legend" :key="g.id"><i :style="{ background: g.color }"></i>{{ g.label }} {{ coneBinRange(g, currentTopic) }}</span><span><i :style="{ background: currentTopic?.unknownColor || '#9AA5B3' }"></i>未知</span></div>
    <div v-if="selected?.result" class="statistics" aria-live="polite"><h4>当前区域 · {{ currentTopic?.name }} · 完整统计</h4><p>相交基础格元 {{ selected.result.statistics.totalGridCount }} 个</p><table><thead><tr><th>档位</th><th>数量</th><th>占比</th></tr></thead><tbody><tr v-for="g in grades" :key="g.id"><td><i class="swatch" :style="{ background: g.color }"></i>{{ g.label }}</td><td>{{ g.count }}</td><td>{{ percent(g.ratio) }}</td></tr><tr><td>未知</td><td>{{ selected.result.statistics.unknownCount }}</td><td>{{ percent(selected.result.statistics.unknownRatio) }}</td></tr></tbody></table><p v-if="currentTopic?.kind === 'numeric'" class="hint">最小值 {{ numericText(selected.result.statistics.min) }} / 最大值 {{ numericText(selected.result.statistics.max) }} / 均值 {{ numericText(selected.result.statistics.mean) }}</p><p class="hint">有效值覆盖率 {{ percent(selected.result.statistics.attributeCoverageRatio) }}<br>缺失 {{ selected.result.statistics.missingValueCount }} / 空值 {{ selected.result.statistics.nullValueCount }} / 无效 {{ selected.result.statistics.invalidValueCount }}<br>缺少基础格元 {{ selected.result.coverage.missingBaseGridCount }} 个<br>底部绝对高程 {{ selected.result.region.bottomElevation.toFixed(2) }} m<br>占比按相交格元数量计算；明细状态：{{ selected.status }}</p></div>
    <div v-if="selectedCell" class="statistics"><h4>选中格元 · {{ currentTopic?.name }}</h4><p class="code">{{ selectedCell.code }}</p><p>原始值：{{ numericText(selectedEntry.value) }} · {{ selectedBin?.label || '未知' }}</p><p v-if="selectedEntry.rawValue != null" class="hint">无效原值：{{ selectedEntry.rawValue }}</p><p class="hint">高度 {{ selectedCell.bottom }}—{{ selectedCell.top }} m · {{ selectedEntry.valueStatus }}</p></div>
    <p class="hint">占比按相交格元数量计算，包含未知；各区域独立统计。表面颜色按展示块位置采样，仅用于概览，点击可追溯源格元；真实格元模式保留完整边界。模板仅定义查询范围，不代表飞行许可或净空标准。</p>
  </section>
</template>

<style scoped>
.cone-panel{padding:0;color:#334155;font-size:13px}.heading,.actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.heading{justify-content:space-between}.heading h3{font-size:15px;margin:0}label{display:block;margin:12px 0 5px}select,input{display:block;box-sizing:border-box;width:100%;padding:8px;margin-top:5px;border:1px solid #cbd5e1;border-radius:6px;background:white;color:#334155;font:inherit}button{padding:7px 10px;border:1px solid #cbd5e1;border-radius:6px;background:white;color:#334155;font:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:default}.primary,.active{background:linear-gradient(135deg,#7db8e0,#5b9fd4);color:white;border-color:#7db8e0}.hint{font-size:12px;color:#64748b;line-height:1.7}.notice{padding:9px;background:#eff6ff;color:#1d4ed8;line-height:1.7}.coordinates{display:grid;grid-template-columns:1fr 1fr;gap:8px}.points{margin:14px 0}.point{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid #e2e8f0}.point.selected{border-bottom-color:#2563eb}.point-name{flex:1;text-align:left;border:0;padding:2px;background:transparent}small{display:block;color:#64748b;font-size:11px}.point>span{font-size:11px}.error{color:#b91c1c;line-height:1.6}.legend{display:flex;gap:9px;flex-wrap:wrap;font-size:11px;margin:14px 0}.swatch{display:inline-block;width:8px;height:8px;margin-right:4px}.legend i{display:inline-block;width:8px;height:8px;margin-right:3px}.statistics{padding-top:10px;border-top:1px solid #cbd5e1;margin-top:12px}h4{margin:0 0 8px}table{width:100%;border-collapse:collapse}td,th{text-align:right;padding:7px 3px;border-bottom:1px solid #e2e8f0}td:first-child,th:first-child{text-align:left}.code{overflow-wrap:anywhere}
.group{border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:12px;background:rgba(255,255,255,.5)}summary,h3{font-size:14px;font-weight:600;margin:0;cursor:pointer}.tabs{display:flex;gap:8px;margin-top:12px}.tabs button{flex:1}.points{max-height:230px;overflow-y:auto;margin:8px 0}.query-actions{position:sticky;bottom:0;background:#f8fafc;padding:10px 0;z-index:2}.query-actions .primary{flex:1}.tech-blue{color:#d7f5ff}.tech-blue .group,.tech-blue .query-actions{background:#103254;border-color:#315979}.tech-blue input,.tech-blue select,.tech-blue button{background:#153d62;color:#ecfbff;border-color:#3e6382}.tech-blue .primary,.tech-blue .active{background:#357fa9}.tech-blue .hint,.tech-blue small{color:#aac9e0}
</style>
