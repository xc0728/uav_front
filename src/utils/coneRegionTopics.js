/// 锥形专题的图例与颜色均来自后端配置，缺测不补零。
export const DEFAULT_CONE_TOPIC = 'planning_suitability_level'
export function availableConeTopics(topics, catalog, dataset) {
  return topics.map(topic => ({ ...topic, available: Boolean(dataset && Number(dataset.activeLevel) === 17 && catalog.some(item =>
    item.code === topic.code && item.state === 'active' && item.valueType === topic.valueType && item.temporalMode === 'static'
    && item.bindings?.some(binding => binding.datasetId === dataset.datasetId
      && String(binding.datasetVersion) === String(dataset.activeVersion) && Number(binding.level) === 17
      && binding.bindingId && Number(binding.projectionRevision) > 0))) }))
}
export function coneTopicEntry(cell, code = DEFAULT_CONE_TOPIC) {
  if (cell?.attributes?.[code]) return cell.attributes[code]
  if (cell && (cell.attributeCode === code || (!cell.attributeCode && code === DEFAULT_CONE_TOPIC))) {
    return { value: cell.attributeValue ?? null, valueStatus: cell.valueStatus ?? (cell.attributeValue == null ? 'missing' : 'valid') }
  }
  return { value: null, valueStatus: 'missing' }
}
export function coneTopicBin(entry, topic) {
  if (entry?.valueStatus !== 'valid' || typeof entry.value !== 'number' || !Number.isFinite(entry.value)) return null
  if (topic?.kind === 'categorical') return topic.bins?.find(bin => entry.value === bin.value) ?? null
  const rawValue = entry.value
  if (rawValue < 0 || rawValue > 1) return null
  const tolerance = topic?.matchTolerance ?? 0
  if (topic?.kind === 'numeric_enum') return topic.bins?.find(bin => Math.abs(rawValue - bin.value) <= tolerance) ?? null
  if (topic?.kind !== 'numeric') return null
  // 与后端采用同一容差，仅改变归档比较值，不改变详情中的原始值。
  let value = rawValue
  for (const bin of topic.bins || []) {
    if (Math.abs(rawValue - bin.min) <= tolerance) { value = bin.min; break }
    if (Math.abs(rawValue - bin.max) <= tolerance) { value = bin.max; break }
  }
  return topic.bins?.find(bin => value >= bin.min && (value < bin.max || (bin.includeMax && value === bin.max))) ?? null
}
export function coneTopicColor(cell, code, topic) {
  return coneTopicBin(coneTopicEntry(cell, code), topic)?.color ?? topic?.unknownColor ?? '#9AA5B3'
}
export function coneBinRange(bin, topic) {
  return topic?.kind === 'numeric' ? `[${bin.min}, ${bin.max}${bin.includeMax ? ']' : ')'}` : String(bin.value)
}
export function coneTopicSummary(data, result, code) {
  const statistics = result.statisticsByAttribute?.[code]
  const metadata = data.attributeMetadata?.[code]
  if (!statistics || !metadata?.topic || !result.queryFingerprint) throw new Error('专题响应不完整，请更新后端后重试')
  return { ...result, statistics, topic: metadata.topic, attributeMetadata: metadata }
}
