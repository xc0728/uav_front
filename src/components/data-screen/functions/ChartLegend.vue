<script setup>
import { computed } from 'vue'
import { GRID_ATTRIBUTE_TOPICS, gridAttributeLegend, noiseAttributeLabel } from '../../../utils/noiseGrid.js'

const props = defineProps({
  attributeCode: { type: String, default: '' },
  items: { type: Array, default: () => [] },
  variant: { type: String, default: 'light' },
})

const definition = computed(() => GRID_ATTRIBUTE_TOPICS.find(item => item.code === props.attributeCode))
const unit = computed(() => definition.value?.unit || '')
const bands = computed(() => {
  if (!props.attributeCode) return props.items
  const legend = gridAttributeLegend(props.attributeCode)
  if (legend.length) return legend
  if (definition.value?.kind === 'zone') return [
    { label: '不满足（0）', color: '#ef4444' },
    { label: '满足（1）', color: '#f59e0b' },
    { label: '优秀（2）', color: '#22c55e' },
  ]
  if (definition.value?.kind === 'margin') return [
    { label: '> 0（超标）', color: '#ef4444' },
    { label: '-5 < 值 ≤ 0', color: '#f59e0b' },
    { label: '-10 < 值 ≤ -5', color: '#84cc16' },
    { label: '≤ -10', color: '#16a34a' },
  ]
  return []
})

function bandLabel(band) {
  // 单位在标题处统一展示，避免只有最后一档带单位。
  return unit.value && band.label.endsWith(unit.value)
    ? band.label.slice(0, -unit.value.length).trim()
    : band.label
}
</script>

<template>
  <section class="chart-legend" :class="`is-${variant}`" aria-label="航图图例">
    <div class="legend-heading">
      <strong>图例</strong>
      <span v-if="unit" class="legend-unit">单位：{{ unit }}</span>
      <span v-else class="legend-unit">{{ attributeCode ? '分区含义' : '要素类别' }}</span>
    </div>
    <div v-if="attributeCode" class="legend-topic">{{ noiseAttributeLabel(attributeCode) }}</div>
    <ul v-if="bands.length" class="legend-bands">
      <li v-for="(band, index) in bands" :key="band.id || index">
        <i class="legend-color" :style="{ background: band.color }" aria-hidden="true" />
        <span class="legend-label">{{ bandLabel(band) }}</span>
        <small v-if="band.dimensionMode">{{ band.dimensionMode }}</small>
      </li>
    </ul>
    <p v-else class="legend-empty">该属性尚未配置分档图例</p>
  </section>
</template>

<style scoped>
.chart-legend {
  margin-top: 10px;
  padding: 12px;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  background: #eff6ff;
  color: #1e293b;
}
.legend-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 10px;
}
.legend-heading strong {
  color: #1d4ed8;
  font-size: 14px;
}
.legend-unit {
  color: #475569;
  font-size: 12px;
}
.legend-topic {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.legend-bands {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr));
  gap: 6px;
  padding: 0;
  margin: 10px 0 0;
  list-style: none;
}
.legend-bands li {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 7px 8px;
  border-radius: 6px;
  background: #fff;
  font-size: 13px;
  line-height: 1.5;
}
.legend-color {
  width: 24px;
  height: 18px;
  flex: 0 0 24px;
  border: 1px solid rgba(15, 23, 42, 0.2);
  border-radius: 4px;
}
.legend-label {
  flex: 1;
  overflow-wrap: anywhere;
}
.legend-bands small {
  color: #475569;
  font-size: 11px;
}
.legend-empty {
  margin: 10px 0 0;
  color: #64748b;
  font-size: 12px;
}
.is-dark {
  background: #17263d;
  border-color: #456384;
  color: #f8fafc;
}
.is-dark .legend-heading strong { color: #93c5fd; }
.is-dark .legend-unit,
.is-dark .legend-bands small,
.is-dark .legend-empty { color: #cbd5e1; }
.is-dark .legend-bands li { background: #22334c; }
.is-dark .legend-color { border-color: rgba(255, 255, 255, 0.35); }
</style>
