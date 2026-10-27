export const TRUE_ALTITUDE_QUERY_MODE = Object.freeze({
  LOD: 'lod',
  HIGHEST_RESOLUTION: 'highest-resolution',
})

/**
 * 真高区域查询的显示精度参数。
 * 最高精度模式必须完全省略 LOD 参数，令后端直接查询数据集权威层。
 */
export function trueAltitudeQueryOptions(
  mode,
  { renderTargetCells = 100000, experimentalMixedResolution = false } = {},
) {
  if (mode !== TRUE_ALTITUDE_QUERY_MODE.LOD) return {}
  return {
    renderTargetCells: Number(renderTargetCells),
    ...(experimentalMixedResolution ? { experimentalMixedResolution: true } : {}),
  }
}

export function activeTrueAltitudeDatasets(body) {
  const datasets = Array.isArray(body?.data?.datasets)
    ? body.data.datasets
    : (Array.isArray(body?.datasets) ? body.datasets : [])
  return datasets
    .map(dataset => ({
      ...dataset,
      datasetId: dataset?.datasetId ?? dataset?.dataset_id ?? '',
      activeVersion: dataset?.activeVersion ?? dataset?.active_version ?? null,
      activeLevel: dataset?.activeLevel ?? dataset?.active_level ?? dataset?.level ?? null,
      minAgl: dataset?.minAgl ?? dataset?.min_agl ?? null,
      maxAgl: dataset?.maxAgl ?? dataset?.max_agl ?? null,
    }))
    .filter(dataset =>
      dataset.datasetId && dataset.activeVersion != null && Number.isInteger(Number(dataset.activeLevel)),
    )
}

export function buildTrueAltitudeRegionPayload({
  datasetId,
  datasetVersion,
  polygon,
  minAgl,
  maxAgl,
  level,
  pageSize = 50000,
  cursor,
  renderTargetCells,
  attributeCode,
  attributeLodAggregation,
  project2DToAllHeights,
  experimentalMixedResolution = false,
}) {
  const payload = {
    datasetId,
    polygon,
    minAgl: Number(minAgl),
    maxAgl: Number(maxAgl),
    level: Number(level),
    pageSize: Number(pageSize),
  }
  if (datasetVersion != null) payload.datasetVersion = Number(datasetVersion)
  if (cursor) payload.cursor = cursor
  if (renderTargetCells != null) payload.renderTargetCells = Number(renderTargetCells)
  if (attributeCode) payload.attributeCode = attributeCode
  if (attributeCode && project2DToAllHeights != null) payload.project2DToAllHeights = Boolean(project2DToAllHeights)
  if (attributeCode && attributeLodAggregation) payload.attributeLodAggregation = attributeLodAggregation
  if (experimentalMixedResolution) payload.experimentalMixedResolution = true
  return payload
}

export function toAirspaceMapCells(rawGrids) {
  return rawGrids
    .filter(cell => cell?.found !== false)
    .map(cell => {
      const grid = cell?.data?.grid || cell
      const bounds = grid.bounds
      const code = String(grid.code || cell.code || '')
      const rawLevel = grid.level ?? cell.level
      const explicitLevel = Number(rawLevel)
      const normalizedCode = code.replace(/^dqg/, '')
      const level = rawLevel !== null && rawLevel !== undefined && rawLevel !== ''
        && Number.isInteger(explicitLevel) && explicitLevel >= 0 && explicitLevel <= 21
        ? explicitLevel
        : (/^[0-7]+$/.test(normalizedCode) ? normalizedCode.length : null)
      return {
        code,
        level,
        x: grid.x ?? grid.column,
        y: grid.y ?? grid.row,
        z: grid.z ?? grid.layer,
        bounds: {
          north: grid.maxlat ?? bounds?.max_latitude ?? bounds?.north,
          south: grid.minlat ?? bounds?.min_latitude ?? bounds?.south,
          east: grid.maxlon ?? bounds?.max_longitude ?? bounds?.east,
          west: grid.minlon ?? bounds?.min_longitude ?? bounds?.west,
          top: grid.top ?? bounds?.top ?? 0,
          bottom: grid.bottom ?? bounds?.bottom ?? 0,
        },
        center: grid.center_point || grid.center || (
          Number.isFinite(grid.center_lon) && Number.isFinite(grid.center_lat)
            ? { longitude: grid.center_lon, latitude: grid.center_lat, height: grid.center_hgt }
            : null
        ),
        gridType: grid.gridType ?? grid.grid_type ?? null,
        groundElevation: grid.ground_elevation,
        minAgl: grid.min_agl,
        maxAgl: grid.max_agl,
        aglBottom: grid.agl_bottom,
        aglTop: grid.agl_top,
        aglCenter: grid.agl_center,
        datasetId: grid.dataset_id,
        datasetVersion: grid.dataset_version,
        lod: grid.lod === true,
        sourceCellCount: Number(grid.source_cell_count ?? 1),
        attributeCode: grid.attributeCode ?? grid.attribute_code ?? null,
        attributeValue: grid.attributeValue ?? grid.attribute_value ?? null,
        attributeAggregation: grid.attributeAggregation ?? grid.attribute_aggregation ?? null,
        lodSourceCellCount: Number(grid.lod_source_cell_count ?? 0),
        attributeGrid: Boolean(grid.attributeCode ?? grid.attribute_code),
        dimensionMode: grid.dimensionMode ?? null,
        verticalInterpretation: grid.verticalInterpretation ?? null,
        fillStatus: grid.fillStatus ?? null,
        features: Array.isArray(cell.features) ? cell.features : null,
      }
    })
    .filter(cell => cell.code && Object.values(cell.bounds).every(Number.isFinite))
}

