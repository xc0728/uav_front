<script setup>
import { computed } from 'vue'

defineOptions({ name: 'ChartDatasetTreeNode' })

const props = defineProps({
  node: {
    type: Object,
    required: true,
  },
  selectedDatasetIds: {
    type: Array,
    required: true,
  },
  depth: {
    type: Number,
    default: 0,
  },
  variant: {
    type: String,
    default: 'light',
  },
})

const emit = defineEmits(['toggle'])

function datasetIdsOf(node) {
  return [
    ...(node.dataset ? [node.dataset.id] : []),
    ...(node.children || []).flatMap(datasetIdsOf),
  ]
}

const datasetIds = computed(() => datasetIdsOf(props.node))
const selectedCount = computed(() => (
  datasetIds.value.filter(id => props.selectedDatasetIds.includes(id)).length
))
const fullySelected = computed(() => (
  datasetIds.value.length > 0 && selectedCount.value === datasetIds.value.length
))

function toggleNode(checked) {
  emit('toggle', datasetIds.value, checked)
}
</script>

<template>
  <label
    v-if="node.dataset"
    class="catalog-dataset"
    :class="[`depth-${depth}`, `is-${variant}`]"
    :style="{ paddingLeft: `${14 + depth * 14}px` }"
  >
    <input
      type="checkbox"
      :value="node.dataset.id"
      :checked="selectedDatasetIds.includes(node.dataset.id)"
      @change="emit('toggle', [node.dataset.id], $event.target.checked)"
    >
    <i :style="{ background: node.dataset.color }" />
    <span :title="node.label">{{ node.label }}</span>
    <small class="dataset-dimension" :class="`is-${node.dataset.dimensionMode.toLowerCase()}`">
      {{ node.dataset.dimensionMode }}<template v-if="Number.isFinite(node.dataset.count)"> · {{ node.dataset.count }}</template>
    </small>
  </label>

  <details v-else class="catalog-node" :class="[`depth-${depth}`, `is-${variant}`]" open>
    <summary>
      <input
        type="checkbox"
        :checked="fullySelected"
        :indeterminate="selectedCount > 0 && !fullySelected"
        :aria-label="`选择${node.label}下的全部要素`"
        @click.stop
        @change="toggleNode($event.target.checked)"
      >
      <span>{{ node.label }}</span>
      <small>{{ selectedCount }}/{{ datasetIds.length }}</small>
    </summary>

    <ChartDatasetTreeNode
      v-for="child in node.children"
      :key="child.id"
      :node="child"
      :selected-dataset-ids="selectedDatasetIds"
      :depth="depth + 1"
      :variant="variant"
      @toggle="(ids, checked) => emit('toggle', ids, checked)"
    />
  </details>
</template>

<style scoped>
.catalog-node > summary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  color: #1e3a5f;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}

.catalog-node.depth-1 > summary {
  padding-left: 20px;
  color: #334155;
  font-size: 12px;
  font-weight: 600;
}

.catalog-node.depth-2 > summary {
  padding-left: 34px;
  color: #475569;
  font-size: 12px;
  font-weight: 500;
}

.catalog-node.depth-3 > summary {
  padding-left: 48px;
  color: #64748b;
  font-size: 12px;
  font-weight: 500;
}

.catalog-node > summary:hover,
.catalog-dataset:hover {
  background: #f8fafc;
}

.catalog-node > summary input,
.catalog-dataset input {
  margin: 0;
}

.catalog-node > summary span {
  min-width: 0;
  flex: 1;
}

.catalog-node > summary small {
  color: #94a3b8;
  font-size: 10px;
  font-weight: 500;
}

.catalog-dataset {
  display: flex;
  align-items: center;
  gap: 7px;
  padding-top: 6px;
  padding-right: 8px;
  padding-bottom: 6px;
  color: #334155;
  cursor: pointer;
  font-size: 12px;
}

.catalog-dataset i {
  width: 22px;
  height: 16px;
  flex: 0 0 22px;
  border: 1px solid rgba(148, 163, 184, 0.5);
  border-radius: 4px;
}

.catalog-dataset span {
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
  line-height: 1.5;
}

.dataset-dimension {
  flex: 0 0 auto;
  padding: 1px 4px;
  border-radius: 4px;
  background: #e2e8f0;
  color: #475569;
  font-size: 10px;
  font-weight: 600;
}

.dataset-dimension.is-3d {
  background: #fee2e2;
  color: #b91c1c;
}

.catalog-node.is-dark > summary,
.catalog-dataset.is-dark {
  color: rgba(255, 255, 255, 0.88);
}

.catalog-node.is-dark.depth-1 > summary,
.catalog-node.is-dark.depth-2 > summary,
.catalog-node.is-dark.depth-3 > summary {
  color: rgba(255, 255, 255, 0.76);
}

.catalog-node.is-dark > summary:hover,
.catalog-dataset.is-dark:hover {
  background: rgba(59, 130, 246, 0.14);
}

.catalog-node.is-dark > summary small {
  color: rgba(255, 255, 255, 0.46);
}

.catalog-dataset.is-dark .dataset-dimension {
  background: rgba(148, 163, 184, 0.2);
  color: rgba(255, 255, 255, 0.68);
}

.catalog-dataset.is-dark .dataset-dimension.is-3d {
  background: rgba(239, 68, 68, 0.24);
  color: #fecaca;
}
</style>
