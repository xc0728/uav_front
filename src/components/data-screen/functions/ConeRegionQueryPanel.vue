<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { loadActiveAttributeDatasets, loadGridAttributeCatalog } from '../../../utils/gridAttributeCatalog.js'
import { PLANNING_GRADES, loadConeTemplates, queryConeRegions, loadConeCells } from '../../../utils/coneRegionQuery.js'

const emit = defineEmits(['close', 'showGrid'])
const templates = ref([]), templateVersion = ref(1), datasets = ref([]), datasetId = ref('')
const points = ref([]), selectedId = ref(''), defaultTemplate = ref('delivery_120'), picking = ref(false)
const longitude = ref(''), latitude = ref(''), loading = ref(false), error = ref(''), notice = ref('')
const displayMode = ref('surface'), selectedCell = ref(null)
let controller = null, sequence = 0, maxRegions = 12
const selected = computed(() => points.value.find(p => p.id === selectedId.value))
const dataset = computed(() => datasets.value.find(d => d.datasetId === datasetId.value))
const selectedTemplate = computed(() => templates.value.find(t => t.id === selected.value?.templateId))
const grades = computed(() => selected.value?.result?.statistics?.grades || [])
const percent = value => value == null ? '—' : `${(value * 100).toFixed(1)}%`
const snapshotPoint = p => ({ id: p.id, point: { longitude: p.longitude, latitude: p.latitude, heightAgl: 0 },
  templateId: p.templateId, templateVersion: templateVersion.value })
function showRegion(p) {
  if (!p.result) return
  emit('showGrid', { coneRegion: { operation: 'region', id: p.id, region: p.result.region,
    cells: p.cells, mode: displayMode.value, selected: p.id === selectedId.value } })
}
function focus(p) { selectedId.value = p.id; selectedCell.value = null; showRegion(p) }
function cancel() {
  controller?.abort(); controller = null; loading.value = false
  points.value.forEach(p => { if (['统计中', '加载网格', '统计完成，加载网格'].includes(p.status)) p.status = '未完成，可重试' })
}
function clearMap(id) { emit('showGrid', { coneRegion: { operation: id ? 'remove' : 'clear', id } }) }
function invalidate(p) { cancel(); p.result = null; p.cells = []; p.message = ''; p.status = '待查询'; clearMap(p.id); selectedCell.value = null }
function changeDataset() { cancel(); clearMap(); points.value.forEach(p => { p.result = null; p.cells = []; p.status = '待查询' }); error.value = '' }
function addPoint(lon, lat) {
  if (loading.value) return
  if (points.value.length >= maxRegions) { error.value = `一次最多 ${maxRegions} 个点`; return }
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -85 || lat > 85) {
    error.value = '请输入有效经纬度'; return
  }
  const p = { id: `cone-${++sequence}`, longitude: lon, latitude: lat, templateId: defaultTemplate.value,
    status: '待查询', cells: [], result: null }
  points.value.push(p); selectedId.value = p.id; error.value = ''
  selectedCell.value = null
  emit('showGrid', { coneRegion: { operation: 'point', id: p.id, longitude: lon, latitude: lat } })
}
function addInput() {
  if (longitude.value === '' || latitude.value === '') { error.value = '经纬度不能为空'; return }
  addPoint(Number(longitude.value), Number(latitude.value))
}
function remove(p) { cancel(); clearMap(p.id); points.value = points.value.filter(x => x.id !== p.id); selectedId.value = points.value[0]?.id || ''; selectedCell.value = null }
function setPointFromMap(lon, lat) { if (picking.value) addPoint(lon, lat) }
function selectConeCell(detail) {
  const p = points.value.find(p => p.id === detail.regionId)
  if (p) { focus(p); selectedCell.value = detail.cell || null }
}
async function initialize() {
  cancel(); error.value = ''; notice.value = ''
  controller = new AbortController(); const active = controller
  try {
    const [config, available, attributes] = await Promise.all([
      loadConeTemplates(active.signal), loadActiveAttributeDatasets({ signal: active.signal }), loadGridAttributeCatalog({ signal: active.signal }),
    ])
    if (active.signal.aborted || controller !== active) return
    templates.value = config.templates; templateVersion.value = config.version; maxRegions = config.maxRegions
    datasets.value = available.filter(d => Number(d.activeLevel) === 17 && attributes.some(a => a.code === 'planning_suitability_level'
      && a.state === 'active' && a.valueType === 'int' && a.temporalMode === 'static'
      && a.bindings?.some(b => b.datasetId === d.datasetId && String(b.datasetVersion) === String(d.activeVersion) && Number(b.level) === 17)))
    datasetId.value = datasets.value[0]?.datasetId || ''
    changeDataset()
    if (!datasetId.value) notice.value = '当前没有绑定整体规划适宜性等级的活动 L17 数据集。请先发布真实规划数据。'
  } catch (e) { if (e.name !== 'AbortError') error.value = e.message }
  finally { if (controller === active) controller = null }
}
async function runQuery() {
  if (!dataset.value || !points.value.length || loading.value) return
  cancel(); picking.value = false; error.value = ''; selectedCell.value = null
  const active = new AbortController(); controller = active; loading.value = true
  const payload = { datasetId: dataset.value.datasetId, datasetVersion: dataset.value.activeVersion }
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
        p.result = result; p.cells = []; p.status = '统计完成，加载网格'
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
      if (p.cells.length !== p.result.statistics.totalGridCount) throw new Error('统计与明细数量不一致，请重新查询')
      p.status = '完成'; showRegion(p)
    }
  } catch (e) {
    if (controller !== active) return
    if (e.name !== 'AbortError') error.value = e.message
    points.value.forEach(p => { if (['统计中', '加载网格', '统计完成，加载网格'].includes(p.status)) p.status = '未完成，可重试' })
  } finally { if (controller === active) { controller = null; loading.value = false } }
}
function resetForm() { cancel(); picking.value = false; points.value = []; selectedId.value = ''; clearMap() }
function changeDisplay() { points.value.filter(p => p.status === '完成').forEach(showRegion) }
defineExpose({ resetForm, setPointFromMap, selectConeCell, picking })
onMounted(initialize)
onBeforeUnmount(resetForm)
</script>

