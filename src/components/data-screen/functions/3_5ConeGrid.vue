<script setup>
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { Loader2, MapPin, Trash2 } from 'lucide-vue-next'
import { requestGeometricCone } from '../../../utils/geometricCone.js'

const props = defineProps({ theme: { type: String, default: 'white' } })
const isTechBlueTheme = computed(() => props.theme === 'techBlue')
const centerVisible = ref(false)
const centerId = 'geometric-cone-center'
const emit = defineEmits(['close','showGrid'])
const defaults = { lon:119.97336454,lat:30.51992807,height:100,bottomRadius:5,topRadius:25,coneHeight:60,level:17,maxCells:50000 }
const form = reactive({...defaults}), picking = ref(false), loading = ref(false), error = ref(''), result = ref(null), selectedCell = ref(null)
const layerId = 'geometric-cone-buffer'
let controller = null
function cancel() {controller?.abort();controller=null;loading.value=false}
function removeLayer() {emit('showGrid',{coneRegion:{operation:'remove',id:layerId}})}
function invalidate() {cancel();result.value=null;selectedCell.value=null;removeLayer()}
function resetForm() {invalidate();removeCenter();picking.value=false;error.value='';Object.assign(form,defaults)}
function removeCenter() {
  emit('showGrid', { coneRegion: { operation: 'remove', id: centerId } })
  centerVisible.value = false
}
function updateCenter() {
  const values = [form.lon, form.lat, form.height]
  if (values.some(v => v === '' || v == null || !Number.isFinite(Number(v)))
    || Math.abs(Number(form.lon)) > 180 || Math.abs(Number(form.lat)) > 85) {
    removeCenter()
    return
  }
  emit('showGrid', { coneRegion: {
    operation: 'point', id: centerId, longitude: Number(form.lon), latitude: Number(form.lat), height: Number(form.height),
    labelText: `锥形中心 · ${Number(form.height).toFixed(1)} m`,
  } })
  centerVisible.value = true
}
function onCenterInput() { invalidate(); updateCenter() }
function togglePicking() {
  picking.value = !picking.value
  if (picking.value) { invalidate(); removeCenter(); error.value = '' }
}
function setPointFromMap(lon, lat, height) {
  if (!picking.value || loading.value) return
  if (![lon, lat, height].every(Number.isFinite)) {
    error.value = '未获取到有效的经纬高，请重新选点。'
    return
  }
  invalidate()
  Object.assign(form, { lon, lat, height })
  updateCenter()
  error.value = ''
}
function selectConeCell(detail) {if(detail.regionId===layerId)selectedCell.value=detail.cell}
async function calculate() {
  if (loading.value) return
  invalidate();updateCenter();error.value='';picking.value=false
  const active=new AbortController();controller=active;loading.value=true
  try {
    const data=await requestGeometricCone(form,active.signal)
    if (controller!==active || active.signal.aborted) return
    result.value=data
    emit('showGrid',{coneRegion:{operation:'region',id:layerId,region:data.region,cells:data.cells,mode:'cells',selected:true,cellColor:'#5b9fd4',labelText:'锥形缓冲区'}})
  } catch(e) {if(controller===active && e.name!=='AbortError')error.value=e.message}
  finally {if(controller===active){controller=null;loading.value=false}}
}
defineExpose({resetForm,setPointFromMap,selectConeCell,picking})
onBeforeUnmount(()=>{cancel();removeLayer();removeCenter()})
</script>

<template>
  <section class="cone-grid-query" :class="{ 'theme-tech-blue': isTechBlueTheme }">
    <div class="hint-box">选择底部中心，设置上下半径与竖直高度，生成锥形范围相交的网格。</div>
    <div class="form-group">
      <div class="group-heading"><h3 class="group-title">底部中心</h3>
        <button type="button" class="btn-pick" :class="{ active: picking }" :aria-pressed="picking" :disabled="loading" @click="togglePicking"><MapPin :size="14" />{{ picking ? '结束选点' : '地图选点' }}</button>
      </div>
      <p class="field-hint" :class="{ 'picking-hint': picking }" role="status">{{ picking ? '点击地图或已加载的模型表面，自动回填经度、纬度和高程。' : centerVisible ? '中心点已标注，可继续选点或手动调整经纬高。' : '支持手动输入，或通过地图选取经纬高。' }}</p>
      <fieldset :disabled="loading">
        <label class="param-line"><span class="param-label">经度</span><input v-model="form.lon" type="number" step="0.000001" class="param-input" @input="onCenterInput"></label>
        <label class="param-line"><span class="param-label">纬度</span><input v-model="form.lat" type="number" step="0.000001" class="param-input" @input="onCenterInput"></label>
        <label class="param-line"><span class="param-label">高程(m)</span><input v-model="form.height" type="number" step="0.1" class="param-input" @input="onCenterInput"></label>
      </fieldset>
      <p class="field-hint">底部高程取自所选表面；选屋顶需先加载建筑模型。可手动校正高程。</p>
    </div>
    <fieldset :disabled="loading">
      <div class="form-group">
        <h3 class="group-title">锥形尺寸</h3>
        <label class="param-line"><span class="param-label">底半径(m)</span><input v-model="form.bottomRadius" type="number" min="0" max="5000" class="param-input" @input="invalidate"></label>
        <label class="param-line"><span class="param-label">顶半径(m)</span><input v-model="form.topRadius" type="number" min="0" max="5000" class="param-input" @input="invalidate"></label>
        <label class="param-line"><span class="param-label">竖直高(m)</span><input v-model="form.coneHeight" type="number" min="0.1" max="10000" step="0.1" class="param-input" @input="invalidate"></label>
      </div>
      <div class="form-group">
        <h3 class="group-title">网格参数</h3>
        <label class="param-line"><span class="param-label">层级</span><select v-model="form.level" class="param-input" @change="invalidate"><option v-for="level in 21" :key="level" :value="level">第 {{ level }} 级</option></select></label>
        <label class="param-line"><span class="param-label">格元上限</span><input v-model="form.maxCells" type="number" min="1" max="100000" step="1000" class="param-input" @input="invalidate"></label>
      </div>
    </fieldset>
    <div class="btn-row">
      <button type="button" class="btn-query" :disabled="loading" @click="calculate"><Loader2 v-if="loading" :size="16" class="spin" />{{ loading ? '计算中…' : '开始计算' }}</button>
      <button v-if="loading" type="button" class="btn-clear" @click="cancel">取消</button>
      <button v-else type="button" class="btn-clear" @click="resetForm"><Trash2 :size="14" />清除</button>
    </div>
    <p v-if="error" class="error-box" role="alert">{{ error }}</p>
    <div v-if="result" class="result-box" aria-live="polite">
      <div class="result-row"><span>生成格元</span><strong>{{ result.count }} 个</strong></div>
      <div class="result-row"><span>网格层级</span><span>第 {{ result.level }} 级</span></div>
      <div class="result-row"><span>高程范围</span><span>{{ result.region.bottomElevation }}—{{ result.region.topElevation }} m</span></div>
      <p class="field-hint">完整结果 · 包含边界相交 · 未截断</p>
    </div>
    <div v-if="selectedCell" class="result-box"><h3 class="group-title">选中格元</h3><p class="code">{{ selectedCell.code }}</p><p class="field-hint">底高 {{ selectedCell.bottom.toFixed(2) }} m / 顶高 {{ selectedCell.top.toFixed(2) }} m</p></div>
    <p class="field-hint">半径为 0 时形成圆锥，两半径相等时形成圆柱。超出格元上限会提示调整参数。</p>
  </section>
