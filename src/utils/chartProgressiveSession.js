import { createChartSources, scheduleChartPages } from './chartProgressiveScheduler.js'
import { ChartProgressiveStore } from './chartProgressiveStore.js'

let sessionSequence = 0

/// 显示回调串行执行，各来源网络请求独立进行，最多缓存 concurrency 个页面。
export async function runChartProgressiveSession(payload, { signal, onStart, onBatch, onStatus } = {}) {
  const id = 'chart-progressive-' + (++sessionSequence)
  const store = new ChartProgressiveStore(payload.level)
  let pending = Promise.resolve()
  let pages = 0
  await onStart?.(id)
  const outcome = await scheduleChartPages(createChartSources(payload, signal), {
    signal, onStatus,
    onPage: (response, source) => {
      const next = pending.then(async () => {
        if (signal?.aborted) throw new DOMException('查询已取消', 'AbortError')
        const cells = store.merge(response.data)
        pages++
        await onBatch?.({ id, source, cells, pages, summary: store.summary(), data: response.data })
      })
      pending = next.catch(() => {})
      return next
    },
  })
  await pending
  return { ...outcome, id, pages, summary: store.summary() }
}
