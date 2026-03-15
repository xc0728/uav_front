<script setup>
import { reactive, ref } from 'vue'
import { Loader2 } from 'lucide-vue-next'

const props = defineProps({
  serviceName: {
    type: String,
    default: '倾斜摄影网格化入库服务'
  },
  functionName: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['close'])

const osgbForm = reactive({
  osgbFolder: '/app/data/osgbData',
  level: 14,
})
const osgbLoading = ref(false)
const osgbError = ref('')
const osgbResult = ref(null)

function resetForm() {
  if (props.functionName === 'osgb网格化（同步入库）') {
    osgbError.value = ''
    osgbResult.value = null
  }
}

defineExpose({ resetForm })

async function submitOsgbGrid() {
  osgbError.value = ''
  osgbResult.value = null
  osgbLoading.value = true

  try {
    const payload = {
      osgbFolder: String(osgbForm.osgbFolder || '').trim(),
      level: Number(osgbForm.level),
    }
    if (!payload.osgbFolder) throw new Error('请先填写 OSGB 文件目录')
    if (Number.isNaN(payload.level)) throw new Error('请先填写网格层级 level（0-21）')

    const resp = await fetch('/api/multiSource/triangleGrid/osgbToGridJson', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) throw new Error(`请求失败，状态码 ${resp.status}`)

    const data = await resp.json()
    osgbResult.value = data
  } catch (err) {
    osgbError.value = err?.message || '请求失败，请稍后重试'
  } finally {
    osgbLoading.value = false
  }
}
</script>

<template>
  <div class="calc-content">
    <template v-if="functionName === 'osgb网格化（同步入库）'">
      <form class="form" @submit.prevent="submitOsgbGrid">
        <div class="form-row">
          <label class="form-label" for="osgb-folder">OSGB目录</label>
          <input
            id="osgb-folder"
            v-model="osgbForm.osgbFolder"
            type="text"
            class="form-input"
            required
          >
        </div>
        <div class="form-row">
          <label class="form-label" for="osgb-level">层级</label>
          <input
            id="osgb-level"
            v-model.number="osgbForm.level"
            type="number"
            min="0"
            max="21"
            step="1"
            class="form-input"
            required
          >
        </div>
        <div class="form-actions">
          <button
            type="submit"
            class="btn-primary"
            :disabled="osgbLoading"
          >
            <Loader2 v-if="osgbLoading" :size="14" class="spin" />
            {{ osgbLoading ? '网格化中...' : '开始网格化' }}
          </button>
        </div>
      </form>
      <div v-if="osgbError" class="error">{{ osgbError }}</div>
      <div v-if="osgbResult" class="result">
        <div class="result-row">
          <span class="result-k">处理状态</span>
          <span class="result-v">{{ osgbResult.status }}</span>
        </div>
        <div v-if="osgbResult.data?.total_triangles_processed !== undefined" class="result-row">
          <span class="result-k">三角形数</span>
          <span class="result-v">{{ osgbResult.data.total_triangles_processed }}</span>
        </div>
        <div v-if="osgbResult.data?.total_grid_count !== undefined" class="result-row">
          <span class="result-k">网格总数</span>
          <span class="result-v">{{ osgbResult.data.total_grid_count }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.form-label {
  width: 72px;
  font-size: 13px;
  color: #94a3b8;
  flex-shrink: 0;
}

.form-input {
  flex: 1;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
  color: #f1f5f9;
  font-size: 14px;
  outline: none;
  transition: all 0.15s ease;
}

.form-input:focus {
  border-color: #3b82f6;
  background: rgba(99, 102, 241, 0.1);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 6px;
}

.btn-primary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 22px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, #3b82f6, #0ea5e9);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
}

.btn-primary:disabled {
  opacity: 0.7;
  cursor: default;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.error {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.1);
  font-size: 13px;
  color: #fca5a5;
}

.result {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.result-row {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 10px;
  font-size: 15px;
}

.result-k {
  color: #64748b;
}

.result-v {
  color: #e2e8f0;
  font-variant-numeric: tabular-nums;
  word-break: break-all;
}
</style>