function mergeCoverageCell(target, source, parentCode = target.code) {
  const bounds = target.bounds
  bounds.north = Math.max(bounds.north, source.bounds.north)
  bounds.south = Math.min(bounds.south, source.bounds.south)
  bounds.east = Math.max(bounds.east, source.bounds.east)
  bounds.west = Math.min(bounds.west, source.bounds.west)
  bounds.top = Math.max(bounds.top, source.bounds.top)
  bounds.bottom = Math.min(bounds.bottom, source.bounds.bottom)
  target.code = parentCode
  target.level = parentCode.length
  target.sourceCellCount = (Number(target.sourceCellCount) || 0) + (Number(source.sourceCellCount) || 0)
  target.lod = true
  target.coverageApproximate = true
  target.center = null
  return target
}

/**
 * 将混合查询的显示叶节点压缩到预算内。它只改变显示覆盖，不参与精确计数。
 * 已压缩父节点可继续吸收后续分页的子节点，避免在浏览器保存全部 L17 叶节点。
 */
export function compactMixedDisplayCells(existing, incoming, target = 100000, minimumLevel = 4) {
  const limit = Math.max(1, Number(target) || 1)
  const coverage = new Map()
  const ordered = [...existing, ...incoming].sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code))

  for (const source of ordered) {
    let ancestor
    for (let length = source.code.length; length >= minimumLevel; --length) {
      const candidate = coverage.get(source.code.slice(0, length))
      if (candidate) {
        ancestor = candidate
        break
      }
    }
    if (ancestor) {
      mergeCoverageCell(ancestor, source)
      continue
    }
    coverage.set(source.code, {
      ...source,
      bounds: { ...source.bounds },
    })
  }

  let cells = [...coverage.values()]
  let coarsened = cells.some(cell => cell.coverageApproximate === true)
  while (cells.length > limit) {
    const next = new Map()
    let changed = false
    for (const cell of cells) {
      const parentCode = cell.code.length > minimumLevel ? cell.code.slice(0, -1) : cell.code
      changed ||= parentCode !== cell.code
      const current = next.get(parentCode)
      if (current) mergeCoverageCell(current, cell, parentCode)
      else next.set(parentCode, {
        ...cell,
        code: parentCode,
        level: parentCode.length,
        bounds: { ...cell.bounds },
        coverageApproximate: parentCode !== cell.code || cell.coverageApproximate === true,
        lod: true,
        center: null,
      })
    }
    cells = [...next.values()]
    coarsened ||= changed
    if (!changed) break
  }
  cells.sort((a, b) => a.code.localeCompare(b.code))
  return { cells, coarsened }
}

function horizontalColumnKey(cell) {
  const bounds = cell?.bounds || {}
  const coordinate = value => Number(value).toFixed(12)
  return [
    cell?.datasetId ?? '',
    cell?.datasetVersion ?? '',
    cell?.level ?? '',
    coordinate(bounds.west),
    coordinate(bounds.south),
    coordinate(bounds.east),
    coordinate(bounds.north),
  ].join('|')
}

/**
 * 将同一水平格网的多个高度层折叠为一根显示列。
 * 该函数只减少前端绘制边线，不改变查询命中数，也不参与业务聚合。
 */
export function collapseVerticalGridColumns(existing, incoming) {
  const columns = new Map()

  for (const source of [...existing, ...incoming]) {
    if (!source?.bounds) continue
    const key = horizontalColumnKey(source)
    const current = columns.get(key)
    const sourceDisplayCount = Number(source.overviewCellCount) || 1
    const sourceCellCount = Number(source.sourceCellCount) || 1
    if (current) {
      current.bounds.bottom = Math.min(current.bounds.bottom, source.bounds.bottom)
      current.bounds.top = Math.max(current.bounds.top, source.bounds.top)
      current.overviewCellCount += sourceDisplayCount
      current.sourceCellCount += sourceCellCount
      continue
    }

    columns.set(key, {
      ...source,
      bounds: { ...source.bounds },
      center: null,
      z: undefined,
      groundElevation: undefined,
      minAgl: undefined,
      maxAgl: undefined,
      aglBottom: undefined,
      aglTop: undefined,
      aglCenter: undefined,
      overviewColumn: true,
      overviewCellCount: sourceDisplayCount,
      sourceCellCount,
    })
  }

  return [...columns.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, column]) => column)
}

/**
 * 将一根概览列均匀切成少量显示段，以有限横线恢复高度层次感。
 * 分段仍然只是显示表达，不代表业务高度层边界。
 */
export function segmentVerticalGridColumns(columns, targetSegments = 4) {
  const limit = Math.max(1, Math.floor(Number(targetSegments) || 1))
  return columns.flatMap(column => {
    const bottom = Number(column?.bounds?.bottom)
    const top = Number(column?.bounds?.top)
    const sourceLayers = Math.max(1, Math.floor(Number(column?.overviewCellCount) || 1))
    const segmentCount = Math.min(limit, sourceLayers)
    if (segmentCount <= 1 || !Number.isFinite(bottom) || !Number.isFinite(top) || top <= bottom) {
      return [column]
    }

    const span = top - bottom
    return Array.from({ length: segmentCount }, (_, index) => ({
      ...column,
      bounds: {
        ...column.bounds,
        bottom: bottom + span * index / segmentCount,
        top: bottom + span * (index + 1) / segmentCount,
      },
      overviewSegmentIndex: index + 1,
      overviewSegmentCount: segmentCount,
      overviewColumnBottom: bottom,
      overviewColumnTop: top,
    }))
  })
}
