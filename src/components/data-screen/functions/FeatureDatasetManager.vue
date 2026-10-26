<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  AlertTriangle,
  ArchiveRestore,
  Database,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-vue-next'
import { errorMessage } from '../../../utils/http'
import FieldAttributeManager from './FieldAttributeManager.vue'

const emit = defineEmits(['import-field'])
const catalogMode = ref('features')

const PAGE_SIZE = 30
const OPERATION_LABELS = {
  RETIRE: '逻辑退役',
  RESTORE: '恢复',
  PURGE: '永久清理',
}
const THEME_LABELS = {
  road: '道路',
  landuse: '土地利用',
  landcover: '地表覆盖',
  water: '水体',
  admin: '行政区划',
  transport: '交通设施',
  sensitive: '敏感区域',
  communication: '通信设施',
  navigation: '导航设施',
  surveillance: '监视设施',
  airspace: '空域',
  obstacle: '障碍物',
  vertiport: '起降设施',
  terrain: '地形',
  air_route: '航路',
  utility: '市政设施',
  structure: '建构筑物',
}

const loading = ref(false)
const loadError = ref('')
const datasets = ref([])
const total = ref(0)
const offset = ref(0)
const searchInput = ref('')
const search = ref('')
const state = ref('all')
const selectedId = ref('')
const notice = ref(null)

const showDialog = ref(false)
const action = ref('retire')
const actionDataset = ref(null)
const actionReason = ref('')
const adminToken = ref(window.sessionStorage.getItem('staticFeatureAdminToken') || '')
const confirmation = ref('')
const actionBusy = ref(false)
const actionError = ref('')
const preview = ref(null)
const jobProgress = ref(null)
let jobTimer = null

const selected = computed(() => datasets.value.find(item => item.datasetId === selectedId.value) || datasets.value[0] || null)
const currentPage = computed(() => Math.floor(offset.value / PAGE_SIZE) + 1)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const currentActiveCount = computed(() => datasets.value.filter(item => item.state === 'active').length)
const currentRetiredCount = computed(() => datasets.value.filter(item => item.state === 'retired').length)

function formatNumber(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}

function formatTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function themeLabel(theme) {
  return THEME_LABELS[theme] || theme || '-'
}

async function responseJson(response, fallback) {
  if (!response.ok) throw new Error(await errorMessage(response, fallback))
  const body = await response.json()
  if (body?.status === 'error') throw new Error(body.message || fallback)
  return body
}

