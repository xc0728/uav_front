import { queryChartRegion, queryModelGridCells } from './staticFeatures.js'
import { MODEL_GRID_DATASET_IDS } from './chartGridSources.js'
import { queryManagedCells } from './elementMaintenance.js'

export function progressiveChartEnabled({ chartMode, simplified, progressive, overlay = false }) {
  return chartMode && simplified && progressive && !overlay
}

export function createChartSources(payload, signal) {
  const models = new Map(Object.entries(MODEL_GRID_DATASET_IDS).map(([source, id]) => [id, source]))
  const ids = [...new Set(payload.datasetIds || [])]
  const staticIds = ids.filter(id => !models.has(id) && !id.startsWith('managed_'))
  return [
    ...(staticIds.length ? [{ name: 'static', query: cursor =>
      queryChartRegion({ ...payload, displayOnly: true, datasetIds: staticIds }, { signal, cursor }) }] : []),
    ...ids.filter(id => id.startsWith('managed_')).map(id => {
      let revision
      return { name: id, opaque: true, query: async cursor => {
        const page = await queryManagedCells(payload, id, { signal, cursor, revision })
        revision = page.data.revision
        return page
      } }
    }),
    ...ids.filter(id => models.has(id)).map(id => ({
      name: id, query: cursor => queryModelGridCells(payload, models.get(id), { signal, cursor }),
    })),
  ]
}

function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException('查询已取消', 'AbortError')
}

/// 每个来源顺序翻页；来源之间没有合并屏障。回调完成前不预取，限制缓冲内存。
export async function scheduleChartPages(sources, { signal, onPage, onStatus, concurrency = 3 } = {}) {
  const queue = sources.map(source => ({ ...source, cursor: undefined, watermark: undefined, pages: 0 }))
  const failures = []
  async function worker() {
    while (queue.length) {
      checkAbort(signal)
      const state = queue.shift()
      const started = performance.now()
      try {
        onStatus?.({ source: state.name, status: 'loading', pages: state.pages })
        const response = await state.query(state.cursor)
        checkAbort(signal)
        if (response?.status === 'error' || !response?.data || !Array.isArray(response.data.cells)
          || typeof response.data.hasMore !== 'boolean') throw new Error('分页响应格式无效')
        const data = response.data
        const last = data.cells.at(-1)?.code
        const watermark = data.scannedCursor || last || data.nextCursor
        const next = state.opaque ? data.nextCursor : watermark
        if (data.hasMore && (!next || !watermark || (state.watermark && watermark <= state.watermark))) {
          throw new Error('分页游标未向前推进')
        }
        await onPage?.(response, state.name)
        checkAbort(signal)
        state.pages++
        onStatus?.({ source: state.name, status: data.hasMore ? 'loading' : 'success',
          pages: state.pages, elapsedMs: performance.now() - started })
        if (data.hasMore) {
          state.cursor = next
          state.watermark = watermark
          queue.push(state)
        }
      } catch (error) {
        checkAbort(signal)
        const failure = { source: state.name, status: 'error', message: error.message, pages: state.pages }
        failures.push(failure)
        onStatus?.(failure)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), sources.length) }, worker))
  checkAbort(signal)
  return { failures, complete: failures.length === 0 }
}
