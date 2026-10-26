import * as Cesium from 'cesium'
import { rayAabbEntryDistance } from './gridPicking.js'

const CUBE_VERTICES = new Float32Array([
  -0.5, -0.5, 0,  0.5, -0.5, 0,  0.5, 0.5, 0,  -0.5, 0.5, 0,
  -0.5, -0.5, 1,  0.5, -0.5, 1,  0.5, 0.5, 1,  -0.5, 0.5, 1,
])

const CUBE_TRIANGLES = new Uint16Array([
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
  0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
  2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
])

const CUBE_LINE_VERTEX_INDICES = [
  0, 1, 1, 2, 2, 3, 3, 0,
  4, 5, 5, 6, 6, 7, 7, 4,
  0, 4, 1, 5, 2, 6, 3, 7,
]

const CUBE_LINE_VERTICES = new Float32Array(
  CUBE_LINE_VERTEX_INDICES.flatMap(index => Array.from(CUBE_VERTICES.slice(index * 3, index * 3 + 3))),
)

// 每条边两个端点共享轴向：0=经向，1=纬向，2=竖向。
const CUBE_LINE_AXES = new Float32Array([
  0, 0, 1, 1, 0, 0, 1, 1,
  0, 0, 1, 1, 0, 0, 1, 1,
  2, 2, 2, 2, 2, 2, 2, 2,
])
const CUBE_FILL_AXES = new Float32Array(8).fill(-1)

const VERTEX_SHADER = `
in vec3 a_unitPosition;
in vec3 a_rtcCorner;
in vec3 a_rtcLongitudeEdge;
in vec3 a_rtcLatitudeEdge;
in vec3 a_rtcHeightEdge;
in vec4 a_color;
in float a_edgeAxis;
in vec4 a_gridIndex;

uniform vec4 u_detailStyle;
uniform vec4 u_primaryStyle;
uniform vec2 u_depthRange;
uniform float u_pixelRatio;
uniform float u_outlinePass;

out vec4 v_color;
out float v_visualAlpha;
out float v_depthMix;

float primaryCoordinate(float value, float stepSize) {
  float roundedValue = floor(value + 0.5);
  float remainder = mod(abs(roundedValue), stepSize);
  return 1.0 - step(0.25, min(remainder, stepSize - remainder));
}

void main() {
  vec3 positionRtc = a_rtcCorner
    + a_rtcLongitudeEdge * (a_unitPosition.x + 0.5)
    + a_rtcLatitudeEdge * (a_unitPosition.y + 0.5)
    + a_rtcHeightEdge * a_unitPosition.z;
  vec4 positionEC = czm_modelView * vec4(positionRtc, 1.0);
  gl_Position = czm_projection * positionEC;
  v_color = a_color;

  float longitudeMeters = length(a_rtcLongitudeEdge);
  float latitudeMeters = length(a_rtcLatitudeEdge);
  float verticalMeters = length(a_rtcHeightEdge);
  float cellScale = max(max(longitudeMeters, latitudeMeters), verticalMeters);
  float eyeDepth = max(-positionEC.z, 0.001);
  float cssHeight = czm_viewport.w / max(u_pixelRatio, 1.0);
  float cellPixels = cellScale * 0.5 * abs(czm_projection[1][1]) * cssHeight / eyeDepth;
  float detail = smoothstep(u_detailStyle.x, u_detailStyle.y, cellPixels);

  float primary = 0.0;
  if (a_edgeAxis >= 0.0 && a_gridIndex.w > 0.5) {
    vec3 cornerIndex = a_gridIndex.xyz + vec3(a_unitPosition.xy + vec2(0.5), a_unitPosition.z);
    float primaryX = primaryCoordinate(cornerIndex.x, u_primaryStyle.x);
    float primaryY = primaryCoordinate(cornerIndex.y, u_primaryStyle.x);
    float primaryZ = primaryCoordinate(cornerIndex.z, u_primaryStyle.x);
    if (a_edgeAxis < 0.5) primary = primaryY * primaryZ;
    else if (a_edgeAxis < 1.5) primary = primaryX * primaryZ;
    else primary = primaryX * primaryY;
  }

  float minorAlpha = mix(u_detailStyle.z, u_detailStyle.w, detail);
  float primaryAlpha = mix(u_primaryStyle.y, u_primaryStyle.z, detail);
  v_visualAlpha = mix(1.0, mix(minorAlpha, primaryAlpha, primary), u_outlinePass);
  v_depthMix = smoothstep(u_depthRange.x, u_depthRange.y, eyeDepth);
  czm_vertexLogDepth();
}
`

