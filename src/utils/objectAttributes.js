import { errorMessage } from './http.js'

export async function attributeRequest(path, { token = '', method = 'GET', body, signal } = {}) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) controller.abort()
  const timer = setTimeout(abort, 120000)
  try {
    const response = await fetch(`/api/object-attributes/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Static-Feature-Admin-Token': token },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      const error = new Error(await errorMessage(response, `属性维护请求失败 (${response.status})`))
      error.status = response.status
      throw error
    }
    const result = await response.json()
    if (result.status !== 'success') throw new Error(result.message || '属性维护请求失败')
    return result.data
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

export function typedAttributeValue(text, type, explicitNull = false) {
  if (explicitNull) return null
  if (type === 'string') return text
  if (type === 'boolean') {
    if (text !== 'true' && text !== 'false') throw new Error('布尔值请选择 true 或 false')
    return text === 'true'
  }
  if (type === 'number') {
    if (!text.trim() || !Number.isFinite(Number(text))) throw new Error('数值属性必须输入有限数字')
    return Number(text)
  }
  throw new Error('该字段类型不可编辑')
}

export function modelAttributeKey(properties) {
  const name = Object.hasOwn(properties || {}, 'OID') ? 'OID' : 'Id'
  const value = properties?.[name]
  if (typeof value === 'string' && value) return `${name}:s:${value}`
  if (typeof value === 'number' && Number.isSafeInteger(value)) return `${name}:n:${value}`
  return ''
}

// 实际属性和服务端白名单取交集；未登记字段只展示，不推断其可写性。
export function attributeFieldOptions(selected, schema) {
  const keys = [...new Set(selected.flatMap(item => Object.keys(item.properties || {})))].sort()
  const existing = keys.filter(key => Object.hasOwn(schema, key))
  return {
    existing,
    additional: Object.keys(schema).filter(key => !keys.includes(key)),
    readonly: keys.filter(key => !Object.hasOwn(schema, key)),
  }
}

export function buildAttributeRequest(kind, scopeId, selected, fields, schema, reason, requestId, operation = 'set') {
  if (!scopeId || !selected.length) throw new Error('请先读取并选择对象')
  if (!reason.trim()) throw new Error('请填写修改原因')
  if (!['set', 'delete'].includes(operation)) throw new Error('不支持的属性操作')
  const patch = Object.create(null)
  const unset = []
  for (const field of fields) {
    if (!Object.hasOwn(schema, field.key)) throw new Error('请选择服务端允许编辑的字段')
    if (Object.hasOwn(patch, field.key) || unset.includes(field.key)) throw new Error('同一字段不能重复设置')
    if (operation === 'delete') unset.push(field.key)
    else patch[field.key] = typedAttributeValue(field.value, schema[field.key], field.null)
  }
  if (!fields.length) throw new Error('至少添加一个待修改属性')
  return {
    requestId, objectKind: kind, scopeId, reason: reason.trim(),
    items: selected.map(item => ({
      objectUid: item.objectUid, externalKey: item.externalKey, baseToken: item.baseToken,
      expectedRevision: item.propertyRevision,
      ...(operation === 'delete' ? { unset: [...unset] } : { set: { ...patch } }),
    })),
  }
}

/// 按后端单批上限生成独立请求；请求编号在预览时生成并保留，重试时复用。
export function buildAttributeRequests(kind, scopeId, selected, fields, schema, reason, maxBatchSize = 500, operation = 'set') {
  const size = Math.min(500, Number(maxBatchSize))
  if (!Number.isInteger(size) || size < 1) throw new Error('服务端批次上限无效')
  if (!selected.length) throw new Error('请先读取并选择对象')
  const requests = []
  for (let offset = 0; offset < selected.length; offset += size) {
    requests.push(buildAttributeRequest(kind, scopeId, selected.slice(offset, offset + size), fields, schema, reason, crypto.randomUUID(), operation))
  }
  return requests
}

// 完整读取当前作用域；中途失败时不向界面提交部分结果，避免把部分对象误称为全选。
export function createAttributeReadState() {
  return { items: new Map(), cursors: new Set(), cursor: '', complete: false }
}

function waitForAttributeRetry(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('读取已取消', 'AbortError')) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, ms)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
  })
}

export async function collectAttributeObjects(readPage, onProgress = () => {}, {
  state = createAttributeReadState(), signal, onRetry = () => {}, retryDelays = [1000, 2000, 5000],
} = {}) {
  if (state.items.size) onProgress(state.items.size)
  while (!state.complete) {
    if (signal?.aborted) throw new DOMException('读取已取消', 'AbortError')
    let page
    for (let attempt = 0; ; attempt++) {
      try { page = await readPage(state.cursor); break }
      catch (error) {
        // 仅重试读取中的临时网络/服务错误；不自动重放提交或跳过失败页。
        const transient = [429, 502, 503, 504].includes(error.status) || error instanceof TypeError
        if (!transient || signal?.aborted || attempt >= retryDelays.length) throw error
        onRetry({ attempt: attempt + 1, loaded: state.items.size, delayMs: retryDelays[attempt] })
        await waitForAttributeRetry(retryDelays[attempt], signal)
      }
    }
    if (signal?.aborted) throw new DOMException('读取已取消', 'AbortError')
    if (!Array.isArray(page?.items) || typeof page.hasMore !== 'boolean') throw new Error('对象分页响应格式无效，已停止全选')
    if (page.hasMore && (!page.nextCursor || page.nextCursor === state.cursor || state.cursors.has(page.nextCursor)))
      throw new Error('对象分页游标未前进，已停止全选，请重新读取')
    for (const item of page.items) state.items.set(item.externalKey, item)
    state.complete = !page.hasMore
    if (page.hasMore) { state.cursors.add(page.nextCursor); state.cursor = page.nextCursor }
    onProgress(state.items.size)
  }
  return [...state.items.values()]
}

// 已受理的请求不重复发送；结果不明的请求仍使用预览时的 requestId 重试。
export async function submitAttributeRequests(records, submitRequest, onAccepted = () => {}) {
  for (const record of records) {
    if (!record.changedCount || record.batchId) continue
    const result = await submitRequest(record.request)
    if (!result.batchId) throw new Error('服务端未返回批次编号，请保留原预览重试')
    record.batchId = result.batchId
    onAccepted(result.batchId)
  }
}