async function loadDatasets() {
  loading.value = true
  loadError.value = ''
  try {
    const query = new URLSearchParams({
      search: search.value,
      state: state.value,
      limit: String(PAGE_SIZE),
      offset: String(offset.value),
    })
    const response = await fetch(`/api/static-features/datasets?${query}`)
    const body = await responseJson(response, '航图要素数据集查询失败')
    datasets.value = body?.data?.items || []
    total.value = Number(body?.data?.total || 0)
    if (offset.value > 0 && datasets.value.length === 0) {
      offset.value = Math.max(0, offset.value - PAGE_SIZE)
      await loadDatasets()
      return
    }
    if (!datasets.value.some(item => item.datasetId === selectedId.value)) {
      selectedId.value = datasets.value[0]?.datasetId || ''
    }
  } catch (error) {
    loadError.value = error?.message || '航图要素数据集查询失败'
    datasets.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function applySearch() {
  search.value = searchInput.value.trim()
  offset.value = 0
  loadDatasets()
}

function changeState(nextState) {
  state.value = nextState
  offset.value = 0
  loadDatasets()
}

function changePage(delta) {
  const next = offset.value + delta * PAGE_SIZE
  if (next < 0 || next >= total.value) return
  offset.value = next
  loadDatasets()
}

function openAction(nextAction, dataset) {
  action.value = nextAction
  actionDataset.value = dataset
  actionReason.value = ''
  confirmation.value = ''
  actionError.value = ''
  preview.value = null
  jobProgress.value = null
  showDialog.value = true
}

function closeDialog() {
  if (actionBusy.value) return
  showDialog.value = false
  preview.value = null
  jobProgress.value = null
  actionError.value = ''
}

function actionTitle() {
  if (action.value === 'restore') return '恢复数据集'
  if (action.value === 'purge') return '永久清理数据集'
  return '退役并从在线查询中删除'
}

function actionUrl(datasetId) {
  const encoded = encodeURIComponent(datasetId)
  if (action.value === 'restore') return `/api/static-features/datasets/${encoded}/restore`
  if (action.value === 'purge') return `/api/static-features/datasets/${encoded}/purge-jobs`
  return `/api/static-features/datasets/${encoded}`
}

function actionMethod() {
  if (action.value === 'retire') return 'DELETE'
  return 'POST'
}

function actionPayload(dryRun) {
  const dataset = actionDataset.value
  const payload = {
    expectedRevision: action.value === 'retire' ? Number(dataset.activeRevision) : 0,
    reason: actionReason.value.trim(),
    dryRun,
  }
  if (action.value === 'restore') payload.restoreRevision = Number(dataset.availableRevision)
  if (action.value === 'purge') payload.confirmDatasetId = confirmation.value.trim()
  return payload
}

async function pollJob(jobId, attempt = 0) {
  if (attempt >= 600) throw new Error('清理任务等待超时，请稍后到任务查询页查看结果')
  if (jobTimer) window.clearTimeout(jobTimer)
  const response = await fetch(`/api/data-processing-jobs/${encodeURIComponent(jobId)}`)
  const body = await responseJson(response, '清理任务状态查询失败')
  jobProgress.value = body?.data || null
  if (jobProgress.value?.status === 'succeeded') return jobProgress.value
  if (jobProgress.value?.status === 'failed') {
    throw new Error(jobProgress.value.error || '清理任务执行失败')
  }
  await new Promise(resolve => {
    jobTimer = window.setTimeout(resolve, 1000)
  })
  return pollJob(jobId, attempt + 1)
}

async function runAction(dryRun) {
  actionError.value = ''
  if (!actionReason.value.trim()) {
    actionError.value = '请填写操作原因，操作记录将写入审计日志。'
    return
  }
  if (!adminToken.value.trim()) {
    actionError.value = '请输入静态 Feature 管理员令牌。'
    return
  }
  if (action.value === 'purge' && confirmation.value.trim() !== actionDataset.value.datasetId) {
    actionError.value = '永久清理时必须完整输入 Dataset ID 进行确认。'
    return
  }

  actionBusy.value = true
  try {
    window.sessionStorage.setItem('staticFeatureAdminToken', adminToken.value)
    const response = await fetch(actionUrl(actionDataset.value.datasetId), {
      method: actionMethod(),
      headers: {
        'Content-Type': 'application/json',
        'X-Static-Feature-Admin-Token': adminToken.value.trim(),
      },
      body: JSON.stringify(actionPayload(dryRun)),
    })
    const body = await responseJson(response, `${actionTitle()}失败`)
    if (action.value === 'purge') {
      const jobId = body?.data?.jobId
      if (!jobId) throw new Error('后端未返回清理任务 ID')
      jobProgress.value = { jobId, status: 'queued' }
      const completed = await pollJob(jobId)
      if (dryRun) {
        preview.value = completed.result || completed
      } else {
        notice.value = { type: 'success', text: `数据集 ${actionDataset.value.datasetId} 已永久清理。` }
        showDialog.value = false
        await loadDatasets()
      }
      return
    }
    if (dryRun) {
      preview.value = body.data || {}
    } else {
      notice.value = { type: 'success', text: body.message || `${actionTitle()}成功` }
      showDialog.value = false
      await loadDatasets()
    }
  } catch (error) {
    actionError.value = error?.message || `${actionTitle()}失败`
  } finally {
    actionBusy.value = false
  }
}

onMounted(loadDatasets)
onBeforeUnmount(() => {
  if (jobTimer) window.clearTimeout(jobTimer)
})
</script>

<template>
  <div class="feature-manager">
    <header class="manager-header">
      <div>
        <div class="eyebrow">AERONAUTICAL FEATURE CATALOG</div>
        <h2>航图要素数据管理</h2>
        <p>统一管理实体航图要素与噪声、监视设施覆盖等场属性数据。</p>
      </div>
      <button v-if="catalogMode === 'features'" class="refresh-button" type="button" :disabled="loading" @click="loadDatasets">
        <Loader2 v-if="loading" :size="16" class="spin" />
        <RefreshCw v-else :size="16" />
        刷新
      </button>
    </header>

    <div class="toolbar">
      <div class="state-tabs" aria-label="管理数据类型">
        <button type="button" :class="{ active: catalogMode === 'features' }" @click="catalogMode = 'features'">实体要素</button>
        <button type="button" :class="{ active: catalogMode === 'fields' }" @click="catalogMode = 'fields'">场数据（噪声 / 监视覆盖）</button>
      </div>
    </div>
    <FieldAttributeManager v-if="catalogMode === 'fields'" @import-field="emit('import-field', $event)" />
    <template v-else>
    <div class="summary-grid">
      <div class="summary-card"><span>筛选结果</span><strong>{{ formatNumber(total) }}</strong><small>个数据集</small></div>
      <div class="summary-card active"><span>本页活动</span><strong>{{ currentActiveCount }}</strong><small>在线参与查询</small></div>
      <div class="summary-card retired"><span>本页已退役</span><strong>{{ currentRetiredCount }}</strong><small>可恢复或永久清理</small></div>
    </div>

    <div class="toolbar">
      <form class="search-box" @submit.prevent="applySearch">
        <Search :size="17" />
        <input v-model="searchInput" type="search" placeholder="搜索 Dataset ID、名称或主题" />
        <button type="submit">查询</button>
      </form>
      <div class="state-tabs" aria-label="数据集状态筛选">
        <button v-for="option in [{ id: 'all', label: '全部' }, { id: 'active', label: '活动' }, { id: 'retired', label: '已退役' }]"
          :key="option.id" type="button" :class="{ active: state === option.id }" @click="changeState(option.id)">
          {{ option.label }}
        </button>
      </div>
    </div>

    <div v-if="notice" class="notice success" role="status">
      <ShieldCheck :size="18" /><span>{{ notice.text }}</span><button type="button" @click="notice = null"><X :size="16" /></button>
    </div>
    <div v-if="loadError" class="notice error" role="alert"><AlertTriangle :size="18" />{{ loadError }}</div>

    <div class="workspace">
      <section class="dataset-list" aria-label="航图要素数据集列表">
        <div class="table-head">
          <span>数据集</span><span>分类</span><span>规模</span><span>状态</span>
        </div>
        <button v-for="dataset in datasets" :key="dataset.datasetId" type="button" class="dataset-row"
          :class="{ selected: selected?.datasetId === dataset.datasetId }" @click="selectedId = dataset.datasetId">
          <span class="dataset-main">
            <strong>{{ dataset.datasetName || dataset.datasetId }}</strong>
            <small>{{ dataset.datasetId }}</small>
          </span>
          <span class="dataset-class"><b>{{ themeLabel(dataset.theme) }}</b><small>{{ dataset.dimensionMode }} · L{{ dataset.level }}</small></span>
          <span class="dataset-size"><b>{{ formatNumber(dataset.featureCount) }}</b><small>要素</small></span>
          <span><i class="status-pill" :class="dataset.state">{{ dataset.state === 'active' ? '活动' : '已退役' }}</i></span>
        </button>
        <div v-if="loading && !datasets.length" class="empty-state"><Loader2 :size="22" class="spin" />正在加载数据集...</div>
        <div v-else-if="!datasets.length && !loadError" class="empty-state"><Database :size="28" />没有符合条件的数据集</div>
        <footer class="pagination">
          <span>第 {{ currentPage }} / {{ totalPages }} 页</span>
          <div><button type="button" :disabled="offset === 0" @click="changePage(-1)">上一页</button><button type="button" :disabled="offset + PAGE_SIZE >= total" @click="changePage(1)">下一页</button></div>
        </footer>
      </section>

      <aside v-if="selected" class="detail-panel">
        <div class="detail-title"><div><span>DATASET DETAIL</span><h3>{{ selected.datasetName || selected.datasetId }}</h3></div><i class="status-pill" :class="selected.state">{{ selected.state === 'active' ? '活动' : '已退役' }}</i></div>
        <dl class="detail-grid">
          <div><dt>Dataset ID</dt><dd>{{ selected.datasetId }}</dd></div>
          <div><dt>当前活动修订</dt><dd>{{ selected.activeRevision || '-' }}</dd></div>
          <div><dt>可用修订</dt><dd>{{ selected.availableRevision || '-' }}</dd></div>
          <div><dt>数据格式</dt><dd>{{ selected.sourceFormat }}</dd></div>
          <div><dt>维度 / 层级</dt><dd>{{ selected.dimensionMode }} / L{{ selected.level }}</dd></div>
          <div><dt>高度基准</dt><dd>{{ selected.heightReference }}</dd></div>
          <div><dt>二维映射</dt><dd>{{ formatNumber(selected.mapping2dCount) }}</dd></div>
          <div><dt>三维映射</dt><dd>{{ formatNumber(selected.mapping3dCount) }}</dd></div>
        </dl>
        <div class="detail-section"><h4>包含的要素类型</h4><div class="tag-list"><span v-for="type in selected.featureTypes" :key="type">{{ type }}</span><em v-if="!selected.featureTypes?.length">暂无类型统计</em></div></div>
        <div v-if="selected.minHeight !== null || selected.maxHeight !== null" class="detail-section"><h4>高度范围</h4><p>{{ selected.minHeight ?? '-' }} m — {{ selected.maxHeight ?? '-' }} m</p></div>
        <div class="detail-section timeline"><h4>时间信息</h4><p>创建：{{ formatTime(selected.createdAt) }}</p><p>更新：{{ formatTime(selected.updatedAt) }}</p><p v-if="selected.lastOperation">最近操作：{{ OPERATION_LABELS[selected.lastOperation.operation] || selected.lastOperation.operation }} · {{ formatTime(selected.lastOperation.createdAt) }}</p><small v-if="selected.lastOperation?.reason">{{ selected.lastOperation.reason }}</small></div>
        <div class="action-area">
          <button v-if="selected.state === 'active'" class="danger-button" type="button" @click="openAction('retire', selected)"><Trash2 :size="16" />退役删除</button>
          <template v-else>
            <button class="restore-button" type="button" :disabled="!selected.availableRevision" @click="openAction('restore', selected)"><ArchiveRestore :size="16" />恢复上线</button>
            <button class="purge-button" type="button" @click="openAction('purge', selected)"><Trash2 :size="16" />永久清理</button>
          </template>
        </div>
        <p class="safety-note">退役删除会立即从在线查询中移除数据，但保留实体以便恢复；永久清理不可撤销。</p>
      </aside>
    </div>

    <div v-if="showDialog" class="dialog-backdrop" @click.self="closeDialog">
      <section class="dialog" role="dialog" aria-modal="true">
        <header><div><span>受保护的管理操作</span><h3>{{ actionTitle() }}</h3></div><button type="button" :disabled="actionBusy" @click="closeDialog"><X :size="19" /></button></header>
        <div class="warning-box"><AlertTriangle :size="20" /><p><strong>{{ actionDataset.datasetName || actionDataset.datasetId }}</strong><br />{{ actionDataset.datasetId }}</p></div>
        <label>操作原因<textarea v-model="actionReason" rows="3" maxlength="500" placeholder="说明为什么需要执行此操作"></textarea></label>
        <label>管理员令牌<input v-model="adminToken" type="password" autocomplete="current-password" placeholder="X-Static-Feature-Admin-Token" /></label>
        <label v-if="action === 'purge'">输入 Dataset ID 二次确认<input v-model="confirmation" type="text" :placeholder="actionDataset.datasetId" /></label>
        <div v-if="jobProgress && actionBusy" class="job-progress"><Loader2 :size="17" class="spin" />清理预检任务：{{ jobProgress.status || 'running' }}</div>
        <div v-if="preview" class="preview-box"><h4>预检通过，请核对影响范围</h4><div class="preview-stats"><span>要素 <b>{{ formatNumber(preview.featureCount ?? preview.clickHouseRows) }}</b></span><span>二维映射 <b>{{ formatNumber(preview.mapping2dCount ?? preview.tables?.grid_feature_2d?.targetRows) }}</b></span><span>三维映射 <b>{{ formatNumber(preview.mapping3dCount ?? preview.tables?.grid_feature_3d?.targetRows) }}</b></span></div><p v-if="action === 'purge'">永久清理将重建 ClickHouse 共享分区并删除 PostgreSQL 数据，无法通过页面恢复。</p></div>
        <div v-if="actionError" class="dialog-error">{{ actionError }}</div>
        <footer><button type="button" :disabled="actionBusy" @click="closeDialog">取消</button><button v-if="!preview" class="preview-button" type="button" :disabled="actionBusy" @click="runAction(true)"><Loader2 v-if="actionBusy" :size="15" class="spin" />执行预检</button><button v-else :class="action === 'restore' ? 'confirm-restore' : 'confirm-danger'" type="button" :disabled="actionBusy" @click="runAction(false)"><Loader2 v-if="actionBusy" :size="15" class="spin" />确认执行</button></footer>
      </section>
    </div>
    </template>
  </div>
</template>

<style scoped>
.feature-manager { color: var(--theme-title-text, #173b57); }
.manager-header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; padding: 4px 2px 22px; }
.eyebrow, .detail-title span, .dialog header span { color: #1787b8; font-size: 11px; font-weight: 800; letter-spacing: .16em; }
.manager-header h2 { margin: 5px 0 7px; font-size: 25px; }
.manager-header p { margin: 0; color: var(--theme-side-label, #64748b); max-width: 720px; }
button, input, textarea { font: inherit; }
.refresh-button, .toolbar button, .pagination button, .dialog footer button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 1px solid var(--theme-nav-border, #bfd5e3); border-radius: 8px; background: var(--theme-nav-active-bg, #fff); color: var(--theme-nav-text, #28516e); padding: 9px 14px; cursor: pointer; }
button:disabled { opacity: .48; cursor: not-allowed; }
.summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.summary-card { position: relative; padding: 15px 18px; border: 1px solid var(--theme-nav-border, #d4e2ec); border-radius: 12px; background: color-mix(in srgb, var(--theme-dropdown-bg, #fff) 93%, #1793c6 7%); }
.summary-card::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 4px; border-radius: 12px 0 0 12px; background: #1793c6; }
.summary-card.active::before { background: #16a36a; }.summary-card.retired::before { background: #d97706; }
.summary-card span, .summary-card small { display: block; color: var(--theme-side-label, #64748b); }.summary-card strong { display: inline-block; margin: 4px 8px 0 0; font-size: 25px; }
.toolbar { display: flex; justify-content: space-between; gap: 14px; margin-bottom: 14px; }
.search-box { flex: 1; max-width: 620px; display: flex; align-items: center; gap: 8px; border: 1px solid var(--theme-nav-border, #c8dbe7); border-radius: 9px; padding-left: 12px; background: var(--theme-dropdown-bg, #fff); }
.search-box input { flex: 1; min-width: 0; border: 0; outline: 0; padding: 10px 4px; background: transparent; color: inherit; }.search-box button { border-width: 0 0 0 1px; border-radius: 0 8px 8px 0; }
.state-tabs { display: flex; gap: 4px; padding: 3px; border: 1px solid var(--theme-nav-border, #c8dbe7); border-radius: 9px; }.state-tabs button { padding: 6px 12px; border: 0; background: transparent; }.state-tabs button.active { color: #fff; background: #1889ba; }
.notice { display: flex; align-items: center; gap: 9px; padding: 10px 12px; border-radius: 9px; margin-bottom: 12px; }.notice.success { color: #087a50; background: #e8f8f1; }.notice.error, .dialog-error { color: #b42318; background: #fff0ee; }.notice button { margin-left: auto; border: 0; background: none; cursor: pointer; }
.workspace { display: grid; grid-template-columns: minmax(600px, 1.55fr) minmax(310px, .8fr); gap: 14px; min-height: 440px; }
.dataset-list, .detail-panel { border: 1px solid var(--theme-nav-border, #d1e0e9); border-radius: 12px; background: var(--theme-dropdown-bg, #fff); overflow: hidden; }
.table-head, .dataset-row { display: grid; grid-template-columns: minmax(230px, 2fr) minmax(130px, 1fr) 90px 75px; gap: 12px; align-items: center; text-align: left; }
.table-head { padding: 10px 15px; background: color-mix(in srgb, var(--theme-dropdown-bg, #fff) 90%, #168fc5 10%); color: var(--theme-side-label, #64748b); font-size: 12px; font-weight: 700; }
.dataset-row { width: 100%; padding: 12px 15px; border: 0; border-top: 1px solid var(--theme-nav-border, #e3edf3); background: transparent; color: inherit; cursor: pointer; }.dataset-row:hover, .dataset-row.selected { background: color-mix(in srgb, var(--theme-dropdown-bg, #fff) 91%, #1894c9 9%); }.dataset-row.selected { box-shadow: inset 3px 0 #178fc2; }
.dataset-main, .dataset-class, .dataset-size { min-width: 0; }.dataset-main strong, .dataset-main small, .dataset-class b, .dataset-class small, .dataset-size b, .dataset-size small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.dataset-main small, .dataset-class small, .dataset-size small { color: var(--theme-side-label, #738493); font-size: 11px; margin-top: 3px; }
.status-pill { display: inline-flex; border-radius: 999px; padding: 4px 8px; font-size: 11px; font-style: normal; font-weight: 700; }.status-pill.active { color: #087a50; background: #dff7ed; }.status-pill.retired { color: #a04d08; background: #fff1d8; }
.empty-state { display: flex; min-height: 250px; flex-direction: column; align-items: center; justify-content: center; gap: 9px; color: var(--theme-side-label, #64748b); }
.pagination { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-top: 1px solid var(--theme-nav-border, #dce8ef); font-size: 12px; color: var(--theme-side-label, #64748b); }.pagination div { display: flex; gap: 6px; }.pagination button { padding: 5px 9px; }
.detail-panel { padding: 18px; }.detail-title { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }.detail-title h3 { margin: 5px 0 0; font-size: 18px; word-break: break-word; }
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; margin: 18px 0; background: var(--theme-nav-border, #e1ebf0); border: 1px solid var(--theme-nav-border, #e1ebf0); border-radius: 9px; overflow: hidden; }.detail-grid div { padding: 10px; background: var(--theme-dropdown-bg, #fff); }.detail-grid dt { color: var(--theme-side-label, #70808d); font-size: 11px; }.detail-grid dd { margin: 4px 0 0; font-weight: 700; word-break: break-all; }
.detail-section { margin-top: 16px; }.detail-section h4 { margin: 0 0 8px; font-size: 13px; }.detail-section p { margin: 4px 0; color: var(--theme-side-label, #596d7c); }.detail-section small { color: var(--theme-side-label, #71818e); }.tag-list { display: flex; flex-wrap: wrap; gap: 6px; }.tag-list span { padding: 4px 7px; border-radius: 6px; color: #146b91; background: #e6f4fa; font-size: 11px; }.tag-list em { color: #8796a2; font-size: 12px; }
.action-area { display: flex; gap: 8px; margin-top: 20px; }.action-area button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; flex: 1; padding: 9px; border-radius: 8px; cursor: pointer; }.danger-button, .purge-button, .confirm-danger { border: 1px solid #efb5ad; color: #b42318; background: #fff3f1; }.restore-button, .confirm-restore { border: 1px solid #9ed9c1; color: #087a50; background: #eaf8f2; }.safety-note { color: #8a6a28; font-size: 11px; line-height: 1.6; }
.dialog-backdrop { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 20px; background: rgba(7, 23, 35, .58); backdrop-filter: blur(3px); }.dialog { width: min(560px, 100%); max-height: calc(100vh - 40px); overflow: auto; padding: 20px; border-radius: 14px; background: var(--theme-dropdown-bg, #fff); box-shadow: 0 22px 70px rgba(0,0,0,.28); }.dialog header { display: flex; justify-content: space-between; }.dialog header h3 { margin: 4px 0 0; }.dialog header button { border: 0; background: none; color: inherit; cursor: pointer; }
.warning-box { display: flex; gap: 11px; margin: 16px 0; padding: 12px; border-radius: 9px; color: #9a4d09; background: #fff4df; }.warning-box p { margin: 0; word-break: break-word; }.dialog label { display: block; margin-top: 13px; font-size: 12px; font-weight: 700; }.dialog input, .dialog textarea { display: block; width: 100%; margin-top: 6px; padding: 9px 10px; border: 1px solid var(--theme-nav-border, #c9d9e3); border-radius: 8px; background: transparent; color: inherit; resize: vertical; }.preview-box { margin-top: 14px; padding: 12px; border-radius: 9px; background: #edf8fd; }.preview-box h4 { margin: 0 0 10px; }.preview-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }.preview-stats span { padding: 8px; border-radius: 7px; background: rgba(255,255,255,.7); font-size: 11px; }.preview-stats b { display: block; margin-top: 3px; font-size: 15px; }.preview-box p { color: #9b281e; font-size: 12px; }.dialog-error, .job-progress { margin-top: 12px; padding: 10px; border-radius: 8px; }.job-progress { display: flex; align-items: center; gap: 8px; background: #edf6fb; }.dialog footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }.preview-button { color: #fff !important; background: #1889ba !important; border-color: #1889ba !important; }
.spin { animation: spin .9s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 1050px) { .workspace { grid-template-columns: 1fr; }.detail-panel { min-height: auto; } }
@media (max-width: 760px) { .manager-header, .toolbar { flex-direction: column; }.summary-grid { grid-template-columns: 1fr; }.workspace { display: block; }.detail-panel { margin-top: 12px; }.table-head { display: none; }.dataset-row { grid-template-columns: 1fr 1fr; }.state-tabs { width: 100%; }.state-tabs button { flex: 1; } }
</style>