const FRAGMENT_SHADER = `
in vec4 v_color;
in float v_visualAlpha;
in float v_depthMix;
uniform float u_alpha;
uniform float u_farBrightness;

void main() {
  vec3 shadedColor = v_color.rgb * mix(1.05, u_farBrightness, v_depthMix);
  out_FragColor = vec4(shadedColor, v_color.a * u_alpha * v_visualAlpha);
  czm_writeLogDepth();
}
`

function parseColor(value, cache) {
  //const key = typeof value === 'string' ? value : '#3b82f6'
  const key = typeof value === 'string' ? value : '#87CEEB'
  if (cache.has(key)) return cache.get(key)

  let hex = key.startsWith('#') ? key.slice(1) : ''
  if (hex.length === 3 || hex.length === 4) {
    hex = [...hex].map(char => char + char).join('')
  }
  const valid = /^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)
  const normalized = valid ? hex : '87CEEB'
  const color = [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
    normalized.length === 8 ? Number.parseInt(normalized.slice(6, 8), 16) : 255,
  ]
  cache.set(key, color)
  return color
}

function packCells(cells, defaultLevel) {
  const detailBounds = new Float64Array(cells.length * 6)
  const colors = new Uint8Array(cells.length * 4)
  const codes = new Array(cells.length)
  const levels = new Uint8Array(cells.length)
  const gridTypes = new Array(cells.length)
  const overviewColumns = new Uint8Array(cells.length)
  const overviewCellCounts = new Float64Array(cells.length)
  const sourceCellCounts = new Float64Array(cells.length)
  const overviewSegmentIndexes = new Uint8Array(cells.length)
  const overviewSegmentCounts = new Uint8Array(cells.length)
  const overviewColumnBounds = new Float64Array(cells.length * 2)
  const chartSourceMasks = new Uint8Array(cells.length)
  const datasetIds = new Array(cells.length)
  const datasetVersions = new Float64Array(cells.length)
  const attributeCodes = new Array(cells.length)
  const attributeValues = new Array(cells.length)
  const attributeGrids = new Uint8Array(cells.length)
  const gridIndices = new Float32Array(cells.length * 4)
  const colorCache = new Map()
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity
  let bottom = Infinity, top = -Infinity
  let validCount = 0

  for (let index = 0; index < cells.length; index++) {
    const cellBounds = cells[index]?.bounds
    if (!cellBounds) continue
    const values = [
      Number(cellBounds.west), Number(cellBounds.south),
      Number(cellBounds.east), Number(cellBounds.north),
      Number(cellBounds.bottom ?? 0), Number(cellBounds.top ?? 0),
    ]
    if (!values.every(Number.isFinite)) continue

    detailBounds.set(values, validCount * 6)
    colors.set(parseColor(cells[index].color, colorCache), validCount * 4)
    codes[validCount] = cells[index].code
    levels[validCount] = cells[index].level ?? cells[index].z ?? defaultLevel ?? 0
    gridTypes[validCount] = cells[index].gridType
    overviewColumns[validCount] = cells[index].overviewColumn === true ? 1 : 0
    overviewCellCounts[validCount] = Number(cells[index].overviewCellCount) || 1
    sourceCellCounts[validCount] = Number(cells[index].sourceCellCount) || 1
    overviewSegmentIndexes[validCount] = Number(cells[index].overviewSegmentIndex) || 0
    overviewSegmentCounts[validCount] = Number(cells[index].overviewSegmentCount) || 0
    overviewColumnBounds[validCount * 2] = Number(cells[index].overviewColumnBottom ?? values[4])
    overviewColumnBounds[validCount * 2 + 1] = Number(cells[index].overviewColumnTop ?? values[5])
    chartSourceMasks[validCount] = Number(cells[index].chartSourceMask) || 0
    datasetIds[validCount] = cells[index].datasetId
    datasetVersions[validCount] = Number(cells[index].datasetVersion) || 0
    attributeCodes[validCount] = cells[index].attributeCode
    attributeValues[validCount] = cells[index].attributeValue
    attributeGrids[validCount] = cells[index].attributeGrid === true ? 1 : 0
    const gridIndex = [
      Number(cells[index].x ?? cells[index].column),
      Number(cells[index].y ?? cells[index].row),
      Number(cells[index].z ?? cells[index].layer),
    ]
    const hasGridIndex = gridIndex.every(Number.isFinite) && cells[index].coverageApproximate !== true
    gridIndices.set(hasGridIndex ? [...gridIndex, 1] : [0, 0, 0, 0], validCount * 4)
    west = Math.min(west, values[0])
    south = Math.min(south, values[1])
    east = Math.max(east, values[2])
    north = Math.max(north, values[3])
    bottom = Math.min(bottom, values[4])
    top = Math.max(top, values[5])
    validCount++
  }

  return {
    colors: validCount === cells.length ? colors : colors.slice(0, validCount * 4),
    detailBounds: validCount === cells.length ? detailBounds : detailBounds.slice(0, validCount * 6),
    codes: codes.slice(0, validCount),
    levels: validCount === cells.length ? levels : levels.slice(0, validCount),
    gridTypes: gridTypes.slice(0, validCount),
    overviewColumns: validCount === cells.length ? overviewColumns : overviewColumns.slice(0, validCount),
    overviewCellCounts: validCount === cells.length ? overviewCellCounts : overviewCellCounts.slice(0, validCount),
    sourceCellCounts: validCount === cells.length ? sourceCellCounts : sourceCellCounts.slice(0, validCount),
    overviewSegmentIndexes: validCount === cells.length ? overviewSegmentIndexes : overviewSegmentIndexes.slice(0, validCount),
    overviewSegmentCounts: validCount === cells.length ? overviewSegmentCounts : overviewSegmentCounts.slice(0, validCount),
    overviewColumnBounds: validCount === cells.length ? overviewColumnBounds : overviewColumnBounds.slice(0, validCount * 2),
    chartSourceMasks: validCount === cells.length ? chartSourceMasks : chartSourceMasks.slice(0, validCount),
    datasetIds: datasetIds.slice(0, validCount),
    datasetVersions: validCount === cells.length ? datasetVersions : datasetVersions.slice(0, validCount),
    attributeCodes: attributeCodes.slice(0, validCount),
    attributeValues: attributeValues.slice(0, validCount),
    attributeGrids: validCount === cells.length ? attributeGrids : attributeGrids.slice(0, validCount),
    gridIndices: validCount === cells.length ? gridIndices : gridIndices.slice(0, validCount * 4),
    extent: validCount ? { west, south, east, north, bottom, top } : null,
    validCount,
  }
}

