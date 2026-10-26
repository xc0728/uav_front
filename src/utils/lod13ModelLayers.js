export function addLod13ModelId(ids, datasetId) {
  if (!datasetId || ids.includes(datasetId)) return ids
  return [...ids, datasetId]
}

export function toggleLod13ModelId(ids, datasetId) {
  if (!datasetId) return ids
  return ids.includes(datasetId)
    ? ids.filter(id => id !== datasetId)
    : [...ids, datasetId]
}

export function toggleAllLod13ModelIds(loadedIds, visibleIds) {
  return visibleIds.length ? [] : [...loadedIds]
}
