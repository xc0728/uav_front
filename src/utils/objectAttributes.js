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
    if (!response.ok) throw new Error(await errorMessage(response, `属性维护请求失败 (${response.status})`))
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