function createBoundingSphere(extent) {
  const points = []
  for (const longitude of [extent.west, extent.east]) {
    for (const latitude of [extent.south, extent.north]) {
      for (const height of [extent.bottom, extent.top]) {
        points.push(Cesium.Cartesian3.fromDegrees(longitude, latitude, height))
      }
    }
  }
  return Cesium.BoundingSphere.fromPoints(points)
}

/**
 * 把每个格元转换为相对 RTC 中心的局部角点和三条边向量。
 * 不能把绝对经纬度直接存入 Float32：在约 120° 处其量化步长会达到米级，
 * 足以让细格元渲染边界与保留 Float64 的拾取/高亮边界发生错位。
 */
export function buildRtcCellGeometry(detailBounds, rtcCenter) {
  if (!detailBounds || detailBounds.length % 6 !== 0 || !rtcCenter) return new Float32Array()

  const geometry = new Float32Array((detailBounds.length / 6) * 12)
  const cornerFixed = new Cesium.Cartesian3()
  const longitudeFixed = new Cesium.Cartesian3()
  const latitudeFixed = new Cesium.Cartesian3()
  const heightFixed = new Cesium.Cartesian3()
  const cornerRtc = new Cesium.Cartesian3()
  const longitudeEdge = new Cesium.Cartesian3()
  const latitudeEdge = new Cesium.Cartesian3()
  const heightEdge = new Cesium.Cartesian3()

  for (let offset = 0; offset < detailBounds.length; offset += 6) {
    const west = detailBounds[offset]
    const south = detailBounds[offset + 1]
    const east = detailBounds[offset + 2]
    const north = detailBounds[offset + 3]
    const bottom = detailBounds[offset + 4]
    const top = detailBounds[offset + 5]

    Cesium.Cartesian3.fromDegrees(west, south, bottom, Cesium.Ellipsoid.WGS84, cornerFixed)
    Cesium.Cartesian3.fromDegrees(east, south, bottom, Cesium.Ellipsoid.WGS84, longitudeFixed)
    Cesium.Cartesian3.fromDegrees(west, north, bottom, Cesium.Ellipsoid.WGS84, latitudeFixed)
    Cesium.Cartesian3.fromDegrees(west, south, top, Cesium.Ellipsoid.WGS84, heightFixed)
    Cesium.Cartesian3.subtract(cornerFixed, rtcCenter, cornerRtc)
    Cesium.Cartesian3.subtract(longitudeFixed, cornerFixed, longitudeEdge)
    Cesium.Cartesian3.subtract(latitudeFixed, cornerFixed, latitudeEdge)
    Cesium.Cartesian3.subtract(heightFixed, cornerFixed, heightEdge)

    const target = (offset / 6) * 12
    geometry.set([cornerRtc.x, cornerRtc.y, cornerRtc.z], target)
    geometry.set([longitudeEdge.x, longitudeEdge.y, longitudeEdge.z], target + 3)
    geometry.set([latitudeEdge.x, latitudeEdge.y, latitudeEdge.z], target + 6)
    geometry.set([heightEdge.x, heightEdge.y, heightEdge.z], target + 9)
  }
  return geometry
}

