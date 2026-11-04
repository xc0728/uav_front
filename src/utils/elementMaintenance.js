// 正式维护独立接口；令牌仅由调用方页面内存传入，不写浏览器持久存储。
export async function maintenanceRequest(operation, body, token, { signal } = {}) {
  const response = await fetch('/api/element-maintenance/' + operation, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Element-Maintenance-Token': token },
    body: JSON.stringify(body), signal,
  })
  const result = await response.json()
  if (!response.ok || result.status !== 'success') {
    const error = new Error(result.message || '正式维护请求失败（' + response.status + '）')
    error.status = response.status
    throw error
  }
  return result.data
}

export async function uploadMaintenanceFile(file, uploadId, token, onProgress, signal) {
  const started = await maintenanceRequest('uploads', { uploadId, fileName: file.name, size: file.size }, token, { signal })
  let offset = Number(started.offset)
  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(file.size, offset + Number(started.chunkBytes || 1048576)))
    let result, failure
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch('/api/element-maintenance/uploads/' + encodeURIComponent(uploadId), {
          method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Element-Maintenance-Token': token, 'X-Upload-Offset': String(offset) },
          body: chunk, signal,
        })
        const body = await response.json()
        if (!response.ok || body.status !== 'success') throw new Error(body.message || '文件分片上传失败')
        result = body.data
        break
      } catch (e) { failure = e; if (signal?.aborted) throw e }
    }
    if (!result) throw failure
    if (Number(result.offset) <= offset) throw new Error('上传偏移未前进')
    offset = Number(result.offset)
    onProgress?.(offset, file.size)
  }
  return uploadId
}

export function managedCellFeature(cell, collectionId) {
  return { datasetId: collectionId, featureUid: cell.objectId, objectId: cell.objectId, objectVersion: cell.objectVersion,
    code: String(cell.code).split('').map(c => String(Number(c) & 3)).join(''), level: cell.level,
    theme: collectionId === 'managed_prohibited' ? 'airspace' : collectionId === 'managed_buildings' ? 'obstacle' : 'structure',
    featureType: collectionId === 'managed_prohibited' ? 'prohibited_airspace' : collectionId === 'managed_buildings' ? 'building' : 'managed_feature',
    dimensionMode: cell.z === -1 ? '2D' : '3D', verticalMode: cell.z === -1 ? '' : 'RANGE',
    minHeight: cell.bottom, maxHeight: cell.top, properties: cell.properties,
    classificationCode: cell.classificationCode, managed: true }
}

export async function queryManagedCells(payload, collectionId, { signal, cursor, revision } = {}) {
  const p = payload.polygon || []
  if (p.length < 3) throw new Error('正式维护网格需要有效查询多边形')
  const xs = p.map(v => Number(v[0])), ys = p.map(v => Number(v[1]))
  const body = { collectionId, level: Number(payload.level), bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    polygon: p, bottom: Number(payload.bottom), top: Number(payload.top), limit: 1000,
    ...(cursor ? { cursor } : {}), ...(revision !== undefined ? { revision } : {}) }
  const response = await fetch('/api/element-maintenance/query/grids', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  })
  const result = await response.json()
  if (!response.ok || result.status !== 'success') throw new Error(result.message || '正式维护网格查询失败')
  result.data.cells = result.data.cells.map(cell => ({ ...cell, datasetId: collectionId, managed: true, revision: result.data.revision,
    features: [managedCellFeature(cell, collectionId)] }))
  return result
}
