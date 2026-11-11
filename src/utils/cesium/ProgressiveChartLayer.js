/// 独立的批次管理器；原实例渲染类及原追加策略不变。
export default class ProgressiveChartLayer {
  constructor({ createRenderer, removeRenderer, batchSize = 4096 }) {
    this.createRenderer = createRenderer
    this.removeRenderer = removeRenderer
    this.batchSize = batchSize
    this.batches = []
    this.locations = new Map()
  }

  apply(cells, options) {
    const dirty = new Set()
    for (const cell of cells) {
      const key = cell.level + ':' + cell.code
      let location = this.locations.get(key)
      if (!location) {
        let batch = this.batches.at(-1)
        if (!batch || batch.cells.length >= this.batchSize) {
          batch = { cells: [], renderer: null }
          this.batches.push(batch)
        }
        location = { batch, index: batch.cells.length }
        batch.cells.push(cell)
        this.locations.set(key, location)
      } else location.batch.cells[location.index] = cell
      dirty.add(location.batch)
    }
    for (const batch of dirty) {
      if (batch.renderer) this.removeRenderer(batch.renderer)
      batch.renderer = this.createRenderer(batch.cells, options)
    }
  }

  destroy() {
    for (const batch of this.batches) if (batch.renderer) this.removeRenderer(batch.renderer)
    this.batches = []
    this.locations.clear()
  }
}