/**
 * A Cesium PrimitiveCollection-compatible primitive backed by two instanced
 * draw calls: translucent cube fills and cube edge lines.
 */
export default class InstancedGridRenderer {
  constructor(options = {}) {
    this.show = options.show !== false
    this.enablePicking = options.enablePicking === true
    this._defaultLevel = options.level
    this.fillAlpha = options.fillAlpha ?? 0.5
    this.outlineAlpha = options.outlineAlpha ?? 1.0
    // 稠密轮廓一次完成着色和深度写入，避免无色表面预处理误遮挡边线。
    this.denseOutline = options.denseOutline === true
    this._detailStyle = new Cesium.Cartesian4(
      options.detailBeginPx ?? 3,
      options.detailEndPx ?? 16,
      options.minorFarAlpha ?? 1,
      options.minorNearAlpha ?? 1,
    )
    this._primaryStyle = new Cesium.Cartesian4(
      options.primaryStep ?? 4,
      options.primaryFarAlpha ?? 1,
      options.primaryNearAlpha ?? 1,
      0,
    )
    this._farBrightness = options.farBrightness ?? 1
    this._depthRange = new Cesium.Cartesian2(0, 1e9)
    this._pixelRatio = 1
    this._packed = packCells(options.cells || [], this._defaultLevel)
    this._resources = null
    this._destroyed = false
  }

