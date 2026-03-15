<script setup>
const props = defineProps({
  serviceName: {
    type: String,
    default: '立体导航网格路径规划服务'
  },
  functionName: {
    type: String,
    required: true
  }
})

function resetForm() {}
defineExpose({ resetForm })
</script>

<template>
  <div class="calc-content">
    <p class="placeholder">该服务的计算功能后续补充</p>
  </div>
</template>

<style scoped>
.placeholder {
  font-size: 13px;
  color: #64748b;
  line-height: 1.6;
}
</style>
