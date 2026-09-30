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
        features: Array.isArray(cell.features) ? cell.features : null,
      }
    })
    .filter(cell => cell.code && Object.values(cell.bounds).every(Number.isFinite))
}