<template>
  <section class="cone-panel">
    <div class="heading"><h3>圆锥台区域规划适宜性查询</h3><button type="button" @click="emit('close')">返回</button></div>
    <p class="hint">输入或点选中心，为每个点选择固定尺寸。高度从中心地面向上计算。</p>
    <label>空域数据集<select v-model="datasetId" :disabled="loading" @change="changeDataset"><option value="" disabled>请选择已绑定规划等级的数据集</option><option v-for="d in datasets" :key="d.datasetId" :value="d.datasetId">{{ d.datasetId }} · V{{ d.activeVersion }}</option></select></label>
    <p v-if="notice" class="notice">{{ notice }}</p>
    <button type="button" :disabled="loading" @click="initialize">刷新目录与模板</button>
    <label>新增点默认模板<select v-model="defaultTemplate" :disabled="loading"><option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }} · {{ t.height }} m</option></select></label>
    <div class="actions"><button type="button" :disabled="loading" :class="{ active: picking }" @click="picking = !picking">{{ picking ? '结束地图选点' : '地图批量选点' }}</button><span class="hint">{{ points.length }}/{{ maxRegions }} 个点</span></div>
    <p v-if="picking" class="notice">连续点击地图添加中心点，点击结束后可拾取区域及格元。</p>
    <div class="coordinates"><label>经度<input v-model="longitude" type="number" step="0.000001" :disabled="loading"></label><label>纬度<input v-model="latitude" type="number" step="0.000001" :disabled="loading"></label></div>
    <button type="button" :disabled="loading" @click="addInput">添加经纬度点</button>
    <div class="points"><div v-for="(p, index) in points" :key="p.id" class="point" :class="{ selected: selectedId === p.id }"><button type="button" class="point-name" @click="focus(p)">点位 {{ index + 1 }}<small>{{ p.longitude.toFixed(6) }}, {{ p.latitude.toFixed(6) }}</small></button><span>{{ p.status }}</span><button type="button" :disabled="loading" @click="remove(p)" :aria-label="`删除点位 ${index+1}`">×</button><p v-if="p.message" class="error">{{ p.message }}</p></div></div>
    <template v-if="selected"><label>当前点位尺寸<select v-model="selected.templateId" :disabled="loading" @change="invalidate(selected)"><option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }} · {{ t.height }} m</option></select></label><p v-if="selectedTemplate" class="hint">底半径 {{ selectedTemplate.bottomRadius }} m / 顶半径 {{ selectedTemplate.topRadius }} m / 高 {{ selectedTemplate.height }} m</p></template>
    <div class="actions"><button class="primary" type="button" :disabled="loading || !datasetId || !points.length" @click="runQuery">批量查询 / 重试</button><button v-if="loading" type="button" @click="cancel">取消</button><button type="button" :disabled="loading" @click="resetForm">清除本功能</button></div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <label>显示方式<select v-model="displayMode" @change="changeDisplay"><option value="surface">圆锥台表面映射</option><option value="cells">真实盒状格元</option></select></label>
    <div class="legend"><span v-for="g in PLANNING_GRADES" :key="g.label"><i :style="{ background: g.color }"></i>{{ g.label }}</span></div>
    <div v-if="selected?.result" class="statistics" aria-live="polite"><h4>当前区域 · 完整统计</h4><p>相交基础格元 {{ selected.result.statistics.totalGridCount }} 个</p><table><thead><tr><th>等级</th><th>数量</th><th>占比</th></tr></thead><tbody><tr v-for="g in grades" :key="g.value"><td>{{ g.label }}</td><td>{{ g.count }}</td><td>{{ percent(g.ratio) }}</td></tr><tr><td>未知</td><td>{{ selected.result.statistics.unknownCount }}</td><td>{{ percent(selected.result.statistics.unknownRatio) }}</td></tr></tbody></table><p class="hint">有效等级覆盖率 {{ percent(selected.result.statistics.attributeCoverageRatio) }}<br>缺少基础格元 {{ selected.result.coverage.missingBaseGridCount }} 个<br>底部绝对高程 {{ selected.result.region.bottomElevation.toFixed(2) }} m</p></div>
    <div v-if="selectedCell" class="statistics"><h4>选中格元</h4><p class="code">{{ selectedCell.code }}</p><p>规划等级：{{ PLANNING_GRADES.find(g => g.value === selectedCell.attributeValue)?.label || '未知' }}</p><p class="hint">高度 {{ selectedCell.bottom }}—{{ selectedCell.top }} m · {{ selectedCell.valueStatus }}</p></div>
    <p class="hint">占比按相交格元数量计算，包含未知；各区域独立统计。表面颜色按展示块位置采样，仅用于概览，点击可追溯源格元；真实格元模式保留完整边界。模板仅定义查询范围，不代表飞行许可或净空标准。</p>
  </section>
