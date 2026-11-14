import { errorMessage } from './http.js'

export const PLANNING_GRADES = [
  { value: 1, label: '不适宜', color: '#df5b62' },
  { value: 2, label: '低适宜', color: '#ed9540' },
  { value: 3, label: '中适宜', color: '#e5c34c' },
  { value: 4, label: '适宜', color: '#55ad89' },
  { value: null, label: '未知', color: '#9aa5b3' },
]
export const planningColor = value => PLANNING_GRADES.find(g => g.value === value)?.color ?? '#9aa5b3'

async function read(url, options = {}) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) controller.abort()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, 35000)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    if (!response.ok) throw new Error(await errorMessage(response, '圆锥台查询失败'))
    const body = await response.json()
    if (body.status === 'error' || !body.data) throw new Error(body.message || '查询响应无效')
    return body.data
  } catch (error) {
    if (timedOut) throw new Error('圆锥台查询超时，请减少点位或选择较小模板')
    throw error
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort) }
}
export const loadConeTemplates = signal => read('/api/true-altitude-airspace/grid/cone-region/templates', { signal })
export const queryConeRegions = (payload, signal) => read('/api/true-altitude-airspace/grid/cone-region', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal,
})

/// 固定摘要快照，并验证游标确实前进，禁止静默拼接不同版本的明细。
export async function loadConeCells(payload, region, summary, signal, onPage) {
  let cursor = null
  do {
    const data = await queryConeRegions({ ...payload, resultMode: 'cells', pageSize: 1000,
      regions: [{ ...region, expectedFingerprint: summary.queryFingerprint, ...(cursor ? { cursor } : {}) }],
    }, signal)
    const result = data.regions?.[0]
    if (result?.status !== 'success') throw new Error(result?.message || '区域明细查询失败')
    if (result.queryFingerprint !== summary.queryFingerprint) throw new Error('区域快照已变化，请重新查询')
    if (result.hasMore && (!result.nextCursor || result.nextCursor === cursor)) throw new Error('区域游标未前进')
    await onPage(result.cells || [])
    cursor = result.hasMore ? result.nextCursor : null
  } while (cursor)
}