</template>

<style scoped>
.cone-grid-query { width: 100%; padding: 0; box-sizing: border-box; color: #334155; font-size: 14px; }
.hint-box { padding: 10px 12px; margin-bottom: 12px; background: #f5f3f0; border: 1px solid #e2e8f0; border-radius: 8px; color: #475569; line-height: 1.6; }
.form-group { margin-bottom: 16px; }
.group-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.group-title { margin: 0 0 8px; font-size: 15px; font-weight: 600; color: #334155; }
.group-heading .group-title { margin-bottom: 0; }
.field-hint { margin: 8px 0; color: #64748b; font-size: 12px; line-height: 1.7; }
.picking-hint { color: #397cab; }
fieldset { min-width: 0; border: 0; margin: 0; padding: 0; }
.param-line { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.param-label { width: 76px; flex-shrink: 0; }
.param-input { flex: 1; width: 100%; min-width: 0; height: 34px; padding: 0 10px; box-sizing: border-box; border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; color: #334155; font: inherit; }
.param-input:focus { outline: none; border-color: #7db8e0; box-shadow: 0 0 0 3px rgba(91, 159, 212, .15); }
button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; font: inherit; transition: background .15s, border-color .15s; }
.btn-pick { min-height: 30px; padding: 4px 10px; background: #fff; color: #475569; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px; }
.btn-pick:hover, .btn-pick.active { background: #eef6fc; border-color: #7db8e0; color: #397cab; }
.btn-row { display: flex; gap: 8px; margin-bottom: 10px; }
.btn-query { flex: 1; height: 38px; border: none; border-radius: 8px; background: linear-gradient(135deg, #7db8e0, #5b9fd4); color: #fff; font-size: 15px; font-weight: 500; }
.btn-query:hover:not(:disabled) { background: linear-gradient(135deg, #6aa8d4, #4a8fc4); }
.btn-clear { width: 88px; height: 38px; background: #fff; color: #475569; border: 1px solid #e2e8f0; border-radius: 8px; }
button:disabled, fieldset:disabled { opacity: .6; }
button:disabled { cursor: not-allowed; }
.result-box { margin-top: 12px; padding: 12px; background: #f9f9f9; border: 1px solid #e2e8f0; border-radius: 8px; }
.result-row { display: flex; justify-content: space-between; gap: 8px; margin: 6px 0; }
.result-row strong { color: #397cab; }
.code { overflow-wrap: anywhere; font-family: monospace; }
.error-box { padding: 10px 12px; color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; line-height: 1.6; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.theme-tech-blue { color: #d7f5ff; }
.theme-tech-blue .group-title, .theme-tech-blue .param-label { color: #ecfbff; }
.theme-tech-blue .hint-box, .theme-tech-blue .result-box { color: #d7f5ff; background: rgba(10, 48, 92, .82); border-color: rgba(97, 218, 251, .26); }
.theme-tech-blue .param-input, .theme-tech-blue .btn-pick, .theme-tech-blue .btn-clear { background: #0c3057; color: #ecfbff; border-color: rgba(97, 218, 251, .35); }
.theme-tech-blue .btn-pick.active, .theme-tech-blue .btn-pick:hover { background: #154b78; border-color: #7dd3fc; }
.theme-tech-blue .field-hint { color: #a6c8e2; }
.theme-tech-blue .picking-hint, .theme-tech-blue .result-row strong { color: #7dd3fc; }
.theme-tech-blue .error-box { background: #492333; border-color: #a25269; color: #fecaca; }
</style>
