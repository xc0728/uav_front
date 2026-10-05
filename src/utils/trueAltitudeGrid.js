export function activeTrueAltitudeDatasets(body) {
  const datasets = Array.isArray(body?.data?.datasets) ? body.data.datasets : []
  return datasets.filter(dataset =>
    dataset?.activeVersion != null && Number.isInteger(Number(dataset?.activeLevel)),
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
  if (experimentalMixedResolution) payload.experimentalMixedResolution = true
  return payload
}

export function toAirspaceMapCells(rawGrids) {
  return rawGrids
    .filter(cell => cell?.found !== false)
    .map(cell => {
      const grid = cell?.data?.grid || cell
      const bounds = grid.bounds
      return {
        code: String(grid.code || cell.code || ''),
        level: grid.level ?? cell.level,
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