</template>

<style scoped>
.cone-panel{padding:16px;color:#334155;font-size:13px}.heading,.actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.heading{justify-content:space-between}.heading h3{font-size:15px;margin:0}label{display:block;margin:12px 0 5px}select,input{display:block;box-sizing:border-box;width:100%;padding:8px;margin-top:5px;border:1px solid #cbd5e1;border-radius:6px;background:white;color:#334155;font:inherit}button{padding:7px 10px;border:1px solid #cbd5e1;border-radius:6px;background:white;color:#334155;font:inherit;cursor:pointer}button:disabled{opacity:.5;cursor:default}.primary,.active{background:#2563eb;color:white;border-color:#2563eb}.hint{font-size:12px;color:#64748b;line-height:1.7}.notice{padding:9px;background:#eff6ff;color:#1d4ed8;line-height:1.7}.coordinates{display:grid;grid-template-columns:1fr 1fr;gap:8px}.points{margin:14px 0}.point{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 0;border-bottom:1px solid #e2e8f0}.point.selected{border-bottom-color:#2563eb}.point-name{flex:1;text-align:left;border:0;padding:2px;background:transparent}small{display:block;color:#64748b;font-size:11px}.point>span{font-size:11px}.error{color:#b91c1c;line-height:1.6}.legend{display:flex;gap:9px;flex-wrap:wrap;font-size:11px;margin:14px 0}.legend i{display:inline-block;width:8px;height:8px;margin-right:3px}.statistics{padding-top:10px;border-top:1px solid #cbd5e1;margin-top:12px}h4{margin:0 0 8px}table{width:100%;border-collapse:collapse}td,th{text-align:right;padding:7px 3px;border-bottom:1px solid #e2e8f0}td:first-child,th:first-child{text-align:left}.code{overflow-wrap:anywhere}
</style>