  get length() {
    return this._packed.validCount
  }

  get extent() {
    return this._packed.extent
  }

  getCell(instanceId) {
    if (!Number.isInteger(instanceId) || instanceId < 0 || instanceId >= this.length) return undefined
    const offset = instanceId * 6
    const bounds = this._packed.detailBounds
    return {
      code: this._packed.codes[instanceId],
      level: this._packed.levels[instanceId],
      gridType: this._packed.gridTypes[instanceId],
      overviewColumn: this._packed.overviewColumns[instanceId] === 1,
      overviewCellCount: this._packed.overviewCellCounts[instanceId],
      sourceCellCount: this._packed.sourceCellCounts[instanceId],
      overviewSegmentIndex: this._packed.overviewSegmentIndexes[instanceId],
      overviewSegmentCount: this._packed.overviewSegmentCounts[instanceId],
      overviewColumnBottom: this._packed.overviewColumnBounds[instanceId * 2],
      overviewColumnTop: this._packed.overviewColumnBounds[instanceId * 2 + 1],
      chartSourceMask: this._packed.chartSourceMasks[instanceId],
      datasetId: this._packed.datasetIds[instanceId],
      datasetVersion: this._packed.datasetVersions[instanceId] || undefined,
      attributeCode: this._packed.attributeCodes[instanceId],
      attributeValue: this._packed.attributeValues[instanceId],
      attributeGrid: this._packed.attributeGrids[instanceId] === 1,
      bounds: {
        west: bounds[offset], south: bounds[offset + 1],
        east: bounds[offset + 2], north: bounds[offset + 3],
        bottom: bounds[offset + 4], top: bounds[offset + 5],
      },
    }
  }

