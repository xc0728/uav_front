import * as Cesium from 'cesium'

const CUBE_VERTICES = new Float32Array([
  -0.5, -0.5, 0,  0.5, -0.5, 0,  0.5, 0.5, 0,  -0.5, 0.5, 0,
  -0.5, -0.5, 1,  0.5, -0.5, 1,  0.5, 0.5, 1,  -0.5, 0.5, 1,
])

const CUBE_TRIANGLES = new Uint16Array([
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
  0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
  2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
])

const CUBE_LINES = new Uint16Array([
  0, 1, 1, 2, 2, 3, 3, 0,
  4, 5, 5, 6, 6, 7, 7, 4,
  0, 4, 1, 5, 2, 6, 3, 7,
])

const VERTEX_SHADER = `
in vec3 a_unitPosition;
in vec4 a_boundsHorizontal;
in vec2 a_boundsVertical;
in vec4 a_color;

uniform vec3 u_rtcCenter;

out vec4 v_color;
out float v_distance;

vec3 gridCartesian(float longitudeDegrees, float latitudeDegrees, float height) {
  const float semiMajorAxis = 6378137.0;
  const float eccentricitySquared = 0.0066943799901413165;
  float longitude = radians(longitudeDegrees);
  float latitude = radians(latitudeDegrees);
  float sinLatitude = sin(latitude);
  float cosLatitude = cos(latitude);
  float primeVerticalRadius = semiMajorAxis / sqrt(1.0 - eccentricitySquared * sinLatitude * sinLatitude);
  return vec3(
    (primeVerticalRadius + height) * cosLatitude * cos(longitude),
    (primeVerticalRadius + height) * cosLatitude * sin(longitude),
    (primeVerticalRadius * (1.0 - eccentricitySquared) + height) * sinLatitude
  );
}

void main() {
  float longitude = mix(a_boundsHorizontal.x, a_boundsHorizontal.z, a_unitPosition.x + 0.5);
  float latitude = mix(a_boundsHorizontal.y, a_boundsHorizontal.w, a_unitPosition.y + 0.5);
  float height = mix(a_boundsVertical.x, a_boundsVertical.y, a_unitPosition.z);
  vec3 positionRtc = gridCartesian(longitude, latitude, height) - u_rtcCenter;
  gl_Position = czm_modelViewProjection * vec4(positionRtc, 1.0);
  v_color = a_color;
  v_distance = length((czm_modelView * vec4(positionRtc, 1.0)).xyz);
  czm_vertexLogDepth();
}
`

const FRAGMENT_SHADER = `
in vec4 v_color;
in float v_distance;
uniform float u_alpha;
uniform vec3 u_distanceFade;

void main() {
  float fade = mix(1.0, u_distanceFade.z,
    smoothstep(u_distanceFade.x, u_distanceFade.y, v_distance));
  out_FragColor = vec4(v_color.rgb, v_color.a * u_alpha * fade);
  czm_writeLogDepth();
}
`

