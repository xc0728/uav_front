import { chartDisplayClasses } from './staticFeatures.js'
import { chartGridSourceMask } from './chartGridSources.js'

/// 仅服务于渐进精简查询；返回整格快照，后到来源可以更新已有格元。
export class ChartProgressiveStore {
  constructor(level) {
    this.level = level
    this.cells = new Map()
    this.received = 0
    this.datasets = new Map()
    this.dimensions = { "2D": 0, "3D": 0 }
  }

  merge(data) {
    const dictionary = new Map((data.displayClasses || []).map(item => [item.id, item]))
    // 先完成整页校验，坏分类编号不能留下半页状态。
    const incoming = data.cells.map(cell => {
      const displayClasses = cell.classIds ? cell.classIds.map(id => {
        if (!dictionary.has(id)) throw new Error('精简展示分类编号无效')
        return dictionary.get(id)
      }) : chartDisplayClasses(cell)
      const { features, classIds, ...grid } = cell
      if (!cell.code) throw new Error('渐进查询缺少网格编码')
      return { ...grid, level: Number(cell.level ?? this.level), displayOnly: true, displayClasses }
    })
    const changed = new Map()
    for (const cell of incoming) {
      const key = cell.level + ':' + cell.code
      const previous = this.cells.get(key)
      const displayClasses = chartDisplayClasses({
        displayClasses: [...(previous?.displayClasses || []), ...cell.displayClasses],
      })
      const merged = { ...previous, ...cell, displayClasses,
        chartSourceMask: chartGridSourceMask(cell) | (previous?.chartSourceMask || 0) }
      if (previous) this.count(previous, -1)
      this.count(merged, 1)
      this.cells.set(key, merged)
      changed.set(key, merged)
    }
    this.received += incoming.length
    return [...changed.values()]
  }

  count(cell, delta) {
    const modes = new Set()
    for (const category of cell.displayClasses) {
      modes.add(category.dimensionMode)
      const row = this.datasets.get(category.datasetId) || { ...category, id: category.datasetId, count: 0 }
      row.count += delta
      this.datasets.set(category.datasetId, row)
    }
    for (const mode of modes) if (mode in this.dimensions) this.dimensions[mode] += delta
  }

  summary() {
    return { grids: this.cells.size, features2D: this.dimensions['2D'], features3D: this.dimensions['3D'],
      datasets: [...this.datasets.values()].filter(item => item.count > 0).map(item => ({ ...item })),
      receivedCount: this.received, displayOnly: true }
  }
}