  getCellAt(longitude, latitude, height = 0) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return undefined
    const bounds = this._packed.detailBounds
    for (let index = 0; index < this.length; index++) {
      const offset = index * 6
      if (longitude >= bounds[offset] && longitude <= bounds[offset + 2]
        && latitude >= bounds[offset + 1] && latitude <= bounds[offset + 3]
        && (height == null || (height >= bounds[offset + 4] && height <= bounds[offset + 5]))) {
        return this.getCell(index)
      }
    }
    return undefined
  }

  /**
   * 用相机点击射线选择镜头方向上最先遇到的三维格元。
   * 经纬高包围盒在查询区域中心的 ENU 坐标系中近似为 AABB；仅用于交互拾取，
   * 不改变网格自身的经纬高边界和业务身份。
   */
  pickCell(ray) {
    if (!ray?.origin || !ray?.direction || !this.extent || !this.length) return undefined

    const extent = this.extent
    const centerLongitude = (extent.west + extent.east) / 2
    const centerLatitude = (extent.south + extent.north) / 2
    const centerHeight = (extent.bottom + extent.top) / 2
    const center = Cesium.Cartesian3.fromDegrees(centerLongitude, centerLatitude, centerHeight)
    const localToFixed = Cesium.Transforms.eastNorthUpToFixedFrame(center)
    const fixedToLocal = Cesium.Matrix4.inverseTransformation(localToFixed, new Cesium.Matrix4())
    const localOrigin = Cesium.Matrix4.multiplyByPoint(fixedToLocal, ray.origin, new Cesium.Cartesian3())
    const localDirection = Cesium.Matrix4.multiplyByPointAsVector(
      fixedToLocal,
      ray.direction,
      new Cesium.Cartesian3(),
    )
    Cesium.Cartesian3.normalize(localDirection, localDirection)

    const metersPerDegree = 111319.49079327358
    const longitudeMetersPerDegree = metersPerDegree * Math.cos(Cesium.Math.toRadians(centerLatitude))
    const bounds = this._packed.detailBounds
    let nearestDistance = Infinity
    let nearestIndex = -1
    const localBounds = {
      minX: 0, maxX: 0,
      minY: 0, maxY: 0,
      minZ: 0, maxZ: 0,
    }

    for (let index = 0; index < this.length; index++) {
      const offset = index * 6
      localBounds.minX = (bounds[offset] - centerLongitude) * longitudeMetersPerDegree
      localBounds.maxX = (bounds[offset + 2] - centerLongitude) * longitudeMetersPerDegree
      localBounds.minY = (bounds[offset + 1] - centerLatitude) * metersPerDegree
      localBounds.maxY = (bounds[offset + 3] - centerLatitude) * metersPerDegree
      localBounds.minZ = bounds[offset + 4] - centerHeight
      localBounds.maxZ = bounds[offset + 5] - centerHeight
      const distance = rayAabbEntryDistance(localOrigin, localDirection, localBounds)
      if (distance !== undefined && distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = index
      }
    }

    if (nearestIndex < 0) return undefined
    return { cell: this.getCell(nearestIndex), distance: nearestDistance }
  }

  setCells(cells) {
    this._destroyResources()
    this._packed = packCells(cells || [], this._defaultLevel)
  }

  update(frameStateOrCells) {
    if (Array.isArray(frameStateOrCells)) {
      this.setCells(frameStateOrCells)
      return
    }
    const frameState = frameStateOrCells
    if (!this.show || !this.length || this._destroyed || !frameState?.context) return
    if (!frameState.passes?.render) return
    if (!frameState.context.instancedArrays) return
    if (!this._resources) this._resources = this._createResources(frameState.context)
    this._updateViewStyle(frameState)
    if (!this.denseOutline && this.fillAlpha > 0) {
      frameState.commandList.push(this._resources.fillCommand)
    }
    frameState.commandList.push(this._resources.outlineCommand)
  }

  _updateViewStyle(frameState) {
    if (!this._boundingSphere || !frameState.camera?.positionWC) return
    const distance = Cesium.Cartesian3.distance(frameState.camera.positionWC, this._boundingSphere.center)
    const span = Math.max(this._boundingSphere.radius, 1)
    this._depthRange.x = Math.max(0, distance - span * 0.5)
    this._depthRange.y = Math.max(this._depthRange.x + 1, distance + span * 1.25)
    const canvasHeight = Number(frameState.context?.canvas?.clientHeight)
    const drawingBufferHeight = Number(frameState.context?.drawingBufferHeight)
    this._pixelRatio = canvasHeight > 0 && drawingBufferHeight > 0
      ? drawingBufferHeight / canvasHeight
      : 1
  }

  _createResources(context) {
    const boundingVolume = createBoundingSphere(this.extent)
    this._boundingSphere = boundingVolume
    const rtcCenter = Cesium.Cartesian3.clone(boundingVolume.center)
    const rtcGeometry = buildRtcCellGeometry(this._packed.detailBounds, rtcCenter)
    const vertexBuffer = Cesium.Buffer.createVertexBuffer({
      context,
      typedArray: CUBE_VERTICES,
      usage: Cesium.BufferUsage.STATIC_DRAW,
    })
    const rtcGeometryBuffer = Cesium.Buffer.createVertexBuffer({
      context,
      typedArray: rtcGeometry,
      usage: Cesium.BufferUsage.STATIC_DRAW,
    })
    const colorBuffer = Cesium.Buffer.createVertexBuffer({
      context,
      typedArray: this._packed.colors,
      usage: Cesium.BufferUsage.STATIC_DRAW,
    })
    const gridIndexBuffer = Cesium.Buffer.createVertexBuffer({
      context,
      typedArray: this._packed.gridIndices,
      usage: Cesium.BufferUsage.STATIC_DRAW,
    })
    const lineVertexBuffer = Cesium.Buffer.createVertexBuffer({
      context,
      typedArray: CUBE_LINE_VERTICES,
      usage: Cesium.BufferUsage.STATIC_DRAW,
    })
    const lineAxisBuffer = Cesium.Buffer.createVertexBuffer({
      context,
      typedArray: CUBE_LINE_AXES,
      usage: Cesium.BufferUsage.STATIC_DRAW,
    })
    const fillAxisBuffer = Cesium.Buffer.createVertexBuffer({
      context,
      typedArray: CUBE_FILL_AXES,
      usage: Cesium.BufferUsage.STATIC_DRAW,
    })
    // GPU owns the instance payload after upload; do not retain a second CPU copy.
    this._packed.colors = null
    this._packed.gridIndices = null
    vertexBuffer.vertexArrayDestroyable = false
    rtcGeometryBuffer.vertexArrayDestroyable = false
    colorBuffer.vertexArrayDestroyable = false
    gridIndexBuffer.vertexArrayDestroyable = false
    lineVertexBuffer.vertexArrayDestroyable = false
    lineAxisBuffer.vertexArrayDestroyable = false
    fillAxisBuffer.vertexArrayDestroyable = false

    const instanceAttributes = [
      { index: 1, vertexBuffer: rtcGeometryBuffer, componentsPerAttribute: 3, componentDatatype: Cesium.ComponentDatatype.FLOAT, strideInBytes: 48, offsetInBytes: 0, instanceDivisor: 1 },
      { index: 2, vertexBuffer: rtcGeometryBuffer, componentsPerAttribute: 3, componentDatatype: Cesium.ComponentDatatype.FLOAT, strideInBytes: 48, offsetInBytes: 12, instanceDivisor: 1 },
      { index: 3, vertexBuffer: rtcGeometryBuffer, componentsPerAttribute: 3, componentDatatype: Cesium.ComponentDatatype.FLOAT, strideInBytes: 48, offsetInBytes: 24, instanceDivisor: 1 },
      { index: 4, vertexBuffer: rtcGeometryBuffer, componentsPerAttribute: 3, componentDatatype: Cesium.ComponentDatatype.FLOAT, strideInBytes: 48, offsetInBytes: 36, instanceDivisor: 1 },
      { index: 5, vertexBuffer: colorBuffer, componentsPerAttribute: 4, componentDatatype: Cesium.ComponentDatatype.UNSIGNED_BYTE, normalize: true, strideInBytes: 4, instanceDivisor: 1 },
      { index: 7, vertexBuffer: gridIndexBuffer, componentsPerAttribute: 4, componentDatatype: Cesium.ComponentDatatype.FLOAT, strideInBytes: 16, instanceDivisor: 1 },
    ]
    const fillAttributes = [
      { index: 0, vertexBuffer, componentsPerAttribute: 3, componentDatatype: Cesium.ComponentDatatype.FLOAT },
      ...instanceAttributes,
      { index: 6, vertexBuffer: fillAxisBuffer, componentsPerAttribute: 1, componentDatatype: Cesium.ComponentDatatype.FLOAT },
    ]
    const outlineAttributes = [
      { index: 0, vertexBuffer: lineVertexBuffer, componentsPerAttribute: 3, componentDatatype: Cesium.ComponentDatatype.FLOAT },
      ...instanceAttributes,
      { index: 6, vertexBuffer: lineAxisBuffer, componentsPerAttribute: 1, componentDatatype: Cesium.ComponentDatatype.FLOAT },
    ]
    const fillIndexBuffer = Cesium.Buffer.createIndexBuffer({
      context,
      typedArray: CUBE_TRIANGLES,
      usage: Cesium.BufferUsage.STATIC_DRAW,
      indexDatatype: Cesium.IndexDatatype.UNSIGNED_SHORT,
    })
    const fillVertexArray = new Cesium.VertexArray({ context, attributes: fillAttributes, indexBuffer: fillIndexBuffer })
    const outlineVertexArray = new Cesium.VertexArray({ context, attributes: outlineAttributes })
    const shaderProgram = Cesium.ShaderProgram.fromCache({
      context,
      vertexShaderSource: VERTEX_SHADER,
      fragmentShaderSource: FRAGMENT_SHADER,
      attributeLocations: {
        a_unitPosition: 0,
        a_rtcCorner: 1,
        a_rtcLongitudeEdge: 2,
        a_rtcLatitudeEdge: 3,
        a_rtcHeightEdge: 4,
        a_color: 5,
        a_edgeAxis: 6,
        a_gridIndex: 7,
      },
    })

    const modelMatrix = Cesium.Matrix4.fromTranslation(rtcCenter)
    const renderState = Cesium.RenderState.fromCache({
      depthTest: { enabled: true, func: Cesium.DepthFunction.LESS_OR_EQUAL },
      depthMask: false,
      blending: Cesium.BlendingState.ALPHA_BLEND,
    })
    const commandOptions = {
      modelMatrix,
      shaderProgram,
      renderState,
      boundingVolume,
      instanceCount: this.length,
      owner: this,
      pass: Cesium.Pass.TRANSLUCENT,
    }
    const fillCommand = new Cesium.DrawCommand({
      ...commandOptions,
      vertexArray: fillVertexArray,
      primitiveType: Cesium.PrimitiveType.TRIANGLES,
      count: CUBE_TRIANGLES.length,
      uniformMap: {
        u_alpha: () => this.fillAlpha,
        u_detailStyle: () => this._detailStyle,
        u_primaryStyle: () => this._primaryStyle,
        u_depthRange: () => this._depthRange,
        u_pixelRatio: () => this._pixelRatio,
        u_outlinePass: () => 0,
        u_farBrightness: () => this._farBrightness,
      },
    })
    const outlineCommand = new Cesium.DrawCommand({
      ...commandOptions,
      pass: this.denseOutline ? Cesium.Pass.OPAQUE : Cesium.Pass.TRANSLUCENT,
      renderState: this.denseOutline ? Cesium.RenderState.fromCache({
        depthTest: { enabled: true, func: Cesium.DepthFunction.LESS },
        depthMask: true,
        blending: Cesium.BlendingState.ALPHA_BLEND,
      }) : renderState,
      vertexArray: outlineVertexArray,
      primitiveType: Cesium.PrimitiveType.LINES,
      count: CUBE_LINE_VERTEX_INDICES.length,
      uniformMap: {
        u_alpha: () => this.outlineAlpha,
        u_detailStyle: () => this._detailStyle,
        u_primaryStyle: () => this._primaryStyle,
        u_depthRange: () => this._depthRange,
        u_pixelRatio: () => this._pixelRatio,
        u_outlinePass: () => 1,
        u_farBrightness: () => this._farBrightness,
      },
    })

    return {
      vertexBuffer,
      rtcGeometryBuffer,
      colorBuffer,
      gridIndexBuffer,
      lineVertexBuffer,
      lineAxisBuffer,
      fillAxisBuffer,
      fillVertexArray,
      outlineVertexArray,
      shaderProgram,
      fillCommand,
      outlineCommand,
    }
  }

  _destroyResources() {
    const resources = this._resources
    if (!resources) return
    resources.fillVertexArray.destroy()
    resources.outlineVertexArray.destroy()
    resources.vertexBuffer.destroy()
    resources.rtcGeometryBuffer.destroy()
    resources.colorBuffer.destroy()
    resources.gridIndexBuffer.destroy()
    resources.lineVertexBuffer.destroy()
    resources.lineAxisBuffer.destroy()
    resources.fillAxisBuffer.destroy()
    resources.shaderProgram.destroy()
    this._resources = null
  }

  isDestroyed() {
    return this._destroyed
  }

  destroy() {
    if (this._destroyed) return undefined
    this._destroyResources()
    this._packed = {
      colors: null, gridIndices: null, detailBounds: null,
      codes: [], levels: [], gridTypes: [], chartSourceMasks: [], extent: null, validCount: 0,
    }
    this._destroyed = true
    return undefined
  }
}