function parseColor(value, cache) {
  const key = typeof value === 'string' ? value : '#3b82f6'
  if (cache.has(key)) return cache.get(key)

  let hex = key.startsWith('#') ? key.slice(1) : ''
  if (hex.length === 3 || hex.length === 4) {
    hex = [...hex].map(char => char + char).join('')
  }
  const valid = /^(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)
  const normalized = valid ? hex : '3b82f6'
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
  const bounds = new Float32Array(cells.length * 6)
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

    bounds.set(values, validCount * 6)
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
    west = Math.min(west, values[0])
    south = Math.min(south, values[1])
    east = Math.max(east, values[2])
    north = Math.max(north, values[3])
    bottom = Math.min(bottom, values[4])
    top = Math.max(top, values[5])
    validCount++
  }

  return {
    bounds: validCount === cells.length ? bounds : bounds.slice(0, validCount * 6),
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
    const minAlpha = Number(options.distanceFadeMinAlpha)
    this._distanceFade = new Cesium.Cartesian3(0, 1e9,
      Number.isFinite(minAlpha) ? Math.max(0, Math.min(1, minAlpha)) : 1)
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
    this._updateDistanceFade(frameState)
    if (!this.denseOutline && this.fillAlpha > 0) {
      frameState.commandList.push(this._resources.fillCommand)
    }
    frameState.commandList.push(this._resources.outlineCommand)
  }

  _updateDistanceFade(frameState) {
    if (this._distanceFade.z >= 1 || !this._boundingSphere || !frameState.camera?.positionWC) return
    const distance = Cesium.Cartesian3.distance(frameState.camera.positionWC, this._boundingSphere.center)
    const span = Math.max(this._boundingSphere.radius * 1.5, 1)
    this._distanceFade.x = Math.max(0, distance - span)
    this._distanceFade.y = distance + span
  }

  _createResources(context) {
    const vertexBuffer = Cesium.Buffer.createVertexBuffer({
      context,
      typedArray: CUBE_VERTICES,
      usage: Cesium.BufferUsage.STATIC_DRAW,
    })
    const boundsBuffer = Cesium.Buffer.createVertexBuffer({
      context,
      typedArray: this._packed.bounds,
      usage: Cesium.BufferUsage.STATIC_DRAW,
    })
    const colorBuffer = Cesium.Buffer.createVertexBuffer({
      context,
      typedArray: this._packed.colors,
      usage: Cesium.BufferUsage.STATIC_DRAW,
    })
    // GPU owns the instance payload after upload; do not retain a second CPU copy.
    this._packed.bounds = null
    this._packed.colors = null
    vertexBuffer.vertexArrayDestroyable = false
    boundsBuffer.vertexArrayDestroyable = false
    colorBuffer.vertexArrayDestroyable = false

    const attributes = [
      { index: 0, vertexBuffer, componentsPerAttribute: 3, componentDatatype: Cesium.ComponentDatatype.FLOAT },
      { index: 1, vertexBuffer: boundsBuffer, componentsPerAttribute: 4, componentDatatype: Cesium.ComponentDatatype.FLOAT, strideInBytes: 24, offsetInBytes: 0, instanceDivisor: 1 },
      { index: 2, vertexBuffer: boundsBuffer, componentsPerAttribute: 2, componentDatatype: Cesium.ComponentDatatype.FLOAT, strideInBytes: 24, offsetInBytes: 16, instanceDivisor: 1 },
      { index: 3, vertexBuffer: colorBuffer, componentsPerAttribute: 4, componentDatatype: Cesium.ComponentDatatype.UNSIGNED_BYTE, normalize: true, strideInBytes: 4, instanceDivisor: 1 },
    ]
    const fillIndexBuffer = Cesium.Buffer.createIndexBuffer({
      context,
      typedArray: CUBE_TRIANGLES,
      usage: Cesium.BufferUsage.STATIC_DRAW,
      indexDatatype: Cesium.IndexDatatype.UNSIGNED_SHORT,
    })
    const outlineIndexBuffer = Cesium.Buffer.createIndexBuffer({
      context,
      typedArray: CUBE_LINES,
      usage: Cesium.BufferUsage.STATIC_DRAW,
      indexDatatype: Cesium.IndexDatatype.UNSIGNED_SHORT,
    })
    const fillVertexArray = new Cesium.VertexArray({ context, attributes, indexBuffer: fillIndexBuffer })
    const outlineVertexArray = new Cesium.VertexArray({ context, attributes, indexBuffer: outlineIndexBuffer })
    const shaderProgram = Cesium.ShaderProgram.fromCache({
      context,
      vertexShaderSource: VERTEX_SHADER,
      fragmentShaderSource: FRAGMENT_SHADER,
      attributeLocations: {
        a_unitPosition: 0,
        a_boundsHorizontal: 1,
        a_boundsVertical: 2,
        a_color: 3,
      },
    })

    const boundingVolume = createBoundingSphere(this.extent)
    this._boundingSphere = boundingVolume
    const rtcCenter = Cesium.Cartesian3.clone(boundingVolume.center)
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
        u_rtcCenter: () => rtcCenter,
        u_alpha: () => this.fillAlpha,
        u_distanceFade: () => this._distanceFade,
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
      count: CUBE_LINES.length,
      uniformMap: {
        u_rtcCenter: () => rtcCenter,
        u_alpha: () => this.outlineAlpha,
        u_distanceFade: () => this._distanceFade,
      },
    })

    return {
      vertexBuffer,
      boundsBuffer,
      colorBuffer,
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
    resources.boundsBuffer.destroy()
    resources.colorBuffer.destroy()
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
      bounds: null, colors: null, detailBounds: null,
      codes: [], levels: [], gridTypes: [], extent: null, validCount: 0,
    }
    this._destroyed = true
    return undefined
  }
}
